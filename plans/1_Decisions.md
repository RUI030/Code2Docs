# Code2Docs — Decisions

Decision records for Code2Docs. `0_ProjectDescription.md` defines intent;
`2_ImplementationPlan.md` defines build order. This file records the choices both rest on.

Each entry states the problem, the resolution, and the reasoning — the reasoning especially,
since that is what tells a future reader whether a decision still applies once conditions
change. Entries are referenced by id from the other documents.

**Conventions.** Decisions are append-only. A choice that turns out wrong is not edited away;
a later decision supersedes it and says so explicitly, so the reasoning that led there stays
legible. Sub-lettered ids (D2a, D2b) refine their parent rather than replacing it. Once this
list passes roughly a dozen entries, split it into `decisions/D<n>-<slug>.md`, one per file.

---

## Open items

None blocking. Phase A's review gate still needs a reviewer who reads Angular — see
`2_ImplementationPlan.md` Phase A.

---

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

**Status: accepted.**

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

Text search still ships alongside — see **D3a** for the roles it keeps.

Templates are the one place to phase: start with `@angular/compiler`'s
`parseTemplate` if it resolves cleanly against the target repo's Angular version;
otherwise begin with a conservative HTML parser plus binding-syntax extraction and
upgrade later. Record `template.parseStatus` honestly either way.

### D3a — Text search ships alongside the compiler, in a strictly separate role

Both capabilities are exposed. The agent reaches for the compiler first and falls back to
text search when it wants breadth. Text search keeps four legitimate jobs:

1. **Discovery** — the coarse repo-wide inventory sweep (**D5** Pass A), where only rough
   classification is needed and precision would be wasted.
2. **Reach beyond TypeScript** — string literals, comments, TODOs, config files, and
   anything in a file the compiler does not model.
3. **Degraded fallback** — a file that fails to parse still yields something rather than
   nothing, with `parseStatus` set honestly.
4. **Audit** — the valuable one. Run both and compare counts: if text search finds nine
   mentions of `@Input` and the compiler reported seven, that gap is a bug signal. This makes
   grep a cheap continuous check on extractor recall, which is otherwise the hardest property
   to verify. Mismatches become `warnings` entries, not silent discrepancies.

**The rule that makes this safe: text-search results never write into `ast` fields.** The
`ast` tiers are authoritative and deterministic (**D2**); quietly merging fuzzy matches into
them would destroy that invariant and, worse, corrupt the omission metric the extractor
exists to provide — a field half-filled by grep would look complete. Text-search findings
either land in `warnings`, or are surfaced to the agent as exploration context that never
reaches the artifacts unmodified.

### D4 — Resolver ships as a Node CLI invoked via Bash, not an MCP server

The description says "a JavaScript tool registered with Claude Code." The simplest form
that satisfies it: a Node CLI that takes a path and prints JSON to stdout — written here as
`tools/ng-ast/`, built as `tools/resolve.mjs` with the extractors under `tools/resolve/`.
It is runnable and testable outside any agent, trivially allowlisted for the
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

Cache each tier's `ast` content keyed by a hash of the unit's input files + resolver
version, and its `doc` content keyed by that hash + prompt/model version. Re-running on an unchanged repo
should cost nothing. This matters more than it sounds: tuning Explainer granularity (which
the description flags as needing iteration) means many repeated runs.

---

### D7 — Prove the output before building the extractor

Phases 0–2 as originally ordered front-load schema and extractor work before anything
checks that the *deliverable* is useful. If the requirement template turns out to be the
wrong shape, that investment is wasted. So a skills-only POC (**Phase A**) runs first: one
agent, reading Angular source directly, producing `requirement.md` for a single component.

Beyond de-risking, this inverts the schema design: the five templates are currently
speculation about what a consumer needs, and the POC reveals which fields actually get used.
Consequently JSON Schema enforcement stays deferred until Phase 0 — strict validation would
only fight a POC whose purpose is to discover the right shape.

The cost of this ordering is that Phase A cannot prove reproducibility or completeness. That
is accepted, and Phase A's hand-filled baselines are how completeness gets measured later.

---

### D8 — Run one-shot first; test the map/reduce decomposition only after the Resolver exists

Two independent axes were being conflated, and separating them settles the sequencing:

- **Whether the Resolver/AST tooling is needed.** It is, unconditionally — for determinism,
  recall, cross-file selector resolution, caching, and scale on large repositories. No POC
  result changes this. A successful one-shot POC says nothing against the tools.
- **Whether the Explainer stage earns its place** — explaining each function bottom-up and
  reducing, versus synthesizing in a single pass. This is genuinely open, and if one-shot
  wins, an entire stage disappears from the design.

