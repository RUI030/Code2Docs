<!-- code2docs:unit id="component:app/entities/post/update:PostUpdateComponent" schemaVersion="0.4.0" -->
# Unit: PostUpdateComponent

## 1. Purpose

<!-- c2d:begin section="1-purpose" hash="c2c17af6" -->
Allows a user to create a new post or edit an existing one by presenting a form pre-populated from route-resolved data and saving the result to the server.
<!-- c2d:end section="1-purpose" -->

## 2. State & Data Flow

<!-- c2d:begin section="2-state" hash="2fb3822f" -->
### Props & Events (External)
None declared.

### Local State (Internal)
- **field:isSaving** — Tracks whether a save request is currently in progress. Starts as false; becomes true when the user submits the form and returns to false once the request settles, regardless of outcome.
- **field:post** — Holds the post entity delivered by the route resolver before the screen loaded. Null for a new post, populated for an edit. Used to pre-populate the form and to ensure the post's currently assigned blog and tags appear in the dropdown lists.
- **field:blogsSharedCollection** — The list of available blogs shown in the Blog dropdown. Populated from the server on first display; the post's currently assigned blog is merged in so it always appears as a selectable option even if absent from the server's default result set.
- **field:tagsSharedCollection** — The list of available tags shown in the Tags multi-select. Populated from the server on first display; the post's currently assigned tags are merged in so they always appear as selectable options.
- **field:compareBlog** — A comparison function supplied to the Blog dropdown to determine when a listed option matches the currently selected blog, delegating the equality check to the blog service.
- **field:compareTag** — A comparison function supplied to the Tags multi-select to determine when a listed option matches a currently selected tag, delegating the equality check to the tag service.

### Form State
The edit form collects all post fields required to create or update a post. It contains: an ID field (read-only, visible only when editing an existing post); a Title field (required, with an inline required-error message shown after the user has interacted with the field); a Content field (required textarea, with the same inline required-error behavior); a Date field in YYYY-MM-DD HH:mm format (required, with both a required-error message and a datetime-format-error message); a Blog single-select dropdown whose options come from the available blogs collection; and a Tags multi-select whose options come from the available tags collection. The form group structure and its validators are defined and managed by PostFormService.

> This unit has no declared inputs or outputs. Its initial post data arrives exclusively through route resolver state, and save results are handled by navigating away rather than by emitting an event to a parent. *(high confidence)*
<!-- c2d:end section="2-state" -->

## 3. Public Contract

<!-- c2d:begin section="3-public-contract" hash="4ad63015" -->
### Public Methods
- `previousState(): void` — Navigates the user back to the previous browser history entry. Called by both the Cancel button and automatically after a successful save.
- `save(): void` — Triggered when the user submits the form. Marks the in-progress state, extracts the post data from the form, and dispatches either an update or a create request depending on whether the post has an existing id. On success, navigates back to the previous screen; on error, clears the in-progress state and leaves the user on the edit screen.
  - Pre: The form must be valid (enforced by the Save button disabled state).; No save must currently be in progress (also enforced by the Save button disabled state).
  - Post: isSaving is set to true for the duration of the request.; On success, the user is navigated to the previous screen.; On completion (success or failure), isSaving is reset to false.

### Extension Points
- The onSaveError method is intentionally empty and serves as an extension point for subclasses to provide custom behavior when a save request fails. By default no user-visible action is taken on failure beyond clearing the saving indicator.

> Three public methods — byteSize, openFile, and setFileData — appear in the source but are not reachable from the template or from any template-triggered method. They are not part of the effective public contract of this unit in its current state. *(high confidence)*
<!-- c2d:end section="3-public-contract" -->

## 4. Workflows

<!-- c2d:begin section="4-workflows" hash="dec83089" -->
### Save post
**Trigger:** User activates the Save button, which submits the form.

**Preconditions:** All required form fields (Title, Content, Date) are filled and valid.; No save is currently in progress.

