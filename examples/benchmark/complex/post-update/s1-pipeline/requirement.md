<!-- code2docs:unit id="component:entities/post/update:PostUpdateComponent" schemaVersion="0.4.0" -->
# Unit: PostUpdateComponent

## 1. Purpose

<!-- c2d:begin section="1-purpose" hash="4ed6593f" -->
PostUpdateComponent serves users who need to create a new blog post or edit an existing one, presenting a validated form that collects the post's title, content, publication date, assigned blog, and tags, then persists the record to the server and returns the user to the previous screen.

**Responsibilities**
- Presents a form pre-populated with an existing post's data when editing, or blank when creating, using the post record supplied by the current route.
- Fetches available blogs and tags from the server on initialization so the form's dropdown and multi-select are populated, merging in the post's current associations so pre-selected values are always visible.
- Persists the form data to the server as a create or update operation, blocks re-submission while the request is pending, and navigates away on success.
<!-- c2d:end section="1-purpose" -->

## 2. State & Data Flow

<!-- c2d:begin section="2-state" hash="51003af1" -->
### Props & Events (External)
None declared.

### External State
- **Route data** (owner: ActivatedRoute (routing layer)) — The current route's data object supplies the post record when the user is editing an existing post, or an empty value when creating a new one. This data is provided by a route resolver or route configuration outside this unit and is consumed once at initialization.

### Local State (Internal)
- **field:isSaving** — Tracks whether a save operation is currently in progress. Starts false; set to true when submission begins and cleared back to false when the server request completes (whether it succeeds or fails). While true, the Save button is inaccessible.
- **field:post** — Holds the post record currently being worked on. Null when creating a new post; populated from the route data when editing an existing one. Read during relationship-loading so the post's current blog and tags can be merged into the option lists.
- **field:blogsSharedCollection** — The list of blog records available for selection in the Blog dropdown. Initially empty; populated on initialization by merging the full list of blogs from the server with any blog already assigned to the current post.
- **field:tagsSharedCollection** — The list of tag records available for selection in the Tags multi-select. Initially empty; populated on initialization by merging the full list of tags from the server with any tags already assigned to the current post.
- **field:compareBlog** — A comparison function supplied to the Blog dropdown to determine which option matches the form's currently-selected blog value. Delegates to the blog service's comparison logic so identity is determined by the service's definition of equality rather than object reference.
- **field:compareTag** — A comparison function supplied to the Tags multi-select to determine which options match the form's currently-selected tag values. Delegates to the tag service's comparison logic.

### Form State
Manages the post's editable fields as a single reactive form group. Created by PostFormService at startup and reset with the existing post's values (or empty values for a new post) during initialization. The form's validity gates the Save button.

| Control | Statement |
|---|---|
| `control:editForm.id` | The post's system-assigned identifier. Displayed as a read-only field only when editing an existing post (when the value is non-null); hidden for new post creation. |
| `control:editForm.title` | The post's title. Required. An inline error message appears when the field is invalid and the user has interacted with it (field is dirty or touched). |
| `control:editForm.content` | The post's body content. Required. An inline error message appears when the field is invalid and has been interacted with. |
| `control:editForm.date` | The post's publication date and time. Required and must conform to a datetime-local format (YYYY-MM-DD HH:mm). Two separate inline messages are shown depending on which validation rule is violated: required or invalid format. |
| `control:editForm.blog` | The blog the post belongs to, selected from a dropdown of available blogs. A null (no blog) option is available. The dropdown uses a custom comparator to match the pre-selected value by identity. |
| `control:editForm.tags` | The tags applied to the post, selected from a multi-select list of available tags. Zero or more tags may be selected. Uses a custom comparator to match pre-selected tags by identity. |

### Async / Subscriptions
- **activatedRoute.data**. Trigger: First display of the screen.
- **blogService.query()**. Trigger: First display of the screen (called unconditionally from ngOnInit).
- **tagService.query()**. Trigger: First display of the screen (called unconditionally from ngOnInit).
- **postService.create() or postService.update()**. Trigger: User submits the form. Loading indicator: `isSaving is set to true while the request is pending; the Save button is disabled and the form cannot be submitted again.`. Error handling: isSaving is cleared to false when the request completes. No additional error presentation is performed by this unit; the child alert-error component (tpl:15) may display server-returned error details..

> The propsAndEvents list is empty: this unit accepts no parent-supplied inputs and emits no output events. All input data arrives through the routing layer (the current post record) or is fetched directly from the server (option lists).
<!-- c2d:end section="2-state" -->

## 3. Public Contract

