# Mass precedent — approval checkpoint

**Status:** `OWNER_APPROVAL_REQUIRED_BEFORE_MIGRATE_OR_BULK_PRECEDENT_BACKFILL`

**Live write authorized:** `false`

## Target

| Field | Value |
| --- | --- |
| Neon project | `odd-art-11335831` |
| Branch | `br-dry-cell-aw391134` |
| Database | `neondb` |
| Credential | Cursor `DATABASE_URL` secret (never printed) |

## Pre-approval verification (read-only)

Run:

```bash
npm run kf:mass-precedent-dry-run
npm run kf:mass-precedent-dry-run -- --include-network
```

Artifacts:

- `docs/knowledge-factory/mass-precedent/inventory.json`
- `docs/knowledge-factory/mass-precedent/batch-plan.json`
- `docs/knowledge-factory/mass-precedent/cost-assessment.json`
- `docs/knowledge-factory/mass-precedent/status-board.json`

## Tables affected after approval

1. `document_byte_objects` — original BYTEA by SHA-256
2. `KnowledgeSource` — canonical registry + `storageRef`
3. `knowledge_import_batches` — resumable batch checkpoints

## Tables not touched

- `Company`
- `FinancialSnapshot`
- Product demo `Document` rows

## Exact commands after owner approval

```bash
# 1) Schema (undeployed migrations)
npx prisma migrate deploy

# 2) Committed authentic bytes (idempotent)
KF_CONSOLIDATION_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE npm run kf:consolidation-import
# or
KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE npm run kf:mass-precedent-import

# 3) Local analysis replay (no Neon write required)
npm run kf:mass-precedent-analyze -- --limit=5

# 4) Network fill to batch-100 (SEC-gated; separate approval)
HEADROOM_SEC_FETCH_OWNER=WS-CKF \
  KF_MASS_PRECEDENT_LIVE_WRITE=I_AUTHORIZE_NEON_BULK_WRITE \
  npm run kf:mass-precedent-dry-run -- --include-network
# then a dedicated fetch+persist job (not unbounded crawl)
```

## Safety labels

- DISCOVERED ≠ VERIFIED
- SOURCE_BACKED ≠ LEGALLY_EXECUTABLE
- PRECEDENT ≠ OPERATIVE AUTHORITY
- Row count ≠ legal coverage

## Recovery

Before bulk write: confirm Neon branch recovery / point-in-time restore is available for `br-dry-cell-aw391134`. Import is idempotent on `contentHash` / `sourceId`.
