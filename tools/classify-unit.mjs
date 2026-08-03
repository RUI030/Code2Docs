#!/usr/bin/env node
/**
 * Deterministic unit tier classifier (D17).
 *
 *   node tools/classify-unit.mjs <outputDir>   — prints tier to stdout
 *
 * Returns one of three tiers based solely on Resolver output:
 *
 *   trivial  — pure presentational; no Synthesizer or Explainer needed
 *   standard — full pipeline, no Explainer
 *   complex  — full pipeline + Explainer (calibrated D8, 2026-08-02)
 *
 * Thresholds are defined once here. orchestrator.md and run.mjs import this
 * module rather than re-stating the numbers (D15).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// ── Thresholds ────────────────────────────────────────────────────────────────

/** A unit is complex if EITHER condition holds (calibrated D8 2026-08-02). */
const COMPLEX_LINE_THRESHOLD = 200;
const COMPLEX_METHOD_THRESHOLD = 10;

/** A unit is trivial if ALL conditions hold. */
const TRIVIAL_MAX_METHODS = 3;

// ── Core classifier ───────────────────────────────────────────────────────────

/**
 * Classify a unit from its already-parsed tier data.
 *
 * @param {object} sig  - parsed signature.json
 * @param {object} deps - parsed dependencies.json
 * @returns {"trivial"|"standard"|"complex"}
 */
export function classifyUnit(sig, deps) {
  const m = sig.metrics ?? {};
  const so = sig.stateOutline ?? {};

  // Complex gate (D8): either condition triggers staged path
  if (
    (m.tsLineCount ?? 0) > COMPLEX_LINE_THRESHOLD ||
    (m.methodCount ?? 0) > COMPLEX_METHOD_THRESHOLD
  ) {
    return "complex";
  }

  // Trivial gate: pure presentational — no LLM needed at all
  const hasForms = Array.isArray(so.formIds) && so.formIds.length > 0;
  const hasStreams = Array.isArray(so.streamIds) && so.streamIds.length > 0;
  const hasHttp =
    Array.isArray(deps?.httpInteractions) && deps.httpInteractions.length > 0;
  const fewMethods = (m.methodCount ?? 0) <= TRIVIAL_MAX_METHODS;

  // A unit that actively calls methods on an injected service is orchestrating
  // behaviour, not just rendering — even if HTTP is indirect (via the service).
  const callsService = Array.isArray(deps?.dependencyUsage) &&
    deps.dependencyUsage.some(
      d => Array.isArray(d.calledMembers) && d.calledMembers.length > 0
    );

  if (!hasForms && !hasStreams && !hasHttp && !callsService && fewMethods) {
    return "trivial";
  }

  return "standard";
}

/**
 * Read signature.json and dependencies.json from outputDir and return the tier.
 *
 * @param {string} outputDir
 * @returns {"trivial"|"standard"|"complex"}
 */
export function classifyDir(outputDir) {
  const sig = JSON.parse(
    readFileSync(join(outputDir, "signature.json"), "utf8")
  );
  const deps = JSON.parse(
    readFileSync(join(outputDir, "dependencies.json"), "utf8")
  );
  return classifyUnit(sig, deps);
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const outputDir = process.argv[2];
  if (!outputDir) {
    console.error("Usage: node tools/classify-unit.mjs <outputDir>");
    process.exit(1);
  }
  try {
    console.log(classifyDir(outputDir));
  } catch (err) {
    console.error(`classify-unit: ${err.message}`);
    process.exit(1);
  }
}