**Steps:**
2. The in-progress indicator is activated, disabling the Save button to prevent duplicate submissions.
3. The post data is extracted from the form. If the post has an existing id, an update request is dispatched to the server; otherwise, a create request is dispatched.
4. When the request settles (success or failure), the in-progress indicator is deactivated and the Save button becomes accessible again.
5. On a successful server response, the user is navigated back to the previous screen.

**Success:** The post is persisted on the server and the user is returned to the previous screen.

**Failure outcomes:**
- The server returns an error response.: The in-progress indicator is deactivated and the Save button becomes accessible again. The user remains on the edit screen. No additional user-visible error feedback is produced by this unit directly; whether the alert component displays a message depends on mechanisms outside this unit (see open question q:2).

### Cancel editing
**Trigger:** User activates the Cancel button.

**Steps:**
2. The user is navigated back to the previous browser history entry, discarding any unsaved changes.

**Success:** The user is returned to the previous screen without any changes being saved.
<!-- c2d:end section="4-workflows" -->

## 5. Lifecycle Behavior

<!-- c2d:begin section="5-lifecycle" hash="5384d379" -->
**On initialization:**
On first display, the unit reads the post record delivered by the route resolver. If a post record is present, the form is pre-populated with that post's field values and the post's currently assigned blog and tags are merged into the available option lists. Regardless of whether a post is present, available blogs and tags are fetched from the server and the option lists are populated.

**Ordering constraints:**
- Form population (if editing an existing post) and the option-list fetch run in sequence within the initialization: form population occurs first and merges the current assignments into the option arrays before the server fetch begins. The server fetch then further extends those arrays with any additional options the query returns.

> There is no teardown step when this unit is removed from the screen. The subscriptions created during initialization — reading route data and fetching blog and tag options — are not explicitly cancelled. See risk:1 in migration notes. *(high confidence)*
<!-- c2d:end section="5-lifecycle" -->

## 6. External Integrations

<!-- c2d:begin section="6-integrations" hash="9e031aff" -->
### Services Used
- **dep:postService** — Persists post data to the server. Called to create a new post or to update an existing one when the form is submitted. Operations: create, update.
- **dep:postFormService** — Constructs and manages the reactive form group for post editing. Creates the initial form structure on screen initialization, populates the form from a post entity when editing, and extracts the post entity from the form when saving. Operations: createPostFormGroup, resetForm, getPost.
- **dep:blogService** — Retrieves the full list of available blogs for the Blog dropdown and determines equality between blog entities for dropdown selection matching. Operations: query, addBlogToCollectionIfMissing, compareBlog.
- **dep:tagService** — Retrieves the full list of available tags for the Tags multi-select and determines equality between tag entities for selection matching. Operations: query, addTagToCollectionIfMissing, compareTag.
- **dep:activatedRoute** — Provides the current route's resolved data, from which the post entity (for an edit scenario) is read on first display.
- **dep:dataUtils** — Provides byte-size formatting and file-loading utilities. Used only by the three unreachable file-handling methods; not reached by any current user action. Operations: byteSize, openFile, loadFileToForm.
- **dep:eventManager** — Broadcasts application-wide events. Used only by the unreachable setFileData method to report file-load errors; not reached by any current user action. Operations: broadcast.

> HTTP interactions are not directly visible from this unit: all network calls are made through injected services. The actual API endpoints for post create/update, blog list query, and tag list query are defined in PostService, BlogService, and TagService respectively. The httpInteractions list is empty because cross-service resolution requires the full repository index. *(high confidence)*
<!-- c2d:end section="6-integrations" -->

## 7. Service Layer

<!-- c2d:begin section="7-service-layer" hash="2a8dcd2f" -->
### Stateless Operations
- **dep:postService** — HTTP create and update calls for post entities. Results are handled locally in this unit's save workflow; no service-held state is read or written.
- **dep:blogService** — HTTP query for all blogs, in-memory collection merging, and entity equality comparison. Results are stored in blogsSharedCollection on this unit; no persisted service state is accessed.
- **dep:tagService** — HTTP query for all tags, in-memory collection merging, and entity equality comparison. Results are stored in tagsSharedCollection on this unit; no persisted service state is accessed.

