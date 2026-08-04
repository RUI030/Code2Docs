<!-- code2docs:unit id="component:app/entities/post/update/post-update.component.ts:PostUpdateComponent" schemaVersion="0.4.0" -->

# Component: PostUpdateComponent

<!-- c2d:begin section="1-purpose" source="hand-written" -->
## 1. Component Purpose (Business Logic)

This screen allows a user to create a new Post or edit an existing one through a single unified form. It is a routed destination, not a child component — it receives the entity to edit (if any) from the router before it loads, and it navigates back on success.

**Responsibilities**
- Render a form pre-populated with an existing post's data when editing, or blank when creating.
- Load the available blogs and tags from the server so the user can assign them to the post.
- Ensure the post's current blog and tags appear in the selection lists even if they are not in the first page of results.
- Validate required fields (title, content, date) and prevent submission until they pass.
- Dispatch a create or update operation to the server depending on whether the post already has an id.
- Navigate back to the previous screen on successful save; reset the saving indicator on error without navigating.
- Surface file/binary data utilities (byte-size display, file open, file loading into a form field) via delegated calls to a shared data utility service.
<!-- c2d:end section="1-purpose" -->

<!-- c2d:begin section="2-state-and-data-flow" source="hand-written" -->
## 2. State & Data Flow

- **Props & Events (External):** No `@Input` or `@Output` members. The component is a routed screen. It receives its initial post entity through the router's data property, supplied by a route resolver not visible in this folder (`post-update.component.ts:50` — `activatedRoute.data.subscribe(({ post }) => ...)`). No events are emitted upward.

- **Local State (Internal):**
  - `isSaving: boolean` — `false` at rest; set to `true` when a save is dispatched, reset to `false` when it completes (success or error). (`post-update.component.ts:28`)
  - `post: IPost | null` — the entity being edited, or `null` when creating a new record. Populated from route data in `ngOnInit`. (`post-update.component.ts:29`)
  - `blogsSharedCollection: IBlog[]` — the list of blogs available for selection. Populated by `loadRelationshipsOptions()` on init and augmented to include the post's current blog if it was not in the server's response. (`post-update.component.ts:31`)
  - `tagsSharedCollection: ITag[]` — the list of tags available for selection. Same loading pattern as blogs. (`post-update.component.ts:32`)
  - `editForm: PostFormGroup` — the reactive form holding all editable fields. **Initialized at field declaration (construction time), before `ngOnInit` runs.** (`post-update.component.ts:43`)

- **Derived State:**
  - Whether the ID field is displayed is derived from `editForm.controls.id.value !== null` at render time. (`post-update.component.html:11`)
  - Whether to call create or update is derived from `post.id !== null` on the value extracted from the form — not from `this.post` directly. (`post-update.component.ts:84`)

- **Form State:** Six controls managed by `PostFormService`:
  - `id`: always disabled; required; value is an integer or null. Because the control is disabled, its value is read via `getRawValue()` (not `form.value`) to prevent it from being silently omitted. (`post-form.service.ts:51–56`, `post-form.service.ts:73`)
  - `title`: required. (`post-form.service.ts:58–60`)
  - `content`: required. (`post-form.service.ts:61–63`)
  - `date`: required; stored as a `datetime-local` format string in the form, converted to and from a `dayjs` object by `PostFormService`. (`post-form.service.ts:64–66`, `post-form.service.ts:96–111`)
  - `blog`: optional; holds a full `IBlog` object reference, not just an id. (`post-form.service.ts:67–68`)
  - `tags`: optional; holds an array of `ITag` object references; defaults to `[]`. (`post-form.service.ts:68–69`)
  - Validation errors display only after the user has dirtied or touched a field. (`post-update.component.html:21, 33, 55`)

- **Global State & Subscriptions:**
  - `activatedRoute.data` — subscribed in `ngOnInit`; not explicitly unsubscribed. Angular's router manages this observable's lifecycle. (`post-update.component.ts:50`)
  - `blogService.query()` and `tagService.query()` — subscribed in `loadRelationshipsOptions()`; HTTP observables emit once and complete, so they do not persist. No explicit cleanup. (`post-update.component.ts:119–129`)
  - Save result observable — subscribed via `subscribeToSaveResponse()`; completes after one response. (`post-update.component.ts:91–95`)
  - File load observable in `setFileData` — subscribed inline; errors broadcast via `EventManager`. (`post-update.component.ts:69–74`)

