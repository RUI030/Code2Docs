<!-- code2docs:unit id="component:entities/post/list/post.component.ts:PostComponent" schemaVersion="0.4.0" -->

# Component: Post Entity Module

<!-- c2d:begin section="1-purpose" source="hand-written" -->
## 1. Component Purpose (Business Logic)

The Post entity module manages the full lifecycle of blog posts: listing, viewing, creating, editing, and deleting. A post is a titled, timestamped piece of content that belongs to one blog and may be tagged with zero or more topics.

**Responsibilities**
- Display a paginated, sortable, infinitely-scrolling list of posts with per-row View, Edit, and Delete actions. (`list/post.component.ts`)
- Show a read-only detail view of a single post, including its blog and tag associations. (`detail/post-detail.component.ts`)
- Provide a create/edit form with server-populated dropdowns for blog and tag selection. (`update/post-update.component.ts`)
- Present a confirmation modal before executing a delete, then signal the list to reload on confirmation. (`delete/post-delete-dialog.component.ts`)
- Fetch a post by id before the detail or edit view loads, redirecting to /404 if not found. (`route/post-routing-resolve.service.ts`)
- Serialize and deserialize the `date` field between a structured date value and ISO 8601 string on every API call. (`service/post.service.ts`)
<!-- c2d:end section="1-purpose" -->

<!-- c2d:begin section="2-state-and-data-flow" source="hand-written" -->
## 2. State & Data Flow

- **Props & Events (External):**
  - `PostDetailComponent` declares one signal input `post = input<IPost | null>(null)`, populated by the router's component-input binding from the route resolver's return value — not set by a parent component directly. (`detail/post-detail.component.ts:16`)
  - `PostDeleteDialogComponent.post?: IPost` is set imperatively by `PostComponent` after opening the modal; it is not a declared framework input. (`delete/post-delete-dialog.component.ts:16`, `list/post.component.ts:87`)
  - No event emitters (`@Output`) exist on any component in this module. Inter-unit signaling occurs via `NgbActiveModal.close(ITEM_DELETED_EVENT)` (delete confirmation) and router navigation (form save, back navigation).

- **Local State (Internal):**
  - `PostComponent`: `posts?: IPost[]` (the current loaded set), `isLoading: boolean` (request in flight), `sortState` (writable signal holding sort predicate and order), `links` (writable signal holding parsed HTTP Link header entries), `subscription: Subscription | null` (stores the `ngOnInit` combineLatest subscription). (`list/post.component.ts:38–47`)
  - `PostUpdateComponent`: `isSaving: boolean`, `post: IPost | null` (the entity under edit, null for create), `blogsSharedCollection: IBlog[]`, `tagsSharedCollection: ITag[]`, `editForm: PostFormGroup`. (`update/post-update.component.ts:28–43`)
  - `PostDeleteDialogComponent`: `post?: IPost`. (`delete/post-delete-dialog.component.ts:16`)

- **Derived State:**
  - `hasMorePage = computed(() => !!this.links().next)`: true when the last server response included a `next` pagination cursor. (`list/post.component.ts:46`)
  - `isFirstFetch = computed(() => Object.keys(this.links()).length === 0)`: true before any response has been received. (`list/post.component.ts:47`)

- **Form State (`PostUpdateComponent`):**
  - Controls: `id` (always disabled), `title` (required), `content` (required), `date` (required, datetime-local string), `blog` (optional, single-value), `tags` (optional, multi-value array).
  - The `id` control is created disabled and remains disabled for both create and edit; its value is recovered via `getRawValue()`, not `form.value`. (`update/post-form.service.ts:51–57`, `update/post-form.service.ts:73`)
  - Validation error messages appear only when a field is both invalid AND (dirty OR touched). A pristine form shows no errors even if required fields are empty. (`update/post-update.component.html:21`, `33`, `55`)
  - The default value of `date` for a new post is the current wall-clock time at form construction. (`update/post-form.service.ts:87–88`)
  - The `date` field is stored internally as a formatted string matching `DATE_TIME_FORMAT` inside the form; it is converted to and from a structured date value when reading from or writing to the model. (`update/post-form.service.ts:97–111`)

