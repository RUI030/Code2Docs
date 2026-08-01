#!/usr/bin/env node
/**
 * Golden-file runner for the extractor fixtures.
 *
 *   npm run golden              check
 *   npm run golden -- --update  regenerate goldens from current output
 *
 * Two checks, doing different jobs, and the difference matters:
 *
 *   1. REGRESSION. Extractor output is diffed against a committed golden. A
 *      golden is generated from the extractor, so diffing it against the
 *      extractor cannot establish correctness -- it establishes only that
 *      behaviour has not changed unnoticed. Every `--update` is a claim the new
 *      output is right, and belongs in a reviewed diff.
 *
 *   2. PAIR EQUIVALENCE. Each pair states the same semantics in different
 *      syntax, so both members must extract to equivalent output apart from the
 *      fields fixtures.json declares may differ. This is the check that can
 *      catch a wrong reading rather than a changed one, because the two members
 *      are independent inputs -- it is what caught *ngIf extracting to nothing
 *      while @if extracted to seven constructs.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import Ajv2020 from "ajv/dist/2020.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIX = join(ROOT, "fixtures");
const SCHEMA_DIR = join(ROOT, "templates", "schema");
const TIERS = ["signature", "dependencies", "functions", "template"];
const UPDATE = process.argv.includes("--update");

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
for (const n of readdirSync(SCHEMA_DIR)) {
  if (n.endsWith(".schema.json")) ajv.addSchema(JSON.parse(readFileSync(join(SCHEMA_DIR, n), "utf8")), n);
}

const manifest = JSON.parse(readFileSync(join(FIX, "fixtures.json"), "utf8"));

/** Values that differ between any two files and say nothing about extraction. */
const VOLATILE = [
  /\/provenance\//, /\/inputHash$/, /\/generatedAt$/, /\/resolverVersion$/,
  /\/loc\/file$/, /\/files\//, /\/unit\/id$/, /\/unit\/path$/, /\/unitId$/,
  /\/templateFile$/, /\/manifest\//, /\/warnings/,
];

function flatten(o, path = "", out = {}) {
  if (o === null || typeof o !== "object") { out[path] = o; return out; }
  if (Array.isArray(o)) { o.forEach((v, i) => flatten(v, `${path}/${i}`, out)); return out; }
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("$comment")) continue;
    flatten(v, `${path}/${k}`, out);
  }
  return out;
}

function runResolver(memberDir) {
  const entry = readdirSync(memberDir).find((f) => f.endsWith(".component.ts"));
  if (!entry) return null;
  const out = mkdtempSync(join(tmpdir(), "c2d-golden-"));
  try {
    execFileSync(process.execPath, [
      join(ROOT, "tools", "resolve.mjs"), join(memberDir, entry),
      "--unit-path", `fixtures/${memberDir.split("/").pop()}`, "--out", out,
    ], { stdio: ["ignore", "ignore", "pipe"] });
    const tiers = {};
    for (const t of TIERS) {
      const p = join(out, `${t}.json`);
      if (existsSync(p)) tiers[t] = JSON.parse(readFileSync(p, "utf8"));
    }
    return tiers;
  } finally { rmSync(out, { recursive: true, force: true }); }
}

let problems = 0, checkedGoldens = 0, wrote = 0;

// ---------------------------------------------------------------- 1. regression
console.log(UPDATE ? "regenerating goldens\n" : "checking goldens\n");
const produced = new Map();

for (const f of manifest.fixtures) {
  for (const member of f.pair) {
    const dir = join(FIX, member);
    if (!existsSync(dir)) { console.error(`FAIL  ${f.id}: member '${member}' is not on disk`); problems++; continue; }
    const tiers = runResolver(dir);
    if (!tiers) { console.error(`FAIL  ${member}: no *.component.ts to run`); problems++; continue; }
    produced.set(member, tiers);

    for (const [tier, data] of Object.entries(tiers)) {
      const gp = join(dir, `expected.${tier}.json`);
      const validate = ajv.getSchema(`${tier}.schema.json`);
      if (!validate(data)) {
        console.error(`FAIL  ${member}/${tier}: extractor output is not a valid ${tier} instance`);
        for (const e of validate.errors.slice(0, 3)) console.error(`        ${e.instancePath} ${e.message}`);
        problems++;
        continue;
      }
      if (UPDATE) { writeFileSync(gp, JSON.stringify(data, null, 2) + "\n"); wrote++; continue; }
      if (!existsSync(gp)) { console.error(`FAIL  ${member}: no golden for ${tier} -- run with --update`); problems++; continue; }
      checkedGoldens++;
      const a = flatten(JSON.parse(readFileSync(gp, "utf8"))), b = flatten(data);
      const diffs = [...new Set([...Object.keys(a), ...Object.keys(b)])]
        .filter((k) => !VOLATILE.some((r) => r.test(k)))
        .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      if (diffs.length) {
        problems++;
        console.error(`FAIL  ${member}/${tier}: ${diffs.length} field(s) differ from golden`);
        for (const d of diffs.slice(0, 5)) console.error(`        ${d}: golden ${JSON.stringify(a[d])} -> now ${JSON.stringify(b[d])}`);
      }
    }
  }
}

