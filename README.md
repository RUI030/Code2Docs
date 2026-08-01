# Code2Docs

Reads an Angular codebase and writes down what it does — a human-reviewable requirement
specification plus a machine-readable dataset — so the behavior can be preserved when the code
is rebuilt in another framework.

This is **Stage 1** of a migration. It produces documentation and stops at a human approval
gate. It does not generate target-framework code.

## Why this exists

Rewriting an application framework-to-framework fails in a specific way: the new version looks
right and behaves subtly differently. A condition that used to reset a form now preserves it; a
search that used to cancel stale requests now shows them. Those differences reach production
because nothing flagged them.

Code2Docs' job is to write down the behavior precisely enough — and traceably enough — that a
reviewer can confirm it before anyone rebuilds anything.

## Status

**Phases A and 0 are complete. Phase 1 has met its exit criteria; Phase 2 is next.**

*Phase A* ran one agent against two components with no AST tooling, to establish whether
generated requirement documents are accurate and useful *before* investing in extraction
infrastructure. The documents were accurate, and the failures were not where the plan assumed:
nothing was wrong with comprehension or with `requirement.md`'s structure. What failed was naming
unanchored to real identifiers, everything living outside one component folder, and six evidence
citations that resolve to nothing — the last found by a mechanical check after a close read had
missed them. The producing state is tagged `phase-a-baseline`.

*Phase 0* pinned every artifact shape as a JSON Schema, added the cross-tier integrity checker,
and built the fixture corpus and golden runner.

*Phase 1* extracts all four `ast` tiers deterministically. Its exit measurement is in
`benchmarks/phase1-omission.json`, and it inverted the assumption it was written on: the
hand-filled Phase A baseline had **zero** omissions on every declarative category, and the
*extractor* was the weaker side. What the extractor uniquely supplies is derived — template-to-
method call edges nobody enumerated by hand, which is what makes reachability verified rather
than searched. The comparison's real yield was two extractor defects, one of which the agent had
gotten right.

All findings are in `plans/3_PhaseAFindings.md` (F1–F16).

**Known and recorded, not fixed** — each carries a warning in the output rather than passing
silently:

| Gap | Owner |
|---|---|
| HTTP through injected services is invisible (`httpInteractions` under-reports) | Phase 2 |
| Cross-unit edges, `consumedBy`, selector resolution | Phase 2 |
| ICU expressions, `@defer` prefetch triggers, `afterRender`/`afterNextRender` | Phase 1 follow-up (F10) |
| `analysis.json` shapes not yet renderable faithfully | before Phase 4 (F14) |

Nothing here is production-ready.

## Usage

### Analyze one component

```
/code2docs-analyze INPUT/<path>/<component-folder>
```

This reads the component's `.ts`, `.html`, styles, and `.spec.ts` files and writes to
`OUTPUT/<mirrored path>/`:

| Output | What it is |
|---|---|
| `requirement.md` | The deliverable. Framework-neutral behavioral spec for human review. |
| `migration_notes.md` | Hazards that will not survive a naive rewrite. Separate so the spec stays framework-neutral. |
| `signature.json` | What the component is: public interface, dependencies, state outline. |
| `dependencies.json` | How it connects: call graph, field access, routing, imports. |
| `functions.json` | Per-symbol detail: complexity, side-effect hints, forms, signals, streams, spec cases. |
| `template.json` | What it renders: control flow, bindings, events, accessibility, i18n. |

`OUTPUT/` is gitignored scratch space. A run worth keeping — in particular the hand-derived
`signature.json` and `callGraph`, which are the baseline Phase 1's extractor was measured
against (F16) — is promoted by **manually** copying the component folder to `examples/`, preserving
the same mirrored path. Promotion is deliberately a human step, and `examples/` is denied to
Edit/Write in `.claude/settings.json` so no agent can overwrite a promoted baseline.

You can also just ask in plain language — "document the component at `INPUT/.../foo`" — and the
relevant skills load automatically.

### Extract the deterministic tiers

```
npm run resolve -- <component.ts> --out <dir> [--unit-path <path>]
npm run q -- <unit-dir> refs method:save      # query without loading whole files
```

The Resolver never throws on bad input: a file it cannot read or classify is recorded and the run
continues. Everything it could not determine is a structured warning in `provenance.warnings`,
with `parseStatus` **derived** from those warnings rather than asserted.

### Check the artifacts

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

The last one exists because goldens structurally cannot answer it: a golden is written from the
output it judges, so an extractor that has **always** missed a construct produces a stable,
passing golden forever. `ng-scan` counts the same constructs a second way and reports the gap.
Verified against exactly that case — see F15.

`npm run golden` also prints a **recorded gaps** summary, so warnings are visible on every run
rather than only inside files nobody opens.

### Review the output

`requirement.md` is the artifact that matters. Read it and check it against the source.

