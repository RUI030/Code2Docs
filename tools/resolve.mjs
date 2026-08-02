#!/usr/bin/env node
/**
 * Resolver CLI -- deterministic extraction (Phases 1 & 2).
 *
 *   npm run resolve -- <component.ts> [--out <dir>] [--unit-path <path>]
 *   npm run resolve -- index <src-root> [--out <dir>] [--stamp]
 *
 * Unit mode: prints signature.json to stdout, or writes all four ast tiers into
 * --out. Determinism is the point, so generatedAt is fixed unless --stamp is
 * passed (a real timestamp defeats golden-file diffing).
 *
 * Index mode: walks <src-root>, classifies every Angular unit, builds the
 * cross-unit dependency graph, and writes index.json to --out (or stdout).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, basename, join, resolve as resolvePath, relative } from "node:path";
import { createHash } from "node:crypto";
import { extractSignature, readComponentDeclaration } from "./resolve/ts-signature.mjs";
import { createWarnings } from "./resolve/warnings.mjs";
import { parseSource } from "./resolve/ts-source.mjs";
import { countConstructs, recallGaps } from "./resolve/ng-scan.mjs";
import { extractDependencies } from "./resolve/ts-dependencies.mjs";
import { extractTemplate, findAngularCompiler } from "./resolve/ng-template.mjs";
import { extractFunctions } from "./resolve/ts-functions.mjs";
import { buildIndex } from "./resolve/ng-index.mjs";
import { backfill } from "./resolve/backfill.mjs";
import { pathToFileURL, fileURLToPath } from "node:url";

const RESOLVER_VERSION = "0.1.0";
const ROOT_DIR = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
/** Absolute paths must not reach recorded output: they pin a golden to one machine. */
const relativePath = (p) => relative(ROOT_DIR, p) || p;

/** Angular version this Resolver pins, read from our own package.json. */
const OUR_ANGULAR_VERSION = (() => {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT_DIR, "package.json"), "utf8"));
    return pkg.devDependencies?.["@angular/compiler"] ?? null;
  } catch { return null; }
})();

/**
 * The Angular version the ANALYZED tree declares, from the nearest package.json.
 *
 * This deliberately does NOT exclude our own package.json, unlike the `vendored`
 * check. The two ask different questions: `vendored` asks whose node_modules
 * supplied the parser, where ours must not be mistaken for theirs; this asks what
 * version the source is WRITTEN AGAINST, and for a fixture inside this repo our
 * package.json is exactly that declaration.
 */
function nearestAngularVersion(startDir) {
  let dir = resolvePath(startDir);
  for (;;) {
    const p = join(dir, "package.json");
    if (existsSync(p)) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf8"));
        const v = pkg.dependencies?.["@angular/core"] ?? pkg.devDependencies?.["@angular/core"]
          ?? pkg.dependencies?.["@angular/compiler"] ?? pkg.devDependencies?.["@angular/compiler"];
        if (v) return v;
      } catch { /* unreadable package.json is not a version claim */ }
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Which flags consume the next argument. Declared, because the previous parser
 * inferred it -- it treated any argument preceded by a `--something` as that
 * flag's value, which broke two ways: `--stamp file.ts` swallowed the file (that
 * flag takes no value), and a file whose name equalled a flag value was matched
 * by indexOf against the FIRST occurrence and counted twice.
 */
const VALUE_FLAGS = new Set(["--out", "--unit-path", "--tier"]);
const BOOL_FLAGS = new Set(["--stamp", "--source-excerpt"]);

const argv = process.argv.slice(2);
const opts = new Map();
const files = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (VALUE_FLAGS.has(a)) { opts.set(a, argv[++i] ?? null); continue; }
  if (BOOL_FLAGS.has(a)) { opts.set(a, true); continue; }
  if (a.startsWith("--")) {
    console.error(`unknown flag ${a}`);
    process.exit(2);
  }
  files.push(a);   // positional, decided by POSITION rather than by value
}
const flag = (name, fallback = null) => opts.get(name) ?? fallback;
const has = (name) => opts.get(name) === true;

