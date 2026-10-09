# CONMED authentic product demo workspace

**Company id:** `conmed-demo`  
**Package:** `tests/fixtures/unseen-packages/conmed-2025-credit-facility/`  
**Tenant:** EVALUATION (does not overwrite Coherent/Matthews)

## What works in the app

| Route | Behavior |
|---|---|
| `/` | Select CONMED Corporation under Evaluation companies |
| `/conmed-demo/documents` | Four authentic financing documents + package facts |
| `/conmed-demo/documents/[id]` | Source text (curated excerpt / stored HTML / fixture) |
| `/conmed-demo/covenants` | Article VII explorer with capacity determination labels |
| `/conmed-demo/position` | Honest NOT DETERMINABLE (no fabricated capacity) |
| `/conmed-demo/simulate` | Real engine + banner that results will be not-determinable |
| `/conmed-demo/ledger` | Existing ledger UI (empty — no invented history) |
| `/conmed-demo/evidence` | Unresolved items + source-backed package facts |

## Capacity honesty

No `capacityFormulas`, no default zero usage, no green clearance without financials.
Basket dollar figures appear as **source-backed structure** with `NEEDS_FINANCIAL_INPUTS` / `RATIO_GATED_UNRESOLVED`.

## Setup

```bash
npm run product:setup-conmed-demo
HEADROOM_DEMO_LIVE_WRITE=I_AUTHORIZE_CONMED_DEMO_SETUP npm run product:setup-conmed-demo -- --live
```

Idempotent. Preserves financial snapshots. See `LIVE-WRITE-CHECKPOINT.md`.
