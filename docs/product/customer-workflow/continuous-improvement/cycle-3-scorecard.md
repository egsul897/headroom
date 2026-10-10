# Continuous covenant intelligence — Cycle 3 scorecard

| Field | Value |
|---|---|
| Cycle | 3 |
| Starting SHA | `bae24ced33fdd6963d0615265a1e67cb181233e8` (`origin/main`) |
| Ending SHA | `cc9cbccc9d9a0a83dfec7b4995cb7e4b1f3663db` |
| Paid inference cost | **$0** |
| Controlling North Star | `docs/headroom-north-star-v2.md` |

## Agreements analyzed

| Package | Provenance | Role |
|---|---|---|
| `pkg-i-secured-debt-lien` | Synthetic acceptance; offline CERTIFY | Stage D probe (development) |
| CONMED §7.3(m) stratified pin | Authentic EDGAR pin `PINNED_OFFLINE` only | Not CERTIFIED — not used for execution |

**New authentic packages:** 0. **New complexity:** Stage D dual-path honesty (debt ∩ lien); lien-only false CERTIFIED_4E.

## L1/L2/L3/L4 results

| Level | Case | Outcome |
|---|---|---|
| L2 | Debt∩lien companion requirement | Correct refusal (lien-only / debt-only) |
| L4 | Secured txn path completeness | **Correct refusal** — INCOMPLETE_PACKAGE |

| Metric | Count |
|---|---|
| Cases attempted | 3 (full demo dual-path; debt-only; lien-only pkg-i) |
| Correct executions | 0 (positive Stage D blocked) |
| Correct refusals | 3 |
| Incorrect answers | 0 |
| Critical false permissions | **0** (eliminated lien-only CERTIFIED_4E) |

## Actual defects found

1. **False completeness / false permission risk:** Lien-only DERIVED VEP claimed `SECURED_DEBT` `CERTIFIED_4E` with `path:restriction:*` CANDIDATE rows while incompleteReasons included `NO_MATCHING_PRIMARY_RULES_FOR_SECURED_DEBT`. Secured authority is debt ∩ lien.

2. **Blocker (not fixed — evidence):** pkg-i §7.01(b) CERTIFIED fails offline (`COMPILATION_NOT_COMPLETED`, PARTIAL sibling → `UNIT_SUFFICIENCY_INCOMPLETE`). Positive Stage D execution correctly refused rather than inventing CERTIFIED debt.

## Generalizable fixes

| Fix | File |
|---|---|
| Surface lien companions only when debt primary exists | `verified-path-enumeration.ts` |
| `NO_CERTIFIED_LIEN_COMPANION_FOR_SECURED_DEBT` when debt without lien | same |
| Material incomplete (`NO_MATCHING_PRIMARY*`, lien companion) → `INCOMPLETE_PACKAGE` | same |

## Regression and holdout

| Suite | Result |
|---|---|
| `verified-path-enumeration.test.ts` (5) | Pass |
| `stage-d-pkgi-secured-lien.test.ts` | Pass |
| Blind holdout | Not consumed |

## End-to-end execution progress

| Stage | Status |
|---|---|
| B / C | Prior cycles (#205 / #209) |
| D positive dual-path | **Blocked** — debt primary not CERTIFIED offline |
| D enumeration honesty | **Pass** this cycle |

Customer-grade paths: **0**.

## Remaining functional blockers

1. pkg-i §7.01(b) / §9.15 offline CERTIFY (compilation/verification)
2. Authentic CONMED §7.3(m) still PINNED_OFFLINE ≠ CERTIFIED
3. CROSS_RULE_GATE for §7.2(c)

## PR

| Item | URL |
|---|---|
| This cycle | https://github.com/egsul897/headroom/pull/210 (pending) |

## Recommended next cycle

1. Remediatable offline path to CERTIFY pkg-i §7.01(b) (or another debt+lien package) without inventing authority — then positive Stage D capacity/sim.
2. Or authentic Stage C/E on CONMED with existing CERTIFIED units only.