### Coupling Notes
- Whether PostService, BlogService, or TagService hold any shared mutable state (for example, a cache or a broadcast subject) that would outlive this unit and affect other consumers cannot be determined from this unit alone. The cross-unit dependency graph requires the repository-level index. Other consumers of these services are unknown.

> No confirmed shared-state coupling was found at this unit's scope. The services used here appear to operate on a per-request basis with results held transiently in this unit's own fields. consumersKnown is false for all services; the open question q:4 tracks this gap. *(medium confidence)*
<!-- c2d:end section="7-service-layer" -->

## 8. Behavioral Invariants

<!-- c2d:begin section="8-invariants" hash="f47f4848" -->
- **inv:1** The Save button is inaccessible (disabled) whenever the form is in an invalid state or a save request is currently in progress. *Why it matters:* Prevents duplicate submissions and ensures the server never receives an incomplete post.
- **inv:2** The ID field is displayed and is read-only only when editing an existing post (when the form's id value is non-null). When creating a new post, the ID field is not shown. *Why it matters:* Prevents the user from modifying a system-assigned identifier.
- **inv:3** After a save attempt completes — whether the server request succeeds or fails — the saving indicator is cleared and the Save button becomes accessible again. *Why it matters:* Ensures the user is never permanently locked out of the Save button due to a failed request.
- **inv:4** The currently assigned blog and tags for an existing post always appear in their respective dropdown option lists, even if the server's default list query does not include them. *Why it matters:* Ensures the selection state displayed to the user is always coherent with the saved record.
<!-- c2d:end section="8-invariants" -->

## 9. Acceptance Criteria

<!-- c2d:begin section="9-acceptance" hash="dde468b4" -->
### ac:1: Blog options loaded and current assignment preserved on initialization
**Given:** An existing post with an assigned blog is being edited.
**When:** The edit screen first displays.
**Then:**
- All available blogs are fetched from the server and appear in the Blog dropdown.
- The post's currently assigned blog appears in the dropdown even if the server query did not include it.
**Covered by:** test:1

### ac:2: Tag options loaded and current assignment preserved on initialization
**Given:** An existing post with assigned tags is being edited.
**When:** The edit screen first displays.
**Then:**
- All available tags are fetched from the server and appear in the Tags multi-select.
- The post's currently assigned tags appear in the list even if the server query did not include them.
**Covered by:** test:2

### ac:3: Form pre-populated from route resolver data on initialization
**Given:** An existing post has been resolved by the route and is available when the screen loads.
**When:** The edit screen first displays.
**Then:**
- The form fields are pre-populated with the post's field values (id, title, content, date, blog, tags).
**Covered by:** test:3

### ac:4: Update request dispatched when saving an existing post
**Given:** An existing post (with a non-null id) is loaded in the form.; The form is valid.
**When:** The user activates the Save button.
**Then:**
- An update request is dispatched to the server with the form's data.
- After the request succeeds, the user is navigated to the previous screen.
**Covered by:** test:4

### ac:5: Create request dispatched when saving a new post
**Given:** No existing post is loaded (new-post scenario, id is null).; The form is valid.
**When:** The user activates the Save button.
**Then:**
- A create request is dispatched to the server with the form's data.
- After the request succeeds, the user is navigated to the previous screen.
**Covered by:** test:5

### ac:6: Saving indicator cleared after a server error
**Given:** The form is valid and the Save button has been activated.
**When:** The server returns an error response.
**Then:**
- The saving indicator is cleared.
- The Save button becomes accessible again.
- The user remains on the edit screen.
**Covered by:** test:6

### ac:7: Blog dropdown equality delegates to the blog service
**Given:** The Blog dropdown is rendering its options.
**When:** The dropdown compares two blog entities to determine whether one matches the currently selected value.
**Then:**
- The comparison is performed by the blog service's comparison operation.
**Covered by:** test:7

### ac:8: Tags multi-select equality delegates to the tag service
**Given:** The Tags multi-select is rendering its options.
**When:** The control compares two tag entities to determine whether one is a currently selected value.
**Then:**
- The comparison is performed by the tag service's comparison operation.
**Covered by:** test:8

### ac:9: Save button disabled when form is invalid
**Given:** One or more required fields (Title, Content, or Date) are empty or contain invalid values.
**When:** The form is in the invalid state.
**Then:**
- The Save button is disabled and cannot be activated.

### ac:10: Cancel button returns the user to the previous screen
**Given:** The user is on the create or edit post screen.
**When:** The user activates the Cancel button.
**Then:**
- The user is navigated back to the previous browser history entry without any changes being saved.

### ac:11: Inline required-field error shown after user interaction
**Given:** A required field (Title, Content, or Date) has been interacted with (touched or dirtied) but left empty.
**When:** The field is evaluated after interaction.
**Then:**
- An inline message indicating the field is required appears beneath that field.

### ac:12: Date format validation error shown for invalid datetime entry
**Given:** The Date field has been interacted with and contains a value that does not conform to the expected datetime format.
**When:** The field is evaluated.
**Then:**
- An inline message stating the field should be a date and time appears beneath the field.
<!-- c2d:end section="9-acceptance" -->

## 10. Domain Rules

<!-- c2d:begin section="10-domain" hash="49df193c" -->
### Business Constraints
- Title is a required field. A post cannot be saved without a title. *(high confidence)*
- Content is a required field. A post cannot be saved without body text. *(high confidence)*
- Date is a required field and must conform to a datetime format (YYYY-MM-DD HH:mm). A post cannot be saved without a valid date and time. *(high confidence)*
- A post's system-assigned identifier cannot be modified by the user. The ID field is always read-only when present. *(high confidence)*

### Edge Cases
- **Creating a new post (no pre-existing record)** — The ID field is hidden. The form starts empty. On save, a create request is dispatched rather than an update.
- **Server returns an error when saving** — The saving indicator is cleared and the user remains on the edit screen. No additional error feedback is generated by this unit. Whether the error alert component visible on the page displays a message depends on whether an interceptor or shared error mechanism broadcasts the error.

### Terminology
- **Post** — A content entry with a title, body text (referred to as Content), a publication date, an associated blog, and zero or more tags.
- **Blog** — A named publication channel to which a post belongs. Each post is associated with exactly one blog.
- **Tag** — A label applied to a post for categorization. Multiple tags may be applied to a single post.
<!-- c2d:end section="10-domain" -->

## 11. Review

<!-- c2d:begin section="11-review" hash="bafe74b7" -->
**Status:** pending

### Open Questions
- **q:1** What validators does PostFormService install on the form controls beyond what the template reveals? The template confirms that Title, Content, and Date are required and that Date has a datetime-format validator, but additional constraints — such as maximum length on Title or Content, or minimum/maximum date values — may be enforced inside PostFormService and are not visible from this unit.
- **q:2** When a save operation fails, does the user see an error message? The onSaveError method is intentionally empty and the jhi-alert-error component is embedded in the template, but the mechanism by which a server error reaches that alert component from a failed save is not visible in this unit. It may rely on a global HTTP interceptor or a shared event-broadcasting service.
- **q:3** Are byteSize, openFile, and setFileData intended as extension-point hooks for subclasses (in which case their declaration is load-bearing for a rebuild), or are they dead code that should be removed? The distinction affects the migration scope.
- **q:4** Do PostService, BlogService, or TagService hold any shared mutable state (caches, broadcast subjects) that other units in the application also read or write? Cross-unit coupling cannot be determined from this unit alone and requires the repository-level index.
<!-- c2d:end section="11-review" -->
