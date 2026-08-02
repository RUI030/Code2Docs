---
name: explaining-functions
description: "How to write per-symbol semantic explanations for the doc tier of functions.json. Load when acting as the Explainer agent: tells you what a good doc.explanation looks like, how to classify symbol complexity, how to use executionOrder and callee explanations, and when to raise an open question instead of guessing."
---

# Explaining functions

The Explainer's output is the `doc` tier inside `functions.json`. For each symbol it writes
two fields:

- **`doc.explanation`** — one or two sentences stating *what this function does and why it
  exists in this unit*. Framework-independent: no Angular terms, no React terms, no
  framework design pattern names. The Synthesizer will use this to build behavioral prose
  without re-reading the source.
- **`doc.confidence`** — `high`, `medium`, or `low`.

That is the entire deliverable. Everything else in this skill is guidance for getting those
two fields right.

---

## The one rule: state observable behavior, not mechanism

Mechanisms are implementation choices; behaviors are what the user or the system experiences.

| ❌ Mechanism (avoid) | ✅ Behavior (write this) |
|---|---|
| `Subscribes to the router events observable and filters for NavigationEnd` | `Detects when navigation to this route completes` |
| `Sets this.loading = true, calls service.fetch(), pipes through catchError` | `Triggers a data load and tracks whether it is in progress` |
| `Calls this.form.patchValue(data)` | `Populates the form fields with the supplied data object` |
| `Emits this.saved.next(true)` | `Signals to the parent that the save succeeded` |

If you find yourself naming `subscribe`, `pipe`, `inject`, `FormGroup`, or a lifecycle hook
in the explanation, you are describing mechanism. Rewrite.

---

## Classifying symbols: trivial vs non-trivial

Before writing any explanation, classify each symbol:

**Trivial** — a symbol is trivial when its purpose is *completely unambiguous* from its name
and body length alone. Characteristics:

- One to three lines of body
- Name is a conventional getter/setter, pass-through delegate, or single-purpose utility
  (`getTitle()`, `trackById()`, `isValid()`)
- No conditional logic, no side effects beyond a single assignment or emit

Trivial symbols get a `doc.confidence` of `high`. Batch them into a single Explainer call
(up to 5–8 per call).

**Non-trivial** — everything else. Explain these individually, bottom-up.

---

## Using executionOrder (bottom-up processing)

`functions.json` contains `executionOrder`: a leaf-first ordering of method ids. Process
symbols in that order — **callees before callers** — so that when you write an explanation
for a caller, the explanations of everything it calls are already written.

When explaining a caller:
1. Read the caller's source span (from `loc`).
2. Read the already-written `doc.explanation` for each callee in the caller's `callGraph`
   value list.
3. Write the caller's explanation in terms of what it *does*, using the callee explanations
   as facts rather than re-deriving them.

Example: if `save()` calls `subscribeToSaveResponse()`, and you have already written
`subscribeToSaveResponse` as *"handles the observable result of a save call, routing success
and failure to their respective handlers"*, then `save()` becomes *"submits the form data via
the persistence service and hands the response off to the result handler"* — without needing
to re-examine `subscribeToSaveResponse`'s body.

---

## Confidence levels

| Level | When to use |
|---|---|
| `high` | Purpose is unambiguous from name + body. A different reader would write the same explanation. |
| `medium` | Purpose is plausible from context (callee explanations, field names, spec titles) but requires inference. A reader might disagree. |
| `low` | Purpose cannot be determined from the available context. Use only when you must write *something* rather than raise an open question. |

Prefer `medium` over `low`. Prefer `low` + an open question over a confident-sounding guess.

---

## When to raise an open question instead

If you cannot determine a symbol's purpose with at least `low` confidence:

1. Do **not** invent a purpose.
2. Write `doc.explanation: null` (or omit the field).
3. Add an entry to `review.openQuestions` in the unit's `analysis.json` stub:
   ```json
   {
     "id": "eq:N",
     "question": "What does `method:X` do? Its body [brief observation] but the caller context is unclear.",
     "blocking": false
   }
   ```
4. Set `doc.confidence: "low"`.

A symbol that looks like dead code (not reachable from template or callGraph) is a candidate
for `blocking: false` unless there are no callGraph edges at all, in which case it is
`blocking: true` (the reachability cannot be confirmed).

---

## What to read before explaining each symbol

1. The symbol's `loc.file` + `loc.line`–`loc.endLine` span from the source file.
2. The symbol's entry in `functions.json.symbols`: `sideEffectHints`, `callsInBody`,
   `readsFields`, `writesFields`, `returnsType`.
3. For callers: the already-written explanations of every id in its `callGraph` value list.
4. If a spec file exists (`signature.json.files.specs`): scan for `it()` titles that name
   this symbol or a behavior it is responsible for. A matching spec title is strong evidence
   for `high` confidence.
5. The template's `eventBindings` to check whether this symbol is an entry point — if it
   appears as a `handlerMethod`, it is triggered by a user action.

Do **not** read more than you need for this symbol. The Synthesizer reads the full unit;
the Explainer reads at symbol granularity.

---

## Constructors

Constructors do two things that are worth naming:

1. **Inject dependencies** — write this as "receives [service A] and [service B] for [what
   they will be used for]" based on how those dependencies appear in other methods.
2. **Initialize state** — write what initial values are established if the constructor body
   does anything beyond DI.

If the constructor is pure DI with no body logic, classify it as trivial.

---

## Lifecycle hooks as entry points

Lifecycle hooks are the **first entry points** the Synthesizer will reason about. Give them
`high` confidence and concrete explanations:

| Hook | Behavioral framing |
|---|---|
| `ngOnInit` | "On first display, ..." — what setup happens when the unit becomes visible |
| `ngOnDestroy` | "On removal, ..." — what teardown happens |
| `ngOnChanges` | "When [input name] changes, ..." |
| `ngAfterViewInit` | "Once the template is fully rendered, ..." |

Do not say "implements OnInit" or "called by Angular." Say what it does to the application.

---

## Formatting rules

- One or two sentences maximum per explanation.
- Active voice: "Loads the form data", "Signals the parent", "Tracks whether a save is in
  progress."
- No Angular framework names (`HttpClient`, `ActivatedRoute`, `FormBuilder`). Use the *role*
  instead: "the data service", "the current route parameters", "the form builder".
- No TypeScript syntax in the explanation. The Synthesizer reads the JSON, not the source.
- No target-framework names (`React`, `Vue`, `component`, `hook`, `store`). The document
  must be framework-neutral.
