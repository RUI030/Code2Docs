# Phase A Findings

Step 5 of `2_ImplementationPlan.md` §4. Two components, skills-only, no extractor:
`app/account/activate` (simple) and `app/entities/post/update` (complex).

Findings are sorted by **which phase fixes them**, not scored. A count of errors would not
answer the question the gate exists to answer — whether the next investment should be the
Resolver, the templates, or the repo inventory.

---

## F1. Full spec-title coverage — Phase A passes this measure outright

Every spec title is covered in both documents:

| component | test titles | covered | uncovered |
|---|---|---|---|
| `activate` | 4 | 4 | 0 |
| `post/update` | 8 (component) | 8 | 0 |

`post-form.service.spec.ts`'s 7 further titles were correctly excluded as a separate unit
under **D1**, and the document says so explicitly rather than silently.

**Phase A did this part perfectly** — including on the complex component, and including the
judgment call of excluding another unit's tests rather than claiming them as coverage. On the
measure the plan defined, there is nothing to improve.

That is also the one consequence to carry forward: the measure is at its ceiling. It cannot
rank a later phase above Phase A, because there is nothing above 100%. So it keeps a job, just
not the comparison — coverage must *stay* at 100%, and a later phase falling below it is a
regression signal. See **D11** for the discriminating metric that replaces it in that role
(count of unresolved blocking questions, which is non-zero today and therefore can move).

---

## F2. Domain terms drift from both the code and the UI

`post/update`'s form field is `content` in source (`post-form.service.ts:61`,
`post-update.component.html:32`) and renders to the person as **"Content"**
(`post-update.component.html:31`). The document calls it **"body"** six times — including in
§8 *Domain Terminology*, the section written for SME review.

So the one term an SME reads matches neither the identifier a rebuilder greps for nor the label
on the screen they are reviewing. Nothing in the pipeline catches this: it is not an omission,
the behavior is described correctly, and the prose reads fluently.

This is the clearest case of a defect the omission check structurally cannot see.

**Fixed by: Phase 1.** Extraction pins field names to real identifiers, and the template's
labels to real template text, so the doc-writing step is anchored instead of paraphrasing from
memory. This is a concrete, checkable thing the Resolver buys.

---

## F3. Both *blocking* questions are scope failures, not extraction failures

`post/update` raised two blocking open questions. Neither is answerable by better parsing of
the files in the folder:

| blocking question | what it needs |
|---|---|
| How is a failed save reported? (`c.ts:102-104` is deliberately empty; display is delegated to an event bus consumed elsewhere) | who listens to the event bus — repo-wide |
| Should the three unreachable file operations be ported? | whether anything outside the folder reaches them — repo-wide |

`activate` raised the same shape: *"Who else calls the activation service?"*

**Fixed by: Phase 2** (repo inventory and cross-unit dependency graph), not Phase 1.

This bears on build order. The plan runs Phase 1 before Phase 2. On this evidence, completing
Phase 1 would leave every blocking question on both components still open — the review gate
could not pass, and Stage 2 could not begin. Worth deciding deliberately whether that ordering
still holds, or whether a minimal repo-wide symbol index should land alongside the Resolver.

---

## F4. What Phase 1 does buy, concretely

The most consequential claim in the `post/update` document — that `byteSize`, `openFile`, and
`setFileData` are unreachable, and that two injected dependencies exist solely to serve them —
rests on a manual search, which the document itself flags as its reason for lowered confidence.

Spot-checked and it holds: those three names appear only at their own definitions
(`post-update.component.ts:60-68`), with no call site in the template, the spec, or the class.
Two other load-bearing claims also verified exactly — `getRawValue()` carrying the disabled
identifier into the save path (`post-form.service.ts:73`), and the identifier being
simultaneously `Validators.required` and `disabled: true`, making the rule inert
(`post-form.service.ts:51-57`).

That accuracy is real but does not generalize: a manual reachability search is sound across one
folder and will not be across a repository. Verified reachability is a genuine Phase 1
deliverable.

---

## F5. Template fit

All 9 `requirement.md` sections were filled in both documents; no section went unused, none was
padded to look filled. No missing slot was identified — the two documents' hardest content
(unreachable code, inert validation, delegated error display) landed in existing sections
without strain.

**Fixed by:** nothing — *for `requirement.md`*. See the addendum: the JSON tiers are a
different story.

### F5a — addendum: the JSON tiers did need fields, found by validating rather than reading

F5 was written from reading the two documents. Writing `templates/schema/signature.schema.json`
and running it against the same two `signature.json` files found six fields the POC reached for
that the template does not define — invisible to a read-through, mechanical to find:

| field | what it encodes |
|---|---|
| `injectedDependencies[].effectivelyUnused` | F4's finding: injected, but reachable only from dead code |
| `lifecycle.fieldInitializerDoesWork` | the `c.ts:43` ordering hazard — work in a field initializer runs before `ngOnInit` |
| `stateOutline.fields[].isArrowFunctionProperty` | `this` bound at construction; porting to a method changes it |
| `metrics.unreachableMethodCount` | |
| `metrics.effectivelyUnusedDependencyCount` | |
| `$comment_<suffix>` annotations | the tier format's stated convention, used but never specified |