/**
 * Semantic projections -- small, order-independent, keyed by name.
 *
 * The pair check compares these rather than deep-diffing paths. Two different
 * source files legitimately differ in array order, ids, line numbers and
 * expression text, so a path diff is mostly noise -- and the only way to quiet
 * the noise is broad exclusions, which is how the previous attempt ended up
 * deriving its own expectations from the output it was meant to judge.
 *
 * Every projection below answers a question `fixtures.json#/fixtures/mustExtract`
 * already asks in prose. Those assertions were written before the extractor
 * existed, which is what makes them a specification rather than a description.
 */
const PROJECTIONS = {
  inputs: (t) => (t.signature?.publicApi?.inputs ?? [])
    .map((i) => `${i.name} required=${!!i.required} alias=${i.alias ?? "-"}`).sort(),
  outputs: (t) => (t.signature?.publicApi?.outputs ?? [])
    .map((o) => `${o.name}:${o.payloadType}`).sort(),
  twoWay: (t) => (t.signature?.publicApi?.twoWayBindings ?? []).map((x) => x.name).sort(),
  publicMethods: (t) => (t.signature?.publicApi?.publicMethods ?? []).slice().sort(),

  deps: (t) => (t.signature?.injectedDependencies ?? [])
    .map((d) => `${d.propertyName}:${d.token} ${d.visibility} ` +
      Object.entries(d.modifiers ?? {}).filter(([, v]) => v).map(([k]) => k).sort().join(",")).sort(),
  lifecycleHooks: (t) => (t.signature?.lifecycle?.implementedHooks ?? []).slice().sort(),
  fields: (t) => (t.signature?.stateOutline?.fields ?? [])
    .map((f) => `${f.name} ${f.visibility}`).sort(),

  callEdges: (t) => Object.entries(t.dependencies?.callGraph?.calls ?? {})
    .flatMap(([from, tos]) => tos.map((to) => `${from} -> ${to}`)).sort(),
  fieldWrites: (t) => Object.entries(t.dependencies?.fieldAccess?.writes ?? {})
    .flatMap(([m, fs]) => fs.map((f) => `${m} writes ${f}`)).sort(),
  unreachable: (t) => (t.dependencies?.callGraph?.unreachableMethods ?? []).slice().sort(),

  // *ngIf and @if are the same question asked twice; the class is what must match
  controlFlowPrimary: (t) => {
    const cls = { "@if": "conditional", "*ngIf": "conditional", "@for": "loop",
      "*ngFor": "loop", "@switch": "switch", ngSwitch: "switch", "@defer": "defer" };
    const n = {};
    for (const c of t.template?.ast?.controlFlow ?? []) {
      const k = cls[c.construct];
      if (k) n[k] = (n[k] ?? 0) + 1;
    }
    return Object.entries(n).map(([k, v]) => `${k}=${v}`).sort();
  },
  controlFlowBranches: (t) => {
    const br = { "@else": "else", "@else if": "else", "@case": "case", "*ngSwitchCase": "case",
      "@default": "default", "*ngSwitchDefault": "default", "@empty": "empty" };
    const n = {};
    for (const c of t.template?.ast?.controlFlow ?? []) {
      const k = br[c.construct];
      if (k) n[k] = (n[k] ?? 0) + 1;
    }
    return Object.entries(n).map(([k, v]) => `${k}=${v}`).sort();
  },
  loopTracking: (t) => (t.template?.ast?.controlFlow ?? [])
    .filter((c) => /for/i.test(c.construct)).map((c) => (c.trackBy ? "tracked" : "untracked")).sort(),
  templateHandlers: (t) => (t.template?.ast?.eventBindings ?? [])
    .map((e) => `${e.event} -> ${e.handlerMethod ?? "?"}`).sort(),
  pipes: (t) => (t.template?.ast?.pipesUsed ?? []).map((p) => p.name).sort(),
  elementTags: (t) => (t.template?.ast?.elements ?? []).map((e) => e.tag).sort(),

  formApproach: (t) => [t.functions?.forms?.approach ?? "none"],
  formConstraints: (t) => (t.functions?.forms?.groups ?? [])
    .flatMap((g) => g.controls.map((c) =>
      `${c.path} [${c.syncValidators.join(",")}]${c.disabledExpression ? " disabled" : ""}`)).sort(),

  // the teardown pair's real assertion: neither leaks, by different means
  leakRisk: (t) => {
    const subs = Object.values(t.functions?.symbols ?? {})
      .flatMap((s) => s.ast?.subscriptions ?? []);
    return subs.map((s) =>
      s.unsubscribeStrategy && s.unsubscribeStrategy !== "none" ? "none" : "possible").sort();
  },
  testTitles: (t) => (t.functions?.tests?.cases ?? []).map((c) => c.title).sort(),
};

