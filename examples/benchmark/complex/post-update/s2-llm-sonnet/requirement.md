<!-- code2docs:unit id="component:entities/post/update:PostUpdateComponent" schemaVersion="0.4.0" -->

# Component: PostUpdateComponent

<!-- c2d:begin section="1-purpose" source="hand-written" -->
## 1. Component Purpose (Business Logic)

Provides a form for creating a new post or editing an existing one. On arrival, it loads reference data (available blogs and tags) and, if an existing post was resolved by the router, populates the form with that post's data. On submission it dispatches either a create or update request to the server and navigates back on success.

**Responsibilities**
- Load the current post from route data and populate the edit form (editForm) when editing an existing record. (`post-update.component.ts:50–54`)
- Load the full list of available blogs and tags from their respective services and merge any already-selected values so they are present in the dropdown options. (`post-update.component.ts:118–130`)
- Determine whether a submission is a create or an update based on the presence of an `id`, and dispatch to the appropriate service endpoint. (`post-update.component.ts:82–89`)
- Disable the save button while saving is in progress and re-enable it after the request completes, regardless of success or failure. (`post-update.component.ts:82,107`; `post-update.component.html:99`)
- Navigate back to the previous screen on successful save or when the user cancels. (`post-update.component.ts:78–79,98–100`)
- Support binary field handling: expose byte-size display and file-open helpers, and load file data from browser file-input events into the form. (`post-update.component.ts:60–75`)
- Delegate blog and tag identity comparison to their respective services so that the dropdowns correctly identify already-selected values. (`post-update.component.ts:45–47`)
<!-- c2d:end section="1-purpose" -->

<!-- c2d:begin section="2-state-and-data-flow" source="hand-written" -->
## 2. State & Data Flow

- **Props & Events (External):** None declared. The component has no Angular inputs or outputs. The post to edit is supplied via the router's data resolver, not by a parent component.

- **Local State (Internal):**
  - `isSaving` — boolean, initially false. Set to true when a save request is dispatched; reset to false in the `finalize` handler when the request completes (success or error). (`post-update.component.ts:28,82,107`)
  - `post` — holds the resolved `IPost` object or null. Set from route data on init; updated by `updateForm`. (`post-update.component.ts:29,51,111`)
  - `blogsSharedCollection` — the list of `IBlog` objects available in the blog dropdown. Populated by `loadRelationshipsOptions` and merged with any currently-selected blog. (`post-update.component.ts:31,114,123`)
  - `tagsSharedCollection` — the list of `ITag` objects available in the tags multi-select. Populated similarly. (`post-update.component.ts:32,115,129`)
  - `editForm` — the reactive form group created by PostFormService. Holds all editable fields: id, title, content, date, blog, and tags. (`post-update.component.ts:43`)

- **Derived State:**
  - The save button's disabled state derives from `editForm.invalid || isSaving`. (`post-update.component.html:99`)
  - The ID field is shown only when the form's id control has a non-null value, which indicates an existing-record edit rather than a create. (`post-update.component.html:11`)

- **Form State:**
  | Control | Type | Validation Rule |
  |---|---|---|
  | `id` | number | Disabled (read-only); required. Present only when editing an existing post. (`post-form.service.ts:51–56`) |
  | `title` | text | Required. Validation error shown when dirty or touched and blank. (`post-form.service.ts:58–60`; `post-update.component.html:21–27`) |
  | `content` | textarea | Required. Validation error shown when dirty or touched and blank. (`post-form.service.ts:61–63`; `post-update.component.html:33–39`) |
  | `date` | datetime-local | Required; must be a valid datetime-local value. (`post-form.service.ts:64–66`; `post-update.component.html:55–67`) |
  | `blog` | select (single) | Optional. Dropdown populated from `blogsSharedCollection`. (`post-form.service.ts:67`; `post-update.component.html:72–78`) |
  | `tags` | select (multiple) | Defaults to empty array. Multi-select populated from `tagsSharedCollection`. (`post-form.service.ts:68`; `post-update.component.html:82–87`) |

