/**
 * Phase 2 backfill -- cross-unit enrichment of existing per-unit output.
 *
 * Three things this pass does that Phase 1 could not, because they require
 * the cross-unit graph that only exists after index.json is built:
 *
 * 1. resolvedUnitId in signature.json -- fills the null slots by matching
 *    injected-dep token names against className in the index.
 *
 * 2. outboundUnitEdges / inboundUnitEdges in dependencies.json -- copied
 *    directly from the index edges; no re-parsing needed.
 *
 * 3. httpInteractions in dependencies.json -- Phase 1 only sees DIRECT
 *    HttpClient calls (dep.token starts with "Http"). A component whose
 *    requests go through an injected service records nothing, which reads
 *    as "makes no requests." This pass parses the service source to find
 *    its HttpClient calls and copies them to the component with
 *    directHttpClientUse: false.
 *
 * On safety: this modifies existing JSON files in outputDir. It never
 * touches schemaVersion, unitId, or the ast content it did not compute.
 * Provenance is updated: the lower-bound-only and empty-by-design warnings
 * are replaced with http-via-service / edge-backfilled notes so downstream
 * readers know the data changed.
 */

import ts from "typescript";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename, resolve as resolvePath } from "node:path";
import { parseSource, lineOf } from "./ts-source.mjs";

const HTTP_VERBS = new Set(["get", "post", "put", "patch", "delete"]);

// ── HttpClient property detection ─────────────────────────────────────────────

/**
 * Returns the set of property names that hold an HttpClient in this class.
 * Handles both inject() style and constructor-param style.
 */
function httpClientProps(cls, src) {
  const props = new Set();
  for (const m of cls.members) {
    // inject(HttpClient) field
    if (ts.isPropertyDeclaration(m) && m.initializer &&
        ts.isCallExpression(m.initializer) &&
        ts.isIdentifier(m.initializer.expression) &&
        m.initializer.expression.text === "inject") {
      const arg = m.initializer.arguments[0];
      if (arg && ts.isIdentifier(arg) && arg.text === "HttpClient") {
        props.add(m.name.getText(src));
      }
    }
    // constructor(private http: HttpClient)
    if (ts.isConstructorDeclaration(m)) {
      for (const p of m.parameters) {
        const t = p.type;
        if (t && ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) &&
            t.typeName.text === "HttpClient") {
          if (ts.isIdentifier(p.name)) props.add(p.name.text);
        }
      }
    }
  }
  return props;
}

// ── HTTP call scanning ────────────────────────────────────────────────────────

/**
 * Walk cls members for `this.<httpProp>.get/post/...()` calls.
 * Returns interactions shaped like the `ast` portion of httpInteractions.
 */
function scanHttpCalls(cls, src, file, props) {
  const found = [];

  function memberId(m) {
    if (ts.isMethodDeclaration(m))         return `method:${m.name.getText(src)}`;
    if (ts.isConstructorDeclaration(m))    return "method:constructor";
    if (ts.isGetAccessor(m))               return `accessor:${m.name.getText(src)}`;
    if (ts.isPropertyDeclaration(m)) {
      const name = m.name.getText(src);
      const isArrow = m.initializer && (ts.isArrowFunction(m.initializer) ||
                                        ts.isFunctionExpression(m.initializer));
      return isArrow ? `field:${name}` : `field-initializer:${name}`;
    }
    return null;
  }

  function bodyOf(m) {
    if (ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m) ||
        ts.isGetAccessor(m) || ts.isSetAccessor(m)) return m.body ?? null;
    if (ts.isPropertyDeclaration(m) && m.initializer) {
      if (ts.isArrowFunction(m.initializer) || ts.isFunctionExpression(m.initializer))
        return m.initializer.body;
      return m.initializer;
    }
    return null;
  }

  for (const m of cls.members) {
    const id = memberId(m);
    const body = bodyOf(m);
    if (!id || !body) continue;

    (function walk(node) {
      if (ts.isCallExpression(node)) {
        const e = node.expression;
        // this.<prop>.<verb>(...)
        if (ts.isPropertyAccessExpression(e) &&
            ts.isPropertyAccessExpression(e.expression) &&
            e.expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
            props.has(e.expression.name.text) &&
            HTTP_VERBS.has(e.name.text)) {
          found.push({
            method: e.name.text.toUpperCase(),
            urlExpression: node.arguments[0]?.getText(src) ?? "",
            calledFrom: id,
            loc: { file, line: lineOf(node, src) },
          });
        }
      }
      ts.forEachChild(node, walk);
    }(body));
  }
  return found;
}

// ── service HTTP extraction ───────────────────────────────────────────────────

/**
 * Parse a service source and return its HttpClient calls, or [] if none.
 * Never throws -- returns [] on any parse or read failure.
 */
function extractHttpFromService(filePath, sourceText) {
  try {
    const src = parseSource(filePath, sourceText);
    let cls = null;
    ts.forEachChild(src, n => { if (!cls && ts.isClassDeclaration(n) && n.name) cls = n; });
    if (!cls) return [];
    const props = httpClientProps(cls, src);
    if (props.size === 0) return [];
    return scanHttpCalls(cls, src, basename(filePath), props);
  } catch {
    return [];
  }
}

// ── main export ───────────────────────────────────────────────────────────────

/**
 * @param {string} indexPath   Absolute path to index.json.
 * @param {string} srcRoot     Absolute path to the Angular source root.
 * @param {string} outputDir   Absolute path to the OUTPUT directory to enrich.
 * @returns {{ signatureUpdates, depsUpdates, httpAdded, edgesAdded }}
 */
