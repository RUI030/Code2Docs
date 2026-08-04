<!-- code2docs:unit id="component:entities/post/list/post.component.ts:PostComponent" schemaVersion="0.4.0" -->

# Migration Notes: Post Entity Module

<!-- c2d:begin section="risks" source="hand-written" -->
## 1. Migration-Sensitive Behavior

| Severity | Category | Behavior at risk | Source |
|---|---|---|---|
| High | subscription-leak | `PostComponent` stores its `combineLatest` subscription but has no `ngOnDestroy` cleanup | `list/post.component.ts:38,61–68` |
| High | rxjs-pipeline | `modalRef.closed` is filtered on `ITEM_DELETED_EVENT`; only confirmed deletions trigger a reload — all other close reasons are silently ignored | `list/post.component.ts:90–95` |
| High | routing | `postResolve` uses `mergeMap`; rapid navigation can produce two in-flight `find` requests whose responses arrive out of order | `route/post-routing-resolve.service.ts:15` |
| High | forms-semantics | The `id` FormControl is disabled; its value is recovered via `getRawValue()`, not `form.value` — omitting this step drops the id from an UPDATE payload | `update/post-form.service.ts:51–57,73` |
| High | forms-semantics | Validation error messages appear only when a field is invalid AND (dirty OR touched); a pristine but invalid form shows no errors | `update/post-update.component.html:21,33,55` |
| Medium | rxjs-pipeline | `combineLatest([queryParamMap, data])` fires on either source emission, triggering reset + load on each; a replacement watching only one source misses the initial default-sort emission from route data | `list/post.component.ts:61–68` |
| Medium | template-directive | `@if (post)` on the delete dialog destroys and recreates the form when `post` flips between null and non-null | `delete/post-delete-dialog.component.html:1` |
| Medium | routing | `PostDetailComponent` has no init code to fetch data; it depends entirely on `withComponentInputBinding` wiring the resolver's output to the `post` signal input | `detail/post-detail.component.ts:16`, `post.routes.ts:22–25` |
| Medium | lifecycle-ordering | Two concurrent relationship queries (blogs, tags) in `loadRelationshipsOptions` are uncoordinated; the form is saveable before either completes | `update/post-update.component.ts:118–129` |
| Medium | subscription-leak | `PostUpdateComponent.ngOnInit` subscribes to `activatedRoute.data` with no cleanup | `update/post-update.component.ts:50` |
| Medium | di-assumption | `PostService` and `PostFormService` are app-wide singletons (`providedIn: 'root'`); replacing them with per-component instances changes any future cross-component identity assumptions | `service/post.service.ts:27`, `update/post-form.service.ts:43` |
| Low | routing | Sort state travels via URL query params; `ngZone.run` wraps `router.navigate` to ensure change detection fires after programmatic navigation | `list/post.component.ts:167` |
| Low | third-party-dependency | `ngx-infinite-scroll` fires `(scrolled)` on the `<tbody>` element at distance 0 | `list/post.component.html:75` |
| Low | third-party-dependency | `@ng-bootstrap/ng-bootstrap` provides the modal lifecycle (`open`, `close`, `dismiss`); `closed` emits the value passed to `close()` | `list/post.component.ts:87`, `delete/post-delete-dialog.component.ts:19` |
| Low | forms-semantics | `date` is converted between a structured date value and a formatted string at form boundary; losing this step saves an unparsed string to the server | `update/post-form.service.ts:97–111` |

### Detail

- **R1 — subscription-leak (high)**
  - *What Angular does:* `combineLatest` subscriptions run indefinitely until unsubscribed. `PostComponent` stores the reference in `this.subscription` but implements no `ngOnDestroy`.
  - *What could break:* After component teardown, the subscription continues to fire, calling `reset()` and `load()` on a destroyed component — potential memory leak and update-after-destroy errors.
  - *Evidence:* `list/post.component.ts:38`, `61–68`

- **R2 — rxjs-pipeline (high)**
  - *What Angular does:* `filter(reason => reason === ITEM_DELETED_EVENT)` drops all close values except the exact `'deleted'` string. Only a confirmed delete propagates to `load()`.
  - *What could break:* A naive replacement listening to any modal close or checking a different predicate would reload on cancel, causing a spurious list refresh after every abandoned delete.
  - *Evidence:* `list/post.component.ts:90–95`

- **R3 — routing (high)**
  - *What Angular does:* `mergeMap` does not cancel the previous inner observable. If the user navigates to a different `:id` before the first `find` response arrives, both responses complete and the last one wins.
  - *What could break:* A naive single-fetch replacement without cancellation semantics can display stale data when rapid navigation occurs.
  - *Evidence:* `route/post-routing-resolve.service.ts:15`

