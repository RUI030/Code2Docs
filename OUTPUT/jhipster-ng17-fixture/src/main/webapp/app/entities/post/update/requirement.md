<!-- code2docs:unit id="component:app/entities/post/update:PostUpdateComponent" schemaVersion="0.2.0" -->
<!--
  PHASE A OUTPUT — hand-written, not rendered. No extractor was involved; derived facts
  (call graph, reachability, ordering) are a careful reading, not verified extraction.

  Citations are relative to:
  INPUT/jhipster-ng17-fixture/src/main/webapp/app/entities/post/update/
  Files are abbreviated: c.ts = post-update.component.ts, c.html = post-update.component.html,
  f.ts = post-form.service.ts

  SCOPE: this documents the component only. The folder also contains post-form.service.ts,
  which is a separate unit under D1 and is described here only as a dependency.
-->

# Component: Create or Edit a Blog Post

<!-- c2d:begin section="1-purpose" source="hand-written" -->
## 1. Component Purpose (Business Logic)

The editing screen for a blog post, serving both creation and modification through one form. It
presents a post's title, body, publication date, owning blog, and tags; validates that the first
four are provided; and saves the result — creating a new post or updating an existing one
depending on whether it already has an identifier.

The post being edited is handed to the screen already loaded (`c.ts:50`); this screen never
fetches it. It does fetch the choices for the blog and tag selectors itself (`c.ts:118-130`).

**Responsibilities**
- Present an editable form for a post, populated from the supplied post when one exists (`c.ts:50-54`).
- Offer the available blogs and tags as selectable options (`c.ts:118-130`).
- Enforce that title, body, and date are provided before saving is permitted (`f.ts:58-66`, `c.html:99`).
- Create or update the post on submission, choosing by whether an identifier is present (`c.ts:84-88`).
- Return the person to where they came from once saving succeeds (`c.ts:98-100`).
<!-- c2d:end section="1-purpose" -->

<!-- c2d:begin section="2-state-and-data-flow" source="hand-written" -->
## 2. State & Data Flow

- **Props & Events (External):** None. This screen accepts nothing from a parent and raises no
  events. Its input arrives through routing — see *Global State* below.

- **Local State (Internal):**
  - `isSaving` — true while a save is in flight; disables the save control (`c.ts:28`, `c.html:99`).
  - `post` — the post currently being edited, or nothing for a new one (`c.ts:29`).
  - `blogsSharedCollection` — the blogs offered in the selector (`c.ts:31`).
  - `tagsSharedCollection` — the tags offered in the selector (`c.ts:32`).

  Despite their names, the two collections are **local to this screen** and shared with nothing
  (`c.ts:31-32`).

- **Derived State:** Two comparison helpers decide whether a selected option matches the stored
  value, each delegating to the corresponding entity service (`c.ts:45,47`). Without them the
  selectors could not pre-select an existing choice, since options are objects rather than
  simple values (`c.html:72,82`).

- **Form State:** Six fields, built by a dedicated form service (`c.ts:43`, `f.ts:45-70`):

  | Field | Required | Notes |
  |---|---|---|
  | Identifier | yes, but **never enforced** | permanently non-editable; see below (`f.ts:51-57`) |
  | Title | yes | free text (`f.ts:58-60`) |
  | Body | yes | multi-line text (`f.ts:61-63`) |
  | Date | yes | **defaults to the current moment for a new post** (`f.ts:64-66`, `f.ts:87-92`) |
  | Blog | no | single choice, may be left empty (`f.ts:67`, `c.html:73`) |
  | Tags | no | multiple choice, defaults to none (`f.ts:68`) |

  Two behaviors here are easy to miss:
  - The identifier is marked required *and* permanently disabled (`f.ts:51-57`). A disabled field
    takes no part in validation, so **its required rule never affects whether the form can be
    submitted**.
  - Because the identifier is disabled, it is excluded from the form's ordinary value. It reaches
    the save operation only because the value is read in raw form, which includes disabled fields
    (`f.ts:73`). Reading the ordinary value instead would silently turn every update into a
    creation.

  Validation messages appear only once a field has been **edited or visited** — not on arrival
  (`c.html:21,33,55`).

- **Global State & Subscriptions:** The post being edited is supplied through routing data
  (`c.ts:50`), meaning something upstream loaded it before this screen appeared. Three
  subscriptions are held and **none is ever cancelled** (`c.ts:50`, `c.ts:123`, `c.ts:129`).

  All six injected services are single instances shared across the application, but only one
  carries shared state — see §6.

