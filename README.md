# Code2Docs

Reads an Angular codebase and writes down what it does — a human-reviewable requirement
specification plus a machine-readable dataset — so the behavior can be preserved when the code
is rebuilt in another framework.

**Stage 1 of a migration pipeline.** Produces documentation and stops at a human approval gate.
Does not generate target-framework code.

## Why this exists

Rewriting an application framework-to-framework fails in a specific way: the new version looks
right and behaves subtly differently. A condition that used to reset a form now preserves it; a
search that used to cancel stale requests now shows them. Those differences reach production
because nothing flagged them.

Code2Docs' job is to write down the behavior precisely enough — and traceably enough — that a
reviewer can confirm it before anyone rebuilds anything.

## How it works

The pipeline has two halves.

The **left half** is deterministic and LLM-free: the Resolver reads Angular TypeScript source,
template HTML, and spec files using the TypeScript Compiler API and emits four structured JSON
tiers (`signature`, `dependencies`, `functions`, `template`). These tiers are reproducible,
schema-validated, and carry no model output.

The **right half** is LLM-written: an Explainer fills per-symbol semantic explanations on
complex units; a Synthesizer reads the full unit and writes `analysis.json` (structured findings,
behavioral workflows, open questions). Every LLM claim must cite an `ast` tier id as evidence —
dangling evidence is a hard failure, not a warning. A deterministic renderer then assembles
`requirement.md` and `migration_notes.md` from the JSON.

The two halves are kept separate so errors are attributable: a wrong fact in the output traces
to either a wrong extraction (deterministic, reproducible, fixable) or a wrong inference
(LLM-written, evidence-checked). A pipeline where they are mixed cannot make that distinction.

See **`ARCHITECTURE.md`** for the full pipeline diagram, dataflow, and file responsibilities.

---

## Usage

### Analyze one component (skills-only, available now)

```
/code2docs-analyze INPUT/<path>/<component-folder>
```

Or in plain language: *"document the component at `INPUT/.../foo`"* — the relevant skills load
automatically.

This runs the Phase A skills-only path: one agent reads the source and writes:

| Output | What it is |
|---|---|
| `requirement.md` | The deliverable. Framework-neutral behavioral spec for human review. |
| `migration_notes.md` | Hazards that will not survive a naive rewrite. Separate so the spec stays framework-neutral. |

Prose is real but recall is unverified — the LLM may miss methods or bindings that a human
reviewer would catch. Two reviewed examples are in `examples/baseline_skillsonly/`.

### Extract the deterministic tiers

```
npm run resolve -- <component.ts> --out <dir> [--unit-path <path>]
```

Emits schema-valid `ast` content for `signature.json`, `dependencies.json`, `functions.json`,
and `template.json`. Never throws on bad input — unresolvable constructs are recorded as
structured warnings in `provenance.warnings`, and `parseStatus` is derived from those rather
than asserted.

### Build the repo index

```
npm run resolve -- index <src-root> --out <dir>
```

Walks the entire source tree, classifies every Angular unit, resolves selector and import edges
across the repo, and emits `index.json`. This backfills `outboundUnitEdges`, `consumedBy`, and
`httpInteractions` for every unit (HTTP calls through injected services are traced through the
index, not just direct `HttpClient` calls).

### Query tier data

```
npm run q -- <unit-dir> refs method:save
npm run q -- <unit-dir> calls method:ngOnInit
npm run q -- <unit-dir> outline
```

Random access into emitted tiers without loading the full files. **Developer CLI — not scheduled
for agent use.** Agents in the pipeline read tier files directly; the query layer is there for
local inspection.

### Verify artifacts

```
npm test
```

Four checks, each answering something the others cannot:

| Check | Answers |
|---|---|
| `validate` | Is each file well-formed against its schema? *(one file at a time)* |
| `check` | Does every id referenced in one tier exist in the tier that owns it? *(a dangling id is well-formed on its own)* |
| `golden` | Did extractor behavior change unnoticed? Plus pair equivalence. |
| recall audit | Did the extractor return seven of nine and report success? |

The recall audit exists because goldens structurally cannot catch it: a golden is written from
the output it judges, so an extractor that has *always* missed a construct produces a stable,
passing golden forever. `ng-scan` counts the same constructs a second way and reports the gap.

`npm run golden` also prints a **recorded gaps** summary on every run.

### Score omissions without reading Angular

Angular projects ship spec files (`*.spec.ts`) whose test titles are already behavior statements
in plain English:

```
it('should disable the save button when the form is invalid', ...)
it('should navigate back to the list after a successful save', ...)
```

Extract every test title for the component, check each appears somewhere in `requirement.md`.
Any that does not is a confirmed omission — found by comparing two English-sentence lists, no
Angular knowledge needed. Its limit: tests cover only part of a component's behavior, so this
establishes a floor on omissions, not a full measurement.

---

## Output artifacts

Per-unit outputs, written to `OUTPUT/<mirrored source path>/<unit>/`:

