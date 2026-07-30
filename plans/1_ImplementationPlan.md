# Code2Docs — Implementation Plan

Companion to `0_ProjectDescription.md`. That document defines intent; this one defines
the build order, the contracts between stages, and the decisions the description left open.

---

## 1. Scope

**In scope.** Given an Angular source tree, produce for each analyzed unit a
human-reviewable `requirement.md` and a machine-readable dataset (five JSON tiers, see
**D2**), plus one repo-level index describing units, their dependencies, and the
recommended processing order.

**Out of scope.** Generating React (or any target-framework) code. The description
mentions a "Stage 2" gated on human approval of `requirement.md` — Code2Docs *is* Stage 1
and ends at that gate. Nothing in the output may prescribe target-framework architecture;
outputs describe existing behavior only.

**Success criterion.** A developer who has never seen the Angular component can read its
`requirement.md`, agree it is accurate, and hand it to an implementer. Every factual
claim in the output is traceable to a file and line.

---

## 2. Decisions

The description leaves several things underspecified. These are the resolutions this plan
builds on; each is cheap to revisit before Phase 1 lands, expensive after.

### D1 — The unit of work is a "unit", not only a component

The description's Resolver takes a "Component Folder", but an Angular migration is blocked
by services, guards, pipes, directives, interceptors, route resolvers, and shared models
just as much as by components. The pipeline is therefore defined over a `unit`
(`kind ∈ component | service | directive | pipe | guard | interceptor | route-resolver |
module | model | store | util`). Components are the richest kind; the others use the same
schema with inapplicable sections omitted.

### D2 — One logical dataset, five physical files, split by access pattern

The description names `metadata.json` as an output but never says who writes it: the
Resolver emits `ast_signatures.json`, the Synthesizer emits `requirement.md`, and both
overlap it. The resolution has two halves.

**Merge logically.** There is one dataset, one id space, and **no fact stored twice**. Two
files that both assert a component's inputs will eventually disagree, and then neither is
trustworthy.

**Split physically by access pattern**, because the goal is an IDE-like interface for
agents and humans, and what makes an IDE fast is random access. For an agent, "loading" is
paid in context tokens, so every irrelevant field in an opened file is waste. Splitting
also buys **independent cache invalidation**: editing an HTML template must not invalidate
every function explanation.

| File | Answers | Read when |
|---|---|---|
| `signature.json` | "What is this?" | Always, first — kept small deliberately |
| `dependencies.json` | "What connects to what?" | Tracing, impact analysis |
| `functions.json` | "What does this symbol do?" | Drilling into one function (largest tier) |
| `template.json` | "What does the UI do?" | UI work only |
| `analysis.json` | "What must be preserved?" | Review, test generation |
| `requirement.md` | Abstract behavioral spec | Human review |
| `migration_notes.md` | Target-framework hazards | Stage 2 planning |

Three mechanisms make this behave like an IDE rather than a pile of JSON:

1. **Stable global ids are the only join key** (`method:save`, `tpl:12`, `dep:fooService`).
   Files cross-reference by id, never by copying content — the foreign-key discipline that
   prevents drift.
2. **Reverse indexes are emitted alongside forward ones** (`calledBy` with `calls`,
   `readBy` with `reads`). Nearly free at extraction time, expensive for an agent to derive
   by scanning, and the reason find-references feels instant.
3. **`signature.json` carries a manifest**, so one cheap read tells an agent what exists
   and where to look next.

The determinism invariant survives the split, moved inside each file as `ast` versus `doc`
sub-objects with separate cache keys: **`ast` content is byte-reproducible from unchanged
source and contains zero LLM output.** That is what makes it cacheable, diffable, and
unit-testable without a model in the loop — and it is why every `doc` claim can cite an
`ast` id as evidence, making the output auditable rather than merely plausible.

### D2a — `requirement.md` is rendered deterministically, not written by an LLM

The Synthesizer stores **finished prose** in `analysis.json`; a renderer assembles the
Markdown mechanically. Handing the JSON to a second LLM to format would pay twice and
reintroduce exactly the drift the split was meant to eliminate. Rendering mechanically
makes "the md cannot contradict the JSON" a structural guarantee, gives a free consistency
test (re-render and diff — any delta is a CI failure), and makes additional views cheap.

Because the approval gate means humans *will* edit `requirement.md`, rendering must be a
**merge, not an overwrite**: machine-owned regions are fenced with markers carrying a
content hash; a hash mismatch marks the region human-owned and it is never overwritten
again; the fresh machine version is written alongside as a diff to accept or reject.
Writing accepted human prose back into `analysis.json` is deferred past v1.

### D2b — Target-framework advice lives outside `requirement.md`