- **Global State & Subscriptions:**
  - `PostComponent.ngOnInit` subscribes to `combineLatest([activatedRoute.queryParamMap, activatedRoute.data])`. The resulting subscription is stored in `this.subscription`, but `PostComponent` does not implement `ngOnDestroy` and never calls `.unsubscribe()`. (`list/post.component.ts:38`, `61–68`)
  - `PostUpdateComponent.ngOnInit` subscribes to `activatedRoute.data` with no cleanup mechanism. (`update/post-update.component.ts:50–58`)
  - Both `PostService` and `PostFormService` are application-wide singletons. Neither holds mutable state — they are stateless operation facades.

- **Lifecycle:**
  - `PostComponent.ngOnInit`: triggered by any change to `queryParamMap` or route data; always executes the sequence reset → load, clearing the post list before every fetch. (`list/post.component.ts:61–68`)
  - `PostUpdateComponent.ngOnInit`: subscribes to route data, populates the form if a post is present, then unconditionally loads blogs and tags from the server. The two relationship loads run concurrently and neither blocks the form from being submitted. (`update/post-update.component.ts:49–58`, `118–129`)
  - `PostDetailComponent` has no lifecycle hook; the `post` signal input is set by the router before the view renders.
<!-- c2d:end section="2-state-and-data-flow" -->

<!-- c2d:begin section="3-ui-and-rendering" source="hand-written" -->
## 3. UI & Rendering Logic

**List view (`list/post.component.html`)**

- **Structure:** Page heading with "Refresh list" and "Create a new Post" action buttons; an alert for the empty-list state; a sortable, scrollable table when posts are present.
- **Conditional Rendering:**
  - "No Posts found" alert is shown when `posts?.length === 0`. This condition is true both during initial load (before the first response) and when the server returns zero results. (`list/post.component.html:27–31`)
  - The table is shown when `posts && posts.length > 0`. (`list/post.component.html:33`)
  - Each row's blog cell shows a link only when `post.blog` is non-null. (`list/post.component.html:85–89`)
- **Loops:** `@for (post of posts; track trackId)` — identity tracked via `PostService.getPostIdentifier` (returns the numeric `post.id`). (`list/post.component.html:76`)
- **Interactions:**
  - Refresh button: calls `load()`; disabled while `isLoading` is true; icon spins while in-flight. (`list/post.component.html:6–9`)
  - Create button: navigates to `/post/new`. (`list/post.component.html:11–19`)
  - Sort column headers (id, title, content, date, blog.name): clicking fires `navigateToWithComponentValues(event)`, updating URL query params. (`list/post.component.html:37`)
  - Infinite scroll: `(scrolled)="loadNextPage()"` fires when the user reaches the bottom of the table body; disabled when `!hasMorePage()`. (`list/post.component.html:75`)
  - Per-row buttons: View → `/post/:id/view`; Edit → `/post/:id/edit`; Delete → opens confirmation modal.
- **Loading & Error States:** Refresh button is disabled and icon spins while `isLoading` is true. There is no full-page loading indicator. `jhi-alert-error` is present for framework-level error messages; no component-owned error display exists. (`list/post.component.html:23`)
- **Accessibility & i18n:** All visible strings use `jhiTranslate` keys. Table has `aria-describedby="page-heading"`. Action buttons and headings carry `data-cy` test attributes.

**Detail view (`detail/post-detail.component.html`)**

