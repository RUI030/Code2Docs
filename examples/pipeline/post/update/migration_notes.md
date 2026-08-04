<!-- code2docs:unit id="component:app/entities/post/update:PostUpdateComponent" schemaVersion="0.4.0" -->
# Migration Notes: PostUpdateComponent

<!-- c2d:begin section="migration" hash="c09dc05c" -->
## Dead Code
byteSize, openFile, and setFileData are not referenced from the template and are not called by any method reachable from the template. The two services they use — DataUtils and EventManager — are also unreachable in practice. These three methods appear to be remnants of a file-attachment feature that has been removed from the template without removing the backing code.

- Methods: method:byteSize, method:openFile, method:setFileData
- Dependencies: dep:dataUtils, dep:eventManager

*Verified: yes*

## Migration Risks

> **This list is a lower bound.** Pattern-matching against source; recall is unproven.

| Severity | Category | Behavior at risk |
|---|---|---|
| high | `subscription-leak` | In a long-running session or when the screen is mounted and dismounted multiple times, these subscriptions remain active after the screen closes, accumulating memory and potentially triggering state updates on a component instance that no longer exists in the UI. |
| medium | `direct-dom-access` | In a server-side rendering environment or in tests that do not provide a browser history stack, this call will fail silently or throw. A rebuild must replace this with the target framework's navigation primitive if those environments are in scope. |
| low | `template-directive` | If the server returns option lists in a different order between renders, the option rows will be destroyed and recreated rather than reordered. Any in-row focus state or intermediate interaction will be lost, and the re-render cost is higher than necessary. |

### Detail (high-severity)
#### subscription-leak — Three subscriptions are opened during initialization — one to the route resolver data stream and two to server queries for blog and tag options — none of which have a cleanup strategy. The component implements no teardown hook.
*Behavior at risk:* In a long-running session or when the screen is mounted and dismounted multiple times, these subscriptions remain active after the screen closes, accumulating memory and potentially triggering state updates on a component instance that no longer exists in the UI.
<!-- c2d:end section="migration" -->
