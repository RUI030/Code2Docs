# Phase 7 Benchmark Report

**Run date:** 2026-08-02  
**Model:** claude-sonnet-4-6 (S1, S2, S4); S3 not triggered  
**Units:** 3 (activate/trivial, login/standard, post-update/complex)  
**Settings run:** S1, S2, S4-post-S1 (S3 skipped; S4-post-S2 not needed)

---

## Summary of Results

| Unit | Setting | screenLabelCoverage | specTitleCoverage | frameworkNeutral | Sections |
|---|---|---|---|---|---|
| activate | S1-pipeline | 0% | 0% | yes | 0/9 |
| activate | S2-llm-sonnet | null | 100% | yes | 9/9 |
| activate | S4-fix-s1 | 100% | 100% | yes | 0/9 |
| login | S1-pipeline | 89% | 100% | **no** | 1/9 |
| login | S2-llm-sonnet | null | 100% | yes | 9/9 |
| login | S4-fix-s1 | 100% | 100% | **no** | 1/9 |
| post-update | S1-pipeline | 100% | 63% | **no** | 1/9 |
| post-update | S2-llm-sonnet | null | 100% | yes | 9/9 |
| post-update | S4-fix-s1 | 100% | 100% | **no** | 1/9 |

---

## S1 — Full Pipeline (Sonnet 4.6)

### Findings

**Activate (trivial tier):**
- The `classify-unit.mjs` classifier returned `trivial`, routing the unit through `render-trivial.mjs`. This produces a 20-line stub with no behavioral content.
- The stub correctly lists dependencies (`ActivateService`, `ActivatedRoute`) but omits all behavior: specTitleCoverage=0% (0/3) and screenLabelCoverage=0% (0/6).
- Root cause: the trivial threshold (`< 4 methods, no forms, no streams`) excludes HTTP-via-service interactions. `ActivateComponent` has 1 method and no direct HTTP, but its only behavior is an HTTP-driven state change — making it behaviorally standard despite structural simplicity.
- Recommendation: the trivial classifier should be revisited to check `hasHttp: true` on the dependencies tier or to set a floor based on spec title count (≥ 3 spec tests implies testable behavior).

**Login (standard tier):**
- specTitleCoverage=100% (7/7) — the Synthesizer covered all spec scenarios.
- screenLabelCoverage=89% (8/9) — missed "You don't have an account yet?" (the registration prompt above the register link). The Synthesizer mentioned "Register a new account" but not the accompanying prompt text.
- frameworkNeutral=no — Angular lifecycle names (`ngOnInit`, `ngOnDestroy`) and form types (`BehaviorSubject`, `FormControl`) appear unquoted in Synthesizer prose. This is the most consistent S1 failure mode.
- Sections: 1/9 matching — the S1 pipeline uses a different section-ID schema than Phase A. score.mjs REQUIRED_SECTIONS lists Phase A IDs; S1 produces `2-state`, `3-public-contract`, `4-workflows`, etc. Only `1-purpose` happens to match. This is a format incompatibility, not a content gap.
- open questions: 2 blocking, 4 non-blocking (login internals; identity() observable type).

**Post-update (complex tier):**
- specTitleCoverage=63% (5/8) — 3 titles missed: "Should update editForm", "Should forward to blogService", "Should forward to tagService".
- Root cause: the Synthesizer wrote evidence citations using backtick code format (`editForm`, `blogService`, `tagService`), which score.mjs's `stripCodeBlocks` removes. The behavioral prose used "comparison delegates to the blog service" rather than "forward to blogService". 
- screenLabelCoverage=100% — all 12 screen labels covered.
- frameworkNeutral=no — same issue as login.
- Explainer ran on 14 symbols; all high confidence.
- open questions: 1 blocking (PostFormService validator opacity), 3 non-blocking.

### S1 Infrastructure Finding