Phase A therefore runs **one-shot only**. The staged comparison is deferred to Phase 4, once
a verified call graph exists.

Deferring is not merely simpler — it **removes a confound**. A staged run without tooling
requires the agent to derive the call graph and leaf-first ordering itself, which is exactly
the unreliable class of fact (see D3). If staged output scored worse, nothing would
distinguish "the decomposition is bad" from "the derived ordering was wrong." Once the
Resolver supplies the ordering, the comparison isolates the single variable it is meant to
test.

**Scope of any conclusion.** A favourable one-shot result on medium components does not
settle the question for large ones. The Explainer's strongest justification may be context
budgeting rather than accuracy: a component too large to reason about in one pass needs
decomposition regardless of what it does for quality. Phase A therefore samples at least one
deliberately large component, and any decision to drop the Explainer must state the size
range it holds for.

**Skill consequence.** Phase A authors three skills — `angular-semantics`,
`requirements-writing`, `migration-risk-flagging` — all of which a one-shot run exercises.
`explaining-functions` is written in Phase 4 alongside the comparison that justifies it,
rather than speculatively now.

### D9 — Drop the Service Layer / UUIP section

**Status: superseded by D10.**

The `requirement.md` draft carried a "§7 Service Layer — Universal UI Project, aka UUIP"
heading with no content. UUIP is a company-specific term that nobody on the project can
currently define, so there is no way to write rules for filling the section or to judge
whether what appears there is correct.

Removed from `requirement.md` and `analysis.json`. A vaguely-titled section with no rules is
where an LLM reliably invents plausible filler, and unreviewable filler in a document whose
entire purpose is human sign-off is worse than an absent section.

Re-add if UUIP gets defined. The scope question decides where it goes: something each
component says specifically belongs in `requirement.md` backed by `analysis.json`, while one
architectural fact about the whole project belongs in the repo-level `index.json` — repeating
it per component would be the duplication **D2** exists to prevent.

### D10 — Keep the section as "Service Layer"; supersedes D9

D9 removed the section because "UUIP" was undefinable. Dropping the *name* was right;
dropping the *section* was an overcorrection. A service layer is a real Angular concept
independent of any company's term for it, so the section stays, renamed and given a
definition it can actually be filled against.

**What it holds, and why it is not a duplicate of §5.** §5 (Dependencies & External
Integrations) is an *inventory* — which services this component uses and for what. §6 is the
**shared-state contract**: which service state outlives this component, which of it this
component mutates, and who else is coupled through it.

That distinction earns a separate section rather than a bullet under §5, because
`mutable-service-state` is one of the highest-severity items in the migration risk taxonomy
and the one a component-level reading most easily misses. Angular components routinely share
data by mutating a long-lived service; that coupling is invisible from inside any single
component, and burying it under "Dependencies" hides the thing most likely to break silently
in a rewrite.

