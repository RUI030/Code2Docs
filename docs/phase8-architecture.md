# Phase 8 — Architecture Revision

**Date:** 2026-08-02  
**Trigger:** S1/S2/S4 benchmark reveals that the current pipeline degrades prose quality relative
to the direct-LLM baseline (S2). The tools (AST extractors) have genuine value but are being
used in the wrong role.

---

## Diagnosis: why S1 loses to S2

The S1 pipeline places the LLM at the end of a JSON abstraction chain:

```
Source files
  → Resolver  →  signature.json, dependencies.json, template.json, functions.json
  → Explainer →  functions.json (doc tier filled)
  → Synthesizer reads the JSON tiers → writes analysis.json → writes requirement.md
```

Three information losses accumulate across this chain:

**1. Spec file is not in Synthesizer's context.**  
The spec (`*.spec.ts`) is never passed to the Synthesizer. It reads the AST JSON, which
encodes *code behavior*, not *spec phrasing*. As a result, specTitleCoverage is 63% because
the Synthesizer re-derives AC semantics rather than echoing spec language.

**2. JSON field names contaminate prose.**  
`functions.json` field names are Angular API identifiers (`ngOnInit`, `FormGroup`,
`ActivatedRoute`). The Synthesizer reads these and echoes them into prose, causing
frameworkNeutral = false.

**3. The LLM describes the JSON, not the user experience.**  
When the LLM's input is structured JSON, it gravitates toward describing the structure ("a
FormGroup with six controls") rather than describing the user's experience ("a form the user
fills in to create or edit a post"). S2 produces the latter naturally because it reads the raw
source as a developer would.

---

## Proposed architecture: generate-then-validate

The core inversion: **tools validate, LLM generates**.

```
Phase A: GENERATE
  LLM reads source files directly (as S2 does today)
    Input: .ts + .html + .spec.ts
    Output: requirement.md

Phase B: EXTRACT (deterministic, parallel with Phase A)
  AST extractors run on the same source
    Output: template.json, signature.json, dependencies.json, functions.json

Phase C: VALIDATE
  score.mjs reads Phase A output against Phase B ground truth
    Checks: specTitleCoverage, screenLabelCoverage, frameworkNeutral, sectionsPresent
    Output: score.json with a list of specific failures

Phase D: TARGETED FIX (only if Phase C finds failures)
  A token-limited LLM pass receives:
    - The requirement.md from Phase A
    - The exact failing items from score.json (not the full source again)
    - Constraint: touch only the failing items, leave everything else unchanged
    Output: corrected requirement.md
```

Phase D is a narrow patch operation, not a rewrite. It receives `score.json.missingTitles`,
`score.json.missingLabels`, and `score.json.frameworkTermsFound` — concrete strings to add or
remove — rather than a vague "improve the document" instruction. This is what S4 did manually;
Phase D automates it.

---

## What tools are still for

The AST extractors (`resolve.mjs`, `ts-extractor.mjs`, etc.) retain unique value that LLM
direct-read cannot replicate:

| Tool output | Why it can't be replaced by LLM |
|---|---|
| `template.json` / `staticText[]` | LLM may hallucinate or miss labels in large templates; AST is deterministic |
| `dependencies.json` / `httpInteractions[]` | LLM infers from `inject()` calls; extractor reads the AST, no inference |
| `signature.json` / `metrics` (line count, method count) | Exact numbers; LLM estimates |
| `functions.json` / `callGraph` | Reachability facts; LLM must reason, extractor walks |

These outputs feed Phase C (the validator), not Phase A (the generator). The LLM never sees
them as generation input.

---

## score.mjs changes needed for Phase 8

score.mjs is already structured correctly as a validator. Two calibration fixes are needed:

**1. Section schema detection.**  
`REQUIRED_SECTIONS` is hardcoded to Phase A's 9-section IDs. Phase 8 should auto-detect which
schema a given requirement.md uses (S1's 11-section set vs. Phase A's 9-section set) and score
against the detected schema.

```js
// Detect: if document contains "section=\"1-purpose\"" but not "section=\"2-state-and-data-flow\""
// → it's S1 schema, score against S1_REQUIRED_SECTIONS
```

**2. Fix pass instruction output.**  
Add a `fixInstructions` field to `score.json` that Phase D can consume directly:

```json
{
  "fixInstructions": {
    "addSpecTitles": ["Should update editForm", "Should forward to blogService"],
    "removeFrameworkTerms": ["ngOnInit", "FormGroup"],
    "addScreenLabels": ["Save", "Cancel"]
  }
}
```

This makes Phase D a targeted, token-cheap operation rather than a general re-read.

---

## Expected outcomes

| Metric | S1 (current) | S2 (baseline) | Phase 8 (projected) |
|---|---|---|---|
| specTitleCoverage | 63% → 100% (S4) | 100% | 100% (Phase A pass) |
| screenLabelCoverage | 100% | null (no template.json) | 100% (Phase C validator) |
| frameworkNeutral | no | yes | yes (Phase A pass) |
| sectionsPresent | 1/9 (schema mismatch) | 9/9 | 9/9 (schema detection fixed) |
| structured invariants | yes (analysis.json) | no | tbd — may move to separate file |
| evidence citations | analysis.json arrays | prose file:line | prose file:line (S2 style) |
| token cost | high (3 LLM passes) | low (1 LLM pass) | medium (1 LLM + 1 fix if needed) |

---

## What this doesn't solve yet

- **Structured invariants and migration risks** — analysis.json provided machine-readable
  invariants and migration risks. Phase A (S2-style) embeds these in prose, not structured JSON.
  If downstream tooling needs structured invariants, either: (a) add a lightweight extraction
  pass that reads the generated requirement.md and parses the invariants section back into JSON,
  or (b) keep analysis.json as a separate Phase B output that the LLM does not read.

- **Blocking question tracking** — currently only S1 emits structured `openQuestions[]` in
  analysis.json, which score.mjs counts. Phase A buries these in a prose section. Either add a
  parser or accept that open-question counts are S1-only metrics.

---

## Next experiments before committing

Before rebuilding the pipeline, run S3 (Opus direct, no tools). If Opus in Phase A mode can
cover the structured-invariant and migration-risk sections that Sonnet missed in S2, the case
for keeping analysis.json weakens further. S3 is the missing data point.