- **Global State & Subscriptions:** Three subscriptions in `ngOnInit` and `loadRelationshipsOptions` — route data, blog query, tag query. None have explicit teardown. Route data is expected to complete after one emission; blog and tag queries are single HTTP responses. (`post-update.component.ts:50–57,119–130`)

- **Lifecycle:** On initialization, route data is subscribed to: the post is stored, the form is populated if a post exists, and relationship data is loaded. No AfterViewInit or teardown logic.
<!-- c2d:end section="2-state-and-data-flow" -->

<!-- c2d:begin section="3-ui-and-rendering" source="hand-written" -->
## 3. UI & Rendering Logic

- **Structure:** A centered 8-column-wide form with a "Create or edit a Post" heading, an alert-error child component, six field groups (ID, Title, Content, Date, Blog, Tags), and two action buttons (Cancel, Save). (`post-update.component.html:1–107`)

- **Conditional Rendering:**
  - The ID field group is rendered only when the form's id control value is non-null — i.e., only when editing an existing post, not creating. (`post-update.component.html:11`)
  - Inline validation error messages for title, content, and date appear only when the control is both invalid and either dirty or touched. The "required" message appears when the `required` error is set. The date field additionally shows a "This field should be a date and time." message when the `datetimelocal` error is set. (`post-update.component.html:21–27,33–39,55–67`)

- **Loops:**
  - The blog dropdown renders one `<option>` per entry in `blogsSharedCollection`. (`post-update.component.html:74–76`)
  - The tags multi-select renders one `<option>` per entry in `tagsSharedCollection`. (`post-update.component.html:83–85`)
  - Both use `track $index` for identity; the `compareBlog` and `compareTag` comparison functions drive selection matching against the currently-bound value.

- **Interactions:**
  - Form submission (via the Save button or pressing Enter while in the form) calls `save()`. (`post-update.component.html:3`)
  - Clicking Cancel calls `previousState()`, navigating back in history. (`post-update.component.html:91`)
  - File input events (if used — template does not show a file input but the component has `setFileData` and `openFile` handlers) would call those methods.

- **Loading & Error States:**
  - The Save button is disabled while `isSaving` is true, preventing double-submit. (`post-update.component.html:99`)
  - File load errors are broadcast as application-level alert events via the event manager rather than being shown inline. (`post-update.component.ts:70–74`)
  - No loading indicator while relationship data (blogs, tags) loads. The dropdowns start empty and populate asynchronously.
  - On save error, `isSaving` is reset but no error message is shown — the component relies on `<jhi-alert-error>` to display HTTP error responses. (`post-update.component.ts:102–104`)

- **Accessibility & i18n:** Field labels and heading carry `jhiTranslate` keys: heading `jhipsterNg17FixtureApp.post.home.createOrEditLabel`, field labels for id, title, content, date, blog, tag, and validation messages use `entity.validation.required` and `entity.validation.datetimelocal`. Button labels use `entity.action.cancel` and `entity.action.save`. (`post-update.component.html:4,13,19,31,43,71,81`)
<!-- c2d:end section="3-ui-and-rendering" -->

<!-- c2d:begin section="4-public-interface" source="hand-written" -->
## 4. Public Interface (ADT)

