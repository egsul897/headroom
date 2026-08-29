# Phase 3F.1.5 — Evaluation Methodology V2: Independent Semantic Correspondence & Coverage Scoring

**Verdict: `PHASE_3F_1_5_EVALUATION_METHODOLOGY_V2_NEEDS_ITERATION`**

Starting SHA: `18e55bc2c05531867ec6082186278d7b19689d7c` (Phase 3F.1.4 merge). All 15 required machine-readable artifacts live under `docs/evaluation-v2/00-*.json` through `14-*.json`; this document is the narrative report and does not restate their full content.

This phase built a new, independent, evidence-preserving Evaluation Methodology V2 to replace Headroom's known-circular prior scorers. It largely succeeded at its central mission — but one required independent-validation gate was missed, which is why the verdict is `NEEDS_ITERATION` rather than an unqualified pass.

---

## What was built

A complete new evaluator, `lib/contract-model/evaluation-v2/`, judging whether a compiled/discovered candidate representation **semantically corresponds** to a ground-truth legal/economic claim — never crediting a match merely because it is nearby, shares a section number, or coincidentally shares a number. Four layers: deterministic signal extraction (money, ratios, metrics, legal posture, entity scope, and — the one genuinely new dimension the historical scorers had no concept of — **provision-role breadth**, distinguishing a universal restriction from a narrow carve-out beneath it); semantic correspondence across 8 dimensions (subject/action, posture, object, scope, economics, conditions, operative provenance, breadth); explicit contradiction/omission detection (22 conflict codes); and match-cardinality resolution (`EXACT_SINGLE`/`EXACT_COMPOSITE`/`PARTIAL`/`AMBIGUOUS`/`CONTRADICTORY`/`UNREPRESENTED`/`HONESTLY_UNRESOLVED`/`HONESTLY_UNSUPPORTED`). A second gate — `accountingRole === SUBSTANTIVE_REPRESENTATION` — additionally requires that a corresponding candidate actually be a *compiled/verified* representation, not merely a correct-sounding discovery-stage flag; this distinction turns out to matter a great deal (see below).

## What succeeded, convincingly

- **All 10 required false-credit-prohibition tests pass** — chapeau-vs-descendant, same-dollar-sibling-basket, section-number-only matching, permission-vs-restriction, secured-vs-unsecured, dividend-vs-investment, Canadian-vs-US scope, pre-vs-post-amendment text — every one correctly refused.
- **All 14 previously-confirmed false credits from Phase 3F.1.1's forensics are independently caught** — re-judged from scratch (not merely checked against the known list), zero remain silently credited. This was the single mandatory gate this whole phase exists to satisfy, and it passed cleanly.
- **33/33 adversarial synthetic suite** (21 negative, 12 positive controls) — including genuine positive controls (semantically equivalent drafting with different wording, a preserved greater-of cap, a correctly-represented chapeau) proving the evaluator isn't simply refusing everything.
- **Cross-dataset generalization** (FWRG, LSB, CONMED) ran on the frozen, un-tuned engine with zero package-specific logic — CONMED's near-total zero recall is correctly diagnosed as a genuine finding (its candidate pool is almost entirely uncompiled discovery inventory), not an evaluator bug.
- **Zero production tuning**: the full git diff against baseline touches only `lib/contract-model/evaluation-v2/`, `tests/evaluation-v2/`, and `docs/evaluation-v2/` — independently verified, not merely self-reported.
- **Reproducibility proven**: fresh-run and replay hashes over identical frozen inputs are identical.
- **Ground-truth integrity preserved**: real GT-quality issues were found and classified (`GT_REQUIRES_DOMAIN_REVIEW` on 39 units) without a single edit to any ground-truth file.
- Real production defects were incidentally discovered (a numeric-coincidence circularity in the *production coverage auditor* — a different module than the historical scorer — plus a citation-integrity gap affecting the exact addresses of several known false credits) and correctly **recorded, not fixed**, per this phase's charter.

## What did not succeed: the second-pass agreement gate

The phase requires a genuinely independent, blinded second reviewer to judge a stratified sample of matches, with pre-registered thresholds (≥90% binary agreement, ≥85% detailed-disposition agreement) frozen *before* the review — both adopted verbatim from the phase's own suggested defaults prior to dispatch. A second agent judged all 51 sampled cases from scratch, never shown V2's own labels or any other evaluator artifact.