- **Lifecycle:**
  - *Before initialization:* the form is constructed while the screen's fields are being set up,
    by calling into the form service (`c.ts:43`). This creates an ordering requirement — the form
    service must already be available — which the source acknowledges by suppressing a lint rule
    about member order (`c.ts:42`).
  - *On initialization:* begin watching routing data; for each post received, store it, populate
    the form if a post is present, then load the selector options (`c.ts:49-58`).
  - *On teardown:* nothing is cleaned up; there is no teardown handler.

  Because option loading happens inside the routing-data handler, **it re-runs every time routing
  data changes**, not once (`c.ts:56`).
<!-- c2d:end section="2-state-and-data-flow" -->

<!-- c2d:begin section="3-ui-and-rendering" source="hand-written" -->
## 3. UI & Rendering Logic

- **Structure:** A centred single-column form: heading, an error display region, six fields, then
  cancel and save controls (`c.html:1-107`). An embedded error-display component sits above the
  fields (`c.html:9`).

- **Conditional Rendering:**
  - The identifier field is shown **only when the post already has one** — so it is absent when
    creating and present when editing (`c.html:11`).
  - For title, body, and date, a validation region appears only when that field is invalid **and**
    has been edited or visited (`c.html:21,33,55`).
  - Within each region, a "required" message appears when that rule is the one failing
    (`c.html:23,35,57`).
  - The date field carries an additional message for a malformed date and time, shown by hiding
    rather than removal (`c.html:60-65`). **No such validation rule is declared** by the form
    service (`f.ts:64-66`), so whether this message can ever appear is unresolved — see the open
    questions.

- **Loops:**
  - Blog options are rendered one per available blog (`c.html:74-76`), preceded by an explicit
    empty choice allowing no blog to be selected (`c.html:73`).
  - Tag options are rendered one per available tag in a multiple-selection control
    (`c.html:83-85`). **There is no empty choice here**, unlike the blog selector.
  - Both loops identify items **by position**, not by identity (`c.html:74,83`).

- **Interactions:**
  - Submitting the form saves (`c.html:3`).
  - The cancel control returns to the previous screen (`c.html:91`).
  - The save control is **disabled whenever the form is invalid or a save is already in flight**
    (`c.html:99`).
  - Both selectors compare options against the stored value using the comparison helpers
    (`c.html:72,82`).

- **Loading & Error States:**
  - *While saving:* the save control is disabled. There is no other progress indication
    (`c.html:99`).
  - *While loading selector options:* **no indication at all.** Both selectors render empty until
    their data arrives (`c.html:74,83`).
  - *If option loading fails:* nothing is reported. The selectors simply stay empty, and the
    person cannot tell whether no blogs exist or the request failed (`c.ts:118-130`, no failure
    handling present).
  - *If saving fails:* **nothing is shown by this screen.** The failure path is deliberately empty
    (`c.ts:102-104`). Any message must come from the shared error-display region (`c.html:9`) via
    application-wide error handling that is not visible from here — see the open questions.
  - *After a failed save:* the in-flight flag is cleared, so the form becomes editable and
    submittable again (`c.ts:106-108`).

- **Accessibility & i18n:** Every visible label, heading, message, and button caption is a
  translation key resolved at display time (`c.html:4,13,19,24,31,36,43,58,63,71,81,92,102`); the
  embedded English is fallback copy. Each field has a label bound to its control
  (`c.html:13,19,31,43,71,81`). Two icons accompany the buttons (`c.html:92,102`).
  Validation messages are **not associated with their fields** for assistive technology — they are
  adjacent text with no announcement role or programmatic link (`c.html:24,36,58,64`).
<!-- c2d:end section="3-ui-and-rendering" -->

<!-- c2d:begin section="4-public-interface" source="hand-written" -->
## 4. Public Interface (ADT)

Nothing renders this screen directly, so this surface exists for its own template and for
subclasses rather than for callers.

| Member | Signature | Contract |
|---|---|---|
| `save` | `() => void` | Marks a save in flight, then creates or updates depending on whether an identifier is present. Does not itself check validity — the control is disabled instead (`c.ts:81-89`). |
| `previousState` | `() => void` | Returns to the previous entry in browser history (`c.ts:77-79`). |
| `compareBlog` | `(a, b) => boolean` | Whether two blogs are the same, for option matching (`c.ts:45`). |
| `compareTag` | `(a, b) => boolean` | Whether two tags are the same, for option matching (`c.ts:47`). |
| `byteSize` | `(string) => string` | **Unreachable** — see below (`c.ts:60-62`). |
| `openFile` | `(string, string) => void` | **Unreachable** (`c.ts:64-66`). |
| `setFileData` | `(Event, string, boolean) => void` | **Unreachable** (`c.ts:68-75`). |

