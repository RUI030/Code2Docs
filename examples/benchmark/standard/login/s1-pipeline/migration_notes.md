<!-- code2docs:unit id="component:login:LoginComponent" schemaVersion="0.4.0" -->
# Migration Notes: LoginComponent

<!-- c2d:begin section="migration" hash="4acbabd6" -->
## Migration Risks

> **This list is a lower bound.** Pattern-matching against source; recall is unproven.

| Severity | Category | Behavior at risk |
|---|---|---|
| high | `subscription-leak` | On repeated visits to the login screen, stale subscriptions accumulate. Callbacks from stale subscriptions can trigger unexpected redirects or state updates in whatever screen the user has navigated to. |
| medium | `subscription-leak` | If the user submits the form and then navigates away before the response arrives, the response callback still runs. It may trigger a navigation or flip state in the destination screen. |
| medium | `lifecycle-ordering` | Setting focus too early in the initialization sequence means the username field is not focused on load, degrading keyboard accessibility. |
| medium | `routing` | Without an equivalent mechanism in the target environment, successful login always navigates to the home page and ignores any URL the user was originally trying to reach. The 'return to destination after login' behavior is lost. |

### Detail (high-severity)
#### subscription-leak — ngOnInit subscribes to accountService.identity() using an explicit subscribe() call with no unsubscribe strategy. No ngOnDestroy is implemented. If the source observable does not complete after one emission, the subscription remains active indefinitely after the component is destroyed.
*Behavior at risk:* On repeated visits to the login screen, stale subscriptions accumulate. Callbacks from stale subscriptions can trigger unexpected redirects or state updates in whatever screen the user has navigated to.

> The risk list is a lower bound. HTTP traffic through LoginService and AccountService is not visible from component scope; additional migration risks (session token storage, CSRF handling, cookie management) may exist inside those services.
<!-- c2d:end section="migration" -->