**Result: 78.4–84.3% binary agreement (depending on how a partial-credit case is bucketed) and 37.3% detailed agreement — both below their thresholds.**

Investigated (not patched, per the phase's explicit no-rewrite-after-seeing-results rule): the disagreement is not the false-credit defect returning. In the dominant direction, V2 withheld credit because the only corresponding candidate was a discovery-stage flag never compiled into IR — a deliberate, disclosed design choice (correspondence without compiled substantiation is "an inventory finding, not a representation") — while the second-pass reviewer, given only a natural-language "does this represent the claim" instruction with no knowledge of that distinction, credited the same correct-sounding text. A second, smaller cluster involves definitional units where V2 granted partial credit for a matching term-definition that was "silent on economics," which the second pass rejected outright; the second-pass agent's own report separately discloses that 15–19 of the 51 packets had a misaligned or entirely absent resolved ground-truth excerpt, an independent confound. Two cases have no identified systematic explanation and are flagged for direct follow-up.

Compounding this: **no live semantic AI judge was ever run** — no model credential was available in this session, so every result is deterministic-only (Layers 1/3/4). The interface, prompt, and caching for Layer 2 are fully built and unit-tested against a scripted responder, but the evaluator's most nuanced layer, the one most likely to resolve exactly this kind of qualitative disagreement, was never actually exercised on real evidence.

## Why `NEEDS_ITERATION` rather than `PASSED`

17 of 18 gate checklist items are satisfied, including every item that speaks to the phase's central mission (false-credit prevention, numeric/qualitative rigor, zero production tuning, reproducibility, GT integrity). Only criterion H — independent second-pass agreement — is not. This phase is explicitly chartered as "primarily a methodology-validity gate," and an independent-validation threshold missed by this margin (especially 37.3% vs. a required 85% on detailed disposition) cannot honestly be rounded up to a pass without repeating exactly the kind of overstatement this whole phase exists to prevent. The disagreement has a real, plausible, and very likely correctable cause — but "likely correctable" is not the same as "corrected and re-verified," and the charter's own rule forbids fixing it now that the results have been seen.

**One important, unrelated finding for the record**: under V2's own honest, non-inflated accounting, DSGR's combined CRITICAL+MATERIAL semantic recall is roughly 0.6%, with 175 dangerous-unaccounted CRITICAL/MATERIAL units — dramatically lower than any historical percentage this codebase has published. Per the phase's own charter, this is a **success of the evaluator** (it is telling the truth instead of granting false credit), not a reason to fail the evaluator, and it is absolutely not evidence that the product is closer to Phase 3F.2 or Phase 4 readiness — if anything, the opposite.

## Next-step recommendation (Section 36)

The phase charter presents a binary choice — (A) residual foundation closure or (B) Foundation Certification. **Neither is appropriate yet.** Given `NEEDS_ITERATION`, the evidence-based recommendation is a **third, narrower option: iterate on Evaluation V2 itself** before either A or B, specifically:

1. Obtain an authorized model credential and run the already-built Layer 2 semantic judge against at least the DSGR dataset and the 51-case stratified sample.
2. Re-run the second-pass adjudication with clarified instructions that explain V2's compiled/verified-substantiation requirement, so the comparison is measuring genuine disagreement rather than an instructional gap.
3. Directly re-examine the two least-explained disagreement cases (`doc-a::X::10.01a-us-guaranty`, `doc-a::X::10.06-reinstatement`).
4. Re-compute the agreement statistics against the same frozen thresholds and re-issue a verdict.

Only after that re-gate passes should the choice between (A) residual foundation closure (P1-10 rank-stack architecture proposal, P1-11 supersession awareness, P1-3 onboarding dedup, remaining no-`documentId` fallback sites, and the newly-discovered coverage-auditor/citation-integrity findings from this phase) and (B) Foundation Certification be made — and that choice should itself be evidence-driven at that time, not assumed now.

## Stop condition

Per the phase charter, this phase stops here. No production semantic defect discovered by V2 was fixed. No rank-stack parser remediation was started. No Foundation Certification was begun. No unseen package was selected. No Phase 4 work began.