- **Structure:** Centered narrow column; a definition list of all post fields; Back and Edit action buttons.
- **Conditional Rendering:** The entire content block is guarded by `@if (post())`; nothing renders while the signal is null. (`detail/post-detail.component.html:3`)
- **Loops:** Tags rendered by `@for (tag of post()!.tags; track $index)`, comma-separated, omitting the trailing comma on the last item. (`detail/post-detail.component.html:40–45`)
- **Interactions:** Back button calls `previousState()` (browser history back). Edit button navigates to `/post/:id/edit`. Blog name and each tag name are navigation links to their respective detail views.
- **Formatting:** `date` is formatted by the `formatMediumDatetime` pipe before display. (`detail/post-detail.component.html:29`)
- **Loading & Error States:** No loading state is displayed; the resolver ensures `post()` is set before the view activates. `jhi-alert-error` and `jhi-alert` components are present. No error scenario within this component is handled in code.

**Delete dialog (`delete/post-delete-dialog.component.html`)**

- **Structure:** Modal with header ("Confirm delete operation"), body (confirmation question including the post id), and footer (Cancel and Delete buttons).
- **Conditional Rendering:** The entire form is guarded by `@if (post)`; the modal is empty if `post` was not set before activation. (`delete/post-delete-dialog.component.html:1`)
- **Interactions:** Submitting the form (Delete button, `type="submit"`) calls `confirmDelete(post.id!)`. Cancel button calls `cancel()`. (`delete/post-delete-dialog.component.html:2`, `15`)
- **i18n:** Confirmation message includes the post id via `[translateValues]="{ id: post.id }"`. (`delete/post-delete-dialog.component.html:9`)

**Create/Edit form (`update/post-update.component.html`)**

- **Structure:** Centered narrow column; a reactive form with vertically stacked field groups; Cancel and Save buttons at the bottom.
- **Conditional Rendering:** The `id` field row is shown only when `editForm.controls.id.value !== null`, i.e., editing an existing post. (`update/post-update.component.html:11`)
- **Validation display:** Inline error text appears per field only when the field is invalid AND (dirty OR touched). Title and content show a "required" message; date shows both "required" and "datetimelocal format" messages. (`update/post-update.component.html:21–67`)
- **Interactions:**
  - Save button: disabled when `editForm.invalid || isSaving`. (`update/post-update.component.html:99`)
  - Cancel button: calls `previousState()`. (`update/post-update.component.html:91–93`)
  - Blog select: `[compareWith]="compareBlog"` controls which option is selected by object identity. (`update/post-update.component.html:72`)
  - Tags select: `multiple`, `[compareWith]="compareTag"` for multi-selection. (`update/post-update.component.html:82–83`)
<!-- c2d:end section="3-ui-and-rendering" -->

<!-- c2d:begin section="4-public-interface" source="hand-written" -->
## 4. Public Interface (ADT)

**`PostComponent` (list) — `list/post.component.ts`**

| Member | Signature | Contract |
|---|---|---|
| `trackId` | `(index: number, item: IPost) => number` | Returns the numeric id of a post; used for DOM row identity in the loop |
| `ngOnInit` | `(): void` | Subscribes to route state; resets the list and loads the first page on each emission |
| `reset` | `(): void` | Sets `posts` to an empty array |
| `loadNextPage` | `(): void` | Loads the next page; called by the infinite-scroll event |
| `load` | `(): void` | Issues a backend query and applies the response to `posts` and `links` |
| `delete` | `(post: IPost): void` | Opens the delete confirmation modal; reloads the list on confirmation |
| `navigateToWithComponentValues` | `(event: SortState): void` | Updates the URL sort query param when a column header is clicked |
| `byteSize` | `(base64String: string): string` | Returns a human-readable byte size string; delegates to DataUtils |
| `openFile` | `(base64String: string, contentType: string \| null \| undefined): void` | Opens a binary file in a new browser window; delegates to DataUtils |

**`PostDetailComponent` — `detail/post-detail.component.ts`**

