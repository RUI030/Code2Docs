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

**Three looked resolved, then D13 unresolved them — permanently.** The probe first defined
`tpl:if-success`, `tpl:if-error` and `tpl:link-login`, and the unit reported clean. D13 then
established that template ids are positional, so the probe now defines `tpl:1`, `tpl:5` and
`tpl:4`, and the baseline's semantic names match nothing.

The original prediction was wrong in an instructive way. F7 assumed those ids were "real and
waiting for their tier." They were not real — they were invented names for nodes the template
never named, and no extractor will ever produce them. They are not pending; they are
unreachable, and they stay that way because the baseline is pinned and must not be edited.

That reclassifies part of F7: of the 24, the 19 `tpl:` ids are **unreproducible**, not merely
unresolved. The 8 test-title citations remain genuinely pending — `functions.json` will produce
`test:<n>` ids, and the probe demonstrated it.

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

**Resolved by D13**, which turned out to be compliance rather than a new decision: D2 had
already specified numeric ids and practice had drifted. The severity claimed above was also
overstated — see D13, which corrects it. `analysis.json`'s `inputHash` covers the `ast` tiers,
so a template edit invalidates the citations alongside the nodes and the mismatch cannot arise
from ordinary regeneration. The one residual case, human-approved prose outliving a template
change, is already D2a's merge protocol.

### F8b — three derived numbers have no definition

`publicApiSurface`, `maxTemplateNestingDepth` and `cyclomaticComplexity` appear in the templates
and schemas with **zero definition comments** between them. This is not hypothetical: the
baseline and the extractor already disagree on `publicApiSurface`, 2 against 0, because the
baseline counted two public signal fields as the de facto external surface and the extractor
counted inputs plus outputs plus public methods. Neither is wrong; there is nothing to be wrong
against.

A number in an `ast` tier reads as measured. Any of these three can differ between two correct
implementations, which makes them useless as a Phase 1 recall signal until defined.

**Resolved.** All three now carry definitions in the schemas. `publicApiSurface` counts what a
parent can address and excludes template-read fields. `cyclomaticComplexity` enumerates the
exact node kinds that count. `maxTemplateNestingDepth` became nullable and the extractor now
emits `null` rather than `0` when no template was parsed — it had been claiming a measurement it
never took, which made a flat template and an unparsed one identical.

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

### F8f — `executionOrder` had the same defect, found by running the extractor

The hand-derived baseline and the extractor produce **different** `executionOrder` for the
complex component, and both are correct: a topological order is not unique, and nothing said
which one to emit. Same defect as F8b's three metrics, in a field that matters more, since the
Explainer consumes it directly.

Now defined in the schema: depth-first from each node in declaration order, emitting a node
after its callees. Stated so the field can be diffed at all.

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

---

## F9. The template extractor corrected the hand-derived data twice

Building `template.json` produced two disagreements with hand-derived values, and the extractor
was right both times.

**`maxTemplateNestingDepth`.** Baseline and probe say 4; the extractor says 6. Tracing it:
`div > div > div > @if > div.alert > span > strong`. The `<strong>` nested inside the `<span>`
on line 7 was simply missed by hand, as was one level of wrapper. Nobody counting by eye gets
this reliably, and nothing before now could check it.

**Reachability, verified rather than searched.** With the template supplying entry points, the
extractor independently reports `unreachableMethods` as exactly `byteSize`, `openFile`,
`setFileData` — matching F4, which the baseline itself flagged as its lowest-confidence claim
because it rested on a manual search. It now rests on `@angular/compiler`'s parse plus a
reachability walk. F4 predicted "verified reachability is a genuine Phase 1 deliverable"; it is,
and it agrees.

**Also worth recording: the id rule converged independently.** The probe's `tpl:1` and `tpl:5`
for the two `@if` blocks were assigned by hand during the D13 migration. The extractor, applying
D13's rule to the parse, assigned the same two ids to the same two nodes. A positional rule two
implementations agree on is a rule; that is the property the 23 semantic names never had.

**And a self-inflicted one, caught by having written the definition first.** The extractor's
first implementation counted attributes and text as nesting levels, giving 8 — contradicting the
schema definition F8b had just added. The definition existed before the code, so the mismatch
was visible immediately rather than becoming the de facto meaning of the field.

---

