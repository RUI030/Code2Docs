#!/usr/bin/env node
/**
 * Golden-file runner for the extractor fixtures.
 *
 *   npm run golden
 *
 * Each fixture folder may hold `expected.<tier>.json` -- the output the
 * Resolver must produce for that fixture. Until the Resolver exists (Phase 1)
 * there is nothing to diff against, so this reports what is pending and
 * checks what it can:
 *
 *   1. every fixture named in fixtures.json exists on disk, and vice versa
 *   2. every pair has both members
 *   3. any golden already written is itself a schema-valid instance
 *
 * That last one matters more than it looks: a golden is the specification of
 * correct output, so a malformed golden would encode a wrong specification and
 * the extractor would be built to satisfy it.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(ROOT, "fixtures");
const SCHEMA_DIR = join(ROOT, "templates", "schema");
const TIERS = ["signature", "dependencies", "functions", "template", "analysis"];

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
for (const name of readdirSync(SCHEMA_DIR)) {
  if (name.endsWith(".schema.json")) ajv.addSchema(JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8")), name);
}

const manifest = JSON.parse(readFileSync(join(FIX, "fixtures.json"), "utf8"));
const onDisk = readdirSync(FIX).filter((e) => statSync(join(FIX, e)).isDirectory());

let problems = 0;
const declared = new Set();
let pending = 0, checked = 0;

console.log(`${manifest.fixtures.length} fixture pairs declared, ${onDisk.length} folders on disk\n`);

for (const f of manifest.fixtures) {
  const members = f.pair;
  if (members.length !== 2) {
    console.error(`FAIL  ${f.id}: a pair must have exactly two members, found ${members.length}`);
    problems++;
  }
  const states = [];
  for (const m of members) {
    declared.add(m);
    if (!existsSync(join(FIX, m))) {
      console.error(`FAIL  ${f.id}: declared member '${m}' is not on disk`);
      problems++;
      continue;
    }
    const goldens = readdirSync(join(FIX, m)).filter((n) => /^expected\.\w+\.json$/.test(n));
    if (goldens.length === 0) {
      pending++;
      states.push(`${m}: no golden yet`);
      continue;
    }
    for (const g of goldens) {
      const tier = g.replace(/^expected\.|\.json$/g, "");
      if (!TIERS.includes(tier)) {
        console.error(`FAIL  ${m}/${g}: '${tier}' is not a tier`);
        problems++;
        continue;
      }
      const validate = ajv.getSchema(`${tier}.schema.json`);
      const data = JSON.parse(readFileSync(join(FIX, m, g), "utf8"));
      checked++;
      if (validate(data)) {
        states.push(`${m}: ${g} valid`);
      } else {
        problems++;
        console.error(`FAIL  ${m}/${g} is not a valid ${tier} instance:`);
        for (const e of validate.errors) console.error(`        ${e.instancePath || "/"} ${e.message}`);
      }
    }
  }
  console.log(`  ${f.id.padEnd(14)} ${f.mustExtract.length} assertions  |  ${states.join("  |  ")}`);
}

for (const d of onDisk) {
  if (!declared.has(d)) {
    console.error(`FAIL  folder '${d}' is on disk but not declared in fixtures.json`);
    problems++;
  }
}

console.log(`\n${checked} golden(s) checked, ${pending} member(s) awaiting a golden, ${problems} problem(s)`);
if (pending > 0 && problems === 0) {
  console.log("Goldens are written against the Resolver's output, so they arrive with Phase 1.");
}
process.exit(problems > 0 ? 1 : 0);
