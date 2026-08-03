# Migration Notes — LoginComponent

> **Scope:** Angular-specific assumptions a rewrite could silently break.
> Lower bound — risks arising from cross-unit service coupling may be absent without the repository-level index.

---

## §1 Angular-specific behaviors relied upon

### 1.1 Shared mutable authentication state via AccountService

**What Angular does here:** `AccountService` is `providedIn: 'root'` — a single shared instance for the whole application. `LoginService.login()` calls `accountService.identity(true)` to refresh the identity, updating shared state visible to every component. (`login.service.ts:10,16`)

**What could silently break:** A rewrite that creates a per-screen authentication service instance would not propagate the login event to other parts of the application. Components that read from AccountService to check authentication would not react to the login. Severity is high because the failure is invisible — the UI in the login screen would look correct while other components silently remain in an unauthenticated state.

**Category:** `mutable-service-state`
**Severity:** High

---

### 1.2 Conditional navigation after login — current navigation check

**What Angular does here:** After successful authentication, the component checks `router.getCurrentNavigation()` to decide whether to navigate to the home page. If a navigation is already in progress (e.g., the router is redirecting the user to a cached URL they previously tried to access from localstorage), the home-page navigation is skipped. (`login.component.ts:47–50`)

**What could silently break:** A rewrite that unconditionally navigates to the home page on success would override any in-progress redirect. The user would lose the deep-link recovery behavior. A rewrite that always skips the home-page navigation would leave the user on the login screen if no prior URL was cached.

**Category:** `routing`
**Severity:** High

---

### 1.3 BehaviorSubject / identity observable replay semantics

**What Angular does here:** `AccountService.identity()` is called in `ngOnInit`. The behavior depends on the observable type backing `identity()`. If it is `BehaviorSubject`-backed (replays the current value immediately), the `isAuthenticated()` check fires synchronously on the cached value. If it is a cold observable, it fires after an async round-trip. (`login.component.ts:32–33`)

**What could silently break:** A rewrite that uses a simple async fetch (no replay) would change when the redirect fires — possibly too late, causing a form flash before the redirect. A rewrite that uses synchronous state would fire before any network lookup, always seeing the cached value.

**Category:** `rxjs-pipeline`
**Severity:** Medium

---

### 1.4 Subscription without explicit teardown (ngOnInit)

**What Angular does here:** `accountService.identity().subscribe(...)` in `ngOnInit` has no cleanup — no `takeUntilDestroyed`, no unsubscription in `ngOnDestroy`. The identity observable is expected to complete after a single emission. (`login.component.ts:32–36`)

**What could silently break:** If the component is destroyed before the observable completes (rapid navigation), the subscription may fire on a destroyed component. The router navigation would still be called on a mounted-elsewhere component.

**Category:** `subscription-leak`
**Severity:** Low (expected to complete after one emission)

---

### 1.5 Reactive form — getRawValue() includes disabled controls

**What Angular does here:** `loginForm.getRawValue()` returns values for all controls including disabled ones, unlike `.value` which omits disabled controls. (`login.component.ts:44`)

**What could silently break:** No controls are disabled today, so the behavior is equivalent. If a future change disables a control (e.g., to prevent editing while loading), `getRawValue()` would still send that control's value to the server — potentially a security concern.

**Category:** `forms-semantics`
**Severity:** Low (no practical difference today)

---

### 1.6 Validators.required on a boolean rememberMe control

**What Angular does here:** The `rememberMe` control has `Validators.required` applied. A boolean `false` value satisfies `required`, so this validator never blocks form submission. The form is always valid on the `rememberMe` dimension regardless of whether the box is checked. (`login.component.ts:23`)

**What could silently break:** If the rewrite interprets `required` on a boolean field as "must be checked" and implements it that way, it would introduce a behavior difference — the login form would require checking the box before submitting, which the original does not enforce.

**Category:** `forms-semantics`
**Severity:** Medium

---

### 1.7 AfterViewInit focus — direct DOM access

**What Angular does here:** `ngAfterViewInit` calls `this.username().nativeElement.focus()` to place browser focus in the username input. This is direct DOM manipulation. (`login.component.ts:39–41`)

**What could silently break:** Frameworks that do not expose a direct DOM reference (e.g., virtual DOM frameworks) require an equivalent like `ref.current.focus()`. The timing must be preserved — focus must fire only after the DOM node exists. If placed too early, the call is a no-op. The accessibility behavior (tab order starts at username) must be preserved.

**Category:** `direct-dom-access`
**Severity:** Medium

---

### 1.8 i18n via jhiTranslate directive

**What Angular does here:** All visible strings are provided via `jhiTranslate` attribute-based translation keys. The visible text is not the literal HTML content — the directive replaces it at runtime. (`login.component.html:4,6,12,26,41,45,48,54,55`)

**What could silently break:** A rewrite that copies the literal HTML text loses the translation layer. All translation keys must be preserved and wired to the target framework's i18n mechanism.

**Category:** `third-party-dependency`
**Severity:** Medium

---

## §2 Dependency-specific risks

| Dependency | Behavioral role | Risk on migration |
|---|---|---|
| `LoginService.login()` | Authenticates credentials and refreshes identity | Internals not visible; the rewrite must produce equivalent shared-state side effects (see §1.1) |
| `AccountService.isAuthenticated()` | Synchronous auth check after identity resolution | Must remain synchronous and return current state, not a stale cache |
| `AuthServerProvider` | Handles token storage/retrieval | Not visible from this component; migration must trace this dependency separately |
| `SharedModule` / `jhiTranslate` | i18n for all visible strings | See §1.8 |

---

## §3 Decomposition note

This component has two distinct sub-behaviors:
1. **Authentication guard on init** — checks auth state and redirects (methods: `ngOnInit`)
2. **Credential form** — collects and submits credentials (methods: `login`, `ngAfterViewInit`)

These responsibilities are loosely coupled and could be separated if the target architecture calls for it, but no seam is required by the current structure.

---

## §4 Target framework guidance

*(Human-owned. Fill in target-framework-specific recommendations here after target selection.)*