- **Lifecycle:** On `ngOnInit`: subscribe to route data; if a post is present, reset the form with its values and ensure the post's blog and tags are in the collection lists; regardless, query the server for all available blogs and tags. The form exists before `ngOnInit` runs (field initializer). No `ngOnDestroy` is implemented.
<!-- c2d:end section="2-state-and-data-flow" -->

<!-- c2d:begin section="3-ui-and-rendering" source="hand-written" -->
## 3. UI & Rendering Logic

- **Structure:** A centered, width-constrained form (8-column Bootstrap grid). From top to bottom: a heading ("Create or edit a Post"), an alert error component, the form fields (id, title, content, date, blog, tags), and a row with Cancel and Save buttons. (`post-update.component.html:1–107`)

- **Conditional Rendering:**
  - **ID field:** Present in the DOM only when `editForm.controls.id.value !== null` — i.e., when editing an existing record (`post-update.component.html:11`). When absent (new post), the element is fully removed from the DOM, not hidden. Importantly, this condition reads the form control's value directly, so it reflects the form's state, not the URL.
  - **Title validation error:** Shown only when the title control is both invalid and has been touched or dirtied (`post-update.component.html:21`). Within that block, the "required" message uses `@if` on `errors?.required` (`post-update.component.html:23`).
  - **Content validation error:** Same pattern as title. (`post-update.component.html:33–39`)
  - **Date validation errors:** The outer block uses the same dirty/touched guard (`post-update.component.html:55`). Inside, the "required" message uses `@if` (`post-update.component.html:57`). The "datetimelocal" format error uses `[hidden]` (not `@if`) — the element always exists in the DOM; only its visibility is toggled. (`post-update.component.html:61–65`) This is inconsistent with the `@if` pattern used for other errors in the same block.

- **Loops:**
  - Blog dropdown: iterates `blogsSharedCollection` with `track $index` (array-position identity). (`post-update.component.html:74`) A null-value option is prepended to allow deselecting the blog. Option values are full `IBlog` objects.
  - Tags multi-select: iterates `tagsSharedCollection` with `track $index`. (`post-update.component.html:83`) Option values are full `ITag` objects. No null option — deselect by unchecking.

- **Interactions:**
  - Form submit (`ngSubmit`) triggers `save()`. (`post-update.component.html:3`)
  - Cancel button click calls `previousState()` (browser history back). (`post-update.component.html:91`)
  - Blog select's `[compareWith]="compareBlog"` delegates object identity to `BlogService.compareBlog()`. (`post-update.component.html:72`)
  - Tags select's `[compareWith]="compareTag"` delegates object identity to `TagService.compareTag()`. (`post-update.component.html:82`)

- **Loading & Error States:**
  - While saving: the Save button is disabled (`editForm.invalid || isSaving`). (`post-update.component.html:99`) No other loading indicator is rendered.
  - On save error: `onSaveError()` is an empty method; `isSaving` is reset to `false` via the `finalize` operator regardless. No error message is rendered directly by this component. (`post-update.component.ts:102–108`)
  - Errors from file loading (`setFileData`) are broadcast through `EventManager` with a prefixed key. The `<jhi-alert-error>` component at the top of the form is presumably subscribed to display these, but that mechanism is external to this unit. (`post-update.component.ts:70–74`, `post-update.component.html:9`)
  - There is no loading indicator for the initial blog/tag list fetch or for the route resolver data load. The form renders immediately, using the (initially empty) shared collections, which populate asynchronously.