| Member | Signature | Contract |
|---|---|---|
| `post` | `input<IPost \| null>(null)` | Signal input: the post to display; null until the router supplies it |
| `previousState` | `(): void` | Navigates back in browser history |
| `byteSize` | `(base64String: string): string` | Delegates to DataUtils |
| `openFile` | `(base64String: string, contentType: string \| null \| undefined): void` | Delegates to DataUtils |

**`PostDeleteDialogComponent` — `delete/post-delete-dialog.component.ts`**

| Member | Signature | Contract |
|---|---|---|
| `post` | `IPost \| undefined` | Set imperatively by the caller after modal open; guards the entire template |
| `cancel` | `(): void` | Dismisses the modal without deleting |
| `confirmDelete` | `(id: number): void` | Calls the delete endpoint and closes the modal with `ITEM_DELETED_EVENT` on success |

**`PostUpdateComponent` — `update/post-update.component.ts`**

| Member | Signature | Contract |
|---|---|---|
| `editForm` | `PostFormGroup` | The reactive form; invalid until title, content, and date all pass validation |
| `save` | `(): void` | Reads the form, calls create or update based on id presence, navigates back on success |
| `previousState` | `(): void` | Navigates back in browser history |
| `setFileData` | `(event: Event, field: string, isImage: boolean): void` | Loads a file input's data into the named form field; broadcasts errors globally on failure |
| `byteSize` | `(base64String: string): string` | Delegates to DataUtils |
| `openFile` | `(base64String: string, contentType: string \| null \| undefined): void` | Delegates to DataUtils |

**`PostService` — `service/post.service.ts`**

| Member | Signature | Contract |
|---|---|---|
| `find` | `(id: number): Observable<EntityResponseType>` | GET one post by id; date deserialized to structured value; emits once |
| `create` | `(post: NewPost): Observable<EntityResponseType>` | POST a new post; date serialized to ISO string; emits once |
| `update` | `(post: IPost): Observable<EntityResponseType>` | PUT full replacement; date serialized; emits once |
| `partialUpdate` | `(post: PartialUpdatePost): Observable<EntityResponseType>` | PATCH partial update; date serialized; emits once |
| `query` | `(req?: any): Observable<EntityArrayResponseType>` | GET paged list with optional query parameters; dates deserialized |
| `delete` | `(id: number): Observable<HttpResponse<{}>>` | DELETE a post by id; emits once |
| `getPostIdentifier` | `(post: Pick<IPost, 'id'>): number` | Returns the numeric id |
| `comparePost` | `(o1, o2): boolean` | True if both are null or both share the same id |
| `addPostToCollectionIfMissing` | `(collection: Type[], ...candidates): Type[]` | Prepends candidates not already in the collection (deduplication by id); null/undefined candidates are ignored |

**Consumed by:** `PostComponent`, `PostUpdateComponent`, `PostDeleteDialogComponent`, `postResolve` (route resolver function).
<!-- c2d:end section="4-public-interface" -->

<!-- c2d:begin section="5-dependencies" source="hand-written" -->
## 5. Dependencies & External Integrations

- **Services/APIs:**
  - `PostService` → `GET/POST/PUT/PATCH/DELETE api/posts` and `api/posts/:id`. URL base resolved from `ApplicationConfigService.getEndpointFor('api/posts')`. (`service/post.service.ts:32`)
  - `BlogService.query()` and `BlogService.addBlogToCollectionIfMissing()` — loads and deduplicates available blogs for the update form's blog dropdown. (`update/post-update.component.ts:119–123`)
  - `TagService.query()` and `TagService.addTagToCollectionIfMissing()` — loads and deduplicates available tags for the update form's tags multi-select. (`update/post-update.component.ts:125–129`)
  - `DataUtils.byteSize`, `DataUtils.openFile`, `DataUtils.loadFileToForm` — binary/blob content utilities used by detail and update components. (`detail/post-detail.component.ts:20–29`, `update/post-update.component.ts:60–75`)
  - `EventManager.broadcast` — publishes file-load errors as `EventWithContent<AlertError>`. (`update/post-update.component.ts:71–74`)
  - `ParseLinks.parseAll` — parses RFC 5988 `Link` response header into a cursor map (`{next, prev, last, ...}`). (`list/post.component.ts:140`)
  - `SortService.parseSortParam` and `SortService.buildSortParam` — converts between URL sort strings and `SortState` objects. (`list/post.component.ts:111`, `154`)

