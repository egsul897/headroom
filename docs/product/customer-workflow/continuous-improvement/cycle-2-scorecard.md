# Continuous covenant intelligence — Cycle 2 scorecard

| Field | Value |
|---|---|
| Cycle | 2 |
| Starting SHA | `bae24ced33fdd6963d0615265a1e67cb181233e8` (`origin/main`) |
| Ending SHA | `93d83c1aa57964028d69fef777be8a2b70121c79` |
| Paid inference cost | **$0** |
| Controlling North Star | `docs/headroom-north-star-v2.md` |
| Prior cycle | Cycle 1 — Stage D lien-companion fail-closed ([#207](https://github.com/egsul897/headroom/pull/207)); planning map from explore shortlist |

## Authentic / corpus agreements analyzed

| Package | Provenance | Role this cycle |
|---|---|---|
| `pkg-n-clean-ratio` | Synthetic Oakhurst; acceptance expectations hand-authored; DERIVED VEP offline | Development + Stage C e2e (not authentic EDGAR; not blind holdout) |
| `pkg-a-basic-credit-agreement` | Same family; shares PRO_FORMA manner pattern | Regression breadth for discharge fix |

**New packages:** 0 authentic EDGAR. **New complexity:** Stage C ratio-gated unlimited debt + pro-forma manner discharge.

## L1 / L2 / L3 / L4 results

| Level | Case | Outcome |
|---|---|---|
| L1 | §7.01(c) ratio threshold + pro forma phrase extraction (existing VEP) | Correct |
| L2 | Pro-forma manner as sibling of ratio test (not independent unevaluable gate) | **Correct after fix** |
| L3 | Ratio-gated UNLIMITED_CAPACITY | Correct (AVAILABLE at 2.5; GATE_NOT_SATISFIED at 4.0; NEEDS_INPUT if missing) |
| L4 | Integrated Stage C txn (capacity + conditions + simulate) | **SATISFIED** after discharge |

| Metric | Count |
|---|---|
| Cases attempted | 4 (enum / missing / gate-fail / execute) |
| Correct answers / executions | 1 (Stage C SATISFIED) |
| Correct refusals | 2 (NEEDS_INPUT; GATE_NOT_SATISFIED) |
| Incorrect answers | 0 |
| Incorrect refusals | 0 (after fix; was incorrect INDETERMINATE) |
| Critical false permissions | **0** |

## Actual defects found

1. **Incorrect refusal / incomplete coverage:** Expressionless `PRO_FORMA: after giving pro forma effect thereto` condition forced `selectedPathResult=INDETERMINATE` even when sibling ratio condition had `evaluationBasis.proForma=true` and evaluated SATISFIED. Source drafting is one pro-forma ratio test, not two independent gates. Classification: Incorrect refusal → fixed.

## Generalizable fixes

| Fix | File |
|---|---|
| `dischargeRedundantProFormaMannerConditions` — discharge expressionless pro-forma manner when sibling proForma SATISFIED | `lib/contract-model/runtime/transaction/simulate.ts` |

## Regression and holdout

| Suite | Result |
|---|---|
| `tests/product/stage-c-pkgn-ratio-execution.test.ts` | Pass |
| `tests/contract-model/runtime/transaction/real-fixture.test.ts` | Pass (UNSUPPORTED non-pro-forma conditions still keep path non-SATISFIED) |
| Blind holdout | **Not consumed** |

## End-to-end execution progress

| Stage | Status |
|---|---|
| B Greater-of | Prior (#205) — CONMED §7.2(d) |
| C Ratio-dependent | **EXECUTED** this cycle (`pkg-n` §7.01(c), synthetic TNLR) |
| D Debt + lien | Correct refusal on debt-only (#207); positive dual path still open |
| E–H | Pending |

Customer-grade paths verified: **0**.

## Remaining functional blockers

1. Stage C on **authentic** EDGAR ratio basket (pkg-n is synthetic acceptance).
2. Stage D positive path needs certified lien companion.
3. §7.2(c) CROSS_RULE_GATE.
4. Stage H APPROVED certificate snapshots + ledger.

## PR / CI

| Item | URL |
|---|---|
| This cycle | https://github.com/egsul897/headroom/pull/208 (pending create) |

## Recommended next cycle

1. Positive Stage D: offline-certify authentic CONMED §7.3 lien companion + dual-path enum/capacity.
2. Or authentic Stage C on CONMED FinCov / ratio-gated investment with labeled synthetic inputs.
3. Keep CFP=0; no paid inference without authorization.
