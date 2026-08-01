#!/usr/bin/env node
/**
 * Cross-tier referential integrity.
 *
 *   npm run check -- <unit-dir...>    check specific unit folders
 *   npm run check                     check every unit folder under examples/
 *
 * Enforces the invariant the whole tier split rests on: the five files are one
 * dataset with one id space, so every id referenced in one tier must exist in
 * the tier that owns it. Schema validation cannot see this -- it checks one
 * file at a time, and a dangling id is well-formed.
 *
 * Dangling evidence is a hard failure, not a warning: a claim citing an id that
 * does not exist is indistinguishable from an invented one.
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";import { join, relative } from "node:path";import { ROOT, ALL_TIERS as TIERS } from "./tiers.mjs";

/** Which tier owns which id prefix. An id may only be defined by its owner. */
const OWNER = {
  method: "signature", accessor: "signature", field: "signature",
  input: "signature", output: "signature", model: "signature",
  dep: "signature", form: "signature", stream: "signature",
  query: "template", tpl: "template", "tpl-handler": "template",
  hostbind: "template", hostlisten: "template",
  test: "functions", http: "dependencies", nav: "dependencies",
  type: "dependencies", "field-initializer": "signature",
};

const read = (p) => JSON.parse(readFileSync(p, "utf8"));

/**
 * The schemaVersion each tier's schema demands. A unit written against an older
 * one predates the decisions that shaped the current id space, so its dangling
 * references are a recorded property of a pinned artifact rather than a fault to
 * fix -- the Phase A baseline is exactly that, and F6 documents its six. Reported
 * either way; only current-version units can fail the build.
 */
function schemaVersions() {
  const dir = join(ROOT, "templates", "schema");
  const out = {};
  for (const n of readdirSync(dir)) {
    if (!n.endsWith(".schema.json")) continue;
    const s = JSON.parse(readFileSync(join(dir, n), "utf8"));
    const want = s?.properties?.schemaVersion?.const;
    if (want) out[n.replace(".schema.json", "")] = want;
  }
  return out;
}
const WANT = schemaVersions();
const prefixOf = (id) => String(id).split(":")[0];

/** Every id each tier *defines*. */
function declaredIds(tiers) {
  const ids = new Set();
  const add = (id) => id && typeof id === "string" && ids.add(id);

  const sig = tiers.signature;
  if (sig) {
    for (const k of ["inputs", "outputs", "twoWayBindings"])
      (sig.publicApi?.[k] ?? []).forEach((x) => add(x.id));
    (sig.injectedDependencies ?? []).forEach((d) => add(d.id));
    (sig.stateOutline?.fields ?? []).forEach((f) => {
      add(f.id);
      // a field initializer is a call site distinct from the field itself
      add(`field-initializer:${f.name}`);
    });
    for (const k of ["methodIds", "accessorIds", "formIds", "streamIds"])
      (sig.stateOutline?.[k] ?? []).forEach(add);
  }

  const dep = tiers.dependencies;
  if (dep) {
    (dep.callGraph?.nodes ?? []).forEach(add);
    (dep.httpInteractions ?? []).forEach((h) => add(h.id));
    (dep.routing?.navigations ?? []).forEach((n) => add(n.id));
    (dep.dataTypes ?? []).forEach((t) => add(t.id));
    // provisional placement -- see dependencies.schema.json
    (dep.streams ?? []).forEach((s) => add(s.id));
  }

  const fns = tiers.functions;
  if (fns) {
    Object.keys(fns.symbols ?? {}).forEach(add);
    (fns.tests?.cases ?? []).forEach((c) => add(c.id));
    (fns.forms?.groups ?? []).forEach((g) => {
      add(g.id);
      (g.controls ?? []).forEach((c) => add(c.id));
    });
    (fns.signals ?? []).forEach((s) => add(s.id));
  }

  const tpl = tiers.template;
  if (tpl?.ast) {
    for (const group of Object.values(tpl.ast)) {
      if (Array.isArray(group)) group.forEach((n) => add(n?.id));
    }
  }
  return ids;
}

