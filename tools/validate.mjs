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
import { readFileSync, readdirSync, statSync } from "node:fs";import { join, basename, resolve } from "node:path";import Ajv2020 from "ajv/dist/2020.js";
import { ROOT, SCHEMA_DIR, VALIDATABLE_TIERS as TIERS } from "./tiers.mjs";


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

/**
 * `signature.json` and the goldens' `expected.signature.json` are the same tier.
 * Matching only the bare stem meant every golden fell through to "skipped",
 * which is why adding fixtures/ to the walk alone did not validate anything.
 */
function tierOf(file) {
  const stem = basename(file).replace(/\.json$/, "").replace(/^expected\./, "");
  return TIERS.includes(stem) ? stem : null;
}

const { ajv, available } = loadSchemas();

/**
 * The warning-code vocabulary exists twice: as WARNING_CODES in
 * tools/resolve/warnings.mjs (which throws on an unlisted code) and as an enum in
 * common.schema.json (which rejects one). Two spellings of one contract drift the
 * moment a code is added to only one, and the failure is confusing -- the
 * extractor accepts the code, then the file it wrote fails validation.
 *
 * Rather than generate one from the other and add a build step, assert they are
 * identical. Cheap, and it fails at the moment of divergence.
 */
{
  const { WARNING_CODES } = await import("./resolve/warnings.mjs");
  const common = JSON.parse(readFileSync(join(SCHEMA_DIR, "common.schema.json"), "utf8"));
  const inSchema = new Set(common.$defs.warning.properties.code.enum);
  const inCode = new Set(Object.keys(WARNING_CODES));
  const missing = [...inCode].filter((c) => !inSchema.has(c));
  const extra = [...inSchema].filter((c) => !inCode.has(c));
  if (missing.length || extra.length) {
    console.error("WARNING CODE VOCABULARY OUT OF SYNC between warnings.mjs and common.schema.json");
    if (missing.length) console.error(`  in code, not in schema: ${missing.join(", ")}`);
    if (extra.length) console.error(`  in schema, not in code:  ${extra.join(", ")}`);
    process.exit(1);
  }
}

let targets = process.argv.slice(2);
if (targets.length === 0) {
  // examples/ AND the fixture goldens. examples/ alone was the original scope,
  // and once every promoted example went legacy behind a schema bump it left the
  // validator walking a directory where nothing was eligible -- reporting
  // "0 validated" and exit 0, a green step that checked nothing. The goldens are
  // current-version extractor output, so they are exactly what the schema should
  // be enforced against.
  targets = [];
  for (const d of ["examples", "fixtures"]) {
    try { targets.push(...walk(join(ROOT, d))); } catch { /* absent is fine */ }
  }
  if (targets.length === 0) {
    console.error("nothing to validate: no examples/ or fixtures/, and no files given");
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

// A validator that validated nothing must not look like one that validated
// everything successfully. This is how the legacy sweep hid: every candidate was
// skipped, and the summary still read as a pass.
if (checked === 0) {
  console.error(
    `\nNOTHING WAS VALIDATED -- ${targets.length} target(s) were all legacy, skipped, or `
    + `unmatched by a tier name. Treating as a failure: a green check that checked nothing `
    + `is worse than a red one.`);
  process.exit(1);
}
process.exit(failed > 0 ? 1 : 0);
