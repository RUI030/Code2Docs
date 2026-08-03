# Migration Notes — PostUpdateComponent

> **Scope:** Angular-specific assumptions a rewrite could silently break.
> Lower bound — cross-unit coupling risks (event bus consumers, subclasses) require the repository-level index.

---

## §1 Angular-specific behaviors relied upon

### 1.1 Subscriptions without teardown (ngOnInit, loadRelationshipsOptions)

**What Angular does here:** Three subscriptions are opened in `ngOnInit` (route data) and `loadRelationshipsOptions` (blog query, tag query). None are closed with `takeUntilDestroyed`, an `async` pipe, or `ngOnDestroy`. Each is expected to complete after one HTTP emission. (`post-update.component.ts:50–57,119–130`)

**What could silently break:** If the component is destroyed before any of the three responses arrive (user navigates away quickly), the subscription callbacks still fire. The callbacks write to the component's instance fields, which in Angular signals survive without crashing — but in a framework without that guarantee, this could cause runtime errors or stale UI updates in whatever component the user navigated to.

**Category:** `subscription-leak`
**Severity:** Medium (three subscriptions; the route data subscription in particular fires before the other two complete)

---

### 1.2 finalize() operator ensures isSaving is reset regardless of outcome

**What Angular does here:** `subscribeToSaveResponse` pipes the result through `finalize(() => this.onSaveFinalize())`, which guarantees `isSaving = false` runs whether the observable emits, errors, or completes. (`post-update.component.ts:92`)

**What could silently break:** A rewrite that handles only the success and error callbacks but not a `finally`/`finalize` equivalent would leave `isSaving` stuck at `true` if the observable completes without emitting (e.g., a 204 No Content response). The save button would remain disabled indefinitely.

**Category:** `rxjs-pipeline`
**Severity:** High

---

### 1.3 Disabled form control included in getRawValue()

**What Angular does here:** The `id` control is declared disabled in `PostFormService.createPostFormGroup()`. The component calls `postFormService.getPost(editForm)` which internally calls `form.getRawValue()` — this returns disabled controls' values, unlike `.value` which omits them. The `id` is thus always included in the submitted post object. (`post-form.service.ts:51–55,72–74`)

**What could silently break:** A rewrite that uses the form's `.value` (not `.rawValue` or equivalent) instead of `.getRawValue()` would omit the id on an update request, causing the server to treat it as a create. This is a high-severity data integrity hazard that would likely not be caught in unit tests that mock the service.

**Category:** `forms-semantics`
**Severity:** High

---

### 1.4 addBlogToCollectionIfMissing / addTagToCollectionIfMissing — selected-value merging pattern

**What Angular does here:** After loading the full blog and tag lists, the component calls `addBlogToCollectionIfMissing` and `addTagToCollectionIfMissing` to merge the currently-selected values into the loaded collection. This ensures the currently-selected blog/tags always appear as options in the dropdown even if they were not returned by the query. (`post-update.component.ts:114–115,122,128`)

**What could silently break:** A rewrite that simply assigns the query result to the collection would lose the currently-selected value from the dropdown if it wasn't in the query's page. The blog dropdown would show an empty selection while the form's value still holds the old blog id — a silent data corruption on the next save.

**Category:** `mutable-service-state`
**Severity:** High

---

### 1.5 compareBlog and compareTag functions — select control identity

**What Angular does here:** The blog and tags selects use `[compareWith]="compareBlog"` and `[compareWith]="compareTag"` to determine which option matches the form's current value. These delegate to `blogService.compareBlog` and `tagService.compareTag` respectively. If the comparison is not referential equality (e.g., it compares by id), the select will correctly identify the selected item even if it is a different object instance. (`post-update.component.ts:45–47`; `post-update.component.html:72,82`)

**What could silently break:** A rewrite that uses simple `===` for dropdown identity would fail to pre-select the current value unless the exact object reference is in the options array. The form would show no selected value even when the post has a blog.