- **Accessibility & i18n:**
  - All labels, the heading, and button text carry `jhiTranslate` directives for i18n. (`post-update.component.html:4, 13, 19, 31, 43, 71, 81, 92, 102`)
  - Validation messages carry `jhiTranslate` as well. (`post-update.component.html:24, 58, 63`)
  - Each input is associated to its label via matching `id`/`for` attributes. (`post-update.component.html:13–14, 19–20, 31–32, 43–50, 71–72, 81–82`)
  - `data-cy` attributes are present on the heading and all inputs/buttons for end-to-end test targeting. (`post-update.component.html:4, 14, 20, 32, 46, 72, 82, 91, 95`)
<!-- c2d:end section="3-ui-and-rendering" -->

<!-- c2d:begin section="4-public-interface" source="hand-written" -->
## 4. Public Interface (ADT)

This component has no `@Input` or `@Output` members. The following are the public callable members reachable from the template or from test code.

| Member | Signature | Contract |
|---|---|---|
| `compareBlog` | `(o1: IBlog\|null, o2: IBlog\|null) => boolean` | Delegates to `BlogService.compareBlog()`; determines whether two Blog objects represent the same record for the purpose of select-option matching. Arrow-function field — `this` is bound at construction. (`post-update.component.ts:45`) |
| `compareTag` | `(o1: ITag\|null, o2: ITag\|null) => boolean` | Same semantics for Tag objects; delegates to `TagService.compareTag()`. Arrow-function field. (`post-update.component.ts:47`) |
| `byteSize` | `(base64String: string) => string` | Returns a human-readable byte-size string for a base64-encoded value. Delegates to `DataUtils`. (`post-update.component.ts:60`) |
| `openFile` | `(base64String: string, contentType: string\|null\|undefined) => void` | Opens or downloads a file encoded as base64; delegates to `DataUtils`. (`post-update.component.ts:64`) |
| `setFileData` | `(event: Event, field: string, isImage: boolean) => void` | Reads a file from an input-change event and writes it into the named form field. Subscribes inline; broadcasts `FileLoadError` through `EventManager` on failure. (`post-update.component.ts:68`) |
| `previousState` | `() => void` | Navigates to the previous browser history entry. (`post-update.component.ts:77`) |
| `save` | `() => void` | Sets `isSaving = true`; extracts the post from the form; calls `PostService.update()` if the id is non-null, else `PostService.create()`; subscribes to the result to handle success/error/finalize. (`post-update.component.ts:81`) |
| `ngOnInit` | `() => void` | Subscribes to route data; populates the form and relationship collections when a post entity is present; always loads the full blog and tag lists. (`post-update.component.ts:49`) |

**Consumed by:** The Angular router (as a standalone routed component). `PostUpdateComponent` is not used as a child component by any visible parent in this folder.

**Note:** `byteSize`, `openFile`, and `setFileData` are present on the class but are not called from the current template. See Open Questions in the Review Gate.
<!-- c2d:end section="4-public-interface" -->

<!-- c2d:begin section="5-dependencies" source="hand-written" -->
## 5. Dependencies & External Integrations

- **Services/APIs:**
  - `PostService` — `postService.update(post)` (PUT) and `postService.create(post)` (POST) for saving the entity. Called from `save()`. (`post-update.component.ts:85–88`)
  - `BlogService` — `blogService.query()` to list all blogs; `blogService.addBlogToCollectionIfMissing()` to merge the post's current blog into the list; `blogService.compareBlog()` for select identity. (`post-update.component.ts:114, 119–123`, `post-update.component.ts:45`)
  - `TagService` — same three-method pattern as BlogService for tags. (`post-update.component.ts:115, 125–129`, `post-update.component.ts:47`)
  - `PostFormService` — `createPostFormGroup()` at construction; `resetForm()` to populate the form from an entity; `getPost()` to extract the entity for saving. (`post-update.component.ts:43, 53, 83, 112`)
  - `DataUtils` — `byteSize()`, `openFile()`, `loadFileToForm()` — binary/file data utilities. (`post-update.component.ts:60, 64, 69`)
  - `EventManager` — `broadcast()` to emit error events for display by `<jhi-alert-error>`. (`post-update.component.ts:71`)
  - `ActivatedRoute` — `activatedRoute.data` to receive the resolved post entity. (`post-update.component.ts:50`)

