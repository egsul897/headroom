# Agent 4 — Transaction effects and covenant state

**Verdict:** Phase 4D compositional simulation is validated and preserved. A product-layer recipe catalog + sequential runner now compose the twelve business transaction forms into typed effects, demonstrate the incur→dividend→equity→invest→repay chain with independently checked pre/post states, and enforce restore-authority + UNKNOWN utilization honesty without weakening Phase 4D contracts.

**Starting SHA:** `bae24ced33fdd6963d0615265a1e67cb181233e8`  
**Ending SHA:** `62681ea882e676507c08073ab6638eb1081073e4`  
**Cost:** $0.00 (zero paid / model / provider / network inference calls)

## What was inspected

| Layer | Location | Status |
|-------|----------|--------|
| Transaction simulation | `lib/contract-model/runtime/transaction/` | Frozen `transaction-simulation.v1` — pure `simulateTransaction` |
| Capacity graph / state | `lib/contract-model/runtime/capacity/` | `capacity-graph.v1` — remaining = gross − usage; empty ledger = zero unless product affirms UNKNOWN |
| Financial overlays | `transaction/overlay.ts` | Immutable snapshot; explicit CHANGE_METRIC only |
| Ledger store | `capacity/store/write.ts` | Append-only; `DUPLICATE_USAGE_ID` refuses double-post |
| Reclassification | `capacity/reclassification.ts` | Requires encoded `RECLASSIFIABLE_TO` |
| Phase 4D matrix | `tests/.../synthetic-matrix.test.ts` | A–AG already prove ordering, replay, reversal, atomic failure |

## What was built (contracts preserved)

1. **`transaction-effect-recipes.ts`** — maps 12 business types → Phase 4D effect lists. No per-form engines. Labels are display-only for behaviour; restore refused without `contractualAuthorityRef`.
2. **`sequential-transaction-runner.ts`** — chains simulations via proposed state/ledger; hypothetical mode never mutates caller ledger; completed mode posts via append with idempotent refuse.
3. **`utilization-history.ts`** — when utilization is UNKNOWN, empty ledger remaining stays `NOT_DETERMINED`, not full capacity.
4. **`sequential-demo-scenario.ts`** — canonical multi-step demo world + steps.
5. **Tests** — 20 new product tests (recipes + sequential invariants).
6. **Artifacts** — `02-sequential-demo-run.json` from `scripts/run-sequential-transaction-demo.ts`.

## Canonical sequence (independently checked)

| Step | Type | Debt rem. | RP rem. | Invest rem. | Independent match |
|------|------|-----------|---------|-------------|-------------------|
| 1 | Debt incurrence $100 | 500→400 | 200 | 150 | yes |
| 2 | Dividend $40 | 400 | 200→160 | 150 | yes |
| 3 | Equity contribution $75 | 400 | 160 | 150 | yes |
| 4 | Restricted investment $50 | 400 | 160 | 150→100 | yes |
| 5 | Debt repayment $100 (authorized) | 400→500 | 160 | 100 | yes |

Each step’s `preStateHash` equals the prior `postStateHash`. Hypothetical run leaves the original ledger array untouched (`commitPlan.executed` always false).

## Invariant checks

| Invariant | Result |
|-----------|--------|
| Ordering (non-commutative) | Pass (release/draw) |
| Idempotent replay | Pass (identical simulationIds) |
| Reversal / supersession | Pass (history preserved) |
| Atomic failure | Pass (over-draw → null postState) |
| Hypothetical ≠ actual ledger | Pass |
| Completed not posted twice | Pass (`DUPLICATE_USAGE_ID`) |
| Missing utilization → UNKNOWN | Pass (product honestRemaining) |
| No restore without authority | Pass (recipe gate) |

## Defects

See [`01-defects.json`](01-defects.json). Open items TE-D1–D3/D5 are honesty / chaining / amendment boundaries; TE-D4 mitigated in product layer; TE-D6 corpus gap inherited from Phase 4D.