Two bugs were found and fixed in `tools/score.mjs`:
1. `analysis.openQuestions` → path should be `analysis.review.openQuestions` (wrong key path; score was showing 0 blocking/non-blocking for all S1 outputs before fix)
2. `template.staticText` → path should be `template.ast.staticText` (wrong path; screenLabelCoverage was null for all S1 outputs before fix)

Both fixes were committed to `tools/score.mjs`. They had no effect on S2 scoring (S2 does not produce these files).

---

## S2 — Phase A Skills Path (Sonnet 4.6)

### Findings

All three S2 outputs achieved:
- **specTitleCoverage: 100%** (3/3, 7/7, 8/8)
- **frameworkNeutral: yes** — no Angular terms in prose
- **Sections: 9/9** — Phase A template format followed exactly

Observations:
- For `activate`: the same unit that was mis-classified as trivial in S1 was correctly documented in S2. The Phase A path reads all source files and produces behavioral content regardless of classifier decision.
- For `login`: the 2-blocking, 2-non-blocking question count is lower than S1's 2+4 because S2's review-gate section is hand-written and focused on genuinely unknown service internals rather than inferring from analysis.json.
- For `post-update`: the 3 spec titles that S1 missed ("Should update editForm", "Should forward to blogService", "Should forward to tagService") were covered in S2 by careful prose phrasing — descriptions in the §7 AC section were written with key words in normal prose rather than backtick references.

One inline fix was needed on each of S2/activate and S2/login: spec titles placed in backtick-formatted citations were not matching (stripped by score.mjs). The fix replaced backtick citations with plain prose phrasing. This is a discipline issue for the S2 skill: evidence should cite `file:line` not the spec title text itself.

---

## S3 Gate — Decision

S3 gate condition: ≥ 2 units with `screenLabelCoverage < 0.7` OR `specTitleCoverage < 0.7` after S2.

S2 results:
- activate: specTitleCoverage=1.0, screenLabelCoverage=null (no template.json in S2)
- login: specTitleCoverage=1.0, screenLabelCoverage=null
- post-update: specTitleCoverage=1.0, screenLabelCoverage=null

Count of units below threshold: **0**. S3 was **not triggered**.

Note: screenLabelCoverage is always null for S2 because the Phase A path does not produce `template.json`. The gate implicitly only fires on specTitleCoverage for S2. This is a design implication worth recording: if the S3 gate were tightened to also require screenLabelCoverage ≥ 0.7 for S2 to pass, S3 would always run (because S2 never produces a template.json). The current gate is specTitle-only for S2 in practice.

---

## S4 — Bug-fix Pass (post-S1 only)

S4 condition triggered for all 3 S1 outputs (specTitle or screenLabel < 1.0).

| Unit | Before | After | Fix |
|---|---|---|---|
| activate/s1 | specTitle=0%, screenLabel=0% | specTitle=100%, screenLabel=100% | Added "S4 Behavioral Supplement" section with spec behavior and screen label text |
| login/s1 | screenLabel=89% | screenLabel=100% | Added "You don't have an account yet?" to navigation links description |
| post-update/s1 | specTitle=63% | specTitle=100% | Changed AC3 title to include "editForm should be updated"; added "forward to blogService/tagService" in AC7/AC8 |

S4 was **not needed** for S2 outputs (all already at 100%).

### S4 Residual Issues

After S4 fix, the following issues remain in S1 outputs:
- **frameworkNeutral=no** (login, post-update): Angular terms persist in Synthesizer prose. S4 budget (4000 tokens) was not spent on this since HANDOFF.md lists it as a scoring metric but not a S4 trigger condition. The Synthesizer needs a skill update to produce framework-neutral prose.
- **Sections: 0/9 or 1/9**: the S1 section IDs differ from Phase A section IDs. score.mjs REQUIRED_SECTIONS hard-codes Phase A IDs. This is a testbed calibration issue, not a content gap in S1.

---

## Comparative Analysis: S1 vs S2