- **Utils/Packages:**
  - `dayjs` (via `PostFormService`) — date/time parsing and formatting. The form stores dates as `datetime-local` strings; `PostFormService` converts them to/from `dayjs` objects using `DATE_TIME_FORMAT` from `app/config/input.constants`. (`post-form.service.ts:4–5, 97–110`)
  - `SharedModule` — imported into this standalone component; provides shared directives including `jhiTranslate` and `jhi-alert-error`. (`post-update.component.ts:7, 25`)
  - `ReactiveFormsModule` / `FormsModule` — reactive form binding directives (`formGroup`, `formControlName`, `[compareWith]`). (`post-update.component.ts:8, 25`)

*Full dependency detail, including the same-file function call graph, is in `dependencies.json`.*
<!-- c2d:end section="5-dependencies" -->

<!-- c2d:begin section="6-service-layer" source="hand-written" -->
## 6. Service Layer

- **Shared State:**
  - `PostFormService` is `providedIn: 'root'` (`post-form.service.ts:43`), making it an application-wide singleton. However, it holds **no mutable state** — all three public methods are pure transformations on the `FormGroup` passed in. There is no cross-component state concern from this service.
  - `EventManager` is presumably a shared event bus (singleton); this component only emits to it, never reads from it. The events emitted are file-load errors, keyed as `'jhipsterNg17FixtureApp.error'`. (`post-update.component.ts:72`)
  - `BlogService` and `TagService` are accessed via query and utility methods. Whether they cache query results in shared state is not visible from this component.
  - `PostService` performs HTTP mutations (`create`, `update`). Whether it caches, indexes, or broadcasts post-save events is not visible from this component.

- **Mutations by this component:**
  - Writes to the server via `PostService.create()` or `PostService.update()` from `save()`. (`post-update.component.ts:85–88`)
  - Emits to `EventManager` (broadcast) on file-load error. (`post-update.component.ts:71`)
  - Does not write to any shared in-memory service state visible from this file.

- **Other consumers:** Unknown without the repository-level index. `consumersKnown: false`.

- **Stateless operations:**
  - All `BlogService` and `TagService` calls visible here are stateless request/response operations or pure utility methods.
  - All `PostFormService` calls are pure form transformations.
  - `DataUtils` methods delegate to browser APIs; no retained state is visible.

- **Coupling notes:**
  - The form is initialized by `PostFormService.createPostFormGroup()` at construction. If `PostFormService` were to gain mutable state and its behavior depended on call order, construction-time initialization would be earlier than expected.
  - The component relies on `activatedRoute.data` having a `post` key that is either an `IPost` or absent. If the route resolver changes the key name or its shape, `ngOnInit` will silently receive `undefined` and skip form population without error.
<!-- c2d:end section="6-service-layer" -->

<!-- c2d:begin section="7-acceptance-criteria" source="hand-written" -->
## 7. Acceptance Criteria (AC)

- **Scenario 1: Blog list loaded and current blog retained on init**
  - **Given** a post with a blog assigned arrives from the route resolver
  - **When** the component initializes
  - **Then** `BlogService.query()` is called, and the post's blog is added to `blogsSharedCollection` if it was not already present in the server's response
  - *Covered by existing test:* "Should call Blog query and add missing value"

- **Scenario 2: Tag list loaded and current tags retained on init**
  - **Given** a post with one or more tags arrives from the route resolver
  - **When** the component initializes
  - **Then** `TagService.query()` is called, and the post's tags are added to `tagsSharedCollection` if missing
  - *Covered by existing test:* "Should call Tag query and add missing value"

- **Scenario 3: Form populated from route data**
  - **Given** a post entity is provided via the route
  - **When** the component initializes
  - **Then** the form reflects the post's data; `this.post` equals the route-supplied entity; the post's blog and tags appear in their respective collections
  - *Covered by existing test:* "Should update editForm"

- **Scenario 4: Saving an existing post dispatches an update**
  - **Given** the form contains a post with a non-null id
  - **When** `save()` is called and the server responds successfully
  - **Then** `PostService.update()` is called with the post data; `isSaving` is `true` during the request and `false` afterward; `previousState()` is called
  - *Covered by existing test:* "Should call update service on save for existing entity"