**It is only partially derivable from one component — say so rather than guess.** "Who else
writes to this service's state" needs the repo-wide index (**D5** Pass A, inbound edges),
which does not exist until Phase 2. So a component-scoped run can state what it sees ("this
component mutates `CustomerService.selected`") but not the other half ("and four components
read it"). `consumersKnown: false` marks the difference, and unknowns become entries in
`review.openQuestions`. The `requirements-writing` skill must make that explicit — an
under-determined section is exactly where a model fabricates confident coupling claims.

The section therefore starts thin in Phase A and fills out at Phase 2, which is honest
degradation rather than a gap.

### D11 — Compare against Phase 2, not Phase 1; measure by unresolved blocking questions

Two changes to how the skills-versus-tooling comparison gets run, both prompted by
`3_PhaseAFindings.md`.

**Defer the comparison to Phase 2.** The original intent was to diff Phase 1's extractor
against Phase A's hand-filled baseline to quantify recall. That comparison is worth running,
but on its own it measures the wrong thing. F3 found that both *blocking* open questions on
`post/update` — how a failed save reaches the person, and whether the unreachable file-handling
code is genuinely dead — need repository-wide information. Phase 1 is per-file extraction and
answers neither. So a Phase 1 comparison would show improvement on naming and reachability
(F2, F4) while the review gate remained just as blocked, which is not the question the
comparison exists to answer. Comparing at Phase 2 spans all three findings and can show whether
the gate actually moves.

*Cost of deferring, and the guard against it.* Two phases with no intermediate signal is a long
time to build without feedback. The guard is not a full document comparison but two targeted
checks when Phase 1 lands: does extraction close F2 (names anchored to real identifiers) and F4
(reachability verified rather than manually searched)? Those are unit-level and cheap. The
baseline must also be pinned — `examples/baseline_skillsonly/` is committed, but the skills
that produced it are not frozen, so the producing commit needs a tag or "Phase A" stops being
reproducible.

**Keep the spec-title check, but as a regression guard rather than a ranking metric.** Phase A
covered every test title in both components — 4 of 4 and 8 of 8. That is a real result and is
recorded as one: on the measure the plan defined, Phase A performed perfectly.

The consequence is only that the measure is now at its ceiling. It cannot rank a later phase
above Phase A, because there is nothing above 100%. That makes it a guard, not a discriminator:
coverage must stay at 100%, and a later phase dropping below it is a regression signal worth
acting on. It keeps that job; it just cannot carry the comparison.

**The discriminating metric is the count of unresolved blocking questions.** It is non-zero
today (`post/update` 2, `activate` 0), so it can move. It is tied to what the project is for —
the review gate forbids Stage 2 while a blocking question stands, so this measures whether the
pipeline produces documents anyone can act on. And F3 already identifies what drives it to
zero, which makes it a target rather than just a number.

This does not supersede the recall diff against the hand-filled JSON baseline (Phase A's stated
second payoff). That still runs at Phase 1 as a component of the Phase 2 comparison; it is no
longer the whole of it.

### D12 — Split `streams` across tiers by access pattern; compute `leakRisk`

`templates/functions.json` defined `streams`; both Phase A instances emitted it into
`dependencies.json` instead, so two tiers accepted the same record — the duplication **D2** and
invariant #1 exist to prevent (`3_PhaseAFindings.md` F5b).

**The record was never one kind of fact.** Five fields describe the declaration
(`declaredType`, `sourceExpression`, `operators`, `multicast`, `loc`); four describe
relationships (`consumedBy`, `consumption`, `unsubscribeStrategy`, `leakRisk`). Neither tier was
wrong, because neither tier fits a record that is two things.

**Resolution: split it exactly as a method is already split.** That pattern is established and
one third of it was already applied to streams — `signature.stateOutline.streamIds` declares the
id, just as `methodIds` does:

| | declares the id | relationships | declaration detail |
|---|---|---|---|
| a method | `signature.stateOutline.methodIds` | `dependencies.callGraph` | `functions.symbols` |
| a stream | `signature.stateOutline.streamIds` | `dependencies.streams` | `functions.streams` |

Nobody would propose storing a method body in `dependencies.json`. The same reasoning settles
streams, and it is a consequence of the tier rule rather than a new exception.

The objection is that one record now spans two files. But the question actually asked of this
data — *does this leak?* — needs only `consumption` and `unsubscribeStrategy`, both in the
relationship half, so the frequent read stays a single file. That is what the split is for.

**`leakRisk` is computed, not stored.** It is a function of `consumption` and
`unsubscribeStrategy`. Storing a derivation alongside its inputs lets the two disagree, and then
neither can be trusted — invariant #1 applied to a field rather than a file. It moves to render
time. `subscribedFrom` is added in its place, which is a fact rather than a judgment.

**Versioning.** `dependencies` and `functions` go to schemaVersion 0.3.0; `signature`,
`template` and `analysis` stay 0.2.0. Tiers version independently, since a change to one need
not invalidate the rest.

The Phase A baseline is 0.2.0 and cannot be migrated — it is tagged `phase-a-baseline` and
pinned as the Phase 2 comparison target, so rewriting it would falsify the artifact. The
validator therefore reports an instance whose `schemaVersion` predates its schema as **legacy**
and does not validate it, rather than failing it. Without that, a schema change would be either
blocked by history or would silently drop history from the suite.

Verified end to end by `examples/schema-probe/activate`, a complete four-tier unit at the new
version: 21 ids declared, 67 references, nothing dangling.

### D12a — The id space mirrors what the language names; anonymous streams get no id

D12 split the stream record across tiers, joined by `stream:<name>`. Phase 1's extractor then
could not produce that join key. Checking the corpus, **all six stream ids in both components
are invented** — not one stream is assigned to a field in source. `analysis.json` cites four of
them as evidence.

So the join key D12 rests on is unreproducible by construction, and this is the normal case
rather than an edge case: an RxJS chain is usually built and subscribed in one expression.

**Rule: an id exists only where the source provides a name.** `items$ = this.http.get(...)`
gets `stream:items$`. A chain built and subscribed inline gets nothing, and is recorded as an
attribute of the symbol that subscribes it — `functions.symbols[<method>].ast.subscriptions[]`.

**Why this is the stable choice, precisely.** It does not produce a better identifier; it
produces none, which is the mechanism. Two inline subscriptions in one method still need
distinguishing, so an index returns — but *inside* the method's record, where nothing can cite
it. A local index that renumbers breaks no evidence; a global id that renumbers breaks every
citation. Instability only does damage where something points at it.

The alternatives were positional (`stream:ngOnInit#1`), which churns whenever a subscription is
added above it; source-location (`stream:L22`), which churns on any inserted line; and a name
derived from the expression, which is reproducible but collides, needs a suffix rule that
reintroduces ordering, and encodes a guess at intent — `doc` content wearing an `ast` id.

**And it is the cheapest decision to reverse.** Adding identity later is easy. Removing an id
that four evidence citations already point at is not.

**What it costs.** A method with two inline subscriptions can be described as leaking, but not
*which one* leaks. Four evidence citations in this corpus become method-level. If that
granularity is ever needed, a scoped path (`method:ngOnInit/subscription[0]`) is citable and
deterministic, with churn contained to one method. Not built until something needs it.

**Consequence for D12.** The split still holds for *named* streams, which is what it was written
for. Anonymous subscriptions are not split at all: with no identity, nothing else references
them, so the access-pattern split has nothing to buy and they live wholly on the owning symbol.

**Versioning.** `signature` → 0.3.0, `dependencies` → 0.4.0, `functions` → 0.4.0. The narrowing
of `streamIds` and `streams` changes what those fields *mean* without changing their shape,
which is exactly the kind of change a validator cannot catch and a version must therefore
signal. The Phase A baseline now predates both D12 and D12a and is reported wholly as legacy —
correct, since every stream id in it is one this rule forbids.

### D13 — Template node ids are numeric and positional, as D2 already said

**This is compliance, not a new choice.** D2's example ids read `method:save`, **`tpl:12`**,
`dep:fooService`. Phase A and the schema probe both emitted semantic names instead —
`tpl:if-success`, `tpl:btn-save`, 23 of them across the corpus — and nothing caught the drift
(F8a). A parser returns a node at a position; it does not return a name, so none of those 23 is
reproducible.

**Rule.** `tpl:<n>`, `tpl-handler:<n>`, `hostbind:<n>`, `hostlisten:<n>` — `n` is the 0-based
index of the node in **document order by source start offset**, over the flattened parse. The
`templateNodeId` pattern is tightened to `[0-9]+` so a semantic name fails validation rather
than passing as data.

D12a's principle does not apply here. It says the id space mirrors what the language names, and
a template names nothing — but `uiRequirements` must cite template nodes and invariant #2
requires evidence to resolve, so "no id" is unavailable. Where the language provides no name, a
**positional rule** is the fallback, and it must be stated rather than improvised.

**Correcting the severity in F8a.** That finding argued a template edit silently re-points a
citation: `ui:3` cites `tpl:12`, the template changes, and `tpl:12` is now a different node
while still resolving. On inspection the window is narrower than claimed. `analysis.json`'s
`inputHash` covers the `ast` tiers, so editing a template invalidates `template.json` *and*
`analysis.json` together; ids and the citations to them are rewritten in the same run. The
mismatch cannot arise from ordinary regeneration.

**What remains, and why it needs nothing new.** The residual case is a human-approved
`requirement.md` outliving a template change. **D2a already covers it**: machine-owned regions
carry a content hash, a mismatch marks the region human-owned and it is never overwritten, and
the fresh machine version is written alongside as a diff to accept or reject. A human-owned
section holds prose, not ids, so there is no citation to go stale — only prose that may now be
wrong, which is precisely what D2a's diff exists to surface.

So no per-node content hash, no stable-identity scheme, no extra machinery. Positional ids are
sufficient because the pipeline regenerates citations with the nodes, and the one case where it
does not is already a solved problem.

**Cost, stated plainly.** `tpl:12` tells a human reading `analysis.json` nothing about which
node it is. That readability is what the semantic names were buying, and it is a real loss —
mitigated only by `loc`, which every node carries and which is the thing an editor can actually
jump to. Legibility is not a good enough reason to keep an identifier extraction cannot produce.

### D13a — Template ids number the parsed set, not the recorded set

D13 said `tpl:<n>` is the node's index "in document order by source start offset, over the
flattened parse." The first implementation numbered the nodes the tier *records* instead, and
the difference turned out to matter.

**Numbering the recorded set makes ids a function of the classifier.** Removing one heuristic —
the Bootstrap `alert`/`toast` class match, dropped as vendor-specific — deleted two
`accessibility` records and renumbered everything after them. On a byte-identical template, the
schema probe and the extractor came to disagree about which node `tpl:5` is: the probe's second
`@if`, the extractor's error-message key.

That is worse than churn under source edits, and the reason is asymmetric visibility. Editing a
template changes the file, and every tier regenerates from it together. Changing the extractor
changes nothing on disk, and silently re-points every id in every artifact already generated —
including the pinned Phase A baseline and the probe, which is exactly what D11's Phase 2
comparison is keyed on.

**Rule, corrected.** `n` is the node's index in the **parsed** set: every node the compiler
emits, document order by source start offset, whether or not this tier records it. Ids are
therefore sparse — `tpl:5`, `tpl:9`, `tpl:24` — which is expected and mildly informative.

Verified: recording an extra bucket doubled the recorded count from 6 to 12 and left the two
`@if` ids at `tpl:9` and `tpl:24`.

**The dangling references that prompted the wrong rule were a different bug.**
`coverage.uncoveredNodeIds` listed *parsed* ids, including nodes the tier never recorded, so 24
of them resolved to nothing. It now lists recorded nodes that no `uiRequirement` cites, which is
what "uncovered" was always supposed to mean. With that fixed there is no reason to couple ids
to the classifier at all.

**What ids now depend on.** Source text and compiler version, both recorded in provenance — a
narrower and more visible dependency than "whatever the extractor currently classifies."

**One consequence, stated so it is not a surprise.** Two records may carry the same id when two
buckets hold facts about one node — an element that is both an i18n host and an accessibility
subject. The id names the node, not the record. Anything keyed on ids must treat them as node
identity rather than record identity.

### D15 — One implementation per fact: no two pieces of code doing the same thing

*(There is no D14. One was raised against F10b and dissolved when that finding was corrected;
the id is left vacant so the F10b reference stays legible.)*

Until now this was an unwritten working rule, which is exactly the problem: it governed several
refactors and was recoverable only from commit messages. Stated so it survives the session.

**The rule.** A fact about how this project works — how a TypeScript file is parsed, what the
tier list is, how cyclomatic complexity is counted, which lifecycle hooks are interface methods —
has exactly one definition, and every consumer imports it. Prefer extending an existing module
over adding a parallel one. Prefer a shared helper over a second copy that "happens to agree."

**Why it matters more here than in most projects.** This one emits *metrics*, and F8b's
definition of a bad metric is one that two correct-looking implementations disagree on. The
duplication that actually bit us was never the wasted lines:

- `complexityOf` existed twice. Both agreed. Only one carried the note that `DefaultClause` is
  deliberately not counted — so the copy without the reasoning was one plausible edit away from
  disagreeing, and the resulting numbers would have differed with nothing to say which was right.
- `TIERS` was written out four times in **two different versions** — three listed five tiers,
  golden listed four. Golden's shorter list was *correct* for what it does, but nothing said so,
  so it read as one of the four having fallen behind.
- The component `.ts` was parsed four times per unit, each call site choosing `ScriptTarget` and
  `setParentNodes` independently and identically only by coincidence. `setParentNodes: true` is
  load-bearing — several extractors walk upward via `node.parent`, and a call site that omitted
  it would fail in a way that looks like a missing construct rather than a parse-configuration
  mistake. That is precisely the silent wrongness this project exists to eliminate.

So the cost of duplication here is not maintenance. It is that a divergence presents as a *data*
defect, in the output, indistinguishable from the extraction bugs we are hunting.

**Corollaries.**

- **Schemas are the sole authority on shape.** The hand-written `templates/<tier>.json` were a
  second description of the same structure; their 39 `$comment`s were merged into the schemas and
  the files deleted. Worked examples are the fixture goldens — real, validated output rather than
  placeholders that can rot.
- **Two things that look alike but differ must say so.** `AST_TIERS` and `ALL_TIERS` are named
  separately in `tools/tiers.mjs` so the difference reads as a stated distinction rather than an
  apparent inconsistency. Deduplicating them would have been the *wrong* fix.
- **AST first, text search as a fallback with a declared role.** Restates D3/D3a as a coding
  rule: use the compiler API wherever a construct is in the parse tree; regex is legitimate where
  it is not, or as a deliberate cross-check (`ng-scan`), never as a quiet substitute. F17
  converted the remaining regexes over parse trees.

**Limit.** This is not an argument for premature abstraction. The trigger is a *second* call site
that needs the same answer, not the anticipation of one — and never at the cost of collapsing two
things that are genuinely different, per the second corollary.
