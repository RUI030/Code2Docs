<!-- code2docs:unit id="component:login:LoginComponent" schemaVersion="0.4.0" -->
# Unit: LoginComponent

## 1. Purpose

<!-- c2d:begin section="1-purpose" hash="ebed08df" -->
Enables a visitor to authenticate by submitting credentials, and redirects users who are already authenticated away from the login screen without requiring them to log in again.

**Responsibilities**
- Collect a username, password, and optional 'remember me' flag, and submit them to the authentication service.
- Display an error message when authentication fails and leave the form accessible for retry.
- After successful authentication, navigate the user to the home page or to a URL they had been trying to reach before being redirected to login.
- At startup, detect whether the current visitor is already authenticated and, if so, redirect them to the home page without displaying the form.
- Automatically place keyboard focus in the username field when the form first renders.
<!-- c2d:end section="1-purpose" -->

## 2. State & Data Flow

<!-- c2d:begin section="2-state" hash="9cd4a961" -->
### Props & Events (External)
None declared.

### External State
- **User authentication state** (owner: AccountService) — The current visitor's identity and authentication status, managed by AccountService and outliving this screen. This unit reads these values at initialization to decide whether to show the form or redirect.
- **Active router navigation** (owner: Router) — The router's in-progress navigation state, read when login succeeds to decide whether an additional home-page navigation is needed or whether an existing redirect (to a previously attempted URL) should be allowed to complete.

### Local State (Internal)
- **field:authenticationError** — A boolean flag, initially false, indicating whether the most recent login attempt failed. When true, an error banner reading 'Failed to sign in! Please check your credentials and try again.' is shown above the form. The login method writes this flag on every authentication response — true on failure, false on success.
- **field:loginForm** — A credential form grouping the username, password, and rememberMe controls. Its current values are submitted to the authentication service when the user triggers sign-in.
- **field:username** — A reference to the rendered username input element, used solely after initial rendering to programmatically move keyboard focus to that field.

### Form State
A reactive form collecting authentication credentials. Both username and password are required. The form is submitted via the ngSubmit event on the form element.

| Control | Statement |
|---|---|
| `control:loginForm.username` | The user's account name. Required — submission is blocked when blank. |
| `control:loginForm.password` | The user's password. Required — submission is blocked when blank. |
| `control:loginForm.rememberMe` | A boolean toggle (rendered as a checkbox) requesting a persistent session. Defaults to false (unchecked). A 'required' validator is applied — see suspected defects for the implications of requiring a boolean field. |

### Async / Subscriptions
- **accountService.identity()**. Trigger: First display of the login screen (ngOnInit lifecycle phase).
- **loginService.login(credentials)**. Trigger: User submits the login form. Error handling: On failure the authentication-error flag is set to true, displaying the error banner. The form remains accessible for another attempt..

> This unit accepts no data from a parent and emits no events to one. It is a standalone screen; its effective inputs arrive through the routing context and through the shared authentication state managed by external services.
<!-- c2d:end section="2-state" -->

## 3. Public Contract

<!-- c2d:begin section="3-public-contract" hash="d3e353ac" -->
### Public Methods
- `login(): void` — Reads the current credential form values and submits them to the authentication service. On success, navigates the user away from the login screen. On failure, sets the error flag so the failure message appears above the form.
  - Pre: The login form is displayed and contains values entered by the user.
  - Post: On success: the user is no longer on the login screen.; On failure: the authentication-error state is true and the error message is visible.

> login() is invoked by the form's submit event and is not intended as a callable API for a parent component. No parent-facing inputs, outputs, or two-way bindings exist on this unit.
<!-- c2d:end section="3-public-contract" -->

## 4. Workflows

<!-- c2d:begin section="4-workflows" hash="f25ccb09" -->
### Submit login credentials
**Trigger:** The user submits the login form, by clicking the 'Sign in' button or by pressing Enter while focus is within the form.

**Preconditions:** The login screen is visible — the current visitor is not already authenticated.

**Steps:**
2. The unit reads the current username, password, and rememberMe values from the credential form.
3. The unit calls the login service with those values. No in-progress indicator is shown to the user.
4. On success: the unit checks whether the router has a navigation already in progress (indicating a cached-URL redirect was triggered before login). If a navigation is in progress, no further navigation is issued and that navigation completes. If no navigation is in progress, the unit navigates to the home page.
5. On failure: the unit sets the authentication-error flag to true, causing the error banner to appear above the form. The form fields remain populated.

**Success:** The user is navigated away from the login screen to the home page or to the URL they originally tried to reach.

**Failure outcomes:**
- The login service reports authentication failure.: The user remains on the login screen. The message 'Failed to sign in! Please check your credentials and try again.' appears above the form. The credential fields retain their values so the user can correct and resubmit.
<!-- c2d:end section="4-workflows" -->

## 5. Lifecycle Behavior

