# Phase 3F.1.5.1 — Evaluation Methodology V2: Independent Adjudication Calibration & Live Semantic Validation

**Verdict: `PHASE_3F_1_5_1_EVALUATION_METHODOLOGY_V2_NEEDS_ITERATION`**

Starting SHA: `7304cd24e385bb59528f652a73a7dba0358c751c` (Phase 3F.1.5's final commit). All required machine-readable artifacts live under `docs/evaluation-v2-iteration/00-*.json` through `16-*.json`; this document is the narrative report and does not restate their full content.

This phase's mission was to resolve Phase 3F.1.5's one failed gate — independent second-pass adjudication agreement, which came in at 78.4–84.3% binary (required ≥90%) and 37.3% detailed (required ≥85%) — by *testing*, not assuming, whether either of the two previously-hypothesized confounders (a discovery-vs-representation communication gap, and the absence of a live semantic AI judge) actually explains the disagreement. Both were tested with real evidence. The gate is still missed, but for reasons now well understood rather than merely suspected.

---

## What was done

**Forensic classification of every original disagreement, before touching anything else.** All 32 detailed-disposition disagreements from Phase 3F.1.5's 51-case sample were individually classified against a fixed cause taxonomy. Headline finding: **65.6% (21 of 32) were pure vocabulary mismatches**, not genuine disagreement — V2's `HONESTLY_UNRESOLVED`/`AMBIGUOUS` states had no equivalent in the second pass's coarser rubric.

**A live semantic judge, actually run.** Once a Vercel AI Gateway credential was provided, a real `SemanticJudge` implementation (`lib/contract-model/evaluation-v2/live-judge.ts`, mirroring the codebase's existing extraction-provider transport pattern) was built and run against the frozen 51-case sample: 592 real calls, 0 failures, ~$3.76 total across two runs, well within the $15 authorized budget. Result: only 2 of 51 units' dispositions changed, and **neither overlapped the original disagreement set nor changed a credit outcome**. The "no live judge" confounder does not explain the original disagreement — this is now a tested, closed question, not a hypothesis.

**A real, independently-dispatched second-pass reviewer, using the improved taxonomy.** A fresh agent, given only the frozen protocol and blinded evidence packets (no access to V2's dispositions, the false-credit history, or this conversation), independently judged all 51 cases using V2's own 9-state vocabulary.

**Result: binary agreement 87.5% (42/48, three cases excluded as unresolvable ground truth) — improved from 78.4% but still below 90%. Detailed agreement 18.75% (9/48) — numerically worse than the original 37.3%, for an important and specific reason.**

Giving the reviewer V2's own vocabulary worked exactly as intended: it eliminated the original vocabulary-mismatch artifact. But doing so revealed a *different*, previously invisible disagreement underneath: on 31 of 39 new disagreements (79.5%, all credit-neutral), V2 and the reviewer disagree about *which* safe, no-credit state applies — specifically, V2's own matching logic appears to credit a "flag" or "unresolved" status to candidates a careful reviewer judges plainly unrelated to the claim. This is a real, actionable, newly-surfaced calibration gap in V2 itself, not a measurement artifact.

**Two genuine credit disagreement clusters, both already known, both unchanged (as expected, since no V2 code was touched):**
- The "Acquisition" IR-definition over-match (3 cases) — confirmed stable across both runs.
- The Article X guaranty/reinstatement/defenses-waived candidate-identity issue — **got worse**: a case that was a binary agreement in the original run (`doc-a::X::10.04-defenses-waived`) is now also a disagreement, strengthening the case that something about two specific candidate IDs is being read inconsistently.

**A concrete, demonstrated win on the specific risk that mattered most.** `doc-a::VI::6.10-chapeau` — one of the 14 confirmed historical false credits, which Phase 3F.1.5's *original* second-pass reviewer incorrectly re-credited — was correctly rejected by the *new* reviewer under the new protocol. All 14 known false credits remain correctly rejected on both sides.

**Full regression re-confirmation, throughout.** 10/10 false-credit-prohibition, 34/34 adversarial suite, zero new tsc/eslint errors, and all 19 historical Phase 3F.1.5 artifacts re-verified byte-identical at every checkpoint across the entire phase, including after the live model calls.

## Why `NEEDS_ITERATION`

Both pre-registered thresholds were missed under the frozen formula, computed honestly from a real rerun. Binary agreement (87.5%) is closer than before but still short of 90%. Detailed agreement (18.75%) is far short of 85%, though — critically — 79.5% of that shortfall is a credit-neutral disagreement about *how* to describe a shared "no credit" conclusion, not a disagreement about *whether* to credit something. Per the user's explicit instruction, this result is reported as-is: no V2 code, protocol, sample, or threshold was touched after seeing it, and none will be within this phase.

## What this verdict does not mean

It does not mean the calibration effort produced nothing: binary agreement improved by 9 points, the specific false-credit-reproduction risk is now demonstrably fixed, and the live-judge confounder is conclusively ruled out. It does not mean the product's semantic coverage has changed — DSGR's ~0.6% combined recall and 175 dangerous-unaccounted units stand exactly as Phase 3F.1.5 reported. It does not authorize Phase 3F.1.6, Phase 3F.2, or Phase 4.

## Recommended next step (not undertaken in this phase)

1. Tighten V2's threshold for crediting a "flag" or "unresolved" state to a weakly-corresponding candidate — the dominant, now well-evidenced disagreement cluster.
2. Fix the confirmed "Acquisition" definitional over-match.
3. Directly read the excerpt content of the two specific candidate IDs behind the worsening Article X cluster — zero model cost, highest information value.
4. Re-run this same frozen sample's second-pass adjudication once those are fixed.
5. Only then consider a larger, freshly-drawn sample or a DSGR-wide live-judge run.

## Stop condition

Per the phase charter and the user's explicit instruction, this phase stops here. No production defect was fixed. No V2 matching logic, protocol, sample, or threshold was patched in response to seeing these results. No unseen package was selected. No Phase 3F.1.6, 3F.2, or Phase 4 work began.
