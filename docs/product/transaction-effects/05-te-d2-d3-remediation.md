# TE-D2 / TE-D3 remediation — sequential financial & covenant state

**PR:** #223 (continued)  
**Cost:** $0.00  
**Phase 4D contracts:** preserved (`simulateTransaction` ungated compositional primitive)

## 1. Root causes

### TE-D3 — financial overlays did not chain
**Cause (product composition, not Phase 4D):** `advanceWorld` forwarded capacity `postState` + proposed ledger but left `inputs` on the immutable approved snapshot. Each subsequent `simulateTransaction` rebuilt its overlay from that stale base, so ratio/builder metrics ignored prior `CHANGE_METRIC` results.

Phase 4D already supports chaining: the next call’s `inputs` may be any `InputResolver`, including one produced by `buildOverlay` over the prior APPLIED results.

### TE-D2 — unauthorized restore reached the engine
**Cause:** Phase 4D correctly restores any existing `usageId` (compositional). Product recipes gated authority, but:
- bare `simulateTransaction` (tests/fixtures) remained open by design;
- `simulateVerifiedTransaction` and the sequential runner called the primitive without a shared authority check;
- PR #223 product files also imported raw `runtime/*`, violating the verified-execution bypass rule.

## 2. Production reachability

| Path | Before | After |
|------|--------|-------|
| `simulateTransaction` (Phase 4D) | Restores without authority | Unchanged (contracts preserved) |
| `simulateVerifiedTransaction` | Restored without authority | **REFUSED** `UNAUTHORIZED_CAPACITY_RESTORE` |
| `runSequentialTransactions` | Restored without authority | **Blocked** before simulate |
| Product recipes | Already refused empty authority | Uses `formatRestoreReason` |

## 3. Corrected behavior

1. **`lib/contract-model/sequential-execution.ts`** — shared boundary: overlay chaining via `chainFinancialViewWithScope` (SET of prior APPLIED results into next base), sequential runner, utilization honesty, demo worlds.
2. **`lib/contract-model/restore-authority.ts`** — `[authority:<ref>]` marker; `assertRestoreAuthority`.
3. Product files re-export the boundary (no raw `runtime/` imports). Architecture EXEMPT updated for the new boundary modules.
4. Existing Phase 4D matrix / adversarial restore tests unchanged (still call the primitive).

## 4. Independently validated sequential examples

### Flat five-step (capacity + chained metrics)
Incur → dividend → equity → invest → repay. All steps `independentPostMatchesSimulation: true`. Financial keys chain (`total-debt`, `builder-available`, …).

### Ratio-gated (independent expectation first)
Established before Headroom:

| Fact | Value |
|------|-------|
| Initial TotalDebt / EBITDA | 300 / 100 → **TNL 3.00** ≤ 3.50 |
| After +100 debt | 400 / 100 → **TNL 4.00** > 3.50 |
| Expected dividend | **refused** |

Headroom result (`04-ratio-gated-sequence.json`):
- Step 1 incur: `SATISFIED`, `financialViewChained=true`, `total-debt` chained
- Step 2 dividend: `NOT_SATISFIED`, `CONDITION_NOT_SATISFIED`, no post-state  
- Simulation status `SIMULATED` (evaluated refusal ≠ missing evidence)

### Equity builder
- Eligible equity (`eligible-equity-proceeds` +80) → builder gross 50→130
- Ineligible metric (`ineligible-equity-proceeds` +80) → builder stays 50

### Shared capacity anti-stacking
Member A draws 70 of pool 120; member B draw 70 → `INSUFFICIENT_CAPACITY`.

## 5–6. Tests

| Suite | Result |
|-------|--------|
| Phase 4D transaction suites | Preserved (call primitive) |
| `verified-execution.test.ts` | 29/29 |
| `transaction-effect-recipes.test.ts` | 9/9 |
| `sequential-transaction-effects.test.ts` | 11/11 |
| `sequential-state-correctness.test.ts` | 10/10 **new** |

## 7–9. Checklist

- [x] Unauthorized restoration blocked at verified + sequential boundaries  
- [x] Financial chaining correctness (resolver + ratio gate)  
- [x] Cross-document / shared-pool anti-stacking on sequential draws  
- [x] Hypothetical never mutates actual ledger  
- [x] No automatic merge; fail-closed gates not weakened  

## 10. SHA / CI / cost

Recorded on PR tip after push. **Cost $0.00.**