| File | Content |
|---|---|
| `signature.json` | What the unit *is*: public API, injected dependencies, lifecycle hooks, state outline, inferred metrics |
| `dependencies.json` | How it *connects*: imports, HTTP interactions, outbound edges to other components (by import and by selector), intra-class call graph |
| `functions.json` | What each symbol *does*: per-method detail, forms, signals, streams, spec cases, intra-class `callGraph` |
| `template.json` | What it *renders*: control flow, bindings, event handlers, static text on screen, accessibility, i18n |
| `analysis.json` | LLM-written findings: state model, behavioral workflows, risks, open questions — written by the Synthesizer in Phase 5 |
| `requirement.md` | The deliverable. Framework-neutral behavioral spec rendered from `analysis.json`. |
| `migration_notes.md` | Target-framework hazards rendered from `analysis.json`. |

`OUTPUT/` is gitignored scratch space. A run worth keeping is promoted by **manually** copying
the unit folder to `examples/`, preserving the mirrored path. Promotion is a human step;
`examples/` is write-protected in `.claude/settings.json` so no agent can overwrite a baseline.

---

## Design principles

Five rules the whole design rests on. Full reasoning in `plans/1_Decisions.md`.

1. **No fact is stored twice.** The JSON tiers are one dataset with one id space, split by
   access pattern. Two files asserting the same thing would eventually disagree; then neither
   can be trusted.
2. **`ast` content is deterministic; `doc` content cites it.** Extracted facts are reproducible
   from unchanged source and contain no model output. Every model-written claim carries
   `evidence` ids that must resolve. Dangling evidence is a hard failure.
3. **Markdown is rendered from JSON, never written twice.** Prose is stored finished in the
   JSON and assembled mechanically, so the document cannot contradict the data. Rendering
   merges rather than overwrites — human review edits are preserved.
4. **Nothing describes the target framework.** `requirement.md` stays valid if the migration
   target changes, and readable by domain experts who do not know it. Target material lives in
   `migration_notes.md`.
5. **One implementation per fact, and the compiler before text** (D15, D3). How a file is
   parsed, what the tier list is, how complexity is counted — each defined once and imported.
   Here duplication is not a maintenance cost but a *correctness* one: this project emits
   metrics, so two copies that drift produce a defect in the output.

---

## Project layout

```
.claude/
  skills/            auto-discovered skill files (see below)
    angular-semantics/       Angular construct → observable behavior (Phase A baseline, never modified)
    requirements-writing/    how to write framework-neutral requirements (Phase A baseline, never modified)
    migration-risk-flagging/ hazard taxonomy (Phase A baseline, never modified)
    code2docs-analyze/       workflow entry point, invocable as /code2docs-analyze (Phase A baseline)
  agents/            subagent definitions for the Phase 3+ pipeline
    resolver.md              runs tools/resolve.mjs on one unit, reports 4 tiers + warnings
    explainer.md             complexity-gated per-symbol semantic explanation (Phase 4 prompt)
    synthesizer.md           full-unit synthesis: StructureAgent → BehaviorAgent → CritiqueAgent
plans/
  0_ProjectDescription.md  intent, scope, artifact model
  1_Decisions.md           D1–D15, append-only decision records
  2_ImplementationPlan.md  phases, risks, current next steps
  3_PhaseAFindings.md      F1–F19, findings from Phase A evaluation
templates/
  requirement.md           rendered Markdown template (render target)
  migration_notes.md       rendered Markdown template (render target)
  schema/                  one JSON Schema per tier — SOLE authority on shape,
                           field semantics, tier purpose, and id conventions
tools/
  resolve.mjs              Resolver CLI: find unit files, run extractors, write tiers
  resolve/
    ts-signature.mjs       signature.json — class, public API, DI, lifecycle, state
    ts-dependencies.mjs    dependencies.json — call graph, imports, HTTP, selector edges
    ng-template.mjs        template.json — control flow, bindings, events, static text
    ts-functions.mjs       functions.json — per-symbol detail, forms, signals, callGraph
    warnings.mjs           shared warning channel, closed code vocabulary
    ng-scan.mjs            text-search recall audit (D3a); repo sweep for Phase 2 index
    ts-source.mjs          one parse configuration + node helpers shared by all four extractors
  tiers.mjs                tier list and shared paths, defined once (D15)
  validate.mjs             schema validation
  check-integrity.mjs      cross-tier referential integrity (dangling id → hard failure)
  golden.mjs               golden-file runner + recorded-gaps summary
  query.mjs                random access into tier data (developer CLI, unscheduled)
fixtures/                  hand-written Angular files, one construct each — extractor unit tests
  fixtures.json            what each fixture must extract (written before the extractor)
examples/                  promoted runs — reference output and the Phase A baseline
  baseline_skillsonly/     two complete documents from Phase A, no extractor (D11 baseline)
benchmarks/                cost per phase, Phase 1 omission measurement (F16)
docs/                      comparison and analysis documents
  D11_comparison.md        blocking-question count before vs after Phase 2 (2 → 0)
angular-docs/              pinned Angular 17.3.9 typings + guides (gitignored, regenerable)
INPUT/                     Angular source under analysis (gitignored, held out from design)
OUTPUT/                    generated documentation, scratch (gitignored)
```