| Member | Signature | Contract |
|---|---|---|
| `isSaving` | `boolean` | True while a save request is in flight. Tests read this to assert save state. |
| `post` | `IPost \| null` | The post being edited, or null for create. |
| `blogsSharedCollection` | `IBlog[]` | Available blogs. Tests assert contents after init. |
| `tagsSharedCollection` | `ITag[]` | Available tags. Tests assert contents after init. |
| `editForm` | `PostFormGroup` | The reactive form. Tests patch values and call save. Updating the editForm with a post's data is the primary initialization assertion. |
| `compareBlog(o1, o2)` | `(IBlog\|null, IBlog\|null) => boolean` | Forwards to blogService to determine if two blog references are equal. Used by the dropdown. |
| `compareTag(o1, o2)` | `(ITag\|null, ITag\|null) => boolean` | Forwards to tagService to determine if two tag references are equal. |
| `save()` | `(): void` | Dispatches create or update based on whether the form's id is set. Sets isSaving during the request. |
| `previousState()` | `(): void` | Navigates back in browser history. Called on cancel and on save success. |
| `byteSize(base64String)` | `(string) => string` | Returns human-readable file size. Delegates to DataUtils. |
| `openFile(base64String, contentType)` | `(string, string\|null\|undefined) => void` | Opens a binary file. Delegates to DataUtils. |
| `setFileData(event, field, isImage)` | `(Event, string, boolean) => void` | Loads file from browser event into the form. Error events are broadcast globally. |

**Consumed by:** Mounted by the router for the post create/edit route. No parent component renders it directly.
<!-- c2d:end section="4-public-interface" -->

<!-- c2d:begin section="5-dependencies" source="hand-written" -->
## 5. Dependencies & External Integrations

- **Services/APIs:**
  - `PostService.update(post)` — sends a PUT/PATCH request for an existing post. Called when `post.id !== null`. (`post-update.component.ts:85`)
  - `PostService.create(post)` — sends a POST request to create a new post. Called when `post.id === null`. (`post-update.component.ts:87`)
  - `PostFormService.createPostFormGroup()` — creates the typed form group for the post edit form. (`post-update.component.ts:43`)
  - `PostFormService.getPost(editForm)` — extracts a typed `IPost` or `NewPost` from the form's current values. (`post-update.component.ts:83`)
  - `PostFormService.resetForm(editForm, post)` — populates the editForm with an existing post's data, handling date format conversion. (`post-update.component.ts:112`)
  - `BlogService.query()` — fetches the full list of available blogs. (`post-update.component.ts:119`)
  - `BlogService.addBlogToCollectionIfMissing(collection, ...blogs)` — merges the currently-selected blog into the loaded list so it appears as a selected option. (`post-update.component.ts:114,122`)
  - `BlogService.compareBlog(o1, o2)` — identity comparison delegated through the component's `compareBlog` arrow function; used by the blog select control to match selected values. (`post-update.component.ts:45`)
  - `TagService.query()` — fetches the full list of available tags. (`post-update.component.ts:125`)
  - `TagService.addTagToCollectionIfMissing(collection, ...tags)` — merges currently-selected tags into the loaded list. (`post-update.component.ts:115,128`)
  - `TagService.compareTag(o1, o2)` — identity comparison for the tags multi-select. (`post-update.component.ts:47`)
  - `DataUtils.byteSize`, `DataUtils.openFile`, `DataUtils.loadFileToForm` — binary field utilities. (`post-update.component.ts:34,61,64,69`)
  - `EventManager.broadcast` — broadcasts file load errors as application-level events. (`post-update.component.ts:35,71`)
  - `ActivatedRoute.data` — supplies the resolved post (or null) via the router's data resolver. (`post-update.component.ts:40,50`)
- **Utils/Packages:**
  - `dayjs` — used inside `PostFormService` for datetime format conversion (`DATE_TIME_FORMAT`). (`post-form.service.ts:4`)
  - `SharedModule`, `FormsModule`, `ReactiveFormsModule` — form and shared directive support.

*Full dependency detail is in `dependencies.json`.*
<!-- c2d:end section="5-dependencies" -->

<!-- c2d:begin section="6-service-layer" source="hand-written" -->
## 6. Service Layer

- **Shared State:**
  - `BlogService` is `providedIn: 'root'` (inferred — service pattern in JHipster). Querying blogs returns the current collection from the server; the component holds a local copy in `blogsSharedCollection` that is not shared back.
  - `TagService` is similarly `providedIn: 'root'`. Same pattern.
  - `PostService` is `providedIn: 'root'`. Update and create calls mutate server-side post data. The component does not cache the server response — after save, it navigates back and the caller re-fetches if needed.
  - `EventManager` is a shared event bus. File load errors are broadcast to any subscriber of `jhipsterNg17FixtureApp.error`. (`post-update.component.ts:71–73`)