Four further operations exist for subclasses to override: the save-response handler and the
success, failure, and completion callbacks (`c.ts:91-108`). The failure callback is empty by
design and carries a comment marking it an extension point (`c.ts:102-104`).

**Three operations are unreachable.** The file-handling trio is never called from the template,
from another method, or from the tests — this screen has no file field (`c.html`, no file input
present). They are boilerplate for entity types with binary attachments, which a post does not
have. Two injected dependencies exist **solely** to serve them and are therefore also unused in
practice (`c.ts:34,35`).

**Consumed by:** Nothing directly. Reached by route, receiving its post through routing data
(`c.ts:50`).
<!-- c2d:end section="4-public-interface" -->

<!-- c2d:begin section="5-dependencies" source="hand-written" -->
## 5. Dependencies & External Integrations

- **Services/APIs:**
  - *Post service* (`c.ts:36`) — creates or updates the post (`c.ts:85,87`).
  - *Post form service* (`c.ts:37`) — builds the form, populates it from a post, and reads it back
    out (`c.ts:43,83,112`). A separate unit, co-located in this folder.
  - *Blog service* (`c.ts:38`) — lists available blogs, merges in the currently selected one if
    absent from that list, and compares blogs for option matching (`c.ts:45,114,119-123`).
  - *Tag service* (`c.ts:39`) — the same three roles for tags (`c.ts:47,115,125-129`).
  - *Routing data* (`c.ts:40`) — supplies the post to edit (`c.ts:50`).
  - *File utilities* (`c.ts:34`) — **used only by unreachable operations** (§4).
  - *Application event bus* (`c.ts:35`) — **used only by an unreachable operation** (§4).

  The merge-if-absent step matters: if the post being edited references a blog or tag that the
  fetched list omits, it is added so the selector can still display the current choice
  (`c.ts:114-115`, `c.ts:122,128`).

- **Utils/Packages:** Shared presentation module (translation directive, icons, embedded
  error-display component); form modules; a date/time library used by the form service for
  conversion and defaulting (`f.ts:4,87,99,108`).

*Full dependency detail, including the same-file call graph and reachability, is in
`dependencies.json`.*
<!-- c2d:end section="5-dependencies" -->

<!-- c2d:begin section="6-service-layer" source="hand-written" -->
## 6. Service Layer

- **Shared State:** One of the six services carries any: the **application event bus**
  (`c.ts:35`), which broadcasts messages other parts of the application listen for. The remaining
  five hold no state — the post, blog, and tag services issue requests and return replies, and the
  form service is a pure transformer (`f.ts:44-112`, no fields).

  The two locally-held option collections are named as though shared but are not (`c.ts:31-32`);
  the naming is misleading and worth correcting rather than preserving.

- **Mutations by this component:** One, and it is **unreachable in practice**: a file-loading
  failure broadcasts an error message onto the event bus (`c.ts:71-73`). Since the only path to it
  is dead (§4), this screen effectively mutates no shared state.

- **Other consumers:** Not determined. The event bus is a broadcast channel, so identifying who
  reacts to a message requires an index of the whole repository, which does not exist at this
  stage. This matters more than the usual unknown, because the failure display in §3 depends on
  some unseen listener. Recorded as an open question.

- **Stateless operations:** Create or update a post; list blogs; list tags; merge a missing option
  into a list; compare two entities; build, populate, and read the form.

- **Coupling notes:**
  - The form is constructed during field setup by calling the form service, so that service must
    be available first (`c.ts:43`, acknowledged at `c.ts:42`).
  - Save requests do nothing until subscribed to (`c.ts:92`), so the request is issued by this
    screen, not by the service call.
  - Reporting a save failure is **delegated entirely** to the event-bus-driven error display
    (`c.html:9`, `c.ts:102-104`). This screen's correct behavior therefore depends on machinery
    outside it.
<!-- c2d:end section="6-service-layer" -->

<!-- c2d:begin section="7-acceptance-criteria" source="hand-written" -->
## 7. Acceptance Criteria (AC)

