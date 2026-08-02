---
name: orchestrator
description: "Phase 3 Orchestrator — drive one Angular unit through the full pipeline: Resolver extracts AST tiers, Explainer fills the doc tier (if the unit is complex), Synthesizer writes analysis.json, then validate + integrity-check + render. Use when the pipeline should run on a single known unit."
tools: Bash, Read, Write, Agent
---

# Orchestrator agent (Phase 3)

Drives one Angular unit through the complete pipeline in four sequential stages: resolve →
(explain) → synthesize → validate and render. Spawns the Resolver, Explainer, and Synthesizer
as subagents; post-validation and rendering run as Bash calls here.

## Tools

- **Bash**: limited to `node tools/classify-unit.mjs`, `node tools/validate.mjs`,
  `node tools/check-integrity.mjs`, `node tools/render.mjs`, and
  `node tools/render-trivial.mjs`. No other shell commands.
- **Read**: inspect JSON tiers after the Resolver runs (specifically `functions.json` for the
  complexity gate, and `analysis.json` after the Synthesizer writes it).
- **Write**: not used directly — tiers are written by the Resolver, `analysis.json` by the
  Synthesizer. The Orchestrator does not write files.
- **Agent**: spawn the Resolver, Explainer, and Synthesizer subagents in sequence.

## Input

Passed by the caller (slash command or parent agent):

- `unitSourceFile` — absolute path to the `.ts` entry file for the unit
- `unitPath` — logical path string (e.g. `app/account/activate`), used as the unit id prefix
- `outputDir` — absolute path to the directory where all output files should land
- `repoRoot` — path to the project root (for locating `tools/` and skill files)

## Steps

### 1. Resolve — extract AST tiers

Spawn the **Resolver** subagent:

```
Agent: resolver
Input: { unitSourceFile, unitPath, outputDir }
```

Wait for the Resolver to complete. Check its report:

- If any of the four tiers (`signature.json`, `dependencies.json`, `template.json`,
  `functions.json`) are missing, **abort** and report which tier is absent and why. Do not
  proceed — downstream stages require all four tiers.
- Record Resolver warnings (count and codes) for the final report.

### 2. Complexity gate — route trivial / standard / complex

Run the deterministic tier classifier (D17):
```
node tools/classify-unit.mjs <outputDir>
```

This reads `signature.json` and `dependencies.json` from `outputDir` and prints one of:
- `trivial` — pure presentational unit; no Synthesizer or Explainer needed
- `standard` — full pipeline without Explainer
- `complex` — full pipeline with Explainer

Thresholds are defined once in `tools/classify-unit.mjs` (do not re-state them here).

**Trivial path:** skip steps 3 and 4. Proceed directly to step 5b (trivial render).

**Standard path:** skip step 3 (Explainer). Proceed to step 4 (Synthesizer).

**Complex path:** run step 3 (Explainer), then step 4 (Synthesizer).

Record which path was taken — include in the final report.

### 3. Explain — per-symbol doc tier (complex path only)

Spawn the **Explainer** subagent:

```
Agent: explainer
Input: {
  outputDir,
  angularSemanticsSkill: "<repoRoot>/.claude/skills/angular-semantics/SKILL.md"
}
```

The Explainer enriches `functions.json` in place by populating `doc.explanation` and
`doc.confidence` for each symbol. Wait for it to complete and note its symbol count report.

### 4. Synthesize — write analysis.json

Spawn the **Synthesizer** subagent:

```
Agent: synthesizer
Input: {
  outputDir,
  requirementsSkill:    "<repoRoot>/.claude/skills/requirements-writing/SKILL.md",
  angularSemanticsSkill: "<repoRoot>/.claude/skills/angular-semantics/SKILL.md"
}
```

Wait for the Synthesizer to report `analysis.json` written and confirm the `openQuestions`
count (blocking / non-blocking split).

### 5b. Trivial render (trivial path only)

```
node tools/render-trivial.mjs <outputDir>
```

Reads `signature.json` and writes `requirement.md` directly — no `analysis.json` involved.
Skip steps 5 and 6. Proceed to the final report.

### 5. Post-validate — schema and referential integrity (standard / complex paths)

Run schema validation:
```
node tools/validate.mjs <outputDir>/analysis.json
```

If validation fails, **stop and report the errors** — do not render from an invalid file.

Run cross-tier integrity check:
```
node tools/check-integrity.mjs <outputDir>
```

If the integrity check reports dangling evidence ids, record them as **hard failures** in the
final report. Still proceed to render (so the output is visible for debugging), but mark the
overall run as failed.

### 6. Render — produce the Markdown documents

```
node tools/render.mjs <outputDir>/analysis.json
```

## Final report

Emit a structured summary to the caller:

- Five JSON tier paths written (list each)
- Complexity path taken: `simple` or `complex`
- Resolver warnings: count and warning codes
- Synthesizer `openQuestions` count: `{ blocking: N, nonBlocking: M }`
- Schema validation: `pass` or `fail` (include error messages on fail)
- Integrity check: `pass` or `fail` (list dangling ids on fail)
- Renderer status: `ok` or error message; paths to `requirement.md` and `migration_notes.md`
- Overall run status: `success`, `degraded` (validation/integrity failures present but render
  completed), or `failed` (abort before render)

## Constraints

- Bash is limited to the three tools listed. Do not use it for file inspection, string
  manipulation, directory listing, or any other purpose.
- Do not read or write anything under `INPUT/`.
- Do not select which unit to process — that is the caller's responsibility. The orchestrator
  processes exactly the unit it is given.
- Do not run `tools/resolve.mjs index` or any backfill command — the Resolver agent handles
  per-unit extraction.
- Phase A skills (`code2docs-analyze`, `angular-semantics`, `requirements-writing`,
  `migration-risk-flagging`) are off-limits — do not invoke them.
- If any stage fails, report clearly which stage failed and why before stopping.