- **Scenario 5: Saving a new post dispatches a create**
  - **Given** the form contains no id (id is null)
  - **When** `save()` is called and the server responds successfully
  - **Then** `PostService.create()` is called; `isSaving` resets to `false`; `previousState()` is called
  - *Covered by existing test:* "Should call create service on save for new entity"

- **Scenario 6: Save error resets saving state without navigating**
  - **Given** a save is in flight
  - **When** the server returns an error
  - **Then** `isSaving` becomes `false`; `previousState()` is NOT called
  - *Covered by existing test:* "Should set isSaving to false on error"

- **Scenario 7: Blog identity comparison delegates to BlogService**
  - **Given** two Blog objects (or null values)
  - **When** `compareBlog(o1, o2)` is called
  - **Then** `BlogService.compareBlog(o1, o2)` is called with the same arguments
  - *Covered by existing test:* "Should forward to blogService"

- **Scenario 8: Tag identity comparison delegates to TagService**
  - **Given** two Tag objects (or null values)
  - **When** `compareTag(o1, o2)` is called
  - **Then** `TagService.compareTag(o1, o2)` is called with the same arguments
  - *Covered by existing test:* "Should forward to tagService"

- **Scenario 9: Save button disabled when form is invalid**
  - **Given** one or more required fields (title, content, date) are blank
  - **When** the form is rendered
  - **Then** the Save button is disabled
  - *Covered by existing test:* none

- **Scenario 10: Save button disabled while a save is in flight**
  - **Given** `isSaving` is `true`
  - **When** the form is rendered
  - **Then** the Save button is disabled regardless of form validity
  - *Covered by existing test:* none

- **Scenario 11: ID field visible only for existing records**
  - **Given** the form represents an existing post (id is not null)
  - **When** the form is rendered
  - **Then** a read-only ID field is visible; for a new post, the ID field is absent entirely
  - *Covered by existing test:* none

- **Scenario 12: Field-level validation errors appear only after user interaction**
  - **Given** a required field (title, content, date) is empty
  - **When** the user touches or dirties the field
  - **Then** a "This field is required" message appears beneath the field; the message is absent before interaction
  - *Covered by existing test:* none

- **Scenario 13: New form group has all required controls**
  - **Given** no initial post data
  - **When** `PostFormService.createPostFormGroup()` is called
  - **Then** the returned group has controls for id, title, content, date, blog, and tags
  - *Covered by existing test:* "should create a new form with FormControl"

- **Scenario 14: Form group created from existing post has all controls**
  - **Given** an IPost with required data
  - **When** `PostFormService.createPostFormGroup(post)` is called
  - **Then** the form group has all six controls
  - *Covered by existing test:* "passing IPost should create a new form with FormGroup"

- **Scenario 15: getPost round-trips new post sample data**
  - *Covered by existing test:* "should return NewPost for default Post initial value"

- **Scenario 16: getPost returns empty-like object for blank form**
  - *Covered by existing test:* "should return NewPost for empty Post initial value"

- **Scenario 17: getPost round-trips existing post data**
  - *Covered by existing test:* "should return IPost"

- **Scenario 18: ID control remains disabled after resetForm with an existing post**
  - **Given** a form group (id control is disabled)
  - **When** `resetForm(form, existingPost)` is called
  - **Then** the id control is still disabled
  - *Covered by existing test:* "passing IPost should not enable id FormControl"

- **Scenario 19: ID control remains disabled after resetForm with a new post**
  - **Given** a form group built from existing data (id control is disabled)
  - **When** `resetForm(form, { id: null })` is called
  - **Then** the id control is still disabled
  - *Covered by existing test:* "passing NewPost should disable id FormControl"
<!-- c2d:end section="7-acceptance-criteria" -->

<!-- c2d:begin section="8-domain-business-rules" source="hand-written" human-owned="false" -->
## 8. Domain Business Rules (For SME Review)

