# Unified Position · Simulate · Ask — status

**Branch:** `cursor/unified-position-simulate-ask-05a7`  
**Reconciled onto:** `origin/main` @ `7f1dd3a2` (includes #237 utilization authority)  
**PR:** https://github.com/egsul897/headroom/pull/213  
**Soft gates:** no paid inference; no invented CERTIFIED; hypothetical sims never post to ledger; no remaining without completeness cert  

## Authority model (post-#237)

| Claim | Required evidence |
|---|---|
| Known attributed used | Exact 4C ledger join (TRACKED) |
| Remaining / AVAILABLE | APPROVED `VERIFIED_COMPLETE` or `VERIFIED_EMPTY` completeness cert |
| Verified transaction | VEP + NS-4 cutoff + ledger + `evaluateVerifiedCapacity` / `simulateVerifiedTransaction` under **REQUIRE** |
| LEGACY slider / Ask legacy | Explicitly labeled `LEGACY_ENGINE` — not legal verification |

Attributed-without-cert → `KNOWN_ATTRIBUTED_ONLY` / remaining **null** (UI: “Not certified complete”).

## Fixture labeling

`secured-borrowing-100m` runs on `synthetic-conmed-form-co` only (`FIXTURE_IR`). Never presented as Coherent permission or customer-certified execution. Demo places it under `fixtureOnlyDemonstrations`, not customer `executableOutcomes`.

## Related PRs

| PR | Status | Role vs #213 |
|---|---|---|
| #237 | **Merged** into main | Utilization remaining authority — #213 rebased onto it |
| #243 | Open (other stack) | Sequential runtime → verified adapter; product unified-position already REQUIRE-only |

## Demo

```bash
npx tsx scripts/product/run-unified-position-demo.ts coherent
```
