<!-- code2docs:unit id="component:app/entities/post/update/post-update.component.ts:PostUpdateComponent" schemaVersion="0.4.0" -->

# Migration Notes: PostUpdateComponent

<!-- c2d:begin section="risks" source="hand-written" -->
## 1. Migration-Sensitive Behavior

Angular-specific behavior that will not carry over verbatim. Each entry names the assumption at risk and the observable behavior that could silently change.

**This list is a lower bound.** It was derived by pattern-matching against the source without verified AST extraction, so recall is unproven. An entry being absent does not mean the risk is absent.

| Severity | Category | Behavior at risk | Source |
|---|---|---|---|
| high | forms-semantics | Disabled `id` control excluded from `form.value`; only `getRawValue()` includes it — a rewrite reading the wrong property silently sends update as create | `post-form.service.ts:51–56, 73` |
| medium | lifecycle-ordering | `editForm` is initialized at field declaration (construction time), before `ngOnInit`; template binds to it synchronously | `post-update.component.ts:43` |
| medium | forms-semantics | `compareBlog` and `compareTag` are arrow-function class properties — `this` is bound at construction; converting to regular methods changes binding | `post-update.component.ts:45–47` |
| medium | template-directive | `@if` on ID field destroys/recreates the element; `[hidden]` on datetimelocal error preserves it — these are different behaviors, not two ways to hide | `post-update.component.html:11, 62` |
| medium | routing | Route resolver supplies the post before the component loads; the component has no loading state for it — a direct-fetch rewrite must add one | `post-update.component.ts:50` |
| low | template-directive | `track $index` tracks blog and tag options by array position — rows are rebuilt on any array replacement, not reordered by identity | `post-update.component.html:74, 83` |
| low | rxjs-pipeline | `finalize` guarantees `isSaving` resets on both success and error — resetting only in callbacks leaves the button disabled on unhandled exceptions | `post-update.component.ts:92` |
| low | di-assumption | `PostFormService` is `providedIn: 'root'` (app singleton) — if a rewrite uses per-component scope and the service gains state, behavior diverges | `post-form.service.ts:43` |
| low | template-directive | `byteSize`, `openFile`, `setFileData` exist on the class but are unreachable from the current template — likely scaffolded dead code | `post-update.component.ts:60–75` |

### Detail

- **R1 — forms-semantics (high)**
  - *What Angular does:* `FormGroup.value` omits controls marked `disabled: true`. The `id` control is always disabled (`post-form.service.ts:51–56`). `PostFormService.getPost()` calls `form.getRawValue()` to retrieve the id anyway (`post-form.service.ts:73`).
  - *What could break:* A rewrite that reads the form's standard value property (rather than the raw value) will receive a post object with no `id`. The save method's branch condition (`post.id !== null`) will then always route to `create()` instead of `update()`, silently creating duplicate records rather than updating existing ones. This is a data-integrity failure with no client-side error.
  - *Evidence:* `post-form.service.ts:51–56, 73`, `post-update.component.ts:84`

- **R2 — lifecycle-ordering (medium)**
  - *What Angular does:* Class field initializers execute during object construction, before any lifecycle hook. `editForm` is assigned on line 43 of `post-update.component.ts` by calling `postFormService.createPostFormGroup()`. The template's `[formGroup]="editForm"` binding resolves at first render, which occurs after construction but before `ngOnInit`.
  - *What could break:* A rewrite that initializes the form equivalent inside an init hook will have a window between render and init where the form does not exist. Template bindings that dereference it will throw, or the framework will need a different null-guard strategy.
  - *Evidence:* `post-update.component.ts:43`

- **R3 — forms-semantics (medium)**
  - *What Angular does:* Arrow-function class properties (`compareBlog`, `compareTag`) capture the instance's `this` at construction time. When the select's `[compareWith]` binding passes these as callbacks, they can safely call `this.blogService` / `this.tagService`.
  - *What could break:* A rewrite that ports these as regular methods and passes them as callbacks will lose the `this` binding unless it also binds explicitly. The select may then fail to match the current option silently, leaving the displayed value blank.
  - *Evidence:* `post-update.component.ts:45–47`, `post-update.component.html:72, 82`

- **R4 — template-directive (medium)**
  - *What Angular does:* `@if` (new control-flow block) fully removes its content from the DOM when the condition is false; state inside it is destroyed. `[hidden]` sets `display:none` while keeping the element and its state alive. Both are used in this template for what appears to be the same purpose (hiding error messages), but they have different semantics.
  - *What could break:* A rewrite that replaces `[hidden]` with conditional rendering (or vice versa) will change whether the hidden element's DOM state persists across condition toggles. For a simple error message this is cosmetic, but the inconsistency in the original is also a candidate bug (see Review Gate) — a rewrite should resolve it deliberately.
  - *Evidence:* `post-update.component.html:11` (`@if` for ID field), `post-update.component.html:55` (`@if` for date error block), `post-update.component.html:62` (`[hidden]` for datetimelocal error)

