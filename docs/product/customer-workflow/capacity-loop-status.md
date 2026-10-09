# Capacity intelligence loop — status

**Branch:** `cursor/customer-product-workflow-0e3f`  
**Tip:** `afebe592`  
**PR:** https://github.com/egsul897/headroom/pull/187  
**Related:** PR #181 `05ef5d66` (ready / MERGEABLE) on `cursor/covenant-review-capacity-path-0e3f`

## Loop closed (demo company `demo-customer-workflow`)

1. AI summaries → counsel ACCEPT on §7.2 debt basket  
2. `compileAcceptedInterpretation` → MODELED Permissions (DEBT + LIEN, $50M floor)  
3. `syncDocumentCapacityFormulas` → secured MIN(debt∩lien), unsecured SUM(debt)  
4. Financial snapshot → ratios + remaining capacity  
5. `/intelligence` pro forma $100M secured → PF lev 2.86x / 2.02x; basket after $0M; engine remaining $50M  
6. Eight mandate exercises → CONDITIONAL with citations (see `capacity-loop-exercises.json`)

## Commands

```bash
npm run product:customer-workflow-demo
npm run product:capacity-loop-exercises
```

## Limitations (not claimed complete)

- Total-Assets grower formula not fully modeled (missingFields flagged)  
- CoverageDeclaration not auto-created  
- Exercises CONDITIONAL (not SUBSTANTIVE) pending grower / definition inputs  
- Merge and production deployment not claimed  
