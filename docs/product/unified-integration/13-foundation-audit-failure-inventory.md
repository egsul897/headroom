# Foundation-audit failure inventory — PR #253 tip `e46dd9ea`

**Re-run:** `npx vitest run tests/foundation-audit` at SHA `e46dd9ea762b52f085c26c6784245972c2bad750`  
**Result:** **14 failed** / 250 passed / 102 skipped (35 files)  
**Log artifact:** `/tmp/fa-run.log` (agent run 2026-10-10)

Do **not** treat these as harmless merely because they do not import `certified-simulate-bridge`.
Several suite titles encode known product/schema findings that still require tracked disposition.

## Exact failure inventory (14)

| # | Test | Immediate failure mode at tip | Classification | Tracked? |
|---|------|-------------------------------|----------------|----------|
| 1 | `cascade-and-concurrency.test.ts` › Job 2 #5 › Company cascade orphan check | `PrismaClientInitializationError` — Can't reach Neon | **ENV_DB_UNREACHABLE** (test requires live Postgres) | FA-ENV-01 |
| 2 | same › DocumentNode parentId SetNull | DB unreachable (teardown) | **ENV_DB_UNREACHABLE** | FA-ENV-01 |
| 3 | same › Document.instrumentId SetNull | DB unreachable | **ENV_DB_UNREACHABLE** | FA-ENV-01 |
| 4 | same › ContractReferenceEdge sourceRuleId cascade | DB unreachable | **ENV_DB_UNREACHABLE** | FA-ENV-01 |
| 5 | same › **REAL P2 FINDING:** `ContractRule.targetRuleId` SetNull vs CHECK `contract_reference_edges_target_matches_type` collision | DB unreachable *here*; title documents a **genuine schema/product defect** when DB is live | **KNOWN_PRODUCT_DEFECT (schema)** — concurrency/isolation N/A; FK semantics defect | **FA-P2-01** |
| 6 | `cascade-and-concurrency.test.ts` › Job 2 #6 › concurrent `persistStructuralNodes` unique-key race | DB unreachable | **GENUINE_CONCURRENCY_TEST** — requires live Postgres to prove isolation; not harness flake by design | FA-CONC-01 |
| 7 | `document-source-identity-overload.test.ts` › 1a › **REPRODUCED:** `uploadAndChunkDocument` creates TWO rows for byte-identical content | DB unreachable *here*; title documents **missing dedup on real UI path** | **KNOWN_PRODUCT_DEFECT (ingestion identity)** | **FA-P1-01** |
| 8 | same › 1a CONTRAST: `uploadDocumentThroughIngestion` refuses duplicate but UI path does not call it | DB unreachable | **KNOWN_PRODUCT_DEFECT** (same as FA-P1-01) | FA-P1-01 |
| 9 | same › 1b tombstone on re-persist (P1-9 remediation proof) | DB unreachable | **ENV_DB_UNREACHABLE** — remediation proof blocked without DB | FA-ENV-02 |
| 10 | same › 1c `supersedesDocumentId` unused by calculation logic | DB unreachable *here*; title documents **provenance unused in engine** | **KNOWN_LIMITATION (modeling)** | FA-LIM-01 |
| 11 | `real-db-duplicate-physical-occurrence.test.ts` › two physical occurrences same label persist as two rows | DB unreachable | **ENV_DB_UNREACHABLE** / real-Postgres proof | FA-ENV-03 |
| 12 | `repro-claim-review-create-race.test.ts` › concurrent `recordClaimReview` (AUD-S24-01) | **Test timed out in 5000ms** (also DB path) | **GENUINE_CONCURRENCY_TEST** — 5s timeout under unreachable/slow DB; historically P2002 race repro | **FA-CONC-02** |
| 13 | `review-state-staleness.test.ts` › 4a › **VERIFIED:** bare `document.create` defaults `typeConfirmedByUser=true` | DB unreachable *here*; title documents **review-default landmine** | **KNOWN_PRODUCT_DEFECT (review semantics)** | **FA-P2-02** |
| 14 | same › 4b promoted candidate review is final | DB unreachable | **ENV_DB_UNREACHABLE** / positive control | FA-ENV-04 |

## Concurrency / isolation vs harness instability

| Kind | IDs | Notes |
|------|-----|-------|
| Genuine concurrency / isolation tests | FA-CONC-01, FA-CONC-02 | Designed to stress Postgres unique constraints / first-create races. Failures at tip are env-blocked (unreachable DB or 5s timeout waiting on it). **Not** dismissed as harness noise; must re-run on reachable Postgres before closing. |
| Environment blocked (no DB) | FA-ENV-01..04 | Cannot execute intended assertions; do not greenwash with higher timeouts. |
| Known product/schema defects (encoded in test titles) | FA-P2-01, FA-P1-01, FA-P2-02, FA-LIM-01 | Independent of certified-simulate bridge. Remain **tracked merge limitations** until owned and closed against live DB evidence. |

## What this is **not**

- Not evidence of a certified-simulate / EXECUTABLE regression.
- Not proof the P2/P1 findings are fixed (DB unreachable prevented re-verification).
- Not license to raise `testTimeout` to force green.