## F10. Vocabulary sweep against Angular 17.3.9 — deliberate, per F8e

F8e found four missing template constructs and two missing lifecycle callbacks *incidentally*,
and concluded the sweep should be done deliberately. This is that pass. Method: dump every
closed set our schemas and extractors enumerate, then diff each against the pinned
`angular-docs/typings/` for 17.3.9 — typings, not guides, per that directory's own README.

Sorted by what each gap costs, not by set.

### F10a — the walker has no fallthrough, so every future gap is silent

`ng-template.mjs` dispatches on node type through a chain of `else if`, handling 13 of the 31
`TmplAst*` classes 17.3.9 defines. There is **no terminal `else`**. An unrecognised node is not
recorded, not counted, and not reported — it simply does not exist in the output.

This is the finding that matters, because the individual construct gaps below are instances of
it rather than independent bugs. Every construct Angular adds after 17.3.9 lands here the same
way: `@let` (v18) and any v19+ block would vanish with a passing test suite, because goldens are
written from the extractor's own output and cannot fail on a node nobody knew to expect.

The fix is general (principle 2): a terminal `else` that emits an `unhandled-template-node`
warning carrying the class name and location. It converts an open-ended class of silent
omissions into flagged ones, and it is the same shape of fix as the structural-directive bug
F9-adjacent notes — that one was found only because a fixture pair happened to cover it.

Of the 18 unhandled classes most are structural (`TmplAstVariable`, `TmplAstSwitchBlockCase`)
and already reached through their parent. One is a real behavioral gap: **`TmplAstIcu`** —
i18n plural/select expressions, which encode pluralisation rules. `template.schema.json` already
has an `i18n` category under `uiRequirements` with nothing feeding it, and every node type
carries an `i18n?: I18nMeta` field the extractor never reads.

### F10b — CORRECTED: `model()` is handled; only `outputFromObservable` is missing

**This finding was originally written as "model() cannot be represented at all" and then
escalated to "it is silently dropped, and the pair check hides it." Both claims were wrong, and
the correction is recorded here rather than edited away, because the mistake is instructive.**

`model()` is extracted correctly. `publicApi.twoWayBindings` holds it as
`{id: "model:selected", name, type, loc}`; `signature.schema.json` gives it its own id pattern
`^model:`; `common.schema.json#/$defs/memberId` lists `model` among its prefixes; and
`golden.mjs` projects it as `twoWay` for pair comparison. `fixtures/inputs-signal` records
`model:selected` and `fixtures/inputs-decorator` records `[]`, which is exactly what the pair's
`mustExtract` demands and why `mayDiffer: ["twoWay"]` is present and correct.

So the design was right all along: `model()` is neither an input entry nor an output entry but a
**third kind of public-contract member**, recorded once in its own array. There is no D14 to make.

The error was reading `publicApi.twoWay`, getting `undefined` because the field is
`twoWayBindings`, and treating absence-of-key as absence-of-fact. Every downstream inference —
that the schema had no slot, that the extractor dropped the declaration, that `mayDiffer`
silenced the evidence — followed from one unchecked key name. **A wrong field name and a genuinely
missing fact look identical from the outside**, which is the same shape as the omission problem
this project exists to solve, arriving via the auditor rather than the extractor.

Worth keeping as method: the claim should have been checked against the extractor source
(`ts-signature.mjs` pushes to `twoWay` on `sig.name === "model"`) before being written up, not
after. A single `grep model` would have settled it.

**What survives.** One genuine gap: `outputFromObservable` (rxjs-interop) has no
`declarationStyle` value. It is an output driven by a stream, so it is both a public-contract
entry and a teardown concern, and today matches none of `eventemitter | output-fn | subject`. That
is a small enum addition plus detection, not a design question.

### F10c — `linkedSignal` is an invented value

`functions.schema.json#/signals/signalKind` allows `linkedSignal`. It does not exist in 17.3.9 —
it is a v19 API. Nothing can ever emit it, and its presence implies a coverage we do not have.
Same class as F8's invented-value audit. Either drop it, or keep it with an explicit
"post-17.3.9, unreachable at the pinned version" comment; silently allowing it is the one option
that is wrong.

### F10d — `@defer` records triggers but not prefetch triggers

