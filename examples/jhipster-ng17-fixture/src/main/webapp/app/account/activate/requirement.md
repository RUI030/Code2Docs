<!-- code2docs:unit id="component:app/account/activate:ActivateComponent" schemaVersion="0.2.0" -->
<!--
  PHASE A OUTPUT — hand-written, not rendered.

  In production this file is assembled deterministically from analysis.json. Phase A has no
  renderer and no extractor, so this was written directly from a reading of the source. Two
  consequences a reviewer should hold in mind:

    - Section hashes are absent; nothing here is machine-verified.
    - Derived facts (call graph, ordering) are approximations, not extraction output.

  Paths in citations are relative to the component folder:
  INPUT/jhipster-ng17-fixture/src/main/webapp/app/account/activate/
-->

# Component: Account Activation

<!-- c2d:begin section="1-purpose" source="hand-written" -->
## 1. Component Purpose (Business Logic)

Completes the final step of user self-registration. A newly registered person receives a link
containing a one-time activation key; opening that link brings them to this screen, which
redeems the key with the server and tells them whether their account is now active.

The screen is passive — it takes no input and offers no action beyond a link to sign in. Its
entire job is to redeem the key on arrival and report the outcome.

**Responsibilities**
- Read the activation key from the incoming web address (`activate.component.ts:22`).
- Ask the account service to redeem that key (`activate.component.ts:22`).
- Report success or failure to the person (`activate.component.ts:23-24`, `activate.component.html:5-15`).
- Offer a route onward to sign-in after success (`activate.component.html:8`).
<!-- c2d:end section="1-purpose" -->

<!-- c2d:begin section="2-state-and-data-flow" source="hand-written" -->
## 2. State & Data Flow

- **Props & Events (External):** None. This screen accepts nothing from a parent and raises no
  events. Its only external input is the `key` value in the web address
  (`activate.component.ts:22`).

- **Local State (Internal):** Two independent flags, both starting false
  (`activate.component.ts:15-16`):
  - `success` — the key was redeemed.
  - `error` — redemption failed.

  Both are readable from outside the component and are read by the screen itself
  (`activate.component.html:5,11`).

- **Derived State:** None.

- **Form State:** None. There are no inputs on this screen.

- **Global State & Subscriptions:** The screen observes the address bar's query values as a
  continuing stream rather than reading them once (`activate.component.ts:22`). It holds one
  active subscription for its lifetime and never explicitly cancels it. The account service it
  calls is a single shared instance for the whole application but holds no state — see §6.

- **Lifecycle:**
  - *On initialization* (`activate.component.ts:21`): begin observing the address query values;
    for each set received, attempt redemption.
  - *On input change:* not applicable.
  - *On teardown:* nothing is cleaned up — there is no teardown handler
    (`activate.component.ts`, no `ngOnDestroy` present).

  **Initial display state is neither success nor error.** Both flags start false, so between
  arrival and the server's reply the screen shows only its heading — see §3.
<!-- c2d:end section="2-state-and-data-flow" -->

<!-- c2d:begin section="3-ui-and-rendering" source="hand-written" -->
## 3. UI & Rendering Logic

- **Structure:** A single centred column holding a heading and, at most, one status message
  (`activate.component.html:1-4`). There is no other content.

- **Conditional Rendering:**
  - A success message is shown only when redemption has succeeded (`activate.component.html:5`).
  - A failure message is shown only when redemption has failed (`activate.component.html:11`).
  - The two conditions are evaluated independently. Nothing prevents both from being satisfied
    at once, in which case both messages appear — see §8 and the suspected defect in the review
    gate (`activate.component.html:5,11`).

- **Loops:** None.

- **Interactions:** None. The only interactive element is a link to the sign-in screen, shown
  inside the success message (`activate.component.html:8`).

- **Loading & Error States:**
  - *Pending:* **no pending indication exists.** While the server is being contacted, neither
    message is shown, so the person sees only the heading. On a slow connection this is
    indistinguishable from a broken page (`activate.component.html:5,11`).
  - *Failure:* a message stating the account could not be activated, directing the person to
    register again (`activate.component.html:12-13`).
  - Failure is reported identically regardless of cause — an expired key, an already-used key,
    a malformed key, and the server being unreachable all produce the same message
    (`activate.component.ts:24`).

