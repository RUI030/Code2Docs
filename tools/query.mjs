#!/usr/bin/env node
/**
 * Query the extracted tiers by id, without loading them into a reader's context.
 *
 *   npm run q -- <unit-dir> refs   method:save
 *   npm run q -- <unit-dir> calls  method:save
 *   npm run q -- <unit-dir> reads  field:isSaving
 *   npm run q -- <unit-dir> symbol method:save
 *   npm run q -- <unit-dir> node   tpl:12
 *   npm run q -- <unit-dir> outline
 *   npm run q -- <unit-dir> where  <substring>
 *
 * Why this exists. D2's goal is an IDE-like surface where "loading" is paid in
 * context tokens, so every irrelevant field in an opened file is waste. The
 * tiers gave us the index and no way to ask it: answering "what calls save()?"
 * meant reading 16KB of dependencies.json to retrieve a 4-byte answer.
 *
 * Each verb below is a pure function of (unit, id) returning the smallest true
 * answer. They are written to be liftable into tool definitions later -- the
 * intended end state is an agent calling these rather than reading files, so
 * the CLI is the shape of that surface rather than a substitute for it.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const TIERS = ["signature", "dependencies", "functions", "template", "analysis"];

function load(dir) {
  const t = {};
  for (const name of TIERS) {
    const p = join(dir, `${name}.json`);
    if (existsSync(p)) t[name] = JSON.parse(readFileSync(p, "utf8"));
  }
  if (!Object.keys(t).length) throw new Error(`no tier files in ${dir}`);
  return t;
}

/** Where an id is defined, so an answer can point at source rather than restate it. */
function locate(t, id) {
  const s = t.signature, f = t.functions, tpl = t.template;
  const inSig = [
    ...(s?.publicApi?.inputs ?? []), ...(s?.publicApi?.outputs ?? []),
    ...(s?.injectedDependencies ?? []), ...(s?.stateOutline?.fields ?? []),
  ].find((x) => x.id === id);
  if (inSig?.loc) return inSig.loc;
  if (f?.symbols?.[id]?.ast?.loc) return f.symbols[id].ast.loc;
  for (const group of Object.values(tpl?.ast ?? {})) {
    if (Array.isArray(group)) {
      const hit = group.find((n) => n?.id === id);
      if (hit?.loc) return hit.loc;
    }
  }
  return null;
}
const at = (l) => (l ? `${l.file}:${l.line}` : "");

const VERBS = {
  /** Everything that calls or reads this id -- methods, template nodes, initializers. */
  refs(t, id) {
    const d = t.dependencies ?? {};
    const out = [
      ...(d.callGraph?.calledBy?.[id] ?? []).map((x) => ({ kind: "calls", from: x })),
      ...(d.fieldAccess?.readBy?.[id] ?? []).map((x) => ({ kind: "reads", from: x })),
      ...(d.fieldAccess?.writtenBy?.[id] ?? []).map((x) => ({ kind: "writes", from: x })),
    ];
    for (const u of d.dependencyUsage ?? []) {
      if (u.dep !== id) continue;
      for (const m of u.calledMembers ?? [])
        for (const fm of m.fromMethods ?? []) out.push({ kind: `calls .${m.member}()`, from: fm });
    }
    return out;
  },
  /** What this id calls. */
  calls(t, id) {
    return (t.dependencies?.callGraph?.calls?.[id] ?? []).map((x) => ({ kind: "calls", to: x }));
  },
  /** Fields this id reads and writes. */
  reads(t, id) {
    const fa = t.dependencies?.fieldAccess ?? {};
    return [
      ...(fa.reads?.[id] ?? []).map((x) => ({ kind: "reads", to: x })),
      ...(fa.writes?.[id] ?? []).map((x) => ({ kind: "writes", to: x })),
    ];
  },
  /** One symbol's ast, without its siblings. */
  symbol(t, id) {
    const s = t.functions?.symbols?.[id];
    if (!s) return null;
    const { sourceExcerpt, ...rest } = s.ast;
    return { ...rest, doc: s.doc ?? null };
  },
  /** One template node, from whichever bucket holds it. */
  node(t, id) {
    for (const [bucket, group] of Object.entries(t.template?.ast ?? {})) {
      if (Array.isArray(group)) {
        const hit = group.find((n) => n?.id === id);
        if (hit) return { bucket, ...hit };
      }
    }
    return null;
  },
  /** The cheapest orientation: what is here, and what is worth asking about. */
  outline(t) {
    const s = t.signature, d = t.dependencies;
    return {
      unit: s?.unit?.id,
      kind: s?.unit?.kind,
      entryPoints: d?.callGraph?.entryPoints ?? [],
      unreachable: d?.callGraph?.unreachableMethods ?? [],
      publicApi: {
        inputs: (s?.publicApi?.inputs ?? []).map((i) => i.id),
        outputs: (s?.publicApi?.outputs ?? []).map((o) => o.id),
        methods: s?.publicApi?.publicMethods ?? [],
      },
      dependencies: (s?.injectedDependencies ?? []).map((x) => `${x.id} (${x.token})`),
      counts: {
        methods: s?.stateOutline?.methodIds?.length ?? 0,
        fields: s?.stateOutline?.fields?.length ?? 0,
        templateNodes: t.template?.coverage?.nodesTotal ?? 0,
        tests: t.functions?.tests?.cases?.length ?? 0,
      },
    };
  },
  /** Find an id without knowing its exact spelling. */
  where(t, needle) {
    const hits = new Set();
    const walk = (o) => {
      if (typeof o === "string") { if (o.includes(needle)) hits.add(o); return; }
      if (Array.isArray(o)) return o.forEach(walk);
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { walk(k); walk(v); }
    };
    walk(t);
    return [...hits].filter((h) => /^[a-z-]+:/.test(h)).sort();
  },
};

const [dir, verb, arg] = process.argv.slice(2);
if (!dir || !verb || !VERBS[verb]) {
  console.error(`usage: npm run q -- <unit-dir> <${Object.keys(VERBS).join("|")}> [id]`);
  process.exit(2);
}
const tiers = load(dir);
const result = VERBS[verb](tiers, arg);

if (result === null) { console.log(`${arg}: not found`); process.exit(1); }
if (Array.isArray(result)) {
  if (!result.length) { console.log(`${arg}: no results`); process.exit(0); }
  for (const r of result) {
    const target = r.from ?? r.to ?? r;
    const l = at(locate(tiers, target));
    console.log(typeof r === "string" ? r : `${r.kind.padEnd(16)} ${target}${l ? "   " + l : ""}`);
  }
} else {
  console.log(JSON.stringify(result, null, 2));
}
