# North Star product connect — status

**Branch tip (this work):** `cursor/database-legal-intelligence-0e3f`  
**PR #188 tip (product integration):** `6ffb1b10` — CI green, MERGEABLE, **not merged**  
**PR #189 tip (NS stores):** `5a0a47ca` — stacked on #188  
**Controlling doc:** `docs/headroom-north-star-v2.md`

## What landed on this tip

| Workstream | Status |
|---|---|
| NS-4 Prisma snapshot store | Present (event log + materialization); fact locators now carried from certificate page/section/table/row via note encoding |
| Certificate propose → approve | Product UI + actions; synthetic CONMED-form fixture |
| Basket → 4C ledger | On attributable approval, schedule lines promoted to `PrismaContractLedgerStore` (same `approvalRef`) |
| NS-6 cutoff | Fail-closed; Ask requires explicit `YYYY-MM-DD` |
| `snapshotInputResolver` | Exported on `north-star-bridge` for product |
| Ask → certified attempt | Calls `attemptCertifiedTransaction`; fail-closed without `VerifiedExecutionPackage` |
| Phase 4E | Not started as certified engine; Intelligence remains `LEGACY_ENGINE_MULTIPATH` / `NOT_CERTIFIED_4E` |
| Phase 3 gate | Still `PHASE_3F_1_6_FINAL_FOUNDATION_CERTIFICATION_FAILED` — blocks honest customer VerifiedExecutionPackage |

## Authority labels (preserved)

- Legacy multipath: `NOT_CERTIFIED_4E` / `LEGACY_ENGINE_MULTIPATH`
- Certified path: only via `verified-execution` REQUIRE + cutoff-bound APPROVED snapshot + attributed ledger
- MERGEABLE ≠ merged

## Remaining blockers

1. Phase 3 stratified certification / VerifiedExecutionPackage for customer (CONMED) IR  
2. Neutral Phase 4E enumeration (blocked by Phase 3)  
3. IR-owned selector text (product still uses named selector enum)  
4. Authentic completed customer certificates (synthetic fixtures only)  
5. Merge authorization for #188 / stacked NS PRs  