---

## Skills and slash commands

**No registration needed.** Claude Code discovers skills by location: any
`.claude/skills/<name>/SKILL.md` in the project is picked up automatically.

Two ways they activate:

- **Automatically.** Claude reads each skill's `description` frontmatter and loads the relevant
  ones when a task matches.
- **Explicitly, as a slash command.** Typing `/code2docs-analyze` invokes it by name.

| | Skill | Slash command (`.claude/commands/*.md`) |
|---|---|---|
| Invoked by | model, when relevant — or by name | user, explicitly |
| Good for | knowledge and procedure | a fixed task you trigger often |

`angular-semantics` is pure reference — you would never "run" it; you want it loaded when
Angular is being read. `code2docs-analyze` is a workflow, so it works either way.

**The four Phase A skills are the D11 baseline and must never be modified or removed.** The D11
comparison (`docs/D11_comparison.md`) uses them as the measurement baseline; changing them
changes the baseline.

---

## Development status

**Phases 2–6 are complete. Phase 7 (evaluation) is next.**

### What is built

| Phase | Deliverable |
|---|---|
| **A** | Skills-only POC: two reviewed `requirement.md` files, hand-filled baselines in `examples/baseline_skillsonly/` |
| **0** | JSON Schemas for all five tiers, cross-tier integrity checker, fixture corpus, golden runner |
| **1** | Resolver: TypeScript Compiler API extraction of all four `ast` tiers; structured warning channel; D3a recall audit |
| **2** | Repo index CLI; httpInteractions backfill; Phase 1 follow-up gaps (ICU, `@defer`, `afterRender`, `FormRecord`); intra-class `callGraph`; `analysis.json` schema + renderer; D11 comparison; Phase 3 agent definitions |
| **3** | Orchestrator agent; `/code2docs-pipeline` slash command; end-to-end pipeline on one fixture unit |
| **4** | `explaining-functions` skill; complexity-gated Explainer; D8 comparison (staged beats one-shot: 2 blocking → 1 blocking on `post/update`); complexity threshold calibrated (`methodCount > 10` OR `tsLineCount > 200`) |
| **5** | Phase 5 Synthesizer with full sub-agent decomposition (StructureAgent → BehaviorAgent → CritiqueAgent); deepened prompts with state-ownership classification, workflow tracing, risk taxonomy, blocking-question discipline; D16 (fabricated evidence id pattern rejected) |
| **6** | Deterministic batch runner (`tools/run.mjs`); `classify-unit.mjs` (D17, single tier classifier module); content-hash caching; resumable runs via `run-manifest.json`; topological parallelism; degraded path for oversized units; `run-summary.json`; trivial-tier renderer (`render-trivial.mjs`, no LLM); `orchestrator.md` updated to call classifier |

### Phase 5 measurement

Full staged pipeline on `post/update` (131 TS lines, 12 methods):

| Metric | Phase A baseline | Phase 5 |
|---|---|---|
| Blocking questions | 2 | 2 |
| Non-blocking questions | — | 4 |
| Acceptance criteria | — | 14 (all 8 spec tests linked) |
| Behavioral invariants | — | 7 |
| Migration risks | — | 6 (2 high, 3 medium, 1 low) |
| Dangling evidence ids | — | 0 |

Phase 5 tied the Phase A blocking count but found a **new** blocking question (blog field
null option vs required — not caught by Phase A) while closing Phase A's q:2 (error display,
closed by Phase 2 selector-edge discovery). The document is materially richer across every
other dimension.

### Phase 7 goal

Evaluate the pipeline across the full `INPUT/` corpus: score output quality per the rubric
(factual accuracy, completeness, framework-neutrality, intent capture), run the mechanical
floor check (every screen label appears in `requirement.md`), and close the human review loop
(`review.status` progresses to `approved` on a representative sample without clobbering
human edits on re-run).

### Open gaps (by design, recorded in output as warnings)

Nothing here is production-ready.

| Gap | Owner |
|---|---|
| Evaluation rubric, corpus scoring, review loop | Phase 7 |
| Phase A baseline uses schema 0.2.0 (legacy); no diff/upgrade script yet | Phase 7 (Task #7) |
| D18: oversized-unit degradation thresholds (TBD after first corpus run) | Phase 7 |

---

## Roadmap

| Phase | Deliverable | Status |
|---|---|---|
| A | Skills-only POC, component level | **done** |
| 0 | Contracts and test harness: schemas, integrity checker, fixtures | **done** |
| 1 | Resolver: deterministic extraction via TypeScript Compiler API | **done** |
| 2 | Repo inventory, cross-unit graph, Phase 1 follow-up gaps, D11 comparison | **done** |
| 3 | Agent wiring skeleton, one unit end to end | **done** |
| 4 | Explainer: complexity-gated, D8 comparison | **done** |
| 5 | Requirements Synthesizer: StructureAgent → BehaviorAgent → CritiqueAgent | **done** |
| **6** | Scale, caching, resumable runs | **done** |
| **7** | Evaluation and the human review loop | ← **here** |
