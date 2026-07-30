<!-- code2docs:unit id="component:app/entities/post/update:PostUpdateComponent" schemaVersion="0.2.0" -->
<!--
  PHASE A OUTPUT — hand-written, not rendered.
  Citations relative to INPUT/.../app/entities/post/update/
  c.ts = post-update.component.ts, c.html = post-update.component.html, f.ts = post-form.service.ts

  Unlike requirement.md, this document NAMES Angular constructs explicitly. Mechanism is the
  subject here, and an engineer planning the rewrite needs the specific API, not a paraphrase.
-->

# Migration Notes: Create or Edit a Blog Post

> **This list is a lower bound, not a complete inventory.**
>
> Risk flagging pattern-matches against conditions like "a subscription with no cancellation,"
> which presumes every subscription was found. Phase A has no verified extraction, so recall is
> unproven. Read these as "hazards found," never "hazards present." A short list here means the
> analysis was shallow, not that the component is safe.

## 0. Before anything else: three methods and two dependencies are dead

`byteSize`, `openFile`, and `setFileData` (`c.ts:60-75`) are called from nowhere — not the
template, not another method, not the tests. `Post` has no binary field, so these are JHipster
generator boilerplate for entity types that do. `DataUtils` (`c.ts:34`) and `EventManager`
(`c.ts:35`) are injected **solely** to serve them.

Consequence for the rewrite: roughly a quarter of the component's methods and two of its seven
dependencies can be dropped outright — but only after confirming nothing outside this folder
reaches them (see the blocking question in `requirement.md`). Porting them faithfully would carry
dead code plus two unnecessary dependencies into the new codebase.

Caveat: this rests on a manual search, not verified extraction. It is the highest-value finding
here and also the one most in need of tool confirmation.

## 1. Migration-Sensitive Behavior

| Severity | Category | Behavior at risk | Source |
|---|---|---|---|
| High | `forms-semantics` | `getRawValue()` is what carries the disabled `id`; using `.value` would turn every update into a create | `f.ts:73` |
| High | `mutable-service-state` | Save failures are reported only via `EventManager` broadcast to a listener outside this folder | `c.ts:102-104`, `c.html:9` |
| High | `direct-dom-access` | `window.history.back()` for both cancel and post-save navigation, bypassing the router | `c.ts:78`, `c.ts:99` |
| Medium | `rxjs-pipeline` | Neither relationship `query()` subscription handles errors; dropdowns fail silently | `c.ts:118-130` |
| Medium | `forms-semantics` | Error display gated on `dirty \|\| touched`, not validity alone | `c.html:21,33,55` |
| Medium | `forms-semantics` | `id` control is `disabled: true` **and** `Validators.required` — the validator is inert | `f.ts:51-57` |
| Medium | `lifecycle-ordering` | `editForm` field initializer calls the injected `PostFormService` during property setup | `c.ts:43` |
| Medium | `template-directive` | `@for ... track $index` gives options positional identity | `c.html:74,83` |
| Low | `subscription-leak` | Three `subscribe()` calls, no `takeUntilDestroyed` and no `ngOnDestroy` | `c.ts:50,123,129` |
| Low | `di-assumption` | All six services are `providedIn: 'root'` singletons | `c.ts:34-40` |

### Detail

- **`forms-semantics` — `getRawValue()` versus `.value` (high)**
  - *What Angular does here:* the `id` control is created with `{ value, disabled: true }`
    (`f.ts:52`). Angular **excludes disabled controls from `FormGroup.value`** but includes them in
    `getRawValue()`. `PostFormService.getPost` uses `getRawValue()` (`f.ts:73`), which is the only
    reason `id` survives to reach `save`.
  - *What could silently break:* `save` branches on `post.id !== null` (`c.ts:84`). A rewrite whose
    form library omits disabled fields from the submitted value would make `id` null on every
    edit, so **every update becomes a create** — silently duplicating records rather than erroring.
  - *Evidence:* `f.ts:52`, `f.ts:73`, `c.ts:84`.

