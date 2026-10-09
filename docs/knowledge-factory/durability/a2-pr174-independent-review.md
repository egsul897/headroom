# Independent review — PR #174 (Track A2 durable path)

**Reviewer role:** Integration Lead / WS-PAR  
**Starting main at review:** `37c5e1c21a6c7de8dc8111b0c0fa752d7919e250`  
**Starting PR #174 head:** `11dbdd045eebfcff42d91a14325f9140b609a024`  
**Post-review tip:** see branch after safety corrections  

## Checklist (implementation, not agent report)

| # | Requirement | Result |
|---:|---|---|
| 1 | No competing corpus registry / storage abstraction | **PASS** — reuses `VercelBlobStorageProvider` + Prisma `KnowledgeSource` only |
| 2 | KnowledgeSource identity + hash semantics preserved | **PASS** — `sourceId` unique; `originalBytesHash` indexed |
| 3 | Private bytes; no public exposure | **PASS** — Blob `access: 'private'`; `storageRef` server-side only |
| 4 | Object identity / hash / sourceId / DB metadata bound | **PASS** — `storageRef` + `originalBytesHash` + `byteSize` on row |
| 5 | Identical bytes re-ingest does not conflict | **PASS after fix** — reuse by `originalBytesHash`; alias recorded |
| 6 | Same sourceId + different bytes cannot overwrite | **PASS after fix** — `DurableContentConflictError` |
| 7 | Partial Blob→DB failure cannot claim durable | **PASS after fix** — orphan `delete()`; no row ⇒ no claim |
| 8 | Retrieve detects missing / mismatch / unauthorized | **PASS after fix** — `DurableRetrieveError` codes |
| 9 | No credential logging/exposure | **PASS** |
| 10 | Missing credentials → `DURABILITY_BLOCKED_CREDENTIALS` | **PASS** |
| 11 | Export/consumers non-promoting | **PASS** — unchanged adapters; `promotedToLegalTruth: 0` |
| 12 | Migration additive / main-compatible | **PASS** — KF migration already on main via #154; no new migration |

## Corrections applied before merge

Original tip `11dbdd04` allowed upsert overwrite of `originalBytesHash`/`storageRef` for an existing `sourceId` and did not hard-fail retrieve hash mismatches. Narrow fix in `durable-store.ts` + `durable-store-safety.test.ts` (5 tests).

## Live proof readiness

`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` **unset** in this environment → `LIVE_PROOF_BLOCKED_CREDENTIALS`.  
Safe non-promoting infrastructure may still merge; IMPLEMENTED ≠ PROVEN.

## Document B prep (post-durability)

Issuer-disjoint candidate already in fixtures: **Chewy** `edgar` package `chwy-2026-credit-agreement` (CIK `0001766502`) vs Gibraltar (CIK `0000912562`). Next test: retrieve Gibraltar precedent via research/DEF/atlas using canonical `sourceId`, analyze Chewy with citations; never let precedent override Chewy operative text.