// ----------------------------------------------------------- 2. pair equivalence
console.log(`\n${UPDATE ? "wrote " + wrote + " golden(s)" : checkedGoldens + " golden(s) checked"}\n`);
console.log("pair equivalence\n");

let unchecked = 0;
for (const f of manifest.fixtures) {
  const [x, y] = f.pair.map((m) => produced.get(m));
  if (!x || !y) continue;
  const eq = f.equivalence ?? {};

  if (eq.mode === "assertions-only") {
    unchecked++;
    console.log(`  --  ${f.id.padEnd(14)} NOT CHECKED -- ${eq.note ?? "field equivalence does not apply"}`);
    continue;
  }

  const mayDiffer = new Set(eq.mayDiffer ?? []);
  const found = [];
  for (const [name, project] of Object.entries(PROJECTIONS)) {
    if (mayDiffer.has(name)) continue;
    const a = JSON.stringify(project(x)), b = JSON.stringify(project(y));
    if (a !== b) found.push(`${name}: ${a} vs ${b}`);
  }
  if (found.length) {
    problems++;
    console.error(`FAIL  ${f.id}: ${found.length} projection(s) differ between ${f.pair[0]} and ${f.pair[1]}`);
    for (const d of found) console.error(`        ${d}`);
  } else {
    const n = Object.keys(PROJECTIONS).length - mayDiffer.size;
    console.log(`  ok  ${f.id.padEnd(14)} ${n} projection(s) match, ${mayDiffer.size} declared different`);
  }
}

if (unchecked) console.log(`
${unchecked} pair(s) not field-checked -- their assertions are human-verified only`);

// ------------------------------------------------- 3. what the extractors admit
//
// Every recorded gap is surfaced here, because a warning that lives only inside a
// JSON file nobody opens is barely better than no warning. recall-gap especially:
// it is the ONE signal goldens structurally cannot produce, since a golden is
// written from the output it judges -- an extractor that always missed a
// construct has a stable, passing golden forever, and only the second count
// notices.
//
// These are reported, never counted as problems. A gap that the fixtures are
// meant to record (i18n-icu asserts an unhandled node) is expected output.
{
  const byCode = new Map();
  for (const [member, tiers] of produced) {
    for (const [tier, data] of Object.entries(tiers)) {
      for (const w of data?.provenance?.warnings ?? []) {
        if (w.severity === "info") continue;
        const k = w.code;
        if (!byCode.has(k)) byCode.set(k, []);
        byCode.get(k).push(`${member}/${tier}`);
      }
    }
  }
  if (byCode.size) {
    console.log("\nrecorded gaps (reported, not failures)\n");
    for (const [code, where] of [...byCode].sort()) {
      const flag = code === "recall-gap" ? "  <-- extractor recall; investigate" : "";
      console.log(`  ${code.padEnd(26)} ${where.length} tier(s)${flag}`);
      if (code === "recall-gap") for (const w of where) console.log(`      ${w}`);
    }
  }
}
console.log(`
${problems} problem(s)`);
process.exit(problems > 0 ? 1 : 0);