<!-- c2d:begin section="3-public-contract" hash="15a35e6e" -->
### Public Methods
- `save(): void` — Called when the form is submitted. Marks a save operation as in progress, extracts the current form values as a post record, sends either an update request (if the post already has an id) or a create request (if it is new), and wires the response to navigate away on success or clear the in-progress state on completion. Must not be called while isSaving is true.
  - Pre: The form is valid; isSaving is false
  - Post: isSaving is set to true during the request; On success: the user is navigated to the previous page; On any outcome: isSaving is restored to false
- `previousState(): void` — Navigates the browser back to the previous page. Called by the Cancel button and automatically after a successful save.
  - Post: The browser navigates to the previous history entry

### Extension Points
- onSaveError() is a protected method with an intentionally empty body, designed as an extension point for subclasses that need to add error-specific behavior when a save request fails. Overriding it adds behavior on failure without replacing the shared finalize logic.

> This unit exposes no @Input or @Output bindings. It is used as a routed screen, not as a reusable child component. The five members listed in the class's public API surface are callable from the template; three of them (byteSize, openFile, setFileData) are not referenced by any template binding and are dead code. *(high confidence)*
<!-- c2d:end section="3-public-contract" -->

## 4. Workflows

<!-- c2d:begin section="4-workflows" hash="1bda2d4d" -->
### Save post
**Trigger:** User submits the form by clicking the Save button

**Preconditions:** All required form fields (title, content, date) are filled and the date is in a valid datetime-local format; No save operation is currently in progress (isSaving is false)

**Steps:**
2. The Save button becomes inaccessible and the saving-in-progress state is activated
3. The post record is extracted from the form values
4. If the post has an existing id, an update request is sent to the server; if the post is new (no id), a creation request is sent
5. On a successful server response, the user is navigated to the previous page
6. Regardless of whether the request succeeded or failed, the saving-in-progress state is cleared and the Save button becomes accessible again

**Success:** The post is persisted and the user is returned to the previous page.

**Failure outcomes:**
- The server returns an error response: The form remains visible and the Save button becomes accessible again. No error message is shown directly by this unit; the child alert-error component may surface server-returned error details. The onSaveError method has an empty body and performs no additional action.

### Cancel and return to previous page
**Trigger:** User clicks the Cancel button

**Steps:**
2. The browser navigates back to the previous page, discarding any unsaved form changes

**Success:** The user returns to the previous page without the post being saved.
<!-- c2d:end section="4-workflows" -->

## 5. Lifecycle Behavior

<!-- c2d:begin section="5-lifecycle" hash="e845ba52" -->
**On initialization:**
On first display, this unit subscribes to the current route's data. If the route data contains an existing post record (edit mode), the form fields are populated with that post's current values and the post's associated blog and tags are stored locally; otherwise the form starts empty (create mode). Regardless of mode, the full list of available blogs and the full list of available tags are then each fetched from the server; the post's currently-assigned associations are merged into those lists so they appear as selectable options even if they would otherwise fall outside the server's default query results.

**Ordering constraints:**
- The form is populated with the existing post's values (and the post's associations are stored locally) before the relationship option lists are fetched. This ordering ensures the current blog and tag values are available to merge into the server-returned lists when loadRelationshipsOptions runs.

> This unit implements no cleanup hook. HTTP-based subscriptions (blogService.query, tagService.query, postService.create/update) complete automatically after one server response and do not persist. The subscription to activatedRoute.data is a long-lived observable with no explicit teardown; see migration risks. *(high confidence)*
<!-- c2d:end section="5-lifecycle" -->

## 6. External Integrations

<!-- c2d:begin section="6-integrations" hash="caa1a70a" -->
### Services Used
- **dep:postService** — Persists the post record to the server: sends an update request when the post already exists or a create request when it is new. Operations: update, create.
- **dep:postFormService** — Manages the form's structure and data mapping: constructs the form group on initialization, converts the form's current values to a post record for saving, and resets the form to match an existing post's values when editing. Operations: createPostFormGroup, getPost, resetForm.
- **dep:blogService** — Provides blog data for the Blog dropdown: fetches all available blogs, merges in the post's currently-assigned blog so it is always present in the list, and determines whether two blog records represent the same entity for option matching. Operations: query, addBlogToCollectionIfMissing, compareBlog.
- **dep:tagService** — Provides tag data for the Tags multi-select: fetches all available tags, merges in the post's currently-assigned tags, and determines whether two tag records represent the same entity for multi-select matching. Operations: query, addTagToCollectionIfMissing, compareTag.
- **dep:activatedRoute** — Supplies the current route's data object, which contains the post record when the user is editing an existing post and is absent (or empty) when creating a new one. Operations: data (observable property).
- **dep:dataUtils** — Utility service for file data operations: computing the human-readable byte size of a base64-encoded string, triggering the browser to open or download a file, and loading a selected file into a form field. Currently only used by dead-code methods. Operations: byteSize, openFile, loadFileToForm.
- **dep:eventManager** — Broadcasts application-level error notifications; used by setFileData to signal a file-load failure. Currently only used by dead-code methods. Operations: broadcast.

