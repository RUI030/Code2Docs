# Migration Notes — ActivateComponent

> **Scope:** Angular-specific assumptions that a rewrite could silently break.
> This is a lower bound. Analysis covered the component and its direct service; the repository-level index was not available, so risks that arise from cross-unit coupling may be absent.

---

## §1 Angular-specific behaviors relied upon

### 1.1 `mergeMap` — concurrent subscription semantics

**What Angular does here:** `route.queryParams.pipe(mergeMap(params => activateService.get(params.key)))` — if `queryParams` emits more than once while a prior activation request is in flight, `mergeMap` fires a new concurrent request without cancelling the previous one. (`activate.component.ts:22`)

**What could silently break:** A rewrite that uses sequential or cancelling semantics (equivalent to `switchMap`) would drop the first activation request if a second query-param emission arrived in time. Conversely, a rewrite that fires independent parallel requests for each emission (equivalent to `mergeMap`) behaves identically to the original. In practice `queryParams` emits once per navigation to this route, so the distinction rarely matters — but it is not guaranteed.

**Category:** `rxjs-pipeline`
**Severity:** Low

---

### 1.2 Subscription with no explicit teardown

**What Angular does here:** The `subscribe(...)` call in `ngOnInit` holds an open subscription for the lifetime of the stream. Because `activateService.get()` is a one-shot HTTP observable (emits once and completes), the subscription completes naturally after one emission, and `queryParams` typically does not re-emit. In practice the leak is transient. (`activate.component.ts:22–25`)

**What could silently break:** If the component is destroyed before the HTTP response returns (e.g., the user navigates away during a slow request), the subscription still holds a reference. If the framework being migrated to does not safely ignore post-destruction callbacks, the `success.set(true)` or `error.set(true)` calls could fire on a non-existent component, potentially causing errors or incorrect UI state in an enclosing component.

**Category:** `subscription-leak`
**Severity:** Low (HTTP completes after one emission; the leak window is narrow)

---

### 1.3 Signals as public readable state

**What Angular does here:** `error` and `success` are Angular signals exposed as public fields. The spec tests read them directly (`comp.error()`, `comp.success()`). (`activate.component.ts:15–16`; `activate.component.spec.ts:51–52, 61–62`)

**What could silently break:** Frameworks that do not have a direct signal equivalent may use reactive state with different subscription semantics (e.g., refs in Vue, state hooks in React). The read-by-calling convention (`success()`) would need to be adapted. More importantly, the template updates are synchronous and immediate in Angular signals — a rewrite using asynchronous reactive state could introduce a one-tick delay between the callback firing and the display updating.

**Category:** `rxjs-pipeline` (reactive state semantics)
**Severity:** Low

---

### 1.4 i18n via `jhiTranslate` directive

**What Angular does here:** Every visible string in the template is provided via a `jhiTranslate` attribute that maps to a translation key. The rendered text is not the literal HTML content — the directive replaces it at runtime. (`activate.component.html:4, 7, 8, 12`)

**What could silently break:** A rewrite that copies the HTML strings literally will render English hardcoded text and lose the i18n layer. The migration must either preserve `jhiTranslate` semantics or replace it with the target framework's i18n mechanism using the same translation keys.

**Category:** `third-party-dependency`
**Severity:** Medium

---

### 1.5 `@if` destroys and recreates DOM

**What Angular does here:** The `@if (success())` and `@if (error())` blocks destroy and recreate their content each time the condition changes, rather than hiding it. (`activate.component.html:5, 11`)

**What could silently break:** This distinction matters if the alert elements have internal state (focus, scroll position, animation state). For simple text alerts without internal state, this is cosmetically equivalent to hiding. However, a rewrite using CSS visibility or `display:none` would preserve DOM nodes rather than destroy them — the behavior is functionally equivalent here but semantically different, and could matter if the alert content is extended with interactive elements.

**Category:** `template-directive`
**Severity:** Low (no internal state in these alerts)

---

## §2 Dependency-specific risks

| Dependency | Behavioral role | Risk on migration |
|---|---|---|
| `ActivateService.get(key)` | Sends GET to `api/activate?key=<key>` | The endpoint URL is resolved by `ApplicationConfigService`; the rewrite must preserve that indirection or hardcode the correct URL. |
| `SharedModule` | Provides `jhiTranslate` directive | If SharedModule is not present in the rewrite, all translated strings will not render. |
| `RouterModule` / `routerLink` | Provides the `/login` navigation link | Must be replaced with the target framework's navigation mechanism, pointed at the same route. |
| `ActivatedRoute.queryParams` | Provides the activation `key` from the URL | The rewrite must read the query parameter from the URL at initialization time, equivalent to `snapshot.queryParamMap.get('key')` or the observable approach. |

---

## §3 Decomposition note

This component has a single responsibility (activation flow) and three linear steps (read key → call service → show result). No decomposition is warranted.

---

## §4 Target framework guidance

*(Human-owned. Fill in target-framework-specific recommendations here after target selection.)*
