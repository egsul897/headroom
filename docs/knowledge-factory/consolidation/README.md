# Canonical knowledge consolidation (Neon)

Cursor-first durable consolidation into the existing Neon database.

## Verdict gate

| Verdict | When |
|---|---|
| `CONSOLIDATION_IMPLEMENTED_AWAITING_LIVE_WRITE_APPROVAL` | Code + dry-run plan ready; migrations undeployed |
| `CONSOLIDATION_BLOCKED` | Missing DB / fatal inventory failure |
| `DURABLE_CORPUS_BACKFILL_PROVEN` | After authorized migrate + independent Agent B retrieve |
| `CROSS_DOCUMENT_REUSE_PROVEN` | After Gibraltar→Chewy precedent reuse with citations |

## Commands

```bash
# Phase D — inventory + dry-run (read-only Neon)
npm run kf:consolidation-dry-run

# Default import path is dry-run
npm run kf:consolidation-import

# LIVE writes — ONLY after explicit owner approval:
# 1) prisma migrate deploy  (document_byte_objects + knowledge_import_batches)
# 2) export KF_CONSOLIDATION_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE
npm run kf:consolidation-import -- --live --only=gibraltar
```

## Migrations (undeployed)

1. `20261009013000_document_byte_objects` — BYTEA content store  
2. `20261009020000_knowledge_import_batches` — import checkpoints  

## Safety

- No second corpus registry — uses `KnowledgeSource`
- Blob optional; Postgres BYTEA is Cursor default
- Conflict on same `sourceId` / different hash → refuse
- Metadata-only import sets `storageRef=null` and is **not** a durability claim
- Does not reset DB, delete companies/snapshots, or weaken certification packs

## Artifacts

- `asset-inventory.json`
- `dry-run-plan.json`
- `metadata-only-dry-run.json`
- `corpus-coverage-dashboard.json`
- `LIVE-WRITE-APPROVAL-CHECKPOINT.md`