> HTTP interactions are entirely indirect: this unit calls PostService, BlogService, and TagService, which make the actual HTTP requests. The dependencies.json httpInteractions list is empty because only direct HttpClient calls are detected at this tier. The presence of HTTP behavior is confirmed by the call graph (postService.update, postService.create, blogService.query, tagService.query). *(high confidence)*
<!-- c2d:end section="6-integrations" -->

## 7. Service Layer

<!-- c2d:begin section="7-service-layer" hash="a89cdcfb" -->
### Shared State
- **dep:eventManager** — `Application-level event bus; broadcast() pushes error events to subscribers across the application.` (lifetime: unknown)
  - mutated by this unit; other consumers unknown

### Stateless Operations
- **dep:postService** — HTTP create and update requests for the post entity; each call is a discrete request with no retained state.
- **dep:blogService** — HTTP query for available blogs and pure comparator/merge operations; no service-side mutable state.
- **dep:tagService** — HTTP query for available tags and pure comparator/merge operations; no service-side mutable state.
- **dep:postFormService** — Form group construction, form-to-model conversion (getPost), and form reset (resetForm); all operate on the form instance owned by this unit.

### Coupling Notes
- Whether PostService, BlogService, and TagService are application-scope singletons (one instance shared across all components) or narrower-scoped instances is not visible at this tier. If any holds cached state between requests (e.g., a cached blog list), mutations made by this unit could affect other screens. This requires the repository-wide index to resolve.

> No service injected by this unit is confirmed to hold persistent mutable state accessible app-wide, because the scope (providedIn value) of each service cannot be determined from this tier alone. EventManager.broadcast() pushes to an application-level event bus whose consumers and lifetime are unknown. All other service calls are per-request HTTP dispatches or pure utility operations. Other consumers of these services cannot be identified without the repository-wide index. *(medium confidence)*
<!-- c2d:end section="7-service-layer" -->

## 8. Behavioral Invariants

<!-- c2d:begin section="8-invariants" hash="30a162d5" -->
- **inv:1** The Save button is inaccessible whenever the form contains an invalid value or a save operation is currently in progress. *Why it matters:* Prevents duplicate submissions and ensures only valid data is sent to the server.
- **inv:2** The ID field is visible only when the form's id control holds a non-null value — that is, only when the user is editing a post that already exists in the system. *Why it matters:* Distinguishes create mode from edit mode visually and prevents confusion about whether a new record has been assigned an id.
- **inv:3** Inline validation error messages for a form field appear only after the user has interacted with that field (the field has been dirtied or touched). Errors are not shown immediately on page load. *Why it matters:* Avoids surfacing errors before the user has had a chance to fill in the form, which would be disorienting when the screen first opens.
- **inv:4** After every save attempt — whether the server request succeeds or fails — the saving-in-progress flag is cleared and the Save button becomes accessible again. *Why it matters:* Ensures the form does not become permanently blocked if a transient server error occurs.
<!-- c2d:end section="8-invariants" -->

## 9. Acceptance Criteria

<!-- c2d:begin section="9-acceptance" hash="c8654a51" -->
### ac:1: Blog options include the post's currently-assigned blog even if it is absent from the default query results
**Given:** The user is editing an existing post that has an assigned blog
**When:** The screen initializes
**Then:**
- The blog service is queried for all blogs
- The post's current blog is merged into the result if it was not returned by the query
- The blog dropdown shows the current blog as a selectable option
**Covered by:** test:1

### ac:2: Tag options include the post's currently-assigned tags even if they are absent from the default query results
**Given:** The user is editing an existing post that has assigned tags
**When:** The screen initializes
**Then:**
- The tag service is queried for all tags
- The post's current tags are merged into the result if any were absent
- The tags multi-select shows the current tags as selectable options
**Covered by:** test:2

### ac:3: Form is pre-populated when editing an existing post
**Given:** The route data contains an existing post record
**When:** The screen initializes
**Then:**
- The form fields are populated with the post's current title, content, date, blog, and tags
**Covered by:** test:3

### ac:4: Saving an existing post sends an update request
**Given:** The form is populated with an existing post (has an id); The form is valid
**When:** The user submits the form
**Then:**
- The post service's update operation is called with the current form values
- On success, the user is navigated to the previous page
**Covered by:** test:4

### ac:5: Saving a new post sends a create request
**Given:** The form is empty (no id — creating a new post); The form is valid
**When:** The user submits the form
**Then:**
- The post service's create operation is called with the current form values
- On success, the user is navigated to the previous page
**Covered by:** test:5

