<!-- code2docs:unit id="component:<path>:<ClassName>" schemaVersion="0.2.0" -->
<!--
  GENERATED VIEW. This file is rendered deterministically from analysis.json (plus the
  ast tiers it cites) by the requirement renderer. Do not hand-edit machine-owned
  regions expecting them to survive — instead:

    - Editing text inside a c2d:begin/end block flips that section to human-owned. The
      renderer detects this via the section hash and will never overwrite it again; it
      writes the fresh machine version alongside as a diff for you to accept or reject.
    - Section 7 (Domain Business Rules) is expected to be human-owned. It is where an SME
      records intent no extractor can recover.
    - `hash` is of the analysis.json content the section was rendered from. Mismatch on
      re-render means either the source data changed or a human edited the prose.

  Section numbering note: "React Refactor Suggestions" has moved to migration_notes.md so
  that this document stays a framework-neutral behavioral spec — reviewable by domain
  experts who do not know the target framework, and still valid if the target changes.
-->

# Component: [Component Name]

<!-- c2d:begin section="1-purpose" source="analysis.json#/purpose" hash="<sha256>" -->
## 1. Component Purpose (Business Logic)
[A concise summary of the component's primary business objective and core responsibilities.]

**Responsibilities**
- [One distinct responsibility per bullet.]
<!-- c2d:end section="1-purpose" -->

<!-- c2d:begin section="2-state-and-data-flow" source="analysis.json#/stateModel" hash="<sha256>" -->
## 2. State & Data Flow
- **Props & Events (External):** [Data passed in from the parent component and callback events emitted upwards.]
- **Local State (Internal):** [State maintained internally by the component, such as form inputs or loading status.]
- **Derived State:** [Values computed from other state, and the rule that computes them.]
- **Form State:** [What the form captures and the validation rules that govern it.]
- **Global State & Subscriptions:** [Dependencies on global stores, API polling, or active RxJS data stream subscriptions.]
- **Lifecycle:** [What happens on initialization, on input change, and on teardown — including any ordering that must be preserved.]
<!-- c2d:end section="2-state-and-data-flow" -->

<!-- c2d:begin section="3-ui-and-rendering" source="template.json#/uiRequirements" hash="<sha256>" -->
## 3. UI & Rendering Logic
- **Structure:** [A high-level description of the DOM structure and layout.]
- **Conditional Rendering:** [Logic for showing/hiding elements, stated without reference to the directive that implemented it.]
- **Loops:** [List or array iterations, including identity/tracking semantics.]
- **Interactions:** [User interactions such as button clicks, form submissions, and input bindings.]
- **Loading & Error States:** [What the user sees while data is in flight and when it fails.]
- **Accessibility & i18n:** [Roles, labels, and translated strings that must be preserved.]
<!-- c2d:end section="3-ui-and-rendering" -->

<!-- c2d:begin section="4-public-interface" source="analysis.json#/publicContract" hash="<sha256>" -->
## 4. Public Interface (ADT)
[Core public methods and their Abstract Data Types. Focus on what each method is supposed to do for the developer — its contract, preconditions, and postconditions — ignoring minor internal helpers.]

| Member | Signature | Contract |
|---|---|---|
| [name] | [name(param: Type): ReturnType] | [what it guarantees] |

**Consumed by:** [Parent units that render or call this one.]
<!-- c2d:end section="4-public-interface" -->

<!-- c2d:begin section="5-dependencies" source="analysis.json#/externalIntegrations" hash="<sha256>" -->
## 5. Dependencies & External Integrations
- **Services/APIs:** [Backend services, API calls, or data mutations the component relies on, and what each is used for.]
- **Utils/Packages:** [Third-party packages or shared utility functions used.]

*Full dependency detail, including the same-file function call graph, is in `dependencies.json`.*
<!-- c2d:end section="5-dependencies" -->

<!-- c2d:begin section="6-acceptance-criteria" source="analysis.json#/acceptanceCriteria" hash="<sha256>" -->
## 6. Acceptance Criteria (AC)
Testable conditions that must be met for this component to be considered complete. Formatted in BDD (Given/When/Then) to assist the Testing Agent. The structured form lives in `analysis.json#/acceptanceCriteria` for direct machine consumption.

- **Scenario 1: [Scenario Name]**
  - **Given** [Initial context or state]
  - **When** [Action performed by user or system]
  - **Then** [Expected observable outcome]
  - *Covered by existing test:* [spec case, or "none"]
<!-- c2d:end section="6-acceptance-criteria" -->

<!-- c2d:begin section="7-domain-business-rules" source="analysis.json#/domainRules" hash="<sha256>" human-owned="false" -->
## 7. Domain Business Rules (For SME Review)
Human-readable business constraints, domain logic, edge cases, and terminology. This section focuses entirely on the "WHAT" and "WHY" from a business perspective, devoid of implementation details.

- **Business Constraints:** [Hard rules the business dictates]
- **Edge Cases & Error Handling:** [What happens when things go wrong operationally]
- **Domain Terminology/Formulas:** [Definitions of specific business terms or calculations]
<!-- c2d:end section="7-domain-business-rules" -->

---

<!-- c2d:begin section="review-gate" source="analysis.json#/review" hash="<sha256>" -->
## Review Gate

**Status:** [pending | approved | changes-requested]

Stage 2 (implementation) must not begin until status is `approved` and no blocking question remains open.

**Open Questions**
- [ ] [What the pipeline could not determine — blocking questions marked.]

**Suspected Defects in Existing Code**
- [Apparent bug, with confidence and source location.]

**Confidence:** [high | medium | low] — [symbols explained / total; template nodes covered / total]

*Migration hazards for this component are recorded separately in `migration_notes.md`.*
<!-- c2d:end section="review-gate" -->