Two kinds of error, and they are not equally easy to find:

- **False statements** — the document claims something the code does not do. Findable by
  reading both.
- **Omissions** — the code does something the document never mentions. **These are invisible
  from the document alone.** A document covering 9 of 12 behaviors reads exactly as complete
  and confident as one covering all 12.

### Score omissions without reading Angular

Angular projects ship test files (`*.spec.ts`) whose titles are already behavior statements in
plain English:

```
it('should disable the save button when the form is invalid', ...)
it('should navigate back to the list after a successful save', ...)
```

Extract every test title for the component, then check each one appears somewhere in
`requirement.md`. Any that does not is a **confirmed omission** — found by comparing two lists
of English sentences, with no Angular knowledge required.

Its limit: tests cover only part of a component's behavior, so this establishes a floor on
omissions, not a full measurement. Definitive review is owned by a separate team.

See **`ARCHITECTURE.md`** for the pipeline, dataflow, and what each file is responsible for.

## Layout

```
.claude/skills/          the agent's instructions (auto-discovered, see below)
  angular-semantics/       Angular construct -> observable behavior
  requirements-writing/    how to write framework-neutral requirements
  migration-risk-flagging/ hazards that break silently in a rewrite
  code2docs-analyze/       the workflow entry point
plans/
  0_ProjectDescription.md  intent, scope, artifact model
  1_Decisions.md           D1-D10, append-only decision records
  2_ImplementationPlan.md  phases, risks, next steps
templates/               the two rendered Markdown views (requirement, migration_notes)
  schema/                  one JSON Schema per tier -- SOLE authority on shape, field
                           semantics and tier purpose; id conventions pinned as patterns
fixtures/                hand-written Angular files, one construct each — extractor unit tests
  fixtures.json            what each fixture MUST extract, written before the extractor
tools/                   resolve (the Resolver) + validate / check-integrity / golden / query
  resolve/                 the four extractors, the warning channel, ng-scan
examples/                promoted runs — reference output and the Phase A baseline, hand-curated
benchmarks/              cost per phase, and the Phase 1 omission measurement (F16)
angular-docs/            pinned Angular 17.3.9 typings + guides (gitignored, regenerable)
INPUT/                   Angular source under analysis (gitignored, held out from design)
OUTPUT/                  generated documentation, scratch (gitignored)
```

## Skills and slash commands

**No registration needed.** Claude Code discovers skills by location: any
`.claude/skills/<name>/SKILL.md` in the project is picked up automatically. There is nothing to
add to `settings.json`.

Two ways they activate:

- **Automatically.** Claude reads each skill's `description` frontmatter and loads the relevant
  ones when a task matches. This is the main path, and why those descriptions are written to
  say *when* to use the skill rather than just what it contains.
- **Explicitly, as a slash command.** Typing `/code2docs-analyze` invokes it by name.

That difference is worth keeping in mind when adding more:

| | Skill | Slash command (`.claude/commands/*.md`) |
|---|---|---|
| Invoked by | model, when relevant — or by name | user, explicitly |
| Good for | knowledge and procedure | a fixed task you trigger often |

`angular-semantics` is pure reference — you would never "run" it, you want it loaded when
Angular is being read. `code2docs-analyze` is a workflow, so it is written to work either way.

## Design invariants

Four rules the whole design rests on. Full reasoning in `plans/1_Decisions.md`.

1. **No fact is stored twice.** The JSON tiers are one dataset with one id space, split by
   access pattern for cheap random access. Two files asserting the same thing would eventually
   disagree, and then neither could be trusted.
2. **`ast` content is deterministic; `doc` content cites it.** Extracted facts are reproducible
   from unchanged source and contain no model output. Every model-written claim carries
   `evidence` ids that must resolve. Dangling evidence is a hard failure.
3. **Markdown is rendered from JSON, never written twice.** Prose is stored finished in the
   JSON and assembled mechanically, so the document cannot contradict the data. Rendering
   merges rather than overwrites — human review edits are preserved.
4. **Nothing describes the target framework.** `requirement.md` stays valid if the migration
   target changes, and readable by domain experts who do not know it. Target material lives in
   `migration_notes.md`.

## Roadmap

| Phase | |
|---|---|
| A | Skills-only POC, component level, no tooling — **done** |
| 0 | Contracts and test harness: schemas, integrity checker, fixtures — **done** |
| 1 | Resolver: deterministic extraction via the TypeScript Compiler API — **done**, exit measured (F16) |
| **2** | Repo inventory and cross-unit dependency graph ← **here** |
| 3 | Agent wiring, one unit end to end |
| 4 | Decide whether the Explainer stage earns its place, then build it |
| 5 | Requirements Synthesizer and the Markdown renderer |
| 6 | Scale, caching, resumable runs |
| 7 | Evaluation and the human review loop |
