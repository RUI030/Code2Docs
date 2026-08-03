# Code2Docs — Output Quality Trajectory

Tracks quality metrics per anchor unit across phases and benchmark settings.
Updated at each phase exit. Source of truth for "is the pipeline getting better?"

**How to read:** each table is one anchor unit. Rows are phases or benchmark settings.
TBD = not yet measured. — = metric does not apply to this path.

---

## Anchor 1: `entities/post/update` — PostUpdateComponent (complex)

131 TS lines, 12 methods, 1 form, 5 streams. 8 spec titles.
The Phase 5 reference unit; the hardest of the three benchmark units.

| Phase / Setting | Model | Blocking Qs | Non-blocking Qs | ACs | Invariants | Risks | Screen label coverage | Spec title coverage | Framework neutral | Elapsed (s) | Tokens | Subagents |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Phase A** (skills-only) | Sonnet (unknown) | 2 | — | — | — | — | — | 8/8 (100%) | yes | — | — | 0 |
| **Phase 5** (staged pipeline) | Sonnet 4.6 | 2 | 4 | 14 | 7 | 6 | TBD | TBD | yes | — | — | 3 |
| **S1** (pipeline, Sonnet 4.6) | Sonnet 4.6 | 1 | 3 | 12 | 4 | 7 | 100% | 63% | no | 5584 | 16041 | 3 |
| **S2** (Phase A skills, Sonnet 4.6) | Sonnet 4.6 | 1 | 3 | — | — | — | null | 100% | yes | null | null | 0 |
| **S3** (Phase A skills, Opus) | Opus 5 | — | — | — | — | — | — | — | — | — | — | — |
| **S4 fix** (post-S1) | Sonnet 4.6 | 1 | 3 | — | — | — | 100% | 100% | no | null | null | — |
| **S4 fix** (post-S2) | Sonnet 4.6 | — | — | — | — | — | — | — | — | — | — | — |

_S3 skipped (S2 gate: 0 units below threshold). S4 post-S1: fixed 3 missing spec titles ("Should update editForm", "Should forward to blogService", "Should forward to tagService") — Synthesizer used correct keywords but in backtick-coded evidence citations that score.mjs strips. frameworkNeutral=no because Synthesizer outputs Angular lifecycle names in prose._

---

## Anchor 2: `account/activate` — ActivateComponent (trivial by classifier, standard by behavior)

27 TS lines, 1 method, HTTP via service. 3 spec titles.
Phase A anchor unit. Classify-unit says "trivial" but HTTP behavior warrants real documentation.

| Phase / Setting | Model | Blocking Qs | Non-blocking Qs | ACs | Invariants | Risks | Screen label coverage | Spec title coverage | Framework neutral | Elapsed (s) | Tokens | Subagents |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Phase A** (skills-only) | Sonnet (unknown) | 0 | — | — | — | — | — | 4/4 (100%) | yes | — | — | 0 |
| **S1** (pipeline, Sonnet 4.6) | Sonnet 4.6 | — | — | — | — | — | 0% | 0% | yes | null | 13009 | 1 |
| **S2** (Phase A skills, Sonnet 4.6) | Sonnet 4.6 | 0 | 3 | — | — | — | null | 100% | yes | null | null | 0 |
| **S3** (Phase A skills, Opus) | Opus 5 | — | — | — | — | — | — | — | — | — | — | — |
| **S4 fix** (post-S1) | Sonnet 4.6 | — | — | — | — | — | 100% | 100% | yes | null | null | — |
| **S4 fix** (post-S2) | Sonnet 4.6 | — | — | — | — | — | — | — | — | — | — | — |

---

## Anchor 3: `login` — LoginComponent (standard)

55 TS lines, 3 methods, 1 form. 7 spec titles. New in Phase 7 benchmark.

| Phase / Setting | Model | Blocking Qs | Non-blocking Qs | ACs | Invariants | Risks | Screen label coverage | Spec title coverage | Framework neutral | Elapsed (s) | Tokens | Subagents |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **S1** (pipeline, Sonnet 4.6) | Sonnet 4.6 | 2 | 4 | 8 | 4 | 4 | 89% | 100% | no | 666 | 15215 | 2 |
| **S2** (Phase A skills, Sonnet 4.6) | Sonnet 4.6 | 2 | 2 | — | — | — | null | 100% | yes | null | null | 0 |
| **S3** (Phase A skills, Opus) | Opus 5 | — | — | — | — | — | — | — | — | — | — | — |
| **S4 fix** (post-S1) | Sonnet 4.6 | 2 | 4 | — | — | — | 100% | 100% | no | null | null | — |
| **S4 fix** (post-S2) | Sonnet 4.6 | — | — | — | — | — | — | — | — | — | — | — |

---

## Metric definitions

| Metric | Source | Notes |
|---|---|---|
| Blocking Qs | `analysis.json#/openQuestions[blocking=true]` | S1 only; S2/S3 derive from requirement.md text if present |
| Non-blocking Qs | `analysis.json#/openQuestions[blocking=false]` | S1 only |
| ACs | `analysis.json#/acceptanceCriteria` count | S1 only |
| Invariants | `analysis.json#/behavioralInvariants` count | S1 only |
| Risks | `analysis.json#/migration.risks` count | S1 only |
| Screen label coverage | `score.json#/screenLabelCoverage` | Fraction of `template.json.staticText` labels found in requirement.md. Inverted direction per F19. |
| Spec title coverage | `score.json#/specTitleCoverage` | Fraction of spec `it()` titles reflected anywhere in requirement.md |
| Framework neutral | `score.json#/frameworkNeutral` | true/false: no Angular/React/Vue terms in requirement.md prose |
| Elapsed | `experiment.json#/elapsedSeconds` | Wall-clock seconds for the full setting run |
| Tokens | `experiment.json#/tokensConsumed` | From Claude Code session report; null if not captured |
| Subagents | `experiment.json#/subagentsSpawned` | Agent() invocations by orchestrator |