`TmplAstDeferredBlock` carries **two** trigger sets, `triggers` and `prefetchTriggers`
(`compiler/index.d.ts`). `ng-template.mjs:236` reads only the first. `@defer (on viewport;
prefetch on idle)` therefore records the viewport trigger and drops the prefetch entirely —
"when does this content load" answered half-right, which is worse than unanswered because it
looks complete. Trigger *arguments* are also dropped: `on timer(500ms)` and `on viewport(ref)`
both flatten to a bare key name.

### F10e — two of our own sets disagree about forms

Not an Angular gap — an internal one, found by laying our sets side by side:

- `signature.schema.json#/stateOutline/fields/roleHints/formKind`: FormGroup, FormControl, FormArray, **FormRecord**
- `functions.schema.json#/forms/groups/controls/type`: control, group, **array only**

`FormRecord` exists in 17.3.9 and is representable in one tier but not the other. Whichever way
it resolves, one of the two is wrong today.

### F10f — the lifecycle set is correct but duplicated

The eight interface hooks match Angular's exactly — no gap. Two notes anyway:

- `afterRender` / `afterNextRender` confirmed absent, as F8e said. They are not interface hooks
  but functions registered in an injection context, so they need a different detection path than
  `LIFECYCLE_HOOKS.has(name)` — which is why F8e's fix has not happened by accident.
- The set is **defined twice**, `ts-signature.mjs:18` and `ts-functions.mjs:15`, and the two are
  currently identical. A closed vocabulary maintained in two places is a drift waiting to
  happen; adding the `afterRender` pair to one and not the other is exactly how it starts.

### F10g — what checked out clean

DI modifiers (`InjectOptions`: optional/skipSelf/self/host) are fully covered. HTTP verbs,
`updateOn` (`change | blur | submit`), view-query types, encapsulation and change-detection
modes all match the typings exactly. `unsubscribeStrategy` and `consumption` cover the real
teardown and consumption idioms including the rxjs-interop ones.

### What this pass is not

A sweep of *enumerations*. It cannot find a field we never thought to add — only a value missing
from a list we already keep. F10a is the mitigation for that class, and it is a detector, not a
cure.

### Disposition

Phase 1 fixes F10a, F10c, F10d, F10f, and F10b's surviving piece (`outputFromObservable`, a
small enum addition). F10e needs one of the two forms tiers declared authoritative. No decision
record is required — the D14 originally raised here dissolved when F10b was corrected.

---

## F11. The warning channel, and three things it exposed on arrival

Phase 1's cross-cutting rule — *never throw on unparseable input; degrade, set `parseStatus`,
record a warning* — had no implementation. `parseStatus` was the literal string `"ok"` in
`ts-signature.mjs`, so the one field that exists to admit degradation could never admit any, and
`provenance.warnings` was an array of free prose.

`tools/resolve/warnings.mjs` now owns it: a closed code vocabulary (unlisted codes throw), a
severity that maps onto `parseStatus`, and a `parseStatus` **derived** from what was recorded
rather than asserted, so the two cannot disagree. Schema-side, `warnings` became structured
objects shared via `common.schema.json#/$defs/warningList`, which bumped all four `ast` tiers.

Three defects surfaced the moment real warnings ran through it. Each had been invisible for the
same reason: nothing was watching the channel they should have used.

**The fallback-compiler warning could never fire.** `findAngularCompiler` searched upward from
the analysed file and reported `vendored: true` on whatever it found. Anything nested inside this
repo — every fixture, and `INPUT/` too — reaches *our* `node_modules` by walking up, so the
Resolver claimed the analysed repo had supplied a compiler it never had, and suppressed the
version-mismatch hazard universally. `vendored` is now decided by whose `node_modules` the file
came from, not by which search found it. All four template fixtures moved to `partial` as a
result — the warning firing for the first time, not a regression.

**The goldens were machine-specific.** `provenance.warnings` embedded
`/home/<user>/.../compiler.mjs`, so a committed golden could only pass on the machine that wrote
it. Messages are relativised through the collector now, and the rule is in the module header
because it will recur.

**`nodesUnrecognized` counted the wrong thing.** It counted `TmplAstUnknownBlock` — *Angular*
failing to parse — while our own coverage gaps read as zero. The two are now separate:
`unknown-block` for the source's failure, `unhandled-template-node` for ours, and the count
reports ours.

