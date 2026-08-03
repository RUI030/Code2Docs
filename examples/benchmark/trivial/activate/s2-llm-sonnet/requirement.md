<!-- code2docs:unit id="component:account/activate:ActivateComponent" schemaVersion="0.4.0" -->

# Component: ActivateComponent

<!-- c2d:begin section="1-purpose" source="hand-written" -->
## 1. Component Purpose (Business Logic)

Completes the email-based account activation flow. When a visitor arrives at the activation URL, this screen reads the activation key from the URL and submits it to the activation endpoint. It then displays either a success message with a link to the sign-in screen, or an error message prompting the visitor to re-register.

**Responsibilities**
- Extract the activation key from the URL query parameters and pass it to the activation service. (`activate.component.ts:21–25`)
- Display a success confirmation — "Your user account has been activated." — with a link to the sign-in page when activation succeeds. (`activate.component.html:5–10`)
- Display an error message — "Your user could not be activated. Please use the registration form to sign up." — when activation fails. (`activate.component.html:11–15`)
<!-- c2d:end section="1-purpose" -->

<!-- c2d:begin section="2-state-and-data-flow" source="hand-written" -->
## 2. State & Data Flow

- **Props & Events (External):** None. This component has no inputs or outputs. (`activate.component.ts:14`)
- **Local State (Internal):**
  - `error` — a boolean flag, initially `false`. Set to `true` if the activation request returns an error. Controls visibility of the error alert. (`activate.component.ts:15`)
  - `success` — a boolean flag, initially `false`. Set to `true` if the activation request completes successfully. Controls visibility of the success alert. (`activate.component.ts:16`)
- **Derived State:** None.
- **Form State:** None. No form controls.
- **Global State & Subscriptions:** On initialization, the component subscribes to the URL query parameters stream and uses the `key` parameter to call the activation endpoint. The subscription is not explicitly cleaned up — there is no teardown registered. In practice the subscription completes after the single HTTP response, but the absence of an explicit teardown is a potential resource concern if the component is destroyed before the response arrives. (`activate.component.ts:22–25`)
- **Lifecycle:** On initialization (`ngOnInit`), the component reads `params.key` from the router's query parameters and immediately fires the activation request. No subsequent change or teardown logic is present.
<!-- c2d:end section="2-state-and-data-flow" -->

<!-- c2d:begin section="3-ui-and-rendering" source="hand-written" -->
## 3. UI & Rendering Logic

- **Structure:** A centered single-column panel (8-column-wide on medium screens) with an "Activation" heading followed by at most one conditional alert. (`activate.component.html:1–18`)
- **Conditional Rendering:**
  - The success alert — containing the text "Your user account has been activated. Please" followed by a "sign in" link — is displayed only after a successful activation response. When not displayed, its DOM node does not exist (it is destroyed, not hidden). (`activate.component.html:5–10`)
  - The error alert — containing "Your user could not be activated. Please use the registration form to sign up." — is displayed only after a failed activation response. When not displayed, its DOM node does not exist. (`activate.component.html:11–15`)
  - Both alerts are mutually exclusive in all expected outcomes, but there is no code that enforces mutual exclusivity: both `error` and `success` could theoretically be `true` simultaneously if the subscription fired unexpected values.
- **Loops:** None.
- **Interactions:** The success alert contains a navigation link to the `/login` route, labeled "sign in". This is the only interactive element in the template. (`activate.component.html:8`)
- **Loading & Error States:** No loading/pending state is rendered while the activation request is in flight. The user sees only the heading until either the success or error alert appears. This means there is no visible feedback during the request, which could leave the user uncertain about whether anything is happening.
- **Accessibility & i18n:** All visible strings carry `jhiTranslate` attributes for internationalization: `activate.title` (heading), `activate.messages.success` (success text), `global.messages.info.authenticated.link` (link text), and `activate.messages.error` (error text). (`activate.component.html:4,7,8,12`)
<!-- c2d:end section="3-ui-and-rendering" -->

<!-- c2d:begin section="4-public-interface" source="hand-written" -->
## 4. Public Interface (ADT)

No public inputs, outputs, or callable methods are exposed. The component's entry point is its route; the only externally observable behavior is the rendered state change triggered by `ngOnInit` on route activation.

| Member | Signature | Contract |
|---|---|---|
| `error` | `Signal<boolean>` | Readable boolean signal; `true` when activation has failed. Read-only by convention — not declared with a private modifier but not mutated outside `ngOnInit`. (`activate.component.ts:15`) |
| `success` | `Signal<boolean>` | Readable boolean signal; `true` when activation has succeeded. Same convention as `error`. (`activate.component.ts:16`) |

**Consumed by:** The router renders this component at the `activate` path (`activate.route.ts:5`). No other unit consumes it directly.
<!-- c2d:end section="4-public-interface" -->

<!-- c2d:begin section="5-dependencies" source="hand-written" -->
## 5. Dependencies & External Integrations

- **Services/APIs:**
  - `ActivateService.get(key)` — sends a GET request to `api/activate?key=<key>` and returns the server response as an Observable. This component subscribes in `ngOnInit` and reacts to its next/error outcome. (`activate.component.ts:18,22`; `activate.service.ts:12–15`)
  - `ActivatedRoute` — supplies the `queryParams` observable, from which `key` is extracted. (`activate.component.ts:19,22`)
  - `SharedModule` — imported at the component level; provides the `jhiTranslate` directive used throughout the template. (`activate.component.ts:11`)
  - `RouterModule` — provides `routerLink` used on the sign-in link. (`activate.component.ts:11`)