`requirement.md` §6 originally held "React Refactor Suggestions," which contradicts the
description's rule that outputs describe existing behavior rather than prescribe target
architecture. Resolution: `requirement.md` stays framework-neutral — reviewable by domain
experts who do not know the target, and still valid if the target changes — and all
target-framework material moves to `migration_notes.md`, whose §4 is human-owned by
default so target assumptions cannot leak backward into the behavioral spec.

### D3 — Use the TypeScript Compiler API from Phase 1, not grep

The description proposes a grep-based first pass with "compiler and AST tools later."
**Recommend inverting this.** Reasons:

- `typescript` is already a dependency of any Angular repo under analysis, so
  `ts.createSourceFile` costs no new infrastructure and is ~20 lines to stand up.
- The AST work is the load-bearing part of the whole system. Decorator arguments, DI
  parameter lists, and `inject()` calls break regex matching as soon as formatting spans
  lines or a type argument contains a comma — and they fail *silently*, producing
  confidently wrong metadata that the LLM stages then elaborate on.
- The call graph, field read/write sets, and leaf-first ordering — the Explainer's entire
  input contract — are not reconstructible by grep at acceptable accuracy.

Grep stays useful as a *fallback* for files that fail to parse, and for the repo-wide
inventory sweep in Phase 2 where only coarse classification is needed.

Templates are the one place to phase: start with `@angular/compiler`'s
`parseTemplate` if it resolves cleanly against the target repo's Angular version;
otherwise begin with a conservative HTML parser plus binding-syntax extraction and
upgrade later. Record `template.parseStatus` honestly either way.

### D4 — Resolver ships as a Node CLI invoked via Bash, not an MCP server

The description says "a JavaScript tool registered with Claude Code." The simplest form
that satisfies it: `tools/ng-ast/` as a Node CLI that takes a path and prints JSON to
stdout. It is runnable and testable outside any agent, trivially allowlisted for the
`resolver` subagent, and has no protocol handshake to debug. Promote it to an MCP server
only if per-call process startup becomes a measured bottleneck.

### D5 — Two passes over the repo: cheap inventory, then deep per-unit analysis

A single walk cannot produce the cross-unit dependency graph that the Synthesizer's input
list requires (the description asks for a "component dependency graph" but assigns nobody
to build it). So:

- **Pass A (no LLM):** classify every file into units, resolve imports and template
  selectors to unit ids, emit `index.json` with the cross-unit graph and a leaf-first
  topological order.
- **Pass B (per unit, in that order):** Resolver → Explainer → Synthesizer.

Leaf-first ordering means a unit's dependencies are already documented when it is
processed, so the Synthesizer can cite a dependency's stated purpose instead of guessing
at it.

### D6 — Incremental by content hash

Cache `extracted` keyed by a hash of the unit's input files + resolver version, and
`inferred` keyed by that hash + prompt/model version. Re-running on an unchanged repo
should cost nothing. This matters more than it sounds: tuning Explainer granularity (which
the description flags as needing iteration) means many repeated runs.

---

## 3. Artifact layout

```
Code2Docs/
  tools/ng-ast/            # Resolver CLI (Node + TypeScript Compiler API)
  templates/
    signature.json         # hot tier: "what is this"            [written]
    dependencies.json      # graph tier: call graph + edges       [written]
    functions.json         # detail tier: per-symbol + comments   [written]
    template.json          # UI tier: bindings + UI requirements  [written]
    analysis.json          # inferred aggregate, backs the md     [written]
    requirement.md         # rendered behavioral spec             [written]
    migration_notes.md     # rendered target-framework hazards    [written]
    schema/*.schema.json   # JSON Schema per tier                 [Phase 0]
    index.json             # repo-level inventory template        [Phase 2]
    _superseded/           # earlier single-file drafts, archived
  skills/
    angular-semantics/     # Angular→framework-independent rules, shared by LLM stages
    requirements-writing/  # the "Requirements Skill File" of the description
  agents/                  # resolver / explainer / synthesizer subagent definitions
  fixtures/                # small synthetic Angular files for unit-testing extractors
  INPUT/                   # held-out evaluation corpus — not consulted during design
  OUTPUT/
    index.json
    <mirrored source path>/<unit>/
      signature.json
      dependencies.json
      functions.json
      template.json
      analysis.json
      requirement.md
      migration_notes.md
      .cache/<tier>.<inputHash>.json
```

`OUTPUT/` mirrors the input tree so output location is derivable from source location in
both directions.

---

## 4. Phases

Each phase ends in something runnable. Phases 0–2 involve no LLM calls at all, which is
deliberate: the deterministic substrate should be trustworthy before any model reasons
over it.

### Phase 0 — Contracts and test harness