`fixtures/i18n-icu` locks the detector in. It is the project's first fixture whose expected output
is **an honest gap rather than a correct extraction**: `parseStatus: partial`,
`nodesUnrecognized: 1`, one warning naming `TmplAstIcu`, and the sibling interpolation still
extracted — proving the walker continues past what it cannot handle. That shape is worth reusing.

### F11a — the validator had stopped validating

Bumping the four schema versions turned every promoted example legacy. `npm run validate` walks
only `examples/`, so it reported **`0 validated, 0 failed`** and exited 0. A green step that
checked nothing, arrived at by a change that looked purely additive.

Two fixes, both general. The walk now includes `fixtures/`, whose 38 goldens are current-version
extractor output and therefore exactly what the schemas should be enforced against — they had
never been schema-checked at all, only diffed against themselves. And `checked === 0` is now a
hard failure: a validator that validated nothing must not be indistinguishable from one that
validated everything successfully.

The general lesson is the one F10a made about goldens, in a second mechanism: **a check whose
scope can silently empty will eventually report success from an empty scope.** Both were found by
reading the summary line rather than the exit code.

---

## F12. Free strings where the value set is closed

Prompted by the question of whether the schemas actually constrain their fields. Audited: **46
closed enums against 206 free strings.** The ratio sounds alarming and mostly is not — nearly
every free string is prose in `analysis`, the `doc` tier, where free text is the correct choice.
`purpose.statement` and `behavioralInvariants[].statement` are sentences for a human, and an enum
would be absurd.

The distinction that matters is not "how many" but **which tier**: `doc` content is prose by
definition, `ast` content is a finite value set by definition. Filtering to the four `ast` tiers,
and setting aside genuinely open values (identifiers, TypeScript type text, expressions, file
paths), three fields were free strings whose value set is closed in fact:

| Field | Emitted values | Now |
|---|---|---|
| `dependencies.inboundUnitEdges[].relation` | same nine as outbound | shared `$defs/unitEdgeRelation` |
| `dependencies.routing.navigations[].api` | `router.navigate`, `router.navigateByUrl` | enum |
| `functions.forms.groups[].builtWith` | `FormBuilder`, `new FormGroup` | enum, nullable |

The first is the interesting one. `outboundUnitEdges[].relation` was already a closed enum;
`inboundUnitEdges[].relation` — **the same relation read from the opposite end** — was a free
string. Two spellings of one concept, one constrained and one not, which is a drift that needs no
mistake to occur: it was already latent in the schema. Both now reference one definition, so the
question "is `provides` a legal relation" has exactly one answer.

`builtWith` is deliberately **nullable** as well as closed. Per the standing rule that a hard
case should raise a flag rather than get a patch, an unrecognised form construction must record
"not determined" plus a warning — never a guess. A free string is what lets a half-matching
heuristic write a plausible wrong value, and a plausible wrong value is the one failure mode this
project cannot tolerate, because nothing downstream can detect it.

**Rule going forward:** in an `ast` tier, a field whose values come from a fixed set in the
extractor gets an enum in the schema. If the extractor cannot classify confidently, the enum
gains `null` and the extractor emits a warning. Free strings in `ast` are for identifiers, type
text, expressions, and paths — things the language itself leaves open.

---

## F13. The template was guessed, not read

`resolve.mjs` located a component's template by filename convention — `<stem>.html` — while
`ts-signature.mjs` separately parsed the real `templateUrl` from the decorator. Two answers to one
question, and no check that they agreed.

Three consequences, in increasing order of harm:

1. A `templateUrl` naming anything other than `<stem>.html` produced a `signature.json` citing one
   file and a `template.json` built from another, or from nothing.
2. An **inline** `template:` yielded no `template.json`, no message, and no warning. A unit whose
   UI behavior was entirely unrecorded was indistinguishable from a unit that has no UI.
3. A declared-but-missing `templateUrl` was indistinguishable from no declaration at all.

The second is the project's own stated worst case — an omission invisible from the output side —
sitting in the orchestrator. And it was **already exercised**: `fixtures/inputs-signal` declares an
inline template and reports `unit.files.templateInline: true`, a field the schema defined and the
signature populated correctly, while the tier that would have recorded the UI was never produced.
The information needed to catch this was in the output the whole time.

