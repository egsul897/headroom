# LIVE WRITE APPROVAL CHECKPOINT

**Status:** AWAITING OWNER APPROVAL  
**Verdict:** `CONSOLIDATION_IMPLEMENTED_AWAITING_LIVE_WRITE_APPROVAL`

This checkpoint must be explicitly cleared before:

1. `npx prisma migrate deploy` for:
   - `20261009013000_document_byte_objects`
   - `20261009020000_knowledge_import_batches`
2. Any bulk insert into `knowledge_sources` / `document_byte_objects`
3. Setting `KF_CONSOLIDATION_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE`

## Pre-approval facts (read-only confirmed)

| Check | Result |
|---|---|
| Database name | `neondb` |
| Finished Prisma migrations | 33 (through `20261008220000_knowledge_factory_foundation`) |
| `document_byte_objects` present | **No** (pending deploy) |
| Companies | 5 (preserve) |
| Financial snapshots | 3 (preserve) |
| KnowledgeSource rows | 0 |
| DocumentByteObject rows | 0 |
| Gibraltar fixture bytes | 2,266,666 |
| Gibraltar SHA-256 | `6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a` |

Host fingerprint (SHA-256 of hostname, not secret): recorded in `dry-run-plan.json` → `neon.hostFingerprint`.

Owner-stated project `odd-art-11335831` / branch `br-dry-cell-aw391134` should be reconfirmed against the Neon dashboard before approve (runtime pooler host may differ from branch display name).

## Proposed first live sequence (after approval)

1. Snapshot / note pre-import counts (companies=5, snapshots=3, knowledge_sources=0).
2. `npx prisma migrate deploy`
3. Confirm tables exist; re-count companies/snapshots unchanged.
4. Persist **Gibraltar only**:  
   `KF_CONSOLIDATION_LIVE_WRITE=… npm run kf:consolidation-import -- --live --only=gibraltar`
5. Same-env retrieve + hash verify.
6. Fresh Cursor agent: `--phase=retrieve` durability proof.
7. Then Chewy bytes + metadata backfill batches.
8. Gibraltar→Chewy reuse experiment.

## Rollback

- Migrations are additive; rollback = stop imports (do not drop tables with data without separate auth).
- Content-addressed BYTEA + unique `sourceId` make re-runs idempotent.
- Do **not** `prisma migrate reset` or truncate company/financial tables.

## Explicit non-authorization

This document does **not** authorize live writes. Owner must reply with explicit approval naming the Neon project/branch and migrations to deploy.