export function backfill(indexPath, srcRoot, outputDir) {
  const index = JSON.parse(readFileSync(indexPath, "utf8"));

  // Build lookups from the index.
  const byClassName = {};  // className -> unit
  const byId = {};         // unitId    -> unit
  for (const u of index.units) {
    byClassName[u.className] = u;
    byId[u.id] = u;
  }

  // Pre-index edges by unit.
  const edgesFrom = {};  // unitId -> [{ to, via }]
  const edgesTo = {};    // unitId -> [{ from, via }]
  for (const { from, to, via } of index.dependencyEdges) {
    (edgesFrom[from] ??= []).push({ to, via });
    (edgesTo[to]    ??= []).push({ from, via });
  }

  // Cache parsed HTTP interactions per service unit to avoid re-parsing.
  const httpCache = {};
  function serviceHttp(unit) {
    if (unit.id in httpCache) return httpCache[unit.id];
    const file = join(resolvePath(srcRoot), unit.path, unit.files.typescript);
    let text;
    try { text = readFileSync(file, "utf8"); }
    catch { return (httpCache[unit.id] = []); }
    return (httpCache[unit.id] = extractHttpFromService(file, text));
  }

  const report = { signatureUpdates: 0, depsUpdates: 0, httpAdded: 0, edgesAdded: 0 };

  for (const unit of index.units) {
    const unitOut = join(resolvePath(outputDir), unit.path);
    const sigPath  = join(unitOut, "signature.json");
    const depsPath = join(unitOut, "dependencies.json");

    // ── 1. resolvedUnitId in signature.json ───────────────────────────────

    if (existsSync(sigPath)) {
      let sig;
      try { sig = JSON.parse(readFileSync(sigPath, "utf8")); }
      catch { sig = null; }

      if (sig) {
        let changed = false;
        for (const dep of sig.injectedDependencies ?? []) {
          if (dep.resolvedUnitId !== null) continue;
          const resolved = dep.token ? byClassName[dep.token] : null;
          if (resolved) { dep.resolvedUnitId = resolved.id; changed = true; }
        }
        if (changed) {
          writeFileSync(sigPath, JSON.stringify(sig, null, 2) + "\n");
          report.signatureUpdates++;
        }
      }
    }

    // ── 2 & 3. outboundUnitEdges, inboundUnitEdges, httpInteractions ──────

    if (!existsSync(depsPath)) continue;
    let deps;
    try { deps = JSON.parse(readFileSync(depsPath, "utf8")); }
    catch { continue; }

    let changed = false;

    // 2. Unit edges from index (free -- no parsing).
    const outbound = (edgesFrom[unit.id] ?? []);
    const inbound  = (edgesTo[unit.id]   ?? []);
    if (deps.outboundUnitEdges?.length === 0 && outbound.length > 0) {
      deps.outboundUnitEdges = outbound;
      deps.provenance.warnings = (deps.provenance.warnings ?? [])
        .filter(w => w.code !== "empty-by-design" ||
                     !w.message.includes("outboundUnitEdges"));
      report.edgesAdded += outbound.length + inbound.length;
      changed = true;
    }
    if (deps.inboundUnitEdges?.length === 0 && inbound.length > 0) {
      deps.inboundUnitEdges = inbound;
      changed = true;
    }

    // 3. HTTP interactions through injected services.
    if ((deps.httpInteractions ?? []).length === 0) {
      // Read signature to get injected deps (may have just been updated above).
      let sig = null;
      try { sig = existsSync(sigPath) ? JSON.parse(readFileSync(sigPath, "utf8")) : null; }
      catch { /* leave null */ }

      const injected = sig?.injectedDependencies ?? [];
      const indirect = [];

      for (const dep of injected) {
        // resolvedUnitId may have just been filled; fall back to className lookup.
        const svcUnit = dep.resolvedUnitId
          ? byId[dep.resolvedUnitId]
          : (dep.token ? byClassName[dep.token] : null);
        if (!svcUnit || svcUnit.kind !== "service") continue;

        const raw = serviceHttp(svcUnit);
        for (const h of raw) {
          indirect.push({
            id: `http:${deps.httpInteractions.length + indirect.length + 1}`,
            method: h.method,
            urlExpression: h.urlExpression,
            requestType: null,
            responseType: null,
            viaDependency: dep.id,
            viaService: svcUnit.id,
            calledFrom: h.calledFrom,
            directHttpClientUse: false,
            loc: h.loc,
          });
        }
      }

      if (indirect.length > 0) {
        deps.httpInteractions = indirect;
        // Replace lower-bound-only (resolved) with an info note.
        deps.provenance.warnings = (deps.provenance.warnings ?? [])
          .filter(w => w.code !== "lower-bound-only");
        deps.provenance.warnings.push({
          code: "http-via-service",
          severity: "info",
          message: `${indirect.length} HTTP interaction(s) inferred from injected service(s) by Phase 2 backfill (directHttpClientUse: false).`,
        });
        deps.provenance.parseStatus = deps.provenance.warnings.some(w => w.severity === "error")
          ? "failed"
          : deps.provenance.warnings.some(w => w.severity === "warning")
          ? "partial"
          : "ok";
        report.httpAdded += indirect.length;
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(depsPath, JSON.stringify(deps, null, 2) + "\n");
      report.depsUpdates++;
    }
  }

  return report;
}