- **`mutable-service-state` — failure reporting delegated off-component (high)**
  - *What Angular does here:* `onSaveError` is deliberately empty (`c.ts:102-104`). Errors surface
    through `<jhi-alert-error>` (`c.html:9`), fed by an application-wide interceptor broadcasting
    on the root-provided `EventManager` (`c.ts:35`) — machinery outside this folder.
  - *What could silently break:* a rewrite that ports this component faithfully gets an **empty
    error handler and no error display**. Saves would fail in complete silence. The behavior to
    preserve is not in this file, which is exactly why it is easy to lose.
  - *Evidence:* `c.ts:102-104`, `c.html:9`, `c.ts:35`.

- **`direct-dom-access` — `window.history.back()` (high)**
  - *What Angular does here:* `previousState` calls `window.history.back()` directly
    (`c.ts:78`), bypassing Angular's `Router` entirely. It is invoked both by the cancel button
    (`c.html:91`) and by `onSaveSuccess` (`c.ts:99`).
  - *What could silently break:* the obvious rewrite substitutes a router navigation to the post
    list — which is **not equivalent**. History-back depends on how the person arrived and can
    leave the application entirely on a deep link. Either behavior is defensible; changing it
    accidentally, in the success path of a save, is not.
  - *Evidence:* `c.ts:77-79`, `c.ts:98-100`, `c.html:91`.

- **`rxjs-pipeline` — unhandled errors in relationship loading (medium)**
  - *What Angular does here:* both chains are `query().pipe(map(...)).pipe(map(...)).subscribe(fn)`
    with a bare next-handler and **no `catchError` and no error callback**
    (`c.ts:119-123`, `c.ts:125-129`).
  - *What could silently break:* the current failure mode is an empty dropdown with no message. A
    rewrite using a data-fetching library that surfaces errors by default would *improve* on this —
    a behavior change that happens to be desirable but should be deliberate. Conversely a rewrite
    that also swallows errors reproduces a defect.
  - *Evidence:* `c.ts:118-130`.

- **`forms-semantics` — error display timing (medium)**
  - *What Angular does here:* messages render only when the control is `invalid` **and**
    (`dirty` || `touched`) (`c.html:21,33,55`). A pristine, untouched, empty required field shows
    nothing.
  - *What could silently break:* form libraries differ on when to reveal errors — some on change,
    some on blur, some on submit. Getting this wrong either nags on arrival or hides problems until
    submission. Note the empty-and-untouched case is reachable here: a new post opens with title
    and content blank.
  - *Evidence:* `c.html:21,33,55`.

- **`forms-semantics` — inert validator on a disabled control (medium)**
  - *What Angular does here:* `id` carries `Validators.required` and `nonNullable: true` while also
    being `disabled: true` (`f.ts:51-57`). Disabled controls are excluded from validation, so the
    rule never affects `editForm.invalid` — and therefore never affects the save button
    (`c.html:99`).
  - *What could silently break:* a rewrite that keeps the required rule but makes the field merely
    read-only rather than disabled would suddenly **enforce** it — blocking creation of new posts,
    where `id` is null. A latent rule becoming live is a nasty failure because the form definition
    reads as though it were always intended.
  - *Evidence:* `f.ts:51-57`, `c.html:99`.

- **`lifecycle-ordering` — form built during property initialization (medium)**
  - *What Angular does here:* `editForm` is a field whose initializer calls
    `this.postFormService.createPostFormGroup()` (`c.ts:43`). This runs during property setup, so
    `postFormService` must already be assigned — hence the declaration order and the
    `member-ordering` lint suppression at `c.ts:42`.
  - *What could silently break:* a rewrite that constructs the form later (in an init hook) or
    earlier (before dependencies resolve) changes whether the form exists when the template first
    renders. The template dereferences `editForm.controls` and `editForm.get(...)` unguarded
    (`c.html:11,21`), so a not-yet-built form throws on first render.
  - *Evidence:* `c.ts:42-43`, `c.html:11`.

