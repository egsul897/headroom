# CONMED demo — live Neon write checkpoint

**Status:** LIVE WRITE EXECUTED (product sprint — distinct `conmed-demo` only)  
**Company id:** `conmed-demo` (EVALUATION tenant)  
**Does not touch:** `coherent`, `matthews`, or other existing companies  
**Post-write counts:** companies 5→6; financialSnapshots unchanged at 3  

## What live setup writes

1. Upsert `Company` row `conmed-demo` (CNMD / 0000816956), `ACTIVE_WITH_LIMITATIONS`
2. Upsert 4 `Document` rows with authentic fixture HTML stored via local DocumentStorageProvider + provenance notes
3. **No** `capacityFormulas` — capacity remains NOT DETERMINABLE
4. **No** fabricated ledger / financial snapshots / zero utilization

## Authorize

```bash
# Dry-run first
npm run product:setup-conmed-demo

# After explicit approval:
HEADROOM_DEMO_LIVE_WRITE=I_AUTHORIZE_CONMED_DEMO_SETUP npm run product:setup-conmed-demo -- --live
```

## Preserve

Pre-check: companies and financialSnapshots counts must not decrease. Demo only adds one evaluation company + four documents.
