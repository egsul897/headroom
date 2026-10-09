# Required return — Agent 4 transaction effects

## Working sequential demonstration

Artifact: `docs/product/transaction-effects/02-sequential-demo-run.json`  
Script: `npx tsx scripts/run-sequential-transaction-demo.ts`  
Tests: `tests/product/sequential-transaction-effects.test.ts` (11), `tests/product/transaction-effect-recipes.test.ts` (9) — **20/20 pass**.

Sequence: incur debt → dividend → equity contribution → investment → repay debt.  
Mode: `HYPOTHETICAL`. `originalLedgerUntouched: true`. `abortedAtStepId: null`.

## Independently checked pre/post states

Every step records `preState` / `postState` capacity views and re-runs `evaluateCapacityState` on the advanced ledger (`independentPostMatchesSimulation: true` for all five steps). Pre/post hashes chain.

| Step | Pre debt rem | Post debt rem | Notes |
|------|--------------|---------------|-------|
| 1-debt-incurrence | 500 | 400 | +proposed `tx-1-incur::e-incur` |
| 2-dividend | 400 | 400 | RP 200→160 |
| 3-equity-contribution | 400 | 400 | metrics only (overlay on immutable snapshot) |
| 4-restricted-investment | 400 | 400 | invest 150→100 |
| 5-debt-repayment | 400 | 500 | authorized restore of incur usage |

## Per-transaction determination (recipe surface)

For each of the 12 types, recipes produce: identity, entities, contractual pathway, financial CHANGE_METRIC list, basket consumption, basket restoration (authority-gated), shared-capacity ids, selected path, provenance, approval status. Amendments fail closed (`AMENDMENT_REQUIRES_NEW_CAPACITY_GRAPH`).

## Defects

`01-defects.json` — TE-D1…TE-D6.

## Cost

**$0.00** — zero paid inference.

## SHA

- Base: `bae24ced33fdd6963d0615265a1e67cb181233e8`
- Tip: `62681ea882e676507c08073ab6638eb1081073e4`