Writing the `dependencies` and `analysis` schemas against their instances added more:

| field / id | what it encodes |
|---|---|
| `field-initializer:<name>` | a call site that is not a method — the form is built in a field initializer, which runs during construction before `ngOnInit`. The id space had no way to name it. |
| `ext:<n>` | a new synthesized id kind, for extension points |
| `publicContract.extensionPoints` | members existing to be overridden by a subclass, not called by a consumer. A generated base class puts real behavior here. |
| `serviceLayer.applicable` | distinguishes "no shared state" from "not analyzed", which an empty array cannot |
| `migration.deadCode` | F4's finding as structured data — methods, dependencies, and whether reachability was *verified* or asserted |
| `migration.isLowerBound` | marks a risk list as known-incomplete. Unmarked, it reads as exhaustive — the exact failure this project exists to prevent. |
| `coverageAssessment.d2aFindings` | D2a experiment artifact; not permanent |

So the corrected form of F5: **`requirement.md`'s section structure needs no revision; the JSON
tiers needed thirteen additions.** Both halves came from Phase A, which is the argument for
running it before building the extractor — but only the second half was findable by machine, and
the first was findable only by reading. Neither method substitutes for the other.

Nothing was deleted. No field defined in the templates went unused across both components.

### F5b — `streams` is emitted into the wrong tier, and the tier boundary needs a decision

`templates/functions.json` defines `streams`. Both Phase A instances emit it at the top level of
`dependencies.json` instead — because no `functions.json` was produced, and the subscription-leak
analysis in the graph tier needs stream detail to say anything.

**Resolved by D12.** The record was never one kind of fact — five fields describe the
declaration, four describe relationships — so it is split the way a method already is, and
`leakRisk` becomes computed rather than stored. Verified end to end by
`examples/schema-probe/activate`.

### F6 — the baseline has six dangling evidence references

`npm run check` on its first run, against the complex component:

```
DANGLING  type:IPost  cited at dependencies/outboundUnitEdges[5]/via
DANGLING  type:IBlog  cited at dependencies/outboundUnitEdges[6]/via
DANGLING  type:ITag   cited at dependencies/outboundUnitEdges[7]/via
DANGLING  type:IPost  cited at analysis/domainRules/terminology[0]/evidence
DANGLING  type:IBlog  cited at analysis/domainRules/terminology[1]/evidence
DANGLING  type:ITag   cited at analysis/domainRules/terminology[2]/evidence
```

`dependencies.json` owns `type:` ids in its `dataTypes` array. The complex component's
`dataTypes` is **absent entirely**, while six places cite ids that would have lived there. The
simple component has the array, empty, and cites nothing — consistent.

Under invariant #2 dangling evidence is a hard failure, so **the Phase A baseline does not pass
the gate the project defines.** Worth stating plainly: the §8 terminology entries for *Post*,
*Blog* and *Tag* — the SME-facing definitions — cite evidence that resolves to nothing.

This is the strongest argument yet for the checker existing. Those six survived a close
read-through of both documents during F1–F5, and took one mechanical pass to find.

*Not fixed here.* The baseline is tagged `phase-a-baseline` and pinned as the Phase 2 comparison
target; editing it now would falsify the thing it exists to preserve. It is recorded as a known
property of the baseline instead, and is a candidate first entry for D11's blocking-question
metric.

### F7 — 24 references cannot resolve because their owning tier was never produced

Distinct from F6 and not a failure: 3 ids on the simple component and 16 on the complex one are
`tpl:` ids owned by `template.json`, which Phase A did not produce, plus 8 acceptance criteria
citing test titles because `functions.json` — which owns `test:<n>` — was not produced either.
The checker reports these separately as `unresolvable` and `unlinked` rather than dangling,
because the honest reading is "not yet extracted", not "invented".

They become dangling the moment those two tiers exist and omit the ids, which makes this a
useful pre-registered check for Phase 1 rather than a problem today.

**Three of the 24 are now resolved.** `examples/schema-probe/activate` defines `tpl:if-success`,
`tpl:if-error` and `tpl:link-login`, and that unit reports clean: 21 ids declared, 67
references, nothing dangling or unresolvable. The prediction held — the ids were real and
waiting for their tier, not invented. The remaining 21 belong to the complex component and to
`functions.json`, neither of which was probed.

---

## Limits of this review

- **Two components from one repository**, both JHipster-generated. Generated code is more
  regular than hand-written code; F5 in particular may not survive a messier sample.
- **Nothing here tests cross-component behavior**, which `2_ImplementationPlan.md:147` names as
  where Angular migrations usually break. F3 is the first evidence of that limit biting.
