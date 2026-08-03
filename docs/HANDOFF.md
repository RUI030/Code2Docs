# Phase 7 Benchmark — New Session Handoff

**Written:** 2026-08-02  
**For:** a new Claude Code session that will run the S1/S2/S3/S4 experiments and fill in `docs/trajectory.md`.

---

## What is already done

- **Phase 1–6 complete.** All AST extractor tools, the batch runner (`tools/run.mjs`), the tier classifier (`tools/classify-unit.mjs`), and the trivial-tier renderer (`tools/render-trivial.mjs`) are production-ready.
- **Benchmark infrastructure:**
  - `OUTPUT/benchmark/benchmark-config.json` — full unit descriptions, folder schema, S3 gate
  - `docs/trajectory.md` — pre-filled Phase A and Phase 5 rows; TBD rows await experiment results
  - `tools/score.mjs` — automated quality testbed; smoke-tested and working
- **Score.mjs update (this session):** tightened framework-term list to avoid false positives from generic words ("component", "module") that appear in document headings.

---

## The three benchmark units

All source files are under `INPUT/jhipster-ng17-fixture/src/main/webapp/app/`.

| Tier | Name | TS file (relative to app/) | Spec file | Spec titles |
|---|---|---|---|---|
| trivial | activate | `account/activate/activate.component.ts` | `account/activate/activate.component.spec.ts` | 3 |
| standard | login | `login/login.component.ts` | `login/login.component.spec.ts` | 7 |
| complex | post-update | `entities/post/update/post-update.component.ts` | `entities/post/update/post-update.component.spec.ts` | 8 |

**Output folder structure:**  
`OUTPUT/benchmark/<tier>/<unit-name>/<setting>/`  
e.g. `OUTPUT/benchmark/trivial/activate/s1-pipeline/`

---

## Settings and how to run each

### S1 — Full pipeline (Sonnet 4.6 + Code2Docs skills + extractor tools)

Use the `/code2docs-pipeline` skill (or invoke the `orchestrator` agent) for each unit.

```
/code2docs-pipeline INPUT/jhipster-ng17-fixture/src/main/webapp/app/account/activate
/code2docs-pipeline INPUT/jhipster-ng17-fixture/src/main/webapp/app/login
/code2docs-pipeline INPUT/jhipster-ng17-fixture/src/main/webapp/app/entities/post/update
```

After each run, **copy the output** from `OUTPUT/<unit-path>/` into `OUTPUT/benchmark/<tier>/<unit-name>/s1-pipeline/`.  
Files to copy: `requirement.md`, `migration_notes.md`, `signature.json`, `dependencies.json`, `functions.json`, `template.json`, `analysis.json`.

Then write `experiment.json` (see format below) to that folder.

### S2 — Phase A skills path (Sonnet 4.6, no extractor)

Use the `/code2docs-analyze` skill for each unit.

```
/code2docs-analyze INPUT/jhipster-ng17-fixture/src/main/webapp/app/account/activate
/code2docs-analyze INPUT/jhipster-ng17-fixture/src/main/webapp/app/login
/code2docs-analyze INPUT/jhipster-ng17-fixture/src/main/webapp/app/entities/post/update
```

After each run, copy `requirement.md` and `migration_notes.md` into `OUTPUT/benchmark/<tier>/<unit-name>/s2-llm-sonnet/`.  
Write `experiment.json` to that folder.

### S3 — Phase A skills path (Opus 5) — CONDITIONAL

Run S3 only if S2 underperforms the gate (see "S3 gate" below).  
Identical to S2 but invoked on claude-opus-5. Change the model via `/model opus` or the `--model` flag before running `/code2docs-analyze`.  
Output goes to `OUTPUT/benchmark/<tier>/<unit-name>/s3-llm-opus/`.

### S4 — Token-limited bug-fix pass — PER UNIT, PER SETTING

After scoring each setting's output (S1, S2, S3), if score reveals issues:
- `screenLabelCoverage < 1.0`, OR
- `specTitleCoverage < 1.0`, OR
- `contradictions > 0`

…then launch a new session with a **4 000-token budget** and the following prompt:

> "Review `requirement.md` in `OUTPUT/benchmark/<tier>/<unit-name>/<setting>/`. The score.json in that folder lists specific missing screen labels and missing spec titles. Fix only those gaps. Do not restructure the document. Budget: 4 000 tokens."

Save the fixed document to `OUTPUT/benchmark/<tier>/<unit-name>/s4-fix-<setting>/`.  
Re-score with score.mjs and write a new `experiment.json`.

---

## How to score

```bash
node tools/score.mjs OUTPUT/benchmark/<tier>/<unit-name>/<setting> \
  --spec INPUT/jhipster-ng17-fixture/src/main/webapp/app/<path-to-spec>
```

