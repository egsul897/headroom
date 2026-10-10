# Agent 2 — Financial Engine Integration Gate

**PR:** https://github.com/egsul897/headroom/pull/220  
**Integration candidate SHA:** `40873fc16860579545e094acbd8b9975cfe5730e`  
**Cost:** $0

---

## 1. SHA reconciliation

| Reported / role | SHA | Present on remote tip ancestry? |
|---|---|---|
| Prior report tip (docs align) | `9634651d` | Yes — ancestor of tip |
| 32-test feature commit | `a029a08d` | Yes — introduces approval bridge / sequential / capacity view + tests |
| Certified-path §17 fix | `2ceb5e48` | Yes — prior tip before this gate |
| **Integration candidate (this gate)** | tip after gate commits | See git tip |

`9634651d` is **not** the head of PR #220; it is a docs-only ancestor. The suite that first contained the 32 passing FCE tests is `a029a08d`. Subsequent tip `2ceb5e48` added the §17 import fix. This gate adds authority / utilization honesty / verified-path / Matthews addback label fix on top.

---

## 2. Matthews authentic source verification

| Item | Provenance | Extracted |
|---|---|---|
| Accession | `0000063296-25-000006` (10-Q 2024-12-31) | as-of `2024-12-31` |
| Consolidated EBITDA | Indenture §1.01 TTM build-up **128.313** | **128.313** |
| GAAP EBITDA | Op. profit + D&A **77.675** | **77.675** (distinct) |
| D&A addback | 93.751 | 93.751 |
| Goodwill write-downs | 16.727 | 16.727 |
| Asset write-downs | 16.847 | 16.847 |
| SBC addback | 18.806 | 18.806 |
| Total / secured debt / cash | 809.211 / 778.882 / 33.513 | match |
| Pro forma synergies (no $) | present | `PRO_FORMA_ACQUISITION` + amount missing |

Sources: `scripts/populate-matthews-financial-provenance.ts`, `docs/matthews-international-onboarding.md`.  
**Authority:** `AUTHENTIC_SOURCE_DERIVED` — not a reviewer APPROVED snapshot.

Gate fix: addback label parser no longer collapses `Plus add-back:` to label `"add"`.

---

## 3. Authority classification

| Kind | Examples | Real reviewer approval? |
|---|---|---|
| `AUTHENTIC_SOURCE_DERIVED` | Matthews Q1 FY2025 fixtures | No |
| `SEED_ALIGNED_MODELED` | Coherent FY2026 / Q1 FY2027 seed figures | No |
| `SYNTHETIC_CALCULATION_TEST` | Synthetic calc fixtures | No |
| `TEST_ATTRIBUTED_APPROVAL` | CI `reviewedBy: fce-*@example.com` | **No** |
| `REAL_REVIEWER_APPROVED` | productionContext + non-test reviewer | Yes only |

`classifyApprovedSnapshotAuthority` refuses to upgrade test-attributed APPROVED rows.

---

## 4. Independent cash / debt effects

Verified against financial-core `runScenario` with independent expected deltas:

| Action | Cash Δ | Debt Δ |
|---|---|---|
| DEBT_ISSUANCE | +amount | +amount |
| DIVIDEND | −amount | 0 |
| DEBT_REPAYMENT | −amount | −amount |
| Equity contribution (WORKING_CAPITAL_CHANGE + equity proceeds bump) | +amount | 0 |

---

## 5. Sequential post-state (txn2 ← txn1 complete)

Two layers (coordinated, not competing):

1. **Financial-core** (`sequential-financial.ts`): txn2 ratios use txn1 pro forma debt/cash.
2. **Verified-execution** (`verified-path.ts` → `evaluateVerifiedCapacity` / `simulateVerifiedTransaction`): txn2 ledger includes txn1 proposed usages; capacity independently re-evaluated on post-ledger. `sequentialPostStateConsumed === true`.

Agent 4 TE-D3 (#223) owns IR overlay chaining (`sequential-execution.ts`); FCE consumes the verified boundary only (no raw `runtime/*` imports).

---

## 6. Remaining capacity honesty (coord #234)

`publishRemainingCapacity`: approved financials + even attributed rows **without** a completeness certificate → `GROSS_ONLY`, `supportsRemainingClaim: false`. Remaining published only with `VERIFIED_COMPLETE` / `VERIFIED_EMPTY`.

---

## 7. Canonical verified-execution boundary

- `verified-path.ts` imports only `verified-execution` + `north-star-bridge`.
- §17 bypass test green (no `contract-model/runtime` imports under FCE).
- Architecture / certified suites unchanged and green.

---

## 8. Peer coordination

| PR | Role | Coordination |
|---|---|---|
| #223 | TE-D3 sequential IR | FCE financial-core chain + verified-path ledger chaining; IR overlay composition remains #223 |
| #234 | Utilization / verified remaining | FCE `utilization-honesty.ts` mirrors completeness-certificate contract |
| #232 | Neon activation / utilization integrity | Same fail-closed remaining posture; no production Neon writes from this gate |

---

## 9. Regressions on integration candidate

| Suite | Result |
|---|---|
| `tsc --noEmit` (FCE clean) | Pass |
| `npm run test:phase3-certification` | **481 passed** |
| `tests/financial-certificate-engine/*` | **39 passed** |
| `tests/contract-model/runtime/capacity/*` + adversarial + verified-execution | **250 passed** (combined with FCE in one run) |
| Cost | **$0** |

---

## 10. Remaining blockers (honest)

1. **#223 not merged into #220** — full TE-D3 overlay composition (`chainFinancialViewWithScope`) lives on Agent 4’s branch; FCE demonstrates verified-boundary sequential ledger+capacity without vendoring that exclusive tree.
2. **#234 `lib/capacity/*` not on #220** — FCE mirrors the remaining-claim contract locally; production should converge on #234’s resolver at merge.
3. **Legacy leaf `evaluateProvision`** still used for Agent-3-aligned Neon provision gross diagnostics (`authentic-capacity-bridge`); Phase-4 product path is `verified-path` / verified-execution only.
4. **No automatic merge** — gate evidence complete; human merge approval still required.
5. **No production Neon writes / no approval bypasses** in this work.

**Success criterion:** Independently evidenced financial inputs produce defensible covenant calculations and remain correct across sequential transactions through the canonical verified-execution pathway — **demonstrated on this candidate**, with peer merge blockers listed above.
