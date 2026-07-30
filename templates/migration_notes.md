<!-- code2docs:unit id="component:<path>:<ClassName>" schemaVersion="0.2.0" -->
<!--
  GENERATED VIEW, rendered deterministically from analysis.json#/migration.
  Same edit-preservation rules as requirement.md: editing inside a c2d block flips that
  section to human-owned and it will not be overwritten.

  This file exists so requirement.md can stay framework-neutral. Everything that mentions
  the TARGET framework belongs here; everything describing EXISTING behavior belongs in
  requirement.md. Keeping them apart means requirement.md survives a change of target and
  stays readable by domain experts.

  This is advisory input to Stage 2, not a specification. Stage 2 owns the final
  architecture; this document only flags what the Angular original assumed.
-->

# Migration Notes: [Component Name]

<!-- c2d:begin section="risks" source="analysis.json#/migration/risks" hash="<sha256>" -->
## 1. Migration-Sensitive Behavior

Angular-specific behavior that will not carry over verbatim. Each entry names the assumption at risk and the observable behavior that could silently change.

| Severity | Category | Behavior at risk | Source |
|---|---|---|---|
| [high\|medium\|low] | [rxjs-pipeline, lifecycle-ordering, ...] | [what could silently change] | [file:line] |

### Detail
- **[risk id] — [category] ([severity])**
  - *What Angular does:* [the framework-specific behavior]
  - *What could break:* [the observable consequence if reimplemented naively]
  - *Evidence:* [symbol / template node ids]
<!-- c2d:end section="risks" -->

<!-- c2d:begin section="decomposition" source="analysis.json#/migration/suggestedDecomposition" hash="<sha256>" -->
## 2. Suggested Functional Breakdown

Present only when the original component carries multiple separable responsibilities. These are observations about the existing code's seams, not a prescribed target architecture.

- **[proposed unit name]** — [rationale]
  - *Covers:* [members that would move]
<!-- c2d:end section="decomposition" -->

<!-- c2d:begin section="third-party" source="analysis.json#/migration/thirdPartyEquivalence" hash="<sha256>" -->
## 3. Third-Party Dependencies

| Package | Used for | Direct equivalent in target? |
|---|---|---|
| [package] | [purpose] | [yes \| no \| unknown] |
<!-- c2d:end section="third-party" -->

<!-- c2d:begin section="target-suggestions" source="human" hash="<sha256>" human-owned="true" -->
## 4. Target Implementation Suggestions

Architectural recommendations for the target implementation — component splits, custom hooks, state-management choices.

**Human-owned by default.** The pipeline deliberately does not generate this: doing so would let target-framework assumptions leak backward into the behavioral spec, which is the failure mode the requirement/migration split exists to prevent. Fill this in during review, once §1–§3 are understood.
<!-- c2d:end section="target-suggestions" -->
