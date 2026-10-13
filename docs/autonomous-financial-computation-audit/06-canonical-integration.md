# #341 — Conditional authority on current main (selective)

**Baseline:** current `origin/main` only.  
**Do not** reintroduce a parallel contractual-leverage Dashboard engine.

## Unique keep
- `FIXED_POINT_ADDBACK_CAP` IR + exact closed-form runtime
- Manifest → fulfillment join (`information-request.ts`)
- Live PATH_IRRELEVANT re-evaluation + module-private brand gate
- Non-positive denominator leverage boundary (`leverage-ratio.ts`)

## Removed competing surfaces
Contractual-leverage product package, `ContractualLeveragePanel`, and Dashboard
leverage props were stripped so #345 `contractual-metrics` remains the sole
Dashboard contractual-metric resolver.

## #338
Do not port #338’s evidence/reflow/EBITDA engine here. #338 lands separately.

## Preserved
PAI / PRODUCTION_AUTHORITATIVE / #334 NS-4 band / #345 metrics / #332 delivery
cutoff. No production-authority activation. No self-merge.