- **Utils/Packages:**
  - `dayjs` — structured date representation in memory; serialized to ISO 8601 for transport. (`service/post.service.ts:5`, `update/post-form.service.ts:4`)
  - `@ng-bootstrap/ng-bootstrap` (`NgbModal`, `NgbActiveModal`) — delete confirmation modal lifecycle. (`list/post.component.ts:5`, `delete/post-delete-dialog.component.ts:3`)
  - `ngx-infinite-scroll` (`InfiniteScrollModule`) — fires `(scrolled)` events on the list table body; disabled when `!hasMorePage()`. (`list/post.component.ts:16`, `list/post.component.html:75`)
  - `UserRouteAccessService` — authentication guard applied to all four routes. (`post.routes.ts:4`, `17`, `22`, `27`, `33`, `38`)
  - Shared display pipes: `FormatMediumDatetimePipe` (date display in list and detail), `DurationPipe`, `FormatMediumDatePipe`. (`list/post.component.ts:9`, `detail/post-detail.component.ts:5`)

*Full dependency detail, including the same-file function call graph, is in `dependencies.json`.*
<!-- c2d:end section="5-dependencies" -->

<!-- c2d:begin section="6-service-layer" source="hand-written" -->
## 6. Service Layer

- **Shared State:** Neither `PostService` nor `PostFormService` holds mutable instance state. `PostService.resourceUrl` is computed once at injection time and never mutated. No component in this module stores data on a service for other components to read.

- **Mutations by this component:**
  - `PostComponent.delete` → `PostService.delete(id)` — removes the record on the server; no local cache is updated; a full re-fetch follows. (`list/post.component.ts:86–95`)
  - `PostUpdateComponent.save` → `PostService.create(post)` or `PostService.update(post)` — creates or replaces the record; navigation back follows on success. (`update/post-update.component.ts:81–88`)

- **Other consumers:** Unknown at component scope. `PostService` is `providedIn: 'root'`; other units in the application may inject and call it. `consumersKnown: false` — a repo-level index is required to enumerate them.

- **Stateless operations:** `PostService.find`, `PostService.query`, `PostService.partialUpdate` are read or patch operations with no retained server-side or client-side state. `PostFormService.createPostFormGroup`, `getPost`, and `resetForm` operate on form objects passed in and return values; no state is stored on the service.

- **Coupling notes:** `PostUpdateComponent.updateForm` calls `PostFormService.resetForm` before `loadRelationshipsOptions` runs. The form is therefore in a known state before option lists arrive from the server. The order matters: if `compareWith` functions (`compareBlog`, `compareTag`) ran against an unstable form value during loading, the selected item might not match. (`update/post-update.component.ts:110–115`)
<!-- c2d:end section="6-service-layer" -->

<!-- c2d:begin section="7-acceptance-criteria" source="hand-written" -->
## 7. Acceptance Criteria (AC)

- **Scenario 1: Resolver — post found by id**
  - **Given** a route has a numeric `:id` parameter
  - **When** the route activates and the server returns a post with that id
  - **Then** the post body is delivered to the routed component before it renders
  - *Covered by:* "should return IPost returned by find" (`route/post-routing-resolve.service.spec.ts:40`)

- **Scenario 2: Resolver — no id present (create route)**
  - **Given** a route has no `:id` parameter
  - **When** the route activates
  - **Then** null is resolved without contacting the server
  - *Covered by:* "should return null if id is not provided" (`route/post-routing-resolve.service.spec.ts:59`)