- **Business Constraints:**
  - A Post must have a title (non-empty, required). (`post-form.service.ts:58–60`)
  - A Post must have a content body (non-empty, required). (`post-form.service.ts:61–63`)
  - A Post must have a date/time (required). (`post-form.service.ts:64–66`)
  - A Post may be associated with at most one Blog, or none. The blog field is optional. (`post-form.service.ts:67–68`)
  - A Post may have zero or more Tags (many-to-many). (`post-form.service.ts:68–69`)
  - The Post ID is system-assigned and is never editable by the user; it is displayed read-only only when editing an existing record. (`post-form.service.ts:51–56`)

- **Edge Cases & Error Handling:**
  - When creating a new post, the date field defaults to the current date and time. (`post-form.service.ts:87–93`)
  - If the server rejects a save, the form remains open with `isSaving` reset to `false`. The component itself does not display the error; it relies on an external error-display mechanism. (`post-update.component.ts:102–108`) Whether error detail is communicated to the user is an open question (see Review Gate).
  - The blog field includes a null/empty option, allowing the user to explicitly disassociate a post from a blog. (`post-update.component.html:73`)

- **Domain Terminology/Formulas:**
  - "Post" — a blog post entity with title, content, date, an optional blog association, and zero-or-more tags.
  - "Blog" — a container entity that groups posts; inferred from naming and the many-to-one relationship.
  - "Tag" — a label entity applied to posts in a many-to-many relationship; inferred from naming.
  - **Confidence: medium** — field-level rules are directly code-visible. The business meaning of "date" (publication date? creation date?) is inferred from field naming and the default-to-now behavior; no authoritative domain document is available in this folder.
<!-- c2d:end section="8-domain-business-rules" -->

---

<!-- c2d:begin section="review-gate" source="hand-written" -->
## Review Gate

**Status:** pending

Stage 2 (implementation) must not begin until status is `approved` and no blocking question remains open.

**Open Questions**
- [ ] `onSaveError()` is empty with the comment "Api for inheritance" (`post-update.component.ts:102–104`). Does a subclass override this method, or is error communication entirely delegated to `jhi-alert-error` via `EventManager`? **Blocking if unhandled errors are silent.** `blocking: true`
- [ ] Does `EventManager.broadcast()` trigger `<jhi-alert-error>` to display errors? The mechanism is not visible from this component. Without confirming this, it is unknown whether save errors or file-load errors are ever surfaced to the user. `blocking: true`
- [ ] `byteSize`, `openFile`, and `setFileData` are present on the class but no template elements call them (`post-update.component.ts:60–75`). Are these dead code from JHipster scaffolding for a blob/binary field that was removed, or are they used by a parent or dynamic overlay not visible here? If dead code, they can be omitted from a rebuild. `blocking: false`
- [ ] `track $index` in both `@for` loops (`post-update.component.html:74, 83`). Was this intentional? Position-based tracking rebuilds all option elements on array replacement. If the lists are stable and sorted on the server this is invisible, but if they can change in place the selected value may be lost. `blocking: false`
- [ ] `DATE_TIME_FORMAT` is imported from `app/config/input.constants` (`post-form.service.ts:5`) but its exact value was not read. The date round-trip behavior (form ↔ server) depends on this constant matching the format the server expects. `blocking: true`

**Suspected Defects in Existing Code**
- The date error block uses `@if` for the "required" message but `[hidden]` for the "datetimelocal" message within the same conditional block (`post-update.component.html:55–67`). This is inconsistent: the datetimelocal element always exists in the DOM; the required element does not. This may be intentional (e.g., to avoid layout shift) or an oversight. Confidence: low.

**Confidence:** medium — 12 methods (including 2 arrow-function fields) enumerated and covered; all 15 spec test titles from both spec files mapped to acceptance criteria. Template read in full. Weaknesses: `EventManager`, `BlogService`, `TagService`, `PostService`, and `DATE_TIME_FORMAT` internals not read; route resolver not visible; `onSaveError` extension pattern unconfirmed.

*Migration hazards for this component are recorded separately in `migration_notes.md`.*
<!-- c2d:end section="review-gate" -->
