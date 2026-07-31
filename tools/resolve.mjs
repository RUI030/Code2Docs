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
import { dirname, basename, join, resolve as resolvePath } from "node:path";
import { createHash } from "node:crypto";
import { extractSignature } from "./resolve/ts-signature.mjs";
import { extractDependencies } from "./resolve/ts-dependencies.mjs";
import { extractTemplate, findAngularCompiler } from "./resolve/ng-template.mjs";
import { pathToFileURL } from "node:url";

const RESOLVER_VERSION = "0.1.0";

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

for (const f of files) {
  const path = resolvePath(f);
  const sourceText = readFileSync(path, "utf8");
  const dir = dirname(path);

  // Sibling files the component declares or that name it, for `files` and metrics.
  const siblings = readdirSync(dir);
  const stem = basename(path).replace(/\.ts$/, "");
  const specs = siblings.filter((s) => s === `${stem}.spec.ts`);
  const templatePath = join(dir, `${stem}.html`);
  const templateText = existsSync(templatePath) ? readFileSync(templatePath, "utf8") : "";

  const sig = extractSignature(path, sourceText, {
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
    console.error(`no @Component class found in ${f}`);
    process.exit(1);
  }

  const shared = {
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
    const compilerPath = findAngularCompiler(dir);
    if (!compilerPath) {
      console.error(`  no @angular/compiler found above ${dir}: template not parsed`);
    } else {
      const compiler = await import(pathToFileURL(compilerPath).href);
      tpl = extractTemplate(basename(templatePath), templateText, sig, compilerPath,
        { ...shared, compiler });
      sig.metrics.maxTemplateNestingDepth = tpl.maxTemplateNestingDepth;
      delete tpl.maxTemplateNestingDepth;
      sig.manifest.template = "./template.json";
      const handlers = tpl.ast.eventBindings.map((e) => e.handlerMethod).filter(Boolean);
      const reachable = new Set([...handlers,
        ...tpl.ast.propertyBindings.flatMap((b) => b.dependsOn),
        ...tpl.ast.interpolations.flatMap((b) => b.dependsOn),
        ...tpl.ast.controlFlow.flatMap((b) => b.dependsOn)]);
      sig.publicApi.templateReachableMembers = [...reachable].sort();
      Object.assign(deps, extractDependencies(path, sourceText, sig,
        { ...shared, templateHandlers: handlers }));
    }
  }

  const out = flag("--out");
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "signature.json"), JSON.stringify(sig, null, 2) + "\n");
    if (deps) writeFileSync(join(out, "dependencies.json"), JSON.stringify(deps, null, 2) + "\n");
    if (tpl) writeFileSync(join(out, "template.json"), JSON.stringify(tpl, null, 2) + "\n");
    console.error(`wrote ${["signature", deps && "dependencies", tpl && "template"].filter(Boolean).join(" + ")}.json -> ${out}`);
  } else {
    const tier = flag("--tier");
    console.log(JSON.stringify(tier === "dependencies" ? deps : tier === "template" ? tpl : sig, null, 2));
  }
}