- **R4 — forms-semantics (high)**
  - *What Angular does:* A disabled `FormControl`'s value is excluded from `form.value` but included in `form.getRawValue()`. `PostFormService.getPost` calls `getRawValue()` explicitly so the id is always present in the extracted model.
  - *What could break:* A reimplementation reading `form.value` instead of `getRawValue()` would omit the id from an UPDATE payload, causing the server to reject or mishandle the request.
  - *Evidence:* `update/post-form.service.ts:51–57`, `73`

- **R5 — forms-semantics (high)**
  - *What Angular does:* Template error blocks are conditional on `invalid && (dirty || touched)`. A freshly mounted form with empty required fields is invalid but shows no errors.
  - *What could break:* Showing validation errors immediately on mount changes the UX: the user sees error states before interacting with the form.
  - *Evidence:* `update/post-update.component.html:21`, `33`, `55`

- **R6 — rxjs-pipeline (medium)**
  - *What Angular does:* `combineLatest` emits whenever either `queryParamMap` or `data` emits. This means both route data (carrying the default sort) and subsequent query param changes independently trigger reset + load.
  - *What could break:* Watching only `queryParamMap` misses the initial `data` emission that carries the `defaultSort` value; the first load would use no sort or a stale sort.
  - *Evidence:* `list/post.component.ts:61–68`

- **R7 — routing (medium)**
  - *What Angular does:* The router's `withComponentInputBinding` feature binds the resolver's return value under the key `'post'` directly to the `post` signal input. The detail component has no `ngOnInit` and no manual data fetching.
  - *What could break:* Removing the resolver or omitting the component-input-binding configuration results in a permanently null `post` signal and an empty view with no error.
  - *Evidence:* `detail/post-detail.component.ts:16`, `post.routes.ts:22–25`

- **R8 — lifecycle-ordering (medium)**
  - *What Angular does:* `blogService.query()` and `tagService.query()` fire concurrently as two independent subscriptions. Neither waits for the other, and neither blocks the save button.
  - *What could break:* A reimplementation that requires both loads to complete before enabling the save button changes the UX. One that does not coordinate the loads at all might display or submit with partially-populated option lists in a different way than the original.
  - *Evidence:* `update/post-update.component.ts:118–129`
<!-- c2d:end section="risks" -->

<!-- c2d:begin section="decomposition" source="hand-written" -->
## 2. Suggested Functional Breakdown

The module has clear sub-folder seams, each already self-contained:

- **Post list** (`list/`) — infinite-scroll list with sort, delete trigger, and refresh. Owns: `PostComponent`, pagination signal state, `trackId`.
- **Post detail** (`detail/`) — read-only display of all post fields and associations. Owns: `PostDetailComponent`, `byteSize`/`openFile` delegation.
- **Post create/edit form** (`update/`) — reactive form with relationship dropdown loading. Owns: `PostUpdateComponent`, `PostFormService`, `compareBlog`, `compareTag`.
- **Post delete dialog** (`delete/`) — modal confirmation and deletion trigger. Owns: `PostDeleteDialogComponent`.
- **Post HTTP service** (`service/`) — stateless CRUD facade with date conversion. Owns: `PostService`, `addPostToCollectionIfMissing`, `comparePost`.
- **Route resolver** (`route/`) — pre-navigation data fetch and 404 redirect. Owns: `postResolve` function.

These are observations about the existing code structure; they do not prescribe a target architecture.
<!-- c2d:end section="decomposition" -->

<!-- c2d:begin section="third-party" source="hand-written" -->
## 3. Third-Party Dependencies

| Package | Used for | Direct equivalent in target? |
|---|---|---|
| `dayjs` | In-memory date representation; serialized to ISO 8601 for server transport | unknown |
| `@ng-bootstrap/ng-bootstrap` | Delete confirmation modal (`NgbModal`, `NgbActiveModal`); `closed` observable as a close-signal channel | unknown |
| `ngx-infinite-scroll` | Scroll-event-driven pagination trigger on the list table body | unknown |
<!-- c2d:end section="third-party" -->

<!-- c2d:begin section="target-suggestions" source="human" human-owned="true" -->
## 4. Target Implementation Suggestions

**Human-owned by default.** The pipeline deliberately does not generate this: doing so would let target-framework assumptions leak backward into the behavioral spec, which is the failure mode the requirement/migration split exists to prevent. Fill this in during review, once §1–§3 are understood.
<!-- c2d:end section="target-suggestions" -->
