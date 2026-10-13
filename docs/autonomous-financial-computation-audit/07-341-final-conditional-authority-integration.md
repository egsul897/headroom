# #341 Final Selective Integration Gate

**Tip SHA:** see branch HEAD after push (authority-only tip on current `main`)  
**Integration target:** `origin/main`  
**PR:** https://github.com/egsul897/headroom/pull/341

## Scope (selective)

**Keep (unique, justified):**
- Live conditional path authority + module-private brand gate
- Fulfillment join (`information-request.ts`) with PATH_IRRELEVANT / SAFE_BOUND
- `FIXED_POINT_ADDBACK_CAP` IR + leverage-ratio denominator policy
- Adversarial conditional-clearance tests

**Removed (competing / redundant vs #345):**
- `lib/product/contractual-leverage/**`
- `ContractualLeveragePanel` + Dashboard leverage wiring
- Parallel NS-4 bind / canonical-integration product path
- Leverage package tests / DB acceptance tied to that path

**Deferred to #338 (not duplicated):**
- Filing-reconstruction evidence / alternate reflow engine / disclaimer package

Dashboard financial metrics remain solely via #345 `loadContractualMetricsForDashboard` (`persist:false`).

## Authority proofs required

Forged `authoritative:true`, matching SHA-256 seals, JSON clones, superseded snapshot identities, and cross-company authority must fail clearance. Brand required at `proveConditionalClearance` and `authorityShowsLeafInactive`.

## Explicit non-goals

No self-merge. No second resolver. No production-authority activation.