*Goal:* the shape of every artifact is pinned and machine-checkable.

- Write one JSON Schema per tier under `templates/schema/` from the five templates; wire a
  validator (`ajv`) invocable as `npm run validate -- <file>`.
- Add a **cross-tier referential-integrity checker**: every id referenced in one tier must
  exist in the tier that owns it, and every `doc.evidence` id must resolve to an `ast` id.
  This is the check that enforces "no fact stored twice, all links valid" — the invariant
  the whole split rests on. Wire it into the same command.
- Fix the id conventions (`method:<name>`, `tpl:<id>`, `dep:<name>`, unit ids) as schema
  patterns — every later stage references them, so drift here is expensive.
- Build `fixtures/`: small hand-written Angular files, each isolating one construct
  (signal inputs vs decorator inputs, `inject()` vs constructor DI, `@if` vs `*ngIf`,
  reactive vs template-driven forms, `takeUntilDestroyed` vs manual unsubscribe). These,
  not `INPUT/`, are what extractor unit tests run against.
- Golden-file test runner: fixture → expected `extracted` JSON, diffed.

*Exit:* schema validates the template; empty test suite runs green.

### Phase 1 — Resolver: deterministic extraction

*Goal:* `ng-ast <unit-dir>` emits a schema-valid `extracted` block.

Build extractors in dependency order, each with fixture tests:

1. Unit discovery and classification within a folder; file-role assignment.
2. Decorator metadata; class member inventory (fields, accessors, methods, visibility, types).
3. Public API: inputs/outputs/models across **all three** declaration styles
   (decorator, signal-based, setter-based) — mixed styles in one repo are the norm.
4. Dependency injection: constructor params and `inject()`, with modifier flags.
5. Per-method analysis: local calls, injected-member calls, field read/write sets,
   `sideEffectHints`.
6. Call graph → `executionOrder` (leaf-first topological sort, cycles reported not crashed).
7. Reactive state: signals and their dependencies; RxJS streams, operator chains,
   consumption style, and `unsubscribeStrategy`/`leakRisk`.
8. Forms: control tree, validators, submit/reset/patch handlers.
9. Template parse → control flow, bindings, events, interpolations, child components,
   directives, pipes, refs, projection, a11y attributes, i18n, raw-HTML sinks.
10. Styles, routing, HTTP interactions, imports classification, data types, spec-file cases.
11. Metrics; diagnostics into `review.resolverWarnings`.

*Cross-cutting:* never throw on unparseable input — degrade, set `parseStatus`, record a
warning. A pipeline that dies on one malformed file cannot process a real repo.

*Exit:* every fixture produces a schema-valid, golden-matched `extracted` block;
`executionOrder` is correct on a fixture with nested and cyclic calls.

### Phase 2 — Repo inventory and cross-unit graph

*Goal:* `ng-ast index <src-root>` emits `index.json`.

- Walk the source root; classify units; skip `node_modules`, build output, generated dirs.
- Resolve internal imports and template selectors to unit ids (a selector index built from
  every component/directive decorator in the repo).
- Emit: unit list, dependency edges, leaf-first processing order, route tree, and
  reverse-dependency lists (so `inferred.publicContract.consumedBy` can be populated from
  fact rather than inference).
- Report unresolvable selectors/imports rather than dropping them.

*Exit:* running on a multi-unit synthetic fixture yields a correct graph and order.

### Phase 3 — Agent wiring, one unit end to end

*Goal:* the orchestration skeleton works with deliberately shallow prompts.

- Define the three subagents with least-privilege tools: `resolver` (Bash-limited to
  `ng-ast`, Read, Write), `explainer` (Read only — no filesystem writes), `synthesizer`
  (Read, Write).
- Orchestrator: read `index.json` → for each unit, invoke the three stages → assemble
  the five JSON tiers → validate schemas and referential integrity → render
  `requirement.md` and `migration_notes.md`.
- Author `skills/angular-semantics/` first, since both LLM stages depend on it: the rules
  for translating Angular constructs into framework-independent statements, and the
  standing prohibition on naming a target framework.

*Exit:* one fixture unit produces five schema-valid JSON tiers and a rendered
`requirement.md`, with placeholder-quality prose.

### Phase 4 — Explainer (map stage)

*Goal:* accurate per-symbol explanations at usable granularity.

- Input per call: one symbol's source, its callees' *already-written* explanations
  (available because of `executionOrder`), the field/dep signatures it touches, and any
  spec cases targeting it.
- Batch trivially small symbols (one-line getters, pass-through delegates) into a single
  call; the description's granularity concern is best handled by a size/complexity
  threshold rather than by prompt pleading.
