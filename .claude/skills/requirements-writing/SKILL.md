---
name: requirements-writing
description: How to write a framework-independent requirement document for an Angular unit - phrasing behavioral statements, evidence discipline, raising open questions instead of guessing, and filling each section of templates/requirement.md. Load when producing requirement.md or analysis.json for a component.
---

# Writing requirements

Produce `requirement.md` for one Angular unit: a description of **existing behavior**,
precise enough that someone can rebuild the unit in another framework without behavior
changing, and readable by a domain expert who does not know Angular.

Pair with `angular-semantics` (what the constructs mean) and `migration-risk-flagging`
(hazards, which go to `migration_notes.md`, not here).

The section outline lives in `templates/requirement.md`. Read it and fill it; do not restate
it here — two copies of the outline would drift.

## The three rules

### 1. Describe behavior, not mechanism

State what an observer — a user, or a calling component — can see. The Angular construct that
implements it is *evidence*, cited, not the statement itself.

- Write: "The delete button appears only for users holding ROLE_ADMIN."
- Not: "`*ngIf="hasRole('ROLE_ADMIN')"` wraps the delete button."

Test each sentence: would it still be true and meaningful if the same product were built in a
completely different technology? If not, it is mechanism.

### 2. Never name a target framework

No React, hooks, components, state libraries, or architectural recommendations. Not even as an
aside. This document must stay valid if the migration target changes, and must be reviewable
by people who know the business and not the technology. Target-framework material belongs in
`migration_notes.md`.

Angular names are permitted only inside evidence citations and where a behavior genuinely has
no framework-neutral phrasing — in which case explain the behavior first, then name the
construct in parentheses.

### 3. Cite evidence for every claim

Each statement traces to `file:line` (or a symbol id, once the tooling exists). A claim you
cannot cite is a claim you inferred — either find its source or convert it to an open
question. Unciteable prose is what makes a document unreviewable, and reviewability is the
entire point of this artifact.

## Raise an open question instead of guessing

This is the highest-value behavior in the whole skill. A stated uncertainty helps a reviewer.
A confident wrong claim survives review and becomes a defect in the rebuild.

Raise one when:

- Behavior depends on a service, library, or backend whose internals you cannot see.
- A conditional's business meaning is unclear even though its mechanics are plain — you can
  see *when* it fires but not *why it should*.
- Error or empty-state paths are not handled and you cannot tell whether that is intentional.
- Two readings of the code are equally plausible.
- The code appears to contain a bug. Record it under suspected defects — do **not** silently
  document the buggy behavior as if intended, and do not document the behavior you assume was
  intended. Describe what it actually does, then flag it.

Mark a question `blocking: true` when a rebuild cannot proceed correctly without the answer.

## Granularity

One statement, one independently checkable fact. "The form validates input and saves the
record" is two requirements wearing one sentence — split it.

Aim for statements a reviewer can mark correct or incorrect without re-reading the code.
Trivial helpers do not need their own requirement; fold them into the behavior they serve.

## Section notes

Most sections are self-explanatory from the template. These four have rules that are easy to
get wrong.

**§2 State & Data Flow.** Classify by *ownership*, not by mechanism: data from the parent,
state this unit owns, values derived from other state, form state, and state that lives
elsewhere and is merely observed. For anything asynchronous, state what triggers it, what the
user sees while it is pending, and what happens when it fails. Missing loading and error
states are the most commonly omitted behaviors in this document.

**§5 vs §6.** §5 is an *inventory* — which services and packages are used, and for what. §6 is
the **shared-state contract** — which service state outlives this unit, which of it this unit
mutates, and who else is coupled through it. Keep them distinct; the overlap is easy to fall
into.

**§6 Service Layer, partial by nature.** At component scope you can see what *this* unit reads
and writes, but not who else touches the same state — that needs the repository-wide index.
Record what you can see, set `consumersKnown: false`, and raise an open question for the rest.
**Do not infer other consumers.** An under-determined section is exactly where fabricated
coupling claims appear, and coupling claims are load-bearing for a rebuild.

**§7 Acceptance Criteria.** Derive from the `.spec.ts` test titles first — those are
pre-written behavior statements from the original authors and the closest thing to ground truth
available. Then add criteria for behavior the tests miss, marking which existing test covers
each (or none). Given/When/Then, one observable outcome each.

**§8 Domain Business Rules.** For a business reviewer: constraints, edge cases, terminology,
formulas. No implementation detail whatsoever. Distinguish rules you can *see enforced* in
code from rules you are *inferring* from naming or structure, and mark confidence on the
latter. Do not invent business rationale for a technical constraint — if a field is limited to
50 characters and nothing says why, record the limit, not a theory about it.

## When writing to analysis.json

Store **finished prose**, not notes or fragments. `requirement.md` is rendered mechanically
from these fields, so whatever you write is what a reviewer reads. Every entry carries
`evidence` ids, and dangling evidence is a hard failure.

## Before finishing

- Every method and template behavior is either described or deliberately folded into another
  statement — nothing silently dropped.
- Every statement is behavior, not mechanism, and cites evidence.
- No target framework named anywhere.
- Loading, empty, and error states covered for each async path.
- Uncertainties are open questions rather than confident prose.
- Every `.spec.ts` test title corresponds to something in the document. **A test title with no
  matching requirement is a confirmed omission** — this is the primary scoring check, so
  running it yourself before finishing is free accuracy.