### ac:6: Save in-progress flag is cleared after a server error
**Given:** A save request is in progress
**When:** The server returns an error response
**Then:**
- isSaving is set to false
- The Save button becomes accessible again
- The form remains visible
**Covered by:** test:6

### ac:7: Blog comparison delegates to the blog service
**Given:** The blog dropdown is rendered
**When:** The dropdown needs to determine whether an option matches the selected value
**Then:**
- The comparison is performed by the blog service's compareBlog function
**Covered by:** test:7

### ac:8: Tag comparison delegates to the tag service
**Given:** The tags multi-select is rendered
**When:** The multi-select needs to determine whether an option matches a selected value
**Then:**
- The comparison is performed by the tag service's compareTag function
**Covered by:** test:8

### ac:9: Save button is inaccessible while form is invalid
**Given:** One or more required fields are empty or the date is in an invalid format
**When:** The user views the form
**Then:**
- The Save button is disabled and cannot be clicked

### ac:10: Save button is inaccessible while a save is in progress
**Given:** A save request has been submitted and has not yet completed
**When:** The user views the form
**Then:**
- The Save button is disabled and cannot be submitted again

### ac:11: ID field is hidden when creating a new post
**Given:** The form has no id value (creation mode)
**When:** The form is rendered
**Then:**
- The ID field is not shown

### ac:12: Cancel button returns to the previous page
**Given:** The user is on the create or edit post screen
**When:** The user clicks Cancel
**Then:**
- The browser navigates back to the previous page without saving any changes
<!-- c2d:end section="9-acceptance" -->

## 10. Domain Rules

<!-- c2d:begin section="10-domain" hash="414df850" -->
### Business Constraints
- The Title field is required; the form cannot be submitted without a value. *(high confidence)*
- The Content field is required; the form cannot be submitted without a value. *(high confidence)*
- The Date field is required and must contain a value in datetime-local format (placeholder indicates YYYY-MM-DD HH:mm). Two distinct error messages are shown: one for absence, one for an invalid format. *(high confidence)*
- A post may be assigned to at most one blog, or to none. The blog dropdown includes an explicit null option. *(high confidence)*
- A post may have zero or more tags; the tag field is a multi-select that allows simultaneous selection of multiple values. *(high confidence)*
- The post's system-assigned ID is read-only and cannot be modified by the user when editing; it is not shown when creating a new post. *(high confidence)*

### Edge Cases
- **User opens the screen to create a new post (no existing record in route data)** — The form fields start empty. The ID field is hidden. Blog and tag option lists are still fetched from the server.
- **Blog or tag option list fetch fails (server error on blogService.query or tagService.query)** — No error handling is present for these requests. The behavior is unknown — the dropdown may remain empty or an unhandled observable error may propagate. This is an open question.
- **The date field shows a format-error message (rather than a required-error message)** — A [hidden] property binding is used for the format error message (tpl:106), not an @if block. This means the element is kept in the document and only hidden visually, preserving any associated state. This differs from the required-error messages which use @if and destroy their content when the condition is false.
- **Save request succeeds on the first attempt** — The user is navigated to the previous page immediately. The form data is not cleared first.

### Terminology
- **Post** — A blog entry that consists of a title, body content, a publication date, an optional parent blog, and zero or more tags. The screen heading reads 'Create or edit a Post'.
- **Blog** — The parent entity a post belongs to; a post may belong to at most one blog. Shown as a label and dropdown field on the form.
- **Tag** — A classification label applied to a post. Multiple tags may be applied simultaneously; shown as a multi-select field on the form.
- **Date** — The post's publication date and time, entered in YYYY-MM-DD HH:mm format as indicated by the field's placeholder text.
<!-- c2d:end section="10-domain" -->

## 11. Review

<!-- c2d:begin section="11-review" hash="51641a32" -->
**Status:** pending

### Open Questions
- **q:1** *(blocking)* What is the complete set of validators that PostFormService installs on each form control — including any minLength, maxLength, pattern, async validators, updateOn timing, and the exact behavioral rule of the datetimelocal custom validator? Without this information, a rebuild cannot know what data the form accepts or rejects, or when validation fires.
- **q:2** Does PostFormService.resetForm() also mark all controls as pristine and untouched when populating an existing post's values? If it does, validation error messages will not appear immediately when editing a post with pre-existing values. If it does not, errors may appear for any field whose existing value is invalid.
- **q:3** What happens when blogService.query() or tagService.query() returns a server error? The unit has no observable error handler for these calls. Does the behavior silently result in empty option lists, surface an error via the alert-error child component, or produce an unhandled error?
- **q:4** Is the activatedRoute.data subscription in ngOnInit cleaned up when the user navigates away? The component has no ngOnDestroy hook. If Angular's router does not destroy the component on navigation (or if the component is reused), this subscription may persist and react to future route data, causing unintended state mutations.
<!-- c2d:end section="11-review" -->