Now `readComponentDeclaration` reads the decorator, and the orchestrator resolves that declaration
against disk. Inline templates parse from the literal, with a **line offset** so locations resolve
into the `.ts` at the literal's real line rather than all pointing at line 1. A declared template
that cannot be found is a `template-not-found` warning and `parseStatus: partial`.

Inline `styles:` are still not recorded — `unit.files.styles` holds filenames only. Per the
standing rule that a hard case earns a flag rather than a patch, that now raises a warning instead
of silently reporting an empty style list.

`fixtures/template-inline` + `template-external` are a pair asserting that *where* a template lives
does not change *what* is extracted: same `@if`, same click handler, same interpolation, with
`templateFile` and `templateInline` the only permitted differences. `fixtures/template-missing`
asserts the gap is reported. Both were written from the declaration's semantics, not from what the
extractor happened to produce.

---

## F14. Is the design still aligned with "requirement.md is a deterministic render"?

Asked directly, and worth answering with evidence rather than by restating invariant #3.

**Direction: yes.** `analysis.json` stores *finished sentences* (`purpose.statement`,
`behavioralInvariants[].whyItMatters`), structured `given`/`when`/`then` arrays, and `evidence`
ids. Nothing about the prose resists mechanical assembly, which is what D2a concluded by writing
`requirement.md` first and decomposing it. Storing sentences rather than notes was the right call
and still is.

*(A first pass at measuring this compared prose lines against JSON string values and reported 25%
traceable. That number was wrong — a crude prefix match missing content that is present but
structured, e.g. an acceptance criterion held as `scenario` + `given[]` + `when[]` + `then[]`
rather than as the sentence it renders to. Recorded because it is the second time in this session
a confident finding came from a shallow check of output rather than reading the artifact.)*

**Implementation: three gaps, and D2a already named two of them.** Its conclusion was "viable, but
the schema is not ready to render `requirement.md` faithfully," with three prescriptions. Phase 0
shipped one.

| D2a prescription | Status |
|---|---|
| Add the seven fields the decomposition had to invent | done (F5a) |
| Convert `validationRules` to a structured controls array | **not done** — `stateModel.form` is still a flat generic `claim` array |
| Add `notes`/`context` per section so orientation prose and absence-explanations survive | **not done** — no section has one |

The third gap was found while verifying the other two: **`$defs.claim` is
`additionalProperties: true`**, and most of `analysis.json` is built from it. A deterministic
renderer must know field names in order to emit them. Against an open object it can only hardcode
assumptions the schema does not enforce — which is drift with extra steps, and it is the same
closed-versus-free question that F12 answered for the `ast` tiers, arriving one level up where the
consequences are larger.

Restating D2a's own measurement, since it is the sharpest statement of the gap: rendering *that*
`requirement.md` from *this* schema would lose the field table, five explanatory passages, and
every "notably absent" remark. `propsAndEvents: []` renders as nothing, silently dropping *"None.
Its input arrives through routing instead."*

### F14a — fixed

All three were closed rather than deferred, since the Explainer and Synthesizer would otherwise
be tuned against shapes about to change.

**`$defs.claim` is gone.** Its 18 use sites now have closed, per-location shapes derived from what
the Phase A instance actually carries. The open shape had already caused the drift it invites:
`statement` and `description` were both in use, 19 times each, as the name for "the prose." A
renderer cannot choose between them. Every claim now uses `statement`.

**`stateModel.form` cites rather than restates.** It carries a `controls` array whose entries name
a `control:<group>.<path>` id and add the behavioral meaning; type, validators and disabled state
stay in `functions.json`, where they are extracted. So the renderer builds the table's columns from
the `ast` tier and takes only the meaning from `doc` — which is invariant #1 doing exactly the work
it was written for. Form controls also became citable for the first time: `evidence` could
previously name `form:editForm` but not the identifier field inside it, so any claim about one
control had to cite the whole group.

**`notes` exists on all nine sections.** Evidence-backed like any other claim, so it is a voice for
absence rather than a free-text escape hatch.

**Unit-level `notes` closes the last two.** D2a's friction list had five entries; the section-level
`notes` above answers "empty arrays cannot explain themselves", but two others —
*"unit-level findings have no home"* and *"scoping remarks have no home"* — are about prose that
belongs to no section at all. A top-level `notes` array is their home, and it doubles as the only
place a remark about `workflows` can live, since that section is an array and cannot carry
properties of its own.

