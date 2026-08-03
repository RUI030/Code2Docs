<!-- code2docs:unit id="component:entities/post/update:PostUpdateComponent" schemaVersion="0.4.0" -->
# Migration Notes: PostUpdateComponent

<!-- c2d:begin section="migration" hash="7d527842" -->
## Dead Code
Three methods — byteSize, openFile, and setFileData — are unreachable from any template event binding or internal call chain. They appear to implement a file-attachment feature (displaying byte sizes, opening files for preview, loading a file into a form field with error notification via EventManager) that is not currently connected to the template. Their exclusive dependencies, DataUtils and EventManager, are also unused by any live code path.

- Methods: method:byteSize, method:openFile, method:setFileData
- Dependencies: dep:dataUtils, dep:eventManager

*Verified: yes*

## Migration Risks

> **This list is a lower bound.** Pattern-matching against source; recall is unproven.

| Severity | Category | Behavior at risk |
|---|---|---|
| high | `forms-semantics` | Error messages that currently appear only after a user touches a field would appear immediately on screen load, making the form feel broken from the start. |
| high | `forms-semantics` | The rebuilt form may accept an invalid date format, omit a required validator, or display validation errors at wrong times. |
| medium | `subscription-leak` | If the subscription is not torn down, a navigated-away component may still react to future route data changes, causing state mutations on a component that is no longer visible. |
| medium | `direct-dom-access` | In environments without a populated browser history (direct URL entry, server-side rendering, certain test harnesses), the back navigation may fail silently or navigate to an unexpected destination outside the application. |
| medium | `routing` | A user navigating from editing post A directly to editing post B (without the component being destroyed) would see post A's data in the form. |
| medium | `template-directive` | Replacing [hidden] with conditional removal (or @if with hiding) changes whether the error element retains its state when toggled, which may affect animations, focus management, or screen-reader announcements. |
| low | `template-directive` | Any in-option DOM state (focus, scroll position within a long list) is lost when the option list is refreshed, rather than being preserved for the matching item. |

### Detail (high-severity)
#### forms-semantics — Validation error messages use dirty/touched gating: they appear only when a field is invalid AND (dirty OR touched). The exact interaction-timing rule must be preserved in a rebuild. Loss of this gating causes error messages to appear immediately on page load rather than only after user interaction.
*Behavior at risk:* Error messages that currently appear only after a user touches a field would appear immediately on screen load, making the form feel broken from the start.

#### forms-semantics — The form group structure, all validators (including the custom datetimelocal validator), and the resetForm behavior are defined inside PostFormService, which is not visible in this tier. A rebuild that incorrectly infers these rules may silently accept data the original rejects or vice versa.
*Behavior at risk:* The rebuilt form may accept an invalid date format, omit a required validator, or display validation errors at wrong times.
<!-- c2d:end section="migration" -->
