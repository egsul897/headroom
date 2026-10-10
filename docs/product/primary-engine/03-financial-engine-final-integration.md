# Agent 2 — Financial Engine Final Integration Gate

**PR:** https://github.com/egsul897/headroom/pull/220  
**Integration candidate SHA (code + suites):** `9c3932987b35643f9c119420ae3c7b83fb015e50`  
**Cost:** $0 (no paid inference; no production Neon writes)

Docs-only commits after the candidate may advance branch HEAD; they do not change engine code or suite evidence.

---

## 1. Exact SHA

| Role | SHA |
|---|---|
| **Integration candidate (this gate)** | `9c3932987b35643f9c119420ae3c7b83fb015e50` |
| #237 utilization authority (main merge) | `7f1dd3a202b026b9a862ef727480a1a9f284523a` |
| #223 TE-D3 tip (ancestor) | `c28f8b6b61af1523c9ee4a8794eed269b3c668ee` |
| #243 sequential verified boundary tip | `55f28272` (merged into tip via `fa477291`) |
| #229 A8 floors | on main / tip ancestry |

---

## 2. Dependency resolution

| PR | Role | Resolution |
|---|---|---|
| **#237** | Canonical utilization authority (`lib/capacity`) | Merged to main at `7f1dd3a2`; ancestor of tip. FCE `utilization-honesty.ts` is a thin adapter over `computeVerifiedRemaining` / `evidenceFromAttributedLedger`. **#234 not recreated.** |
| **#229** | A8 capacity-status floors | On main; preserved via #237 + architecture gates |
| **#223** | TE-D3 financial overlay composition | Tip `c28f8b6b` is a full ancestor; `chainFinancialViewWithScope` / `runSequentialTransactions` exercise overlays with FCE |
| **#243** | Certified sequential-execution boundary | Merged into tip; FCE `verified-path.ts` opens worlds via `openVerifiedSequentialWorld` and runs via `runSequentialTransactions` under **REQUIRE** |

---

## 3. Authority classes (preserved)

| Kind | Confers production approval? |
|---|---|
| `AUTHENTIC_SOURCE_DERIVED` | No |
| `SEED_ALIGNED_MODELED` | No |
| `SYNTHETIC_CALCULATION_TEST` | No |
| `TEST_ATTRIBUTED_APPROVAL` | No |
| `REAL_REVIEWER_APPROVED` | Yes — requires non-test identity **and** `productionContext` **and** `trustedProductionApprovalChannel` |
| `UNAPPROVED_EXTRACTION` | No |

Test emails (`@example.com`, `fce-*`, `ci-*`, generic `*reviewer`) never upgrade to REAL even when both production flags are asserted.

---

## 4. Independent expected values (Matthews)

| Item | Independent source | Extracted |
|---|---|---|
| Accession | `0000063296-25-000006` | match |
| Consolidated EBITDA | **128.313** | **128.313** |
| GAAP EBITDA | **77.675** | **77.675** (distinct) |
| D&A / goodwill / asset WD / SBC | 93.751 / 16.727 / 16.847 / 18.806 | match |
| Pro forma synergies | label present, **no $** | `amountMissing: true` — **not inferred** |
| As-of | `2024-12-31` | reconciliation as-of match |

---

## 5. Cash / debt / sequential financial state

Independent deltas (USD; cash proceeds assumed = principal on issuance):

| Action | Cash Δ | Debt Δ |
|---|---|---|
| DEBT_ISSUANCE | +amount | +amount |
| DIVIDEND | −amount | 0 |
| DEBT_REPAYMENT | −amount | −amount |
| Equity cash contribution | +amount | 0 |

Sequential financial-core chain: txn2 ratios use txn1 pro forma debt/cash.  
Sequential verified path: txn2 ledger includes txn1 proposed usages; TE-D3 overlays and capacity recompute together; `sequentialPostStateConsumed === true`.

---

## 6. Remaining capacity (#237)

- Approved financials alone → **gross** publishable; **remaining refused** (`GROSS_ONLY` / `GROSS_CONTRACTUAL`).
- Attributed rows without completeness certificate → remaining refused.
- Completeness `VERIFIED_COMPLETE` / `VERIFIED_EMPTY` required for `REMAINING_SUPPORTED`.
- Mixed-currency attributed rows → remaining refused.

---

## 7. False-favorable outcomes checked

| Risk | Result |
|---|---|
| Remaining == gross with no utilization completeness | **Blocked** (remaining null) |
| Test email → REAL_REVIEWER_APPROVED | **Blocked** |
| productionContext alone → REAL | **Blocked** |
| Invented pro forma synergy $ into EBITDA | **Blocked** (amountMissing; EBITDA stays 128.313) |
| Empty ledger treated as zero utilization | **Blocked** (UNKNOWN) |
| Sequential step-2 on stale base metrics | **Blocked** (chained pro forma / post-ledger) |

**Incorrect favorable claims in authentic-capacity summary:** 0 (by construction of remaining refusal).

---

## 8. Regressions on integration candidate `9c393298`

| Suite | Result |
|---|---|
| `tests/financial-certificate-engine/*` | **46 passed** |
| `npm run test:phase3-certification` | **481 passed** |
| `tests/capacity` + runtime capacity + verified-execution + sequential + adversarial | **328 passed** |
| FCE / capacity / sequential-execution `tsc` diagnostics | **clean** |
| Full-repo `tsc --noEmit` | Pre-existing `ns4FinancialSync` Prisma client gaps (onboarding; unrelated to FCE) |
| Cost | **$0** |

---

## 9. Remaining blockers

1. **Human merge approval** for PR #220 — do not auto-merge.
2. **#223 / #243** remain open as standalone PRs; their code is already ancestral on this tip for integration purposes.
3. **Legacy `evaluateProvision`** still used in `authentic-capacity-bridge` for Neon provision gross diagnostics; product sequential path is verified-execution only.
4. **Full-repo tsc** still reports pre-existing `ns4FinancialSync` client typing gaps outside this engine.
5. No production Neon mutation and no approval-gate weakening in this work.

**Success:** One integrated financial engine computes and updates covenant-relevant financial state through sequential transactions while preserving verified legal (#243 REQUIRE) and utilization (#237) authority.
