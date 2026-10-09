# Multi-path transaction intelligence — integration status

**Branch:** `cursor/multi-path-transaction-intelligence-0e3f`  
**Base:** PR #187 tip `e7059a2f` (already contains #181–#186 ancestry)

## Integration sequence (safe)

1. **#187** is the product integration tip — ancestors include #181, #182, #184, #185, #186 tips.  
2. This branch extends #187; does not recreate counsel compile, grower formulas, or the exercise loop.  
3. GitHub MERGEABLE ≠ completed product integration — verify demo + multipath reports.

## Delivered here

- GrantType `RESTRICTED_PAYMENT` + `INVESTMENT` (Neon migration applied)
- Counsel compile → RP/Investment Permissions + `Document.rpWaterfall` sync
- `analyzeMultiPathTransaction` — pathways without assumed debt/lien stacking
- `/intelligence` §6 multi-path panel
- Exercises A–F report: `multipath-exercises.json`

## Demo evidence (`demo-customer-workflow`)

- Permissions: DEBT, LIEN, RESTRICTED_PAYMENT, INVESTMENT  
- Engine secured/unsecured remaining: **$84M**  
- Multipath: 61 pathways across A–F; stackingAssumed **false**; partial capacity on general grower basket  

## Not claimed

Merge · production deploy · free stacking of debt baskets · full ratio-debt executable without counsel ratio compile  