`analysis.schema.json` goes to 0.4.0.

**Verified against D2a's own list rather than declared done.** A probe instance was written
carrying all five things D2a said a render would lose — the field table, an explained absence, a
unit-level finding, a scoping remark, and section context — and validated clean:

| D2a said a render would lose | now carried by |
|---|---|
| the six-row field table | `stateModel.form[].controls`, citing `control:` ids |
| "None. Its input arrives through routing instead." | `stateModel.notes` |
| why the dead trio exists | top-level `notes` |
| "the post is handed to the screen already loaded" | top-level `notes` |
| section-level orientation | `<section>.notes` |

**Sequencing.** These belong before **Phase 4**, not at Phase 5 where the renderer is built. The
Explainer and Synthesizer write *into* these shapes, so prompts tuned against a shape that later
changes have to be retuned. The work is cheapest now, while nothing generates them yet — and
`stateModel.form` in particular is largely a projection of what `functions.json` already extracts,
not new extraction.

**Effect on Phase 1 work:** none. The extractors feed the `ast` tiers, which are not implicated —
this is a `doc`-tier shape question. Phases 1 and 2 continue as planned.

---

## F15. The recall audit (D3a), and proving it catches what goldens cannot

Recall is the extractors' hardest property to verify and the one nothing checked. Goldens cannot:
a golden is written from the output it judges, so an extractor that has **always** missed a
construct produces a stable, passing golden forever. The fixture pairs catch a construct handled
in one syntax and not the other, but not one missed in both.

`tools/resolve/ng-scan.mjs` counts the same constructs a second way — crude text search over
comment- and string-stripped source — and the orchestrator compares against what the tiers
recorded. `@Input` seen nine times and reported seven is a `recall-gap` warning on the tier that
owns the answer.

**The D3a boundary is enforced structurally, not by discipline.** Every function in `ng-scan`
returns numbers only; there is no code path by which it can produce a record, an id, or a name, so
nothing shaped like `ast` content exists for a caller to mistakenly assign. `countConstructs`
asserts it. This matters because quietly merging fuzzy matches into `ast` would corrupt the very
omission metric the extractor exists to provide — a field half-filled by grep looks complete.

**Direction of error is stated and acted on.** Text counting is an *upper* bound: it cannot tell
that `@Input` sat in a comment it failed to strip. So `scan > recorded` warns, and
`recorded >= scan` is silent and normal — the compiler legitimately sees declarations no substring
reveals, such as inherited or aliased ones. The warning says so in its own text, so a reader does
not mistake a signal for a proof.

### Verified against the case goldens structurally cannot see

Simulating "the extractor returned seven of nine" by making `ts-signature` drop one input:

1. With goldens unchanged, the suite went red — 2 failures. That is the *easy* case, and it only
   works because the goldens predate the bug.
2. **Then the goldens were regenerated with the bug baked in**, which is the real scenario: an
   extractor that shipped broken. `npm run golden` reported **`0 problems`** — the goldens now
   agree with the buggy output, exactly as predicted.
3. The `recall-gap` warning was still there, *inside the passing golden*, naming
   `inputs-decorator/signature`.

Step 3 is the whole justification for this work. Every other check in the suite agreed the
extractor was correct.

### Gaps are surfaced, not just recorded

`golden.mjs` now prints a "recorded gaps" summary of every non-`info` warning across all goldens,
with `recall-gap` called out for investigation. A warning that lives only inside a JSON file nobody
opens is barely better than no warning — and the current run shows four codes standing, including
the deliberate `unhandled-template-node` from `i18n-icu`. They are reported, never counted as
failures: a gap a fixture exists to record is expected output, not a regression.

### What it does not cover

Only constructs where a raw count is meaningful. `@if` blocks count; "bindings" do not, because one
element carries several and no substring marks the boundary. A metric nobody can interpret produces
warnings nobody acts on, so those were left out rather than guessed at.

---

## F16. The Phase 1 omission rate, and the two defects measuring it exposed

Phase 1's exit criterion: *"diff the extractor's output against Phase A's hand-filled baselines
and record the omission rate — this is the number that justifies the extractor's existence."*
Numbers in `benchmarks/phase1-omission.json`.