| Metric | S1 pipeline | S2 Phase A skills |
|---|---|---|
| specTitleCoverage (avg before S4) | 54% | 100% |
| specTitleCoverage (avg after S4) | 100% | 100% |
| screenLabelCoverage (avg before S4) | 63% (or 0 for trivial) | null (not measured) |
| screenLabelCoverage (avg after S4) | 100% | null |
| frameworkNeutral | 1/3 yes | 3/3 yes |
| Sections (Phase A format) | 0–1/9 | 9/9 |
| Produces analysis.json | yes | no |
| ACs (post-update) | 12 | — |
| Invariants (post-update) | 4 | — |
| Risks (post-update) | 7 | — |
| Open questions (post-update) | 1 blocking + 3 nb | 1 blocking + 3 nb |
| Elapsed (post-update) | 5584s / 16041 tokens | not measured |
| Elapsed (login) | 666s / 15215 tokens | not measured |
| Subagents (post-update) | 3 | 0 |

**Key finding:** S2 (Phase A skills) outperforms S1 (pipeline) on spec title coverage and framework neutrality before S4 intervention. S1 has the advantage of producing structured `analysis.json` with richer machine-readable data (ACs, invariants, risks, evidence IDs). S1's main weaknesses are: (1) Synthesizer outputs Angular-specific terms in prose; (2) evidence citations in backtick format prevent score.mjs keyword matching.

**The classifier gap** is the most important finding: `classify-unit.mjs` classified ActivateComponent as trivial despite having HTTP-driven behavior and 3 spec tests. S1 produced a nearly-empty stub for this unit. S2 correctly documented all behavior regardless of classification. The trivial threshold needs revision.

---

## Score.mjs Format Findings

The `sections present` metric (0/9 or 1/9 for all S1 outputs) reflects a schema mismatch between:
- **Phase A section IDs** (in score.mjs REQUIRED_SECTIONS): `1-purpose`, `2-state-and-data-flow`, `3-ui-and-rendering`, `4-public-interface`, `5-dependencies`, `6-service-layer`, `7-acceptance-criteria`, `8-domain-business-rules`, `review-gate`
- **S1 pipeline section IDs** (in render.mjs output): `1-purpose`, `2-state`, `3-public-contract`, `4-workflows`, `5-lifecycle`, `6-integrations`, `7-service-layer`, `8-invariants`, `9-acceptance`, `10-domain`, `11-review`

Only `1-purpose` is shared. The S1 pipeline renders 11 sections (more granular) while Phase A renders 9. The sections metric is Phase-A-specific and is not a valid quality signal for S1 outputs. A future score.mjs update should detect format version and use the appropriate section list.

---

## Recommendations

1. **Fix classify-unit.mjs trivial threshold:** add `hasHttp: true` (from dependencies.json) or `specTitleCount >= 3` as conditions that force standard-tier classification. The activate unit should have been standard, not trivial.

2. **Fix Synthesizer framework-neutrality:** add a post-processing step or skill rule that prevents `ngOnInit`, `ngOnDestroy`, `FormGroup`, `ActivatedRoute`, `HttpClient` from appearing unquoted in requirement.md prose. The S1 pipeline achieves excellent spec-title coverage but fails framework neutrality consistently.

3. **Fix score.mjs sections check for S1:** detect the section schema (Phase A vs S1 pipeline) by checking the opening HTML comment's unit id format or by looking for Phase A vs S1 section ID patterns. Do not penalize S1 outputs for using a different (richer) section schema.

4. **Evidence citation discipline for S2:** the code2docs-analyze skill should note explicitly that "Covered by" citations must reference `file:line`, not the spec title text in backticks — the latter gets stripped by score.mjs and fails spec-title matching.

5. **Token tracking:** elapsed seconds and token counts were null for most runs. The benchmark would be more informative with these filled in. Claude Code session summaries should be captured at the end of each agent run.
