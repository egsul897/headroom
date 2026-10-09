# Continuous covenant intelligence — Cycle 4 scorecard

| Field | Value |
|---|---|
| Cycle | 4 |
| Starting SHA | `bae24ced33fdd6963d0615265a1e67cb181233e8` (`origin/main`) |
| Ending SHA | `fc81cb57d1ee078ac34a2e4a34b280db48f17999` |
| Paid inference cost | **$0** |
| Controlling North Star | `docs/headroom-north-star-v2.md` |

## Agreements analyzed

| Package | Provenance | Role |
|---|---|---|
| `pkg-i-secured-debt-lien` | Synthetic acceptance; offline CERTIFY | Stage D development (entity-scope unblock) |

**New authentic packages:** 0. **New complexity:** COUNTERPARTY entity-role + MODEL_DIFFERENT source-derived correction; Stage D debt∩lien enumeration after CERTIFY.

## L1/L2/L3/L4 results

| Level | Case | Outcome |
|---|---|---|
| L1 | §7.01(d) actor/payee roles | COUNTERPARTY vs OBLIGOR correct |
| L2 | Model BORROWER vs Subsidiary-only source | SOURCE_SCOPE_DERIVED (not PARTIAL underinclusive) |
| L4 | Secured dual-path enumeration | **CERTIFIED_4E** (debt + lien CANDIDATE) |
| L4 | Dual-path capacity/sim | **Correct refusal** — CROSS_RULE_GATE |

| Metric | Count |
|---|---|
| Cases attempted | 4 |
| Correct executions (capacity/sim) | 0 |
| Correct refusals | 1 (cross-rule gate) |
| Incorrect answers | 0 |
| Critical false permissions | **0** |

## Actual defects found

1. **Incorrect legal interpretation / source binding:** `"owed to the Borrower"` treated Borrower as OBLIGOR → underinclusive PARTIAL on §7.01(d) → blocked §7.01 candidate CERTIFY (`UNIT_SUFFICIENCY_INCOMPLETE`).
2. **Missing dependency (not fixed this cycle):** §7.02(b) `REQUIRES Section 7.01(b)` → package-level `CROSS_RULE_GATE_NOT_EXECUTABLE` under REQUIRE. Fail-closed preserved.

## Generalizable fixes

| Fix | File |
|---|---|
| `COUNTERPARTY` mention role (`owed/owing/payable/due to X`) | `entity-scope-guard.ts` v5 |
| Filter COUNTERPARTY from binding signals | same |
| `MODEL_DIFFERENT` + `ownDerived` → `SOURCE_SCOPE_DERIVED` (not widen underinclusive) | same |
| IR role type + fidelity version pin | `ir/types.ts`, governing-scope-fidelity |

## Regression and holdout

| Suite | Result |
|---|---|
| `entity-scope-guard.test.ts` (incl. v5) | Pass |
| `governing-scope-fidelity.test.ts` | Pass |
| `stage-d-pkgi-entity-scope.test.ts` | Pass |
| Blind holdout | Not consumed |

## End-to-end execution progress

| Stage | Status |
|---|---|
| B / C | Prior cycles (#205 / #209) |
| D enumeration honesty | Prior cycle (#211) — lien-only INCOMPLETE |
| D debt CERTIFY + dual-path 4E | **Pass** this cycle |
| D capacity/sim secured | **Blocked** — cross-rule gate evaluator |

Customer-grade paths: **0**.

## Remaining functional blockers

1. Certified cross-rule satisfaction evaluator (`PHASE4_CROSS_RULE_GATE_NOT_YET_EXECUTABLE`) — blocks REQUIRE capacity/sim on packages with `REQUIRES` / `referencesRuleTargets` (Stage D positive execution).
2. Authentic CONMED §7.3(m) still PINNED_OFFLINE ≠ CERTIFIED.
3. §9.15 pkg-i still REVIEW_REQUIRED (UNACCOUNTED_MATERIAL_SOURCE / verification).

## PR

| Item | URL |
|---|---|
| This cycle | https://github.com/egsul897/headroom/pull/222 |

## Recommended next cycle

1. Minimal generalizable cross-rule gate discharge for SOURCE_REFERENCE_RESOLVED `REQUIRES` when the referenced debt permission is co-selected / co-certified in the same secured transaction — then Stage D capacity+sim on §7.01(b)∩§7.02(b) with labeled synthetic ledger (empty utilization).
2. Or expand authentic corpus L3/L4 on a new structure while Stage D gate work proceeds.
