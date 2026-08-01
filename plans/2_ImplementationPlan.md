# Code2Docs — Implementation Plan

Build order and phase-by-phase tasks. Scope, artifact model, and success criteria live in
`0_ProjectDescription.md`; the decisions this plan rests on are recorded in `1_Decisions.md`
and referenced here by id (**D1**–**D8**).

Two stages: a skills-only proof of concept (**Phase A**) validates the deliverable at
component level with no tooling, then the production pipeline is built around what it
learned. See **D7** and **D8**.

---

## 1. Artifact layout

```
Code2Docs/
  tools/ng-ast/            # Resolver CLI (Node + TypeScript Compiler API)
  tools/ng-scan/           # text-search capability: discovery, non-TS reach,
                           #   degraded fallback, and recall audit (D3a)
  templates/
    requirement.md         # rendered behavioral spec             [written]
    migration_notes.md     # rendered target-framework hazards    [written]
    schema/*.schema.json   # one per tier -- SOLE authority on shape,
                           #   field semantics and tier purpose    [written]
    schema/index.schema.json # repo-level inventory                [Phase 2]
                           # (the hand-written templates/<tier>.json were merged
                           #  into the schemas; worked examples are the fixture
                           #  goldens, which are real and validated)
  .claude/skills/          # auto-discovered by location; no registration needed
    angular-semantics/     # Angular→framework-independent rules, shared by LLM stages
    requirements-writing/  # the "Requirements Skill File" of the description
    migration-risk-flagging/ # hazard taxonomy → migration_notes.md
    code2docs-analyze/     # workflow entry point, invocable as /code2docs-analyze
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

## 2. Phases

The build has two stages. **Phase A** is a proof of concept that validates the *deliverable*
using skill files alone — no tooling, no schema enforcement, one agent. Everything after it
builds the production pipeline, informed by what Phase A learned. Phases 0–2 then involve no
LLM calls at all, which is deliberate: the deterministic substrate should be trustworthy
before any model reasons over it.

Each phase ends in something runnable.

### Phase A — Skills-only proof of concept, one-shot (no tools)

*Goal:* establish that an agent reading Angular source directly can produce an accurate,
reviewable `requirement.md` for a single component — and learn which metadata fields
actually earn their place.

*Scope:* **component level only**, and **one-shot only** — a single synthesis pass, not
explain-then-reduce. Page-level work waits for the POC to succeed; the staged comparison
waits for the Resolver (**D8**).

**Single-pass, not a miniature pipeline.** The Explainer→Synthesizer map/reduce depends on
leaf-first execution order, which depends on the call graph, which depends on the Resolver.
With no Resolver there is no ordering, so that structure has nothing to stand on. Phase A is
therefore *one* agent doing one pass, and it validates the **output format**, not the
**architecture**. Those are separate bets; conflating them yields a POC that appears to
prove more than it does.

*Tasks:*

Write three skills — every one of which a one-shot run exercises. Keep them **thin**:
authoring the exhaustive Angular catalogue up front is speculation, and POC failures are a
better guide to what belongs in it than intuition is.

- `.claude/skills/angular-semantics/` — shared reference: how to read Angular constructs
  (decorators, DI, lifecycle hooks, template syntax, RxJS, forms, routing) and what each
  implies about behavior. Structure as `SKILL.md` (index plus core rules) with long
  catalogues in `references/*.md`, consulted on demand rather than always resident.
- `.claude/skills/requirements-writing/` — procedure: how to phrase a framework-independent
  requirement, how to fill `requirement.md` section by section, the standing prohibition on
  naming the target framework, and when to raise an open question instead of guessing.
  Reference `templates/requirement.md` rather than restating its outline — two copies of the
  section list would drift.
- `.claude/skills/migration-risk-flagging/` — procedure plus hazard taxonomy, feeding
  `migration_notes.md`. **The skill must state that its own output is a lower bound.** Risk
  flagging pattern-matches against conditions like "subscription with no unsubscribe," which
  presumes every subscription was found; without the extractor that recall is unverified, so
  the skill silently under-reports. Under-reported risk is worse than absent risk because it
  manufactures false confidence.

`explaining-functions` is deliberately *not* written yet — it belongs with Phase 4's
comparison (**D8**).

- Configure one agent with Read/Grep/Glob plus those skills. No `ng-ast`, no MCP, no
  schema validation.
- Select 2–3 components of deliberately varying complexity from `INPUT/`, **including at
  least one deliberately large one** — the Explainer's eventual justification may be context
  budgeting rather than accuracy, and only a large component probes that. This is the first
  legitimate use of the fixture: we are *executing*, not designing, so it no longer leaks the
  answer.
- Produce per component: `requirement.md`, plus a **hand-filled `signature.json` and
  `dependencies.json#/callGraph`**.
- Have someone who knows the code review each output against source, counting **factual
  errors and omissions separately**.

  *Scoring method: the spec-description checklist.* Omissions are invisible from the document
  alone — a doc covering 9 of 12 behaviors reads exactly as complete as one covering 12 — so
  scoring requires a source-side enumeration to check against. `.spec.ts` test titles supply
  one for free: `it('should disable save when the form is invalid')` is already a behavior
  statement in plain English. Extract every test title for the component, then verify each
  appears somewhere in `requirement.md`. Any that does not is a confirmed omission, and the
  check needs no Angular knowledge — it compares two lists of English sentences.

  Its limit, stated plainly: tests cover only part of a component's behavior, so this
  establishes a floor on omissions, not a full measurement. Supplement with an agent-run
  structured cross-check (enumerate behaviors from source, verify each against the doc),
  understanding that it is weaker than independent review — the same system that may have
  misread the code while writing may misread it identically while checking.

  Definitive review is owned by a separate team and is not a blocker for running Phase A.

*Why hand-fill the JSON.* Two payoffs. It tests whether the schema is fillable at all. And
it stores a baseline: when the real extractor runs on the same components in Phase 1,
diffing extractor output against the POC's hand-filled version **quantifies LLM recall**.
Commit these under `examples/`.

*What Phase A proves:* whether the `requirement.md` shape and granularity are right, whether
the skill wording produces usable prose, whether reviewers trust the result, and which
template fields matter.

*What it does not prove:* reproducibility (nothing here is deterministic), completeness,
scale, or cost. And nothing about cross-component behavior — the hardest part of an Angular
migration is usually shared service state and routing, so a clean component-level result is
**not** evidence that page level will go smoothly.

*Discipline:* do not tune the templates against POC dependency data. Declarative facts
(imports, DI, `@Input`/`@Output`, child components, lifecycle hooks) are localized and
syntactically obvious, so an agent gets them substantially right today. Derived facts (call
graph, field read/write sets, execution order, reverse indexes, selector resolution) are
approximations here and must be treated as illustrative until the Resolver exists.

*Exit:* 2–3 reviewed `requirement.md` files judged accurate by someone who knows the code; a
written list of template fields that went unused or turned out to be missing; POC baselines
committed. **Gate:** if reviewers do not find the documents useful, fix the template and
skills before building any tooling — that is the entire point of running this first.

### Phase 0 — Contracts and test harness

*Goal:* the shape of every artifact is pinned and machine-checkable.

- **First, revise the five templates against Phase A's findings.** Delete fields nothing
  used; add fields the POC reached for and could not find. Designing the schema from POC
  evidence rather than from speculation is the main reason Phase A runs first.
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
- Golden-file test runner: fixture → expected `ast` output, diffed.

*Exit:* schema validates the template; empty test suite runs green.

### Phase 1 — Resolver: deterministic extraction

*Goal:* `ng-ast <unit-dir>` emits schema-valid `ast` content for `signature.json`,
`dependencies.json`, and `template.json`.

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

*Text-search capability (D3a):* ship `ng-scan` alongside, and wire the **recall audit** in
this phase rather than later — compare compiler counts against text-search counts for the
constructs where a raw count is meaningful (`@Input`, `@Output`, `inject(`, `.subscribe(`,
lifecycle hooks) and emit any gap as a `warnings` entry. It is a few lines of work and it
catches the failure mode this phase is most exposed to: an extractor that returns seven of
nine and reports success. Enforce the boundary in code — `ng-scan` results must not be
writable into `ast` fields, or the determinism invariant and the omission metric both die
quietly.

*Exit:* every fixture produces schema-valid, golden-matched `ast` output;
`executionOrder` is correct on a fixture with nested and cyclic calls. Diff the extractor's
output against Phase A's hand-filled baselines and **record the omission rate** — this is the
number that justifies the extractor's existence.

### Phase 2 — Repo inventory and cross-unit graph

*Goal:* `ng-ast index <src-root>` emits `index.json`.

- Walk the source root; classify units; skip `node_modules`, build output, generated dirs.
- Resolve internal imports and template selectors to unit ids (a selector index built from
  every component/directive decorator in the repo).
- Emit: unit list, dependency edges, leaf-first processing order, route tree, and
  reverse-dependency lists (so `inferred.publicContract.consumedBy` can be populated from
  fact rather than inference).
- Report unresolvable selectors/imports rather than dropping them.
- Backfill `analysis.json#/serviceLayer/otherConsumers` and flip `consumersKnown` to true
  (**D10**) — the cross-unit graph is what makes the shared-state contract fully answerable,
  and Phase A can only fill half of it.
- This sweep is the primary intended use of `ng-scan` (**D3a**): coarse classification across
  a whole repo, where precision would be wasted effort.

*Exit:* running on a multi-unit synthetic fixture yields a correct graph and order.

### Phase 3 — Agent wiring, one unit end to end

*Goal:* the orchestration skeleton works with deliberately shallow prompts.

- Define the three subagents with least-privilege tools: `resolver` (Bash-limited to
  `ng-ast`, Read, Write), `explainer` (Read only — no filesystem writes), `synthesizer`
  (Read, Write).
- Orchestrator: read `index.json` → for each unit, invoke the three stages → assemble
  the five JSON tiers → validate schemas and referential integrity → render
  `requirement.md` and `migration_notes.md`.
- Author `.claude/skills/angular-semantics/` first, since both LLM stages depend on it: the rules
  for translating Angular constructs into framework-independent statements, and the
  standing prohibition on naming a target framework.

*Exit:* one fixture unit produces five schema-valid JSON tiers and a rendered
`requirement.md`, with placeholder-quality prose.

### Phase 4 — Explainer (map stage)

*Goal:* first establish that this stage is worth having, then make it accurate.

**Run the comparison before building it (D8).** With the Resolver now supplying a verified
call graph, score staged output against Phase A's one-shot baseline on the *same* components:
write `.claude/skills/explaining-functions/`, run explain-bottom-up-then-synthesize, and compare
factual errors and omissions separately. If one-shot wins across the sampled size range, drop
this stage and go straight to Phase 5 — that deletes the Explainer, its skill, and its
orchestration. Record the size range any such conclusion holds for; a large component may
still need decomposition purely to fit the context budget.

The tasks below apply only if the comparison favours staging.

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
- Author `.claude/skills/requirements-writing/`: the description's "Requirements Skill File" —
  how to phrase a behavioral requirement, how to convert each Angular template construct
  into a framework-independent statement, and the prohibition on target-framework design.
- Single comprehensive call over the aggregate (the `ast` tiers + explanations + dependency
  context), per the description.
- Enforce the evidence rule mechanically: post-validate that every `doc` entry's
  `evidence` ids resolve to real `ast` ids. Dangling evidence is a hard failure, not a warning
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

- Evaluate across `INPUT/` at breadth. Apart from the 2–3 components Phase A sampled, the
  corpus is untouched by design work: every extractor was built and tested against synthetic
  fixtures, so the fixture repo still genuinely tests generality.
- Rubric per unit: factual accuracy, completeness against the `ast` tiers, framework-neutrality,
  actionability, risk-flagging recall.
- Cheap automated proxies: coverage ratios, evidence-resolution rate, count of members with
  no explanation, count of template nodes with no corresponding UI requirement.
- Adversarial check: does a requirement claim behavior contradicted by the spec files?
- Review loop: reviewer edits `requirement.md`, sets `review.status`, resolves blocking
  questions. Re-runs must never clobber human edits — diff and prompt, or write alongside.

*Exit:* a scored evaluation report over the corpus, with `review.status = approved`
achievable on a representative sample.

---

## 3. Principal risks

| Risk | Mitigation |
|---|---|
| Confidently wrong `ast` data poisons every downstream stage | Determinism invariant + golden fixture tests + honest `parseStatus`/warnings. Never guess silently. |
| LLM fabricates behavior not present in the code | Mandatory `evidence` ids, mechanically validated; `openQuestions` as the sanctioned escape hatch; `confidence` fields. |
| Explainer granularity wrong (too fine → noise, too coarse → lost detail) | Complexity-threshold batching, tuned on fixtures; the description already flags this as needing iteration. |
| Requirements drift toward prescribing React | Prohibition encoded in the shared skill file, plus a lint pass for target-framework vocabulary in generated prose. |
| Template parsing is the weakest extractor, and UI requirements depend on it entirely | Version-matched `@angular/compiler` where possible; `parseStatus` surfaced into `review`; template coverage ratio tracked as an eval metric. |
| Human review does not scale to a large repo | Risk-ranked processing order; `coverageAssessment` and blocking-question counts let reviewers triage. |
| **Omissions are invisible from the output side** — a document that reads correct may silently miss a method, binding, or subscription | The single most important reason the Resolver exists. Measured by diffing Phase 1 extractor output against Phase A's hand-filled baselines; tracked thereafter as coverage ratios. Review counts errors and omissions **separately**. |
| A clean component-level POC is read as evidence that page level will work | Stated explicitly in Phase A's exit criteria. Cross-component state, routing, and shared service mutation are the hard part and are untested until page level. |
| Cost of full-repo LLM passes | Content-hash caching, batching, and the entirely LLM-free Phases 0–2. |

---

## 4. Immediate next steps

**Phase A is complete.** All five steps ran: the three skills were written, the POC agent
configured, two components analyzed (`app/account/activate`, `app/entities/post/update`),
their artifacts committed under `examples/baseline_skillsonly/`, and the review written up in
`3_PhaseAFindings.md`. The producing state is tagged `phase-a-baseline`; cost and duration are
in `benchmarks/phase-a.json`.

Two results change what happens next:

- **F5 — the templates need no revision.** All nine `requirement.md` sections were filled in
  both documents, none padded, no missing slot identified. Phase 0's first bullet was
  "revise the five templates against Phase A's findings"; the finding is that there is nothing
  to revise, so Phase 0 begins at the JSON Schemas.
- **F3 — the blocking gaps are cross-folder, not extraction.** Both blocking open questions
  need repository-wide information that Phase 1 does not produce. **D11** acts on this: the
  skills-versus-tooling comparison moves to Phase 2, and the metric carrying it becomes the
  count of unresolved blocking questions rather than spec-title coverage, which Phase A already
  saturated at 100%.

**Next: Phase 0**, starting at the schema work.

1. One JSON Schema per tier under `templates/schema/`, wired to `ajv`.
2. The cross-tier referential-integrity checker — the enforcement point for invariant #2.
3. Id conventions pinned as schema patterns.
4. `fixtures/`: small hand-written Angular files, one construct each.

Not blocking: `explaining-functions` and the staged-versus-one-shot comparison wait for
Phase 4 (**D8**). **D3** (compiler API before grep) is **accepted** — see `1_Decisions.md`.

The Phase A baseline is re-run in fresh sessions immediately before the Phase 2 comparison, so
both sides are measured by the same harness on the same day. The numbers currently in
`benchmarks/phase-a.json` are marked provisional because both runs shared one session.
