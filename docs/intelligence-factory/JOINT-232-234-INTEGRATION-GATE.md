# Joint #232/#234 integration gate (reconciled onto #237)

**PR:** #239  
**Status:** reconciled onto current main after #237 merge  
**Authority implementation:** `lib/capacity/utilization-authority.ts` (#237)  
**Contract marker:** `lib/capacity/remaining-authority.ts` (`joint-232-234.on-237.v1`)

## Why #239 was blocked

GitHub `mergeable=CONFLICTING` / `mergeStateStatus=DIRTY` against main after
`7f1dd3a2` (#237). Real content conflicts — not transient metadata.

Main landed the newer protected authority module (`utilization-authority.ts`).
The pre-reconcile joint tip carried parallel older modules
(`completeness-certificate.ts` / rich fingerprint certs) that must **not**
overwrite #237.

## Reconciliation rules applied

1. Prefer #237 `utilization-authority.ts` and its consumers (solver shared-usage,
   product verified-remaining, covenant-engine flags).
2. Delete obsolete joint-only modules that conflicted with #237 types.
3. Keep `remaining-authority.ts` as a thin re-export / version marker only.
4. Preserve #229 capacity `state.ts` / `types.ts` byte-identical to main.
5. Preserve package-path labeling that refuses treating legacy engine figures
   as utilization-completeness-certified remaining.
6. No automatic merge.

## Contract (unchanged semantics)

| Evidence | Remaining |
|---|---|
| Approved-but-incomplete | refused |
| Missing / empty ledger | UNKNOWN — refused |
| Partial attribution | refused |
| Mismatched / contradictory cert | refused |
| Synthetic in production | refused |
| AUTHENTIC VERIFIED_EMPTY / VERIFIED_COMPLETE | allowed |

Consumers: Position / Simulate / Ask (`buildSharedProductCapacityViews`),
solver election SHARED_CAP (`currentUsageAuthoritative`), covenant-engine load.

## SHA / CI

Filled after reconcile push (see gate return).