- **Scenario 3: Resolver — post not found**
  - **Given** a route has a numeric `:id` parameter
  - **When** the server returns a null body for that id
  - **Then** the user is redirected to /404 and the destination component never activates
  - *Covered by:* "should route to 404 page if data not found in server" (`route/post-routing-resolve.service.spec.ts:78`)

- **Scenario 4: List — initial load**
  - **Given** the list route activates
  - **When** the component initializes
  - **Then** posts are fetched from the server sorted by the active sort parameter
  - *Covered by:* "Should call load all on init" (`list/post.component.spec.ts:81`), "should calculate the sort attribute for an id" (`list/post.component.spec.ts:114`)

- **Scenario 5: List — sort change updates URL and reloads**
  - **Given** the list is displayed
  - **When** a sort column header is clicked with a non-id column
  - **Then** the URL query params are updated with the new sort predicate, triggering a reload
  - *Covered by:* "should calculate the sort attribute for a non-id attribute" (`list/post.component.spec.ts:100`)

- **Scenario 6: List — infinite scroll appends pages**
  - **Given** the server returned a `next` pagination cursor
  - **When** the user scrolls to the bottom of the list
  - **Then** the next page is fetched using the server-provided cursor and its items are appended to the existing list
  - *Covered by:* "should infinite scroll" (`list/post.component.spec.ts:123`)

- **Scenario 7: List — trackId delegates to PostService**
  - **Given** the list is rendered
  - **When** `trackId` is called for a row item
  - **Then** the call is forwarded to `PostService.getPostIdentifier` and the post's numeric id is returned
  - *Covered by:* "Should forward to postService" (`list/post.component.spec.ts:91`)

- **Scenario 8: Delete — confirmed**
  - **Given** the delete modal is open for a post
  - **When** the user clicks Delete and the server responds successfully
  - **Then** the modal closes with the `ITEM_DELETED_EVENT` signal and the list reloads
  - *Covered by:* "Should call delete service on confirmDelete" (`delete/post-delete-dialog.component.spec.ts:33`), "on confirm should call load" (`list/post.component.spec.ts:147`)

- **Scenario 9: Delete — cancelled**
  - **Given** the delete modal is open
  - **When** the user clicks Cancel
  - **Then** the modal is dismissed, the delete service is not called, and the list does not reload
  - *Covered by:* "Should not call delete service on clear" (`delete/post-delete-dialog.component.spec.ts:49`), "on dismiss should call load" (`list/post.component.spec.ts:164`)

- **Scenario 10: Detail — post loaded from resolver**
  - **Given** the detail route activates with a resolved post
  - **When** the component initializes
  - **Then** the `post` signal contains the resolved post
  - *Covered by:* "Should load post on init" (`detail/post-detail.component.spec.ts:43`)

- **Scenario 11: Detail — back navigation**
  - **Given** the detail view is displayed
  - **When** the Back button is clicked
  - **Then** the browser navigates to the previous history entry
  - *Covered by:* "Should navigate to previous state" (`detail/post-detail.component.spec.ts:53`)

- **Scenario 12: Detail — byte size and file open delegate to DataUtils**
  - **Given** a base64-encoded content string
  - **When** `byteSize` or `openFile` is called
  - **Then** the call is forwarded to `DataUtils` unchanged
  - *Covered by:* "Should call byteSize from DataUtils" (`detail/post-detail.component.spec.ts:61`), "Should call openFile from DataUtils" (`detail/post-detail.component.spec.ts:74`)

- **Scenario 13: Update — form populated for existing post**
  - **Given** the edit route activates with a resolved post
  - **When** the component initializes
  - **Then** the form contains the post's values; the blog dropdown list includes the post's current blog; the tags select list includes the post's current tags
  - *Covered by:* "Should call Blog query and add missing value" (`update/post-update.component.spec.ts:54`), "Should call Tag query and add missing value" (`update/post-update.component.spec.ts:76`), "Should update editForm" (`update/post-update.component.spec.ts:95`)