- **Same-model review.** This pass was performed by the same model family that wrote the
  documents, against the plan's own warning (§131). F2 was found by comparing against source
  text rather than by re-reading the code, which is why it survived; findings that depend on
  re-comprehending Angular should be trusted less.
- **Run 2 was not a cold start** — it inherited run 1's context in the same session. See
  `benchmarks/phase-a.json`.

## Suggested reading of the gate

Phase A produces documents that are accurate and unusually candid about their own limits. The
failures are not in comprehension or in the templates; they are (a) unanchored naming, which
the Resolver fixes, and (b) everything that lives outside one folder, which it does not.

Acted on in **D11**: the skills-versus-tooling comparison moves to Phase 2, and the metric
carrying it becomes the count of unresolved blocking questions.

---

## F8. Audit: what else is invented, and what has no rule

Prompted by D12a. If stream ids were invented, the question is what else is. Three distinct
problems turned up, and they need different answers.

### F8a — `tpl:` ids are the same problem, and worse

The corpus contains **23 template node ids, every one an invented semantic name**:
`tpl:if-success`, `tpl:btn-save`, `tpl:option-blog-empty`. A parser returns a node at a
position; it does not return a name. No extractor reproduces these.

**D2 already specified the answer and practice ignored it.** Its example ids are
`method:save`, **`tpl:12`**, `dep:fooService` — numeric for template nodes. Phase A and the
schema probe both used semantic names instead, and nothing caught the drift.

Unlike streams, "no id" is not available here. `uiRequirements` cite template nodes as
evidence, and invariant #2 requires evidence to resolve, so template nodes must be citable.
D12a's principle — *the id space mirrors what the language names* — gives no answer, because
the language names nothing in a template.

So this needs a **rule**, and the honest options all churn:

| rule | stable under | churns on |
|---|---|---|
| document-order index (`tpl:12`, per D2) | renaming, reformatting | any node inserted earlier |
| structural path (`tpl:0/1/3`) | edits elsewhere in the file | sibling insertion |
| semantic name (current practice) | nothing — not reproducible at all |

**The part that matters is not the churn, it is who is holding the reference.** A human approves
`requirement.md`; later the template changes; `ui:3`'s evidence `tpl:12` now points at a
different node, and nothing detects it because the id still resolves. That is a silent
mis-citation, which is worse than a dangling one — the integrity checker catches dangling.

Unresolved. It blocks nothing today because `template.json` has no extractor yet, and it blocks
`template.json` entirely once there is one.

### F8b — three derived numbers have no definition

`publicApiSurface`, `maxTemplateNestingDepth` and `cyclomaticComplexity` appear in the templates
and schemas with **zero definition comments** between them. This is not hypothetical: the
baseline and the extractor already disagree on `publicApiSurface`, 2 against 0, because the
baseline counted two public signal fields as the de facto external surface and the extractor
counted inputs plus outputs plus public methods. Neither is wrong; there is nothing to be wrong
against.

A number in an `ast` tier reads as measured. Any of these three can differ between two correct
implementations, which makes them useless as a Phase 1 recall signal until defined.

### F8c — reproducible is not the same as correct

Three fields the extractor emits into `ast` are heuristics, not extraction:

- `injectedDependencies[].origin` — a hardcoded list of Angular token names; anything unmatched
  is classified `internal`
- `lifecycle.cleanupStrategy` — regular expressions over the class body text
- `stateOutline.fields[].roleHints.rxjsKind` / `formKind` — substring matching on type text

These are deterministic, so they satisfy the letter of the `ast` contract: same input, same
output, byte-reproducible. They do not satisfy its intent. `ast` content is meant to be *fact
read from syntax*, and a guess that is reproducibly wrong is more dangerous than an absent
value, because the `doc` stages elaborate on it in good faith — which is exactly the failure
mode D3 gives for choosing the compiler over grep, reappearing inside the compiler-based
extractor.

Worth marking these as inferred rather than extracted, so a consumer can tell the difference.

### F8d — what checked out clean

`unit.id`'s path segment **is** defined — "relative to the Angular source root", stated in both
`templates/signature.json` and `common.schema.json` — and the baseline and probe agree. The
earlier disagreement was my own `--unit-path` argument, not a missing rule.

### F8e — two construct gaps, found from the docs in one pass

- **Deferred blocks are missing.** `templates/template.json`'s `construct` vocabulary is
  `@if | @else-if | @else | @for | @empty | @switch | @case | *ngIf | *ngFor | ngSwitch`. Angular
  17 also has `@defer`, `@placeholder`, `@loading` and `@error`, which change *when* content
  renders — squarely the kind of behavior this project exists to preserve.
- **Two lifecycle callbacks are missing.** The extractor knows eight `ngOn*`/`ngAfter*` hooks;
  the lifecycle guide also documents `afterRender` and `afterNextRender`, which
  `analysis.lifecycleBehavior.orderingConstraints` would want.

Both were found by reading fetched documentation against our own vocabulary, which argues for
doing that deliberately rather than incidentally.