- **Accessibility & i18n:** All four visible strings are translation keys resolved at display
  time, not literal text (`activate.component.html:4,7,8,12`): `activate.title`,
  `activate.messages.success`, `global.messages.info.authenticated.link`, and
  `activate.messages.error`. The embedded English is fallback copy. Status messages carry
  presentational alert styling but **no announcement role**, so assistive technology is not
  explicitly told the outcome (`activate.component.html:6,12`).
<!-- c2d:end section="3-ui-and-rendering" -->

<!-- c2d:begin section="4-public-interface" source="hand-written" -->
## 4. Public Interface (ADT)

No methods are offered for other parts of the application to call. The only externally visible
members are the two status flags, which exist to be displayed rather than invoked.

| Member | Signature | Contract |
|---|---|---|
| `success` | `() => boolean` | True once a key has been redeemed successfully. Never reset. |
| `error` | `() => boolean` | True once a redemption attempt has failed. Never reset. |

Neither flag is ever returned to false once set (`activate.component.ts:23-24`).

**Consumed by:** Nothing renders this screen directly. It is reached by web address only, at
`/activate`, registered as a routed destination (`activate.route.ts:6-8`).
<!-- c2d:end section="4-public-interface" -->

<!-- c2d:begin section="5-dependencies" source="hand-written" -->
## 5. Dependencies & External Integrations

- **Services/APIs:**
  - *Account activation service* (`activate.component.ts:18`) — redeems a key. Issues a single
    read request to `api/activate`, passing the key as a query value
    (`activate.service.ts:12-16`). The endpoint address is resolved through application
    configuration rather than hard-coded (`activate.service.ts:13`).
  - *Address information* (`activate.component.ts:19`) — supplies the query values from the
    incoming web address.

- **Utils/Packages:** Shared presentation module, supplying the translation directive; routing
  module, supplying the link to sign-in (`activate.component.ts:11`).

*Full dependency detail, including the same-file function call graph, is in
`dependencies.json`.*
<!-- c2d:end section="5-dependencies" -->

<!-- c2d:begin section="6-service-layer" source="hand-written" -->
## 6. Service Layer

- **Shared State:** **None.** The activation service is a single instance shared across the
  whole application (`activate.service.ts:7`), but it holds no fields and retains nothing
  between calls (`activate.service.ts:8-17`). Sharing the instance therefore creates no
  coupling: two screens using it cannot affect one another.

- **Mutations by this component:** None. This screen only reads.

- **Other consumers:** Not determined. Establishing who else calls this service requires an
  index of the whole repository, which does not exist at this stage. Recorded as an open
  question rather than assumed.

- **Stateless operations:** Redeem an activation key — one read request, one reply, nothing
  retained (`activate.service.ts:12-16`).

- **Coupling notes:** The service returns a stream that performs no work until something
  listens to it, so the request is issued by this screen's subscription rather than by the
  service call itself (`activate.component.ts:22`). A rebuild that issues the request eagerly
  would change when it happens and how often.
<!-- c2d:end section="6-service-layer" -->

<!-- c2d:begin section="7-acceptance-criteria" source="hand-written" -->
## 7. Acceptance Criteria (AC)

- **Scenario 1: The key is taken from the web address**
  - **Given** the screen is opened at an address carrying an activation key
  - **When** it initializes
  - **Then** redemption is attempted with exactly that key value
  - *Covered by existing test:* "calls activate.get with the key from params"

- **Scenario 2: Successful redemption**
  - **Given** the server accepts the key
  - **When** the reply arrives
  - **Then** the success message is shown, the failure message is not, and a link to sign in is
    offered
  - *Covered by existing test:* "should set set success to true upon successful activation"

- **Scenario 3: Failed redemption**
  - **Given** the server rejects the key or cannot be reached
  - **When** the failure arrives
  - **Then** the failure message is shown and the success message is not
  - *Covered by existing test:* "should set set error to true upon activation failure"

- **Scenario 4: The request targets the activation endpoint correctly**
  - **Given** a key value
  - **When** redemption is requested
  - **Then** a single read request is issued to `api/activate` carrying that key as a query
    value
  - *Covered by existing test:* "should call api/activate endpoint with correct values"

- **Scenario 5: Nothing is stated while waiting**
  - **Given** the screen has initialized and no reply has arrived
  - **When** the person looks at it
  - **Then** only the heading is shown — neither outcome message appears
  - *Covered by existing test:* none

- **Scenario 6: Repeated redemption after the address changes**
  - **Given** a successful redemption has already occurred
  - **When** the address query values change while the screen remains open
  - **Then** redemption is attempted again — see the open question on whether this is intended
  - *Covered by existing test:* none

