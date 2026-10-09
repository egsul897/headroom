# Capacity intelligence loop — status

**Branch:** `cursor/customer-product-workflow-0e3f`  
**Tip:** `391c59fd`  
**PR:** https://github.com/egsul897/headroom/pull/187  
**Related:** PR #181 `05ef5d66` (ready / MERGEABLE) on `cursor/covenant-review-capacity-path-0e3f`

## Loop closed (demo company `demo-customer-workflow`)

1. AI summaries → counsel ACCEPT on §7.2 debt basket  
2. `compileAcceptedInterpretation` → MODELED Permissions (DEBT + LIEN) as `GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS` ($50M / 3% CTA)  
3. `syncDocumentCapacityFormulas` → secured MIN(debt ∩ lien), unsecured SUM(debt)  
4. Financial snapshot + Consolidated Total Assets ($2,800M) → capacity **max(50, 84) = $84M**  
5. `/intelligence` pro forma $100M secured → PF lev 2.86x / 2.02x; basket after $0M; engine remaining **$84M**  
6. Eight mandate exercises → CONDITIONAL with citations (see `capacity-loop-exercises.json`)

## Commands

```bash
npm run product:customer-workflow-demo
npm run product:capacity-loop-exercises
```

## Limitations (not claimed complete)

- CoverageDeclaration not auto-created  
- RP / investment GrantTypes still debt/lien-only on Permission enum  
- Exercises CONDITIONAL when amount exceeds grower capacity or cross-covenant gaps remain  
- Merge and production deployment not claimed  