| | activate | post/update | total |
|---|---|---|---|
| facts the extractor emits | 7 | 53 | 60 |
| the hand-fill missed | 0 | 2 | **2 (3.3%)** |
| the extractor missed | 1 | 3 | **4 (6.7%)** |

**The result inverts the assumption the criterion was written on.** It expected to quantify LLM
recall against a reliable extractor. Instead the hand-filled baseline scored **zero omissions** on
every declarative category in both components — inputs, outputs, injected dependencies, fields,
methods, lifecycle hooks — and the *extractor* was the side with gaps. That is consistent with the
plan's own Phase A discipline note: declarative facts are localized and syntactically obvious, so
an agent gets them substantially right. This measures it rather than assuming it.

What the extractor uniquely supplies is **derived and cross-cutting**: two call-graph edges
(`tpl:7 -> method:save`, `tpl:153 -> method:previousState`) linking a template binding to the
method it invokes. Nobody enumerated those by hand, and they are what makes reachability verified
rather than searched (F4, F9).

### The two defects it found — the actual yield

**Arrow-function properties were missing from `callGraph.nodes`.** `compareBlog` and `compareTag`
are callable members flagged `isArrowFunctionProperty: true` by our own signature extractor — a
field F5a added precisely because `this` is bound at construction and porting one to a method
changes that. But `nodes` was built from `methodIds + accessorIds`, so they could never appear in
`executionOrder` and could never be reported unreachable. **The hand-filled baseline had them and
the extractor did not.**

**Fixing that produced a false positive, which the same baseline caught.** With the two now in
`nodes`, both were reported *unreachable* — against F4's verified answer of exactly three dead
methods. Cause: `entryPoints` counted only template *event handlers*, and
`[compareWith]="compareBlog"` is a property binding that hands the function to a child component
to call. A template REFERENCE reaches a member just as a template CALL does. Now fixed, and
`unreachableMethods` matches F4 exactly.

That second bug is the more useful of the two, because nothing else would have found it: a
reachability claim that is wrong in the *unreachable* direction reads as a confident finding about
dead code, and the whole point of F4 was that such a claim is this document's most consequential.

**`httpInteractions` under-reports, and now says so.** It detects direct `HttpClient` calls; these
components route HTTP through injected services, so it emitted `[]` — indistinguishable from "makes
no requests." Resolving it needs the cross-unit graph, so per the standing rule it earns a flag
rather than a patch: a new `lower-bound-only` warning fires when the array is empty on a unit that
injects dependencies. All four remaining "extractor missed" entries are this one cause.

### A fixture pair caught the fix's blast radius

Making template references count as entry points flipped `control-flow-structural`: its
`trackBy: trackById` now reaches the method. The pair went red because the block member's
`track item.id` reaches nothing, leaving `trackById` genuinely dead there. That difference is real
and inherent to Angular's two syntaxes, so it is declared — with the reason stating it is a
*consequence* of the already-declared trackBy difference, and that expecting exactly one entry
either way is what stops "empty on both" from passing as agreement.

### What this does not establish

Two components from one JHipster-generated repository. Generated code is markedly more regular
than hand-written code, and `fixtures.json` says so as its reason for existing. The rate is a
data point, not a measurement of the corpus.

---

## F17. Text matching replaced by AST queries, and what it had been getting wrong

Standing rule: text search is a legitimate *fallback*, but where a parse tree exists it should be
used. Five sites in the extractors matched regexes against `node.getText()` or against a string
already stored in another tier. Each was measured before replacing, because "AST is cleaner" is
not a reason — being *wrong* is.

**Reactive form controls** (`ts-functions`). Four regexes decided a control's kind, validators and
disabled state. Against a five-control fixture they produced **five wrong facts**:

| control | old answer | truth |
|---|---|---|
| `note: [{value:'', disabled: this.locked}]` | not disabled | disabled by expression |
| `slow: ['', {updateOn:'blur'}]` | `updateOn: null` | `'blur'` — the field was hardcoded null |
| `tags: this.fb.array([])` | `type: control` | `array` — `/FormArray/` cannot see `fb.array` |
| `hint: ['…disabled: true and FormArray…']` | `type: array`, disabled | plain control — **from a string literal** |

