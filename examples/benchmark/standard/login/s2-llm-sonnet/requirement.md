<!-- code2docs:unit id="component:login:LoginComponent" schemaVersion="0.4.0" -->

# Component: LoginComponent

<!-- c2d:begin section="1-purpose" source="hand-written" -->
## 1. Component Purpose (Business Logic)

Enables a visitor to authenticate by submitting credentials, and redirects visitors who are already authenticated away from the login screen before it is shown.

**Responsibilities**
- Check at initialization whether the current visitor is already authenticated and, if so, navigate immediately to the home page without displaying the form. (`login.component.ts:30–37`)
- Collect a username, password, and optional "remember me" preference, and submit them to the authentication service when the visitor triggers sign-in. (`login.component.ts:43–54`)
- Display an error message when authentication fails, leaving the form accessible for retry. (`login.component.ts:52`; `login.component.html:5–9`)
- After successful authentication, navigate the visitor to the home page, unless an in-progress navigation is already underway (e.g., a redirect to a cached URL the visitor was previously trying to reach). (`login.component.ts:46–50`)
- Place keyboard focus on the username field when the form is first rendered. (`login.component.ts:39–41`)
<!-- c2d:end section="1-purpose" -->

<!-- c2d:begin section="2-state-and-data-flow" source="hand-written" -->
## 2. State & Data Flow

- **Props & Events (External):** None. The component has no inputs or outputs. (`login.component.ts:15`)

- **Local State (Internal):**
  - `authenticationError` — boolean flag, initially false. Set to true when the authentication service returns an error. Set to false when authentication succeeds. Drives visibility of the error alert. (`login.component.ts:18`)
  - `loginForm` — a reactive credential form grouping username, password, and rememberMe controls. Its current values are submitted verbatim to the authentication service on sign-in. (`login.component.ts:20–24`)
  - `username` — a reference to the rendered username input element, used only to place focus on it after the view initializes. (`login.component.ts:16`)

- **Derived State:** None.

- **Form State:** A reactive form with three controls:
  | Control | Type | Rule |
  |---|---|---|
  | `username` | text | Required — submission is blocked when blank. (`login.component.ts:21`) |
  | `password` | password | Required — submission is blocked when blank. (`login.component.ts:22`) |
  | `rememberMe` | checkbox | Default false. Has a `required` validator applied to a boolean field — marking an unchecked checkbox as invalid. This may be a defect (see §review-gate). (`login.component.ts:23`) |

- **Global State & Subscriptions:** On initialization, the component calls AccountService.identity to load the current identity and then calls AccountService.isAuthenticated to decide whether to redirect. Neither subscription has explicit teardown, but both are expected to complete after a single emission. (`login.component.ts:32–36`)

- **Lifecycle:**
  - On init (`ngOnInit`): AccountService.identity is called, and on the result, AccountService.isAuthenticated is checked. If authenticated, the router navigates to the home page.
  - After view init (`ngAfterViewInit`): the username input element receives focus programmatically.
  - No teardown logic.
<!-- c2d:end section="2-state-and-data-flow" -->

<!-- c2d:begin section="3-ui-and-rendering" source="hand-written" -->
## 3. UI & Rendering Logic

- **Structure:** A centered column containing a "Sign in" heading, an optional error alert, a credential form with three fields and a submit button, and two static links below the form. (`login.component.html:1–59`)

- **Conditional Rendering:**
  - The error alert — "Failed to sign in! Please check your credentials and try again." — is displayed only when `authenticationError` is true. When the condition is false, the alert node does not exist in the DOM (it is destroyed, not hidden). (`login.component.html:5–9`)

- **Loops:** None.

- **Interactions:**
  - Submitting the form (via the "Sign in" button or pressing Enter) calls the `login` method. (`login.component.html:10`)
  - The "Did you forget your password?" link navigates to `/account/reset/request`. (`login.component.html:48–50`)
  - The "Register a new account" link navigates to `/account/register`. (`login.component.html:55`)

- **Loading & Error States:** No loading state is shown while the authentication request is in flight. The user sees the form with no feedback during the request. The only post-response state change is the error alert, which appears on failure.

- **Accessibility & i18n:** All visible labels and text carry `jhiTranslate` keys: `login.title` (heading), `login.messages.error.authentication` (error alert), `global.form.username.label` (username label), `login.form.password` (password label), `login.form.rememberme` (remember-me label), `login.form.button` (submit button), `login.password.forgot` (forgot-password link), `global.messages.info.register.noaccount` ("You don't have an account yet?"), `global.messages.info.register.link` ("Register a new account"). (`login.component.html:4,6,12,26,41,45,48,54,55`)
<!-- c2d:end section="3-ui-and-rendering" -->

<!-- c2d:begin section="4-public-interface" source="hand-written" -->
## 4. Public Interface (ADT)

No inputs or outputs declared. The component's entry point is its route. The following members are public by convention and readable by tests.

