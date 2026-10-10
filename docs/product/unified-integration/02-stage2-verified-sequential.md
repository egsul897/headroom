# Stage 2 — Certified Execution & Transaction Effects

**Integration PR branch:** `cursor/unified-product-integration-f673`  
**Base:** `main` @ `7f1dd3a202b026b9a862ef727480a1a9f284523a`  
**Merged tip:** `#243` @ `04677a62d3da30ef3db2ff7b5809470ca97544e0` (includes `#223` @ `c28f8b6b…`)

## Conflicts / resolutions

| File | Resolution |
|------|------------|
| `capacity/types.ts` | Unchanged — **byte-identical to main (#229)** |
| `capacity/state.ts` | Auto-merged: kept main #229 floors + #243 shared-cap `unitId`/`unitIdentity` overlay |
| `lib/capacity/*` | **Untouched** (#237 utilization authority preserved) |
| `verified-execution.ts` | Took #243 (restore authority + type re-exports + financial chaining helpers) |

No production Neon writes. No paid inference.

## Preserved contracts

- `evaluateVerifiedCapacity` / `simulateVerifiedTransaction`
- `VERIFIED_EXECUTION_POLICY = "REQUIRE"`
- Architecture allowlist: only `verified-execution.ts` imports runtime execution surfaces
- Restore refuses `UNAUTHORIZED_CAPACITY_RESTORE`
- #229 `statusForAmount` / GATE_NOT_SATISFIED → NOT_SATISFIED / provisional withholding
- #237 utilization completeness (no edits under `lib/capacity/`)

## Call graph (product → verified)

```
product north-star sequential-transaction-runner (re-export)
  → lib/contract-model/sequential-execution.ts
      → evaluateVerifiedCapacity / simulateVerifiedTransaction
          → VERIFIED_EXECUTION_POLICY = REQUIRE
          → assertRestoreAuthority
          → buildCapacityGraph + evaluateCapacityState (gated)
          → simulateTransaction (internal to verified boundary)
```

## Local verification (this tip)

| Suite | Result |
|-------|--------|
| `tsc --noEmit` | pass |
| architecture + verified-execution | pass |
| A8 gate-status regression | 13/13 |
| sequential-verified-boundary-gate | 12/12 |
| sequential-state-correctness | 10/10 |
| sequential-transaction-effects | 11/11 |
| transaction-effect-recipes | 9/9 |

Consecutive-transaction chaining (financial overlay + ledger + capacity recompute under REQUIRE) is covered by sequential-state-correctness and sequential-transaction-effects.

## Not in this PR

- #220 financial certificate engine (Stage 3)
- #218 / #233 cross-document + entity-scope (Stage 4)
- #213 Position/Simulate/Ask product surface (Stage 5)