- **Utils/Packages:**
  - `ApplicationConfigService` — used by `ActivateService` to resolve the `api/activate` endpoint URL. Not directly referenced in the component. (`activate.service.ts:6,9`)

*Full dependency detail is in `dependencies.json`.*
<!-- c2d:end section="5-dependencies" -->

<!-- c2d:begin section="6-service-layer" source="hand-written" -->
## 6. Service Layer

- **Shared State:** `ActivateService` is `providedIn: 'root'` and therefore a single shared instance app-wide (`activate.service.ts:7`). However, `ActivateService` is stateless — it holds no fields beyond its injected dependencies (`http`, `applicationConfigService`). No state survives this component's lifetime through the service.
- **Mutations by this component:** None. The activation call is a read-only GET request. The component writes only its own local signals (`error`, `success`).
- **Other consumers:** Unknown without the repository-level index. `consumersKnown: false`. Open question: are any other screens or flows capable of triggering account activation, or reading the result of one?
- **Stateless operations:** `ActivateService.get(key)` — a single GET request returning an Observable that emits once and completes. No retained state.
- **Coupling notes:** No ordering or lifetime coupling beyond the standard injection pattern.
<!-- c2d:end section="6-service-layer" -->

<!-- c2d:begin section="7-acceptance-criteria" source="hand-written" -->
## 7. Acceptance Criteria (AC)

- **Scenario 1: Key is extracted and forwarded to the activation endpoint**
  - **Given** the visitor arrives at the activation URL with a `key` query parameter
  - **When** the component initializes
  - **Then** the activation service is called with exactly the value of the `key` query parameter
  - *Covered by existing test:* `calls activate.get with the key from params` (`activate.component.spec.ts:31`)

- **Scenario 2: Successful activation shows confirmation**
  - **Given** the activation service returns a successful response
  - **When** the component initializes and the response arrives
  - **Then** the success flag is set to true upon successful activation, and the error flag remains false. The success alert ("Your user account has been activated.") appears with a "sign in" link.
  - *Covered by existing test:* activate.component.spec.ts:43

- **Scenario 3: Failed activation shows error message**
  - **Given** the activation service returns an error response
  - **When** the component initializes and the error arrives
  - **Then** the error flag is set to true upon activation failure, and the success flag remains false. The error alert ("Your user could not be activated. Please use the registration form to sign up.") appears.
  - *Covered by existing test:* activate.component.spec.ts:56

- **Scenario 4: No feedback during pending activation**
  - **Given** the visitor arrives at the activation URL
  - **When** the activation request is in flight
  - **Then** only the "Activation" heading is visible; no loading indicator, spinner, or progress message is shown
  - *Covered by existing test:* none
<!-- c2d:end section="7-acceptance-criteria" -->

<!-- c2d:begin section="8-domain-business-rules" source="hand-written" -->
## 8. Domain Business Rules (For SME Review)

- **Business Constraints:**
  - An activation key must be present in the URL query string; the component does not validate its absence — if `params.key` is `undefined`, `undefined` is passed to the activation service (`activate.component.ts:22`). The behavior of the endpoint when receiving a missing or malformed key is not visible from this component.
  - Each activation key is presumably single-use (standard account activation pattern), but this is not enforced or described in the component itself. The endpoint owns this rule.

- **Edge Cases & Error Handling:**
  - If the URL has no `key` query parameter, the component still calls `activateService.get(undefined)`. Whether the server treats this as an invalid key and returns an error (which would show the error alert) or silently accepts it is unknown from this scope.
  - No timeout is set on the activation request. A permanently-in-flight request leaves the screen blank indefinitely.
  - The component does not distinguish between different error types (network failure, expired key, already-activated account). All errors produce the same generic error message.

- **Domain Terminology/Formulas:**
  - *Activation key* — a server-generated token delivered via email as a query parameter; submitting it to the activation endpoint transitions the account from unverified to active.
<!-- c2d:end section="8-domain-business-rules" -->

---

<!-- c2d:begin section="review-gate" source="hand-written" -->
## Review Gate

**Status:** pending

Stage 2 (implementation) must not begin until status is `approved` and no blocking question remains open.

**Open Questions**
- [ ] *(Non-blocking)* What does the server return on a missing or invalid activation key — an HTTP error or a 200 with a failure body? This determines whether the `error` signal will be set in those cases. (`activate.service.ts:12–15`)
- [ ] *(Non-blocking)* Is an activation key single-use? If so, what happens when the same link is clicked twice — does the server return an error on the second attempt, causing the error alert to appear? The component has no logic to handle a "already activated" case distinctly.
- [ ] *(Non-blocking)* Are there other components or flows that can trigger account activation, or that depend on the activation result? The repository-level index is needed to answer this.

**Suspected Defects in Existing Code**
- No loading state is shown while the activation request is in flight (`activate.component.html:1–18`). For slow networks, the user sees a blank screen with only the heading for the duration of the request. Confidence: high (the template has no third conditional block or loading indicator).
- The subscription in `ngOnInit` is not cleaned up with `takeUntilDestroyed()` or a similar mechanism (`activate.component.ts:22–25`). If the component is destroyed before the HTTP response arrives (e.g., rapid navigation), the subscription may fire on an unmounted component. In practice, signals survive this without crashing, but it is not idiomatic and would not port cleanly to a framework that enforces cleanup.

**Confidence:** medium — 1/1 method fully traced; 3/3 spec titles covered; template fully read; service internals (`api/activate` response schema) not visible from this scope.

*Migration hazards for this component are recorded separately in `migration_notes.md`.*
<!-- c2d:end section="review-gate" -->