/** Every (id, whereItWasCited) pair, from anywhere in any tier. */
function references(tiers) {
  const refs = [];
  const KEYS = new Set([
    "evidence", "calls", "calledBy", "reads", "writes", "readBy", "writtenBy",
    "derivedFrom", "signalDependencies", "consumes", "produces", "dependsOn",
    "consumedBy", "usedBy", "usedByMethods", "fromMethods", "targets",
    "emittedFrom", "batchedWith", "coveredMembers", "mutatingMethods",
    "entryPoints", "executionOrder", "unreachableMethods", "leafMethods",
    "occurrences", "uncoveredNodeIds", "templateReachableMembers",
    "publicMethods", "boundTo", "submitHandler", "resetHandler", "calledFrom",
    "viaDependency", "service", "dep", "resolvesTo", "coveredByExistingTest",
    "from", "to", "via", "patchedBy", "writtenBy", "derivedFrom",
  ]);

  const walk = (node, tier, path) => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, tier, `${path}[${i}]`));
      return;
    }
    if (typeof node !== "object") return;
    for (const [k, v] of Object.entries(node)) {
      const here = `${path}/${k}`;
      if (KEYS.has(k)) {
        if (typeof v === "string") refs.push({ id: v, tier, path: here });
        else if (Array.isArray(v))
          v.filter((x) => typeof x === "string").forEach((x) => refs.push({ id: x, tier, path: here }));
        else if (v && typeof v === "object")
          for (const [mk, mv] of Object.entries(v)) {
            refs.push({ id: mk, tier, path: `${here}/${mk}` });
            (Array.isArray(mv) ? mv : []).filter((x) => typeof x === "string")
              .forEach((x) => refs.push({ id: x, tier, path: `${here}/${mk}` }));
          }
      }
      if (v && typeof v === "object") walk(v, tier, here);
    }
  };

  for (const [tier, data] of Object.entries(tiers)) if (data) walk(data, tier, "");
  return refs;
}

function checkUnit(dir) {
  const tiers = {};
  const present = [];
  for (const t of TIERS) {
    const p = join(dir, `${t}.json`);
    if (existsSync(p)) { tiers[t] = read(p); present.push(t); }
  }
  if (present.length === 0) return null;
  const legacy = present.filter((t) => WANT[t] && tiers[t].schemaVersion !== WANT[t]);

  const declared = declaredIds(tiers);
  const refs = references(tiers);

  const dangling = [];
  const unowned = [];
  const unlinked = [];

  for (const r of refs) {
    const pre = prefixOf(r.id);
    if (!OWNER[pre]) {
      // a bare test title where a test:<n> was expected, or free text
      if (r.path.endsWith("coveredByExistingTest")) unlinked.push(r);
      continue;
    }
    if (declared.has(r.id)) continue;
    const owner = OWNER[pre];
    if (!present.includes(owner)) unowned.push({ ...r, owner });
    else dangling.push({ ...r, owner });
  }

  return { dir, present, legacy, declaredCount: declared.size, refCount: refs.length, dangling, unowned, unlinked };
}

function unitDirs(root) {
  const out = [];
  const walk = (d) => {
    let entries;
    try { entries = readdirSync(d); } catch { return; }
    if (entries.some((e) => /^(signature|dependencies|functions|template|analysis)\.json$/.test(e))) out.push(d);
    for (const e of entries) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
    }
  };
  walk(root);
  return out;
}

let targets = process.argv.slice(2);
if (targets.length === 0) targets = unitDirs(join(ROOT, "examples"));
if (targets.length === 0) { console.error("no unit folders found"); process.exit(2); }

let hardFailures = 0;
for (const dir of targets) {
  const r = checkUnit(dir);
  if (!r) continue;
  const label = relative(ROOT, dir) || dir;
  const bad = r.dangling.length;
  const isLegacy = r.legacy.length > 0;
  if (!isLegacy) hardFailures += bad;

  console.log(`${bad ? (isLegacy ? "legacy" : "FAIL  ") : "ok    "} ${label}` +
    (isLegacy ? `  (predates the current id space: ${r.legacy.join(", ")} at an older schemaVersion)` : ""));
  console.log(`        tiers: ${r.present.join(", ")}  |  ${r.declaredCount} ids declared, ${r.refCount} references`);

  for (const d of r.dangling)
    console.log(`        DANGLING  ${d.id}  cited at ${d.tier}${d.path}  (owner tier '${d.owner}' is present and does not define it)`);
  if (r.unowned.length) {
    const byOwner = {};
    for (const u of r.unowned) (byOwner[u.owner] ??= new Set()).add(u.id);
    for (const [owner, ids] of Object.entries(byOwner))
      console.log(`        unresolvable: ${ids.size} id(s) owned by '${owner}', which was not produced -- e.g. ${[...ids][0]}`);
  }
  if (r.unlinked.length)
    console.log(`        unlinked: ${r.unlinked.length} test reference(s) stored as a title rather than test:<n>`);
}

console.log(`\n${hardFailures} dangling reference(s) in current-version units`);
process.exit(hardFailures > 0 ? 1 : 0);