- **`template-directive` — positional tracking (medium)**
  - *What Angular does here:* `@for (blogOption of blogsSharedCollection; track $index)`
    (`c.html:74`, and `c.html:83` for tags). Identity is the array position, not the entity.
  - *What could silently break:* both collections are **replaced** when loading completes
    (`c.ts:123,129`) and can be mutated by the merge-if-missing step (`c.ts:114-115`). With
    positional tracking, a reorder reuses the wrong DOM node. For `<option>` elements bound with
    `[ngValue]` the practical risk is small, but a rewrite that keys list items by index inherits a
    real bug if these ever become richer controls.
  - *Evidence:* `c.html:74,83`, `c.ts:114-115,123,129`.

- **`subscription-leak` — three uncancelled subscriptions (low)**
  - *What Angular does here:* `activatedRoute.data.subscribe` (`c.ts:50`) plus two `query()`
    subscriptions (`c.ts:123,129`). No `takeUntilDestroyed`, no `ngOnDestroy`, no `async` pipe.
  - *What could silently break:* probably nothing — `HttpClient` streams complete after one
    emission, and `ActivatedRoute` streams are understood to be completed by the router on
    teardown. That was asserted from knowledge, not verified, which is why it is recorded rather
    than dismissed. A rewrite whose equivalents do not self-terminate would turn all three into
    real leaks.
  - *Evidence:* `c.ts:50,123,129`.

- **`di-assumption` — root singletons (low)**
  - *What Angular does here:* all six services resolve to application-wide single instances via
    `inject()` (`c.ts:34-40`).
  - *What could silently break:* only `EventManager` carries state, so instance count is
    unobservable for the rest. Noted so the scope is not assumed irrelevant elsewhere — for the
    event bus it is load-bearing, since a per-component instance would break error display
    entirely.
  - *Evidence:* `c.ts:34-40`.

## 2. Suggested Functional Breakdown

The form construction, population, and read-back logic is **already extracted** into
`PostFormService` (`f.ts`), including date conversion and defaulting. That seam exists and should
be preserved rather than re-inlined.

Beyond that, one observation about the current structure: `subscribeToSaveResponse`,
`onSaveSuccess`, `onSaveError`, and `onSaveFinalize` (`c.ts:91-108`) exist as overridable
extension points rather than because this component needs four separate methods — `onSaveError` is
an empty body with a comment saying so (`c.ts:103`). If the rewrite has no inheritance requirement,
these collapse into the save call's own handlers. Members involved: those four methods only.

No other separable responsibility. Removing the dead file-handling trio (§0) leaves a single
coherent job.

## 3. Third-Party Dependencies

| Package | Used for | Direct equivalent in target? |
|---|---|---|
| `dayjs` | Date parsing, formatting, and defaulting new posts to now (`f.ts:4,87,99,108`) | unknown |
| `@fortawesome` icons (`fa-icon`) | Cancel and save button icons (`c.html:92,102`) | unknown |
| Bootstrap-style CSS classes | All layout and form styling (`c.html` throughout) | unknown |
| `jhiTranslate` directive (internal, via `SharedModule`) | All 13 visible strings (`c.html:4,13,19,...`) | unknown |
| `<jhi-alert-error>` (internal) | The **only** save-failure display (`c.html:9`) | unknown |

The date library is the one with behavioral weight: it decides the storage format
(`DATE_TIME_FORMAT`, `f.ts:5`) and supplies the default timestamp, so a substitution changes both
the wire format and what a new post's date means.

## 4. Target Implementation Suggestions

Architectural recommendations for the target implementation.

**Human-owned by default.** The pipeline deliberately does not generate this: doing so would let
target-framework assumptions leak backward into the behavioral specification, which is the failure
mode the requirement/migration split exists to prevent. Fill this in during review, once §0–§3 are
understood.
