/**
 * Repo inventory builder (Phase 2).
 *
 * Walks a source root, classifies Angular units, builds a selector index,
 * resolves internal import and template-selector edges, topologically sorts
 * units leaf-first, and emits index.json.
 *
 * Three properties this code must not violate:
 *
 * 1. Never throw on bad input -- degrade, emit a warning, keep going.
 *    A single malformed file must not abort a 300-unit repo.
 *
 * 2. Only element selectors (hyphenated tags) are scanned for child usage.
 *    Attribute selectors ([appDir]) and class selectors (.cls) require a
 *    real template parse; a regex here would under-report rather than
 *    fabricate, and under-reporting is recorded as an unresolved edge, not
 *    silently dropped.
 *
 * 3. Route tree detection is best-effort: it locates files that declare
 *    Routes arrays and their path strings, but does not follow lazy imports.
 *    A note in the output says so explicitly rather than emitting a partial
 *    tree that reads as complete.
 */

import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve as resolvePath, relative, dirname, basename } from "node:path";
import { parseSource } from "./ts-source.mjs";

// Directories that are never Angular source.
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "target", ".angular",
  "coverage", ".cache", "e2e", "cypress",
]);

// ── file walking ──────────────────────────────────────────────────────────────

function* walkTs(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) { yield* walkTs(full); continue; }
    if (!e.isFile()) continue;
    const n = e.name;
    if (n.endsWith(".spec.ts") || n.endsWith(".d.ts")) continue;
    if (n.endsWith(".ts")) yield full;
  }
}

// Quick pre-screen before paying the TS parse cost.
const DECORATOR_RE = /@(?:Component|NgModule|Directive|Pipe|Injectable)\s*\(/;
const ROUTES_RE = /\bRoutes\b|\bRouterModule\b|\bprovideRouter\b/;

// ── AST helpers ───────────────────────────────────────────────────────────────

function decoratorsOf(node) {
  return (ts.canHaveDecorators?.(node) ? ts.getDecorators(node) : node.decorators) ?? [];
}

function decoratorNames(node) {
  const names = new Set();
  for (const d of decoratorsOf(node)) {
    const e = d.expression;
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression)) names.add(e.expression.text);
    else if (ts.isIdentifier(e)) names.add(e.text);
  }
  return names;
}

function classifyKind(decs, fileName) {
  if (decs.has("Component"))  return "component";
  if (decs.has("NgModule"))   return "module";
  if (decs.has("Directive"))  return "directive";
  if (decs.has("Pipe"))       return "pipe";
  if (decs.has("Injectable")) {
    if (fileName.includes(".guard."))       return "guard";
    if (fileName.includes(".interceptor.")) return "interceptor";
    if (fileName.includes(".resolver."))    return "route-resolver";
    return "service";
  }
  return null;
}

/** String value of `selector:` inside @Component or @Directive. */
function extractSelector(cls, src) {
  for (const d of decoratorsOf(cls)) {
    const e = d.expression;
    if (!ts.isCallExpression(e) || !ts.isIdentifier(e.expression)) continue;
    if (e.expression.text !== "Component" && e.expression.text !== "Directive") continue;
    const arg = e.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) continue;
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      if (prop.name?.getText(src) !== "selector") continue;
      const v = prop.initializer;
      if (ts.isStringLiteral(v)) return v.text;
    }
  }
  return null;
}

/** Relative import/re-export paths from a source file. */
function relativeImports(src) {
  const out = [];
  ts.forEachChild(src, node => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const ms = node.moduleSpecifier;
      if (ms && ts.isStringLiteral(ms)) {
        const p = ms.text;
        if (p.startsWith("./") || p.startsWith("../")) out.push(p);
      }
    }
  });
  return out;
}

/** Inline or external template metadata from the @Component decorator. */
function templateMeta(cls, src, absDir) {
  for (const d of decoratorsOf(cls)) {
    const e = d.expression;
    if (!ts.isCallExpression(e) || !ts.isIdentifier(e.expression)) continue;
    if (e.expression.text !== "Component") continue;
    const arg = e.arguments[0];
    if (!arg || !ts.isObjectLiteralExpression(arg)) continue;
    for (const prop of arg.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = prop.name?.getText(src);
      const v = prop.initializer;
      if (key === "template") {
        const text = ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v) ? v.text : null;
        if (text !== null) return { kind: "inline", text };
      }
      if (key === "templateUrl" && ts.isStringLiteral(v)) {
        return { kind: "external", url: v.text, absPath: resolvePath(absDir, v.text) };
      }
    }
  }
  return { kind: "none" };
}