This writes `score.json` to the setting folder and prints a summary.  
Run score.mjs on each setting folder immediately after copying outputs.

---

## experiment.json format

Write this manually after each run (Claude Code session report has token counts):

```json
{
  "setting": "s1-pipeline",
  "unit": "activate",
  "tier": "trivial",
  "model": "claude-sonnet-4-6",
  "runDate": "2026-08-02",
  "elapsedSeconds": null,
  "tokensConsumed": null,
  "subagentsSpawned": null,
  "notes": ""
}
```

`tokensConsumed` and `elapsedSeconds`: read from Claude Code's session summary at the end of the run. `subagentsSpawned`: count `Agent()` calls the orchestrator made (shown in session output).

---

## S3 gate

After scoring all three S2 outputs:

1. Count how many units have `screenLabelCoverage < 0.7` **or** `specTitleCoverage < 0.7`.
2. If that count ≥ 2 → run S3 (Opus).
3. If count ≤ 1 → skip S3.

---

## Updating trajectory.md

After each setting completes, fill in the corresponding row in `docs/trajectory.md`.  
Columns to fill:

| Column | Source |
|---|---|
| Blocking Qs | `analysis.json#/openQuestions[blocking=true]` (S1 only; count "?" questions in text for S2/S3) |
| Non-blocking Qs | `analysis.json#/openQuestions[blocking=false]` |
| ACs | `analysis.json#/acceptanceCriteria` length |
| Invariants | `analysis.json#/behavioralInvariants` length |
| Risks | `analysis.json#/migration.risks` length |
| Screen label coverage | `score.json#/screenLabelCoverage` |
| Spec title coverage | `score.json#/specTitleCoverage` |
| Framework neutral | `score.json#/frameworkNeutral` |
| Elapsed (s) | `experiment.json#/elapsedSeconds` |
| Tokens | `experiment.json#/tokensConsumed` |
| Subagents | `experiment.json#/subagentsSpawned` |

---

## Task completion log (2026-08-02)

| ID | Task | Status |
|---|---|---|
| #44 | S1: Run full pipeline on 3 units | ✓ DONE — activate (trivial path), login (standard path), post-update (complex path) |
| #45 | S2: Run Phase A skills on 3 units | ✓ DONE — all 3 units; 100% spec title coverage, framework neutral, 9/9 sections |
| #46 | Score S1+S2, decide if S3 needed | ✓ DONE — S3 gate not triggered (0 units below 0.7 threshold after S2) |
| #47 | S3: Opus run (conditional) | ✓ DONE — skipped (gate condition not met) |
| #48 | S4: Token-limited fix loop | ✓ DONE — all 3 S1 outputs fixed; post-S2 fix not needed |
| #49 | Write `OUTPUT/benchmark/benchmark-report.md` | ✓ DONE |
| #50 | Phase 7 exit check and commit | ✓ DONE — see findings in benchmark-report.md and trajectory.md |
| #39 | Task #7: Phase A schema 0.2.0 compatibility (deferred, not blocking benchmark) | deferred |

**Infrastructure fix applied this session:** `tools/score.mjs` — two bugs fixed:
1. `analysis.openQuestions` path corrected to `analysis.review?.openQuestions ?? analysis.openQuestions`
2. `template.staticText` path corrected to `template.ast?.staticText ?? template.staticText`

---

## Key constraints to remember

1. **Do not read `INPUT/` files during design work.** The fixture is the eval set. Reading source files while setting up a run is fine; reading them to make design decisions is not.
2. **Never overwrite `examples/baseline_skillsonly/`.** That tree is the Phase A baseline. Write all benchmark output to `OUTPUT/benchmark/`.
3. **`docs/D11_comparison.md` is read-only.** The Phase A measurement is done.
4. **Phase A skills may be edited** if a format-compliance issue is found, but behavioral content (the three rules in requirements-writing, angular-semantics reference tables) must not change.

---

## Where things live

```
tools/classify-unit.mjs     — deterministic tier classifier
tools/run.mjs               — batch runner (for full corpus, not benchmark)
tools/render-trivial.mjs    — trivial-tier renderer (no LLM)
tools/score.mjs             — quality testbed
docs/trajectory.md          — benchmark results table (fill this in)
docs/HANDOFF.md             — this file
OUTPUT/benchmark/           — all benchmark outputs land here
OUTPUT/benchmark/benchmark-config.json  — unit descriptions, folder schema, gate
.claude/skills/             — all skills (code2docs-analyze, requirements-writing, etc.)
.claude/agents/             — orchestrator.md, synthesizer.md
examples/baseline_skillsonly/ — Phase A baseline (read-only)
```
