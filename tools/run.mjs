#!/usr/bin/env node
/**
 * Code2Docs batch runner (Phase 6).
 *
 *   node tools/run.mjs [options] <srcRoot>
 *
 * Options:
 *   --out <dir>          Output root (default: OUTPUT/)
 *   --concurrency <n>    Max parallel units (default: 4)
 *   --resume             Skip units already completed in run-manifest.json
 *   --dry-run            Classify and plan steps; do not execute
 *   --units <ids>        Comma-separated unit ids to process (subset run)
 *
 * Pipeline per unit (determined by classify-unit.mjs, D17):
 *
 *   trivial  → resolve → render-trivial
 *   standard → resolve → synthesize → validate → integrity-check → render
 *   complex  → resolve → explain → synthesize → validate → integrity-check → render
 *
 * A unit whose tsLineCount > DEGRADE_LINE_THRESHOLD (D18, TBD) gets a
 * degraded path: resolve + explain only. No synthesizer call.
 *
 * Features:
 *   - Content-hash cache: skip re-extraction on unchanged source files
 *   - Run manifest: per-unit status written after each step; crash-safe resume
 *   - Parallelism: index processingOrder gives the topo-sorted batches
 *   - Run summary: written to OUTPUT/run-summary.json on completion
 */

import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync,
} from "node:fs";
import { join, relative, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync, spawnSync } from "node:child_process";
import { classifyUnit } from "./classify-unit.mjs";
import { ROOT } from "./tiers.mjs";

// ── Thresholds (D18 placeholder — recalibrate after first corpus run) ─────────

const DEGRADE_LINE_THRESHOLD = 800;
const DEGRADE_METHOD_THRESHOLD = 40;

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    srcRoot: null,
    outRoot: join(ROOT, "OUTPUT"),
    concurrency: 4,
    resume: false,
    dryRun: false,
    unitFilter: null,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--out") args.outRoot = resolvePath(rest[++i]);
    else if (a === "--concurrency") args.concurrency = Number(rest[++i]);
    else if (a === "--resume") args.resume = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--units") args.unitFilter = new Set(rest[++i].split(","));
    else if (!a.startsWith("--")) args.srcRoot = resolvePath(a);
  }
  return args;
}

// ── Content-hash cache ────────────────────────────────────────────────────────

function hashFiles(paths) {
  const h = createHash("sha256");
  for (const p of paths.sort()) {
    if (!existsSync(p)) continue;
    h.update(p);
    h.update(readFileSync(p));
  }
  return h.digest("hex");
}

function readCache(unitOutDir) {
  const p = join(unitOutDir, ".cache.json");
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch { return null; }
}

function writeCache(unitOutDir, hash, tier) {
  writeFileSync(
    join(unitOutDir, ".cache.json"),
    JSON.stringify({ hash, tier, cachedAt: new Date().toISOString() }, null, 2)
  );
}

function tierFilesComplete(unitOutDir, tier) {
  const required = ["signature.json", "dependencies.json", "functions.json", "template.json"];
  if (tier !== "trivial") required.push("analysis.json", "requirement.md");
  return required.every(f => existsSync(join(unitOutDir, f)));
}

// ── Run manifest ──────────────────────────────────────────────────────────────

function manifestPath(outRoot) {
  return join(outRoot, "run-manifest.json");
}

function loadManifest(outRoot) {
  try { return JSON.parse(readFileSync(manifestPath(outRoot), "utf8")); }
  catch { return {}; }
}

function saveManifestEntry(outRoot, unitId, entry) {
  const manifest = loadManifest(outRoot);
  manifest[unitId] = { ...manifest[unitId], ...entry, updatedAt: new Date().toISOString() };
  writeFileSync(manifestPath(outRoot), JSON.stringify(manifest, null, 2));
}

// ── Step execution ────────────────────────────────────────────────────────────