- **Scenario 1: Blog options are loaded and the current choice preserved**
  - **Given** the screen opens for a post
  - **When** it initializes
  - **Then** available blogs are fetched, and the post's own blog is included in the options even
    if the fetched list omits it
  - *Covered by existing test:* "Should call Blog query and add missing value"

- **Scenario 2: Tag options are loaded and current choices preserved**
  - **Given** the screen opens for a post
  - **When** it initializes
  - **Then** available tags are fetched, and the post's own tags are included even if omitted from
    the fetched list
  - *Covered by existing test:* "Should call Tag query and add missing value"

- **Scenario 3: The form reflects the supplied post**
  - **Given** a post is supplied through routing
  - **When** the screen initializes
  - **Then** the form is populated from it
  - *Covered by existing test:* "Should update editForm"

- **Scenario 4: Saving an existing post updates it**
  - **Given** the form holds a post that already has an identifier
  - **When** save is submitted
  - **Then** an update is requested, not a creation
  - *Covered by existing test:* "Should call update service on save for existing entity"

- **Scenario 5: Saving a new post creates it**
  - **Given** the form holds a post with no identifier
  - **When** save is submitted
  - **Then** a creation is requested, not an update
  - *Covered by existing test:* "Should call create service on save for new entity"

- **Scenario 6: A failed save re-enables the form**
  - **Given** a save is in flight
  - **When** it fails
  - **Then** the in-flight flag is cleared so the form can be submitted again
  - *Covered by existing test:* "Should set isSaving to false on error"

- **Scenario 7: Blog option matching is delegated**
  - **Given** two blogs are compared for option selection
  - **When** the comparison runs
  - **Then** it defers to the blog service's own comparison
  - *Covered by existing test:* "Should forward to blogService"

- **Scenario 8: Tag option matching is delegated**
  - **Given** two tags are compared
  - **When** the comparison runs
  - **Then** it defers to the tag service's own comparison
  - *Covered by existing test:* "Should forward to tagService"

- **Scenario 9: Saving is blocked while invalid or in flight**
  - **Given** the form is invalid, or a save is already in flight
  - **When** the person looks at the save control
  - **Then** it is disabled
  - *Covered by existing test:* none

- **Scenario 10: The identifier reaches an update**
  - **Given** an existing post is being edited and its identifier field is non-editable
  - **When** save is submitted
  - **Then** the identifier is still included, so an update is performed rather than a creation
  - *Covered by existing test:* none — covered indirectly by Scenario 4, but the mechanism that
    makes it work (reading the raw value) is not asserted

- **Scenario 11: A new post's date is pre-filled**
  - **Given** the screen opens with no existing post
  - **When** the form is built
  - **Then** the date is pre-filled with the current moment
  - *Covered by existing test:* none in this unit's tests; the form service's own tests cover
    default values

- **Scenario 12: Validation messages wait for interaction**
  - **Given** the screen has just opened with empty required fields
  - **When** the person has not yet edited or visited a field
  - **Then** no validation message is shown for it
  - *Covered by existing test:* none

**Test coverage notes.** All 8 of this component's test titles are represented above. Coverage is
concentrated on option loading and the save branch; **nothing tests the template**, so every
rendering behavior in §3 is unverified upstream — including the disabled save control, the
conditional identifier field, and all validation-message display.

The seven tests belonging to the form service cover a **separate unit** (`f.ts`) and are not
claimed as coverage here.
<!-- c2d:end section="7-acceptance-criteria" -->

<!-- c2d:begin section="8-domain-business-rules" source="hand-written" human-owned="false" -->
## 8. Domain Business Rules (For SME Review)

- **Business Constraints:**
  - A post must have a title, a body, and a date (`f.ts:58-66`).
  - A post need not belong to a blog, and need not carry any tags (`f.ts:67-68`, `c.html:73`).
  - A post may carry several tags (`c.html:82`).
  - A post's identifier is assigned by the system and never editable (`f.ts:52`, `c.html:14`).
  - A new post's date defaults to the moment the form is opened, rather than being left blank
    (`f.ts:87-92`). **Confidence: high** on the behavior; whether "the moment the form was opened"
    is the intended publication semantic is worth confirming.