// ── backfill subcommand ───────────────────────────────────────────────────────
if (files[0] === "backfill") {
  const indexPath = files[1];
  const srcRoot   = files[2];
  const out       = flag("--out");
  if (!indexPath || !srcRoot || !out) {
    console.error("usage: npm run resolve -- backfill <index.json> <src-root> --out <output-dir>");
    process.exit(2);
  }
  const report = backfill(resolvePath(indexPath), resolvePath(srcRoot), resolvePath(out));
  console.error(
    `backfill: ${report.signatureUpdates} signature(s) updated, `
    + `${report.depsUpdates} deps file(s) updated `
    + `(+${report.httpAdded} http interaction(s), +${report.edgesAdded} unit edge(s))`
  );
  process.exit(0);
}
// ─────────────────────────────────────────────────────────────────────────────

// ── index subcommand ─────────────────────────────────────────────────────────
if (files[0] === "index") {
  const srcRoot = files[1];
  if (!srcRoot) {
    console.error("usage: npm run resolve -- index <src-root> [--out <dir>] [--stamp]");
    process.exit(2);
  }
  const index = await buildIndex(srcRoot, {
    rootDir: ROOT_DIR,
    stamp: has("--stamp"),
  });
  const out = flag("--out");
  if (out) {
    mkdirSync(out, { recursive: true });
    const dest = join(out, "index.json");
    writeFileSync(dest, JSON.stringify(index, null, 2) + "\n");
    console.error(
      `index: ${index.unitCount} units, ${index.dependencyEdges.length} edges, `
      + `${index.unresolvedReferences.length} unresolved refs`
      + (index.warnings.length ? `, ${index.warnings.length} warning(s)` : "")
      + ` -> ${dest}`,
    );
    if (index.warnings.length) {
      for (const w of index.warnings) console.error(`  warn: ${w}`);
    }
  } else {
    console.log(JSON.stringify(index, null, 2));
  }
  process.exit(0);
}
// ────────────────────────────────────────────────────────────────────────────

if (files.length === 0) {
  console.error("usage: npm run resolve -- <component.ts> [--out <dir>] [--unit-path <path>]");
  process.exit(2);
}

let exitCode = 0;

