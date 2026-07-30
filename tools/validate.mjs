#!/usr/bin/env node
/**
 * Schema validation for the Code2Docs JSON tiers.
 *
 *   npm run validate -- <file...>     validate specific files
 *   npm run validate                  validate every instance under examples/
 *
 * Tier is chosen by filename. Templates under templates/ are NOT validated:
 * they are placeholder documents ("<ClassName>") and are documentation of
 * shape, not instances of it -- see plans/3_PhaseAFindings.md.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_DIR = join(ROOT, "templates", "schema");

const TIERS = ["signature", "dependencies", "functions", "template", "analysis"];

function loadSchemas() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const available = new Map();
  for (const name of readdirSync(SCHEMA_DIR)) {
    if (!name.endsWith(".schema.json")) continue;
    const schema = JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8"));
    ajv.addSchema(schema, name);
    const tier = name.replace(".schema.json", "");
    if (TIERS.includes(tier)) available.set(tier, { file: name, wants: requiredVersion(schema) });
  }
  return { ajv, available };
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (entry.endsWith(".json")) out.push(p);
  }
  return out;
}

/**
 * The schemaVersion a schema demands, when it pins one. An instance written
 * against an older version is reported as legacy rather than failed: it is not
 * wrong, it predates a decision. Pinned baselines cannot be rewritten, so
 * without this a schema change would either be blocked by history or would
 * silently drop history from the suite.
 */
function requiredVersion(schema) {
  return schema?.properties?.schemaVersion?.const ?? null;
}

function tierOf(file) {
  const stem = basename(file).replace(/\.json$/, "");
  return TIERS.includes(stem) ? stem : null;
}

const { ajv, available } = loadSchemas();

let targets = process.argv.slice(2);
if (targets.length === 0) {
  const examples = join(ROOT, "examples");
  try {
    targets = walk(examples);
  } catch {
    console.error("no examples/ directory and no files given");
    process.exit(2);
  }
}

let checked = 0, failed = 0, skipped = 0;
const legacy = [];
const missingTiers = new Set();

for (const file of targets) {
  const tier = tierOf(file);
  if (!tier) {
    skipped++;
    continue;
  }
  if (!available.has(tier)) {
    missingTiers.add(tier);
    skipped++;
    continue;
  }
  const { file: schemaFile, wants } = available.get(tier);
  const validate = ajv.getSchema(schemaFile);
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`PARSE  ${file}\n       ${e.message}`);
    failed++;
    continue;
  }
  if (wants && data.schemaVersion && data.schemaVersion !== wants) {
    legacy.push({ file, tier, has: data.schemaVersion, wants });
    console.log(`legacy ${file.replace(ROOT + "/", "")}  [${tier}]  ` +
      `schemaVersion ${data.schemaVersion}, schema is ${wants} -- not validated`);
    continue;
  }
  checked++;
  if (validate(data)) {
    console.log(`ok     ${file.replace(ROOT + "/", "")}  [${tier}]`);
  } else {
    failed++;
    console.error(`FAIL   ${file.replace(ROOT + "/", "")}  [${tier}]`);
    for (const err of validate.errors) {
      const where = err.instancePath || "/";
      console.error(`       ${where}  ${err.message}` +
        (err.params?.additionalProperty ? ` (${err.params.additionalProperty})` : "") +
        (err.params?.allowedValues ? ` -> ${JSON.stringify(err.params.allowedValues)}` : ""));
    }
  }
}

if (missingTiers.size) {
  console.log(`\nno schema yet for: ${[...missingTiers].sort().join(", ")}`);
}
if (legacy.length) {
  console.log(`\n${legacy.length} legacy instance(s) predate a schema change and were not validated:`);
  for (const l of legacy) console.log(`  ${l.tier} ${l.has} -> ${l.wants}  ${l.file.replace(ROOT + "/", "")}`);
}
console.log(`\n${checked} validated, ${failed} failed, ${skipped} skipped, ${legacy.length} legacy`);
process.exit(failed > 0 ? 1 : 0);