- **R5 — routing (medium)**
  - *What Angular does:* A route resolver runs before the component loads and populates `activatedRoute.data` with the resolved post. By the time `ngOnInit` subscribes to `activatedRoute.data`, the value is synchronously available. The component has no intermediate "loading post" state — it either has the post or has `null`.
  - *What could break:* A rewrite that fetches the post directly in an init hook must render an intermediate loading state, or the form will appear blank momentarily. Skipping this state is visually acceptable only if data arrives fast enough in testing and degrades silently in production.
  - *Evidence:* `post-update.component.ts:50–57`

- **R6 — template-directive (low)**
  - *What Angular does:* `@for ... track $index` uses the item's position in the array as its identity. When `blogsSharedCollection` or `tagsSharedCollection` is replaced (which happens when `loadRelationshipsOptions()` subscribes and assigns a new array), Angular destroys all existing option elements and creates new ones.
  - *What could break:* If a rewrite uses identity-based tracking (e.g., by entity id), option elements are reused and reordered instead of rebuilt. The observable difference is that selection state inside the option may be preserved on update rather than reset. For this particular pattern (a one-time load of relationship lists), the observable impact is minimal, but the tracking semantics differ.
  - *Evidence:* `post-update.component.html:74, 83`

- **R7 — rxjs-pipeline (low)**
  - *What Angular does:* `finalize(() => this.onSaveFinalize())` runs after the observable completes or errors, unconditionally. `onSaveFinalize()` sets `isSaving = false`. (`post-update.component.ts:92, 106–108`)
  - *What could break:* A rewrite that resets `isSaving` only in explicit success and error handlers will leave the Save button permanently disabled if the observable throws an unhandled exception outside the subscribe callbacks. The `finalize` guarantee is easily missed.
  - *Evidence:* `post-update.component.ts:91–108`

- **R8 — di-assumption (low)**
  - *What Angular does:* `PostFormService` is `providedIn: 'root'`, making it an application-wide singleton. Currently it holds no mutable state, so this has no observable behavioral consequence.
  - *What could break:* If a rewrite introduces state into the equivalent service but uses per-component scope, different component instances will not share that state. The inverse (singleton rewrite of a stateful per-component service) would share state that should be isolated. Since the current service is stateless, this is low-risk now but worth noting for future evolution.
  - *Evidence:* `post-form.service.ts:43`

- **R9 — template-directive (low)**
  - *What Angular does:* The methods `byteSize`, `openFile`, and `setFileData` are defined on the component class but no template node calls them. They import `DataUtils` and `EventManager` for this purpose.
  - *What could break:* A rewrite that omits these methods will not break any behavior visible in the current template. However, if they are called from a parent route or a dynamically loaded overlay not visible in this folder, omitting them would silently remove functionality.
  - *Evidence:* `post-update.component.ts:60–75`, absence of corresponding template elements in `post-update.component.html`
<!-- c2d:end section="risks" -->

<!-- c2d:begin section="decomposition" source="hand-written" -->
## 2. Suggested Functional Breakdown

The form-building and data-conversion logic is already separated into `PostFormService`. Within `PostUpdateComponent` itself, all methods serve a single concern (manage the create/edit form lifecycle) and no further seam is apparent. No decomposition is suggested for the component class.

The two files in this folder represent two distinct responsibilities that are already separated:

- **PostFormService** (`post-form.service.ts`) — owns the form shape, validation rules, and the date conversion between `dayjs` and the `datetime-local` string format. Members: `createPostFormGroup`, `resetForm`, `getPost`, and three private conversion helpers.
- **PostUpdateComponent** (`post-update.component.ts`) — owns the create/edit screen lifecycle: routing, data loading, form orchestration, and save dispatch.
<!-- c2d:end section="decomposition" -->

<!-- c2d:begin section="third-party" source="hand-written" -->
## 3. Third-Party Dependencies

| Package | Used for | Direct equivalent in target? |
|---|---|---|
| `dayjs` | Parsing and formatting the post's `date` field to/from `datetime-local` string format using a project-specific `DATE_TIME_FORMAT` constant | unknown — depends on target |
| `SharedModule` (internal) | Provides `jhiTranslate` i18n directive and `<jhi-alert-error>` component; exact API not visible from this folder | unknown |
<!-- c2d:end section="third-party" -->

<!-- c2d:begin section="target-suggestions" source="human" human-owned="true" -->
## 4. Target Implementation Suggestions

**Human-owned by default.** The pipeline deliberately does not generate this: doing so would let target-framework assumptions leak backward into the behavioral spec, which is the failure mode the requirement/migration split exists to prevent. Fill this in during review, once §1–§3 are understood.
<!-- c2d:end section="target-suggestions" -->