- **Scenario 14: Update — save existing post calls update**
  - **Given** the form has a non-null id (existing post)
  - **When** the user submits the form and the server responds successfully
  - **Then** `PostService.update` is called; `isSaving` returns to false; the user is navigated back
  - *Covered by:* "Should call update service on save for existing entity" (`update/post-update.component.spec.ts:112`)

- **Scenario 15: Update — save new post calls create**
  - **Given** the form has a null id (new post)
  - **When** the user submits the form and the server responds successfully
  - **Then** `PostService.create` is called; `isSaving` returns to false; the user is navigated back
  - *Covered by:* "Should call create service on save for new entity" (`update/post-update.component.spec.ts:135`)

- **Scenario 16: Update — server error leaves user on form**
  - **Given** the form is submitted
  - **When** the server returns an error
  - **Then** `isSaving` returns to false and the user is NOT navigated away
  - *Covered by:* "Should set isSaving to false on error" (`update/post-update.component.spec.ts:158`)

- **Scenario 17: Update — id control always disabled**
  - **Given** any form state (new or existing post)
  - **When** the form is created or reset
  - **Then** the id control is in the disabled state
  - *Covered by:* "passing IPost should not enable id FormControl" and "passing NewPost should disable id FormControl" (`update/post-form.service.spec.ts:75–92`)

- **Scenario 18: Update — relationship comparators delegate to sibling services**
  - **Given** blog or tag options are displayed
  - **When** the selection is compared to the current form value
  - **Then** `compareBlog` forwards to `BlogService.compareBlog`; `compareTag` forwards to `TagService.compareTag`
  - *Covered by:* "Should forward to blogService" and "Should forward to tagService" (`update/post-update.component.spec.ts:181–197`)

- **Scenario 19: Service — all CRUD operations use correct HTTP verbs**
  - **Given** a valid post or id
  - **When** `find`, `create`, `update`, `partialUpdate`, `query`, or `delete` is called
  - **Then** the corresponding HTTP verb is issued to the correct URL; date fields are serialized/deserialized on the way through
  - *Covered by:* "should find an element" through "should delete a Post" (`service/post.service.spec.ts:29–97`)

- **Scenario 20: Service — addPostToCollectionIfMissing deduplicates by id**
  - **Given** a collection of posts and a set of candidate posts (possibly including nulls or duplicates)
  - **When** `addPostToCollectionIfMissing` is called
  - **Then** only posts not already present by id are prepended; null and undefined candidates are silently ignored
  - *Covered by:* "should add a Post to an empty array" through "should return initial array if no Post is added" (`service/post.service.spec.ts:100–155`)

- **Scenario 21: Service — comparePost equality semantics**
  - **Given** two post references (or nulls)
  - **When** `comparePost` is called
  - **Then** returns true if both are null or both share the same numeric id; false otherwise
  - *Covered by:* "Should return true if both entities are null" through "Should return false if primaryKey matches" (`service/post.service.spec.ts:158–199`)
<!-- c2d:end section="7-acceptance-criteria" -->

<!-- c2d:begin section="8-domain-business-rules" source="hand-written" -->
## 8. Domain Business Rules (For SME Review)

- **Business Constraints:**
  - A post must have a title, content, and date — all three are required. (`update/post-form.service.ts:58–66`)
  - A post belongs to at most one blog (single optional relationship). (`post.model.ts:10`)
  - A post may be associated with zero or more tags (many-to-many optional relationship). (`post.model.ts:11`)
  - All post routes require the user to be authenticated. (`post.routes.ts:17,22,27,33,38`)

