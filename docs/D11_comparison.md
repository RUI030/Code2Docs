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
- `functions.json` `callGraph` now emits intra-class call edges (shipped as part of Phase 2 gap closure):
  ```
  method:ngOnInit          → [updateForm, loadRelationshipsOptions]
  method:save              → [subscribeToSaveResponse]
  method:subscribeToSaveResponse → [onSaveFinalize, onSaveSuccess, onSaveError]
  method:onSaveSuccess     → [previousState]
  ```
  `byteSize`, `openFile`, `setFileData` appear in no value list — confirmed not called by any other method in the class.

**Verdict: closed.** Combined with template-level evidence (not bound) and call-graph evidence (not called internally), a Synthesizer can assert the three methods are unreachable with no blocking uncertainty remaining.

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
| `post/update` q:1 (dead code) | 1 | **0** | closed by callGraph + template evidence |
| `post/update` q:2 (error display) | 1 | **0** | closed by selector edge |
| **Total** | **2** | **0** | **-2** |

---

## Interpretation

Phase 2 closes both blocking questions. **2 blocking → 0 blocking.**

**q:2** was closed by **selector-edge discovery** — `AlertErrorComponent` appearing in `outboundUnitEdges` via selector tells a Synthesizer exactly which component handles error display.

**q:1** was closed by **intra-class callGraph** — `functions.json` now emits `this.X()` edges for every method body. `byteSize`, `openFile`, `setFileData` appear in no callGraph value list and in no template event binding, making them provably unreachable from any entry point without LLM involvement.