- **Edge Cases & Error Handling:**
  - If the blog or tag list cannot be fetched, the selectors are silently empty and the person
    cannot distinguish that from "none exist" (`c.ts:118-130`).
  - If a save fails, this screen shows nothing itself and relies on application-wide error display
    (`c.ts:102-104`, `c.html:9`).
  - A post referencing a blog or tag missing from the fetched list still displays its current
    choice, rather than appearing to have none (`c.ts:114-115`).
  - The tag selector offers no way to express "no tags" explicitly, unlike the blog selector's
    empty choice (`c.html:83-85` versus `c.html:73`).
  - Cancelling, and succeeding at saving, both return to the **previous browser entry** rather than
    to a known screen (`c.ts:78`, `c.ts:99`). Where that leads depends on how the person arrived.

- **Domain Terminology/Formulas:**
  - *Post* — a blog entry with a title, body, date, an optional owning blog, and optional tags
    (`f.ts:32-39`).
  - *Blog* — the publication a post belongs to; at most one (`f.ts:37`).
  - *Tag* — a label applied to a post; any number (`f.ts:38`).
  - *New versus existing* — determined solely by whether an identifier is present; there is no
    separate mode or flag (`c.ts:84`). **Confidence: high.**
<!-- c2d:end section="8-domain-business-rules" -->

---

<!-- c2d:begin section="review-gate" source="hand-written" -->
## Review Gate

**Status:** pending

Stage 2 (implementation) must not begin until status is `approved` and no blocking question
remains open.

**Open Questions**

- [ ] **Should the three file-handling operations and their two dependencies be carried over at
  all?** They are unreachable — no file field exists on this screen (§4). They appear to be
  generated boilerplate for entity types with binary attachments. Porting them would reproduce
  dead code; dropping them assumes nothing outside this screen reaches them. *Blocking* — it
  changes what gets built.
- [ ] **How is a failed save reported to the person?** This screen deliberately does nothing
  (`c.ts:102-104`) and relies on an error-display region fed by the application event bus
  (`c.html:9`). That machinery is outside this folder, so the actual behavior on failure could not
  be established. *Blocking* — a rebuild cannot preserve unobserved behavior, and silent save
  failure would be a serious regression.
- [ ] **Can the malformed date-and-time message ever appear?** The template shows one
  (`c.html:60-65`) but the form service declares no such rule (`f.ts:64-66`). Either a rule is
  applied elsewhere, or this is dead UI. *Not blocking.*
- [ ] **Is returning to the previous browser entry the intended destination after saving?**
  (`c.ts:99` via `c.ts:78`.) It is not equivalent to navigating to a known screen — a person who
  arrived by direct link could be taken out of the application. *Not blocking, but likely a
  behavior worth changing rather than preserving.*
- [ ] **Should option loading re-run when routing data changes?** It is invoked inside the
  routing-data handler (`c.ts:56`), so it repeats on every emission. Whether routing data can emit
  more than once for this screen was not established. *Not blocking.*
- [ ] **Who listens to the application event bus?** Requires a repository-wide index
  (`c.ts:35`). Bears on the save-failure question above.
- [ ] **Do the three uncancelled subscriptions matter?** (`c.ts:50,123,129`.) Routing streams are
  believed to be completed automatically for routed screens, and the two request streams complete
  on their own — which would make all three harmless. Asserted from knowledge, not verified.
  *Not blocking.*

**Suspected Defects in Existing Code**

- **Option-loading failures are invisible.** Neither request handles failure (`c.ts:118-130`), so
  a person may save a post with no blog simply because the list never arrived. *Confidence: high*
  on the missing handling; severity depends on how often the request can fail.
- **The identifier's required rule is inert.** It is marked required and simultaneously disabled
  (`f.ts:51-57`); disabled fields do not participate in validation, so the rule can never fire.
  Harmless today, but misleading to anyone reading the form definition — and actively dangerous if
  a rebuild enables the field while assuming the rule protects it. *Confidence: high.*
- **The tag selector cannot express "no tags."** The blog selector has an explicit empty choice
  and the tag selector does not (`c.html:73` versus `c.html:83-85`). Deselecting all entries in a
  multiple-selection control is possible but not obvious. *Confidence: medium* — plausibly
  intentional.

**Confidence:** medium — 8 of 8 component test titles covered, and every enumerated field, method,
binding, conditional, and loop described. Lowered from higher because two blocking questions
concern behavior defined outside this folder (save-failure reporting, and whether the dead code is
truly dead), because no test exercises the template so §3 is entirely uncorroborated, and because
the reachability finding — the most consequential claim in this document — rests on a manual search
rather than verified extraction.

*Migration hazards for this component are recorded separately in `migration_notes.md`.*
<!-- c2d:end section="review-gate" -->