- **Edge Cases & Error Handling:**
  - If a post cannot be found by id during route resolution, the user is redirected to /404 and the intended view never loads. (`route/post-routing-resolve.service.ts:18–22`)
  - If the save request fails, `isSaving` resets to false and the user remains on the form with no server-level error shown in the form itself (framework-level alert components may display it). (`update/post-update.component.ts:102–103`)
  - If a file-load fails during `setFileData`, an error is broadcast via `EventManager`; no inline form feedback is rendered. (`update/post-update.component.ts:69–74`)
  - The Save button is disabled while a save is in progress or the form is invalid, preventing duplicate submission. (`update/post-update.component.html:99`)

- **Domain Terminology/Formulas:**
  - **Post**: a titled, timestamped content entry belonging to a blog.
  - **Blog**: the parent container for posts; each post has at most one blog.
  - **Tag**: a classification label; posts can carry multiple tags simultaneously.
  - **ITEM_DELETED_EVENT**: the string constant `'deleted'`; used as the modal close signal to distinguish a confirmed deletion from a cancel. (`delete/post-delete-dialog.component.ts:6,27`)
<!-- c2d:end section="8-domain-business-rules" -->

---

<!-- c2d:begin section="review-gate" source="hand-written" -->
## Review Gate

**Status:** pending

Stage 2 (implementation) must not begin until status is `approved` and no blocking question remains open.

**Open Questions**
- [ ] **(blocking)** What is the intended format of the `content` field? The model defines it as `string | null` and the list and detail templates render it as plain text. However, `DataUtils.byteSize` and `DataUtils.openFile` are injected in both the detail and update components, and spec test sample data references `'../fake-data/blob/hipster.txt'`. Clarify whether `content` can carry binary/base64-encoded data or is always plain text. (`post.model.ts:8`, `detail/post-detail.component.ts:20–29`, `post.test-samples.ts:8`)
- [ ] What happens when the Refresh button is clicked after the user has scrolled partway through an infinite-scroll session? `load()` does not call `reset()`, so if `links().prev` is non-null, `fillComponentAttributesFromResponseBody` will append rather than replace. Is this the intended behavior? (`list/post.component.ts:98–104`, `120–133`)
- [ ] `loadRelationshipsOptions` issues two concurrent HTTP calls (blogs and tags) and the form is saveable before either completes. Is there a requirement that the option lists be loaded before the user can submit?
- [ ] Who else in the application reads or writes via `PostService`? It is `providedIn: 'root'`; this document records only what this module does. (`service/post.service.ts:27`)

**Suspected Defects in Existing Code**
- `service/post.service.spec.ts:189`: Test titled "Should return false if primaryKey matches" but asserts `expect(compareResult1).toEqual(true)`. The test logic is correct; the title is wrong. Confidence: high.
- `list/post.component.spec.ts:164`: Test titled "on dismiss should call load" but asserts `expect(comp.load).not.toHaveBeenCalled()`. The test correctly verifies that dismissing the modal without a confirmed deletion does NOT reload the list. The title is misleading. Confidence: high.
- `list/post.component.ts:38,61–68`: `PostComponent` stores its `combineLatest` subscription in `this.subscription` but never implements `ngOnDestroy` to unsubscribe. If the component is destroyed, the subscription continues to fire. Confidence: high — no `ngOnDestroy` method exists anywhere in the class.
- `update/post-update.component.ts:50–58`: `PostUpdateComponent.ngOnInit` subscribes to `activatedRoute.data` without cleanup. Confidence: medium — `ActivatedRoute` data typically completes when the router destroys the component, but behavior under edge-case navigation is not verified by any spec.

**Confidence:** medium-high — 21 spec scenarios covered / 21 total; all 14 public methods and arrow-function properties in `PostComponent` accounted for; all template nodes covered. The `DataUtils` internals are not visible from this module, leaving the content-field question unresolved.

*Migration hazards for this component are recorded separately in `migration_notes.md`.*
<!-- c2d:end section="review-gate" -->