| Member | Signature | Contract |
|---|---|---|
| `authenticationError` | `Signal<boolean>` | Readable; true if the most recent login attempt failed. (`login.component.ts:18`) |
| `loginForm` | `FormGroup` | The credential form. Tests patch values via `patchValue` to set up scenarios. (`login.component.ts:20`) |
| `username` | `Signal<ElementRef>` | Required ViewChild reference; available after view init. (`login.component.ts:16`) |
| `login()` | `(): void` | Submits the form's current values to the authentication service and handles the result. (`login.component.ts:43`) |
| `ngOnInit()` | `(): void` | Lifecycle hook — checks authentication state and redirects if already authenticated. (`login.component.ts:30`) |
| `ngAfterViewInit()` | `(): void` | Lifecycle hook — moves focus to the username input. (`login.component.ts:39`) |

**Consumed by:** The router mounts this component at the login route. No parent component renders it directly.
<!-- c2d:end section="4-public-interface" -->

<!-- c2d:begin section="5-dependencies" source="hand-written" -->
## 5. Dependencies & External Integrations

- **Services/APIs:**
  - `LoginService.login(credentials)` — authenticates the visitor by delegating to an auth provider and then refreshing the identity. Returns an Observable that emits the authenticated account or null on success, and errors on failure. (`login.component.ts:27,44`; `login.service.ts:15–17`)
  - `AccountService.identity()` — returns an Observable of the current user identity. Called on init to trigger authentication state resolution. (`login.component.ts:26,32`)
  - `AccountService.isAuthenticated()` — synchronous check of whether the current user is authenticated. Called after identity resolves. (`login.component.ts:33`)
  - `Router.navigate()` — navigates the visitor to the home page on successful authentication or when already authenticated. (`login.component.ts:34,49`)
  - `Router.getCurrentNavigation()` — synchronous check for an active in-progress navigation. If a navigation is underway, the home-page redirect is skipped. (`login.component.ts:47`)
- **Utils/Packages:**
  - `SharedModule` — provides `jhiTranslate` and other shared directives. (`login.component.ts:12`)
  - `FormsModule`, `ReactiveFormsModule` — enable reactive form binding in the template. (`login.component.ts:12`)
  - `RouterModule` — provides `routerLink` for the forgot-password and register links. (`login.component.ts:12`)

*Full dependency detail is in `dependencies.json`.*
<!-- c2d:end section="5-dependencies" -->

<!-- c2d:begin section="6-service-layer" source="hand-written" -->
## 6. Service Layer

- **Shared State:**
  - `AccountService` is `providedIn: 'root'` — a single shared instance for the entire application. The authentication state it holds outlives this component and is visible to all components. This component reads that state but does not directly write it; the write occurs inside `LoginService.login()` via `AccountService.identity(true)`. (`login.service.ts:10,16`)
  - `LoginService` is `providedIn: 'root'`. Its `login` method delegates to `AuthServerProvider` and then refreshes the account identity. (`login.service.ts:10,15–17`)

- **Mutations by this component:** None directly. The `login()` method calls `LoginService.login()`, which internally updates `AccountService`'s identity — a shared mutable state change visible to all subscribers.

- **Other consumers:** Unknown without the repository-level index. `consumersKnown: false`. Open question: which other units read `AccountService.isAuthenticated()` or subscribe to its authentication state changes?

- **Stateless operations:** None that cross a service boundary without side effects. All service calls in this component ultimately mutate global authentication state.

- **Coupling notes:** The redirect behavior in `ngOnInit` depends on `AccountService.identity()` completing with the current identity before `isAuthenticated()` is called. If identity resolution is asynchronous and slow, the component renders and shows the form briefly before redirecting. No ordering guarantee is enforced beyond the subscription.
<!-- c2d:end section="6-service-layer" -->

<!-- c2d:begin section="7-acceptance-criteria" source="hand-written" -->
## 7. Acceptance Criteria (AC)

- **Scenario 1: AccountService identity is called on initialization**
  - **Given** the component is initializing
  - **When** initialization runs
  - **Then** the accountService identity method is called on init to resolve the current authentication state
  - *Covered by existing test:* login.component.spec.ts:50

- **Scenario 2: AccountService isAuthenticated is checked on initialization**
  - **Given** the component is initializing and identity has resolved
  - **When** initialization runs
  - **Then** accountService isAuthenticated is called on init to check whether to redirect
  - *Covered by existing test:* login.component.spec.ts:62

- **Scenario 3: Already-authenticated visitor is redirected to home on init**
  - **Given** the visitor is already authenticated (AccountService.isAuthenticated returns true)
  - **When** initialization runs
  - **Then** the component navigates to the home page on init without displaying the form
  - *Covered by existing test:* login.component.spec.ts:73

- **Scenario 4: Focus placed on username input after view initialized**
  - **Given** the component's view has been initialized
  - **When** view initialization completes
  - **Then** focus is set on the username input after the view has been initialized
  - *Covered by existing test:* login.component.spec.ts:88

