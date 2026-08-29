# Phase 3F.1.5.2 — Evaluation Methodology V2 Targeted Semantic Match Calibration

**Verdict: `PHASE_3F_1_5_2_EVALUATION_METHODOLOGY_V2_NEEDS_ITERATION`**

Starting SHA: `703a2dead3c9a6d4a1e3000719510ed8e8b02c4f` (Phase 3F.1.5.1's completed rerun).
All artifacts: `docs/evaluation-v2-iteration-2/00-freeze-manifest.json` through `17-final-verdict.json`.

## Mission

Perform one bounded remediation of the specific Evaluation V2 defects demonstrated by Phase 3F.1.5.1's frozen rerun (binary agreement 87.5%, required ≥90%; detailed agreement 18.75%, required ≥85%), freeze the revised methodology, and rerun the same pre-registered gate. Not a redesign; not a production Headroom remediation phase.

## What was implemented

1. **`SAFE_SURFACING_REQUIRES_SEMANTIC_CORRESPONDENCE`** (the new invariant this phase exists to add): a stricter object/resource correspondence bar (`SOLE_DIMENSION_OBJECT_THRESHOLD`/`SOLE_DIMENSION_MIN_SHARED_TERMS`, `conflicts.ts`/`semantic-correspondence.ts`) applies when a ground-truth claim's action signal is empty — the scenario where lexical object/resource overlap alone was previously sufficient to grant safe-surfacing or partial credit.
2. A **DEFINITION excerpt-resolution fix** (`source-excerpt.ts`): when none of a defined term's hints can be located in the definitions section, the resolver now returns `UNRESOLVED_DESCRIPTION_ONLY` instead of silently falling through to the section's own (unrelated) start. This is the confirmed, verified fix for the "Acquisition" definitional over-match defect's GT-side excerpt-contamination pathway.
3. `EVALUATION_V2_ALGORITHM_VERSION` bumped v1→v2.
4. A **27-case permanent adversarial suite** (`tests/evaluation-v2/safe-surfacing-calibration.test.ts`) covering all 10 Section 10 definitional-match scenarios and all 16 Section 16 safe-surfacing scenarios. All 95 evaluation-v2 tests pass (67 pre-existing + 28 new).
5. **Forensic reconciliation** of all 31 credit-neutral disagreements from 3F.1.5.1 (27 `FALSE_SAFE_SURFACING`, 4 `VALID_SAFE_SURFACING_WRONG_LABEL`), and a **source-first independent adjudication** of the Article X guaranty/reinstatement cluster (verdict: `B_REVIEWER_CORRECT` on all three cases — the original reviewer was right, V2 was wrong, due to an `EXERCISE_REMEDIES` action-pattern regex overbreadth). Per Section 12's criteria, this cluster's fix was deliberately **not** attempted this phase (broad blast radius across the whole corpus; disclosed as an open risk rather than rushed).

Zero package-specific, term-specific, or production-code changes were introduced anywhere (grep-verified in `05-generalized-remediation-record.json` and `15-diff-classification.json`). All 14 historical false credits remain caught, including the sacred negative control `doc-a::VI::6.10-chapeau`.

## The rerun

The exact same frozen 51-case sample was re-evaluated against the fixed evaluator, live-judge-informed (735 real calls, $2.25, 0 failures), and independently re-adjudicated by a **fresh subagent with zero access to this session's context** — given only the frozen second-pass protocol and blinded evidence packets, explicitly forbidden from reading anything containing V2's own disposition, historical labels, or which cases were previously disputed.

| Metric | 3F.1.5.1 | 3F.1.5.2 | Threshold | Result |
|---|---|---|---|---|
| Binary agreement | 87.5% (42/48) | **90.48%** (38/42) | ≥90% | **PASS** |
| Detailed agreement | 18.75% (9/48) | **11.90%** (5/42) | ≥85% | **FAIL** |

Binary agreement improved and now clears the bar — a genuine, generalized, zero-regression result. **Detailed agreement got worse**, despite the targeted fix, and this is the controlling failure: per Section 28, every pass criterion must hold, and per Sections 21–22 the detailed threshold may never be waived because disagreements are "credit-neutral."

## Why detailed agreement failed: the real root cause

The fix implemented was **necessary but insufficient**. It closed the specific pathway it targeted — confirmed by eliminating the "commitments-and-facility-sizes" false match and by zero test regression — but this rerun's own results surfaced a **different, previously undiagnosed, generalized mechanism** now recorded as Risk R3 in `16-remaining-evaluator-risks.json`:

> When a candidate addresses a **different specific sub-provision within the same covenant section** as the claim (e.g., the claim is Section 6.02(h)'s customs/bankers'-acceptance carve-out; the candidate is Section 6.02(d)'s pre-existing-lien carve-out), the two share enough genuine covenant-family vocabulary to clear the object/resource correspondence bar. The dimension built to prevent "chapeau credited via unrelated descendant" (`H_PROVISION_ROLE_BREADTH`) classifies drafting **shape**, not sub-provision **identity** — two different lettered exceptions under the same chapeau have the same shape. And because the pair resolves deterministically to `CORRESPONDS_PARTIALLY` rather than `INDETERMINATE`, the live semantic judge — which only ever reconsiders `INDETERMINATE` pairs — never gets a chance to catch the error.

This is confirmed concretely: two specific candidate IDs each caused false safe-surfacing credit against **two different, unrelated claims** in this rerun alone, and three of the four cases V2 credited with representation were the already-known, disclosed Article X cluster (independently re-confirmed by this rerun's completely fresh reviewer instance). A fourth, new credit disagreement (`doc-a::I::permitted-supply-chain-financing`) shows the "Acquisition" definition candidate causing a **third, distinct** false match via a pathway this phase's fix did not reach.

A genuinely open question (Risk R5) is also disclosed rather than glossed over: across all 42 comparable cases, the independent reviewer never once used 6 of the 10 available disposition labels — including every "safe surfacing" label. This could reflect a real evaluator gap (supported concretely for at least 6 cases), reviewer severity calibration, or the specific stratified sample's own composition. This phase did not have the scope to distinguish between these explanations, and says so rather than picking one.

## Compliance discipline

- No case was targeted or excluded to influence the agreement number (all diagnostic reading in this report happened *after* the full rerun completed).
- No threshold, sample, protocol, or agreement formula was touched — hash-verified before and after the rerun.
- No second code patch was attempted after seeing these results, even though Risk R3 is well-diagnosed and plausibly fixable — that is explicitly reserved for a separately-chartered future iteration, not decided here.
- Required gates: **95/95** evaluation-v2 tests, **clean** `tsc`, **clean** `eslint`, **clean** `next build`. Full-repo `vitest run` has 55 failing test files, all failing on `PrismaClientInitializationError` (no live Postgres in this environment) — a genuine, pre-existing, disclosed environment limitation, unrelated to this phase's changes and unrelated to the NEEDS_ITERATION verdict (which rests entirely on the DB-independent detailed-agreement computation).

## Next step

Per Sections 29/31/33, this phase does **not** create Phase 3F.1.5.3, does not begin residual foundation work, and does not attempt another tuning pass. The evidence in `16-remaining-evaluator-risks.json` (particularly R3) is offered as a candidate justification should the user choose to authorize a further bounded evaluator iteration — that decision belongs to the user.

**STOP.**
