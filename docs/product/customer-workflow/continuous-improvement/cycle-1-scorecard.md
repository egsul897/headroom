# Continuous covenant intelligence — Cycle 1 scorecard

| Field | Value |
|---|---|
| Cycle | 1 |
| Starting SHA | `610e9e2a6465f56416391247703eaf7c8d45516e` (pre-rebase tip of #205) |
| Ending SHA | (see PR tip) |
| Paid inference cost | **$0** |
| Controlling North Star | `docs/headroom-north-star-v2.md` |

## Foundation (pre-cycle)

| Check | Result |
|---|---|
| `origin/main` | `bae24ced` (#204 MERGED) |
| PR #200 | OPEN |
| PR #204 | MERGED |
| PR #205 | OPEN — CI fixed (stale §7.5(j) expectations vs greater-of cleanup); rebased onto main |

## Authentic agreements analyzed

| Package | Provenance | Role this cycle |
|---|---|---|
| CONMED Eighth A&R Credit Agreement (2025) | Authentic SEC / fixture package `conmed-2025-credit-facility`; offline CERTIFIED §7.2(d) | Development + regression (not blind holdout) |
| §7.5(j) frozen live replay | Immutable `docs/phase-3-live-validation/7.5j-end-to-end-certification/` | Regression expectation alignment only |

**New packages this cycle:** 0 (challenged existing authentic CERTIFIED VEP with harder secured question).

**New complexity:** Stage D — secured debt requires independent certified lien companion; debt-only VEP must not yield SECURED_DEBT CANDIDATE.

## L1 / L2 / L3 / L4 results

| Level | Case | Outcome | Notes |
|---|---|---|---|
| L1 | §7.2(d) greater-of extraction (prior) | Correct (regression) | CTA wrap + greater-of legs |
| L2 | Debt vs lien companion relationship for SECURED_DEBT | **Correct refusal after fix** | Was false CANDIDATE |
| L3 | — | Skipped | No new grower/AA/anti-stack probe this cycle |
| L4 | Secured Finance Lease integrated path (debt ∩ lien) | **Correct refusal** | Missing §7.3 companion → INCOMPLETE_PACKAGE |

| Metric | Count |
|---|---|
| Cases attempted | 2 (unsecured execute + secured enumerate) |
| Correct answers / executions | 1 (unsecured Stage B) |
| Incorrect answers | 0 (after fix) |
| Correct refusals | 1 (secured missing lien) |
| Incorrect refusals | 0 |
| Skipped / unsupported | 0 |
| Critical false permissions | **0** (eliminated prior false SECURED_DEBT CANDIDATE) |

## Actual defects found

1. **False permission (product Stage D):** `enumerateCertifiedPaths(SECURED_DEBT)` over a debt-only CERTIFIED VEP (§7.2(d)) returned `CERTIFIED_4E` with path status `CANDIDATE` and empty `companionRestrictions`. Independent reading: Finance Lease Obligations typically create a Lien; CONMED §7.3 must also authorize. Classification: **False permission** (highest severity) → fixed fail-closed.

2. **Stale regression expectation (CI):** §7.5(j) replay expected false `(j)/(x)/(y)` NON_MATERIAL residual after greater-of span fix correctly cleared it. Classification: incomplete coverage of regression expectations (not a legal defect). Fixed in #205.

## Generalizable fixes

| Fix | Scope | Minimal? |
|---|---|---|
| `NO_CERTIFIED_LIEN_COMPANION_FOR_SECURED_DEBT` incomplete reason; SECURED_DEBT/ACQUISITION primary paths → UNSUPPORTED when no CREATE_LIEN/GRANT_COLLATERAL companion; authority → INCOMPLETE_PACKAGE | `verified-path-enumeration.ts` | Yes |
| §7.5(j) replay expectations aligned to greater-of cleanup | `live-7-5j-deterministic-replay.test.ts` | Yes (#205) |

## Regression and holdout

| Corpus | Result |
|---|---|
| `verified-path-enumeration.test.ts` (incl. new debt-only secured case) | Pass |
| `authentic-72d-execution.test.ts` (unsecured execute + secured refuse) | Pass |
| `live-7-5j-deterministic-replay.test.ts` | Pass |
| Blind holdout | **Not consumed** this cycle — no untouched holdout opened for prompting/tuning |

## End-to-end execution progress

| Stage | Status |
|---|---|
| A Fixed-dollar | Not newly advanced |
| B Greater-of | **EXECUTED** (CONMED §7.2(d), synthetic CTA labeled) — regression baseline |
| C Ratio-dependent | Pending |
| D Debt + separate lien | **Correct refusal** on debt-only VEP; positive dual-certified path still needed (§7.3 companion CERTIFIED) |
| E–H | Pending |

Customer-grade paths verified: **0** (synthetic financials only).

## Remaining functional blockers

1. §7.2(c) `CROSS_RULE_GATE_NOT_EXECUTABLE` — no certified cross-rule evaluator; companions FAILED.
2. Stage D **positive** path needs offline CERTIFIED §7.3 lien companion (e.g. §7.3(m) or finance-lease lien exception) without paid inference / FIXTURE_IR.
3. Stage C needs authentic ratio basket CERTIFIED + APPROVED ratio inputs.
4. Customer-grade (Stage H) needs APPROVED certificate-derived snapshots + attributable ledger — not synthetic demos.

## PR / CI

| Item | URL / status |
|---|---|
| #205 authentic §7.2(d) + 7.5j expectation fix | https://github.com/egsul897/headroom/pull/205 |
| This cycle (lien companion fail-closed) | (PR for `cursor/secured-debt-lien-companion-f673`) |

## Recommended next cycle

1. Offline-certify an authentic CONMED §7.3 lien companion (prefer finance-lease / purchase-money or §7.3(m) greater-of) and prove Stage D **positive** dual-path enumeration without inventing authority.
2. Or Stage C: ratio basket on authentic text with labeled synthetic ratio inputs, refuse if comparator/inputs missing.
3. Keep CFP = 0; no paid inference without authorization.
