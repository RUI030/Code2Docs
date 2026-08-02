---
name: code2docs-analyze
description: "Run the Code2Docs Phase A analysis on one Angular component - read its source and produce requirement.md, migration_notes.md, and hand-filled baseline JSON into OUTPUT/. Use when the user says '/code2docs-analyze', 'analyze this component', 'generate requirement doc', 'document this Angular component', or names a component folder to document."
---

# Analyze one Angular component (Phase A)

Workflow entry point. Takes a component folder and produces its documentation set. This is the
Phase A path: **no AST tooling** — read the source directly with Read/Grep/Glob.

Load `angular-semantics`, `requirements-writing`, and `migration-risk-flagging` before
starting. This skill is the procedure; those carry the knowledge.

## Input

A component folder path, usually under `INPUT/`. If the user did not give one, ask — do not
guess which component to analyze.

## Steps

1. **Inventory the folder.** List every file and classify it: logic (`.ts`), template
   (`.html`), styles, tests (`.spec.ts`). Note anything unexpected.

2. **Read all of it, completely.** Every file, start to finish, before writing anything.
   Partial reads are the direct cause of the omission problem this project exists to solve.
   For a large component, read in sections but cover all of it.

3. **Enumerate before describing.** Build an explicit checklist from the source: every method,
   every template binding, every conditional, every loop, every event handler, every
   subscription, every injected dependency. This list is your completeness contract — you will
   verify against it at the end. Write it down; do not hold it in your head.

4. **Extract the spec test titles.** Every `it(...)` and `describe(...)` string from the
   `.spec.ts` files. These are behavior statements written by the original authors and are the
   closest thing to ground truth available. Read them before forming conclusions — they
   routinely correct a plausible-but-wrong reading of the logic.

5. **Derive the call graph by hand.** Which methods call which, within the file. Order them
   leaf-first (methods calling nothing local come first). Record it even though it is
   approximate — Phase A's derived facts are illustrative, and this becomes the baseline that
   Phase 1's extractor is measured against.

6. **Write the documents**, following `requirements-writing`:
   - `requirement.md` from `templates/requirement.md`. Read the template in full first.
     Preserve every `<!-- c2d:begin section="<id>" source="hand-written" -->` /
     `<!-- c2d:end section="<id>" -->` marker pair exactly as they appear in the template.
     All 9 sections must be present. The opening HTML comment must carry
     `schemaVersion="0.4.0"`. Do not add a `hash` attribute — leave it absent.
   - `migration_notes.md` from `templates/migration_notes.md`, following
     `migration-risk-flagging`
   - `signature.json` and the `callGraph` portion of `dependencies.json`, following
     `templates/schema/signature.schema.json` and
     `templates/schema/dependencies.schema.json`. The schemas carry both the shape and
     the reasoning; for a worked example of any tier, read a golden under `fixtures/`.

7a. **Format check — before the self-check.** Count the `c2d:begin` and `c2d:end` tags in
    the `requirement.md` you just wrote. There must be exactly 9 of each, with section IDs:
    `1-purpose`, `2-state-and-data-flow`, `3-ui-and-rendering`, `4-public-interface`,
    `5-dependencies`, `6-service-layer`, `7-acceptance-criteria`, `8-domain-business-rules`,
    `review-gate`. A missing section is an error — write the missing section now, wrapped in
    its markers, before proceeding to step 7.

7. **Self-check before declaring done.** Non-negotiable:
   - Every item on the step-3 checklist appears somewhere in `requirement.md`, or is
     deliberately folded into another statement. Anything neither described nor folded is an
     omission — fix it.
   - Every spec test title from step 4 corresponds to something in the document. A test title
     with no matching requirement is a **confirmed omission**.
   - No target framework named anywhere in `requirement.md`.
   - Every claim cites `file:line`.
   - Uncertainties are open questions, not confident prose.

8. **Report honestly.** State what you could not determine, how many checklist items and spec
   titles were covered, and where the analysis is weakest. Do not close with a clean summary
   that overstates confidence.

## Output location

`OUTPUT/<mirrored source path>/<component>/`, mirroring the input tree so the output location
is derivable from the source location. `OUTPUT/` is gitignored scratch space.

**Never write to `examples/`.** That tree is the tracked record of runs worth keeping — in
particular the hand-derived `signature.json` and `callGraph`, the baseline Phase 1's extractor
gets diffed against to measure how much recall the tooling actually bought. Promotion is a
manual step the user performs; an agent overwriting a promoted baseline destroys the
measurement. Write to `OUTPUT/` and stop there.

## Constraints

- **No AST or compiler tooling.** Phase A deliberately tests what direct reading achieves, so
  that Phase 1's extractor can be measured against it.
- **Derived facts are approximations.** Call graph, field read/write sets, and ordering are
  unverified at this stage. Never present them as authoritative.
- **Nothing describes the migration target.** Behavior only in `requirement.md`; hazards
  without prescribed fixes in `migration_notes.md`.
- **Do not stop early on a large component.** Size is the condition under which one-shot
  analysis is expected to degrade, and observing that honestly is a Phase A result, not a
  failure to hide.