- **Scenario 5: Successful sign-in authenticates the user and navigates to home**
  - **Given** the visitor enters valid credentials
  - **When** the user submits the login form
  - **Then** the component authenticates the user and navigates to the home page, clearing the error flag
  - *Covered by existing test:* login.component.spec.ts:104

- **Scenario 6: Navigation skipped when authentication process is already routing to cached url**
  - **Given** an in-progress navigation is already underway (authentication process is already routing the visitor, e.g., redirecting to a cached url from localstorage)
  - **When** the user authenticates successfully
  - **Then** the component authenticates the user but does not navigate to home page — the existing routing is allowed to complete
  - *Covered by existing test:* login.component.spec.ts:127

- **Scenario 7: Login error shows error message**
  - **Given** the authentication service returns an error
  - **When** the user submits the login form
  - **Then** the component stays on the login form and shows the error message ("Failed to sign in!"); it does not navigate away
  - *Covered by existing test:* login.component.spec.ts:139
<!-- c2d:end section="7-acceptance-criteria" -->

<!-- c2d:begin section="8-domain-business-rules" source="hand-written" -->
## 8. Domain Business Rules (For SME Review)

- **Business Constraints:**
  - Username and password are required — the form cannot be submitted (and the authentication service is not called) if either is blank. (`login.component.ts:21–22`)
  - The "remember me" checkbox carries a `required` validator. Because the field is boolean (true/false), a `required` validator is always satisfied once the default value of `false` is provided — meaning this validator has no practical gating effect. This is likely a defect. (`login.component.ts:23`)
  - Credentials are submitted as a raw value (`getRawValue()`), which includes disabled controls. If any control is programmatically disabled, its value is still sent to the authentication service. No controls are disabled in this component, so the behavior is identical to `value` today. (`login.component.ts:44`)

- **Edge Cases & Error Handling:**
  - All authentication errors produce the same generic error message ("Failed to sign in!") regardless of cause — expired account, wrong password, locked account, network failure. The component does not distinguish between them.
  - If the user is already authenticated when they navigate to the login page, they are redirected to the home page. The form is displayed briefly during identity resolution before the redirect fires, which may flash visibly on slow networks.
  - No timeout is set on the authentication request. A permanently-in-flight request leaves the form interactive indefinitely with no feedback.

- **Domain Terminology/Formulas:**
  - *Authentication* — the process of verifying a visitor's identity using credentials (username + password). Distinct from *authorization* (permissions), which is not part of this component's scope.
  - *Remember me* — a flag indicating the user requests a persistent session that survives browser close. The exact persistence behavior (cookie lifetime, storage mechanism) is owned by `AuthServerProvider` and is not visible from this component.
<!-- c2d:end section="8-domain-business-rules" -->

---

<!-- c2d:begin section="review-gate" source="hand-written" -->
## Review Gate

**Status:** pending

Stage 2 (implementation) must not begin until status is `approved` and no blocking question remains open.

**Open Questions**
- [ ] *(Blocking)* What does `LoginService.login()` do internally? Specifically: does it set authentication tokens, update `AccountService`'s state, or do both? The redirect logic in `login()` depends on this completing successfully — but whether a partially completed login (e.g., token set but identity not refreshed) leaves the app in a broken state is unknown. (`login.service.ts:15–17`)
- [ ] *(Blocking)* What kind of observable does `AccountService.identity()` return? If it is a `BehaviorSubject`-backed observable that immediately replays a cached value, the `isAuthenticated()` check in `ngOnInit` may fire before the server has confirmed the identity. (`login.component.ts:32–33`)
- [ ] *(Non-blocking)* Is the `Validators.required` on the `rememberMe` control intentional? A boolean `false` satisfies `required`, so this validator has no gating effect on form validity. If the intent was to require the user to check the box before logging in, the validator is not achieving that. (`login.component.ts:23`)
- [ ] *(Non-blocking)* Does `LoginService.login()` handle error cases internally, or are all errors propagated as Observable errors to this component? If some errors are swallowed, the error alert would never appear for those cases. (`login.service.ts:15–17`)

**Suspected Defects in Existing Code**
- `Validators.required` on the `rememberMe` boolean control (`login.component.ts:23`): `false` satisfies `required`, so this validator never blocks form submission. If the intent was to require the checkbox to be checked, this is a bug. Confidence: high.
- No loading state while the authentication request is in flight (`login.component.html:1–59`): the form remains interactive and shows no feedback during the network round-trip. A double-submit is possible. Confidence: high.

**Confidence:** medium — 3/3 methods traced; all 7 spec titles covered; template fully read; service internals (AuthServerProvider, AccountService state shape) not visible from this scope.

*Migration hazards for this component are recorded separately in `migration_notes.md`.*
<!-- c2d:end section="review-gate" -->