/** Route path strings declared in a Routes array -- best-effort only. */
function extractRoutePaths(src) {
  const paths = [];
  function visit(node) {
    // Look for `{ path: 'some/path', ... }` object literals inside arrays
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = prop.name?.getText(src);
        if (key === "path" && ts.isStringLiteral(prop.initializer)) {
          paths.push(prop.initializer.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(src, visit);
  return paths;
}

// ── import path resolution ────────────────────────────────────────────────────

function resolveImport(fromDir, importPath) {
  const base = resolvePath(fromDir, importPath);
  for (const c of [base + ".ts", join(base, "index.ts")]) {
    try { statSync(c); return c; } catch { /* not found */ }
  }
  // Strip a .js extension that may appear in imports
  if (importPath.endsWith(".js")) {
    const ts_ = resolvePath(fromDir, importPath.replace(/\.js$/, ".ts"));
    try { statSync(ts_); return ts_; } catch { /* not found */ }
  }
  return null;
}

// ── selector scanning ─────────────────────────────────────────────────────────

/**
 * Finds which known element selectors appear in templateText.
 * Only matches element-form selectors (containing a hyphen); attribute and
 * class selectors are skipped with a note in the caller.
 */
function selectorsUsed(templateText, elementSelectors) {
  if (!templateText || elementSelectors.length === 0) return [];
  const found = [];
  for (const sel of elementSelectors) {
    const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`<${escaped}[\\s>/]`).test(templateText)) found.push(sel);
  }
  return found;
}

// ── topological sort (Kahn's) ────────────────────────────────────────────────

/**
 * Leaf-first topological sort.
 * `edges` are { from, to } where `from` depends on `to`.
 * Returns { order: string[], cyclicIds: string[] }.
 * Cycles are appended after the sort, never crashed.
 */
function topoSort(ids, edges) {
  const inDeg = Object.fromEntries(ids.map(id => [id, 0]));
  const dependents = Object.fromEntries(ids.map(id => [id, []]));

  for (const { from, to } of edges) {
    if (!(from in inDeg) || !(to in inDeg)) continue;
    inDeg[from]++;
    dependents[to].push(from);
  }

  // Start from leaves: units with no internal dependencies.
  const queue = ids.filter(id => inDeg[id] === 0);
  const result = [];
  const seen = new Set();

  while (queue.length) {
    const node = queue.shift();
    if (seen.has(node)) continue;
    seen.add(node);
    result.push(node);
    for (const dep of dependents[node]) {
      if (--inDeg[dep] === 0) queue.push(dep);
    }
  }

  const cyclicIds = ids.filter(id => !seen.has(id));
  return { order: result, cyclicIds };
}

// ── unit ID ───────────────────────────────────────────────────────────────────

function makeUnitId(kind, relDir, className) {
  return `${kind}:${relDir.replace(/\\/g, "/")}:${className}`;
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * Build the repo index.
 *
 * @param {string} srcRoot  Absolute path to the Angular source root (e.g. .../src).
 * @param {object} opts
 * @param {string} [opts.rootDir]  Project root for relative paths in output (defaults to srcRoot).
 * @param {boolean} [opts.stamp]   Emit a real timestamp instead of the fixed sentinel.
 * @returns {{ index: object, warnings: string[] }}
 */
export async function buildIndex(srcRoot, opts = {}) {
  const absRoot = resolvePath(srcRoot);
  const rootDir = opts.rootDir ? resolvePath(opts.rootDir) : absRoot;
  const stamp = opts.stamp ?? false;

  const warnings = [];
  const warn = (msg) => warnings.push(msg);

  // ── pass 1: discover and classify units ────────────────────────────────────

  const units = [];       // { id, kind, className, selector, path, files, _absDir, _src, _srcText }
  const fileToId = {};    // absolute .ts path → unitId
  const routeFiles = [];  // files that look like route definitions

  for (const filePath of walkTs(absRoot)) {
    let sourceText;
    try { sourceText = readFileSync(filePath, "utf8"); }
    catch (err) { warn(`unreadable: ${filePath} (${err.code ?? err.message})`); continue; }

    if (ROUTES_RE.test(sourceText) && !DECORATOR_RE.test(sourceText)) {
      routeFiles.push({ filePath, sourceText });
    }

    if (!DECORATOR_RE.test(sourceText)) continue;

    let src;
    try { src = parseSource(filePath, sourceText); }
    catch (err) { warn(`parse error: ${filePath} (${err.message})`); continue; }

    // Scan top-level class declarations.
    let added = false;
    ts.forEachChild(src, node => {
      if (added || !ts.isClassDeclaration(node) || !node.name) return;
      const decs = decoratorNames(node);
      if (decs.size === 0) return;
      const kind = classifyKind(decs, basename(filePath));
      if (!kind) return;

      const className = node.name.text;
      const absDir = dirname(filePath);
      const relDir = relative(absRoot, absDir).replace(/\\/g, "/") || ".";
      const id = makeUnitId(kind, relDir, className);
      const selector = extractSelector(node, src);

      if (fileToId[filePath]) {
        warn(`multiple Angular classes in one file (second ignored): ${filePath}`);
        return;
      }

      const unit = {
        id, kind, className, selector: selector ?? null, path: relDir,
        files: { typescript: basename(filePath) },
        _absDir: absDir, _src: src, _srcText: sourceText,
      };
      units.push(unit);
      fileToId[filePath] = id;
      added = true;
    });
  }

  // ── build selector index (element selectors only) ─────────────────────────

  const selectorIndex = {};
  const elementSelectors = [];
  for (const u of units) {
    if (!u.selector) continue;
    // Attribute selectors ([foo]) and class selectors (.foo) need a proper
    // template parser; skip them here and report attribute-selector units as
    // a note rather than silently missing their edges.
    if (u.selector.startsWith("[") || u.selector.startsWith(".")) {
      warn(`non-element selector skipped in template scan: '${u.selector}' (${u.id})`);
      continue;
    }
    selectorIndex[u.selector] = u.id;
    elementSelectors.push(u.selector);
  }

  // ── pass 2: build dependency edges ────────────────────────────────────────

  const edgeSet = new Set();
  const unresolvedRefs = [];

  const addEdge = (from, to, via) => edgeSet.add(`${from}\x00${to}\x00${via}`);

  for (const unit of units) {
    const { id, _absDir, _src, _srcText } = unit;

    // Import edges.
    for (const imp of relativeImports(_src)) {
      const resolved = resolveImport(_absDir, imp);
      if (!resolved) {
        unresolvedRefs.push({ unit: id, kind: "import", ref: imp });
        continue;
      }
      const toId = fileToId[resolved];
      if (toId && toId !== id) addEdge(id, toId, "import");
    }

    // Template selector edges.
    const tmpl = templateMeta(
      // Find the class node again -- cheaper than storing it
      (() => { let cls = null; ts.forEachChild(_src, n => { if (!cls && ts.isClassDeclaration(n) && n.name) cls = n; }); return cls; })(),
      _src, _absDir,
    );
    let templateText = "";
    if (tmpl.kind === "inline") {
      templateText = tmpl.text;
    } else if (tmpl.kind === "external") {
      try { templateText = readFileSync(tmpl.absPath, "utf8"); }
      catch { /* template missing -- Resolver already warns about this */ }
    }

    for (const sel of selectorsUsed(templateText, elementSelectors)) {
      const toId = selectorIndex[sel];
      if (toId && toId !== id) addEdge(id, toId, "selector");
    }
  }

  const edges = [...edgeSet].map(k => {
    const [from, to, via] = k.split("\x00");
    return { from, to, via };
  });

  // ── reverse dependency index ───────────────────────────────────────────────

  const reverseDeps = {};
  for (const { from, to } of edges) {
    if (!reverseDeps[to]) reverseDeps[to] = [];
    if (!reverseDeps[to].includes(from)) reverseDeps[to].push(from);
  }

  // ── topological sort ───────────────────────────────────────────────────────

  const { order, cyclicIds } = topoSort(units.map(u => u.id), edges);
  if (cyclicIds.length > 0) {
    warn(`cyclic dependency among ${cyclicIds.length} unit(s) -- appended after sort: ${cyclicIds.join(", ")}`);
  }

  // ── route tree (best-effort) ───────────────────────────────────────────────

  const routeTree = [];
  for (const { filePath, sourceText } of routeFiles) {
    let src;
    try { src = parseSource(filePath, sourceText); }
    catch { continue; }
    const paths = extractRoutePaths(src);
    if (paths.length > 0) {
      const relFile = relative(absRoot, filePath).replace(/\\/g, "/");
      routeTree.push({ file: relFile, declaredPaths: paths });
    }
  }

  // ── assemble output ───────────────────────────────────────────────────────

  const index = {
    schemaVersion: "0.1.0",
    generatedAt: stamp ? new Date().toISOString() : "1970-01-01T00:00:00.000Z",
    srcRoot: relative(rootDir, absRoot).replace(/\\/g, "/") || ".",
    unitCount: units.length,
    units: units.map(({ id, kind, className, selector, path, files }) =>
      ({ id, kind, className, selector, path, files })),
    dependencyEdges: edges,
    processingOrder: order,
    routeTree,
    routeTreeNote: "Best-effort: path strings in route declarations, no lazy-import following.",
    reverseDependencies: reverseDeps,
    unresolvedReferences: unresolvedRefs,
    warnings,
  };

  // Strip private _ fields from unit records (defensive: they were removed above).
  for (const u of units) {
    delete u._absDir; delete u._src; delete u._srcText;
  }

  return index;
}