- Require `confidence` and forbid invented behavior: if the snippet's purpose is not
  determinable from the provided context, that becomes an entry in `review.openQuestions`.
- Tune against fixtures with known-correct explanations; iterate on the threshold.

*Exit:* `inferred.functionExplanations` covers every non-trivial member, ordered, with
`coverageAssessment` populated.

### Phase 5 — Requirements Synthesizer (reduce stage)

*Goal:* the primary deliverable.

- Write `templates/requirement.md` first — the Synthesizer's job is to fill a fixed
  outline, and it is far more reliable filling a structure than inventing one. Sections
  follow the ten responsibilities enumerated in the description: purpose, public contract,
  external dependencies, state and data flow, UI requirements, behavioral workflows,
  lifecycle, invariants, migration-sensitive behavior, open questions, and suggested
  functional breakdown.
- Author `skills/requirements-writing/`: the description's "Requirements Skill File" —
  how to phrase a behavioral requirement, how to convert each Angular template construct
  into a framework-independent statement, and the prohibition on target-framework design.
- Single comprehensive call over the aggregate (`extracted` + explanations + dependency
  context), per the description.
- Enforce the evidence rule mechanically: post-validate that every `inferred` entry's
  `evidence` ids exist in `extracted`. Dangling evidence is a hard failure, not a warning
  — this check is what keeps the LLM stages honest.
- Build the **renderer** (deterministic, no LLM — see **D2a**): `analysis.json` plus the
  cited ast tiers in, `requirement.md` and `migration_notes.md` out. Implement the
  section-hash marker protocol so human edits are never overwritten, and add the
  re-render-and-diff consistency check to CI.

*Exit:* a fixture unit's `requirement.md` is judged accurate on human read; all evidence
ids resolve.

### Phase 6 — Scale and orchestration

*Goal:* run over a whole repo without manual babysitting.

- Content-hash caching per D6; `--force` to bypass.
- Resumable runs (per-unit status in `index.json`); one unit's failure does not abort the run.
- Parallelism across independent units, respecting the topological order.
- Context budgeting: for oversized units, degrade explicitly (chunk the Synthesizer input
  and record the degradation in the output) rather than silently truncating.
- Run summary: units processed, cached, failed, degraded; aggregate risks and open questions.

*Exit:* full-repo run completes with a summary and no unhandled failures.

### Phase 7 — Evaluation and the review loop

*Goal:* know whether the output is good, and let humans correct it.

- Only now consult `INPUT/` as the held-out corpus. Everything before this is designed and
  tested against synthetic fixtures, so the fixture repo genuinely tests generality.
- Rubric per unit: factual accuracy, completeness against `extracted`, framework-neutrality,
  actionability, risk-flagging recall.
- Cheap automated proxies: coverage ratios, evidence-resolution rate, count of members with
  no explanation, count of template nodes with no corresponding UI requirement.
- Adversarial check: does a requirement claim behavior contradicted by the spec files?
- Review loop: reviewer edits `requirement.md`, sets `review.status`, resolves blocking
  questions. Re-runs must never clobber human edits — diff and prompt, or write alongside.

*Exit:* a scored evaluation report over the corpus, with `review.status = approved`
achievable on a representative sample.

---

## 5. Principal risks

| Risk | Mitigation |
|---|---|
| Confidently wrong `extracted` data poisons every downstream stage | Determinism invariant + golden fixture tests + honest `parseStatus`/warnings. Never guess silently. |
| LLM fabricates behavior not present in the code | Mandatory `evidence` ids, mechanically validated; `openQuestions` as the sanctioned escape hatch; `confidence` fields. |
| Explainer granularity wrong (too fine → noise, too coarse → lost detail) | Complexity-threshold batching, tuned on fixtures; the description already flags this as needing iteration. |
| Requirements drift toward prescribing React | Prohibition encoded in the shared skill file, plus a lint pass for target-framework vocabulary in generated prose. |
| Template parsing is the weakest extractor, and UI requirements depend on it entirely | Version-matched `@angular/compiler` where possible; `parseStatus` surfaced into `review`; template coverage ratio tracked as an eval metric. |
| Human review does not scale to a large repo | Risk-ranked processing order; `coverageAssessment` and blocking-question counts let reviewers triage. |
| Cost of full-repo LLM passes | Content-hash caching, batching, and the entirely LLM-free Phases 0–2. |

---

## 6. Immediate next steps

1. Confirm or reject decisions **D1–D6** — particularly **D3** (compiler API before grep),
   which contradicts the description's stated first cut.
2. Write `templates/schema/*.schema.json`, the referential-integrity checker, and the
   fixture set (Phase 0).
3. Stand up `tools/ng-ast/` with extractors 1–3 and their golden tests.