**Category:** `forms-semantics`
**Severity:** Medium

---

### 1.6 EventManager — application-level error event bus

**What Angular does here:** File load errors are broadcast via `eventManager.broadcast(new EventWithContent<AlertError>('jhipsterNg17FixtureApp.error', ...))`. This is an Angular-specific event bus pattern where components subscribe by event name. (`post-update.component.ts:70–74`)

**What could silently break:** A rewrite that does not wire up a listener for `jhipsterNg17FixtureApp.error` events would silently discard file load errors — no visible error would appear. The event bus pattern has no direct equivalent in most frameworks; the replacement must route errors to whatever global error display mechanism the target framework uses.

**Category:** `third-party-dependency`
**Severity:** Medium

---

### 1.7 Route data resolver supplying the post object

**What Angular does here:** The post to edit arrives through `activatedRoute.data` as `{ post }` — a resolver has already fetched it before the component mounts. The component does not fetch the post itself; it just reads it from route data. (`post-update.component.ts:50–54`)

**What could silently break:** A rewrite that expects to load the post itself (via URL param + HTTP call) would need to implement the data-fetching logic that the resolver currently owns. The timing also changes: with a resolver, the component renders with data already present; without it, the component renders first in a null state and then populates.

**Category:** `routing`
**Severity:** Medium

---

### 1.8 onSaveError() empty — inheritance hook

**What Angular does here:** `onSaveError()` is empty with a comment stating it is "Api for inheritance." This implies subclasses are expected to override it to provide error handling. In this unit, no inline error feedback is shown on save failure. (`post-update.component.ts:102–104`)

**What could silently break:** A rewrite that does not preserve the override point would have no error handling path unless it adds one. More importantly, if subclasses exist in the codebase and are not identified, those classes must also be migrated with their overrides intact.

**Category:** `di-assumption`
**Severity:** Low (currently produces no visible behavior; risk is in discoverability of subclasses)

---

### 1.9 Date format conversion via PostFormService (dayjs)

**What Angular does here:** `PostFormService` converts `IPost.date` (a dayjs object) to a `DATE_TIME_FORMAT` string for the datetime-local input, and converts back on `getPost()`. The visible format is `YYYY-MM-DD HH:mm`. (`post-form.service.ts:96–110`)

**What could silently break:** A rewrite that stores the date as an ISO string without converting to the datetime-local format would show garbled dates in the input. A rewrite that converts to datetime-local but uses a different time zone assumption would display the correct format but the wrong time.

**Category:** `forms-semantics`
**Severity:** High

---

## §2 Dependency-specific risks

| Dependency | Behavioral role | Risk on migration |
|---|---|---|
| `PostFormService` | Creates, resets, and extracts the typed form group | Date conversion and disabled-id semantics live here; must be ported together |
| `BlogService.addBlogToCollectionIfMissing` | Merges selected blog into options list | See §1.4 |
| `TagService.addTagToCollectionIfMissing` | Merges selected tags into options list | See §1.4 |
| `EventManager` / `AlertError` | Global error event bus | See §1.6 |
| `DataUtils` | Binary field handling | Must be ported if file/image fields are used |
| `dayjs` | Datetime conversion | See §1.9 |

---

## §3 Decomposition note

Three seams are present:
1. **Relationship loading** (`loadRelationshipsOptions`, `updateForm`) — reads reference data and could be a standalone hook.
2. **Binary field handling** (`setFileData`, `byteSize`, `openFile`) — these methods are added by a JHipster pattern for file fields; they could be a mixin or composable.
3. **Save orchestration** (`save`, `subscribeToSaveResponse`, `onSaveSuccess`, `onSaveError`, `onSaveFinalize`) — the save flow is already partially abstracted through `subscribeToSaveResponse`; this is a natural seam for a shared save-handling concern.

No decomposition is required, but these seams inform the target architecture.

---

## §4 Target framework guidance

*(Human-owned. Fill in target-framework-specific recommendations here after target selection.)*