<!-- c2d:begin section="5-lifecycle" hash="e0464c76" -->
**On initialization:**
On first display, the screen contacts the account service to retrieve the current visitor's identity and check whether they are already authenticated. If authenticated, the visitor is immediately redirected to the home page without seeing the form. If not authenticated, no further action is taken and the login form is shown. No loading indicator is displayed during this check, and if the identity operation fails no error is surfaced — the subscription ends silently and the form remains visible in its default state.

**Ordering constraints:**
- Keyboard focus is placed on the username input only after the view has been fully rendered. The focus step runs in a lifecycle phase after initialization — specifically, the phase when DOM elements for the template first exist. Any rebuild must replicate this ordering: attempting to set focus before the input element exists has no effect.

> The subscription to accountService.identity() opened in ngOnInit has no explicit teardown. There is no ngOnDestroy hook. Whether this is safe depends on whether the observable completes after its first emission. If it is a long-lived stream, the subscription leaks when the user navigates away from the login screen. See open questions and migration risks.
<!-- c2d:end section="5-lifecycle" -->

## 6. External Integrations

<!-- c2d:begin section="6-integrations" hash="cad5dd56" -->
### Services Used
- **dep:accountService** — Provides the current visitor's identity and authentication status, checked at startup to redirect already-authenticated users without showing the form. Operations: identity(), isAuthenticated().
- **dep:loginService** — Performs the authentication operation, submitting credentials and signalling success or failure. Operations: login(credentials).
- **dep:router** — Provides navigation: redirects an already-authenticated user to the home page on startup; navigates to the home page after successful login; reads the current navigation to detect whether a cached-URL redirect is already in progress. Operations: navigate(['']), getCurrentNavigation().

> No direct server calls are made from this unit. All server communication is delegated to LoginService and AccountService. Because those services' implementations are not visible from this component, the actual HTTP traffic they generate is unknown at component scope.
<!-- c2d:end section="6-integrations" -->

## 7. Service Layer

<!-- c2d:begin section="7-service-layer" hash="72e8fca7" -->
### Shared State
- **dep:accountService** — `Current user identity and authentication status (identity(), isAuthenticated())` (lifetime: unknown)
  - read by this unit; other consumers unknown
- **dep:router** — `Active navigation and routing tree` (lifetime: app-singleton)
  - read by this unit; mutated by this unit; other consumers unknown

### Stateless Operations
- **dep:loginService** — Dispatches login credentials and signals success or failure. Internal state effects of this service (token storage, AccountService update) are not visible from this unit.

### Coupling Notes
- LoginService is listed as a stateless operation because its internal state effects cannot be confirmed from this unit. It is likely that on success it updates AccountService or a shared authentication store — any rebuild must replicate those side effects for the post-login authentication state to be correct.

> AccountService lifetime is marked unknown because its injection scope cannot be determined from this unit alone (resolvedUnitId is null). Whether it is an application-level singleton or has narrower scope requires the repository index (Phase 2).
<!-- c2d:end section="7-service-layer" -->

## 8. Behavioral Invariants

<!-- c2d:begin section="8-invariants" hash="4d93da94" -->
- **inv:1** The authentication-error banner is hidden when the screen loads and appears only after the user submits credentials that are rejected. It disappears if the user navigates away and returns (because the component is recreated with the flag initialised to false). *Why it matters:* A rebuild that persists error state across navigations (e.g., through a shared store) would show stale errors on re-entry.
- **inv:2** After a successful sign-in, the user is never left on the login screen. They are always redirected — either to the home page or to a URL that triggered the login requirement. *Why it matters:* A rebuild that skips post-login navigation would strand the user on the login screen in a logged-in state.
- **inv:3** A user who is already authenticated is redirected away from the login screen on first load, without interacting with the form. *Why it matters:* Without this guard, authenticated users can reach the login form, potentially re-authenticating or seeing confusing UI.
- **inv:4** On first display, keyboard focus is automatically placed in the username field so the user can begin typing without an explicit click. *Why it matters:* A rebuild that omits auto-focus degrades accessibility and keyboard-first usability.
<!-- c2d:end section="8-invariants" -->

## 9. Acceptance Criteria

<!-- c2d:begin section="9-acceptance" hash="436f24f9" -->
### ac:1: Account service identity check on initialization
**Given:** The login screen is being displayed for the first time.
**When:** The screen finishes initializing.
**Then:**
- The account service's identity operation is called.
**Covered by:** test:1

### ac:2: Authentication status check on initialization
**Given:** The login screen is being displayed for the first time.
**When:** The screen finishes initializing.
**Then:**
- The account service's isAuthenticated check is performed.
**Covered by:** test:2

### ac:3: Already-authenticated visitor is redirected on load
**Given:** The current visitor is already authenticated when the login screen loads.
**When:** The screen initializes.
**Then:**
- The visitor is redirected to the home page without interacting with the login form.
**Covered by:** test:3

### ac:4: Keyboard focus on username field after rendering
**Given:** The login form is displayed to an unauthenticated visitor.
**When:** The form has finished rendering.
**Then:**
- Keyboard focus is placed in the username input field automatically.
**Covered by:** test:4