`hint` is the case worth keeping: one string produced two confidently wrong facts, and nothing
downstream could have distinguished them from right ones. `updateOn` is now read rather than
always null, and `disabledExpression` records the *expression*, since `disabled: isLocked` is a
real disabled state that `/disabled:\s*true/` reported as absent.

**Template event handlers** (`ng-template`). `/^(\w+)\s*\(/` only ever saw a bare call at
position 0. `items.length && save()` and `$event.stopPropagation(); close()` both recorded **no
handler at all** — and a missed handler is a missed call-graph edge, which surfaces as a method
wrongly reported unreachable. That is the failure F16 had already been bitten by once. Both are
now found; `items.join('save')` correctly still records nothing, because a string argument that
happens to name a method is not a call. A handler calling two component methods now warns rather
than silently keeping the first.

**Computed-signal dependencies** (`ts-dependencies`). This one matched against
`signature.initializerExpression` — a string stored in *another tier* — so
`` computed(() => `sum is ${this.a()}` + 'this.b()') `` reported a dependency on `b` that does not
exist. A fabricated edge here misorders the Explainer, which consumes `signalDependencies` to
decide what to explain first.

**Side-effect hints** (`ts-functions`). Walked the tree, then regexed each callee's printed text:
`/^document\./` also matched `documentService.load()`, and `/\.subscribe$/` matched any member
named `subscribe` on anything. Now matched on tree shape.

**Developer comments** (`ts-functions`). Scanned the body text for `//`, so
`const url = "https://x/y"` contributed `/x/y` as a developer comment. Now taken from the
compiler's trivia scanner. A fabricated comment is worse than a missing one, because it reads as
intent.

### Fixtures

`handlers-compound` and `forms-control-shapes` lock these in, each asserting the specific shapes
that were misread — including the two "must contribute nothing" cases, which are the ones a future
regression would otherwise pass silently.

### Where text matching remains, correctly

`ng-scan` is entirely regex, by design: it is the independent second count, and a cross-check
sharing the mechanism it checks would be worth nothing (F15). Two `getText()` calls in
`ts-signature` also stay — they *record* a node's text rather than matching a pattern against it,
which is what the rule is about.

---

## F18. The three small gaps closed

**`outputFromObservable` has a declaration style** (F10b's surviving piece). It matched none of
`eventemitter | output-fn | subject` and was recorded as no output at all. It is an output *driven
by a stream*, so it is simultaneously a public-contract entry and a teardown concern — the
framework owns the subscription, which is exactly what a naive rewrite reimplements by hand and
then leaks. `emittedFrom` now names the stream it wraps (`stream:ticks$`), so the contract links to
the thing that drives it instead of standing alone; that id resolves through `stateOutline.streamIds`,
checked rather than assumed.

**`FormRecord` is representable in both tiers, and one of them is now authoritative** (F10e). The
two vocabularies were not actually redundant, which is why this is a reconciliation rather than a
merge: `functions.json#/forms/groups/controls/type` answers *what kind of node this is in the form
tree*, while `signature`'s `roleHints.formKind` answers *what type this field holds*. Different
questions. `functions` owns the control tree, so it is declared authoritative and gained `record`;
both now carry a `$comment` stating the relationship, so a reader does not have to infer which one
to trust.

**The fallback-parser warning now rests on evidence** (task #11). It fired whenever the fallback
path was taken, which meant all four template fixtures sat at `parseStatus: partial` permanently —
they vendor no `node_modules` and never will. A warning that is always on stops being read.

It now compares the version the analyzed tree *declares* against the one this Resolver pins:
majors agree → `parser-selected` (info); majors differ or the version cannot be determined →
`compiler-version-fallback` (warning), naming both versions.

The subtlety worth recording: this lookup deliberately does **not** exclude our own
`package.json`, though the `vendored` check does. The two ask different questions — `vendored` asks
whose `node_modules` supplied the parser, where ours must not be mistaken for theirs; this asks
what version the source is *written against*, and for a fixture inside this repo our
`package.json` is exactly that declaration. Conflating them is what left the fixtures permanently
warning.

Verified in all three directions rather than only the quiet one: a tree declaring Angular 20 still
warns and names both versions, a tree with no `package.json` warns that a mismatch cannot be ruled
out, and the fixtures went silent because their versions genuinely agree.