- **Mutations by this component:**
  - `PostService.update` or `PostService.create` — mutates post data on the server. (`post-update.component.ts:85,87`)
  - `EventManager.broadcast` — fires an error event into the application event bus on file load failure. (`post-update.component.ts:71`)

- **Other consumers:** Unknown without the repository-level index. `consumersKnown: false`. Open question: which components listen to the `jhipsterNg17FixtureApp.error` event?

- **Stateless operations:** Blog and tag queries return server data directly with no mutation of shared service state within this component.

- **Coupling notes:** `blogsSharedCollection` and `tagsSharedCollection` are built on initialization and never refreshed. If the blog or tag list changes between the component mounting and the user saving, the component may submit stale relationship references.
<!-- c2d:end section="6-service-layer" -->

<!-- c2d:begin section="7-acceptance-criteria" source="hand-written" -->
## 7. Acceptance Criteria (AC)

- **Scenario 1: Blog query is called and missing blog is added to collection**
  - **Given** an existing post with a blog association
  - **When** initialization runs
  - **Then** the component should call the Blog query and add the missing blog value to the collection, ensuring `blogsSharedCollection` contains the post's blog
  - *Covered by existing test:* post-update.component.spec.ts:54

- **Scenario 2: Tag query is called and missing tag is added to collection**
  - **Given** an existing post with tag associations
  - **When** initialization runs
  - **Then** the component should call the Tag query and add missing tag values, ensuring `tagsSharedCollection` contains the post's tags
  - *Covered by existing test:* post-update.component.spec.ts:76

- **Scenario 3: editForm is updated with existing post data on init**
  - **Given** an existing post resolved from the route
  - **When** initialization runs
  - **Then** the editForm should be updated with the post's data — the post is stored, and `blogsSharedCollection` and `tagsSharedCollection` are populated to include the post's associations
  - *Covered by existing test:* post-update.component.spec.ts:95

- **Scenario 4: Update service called when saving existing entity**
  - **Given** the editForm holds a post with an existing id
  - **When** the user calls save on the existing entity
  - **Then** the component should call the update service on save for the existing entity, set isSaving to true during the request, navigate back on success, and set isSaving to false after completion
  - *Covered by existing test:* post-update.component.spec.ts:112

- **Scenario 5: Create service called when saving new entity**
  - **Given** the editForm holds a post with no id (new entity)
  - **When** the user calls save for the new entity
  - **Then** the component should call the create service on save, set isSaving to true during the request, and navigate back on success
  - *Covered by existing test:* post-update.component.spec.ts:135

- **Scenario 6: isSaving reset to false on save error**
  - **Given** the save request results in an error
  - **When** the error is received
  - **Then** the component should set isSaving to false on error, and not navigate back
  - *Covered by existing test:* post-update.component.spec.ts:158

- **Scenario 7: compareBlog forwards to blogService**
  - **Given** two blog objects to compare
  - **When** the blog dropdown compares selected values
  - **Then** the compareBlog method should forward to blogService using the BlogService comparison — the result is determined entirely by blogService.compareBlog
  - *Covered by existing test:* post-update.component.spec.ts:181

- **Scenario 8: compareTag forwards to tagService**
  - **Given** two tag objects to compare
  - **When** the tags multi-select compares selected values
  - **Then** the compareTag method should forward to tagService using the TagService comparison — the result is determined entirely by tagService.compareTag
  - *Covered by existing test:* post-update.component.spec.ts:191
<!-- c2d:end section="7-acceptance-criteria" -->

<!-- c2d:begin section="8-domain-business-rules" source="hand-written" -->
## 8. Domain Business Rules (For SME Review)