**Test coverage note:** the existing component tests replace the screen's markup with nothing
before running (`activate.component.spec.ts:22`), so every rendering behavior in §3 —
including which message appears and the sign-in link — is **untested**. Scenarios 2 and 3 are
verified only at the flag level, not at the display level.
<!-- c2d:end section="7-acceptance-criteria" -->

<!-- c2d:begin section="8-domain-business-rules" source="hand-written" human-owned="false" -->
## 8. Domain Business Rules (For SME Review)

- **Business Constraints:**
  - An account is activated by redeeming a key delivered out of band; the person never types it
    (`activate.component.ts:22`).
  - Redemption requires no authentication — arriving with a valid key is sufficient
    (`activate.route.ts:5-9`, which attaches no access restriction).
  - Redemption is attempted automatically on arrival, with no confirmation step
    (`activate.component.ts:21`).

- **Edge Cases & Error Handling:**
  - Every failure cause is presented identically, and the person is directed to register again
    (`activate.component.html:12-13`). Whether that advice is correct for an *already-activated*
    account is unclear and worth confirming — re-registering may not be the desired path.
  - Arriving with no key at all is not handled distinctly; an empty value is sent to the server
    and the reply determines the message (`activate.component.ts:22`).
  - Once a failure occurs, no further attempt is made even if the address changes
    (`activate.component.ts:22-25`).
  - A success followed by a failure leaves **both** messages displayed simultaneously
    (`activate.component.ts:23-24`).

- **Domain Terminology/Formulas:**
  - *Activation key* — a single-use value proving control of the registered email address,
    passed as `key` in the web address (`activate.component.ts:22`, `activate.service.ts:14`).
  - *Activation* — the transition making a registered account usable for sign-in. Inferred from
    naming and the sign-in link offered on success (`activate.component.html:8`); the server
    performs the change and this screen only reports it. **Confidence: medium** — the precise
    server-side effect is not visible from here.
<!-- c2d:end section="8-domain-business-rules" -->

---

<!-- c2d:begin section="review-gate" source="hand-written" -->
## Review Gate

**Status:** pending

Stage 2 (implementation) must not begin until status is `approved` and no blocking question
remains open.

**Open Questions**

- [ ] **Is repeated redemption intended?** The screen watches the address query values
  continuously rather than reading them once (`activate.component.ts:22`). If those values can
  change while the screen stays open, redemption runs again. Whether that is deliberate or an
  unnoticed consequence determines whether a rebuild should preserve it. *Blocking* — the two
  readings produce different implementations.
- [ ] **Should a pending state exist?** No indication is shown while waiting
  (`activate.component.html:5,11`). Is the silence acceptable, or an omission to correct during
  the rebuild? *Not blocking* — but it must be a decision rather than an accident.
- [ ] **Is "register again" the right advice for an already-activated account?** The single
  failure message assumes registration is the remedy (`activate.component.html:12-13`).
- [ ] **Who else calls the activation service?** Requires a repository-wide index that does not
  exist at this stage (`activate.service.ts:8`). *Not blocking* for this screen.
- [ ] **Does the address-value stream end when the screen closes?** This determines whether the
  uncancelled subscription (`activate.component.ts:22`) is harmless or a genuine leak. The
  framework is believed to end it automatically for routed screens, which would make it
  harmless, but that was not verified. *Not blocking.*

**Suspected Defects in Existing Code**

- **Both outcomes can be displayed at once.** The success and failure flags are set
  independently and neither clears the other (`activate.component.ts:23-24`). If one redemption
  succeeds and a later one fails, both messages render together
  (`activate.component.html:5,11`), telling the person their account both was and was not
  activated. *Confidence: high* on the mechanism; reachability depends on the answer to the
  repeated-redemption question above.
- **A failure permanently stops all further attempts.** Reporting a failure ends the underlying
  stream, so no later change to the address is acted on (`activate.component.ts:22-25`). If a
  first attempt fails transiently, the screen cannot recover without a reload. *Confidence:
  high.*

**Confidence:** medium-high — 4 of 4 spec titles covered; every enumerated member, binding, and
conditional described. Lowered from high because the component's rendering behavior is entirely
untested upstream, so the specs cannot corroborate §3, and because two findings depend on
framework behavior asserted from knowledge rather than verified.

*Migration hazards for this component are recorded separately in `migration_notes.md`.*
<!-- c2d:end section="review-gate" -->