for (const f of files) {
  const path = resolvePath(f);
  const dir = dirname(path);

  // Phase 1's cross-cutting rule: never throw on unparseable input. A run over a
  // real repo must not die on one bad file, so a failure here is recorded against
  // the unit and the loop continues.
  let sourceText;
  try {
    sourceText = readFileSync(path, "utf8");
  } catch (err) {
    console.error(`  ${relativePath(path)}: unreadable (${err.code ?? err.message}) -- skipped`);
    exitCode = 1;
    continue;
  }

  // Sibling files the component declares or that name it, for `files` and metrics.
  const siblings = readdirSync(dir);
  const stem = basename(path).replace(/\.ts$/, "");
  const specs = siblings.filter((s) => s === `${stem}.spec.ts`);

  // Warnings raised here belong to signature, so the collector is made in the
  // orchestrator and handed down rather than created inside the extractor.
  // One collector per tier: a gap in the template must be reported on template's
  // record, not on signature's. Created here rather than inside each extractor so
  // the recall audit -- which runs after all four -- can still reach them.
  const sigWarn = createWarnings({ root: ROOT_DIR });
  const tplWarn = createWarnings({ root: ROOT_DIR });
  const fnWarn = createWarnings({ root: ROOT_DIR });

  // The DECORATOR says where the template is. This used to guess `<stem>.html`,
  // which silently missed inline templates and any templateUrl not matching the
  // .ts filename -- and produced no message either way.
  // Parsed ONCE and threaded through all four extractors. Each still parses for
  // itself when called without it, so they stay independently testable.
  const src = parseSource(path, sourceText);

  const { template: decl, hasInlineStyles } = readComponentDeclaration(path, sourceText, { src });
  let templateText = "", templateFile = null, templateLineOffset = 0;
  if (decl.kind === "inline") {
    templateText = decl.text;
    // Locations resolve into the .ts itself, offset to the literal's own line.
    templateFile = basename(path);
    templateLineOffset = decl.startLine;
  } else if (decl.kind === "external") {
    const declared = resolvePath(dir, decl.url);
    if (existsSync(declared)) {
      templateText = readFileSync(declared, "utf8");
      templateFile = basename(declared);
    } else {
      sigWarn.warn("template-not-found",
        `decorator declares templateUrl '${decl.url}', which does not resolve `
        + `(looked for ${relativePath(declared)}). No UI facts were extracted.`);
    }
  }
  if (hasInlineStyles) {
    sigWarn.warn("empty-by-design",
      "component declares inline styles, which unit.files.styles cannot record -- "
      + "it holds filenames only. Style facts for this unit are incomplete.");
  }

  const sig = extractSignature(path, sourceText, {
    root: ROOT_DIR,
    src,
    warn: sigWarn,
    unitPath: flag("--unit-path", ""),
    specs,
    templateFile,
    templateText,
    templateLineCount: templateText ? templateText.replace(/\n$/, "").split("\n").length : 0,
    resolverVersion: RESOLVER_VERSION,
    generatedAt: has("--stamp") ? new Date().toISOString() : "1970-01-01T00:00:00.000Z",
    inputHash: createHash("sha256")
      .update(sourceText).update(templateText).update(RESOLVER_VERSION)
      .digest("hex").slice(0, 16),
  });

  if (!sig) {
    // Was process.exit(1). A unit the resolver cannot classify is a finding to
    // report, not a reason to abandon the other files on the command line.
    console.error(`  ${relativePath(path)}: no @Component class found -- skipped`);
    exitCode = 1;
    continue;
  }

  const shared = {
    root: ROOT_DIR,
    src,
    resolverVersion: RESOLVER_VERSION,
    generatedAt: has("--stamp") ? new Date().toISOString() : "1970-01-01T00:00:00.000Z",
    inputHash: createHash("sha256").update(sourceText).update(templateText)
      .update(RESOLVER_VERSION).digest("hex").slice(0, 16),
  };
  // Template BEFORE dependencies. It used to run after, which forced
  // extractDependencies to be called a second time and Object.assign'd over the
  // first -- two full graph extractions where the only difference was that the
  // second knew about template handlers. Stale keys from the first survived if
  // the second ever returned a narrower object, and the two agreeing at all was
  // coincidence. Ordering it correctly removes the need for the second call
  // rather than tidying it up.
  let tpl = null;
  let templateContext = {};
  if (templateText) {
    const found = findAngularCompiler(dir, ROOT_DIR);
    if (!found) {
      tplWarn.warn("compiler-not-found",
        `no @angular/compiler above ${relativePath(dir)} or in this tool: template not parsed. `
        + "All UI facts are missing for this unit, not merely incomplete.");
      sigWarn.warn("compiler-not-found",
        "template.json was not produced: no @angular/compiler was available to parse it.");
    } else {
      const compiler = await import(pathToFileURL(found.path).href);
      // What the ANALYZED tree expects, so a fallback parse can say whether the
      // versions actually differ rather than only that a fallback happened.
      const repoAngularVersion = nearestAngularVersion(dir);
      const parsed = extractTemplate(templateFile, templateText, sig, found.path,
        { ...shared, compiler, vendored: found.vendored, lineOffset: templateLineOffset, warn: tplWarn,
          repoAngularVersion, compilerVersion: OUR_ANGULAR_VERSION });
      tpl = parsed.tier;
      sig.metrics.maxTemplateNestingDepth = parsed.metrics.maxTemplateNestingDepth;
      sig.manifest.template = "./template.json";

      const handlers = tpl.ast.eventBindings.map((e) => e.handlerMethod).filter(Boolean);
      const reachable = new Set([...handlers,
        ...tpl.ast.propertyBindings.flatMap((b) => b.dependsOn),
        ...tpl.ast.interpolations.flatMap((b) => b.dependsOn),
        ...tpl.ast.controlFlow.flatMap((b) => b.dependsOn)]);
      sig.publicApi.templateReachableMembers = [...reachable].sort();

      templateContext = {
        templateHandlers: handlers,
        templateCallers: tpl.ast.eventBindings
          .filter((e) => e.handlerMethod)
          .map((e) => ({ node: e.id, member: e.handlerMethod })),
        templateReaders: [...tpl.ast.propertyBindings, ...tpl.ast.interpolations,
                          ...tpl.ast.controlFlow]
          .flatMap((b) => (b.dependsOn ?? []).map((f) => ({ node: b.id, field: f }))),
      };
    }
  }

  // One call, with the template context when there is one.
  const deps = extractDependencies(path, sourceText, sig, { ...shared, ...templateContext });

  const specPath = specs.length ? join(dir, specs[0]) : null;
  const specText = specPath ? readFileSync(specPath, "utf8") : null;
  const fns = extractFunctions(path, sourceText, sig, deps, {
    ...shared, warn: fnWarn, specFile: specs[0] ?? null, specText,
    sourceExcerpt: has("--source-excerpt"),
    templateTwoWay: tpl?.ast?.twoWayBindings ?? [],
    framework: specText ? (/\bjest\b/.test(specText) ? "jest"
      : /\bjasmine\b/.test(specText) ? "jasmine-karma"
      : /\bvitest\b/.test(specText) ? "vitest" : "unknown") : "unknown",
  });
  if (fns) sig.manifest.functions = "./functions.json";

  // --- D3a recall audit: count the same constructs a second way and compare.
  // Text counting is an UPPER bound, so only scan > recorded is reported. The
  // gap lands in the owning tier's warnings and NEVER in an ast field.
  {
    const scan = countConstructs(sourceText, templateText);
    const cf = tpl?.ast?.controlFlow ?? null;
    const cfCount = (c) => (cf === null ? undefined : cf.filter((x) => x.construct === c).length);
    const recorded = {
      decoratorInputs: sig.publicApi.inputs.filter((i) => i.declarationStyle === "decorator").length,
      decoratorOutputs: sig.publicApi.outputs.filter((o) => o.declarationStyle === "eventemitter").length,
      injectCalls: sig.injectedDependencies.filter((d) => d.injectionStyle === "inject-fn").length,
      lifecycleHooks: (sig.lifecycle?.implementedHooks ?? []).length,
      subscribeCalls: fns
        ? Object.values(fns.symbols ?? {}).reduce((n, sym) => n + (sym.ast?.subscriptions?.length ?? 0), 0)
        : undefined,
      ifBlocks: cfCount("@if"), forBlocks: cfCount("@for"),
      switchBlocks: cfCount("@switch"), deferBlocks: cfCount("@defer"),
      ngIfUses: cfCount("*ngIf"), ngForUses: cfCount("*ngFor"),
    };
    const byTier = { signature: sigWarn, functions: fnWarn, template: tplWarn };
    for (const g of recallGaps(scan, recorded)) {
      const w = byTier[g.tier];
      if (!w) continue;
      w.warn("recall-gap",
        `text search found ${g.scanned} occurrence(s) of ${g.key} but this tier recorded `
        + `${g.recorded}. Text counting over-reports, so this is a signal to check the `
        + `extractor, not proof of a miss.`);
    }
    // Warnings raised after a tier was assembled must be re-read into it.
    sig.provenance.warnings = sigWarn.list();
    sig.provenance.parseStatus = sigWarn.parseStatus();
    if (fns) { fns.provenance.warnings = fnWarn.list(); fns.provenance.parseStatus = fnWarn.parseStatus(); }
    if (tpl) { tpl.provenance.warnings = tplWarn.list(); tpl.provenance.parseStatus = tplWarn.parseStatus();
               tpl.parse.status = tplWarn.parseStatus(); }
  }

  const out = flag("--out");
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "signature.json"), JSON.stringify(sig, null, 2) + "\n");
    if (deps) writeFileSync(join(out, "dependencies.json"), JSON.stringify(deps, null, 2) + "\n");
    if (tpl) writeFileSync(join(out, "template.json"), JSON.stringify(tpl, null, 2) + "\n");
    if (fns) writeFileSync(join(out, "functions.json"), JSON.stringify(fns, null, 2) + "\n");
    console.error(`wrote ${["signature", deps && "dependencies", tpl && "template", fns && "functions"].filter(Boolean).join(" + ")} -> ${out}`);
  } else {
    const tier = flag("--tier");
    const byTier = { dependencies: deps, template: tpl, functions: fns, signature: sig };
    console.log(JSON.stringify(byTier[tier] ?? sig, null, 2));
  }
}

process.exit(exitCode);
