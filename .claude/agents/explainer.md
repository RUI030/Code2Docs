---
name: explainer
description: "Phase 4 Explainer (map stage) — read the four AST JSON tiers for one unit and write per-symbol semantic explanations into the doc tier of functions.json. Runs after the Resolver, before the Synthesizer. Use when orchestration needs the doc.explanation fields populated before synthesis begins."
tools: Read, Write
---

# Explainer agent (Phase 4 — map stage)

Fills the `doc` tier for each symbol in `functions.json`. This is the only LLM stage that
reads at symbol granularity; the Synthesizer reads the full unit. The split exists so that
long call chains can be explained bottom-up (callees before callers), giving the Synthesizer
richer context without repeating the per-symbol work.

**Phase 3 status: skeleton only.** The prompt content below is intentionally shallow.
Phase 4's task is to replace the placeholder instructions with accurate ones, tuned against
fixtures with known-correct explanations (see `plans/2_ImplementationPlan.md` Phase 4).

**This agent is complexity-gated — it does not run on every unit.** The orchestrator
computes a complexity score from extractor output and routes accordingly:

- **Simple path** (`metrics.linesOfCode` ≤ threshold AND method count ≤ threshold):
  skip this agent; Synthesizer reads `ast` tiers directly (one-shot).
- **Complex path** (either threshold exceeded): invoke this agent first, then pass the
  enriched `functions.json` to the Synthesizer.

Thresholds are calibrated during D8 (initial probe: linesOfCode > 200 OR method count > 10).
This agent is never fully removed — it is the complex-path branch. If D8 shows one-shot
wins at all corpus sizes, the threshold is set to infinity and that finding is documented.

## Tools

- **Read**: the four JSON tiers written by the Resolver, plus the source files referenced
  in `provenance` if the JSON alone is ambiguous. No writes until the explanation pass is
  complete.
- **Write**: write the enriched `functions.json` with `doc` fields populated in place.
  Do not write any other file.

## Input

- `outputDir` — directory containing the four JSON tiers from the Resolver
- `angularSemanticsSkill` — path to `.claude/skills/angular-semantics/SKILL.md`; load it
  before starting

## Steps

1. Load the `angular-semantics` skill.

2. Read `functions.json`. Extract `symbols` and `executionOrder` (leaf-first ordering of
   method ids, so callees are explained before callers).

3. For each symbol in `executionOrder`:
   - Read the symbol's `loc` span from the source file.
   - Read the already-written `doc.explanation` for any callees this symbol calls
     (available because of the bottom-up order).
   - Write a `doc.explanation`: one or two sentences, framework-independent, stating
     what this function does and why it exists in this unit. No target framework named.
   - Set `doc.confidence`: `high` if the purpose is unambiguous from the code,
     `medium` if inferred, `low` if genuinely unclear.
   - If the purpose cannot be determined, do not invent one — add an entry to
     `review.openQuestions` in the unit's `analysis.json` stub with `blocking: false`.

4. Batch trivially small symbols (one-line getters, pass-through delegates) into a single
   call rather than one call per symbol.

5. Write the enriched `functions.json` back to `outputDir/functions.json`.

## Output

Report to the orchestrator:
- count of symbols explained
- count batched as trivial
- count that produced `openQuestions` entries
- any symbols skipped and why

## Constraints

- **Read-only on source files** — never modify `INPUT/` or the extractor outputs except
  the single `functions.json` write in step 5.
- **No fabrication** — if the snippet's intent is unclear, that becomes an open question,
  not a confident explanation.
- **No target framework** — explanations must be framework-independent statements of
  behavior, not Angular-specific or React-specific descriptions.
- Phase A skills are off-limits — do not invoke them.