function run(cmd, args, { label, unitId, outRoot } = {}) {
  const result = spawnSync(process.execPath, [cmd, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim().slice(0, 400);
    throw new Error(`[${label}] exited ${result.status}: ${err}`);
  }
  return result.stdout.trim();
}

const TOOLS = join(ROOT, "tools");

function stepsForTier(tier, unitFile, unitOutDir, unit) {
  const base = [
    {
      name: "resolve",
      run: () => run(
        join(TOOLS, "resolve.mjs"),
        [unitFile, "--out", unitOutDir, "--unit-path", unit.path],
        { label: "resolve" }
      ),
    },
  ];

  if (tier === "trivial") {
    base.push({
      name: "render-trivial",
      run: () => run(
        join(TOOLS, "render-trivial.mjs"),
        [unitOutDir],
        { label: "render-trivial" }
      ),
    });
    return base;
  }

  if (tier === "complex") {
    base.push({
      name: "explain",
      run: () => {
        // Explainer is an LLM agent — invoked via Claude Code subagent.
        // The runner spawns it with the Agent tool protocol. For Phase 6,
        // we shell out to a thin wrapper that starts the agent session.
        throw new Error(
          "explain step requires Agent invocation — use /code2docs-pipeline for individual complex units, or integrate agent runner in Phase 6b"
        );
      },
    });
  }

  base.push(
    {
      name: "synthesize",
      run: () => {
        throw new Error(
          "synthesize step requires Agent invocation — use /code2docs-pipeline for individual units"
        );
      },
    },
    {
      name: "validate",
      run: () => run(
        join(TOOLS, "validate.mjs"),
        [join(unitOutDir, "analysis.json")],
        { label: "validate" }
      ),
    },
    {
      name: "integrity-check",
      run: () => run(
        join(TOOLS, "check-integrity.mjs"),
        [unitOutDir],
        { label: "integrity-check" }
      ),
    },
    {
      name: "render",
      run: () => run(
        join(TOOLS, "render.mjs"),
        [unitOutDir],
        { label: "render" }
      ),
    }
  );

  return base;
}

// ── Degraded path check ───────────────────────────────────────────────────────

function isOversized(sig) {
  const m = sig?.metrics ?? {};
  return (
    (m.tsLineCount ?? 0) > DEGRADE_LINE_THRESHOLD ||
    (m.methodCount ?? 0) > DEGRADE_METHOD_THRESHOLD
  );
}

// ── Process one unit ──────────────────────────────────────────────────────────

async function processUnit(unit, { srcRoot, outRoot, dryRun, manifest }) {
  const unitId = unit.id;
  const unitFile = resolvePath(srcRoot, unit.path, unit.files.typescript);
  const unitOutDir = join(outRoot, unit.path);

  mkdirSync(unitOutDir, { recursive: true });

  // Resume: skip already-completed units
  if (manifest[unitId]?.status === "completed" || manifest[unitId]?.status === "cached") {
    return { unitId, status: manifest[unitId].status, tier: manifest[unitId].tier };
  }

  // Content-hash cache check
  const sourceFiles = Object.values(unit.files).filter(Boolean).map(f => resolvePath(srcRoot, unit.path, f));
  const hash = hashFiles(sourceFiles);
  const cached = readCache(unitOutDir);

  if (cached?.hash === hash && tierFilesComplete(unitOutDir, cached.tier)) {
    saveManifestEntry(outRoot, unitId, { status: "cached", tier: cached.tier, unitPath: unit.path });
    return { unitId, status: "cached", tier: cached.tier };
  }

  // Classify
  let tier;
  let degraded = false;

  // Try to classify from existing tiers if resolve already ran; otherwise classify after resolve
  const sigPath = join(unitOutDir, "signature.json");
  const depsPath = join(unitOutDir, "dependencies.json");

  if (existsSync(sigPath) && existsSync(depsPath)) {
    const sig = JSON.parse(readFileSync(sigPath, "utf8"));
    const deps = JSON.parse(readFileSync(depsPath, "utf8"));
    tier = classifyUnit(sig, deps);
    degraded = isOversized(sig);
  } else {
    // Will classify after resolve step
    tier = null;
  }

  const initialEntry = { status: "pending", unitPath: unit.path, tier: tier ?? "unknown" };
  saveManifestEntry(outRoot, unitId, initialEntry);

  if (dryRun) {
    return { unitId, status: "dry-run", tier: tier ?? "unknown", degraded };
  }

  // Run steps
  let resolvedTier = tier;
  const steps = tier ? stepsForTier(tier, unitFile, unitOutDir, unit) : null;

  // If no tier yet, run resolve first, then classify, then build remaining steps
  if (!steps) {
    try {
      run(join(TOOLS, "resolve.mjs"), [unitFile, "--out", unitOutDir, "--unit-path", unit.path], { label: "resolve" });
      saveManifestEntry(outRoot, unitId, { lastCompletedStep: "resolve" });

      const sig = JSON.parse(readFileSync(sigPath, "utf8"));
      const deps = JSON.parse(readFileSync(depsPath, "utf8"));
      resolvedTier = classifyUnit(sig, deps);
      degraded = isOversized(sig);
      saveManifestEntry(outRoot, unitId, { tier: resolvedTier });

      const remainingSteps = stepsForTier(resolvedTier, unitFile, unitOutDir, unit).slice(1);
      return await runSteps(remainingSteps, { unitId, outRoot, resolvedTier, degraded, hash, sourceFiles });
    } catch (err) {
      saveManifestEntry(outRoot, unitId, { status: "failed", failedStep: "resolve", error: err.message });
      return { unitId, status: "failed", tier: "unknown", error: err.message };
    }
  }

  return await runSteps(steps, { unitId, outRoot, resolvedTier: tier, degraded, hash, sourceFiles });
}

async function runSteps(steps, { unitId, outRoot, resolvedTier, degraded, hash, sourceFiles }) {
  if (degraded) {
    // Degraded: only run resolve (already done) and stop
    saveManifestEntry(outRoot, unitId, { status: "degraded", tier: resolvedTier });
    return { unitId, status: "degraded", tier: resolvedTier };
  }

  for (const step of steps) {
    try {
      saveManifestEntry(outRoot, unitId, { currentStep: step.name });
      step.run();
      saveManifestEntry(outRoot, unitId, { lastCompletedStep: step.name });
    } catch (err) {
      // LLM steps are deferred — mark as pending-agent rather than failed
      if (err.message.includes("requires Agent invocation")) {
        saveManifestEntry(outRoot, unitId, {
          status: "pending-agent",
          pendingStep: step.name,
          tier: resolvedTier,
        });
        return { unitId, status: "pending-agent", tier: resolvedTier, pendingStep: step.name };
      }
      saveManifestEntry(outRoot, unitId, {
        status: "failed",
        failedStep: step.name,
        error: err.message,
        tier: resolvedTier,
      });
      return { unitId, status: "failed", tier: resolvedTier, error: err.message };
    }
  }

  // unitOutDir is passed implicitly through the steps closure; use manifest to find path
  const unitManifest = loadManifest(outRoot);
  const unitPath = unitManifest[unitId]?.unitPath ?? unitId.split(":").slice(1).join("/");
  writeCache(join(outRoot, unitPath), hash, resolvedTier);
  saveManifestEntry(outRoot, unitId, { status: "completed", tier: resolvedTier });
  return { unitId, status: "completed", tier: resolvedTier };
}

// ── Topological batching ──────────────────────────────────────────────────────

/**
 * Split processingOrder into batches of independent units.
 * Units within a batch have no edges between each other; batches run sequentially.
 * Within a batch, units run in parallel up to concurrency limit.
 */
function buildBatches(processingOrder, dependencyEdges, unitFilter) {
  // processingOrder is already leaf-first from ng-index; convert to parallel batches
  // by grouping units whose dependencies are all in earlier batches.
  const edgeMap = new Map(); // id → Set of ids it depends on
  for (const { from, to } of (dependencyEdges ?? [])) {
    if (!edgeMap.has(from)) edgeMap.set(from, new Set());
    edgeMap.get(from).add(to);
  }

  const assigned = new Map(); // id → batch index
  const batches = [];

  for (const id of processingOrder) {
    if (unitFilter && !unitFilter.has(id)) continue;
    const deps = edgeMap.get(id) ?? new Set();
    // Place in the first batch after all dependencies
    let batchIdx = 0;
    for (const dep of deps) {
      const d = assigned.get(dep);
      if (d !== undefined) batchIdx = Math.max(batchIdx, d + 1);
    }
    if (!batches[batchIdx]) batches[batchIdx] = [];
    batches[batchIdx].push(id);
    assigned.set(id, batchIdx);
  }

  return batches;
}

// ── Run summary ───────────────────────────────────────────────────────────────

function writeSummary(outRoot, results, startMs) {
  const elapsed = Date.now() - startMs;
  const byStatus = {};
  const byTier = {};

  for (const r of results) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (r.tier) byTier[r.tier] = (byTier[r.tier] ?? 0) + 1;
  }

  // Aggregate open questions and risks from completed units
  let blockingQuestions = 0;
  let nonBlockingQuestions = 0;
  const risksBySeverity = { high: 0, medium: 0, low: 0 };

  for (const r of results) {
    if (r.status !== "completed") continue;
    const manifest2 = loadManifest(outRoot);
    const unitPath2 = manifest2[r.unitId]?.unitPath ?? r.unitId.split(":").slice(1).join("/");
    const analysisPath = join(outRoot, unitPath2, "analysis.json");
    try {
      const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
      for (const q of analysis.openQuestions ?? []) {
        if (q.blocking) blockingQuestions++;
        else nonBlockingQuestions++;
      }
      for (const risk of analysis.migration?.risks ?? []) {
        const sev = (risk.severity ?? "low").toLowerCase();
        if (sev in risksBySeverity) risksBySeverity[sev]++;
      }
    } catch { /* unit may be trivial (no analysis.json) or failed */ }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedMs: elapsed,
    totalUnits: results.length,
    byStatus,
    byTier,
    openQuestions: { blocking: blockingQuestions, nonBlocking: nonBlockingQuestions },
    risksBySeverity,
  };

  writeFileSync(join(outRoot, "run-summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}

function printSummary(summary) {
  const { totalUnits, byStatus, byTier, openQuestions, risksBySeverity, elapsedMs } = summary;
  console.log("\n── Run summary ──────────────────────────────────────────");
  console.log(`  Units:     ${totalUnits}`);
  console.log(`  By status: ${JSON.stringify(byStatus)}`);
  console.log(`  By tier:   ${JSON.stringify(byTier)}`);
  console.log(`  Questions: ${openQuestions.blocking} blocking, ${openQuestions.nonBlocking} non-blocking`);
  console.log(`  Risks:     ${JSON.stringify(risksBySeverity)}`);
  console.log(`  Elapsed:   ${(elapsedMs / 1000).toFixed(1)}s`);
  console.log("─────────────────────────────────────────────────────────\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (!args.srcRoot) {
    console.error("Usage: node tools/run.mjs [--options] <srcRoot>");
    process.exit(1);
  }

  const startMs = Date.now();
  mkdirSync(args.outRoot, { recursive: true });

  // Build or load index — rebuild if srcRoot changed
  const indexPath = join(args.outRoot, "index.json");
  let index;
  const needsIndex = (() => {
    if (!existsSync(indexPath)) return true;
    try {
      const existing = JSON.parse(readFileSync(indexPath, "utf8"));
      const storedRoot = resolvePath(args.outRoot, existing.srcRoot ?? ".");
      return storedRoot !== args.srcRoot;
    } catch { return true; }
  })();
  if (needsIndex) {
    console.log(`Building index for ${args.srcRoot} ...`);
    run(join(TOOLS, "resolve.mjs"), ["index", args.srcRoot, "--out", args.outRoot], { label: "index" });
  }
  index = JSON.parse(readFileSync(indexPath, "utf8"));

  const unitMap = new Map(index.units.map(u => [u.id, u]));
  const manifest = args.resume ? loadManifest(args.outRoot) : {};

  // Build parallel batches from topo order
  const batches = buildBatches(
    index.processingOrder,
    index.dependencyEdges,
    args.unitFilter
  );

  const allResults = [];
  let batchNum = 0;

  for (const batch of batches) {
    batchNum++;
    if (batch.length === 0) continue;
    console.log(`\nBatch ${batchNum}/${batches.length}: ${batch.length} unit(s)`);

    // Run up to concurrency units in parallel within each batch
    const chunks = [];
    for (let i = 0; i < batch.length; i += args.concurrency) {
      chunks.push(batch.slice(i, i + args.concurrency));
    }

    for (const chunk of chunks) {
      const results = await Promise.all(
        chunk.map(unitId => {
          const unit = unitMap.get(unitId);
          if (!unit) {
            console.warn(`  ! unit ${unitId} not found in index, skipping`);
            return Promise.resolve({ unitId, status: "skipped", tier: "unknown" });
          }
          process.stdout.write(`  ${unitId} ... `);
          return processUnit(unit, {
            srcRoot: args.srcRoot,
            outRoot: args.outRoot,
            dryRun: args.dryRun,
            manifest,
          }).then(r => {
            console.log(r.status + (r.tier ? ` (${r.tier})` : ""));
            return r;
          }).catch(err => {
            console.log(`ERROR: ${err.message}`);
            return { unitId, status: "failed", tier: "unknown", error: err.message };
          });
        })
      );
      allResults.push(...results);
    }
  }

  const summary = writeSummary(args.outRoot, allResults, startMs);
  printSummary(summary);

  const failed = allResults.filter(r => r.status === "failed").length;
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("run.mjs fatal:", err.message);
  process.exit(1);
});