### ac:5: Successful login navigates to home page
**Given:** The visitor has entered credentials and the router has no pending navigation.
**When:** The visitor submits the form and authentication succeeds.
**Then:**
- The visitor is navigated to the home page.
**Covered by:** test:5

### ac:6: Successful login with an in-progress router navigation does not re-navigate
**Given:** The visitor has entered credentials and the router already has a navigation in progress (a previously requested URL is being restored).
**When:** The visitor submits the form and authentication succeeds.
**Then:**
- No additional navigation to the home page is triggered; the existing navigation to the cached URL completes.
**Covered by:** test:6

### ac:7: Failed login shows error message and keeps form
**Given:** The visitor has entered credentials.
**When:** The visitor submits the form and authentication fails.
**Then:**
- The visitor remains on the login screen.
- The message 'Failed to sign in! Please check your credentials and try again.' is visible above the form.
**Covered by:** test:7

### ac:8: Login form submits all three credential fields
**Given:** The login screen is displayed to an unauthenticated visitor.
**When:** The visitor fills in username, password, and optionally checks 'Remember me', then submits the form.
**Then:**
- All three values (username, password, rememberMe) are included in the authentication request.
<!-- c2d:end section="9-acceptance" -->

## 10. Domain Rules

<!-- c2d:begin section="10-domain" hash="50ca2855" -->
### Business Constraints
- A non-empty username is required to attempt sign-in. *(high confidence)*
- A non-empty password is required to attempt sign-in. *(high confidence)*
- An authenticated visitor is not permitted to view the login form — they are automatically redirected to the home page upon reaching the login URL. *(high confidence)*

### Edge Cases
- **Visitor reaches the login URL while already authenticated.** — The unit detects the authenticated state during initialization and immediately redirects to the home page. The login form is never rendered for this visitor.
- **Submitted credentials are rejected by the server.** — The authentication-error flag is set to true and the error banner appears above the form. The form remains populated and accessible. No automatic retry occurs.
- **Login succeeds while the router already has a navigation in progress (e.g., a guard redirected to login while the user tried to reach a protected URL).** — The unit detects the in-progress navigation via getCurrentNavigation() and does not issue a second navigation to the home page. The user arrives at the URL they originally tried to reach.

### Terminology
- **Sign in** — The action of authenticating with the system using a username and password. Used as both the page heading and the submit button label.
- **Username** — The account identifier used for authentication.
- **Password** — The secret credential used for authentication.
- **Remember me** — A user preference that, when selected, requests a persistent session across browser restarts. The exact session-duration behavior is delegated to the login service.

> The login screen provides two additional navigation links: 'Did you forget your password?' (destination: /account/reset/request) and 'Register a new account' (destination: /account/register). These are static links — this unit plays no role in those flows beyond providing the links. The registration link is preceded by the prompt text "You don't have an account yet?" — visitors who do not yet have an account are directed to register rather than attempting to sign in. (`login.component.html:54–55`)
<!-- c2d:end section="10-domain" -->

## 11. Review

<!-- c2d:begin section="11-review" hash="dd30ab28" -->
**Status:** pending

### Open Questions
- **q:1** *(blocking)* What does LoginService.login() do internally on success? Specifically: does it set authentication tokens, update AccountService, or trigger other shared-state changes? A rebuild must replicate these side effects exactly for the post-login authentication state to be correct.
- **q:2** *(blocking)* What kind of observable does AccountService.identity() return? If it emits multiple values (e.g., a BehaviorSubject that never completes), the ngOnInit subscription will run its callback on every emission — potentially triggering repeated redirects. If it completes after one emission the subscription is self-contained. A rebuild cannot safely resolve the subscription-leak risk without this answer.
- **q:3** Is the Validators.required constraint on the rememberMe control intentional? For a boolean FormControl, 'required' passes only when the value is truthy, meaning the form is technically invalid whenever 'Remember me' is unchecked (the default). This would block submission unless the user checks the box — which contradicts the expected behavior of an optional preference.
- **q:4** Does the login form enforce validity before submission? The submit button has no visible disabled binding tied to form validity. If the form can be submitted while invalid (e.g., empty password field), what does the login service do with the empty value?
- **q:5** What is AccountService's injection scope (application-wide singleton, or narrower)? This determines whether authentication state is shared across the whole application or is scoped to a subtree, which affects the coupling analysis.
- **q:6** Is the absence of error handling on the accountService.identity() subscription intentional? If identity() throws, the subscription ends silently and the login form is shown in its default state. Is there a global error handler that catches this instead, or is silent failure the intended behavior?

### Suspected Defects
- **bug:1** *(medium confidence)* The rememberMe control is declared with Validators.required applied (initialValueExpression: new FormControl(false, { nonNullable: true, validators: [Validators.required] })). For a boolean FormControl, Validators.required passes only when the value is truthy. Since the control defaults to false (unchecked), the form is invalid at rest, which would technically prevent submission unless the user checks 'Remember me'. This appears unintentional for an optional user preference.
<!-- c2d:end section="11-review" -->
