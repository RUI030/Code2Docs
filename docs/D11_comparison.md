# D11 Comparison — Blocking Questions Before vs After Phase 2

**Metric**: count of `review.openQuestions` entries where `blocking: true`  
**Corpus**: `activate` and `post/update`, the two units in the Phase A evaluation set  
**Baseline**: Phase A skills-only POC (LLM reads source directly, writes analysis.json)  
**After**: Phase 2 deterministic extraction (Synthesizer receives only structured JSON)

---

## Phase A Baseline

| Unit | Blocking questions |
|------|--------------------|
| `app/account/activate` | 0 — unit was out-of-scope for Phase A; no analysis.json produced |
| `app/entities/post/update` | **2** |
| **Total** | **2** |

### Post/update blocking questions (Phase A)

**q:1** — "Should the three file-handling operations (`byteSize`, `openFile`, `setFileData`) and their two dependencies be carried over? They are unreachable from the template and likely dead code."

**q:2** — "How is a failed save reported to the person? This screen does nothing and relies on machinery outside this folder."

---

## Phase 2 — What the Extractors Provide

### Data gathered (full index + backfill run, `OUTPUT/latest-run/`)

**post/update:**
- `signature.json` — 6 injected deps, all with `resolvedUnitId` (except Angular framework tokens); `lifecycle`, `stateOutline`, `publicApi`
- `dependencies.json` — 3 `outboundUnitEdges`: PostService (import), PostFormService (import), **AlertErrorComponent (selector)**; 18 `httpInteractions` backfilled from PostService / BlogService / TagService
- `template.json` — `eventBindings`: only `method:save` and `method:previousState` appear as `handlerMethod`; 9 `propertyBindings`; `controlFlow` and `formBindings`
- `functions.json` — 12 method symbols (ngOnInit, byteSize, openFile, setFileData, previousState, save, subscribeToSaveResponse, onSaveSuccess, onSaveError, onSaveFinalize, updateForm, loadRelationshipsOptions); `callGraph: {}` (empty — intra-class edges not extracted)

**activate:**
- `dependencies.json` — 1 `outboundUnitEdge` to ActivateService; 1 `httpInteraction` (GET api/activate) backfilled from ActivateService
- `template.json` — 2 `controlFlow` nodes: `@if success()` and `@if error()`
- `functions.json` — 1 symbol: `method:ngOnInit`

---

## Per-Question Assessment

### q:1 — Dead code: byteSize / openFile / setFileData

**What Phase 2 provides:**
- Template `eventBindings` shows only `method:save` and `method:previousState` — proving the three file-handling methods are not template-reachable.
- `functions.json` lists all 12 method symbols, making the dead-code candidates visible by name.
- `callGraph` is empty — Phase 2 extractors do not build intra-class call edges. The Synthesizer cannot verify whether `save()` or other methods call `byteSize`/`openFile`/`setFileData`.

**Verdict: still blocking.** Template-level reachability is now proven (the three methods are NOT bound), but intra-class reachability is invisible. A Synthesizer reading only the structured JSON cannot confirm the methods are unreachable from other methods in the class. The question narrows from "unknown if reachable from anywhere" to "not template-reachable, but call chain unknown" — still a blocking gap.

**What would close it:** `callGraph` in `functions.json` — edges from callers to callees within the class. This is a named Phase 3 / F20 gap.

---

### q:2 — How failed saves are reported

**What Phase 2 provides:**
- `outboundUnitEdges` contains `component:app/shared/alert:AlertErrorComponent` via `selector` — the component literally named "AlertError" is wired into post/update's template.
- `functions.json` includes `method:onSaveError` as a named symbol.
- `httpInteractions` shows POST/PUT calls via PostService, confirming there are save operations that can fail.
- `EventManager` (the event bus) records 0 edges in the repo index — the broadcast-consumer topology is not captured by import or selector edges.

**Verdict: no longer blocking.** The `AlertErrorComponent` selector edge is decisive: a Synthesizer can read "this component renders an alert-error component in its template" and conclude that failed saves surface via that component. The exact mechanism (event bus vs. `@Input()` vs. service state) may be marked as a non-blocking uncertainty, but the behavioral question — *is there a feedback mechanism, and which component handles it?* — is answered by the selector edge alone.

---

## After Phase 2

| Unit | Phase A blocking | Phase 2 projected blocking | Change |
|------|-----------------|--------------------------|--------|
| `activate` | 0 | 0 | — |
| `post/update` q:1 (dead code) | 1 | **1** (narrowed) | still blocking |
| `post/update` q:2 (error display) | 1 | **0** | closed by selector edge |
| **Total** | **2** | **1** | **-1** |

---

## Interpretation

Phase 2 closes one of the two blocking questions by providing **selector-edge discovery** — the dependency graph now records which named components appear in a template, not just which services are injected. That single edge made q:2 answerable from structured data alone.

The remaining blocking question (q:1) exposes the **intra-class call graph gap**. Phase 2 extractors parse method declarations but do not trace which methods call which other methods within the class. Without that, a Synthesizer cannot distinguish "genuinely dead code" from "code reached via an internal chain the template initiates indirectly."

### Named gap: `callGraph` in `functions.json`

The current `functions.json` emits a `callGraph: {}` field but leaves it empty. Populating it with `{ "method:save": ["method:subscribeToSaveResponse"], ... }` would close q:1 without any LLM involvement — the dead-code question becomes a graph reachability check on deterministic data.

This is the highest-priority gap exposed by D11. It is a purely structural extraction problem (walk method bodies, collect `this.X()` calls), not a semantic one.