- **Business Constraints:**
  - Title, content, and date are required fields; the form cannot be saved if any is blank or the date is invalid. (`post-form.service.ts:58–66`; template validation messages)
  - A post may optionally be associated with one blog and zero or more tags. The blog association is a single-select; tags are multi-select. (`post-update.component.html:72–87`)
  - The date field uses datetime-local format (`YYYY-MM-DD HH:mm`). The date is stored in a normalized format via `PostFormService`'s conversion methods. (`post-form.service.ts:96–110`; `post-update.component.html:52`)
  - The ID field is read-only when editing an existing post; it is hidden entirely for new posts. (`post-update.component.html:11–16`)

- **Edge Cases & Error Handling:**
  - When saving fails, the user stays on the form and no error message is shown inline — the error is expected to appear via `<jhi-alert-error>`, which listens for HTTP error events. Whether the error actually appears depends on how HTTP error responses are wired to that component. (`post-update.component.ts:102–104`; `post-update.component.html:9`)
  - File load errors (from `setFileData`) are broadcast as `jhipsterNg17FixtureApp.error` events rather than shown inline. The application must handle this event to display it to the user. (`post-update.component.ts:70–74`)
  - If blogs or tags are empty or fail to load, the dropdowns are empty. No error is displayed. The post can still be saved without a blog or with no tags.
  - The `onSaveError()` method is intentionally empty — it exists as an inheritance hook for subclasses. (`post-update.component.ts:102–104`)

- **Domain Terminology/Formulas:**
  - *Post* — a user-authored entry belonging to a blog, with a title, content body, creation date, and optional tag associations.
  - *Blog* — a grouping entity that a post belongs to. A post may belong to at most one blog.
  - *Tag* — a label that can be applied to multiple posts. A post may have zero or more tags.
  - *Shared collection* — the merged list of all available options plus any currently-selected value(s). The pattern ensures that a currently-selected entity is always present in the dropdown even if it was excluded from the latest query result.
<!-- c2d:end section="8-domain-business-rules" -->

---

<!-- c2d:begin section="review-gate" source="hand-written" -->
## Review Gate

**Status:** pending

Stage 2 (implementation) must not begin until status is `approved` and no blocking question remains open.

**Open Questions**
- [ ] *(Blocking)* What validation rules does `PostFormService.createPostFormGroup()` apply to each control beyond what is visible in its source? The service appears to apply only `required` to title, content, date, and id — but the `PostFormGroup` type alias and any async validators on individual controls are not fully visible. (`post-form.service.ts:44–69`)
- [ ] *(Non-blocking)* Which components listen to `jhipsterNg17FixtureApp.error` events broadcast by the file error path? Without the repository index, it is unknown whether the error is ever displayed to the user. (`post-update.component.ts:71`)
- [ ] *(Non-blocking)* `onSaveError()` is empty with a comment saying "Api for inheritance." Are there subclasses of `PostUpdateComponent`? If so, their error handling should be documented separately. (`post-update.component.ts:102–104`)
- [ ] *(Non-blocking)* What happens if the route provides no post (create flow) but the blog or tag query returns an error? `loadRelationshipsOptions` does not handle the error path — the dropdowns would remain empty with no user feedback. Is this intentional? (`post-update.component.ts:118–130`)

**Suspected Defects in Existing Code**
- No loading state while blog and tag lists load: the dropdowns start empty and populate asynchronously without any spinner or placeholder. On slow connections, the user could attempt to save before the dropdown options are available. Confidence: high.
- No explicit subscription cleanup in `ngOnInit` or `loadRelationshipsOptions`. The route data and query subscriptions are expected to complete after one emission, so the leak window is narrow — but it is not guaranteed. Confidence: medium.

**Confidence:** medium — 12 methods and 2 arrow fields traced; all 8 spec titles covered; template fully read; `PostFormService` internals partially read but async validators and custom validators not confirmed absent; `PostService`, `BlogService`, and `TagService` internals not read.

*Migration hazards for this component are recorded separately in `migration_notes.md`.*
<!-- c2d:end section="review-gate" -->
