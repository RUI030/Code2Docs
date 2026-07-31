#!/usr/bin/env node
/**
 * Resolver CLI -- deterministic extraction (Phase 1).
 *
 *   npm run resolve -- <component.ts> [--out <dir>] [--unit-path <path>]
 *
 * Prints signature.json to stdout, or writes it into --out. Determinism is the
 * point of this tier, so generatedAt is fixed unless --stamp is passed: a
 * timestamp would make every run differ and defeat golden-file diffing.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { dirname, basename, join, resolve as resolvePath, relative } from "node:path";
import { createHash } from "node:crypto";
import { extractSignature } from "./resolve/ts-signature.mjs";
import { extractDependencies } from "./resolve/ts-dependencies.mjs";
import { extractTemplate, findAngularCompiler } from "./resolve/ng-template.mjs";
import { extractFunctions } from "./resolve/ts-functions.mjs";
import { pathToFileURL, fileURLToPath } from "node:url";

const RESOLVER_VERSION = "0.1.0";
const ROOT_DIR = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
/** Absolute paths must not reach recorded output: they pin a golden to one machine. */
const relativePath = (p) => relative(ROOT_DIR, p) || p;

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const has = (name) => args.includes(name);

const files = args.filter((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true);
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
  const templatePath = join(dir, `${stem}.html`);
  const templateText = existsSync(templatePath) ? readFileSync(templatePath, "utf8") : "";

  const sig = extractSignature(path, sourceText, {
    root: ROOT_DIR,
    unitPath: flag("--unit-path", ""),
    specs,
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
    resolverVersion: RESOLVER_VERSION,
    generatedAt: has("--stamp") ? new Date().toISOString() : "1970-01-01T00:00:00.000Z",
    inputHash: createHash("sha256").update(sourceText).update(templateText)
      .update(RESOLVER_VERSION).digest("hex").slice(0, 16),
  };
  const deps = extractDependencies(path, sourceText, sig, shared);

  // Template parsing uses the ANALYZED repo's compiler so the parser matches the
  // syntax the repo can actually use. Missing is reported, never silently skipped.
  let tpl = null;
  if (templateText) {
    const found = findAngularCompiler(dir, ROOT_DIR);
    if (!found) {
      console.error(`  no @angular/compiler found above ${dir} or in this tool: template not parsed`);
    } else {
      const compiler = await import(pathToFileURL(found.path).href);
      tpl = extractTemplate(basename(templatePath), templateText, sig, found.path,
        { ...shared, compiler, vendored: found.vendored });
      sig.metrics.maxTemplateNestingDepth = tpl.maxTemplateNestingDepth;
      delete tpl.maxTemplateNestingDepth;
      sig.manifest.template = "./template.json";
      const handlers = tpl.ast.eventBindings.map((e) => e.handlerMethod).filter(Boolean);
      const templateCallers = tpl.ast.eventBindings
        .filter((e) => e.handlerMethod)
        .map((e) => ({ node: e.id, member: e.handlerMethod }));
      const templateReaders = [...tpl.ast.propertyBindings, ...tpl.ast.interpolations,
                               ...tpl.ast.controlFlow]
        .flatMap((b) => (b.dependsOn ?? []).map((f) => ({ node: b.id, field: f })));
      const reachable = new Set([...handlers,
        ...tpl.ast.propertyBindings.flatMap((b) => b.dependsOn),
        ...tpl.ast.interpolations.flatMap((b) => b.dependsOn),
        ...tpl.ast.controlFlow.flatMap((b) => b.dependsOn)]);
      sig.publicApi.templateReachableMembers = [...reachable].sort();
      Object.assign(deps, extractDependencies(path, sourceText, sig,
        { ...shared, templateHandlers: handlers, templateCallers, templateReaders }));
    }
  }

  const specPath = specs.length ? join(dir, specs[0]) : null;
  const specText = specPath ? readFileSync(specPath, "utf8") : null;
  const fns = extractFunctions(path, sourceText, sig, deps, {
    ...shared, specFile: specs[0] ?? null, specText,
    sourceExcerpt: has("--source-excerpt"),
    templateTwoWay: tpl?.ast?.twoWayBindings ?? [],
    framework: specText ? (/\bjest\b/.test(specText) ? "jest"
      : /\bjasmine\b/.test(specText) ? "jasmine-karma"
      : /\bvitest\b/.test(specText) ? "vitest" : "unknown") : "unknown",
  });
  if (fns) sig.manifest.functions = "./functions.json";

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
