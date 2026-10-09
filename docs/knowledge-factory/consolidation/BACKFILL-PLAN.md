# Exact migration and dry-run backfill plan

**STOP — OWNER APPROVAL REQUIRED BEFORE LIVE SCHEMA OR BULK WRITE**

## 1. Neon baseline (read-only, this environment)

| Field | Value |
|---|---|
| Database | `neondb` |
| Finished migrations | **33** (last: `20261008220000_knowledge_factory_foundation`) |
| `document_byte_objects` | **absent** |
| companies | **5** (preserve) |
| financialSnapshots | **3** (preserve) |
| documents | 7 |
| knowledgeSources | **0** |
| goldenTests | 48 |
| definedTerms | 15 |
| sourceArtifacts | 8 |

Owner-stated project/branch: `odd-art-11335831` / `br-dry-cell-aw391134`. Reconfirm in Neon console before approve (pooler hostname may differ from branch display name). Host fingerprint in `dry-run-plan.json`.

## 2. Schema additions (undeployed)

| Migration | Purpose |
|---|---|
| `20261009013000_document_byte_objects` | Content-addressed BYTEA originals (`pgbytea:v1:<sha256>`) |
| `20261009020000_knowledge_import_batches` | Idempotent import checkpoints |

Both additive. No drops. No changes to company/financial snapshot tables.

## 3. Available original bytes (on disk)

| Metric | Value |
|---|---|
| Files with original HTML | **29** |
| Total bytes | **37,306,833** (~35.6 MiB) |
| Gibraltar | 2,266,666 / `6dc23ab0…45f27a` ✅ |
| Chewy fixture | 1,306,165 / `5fbd8c90…efa9c4af` |
| CBCFL research HTML | 13 |
| Other unseen-package HTML | 14 |

**Not available:** `.local-knowledge-corpus` (empty), `data/` (absent), 122 acquisition-manifest locators (hash+URL only — need SEC re-fetch).

## 4. Dry-run proposed counts (current DB)

Because BYTEA table is absent, **all 29** byte candidates are `SKIP_MISSING_BYTES` (fail-closed — no false durability).

**After authorized migrate deploy**, expected first byte batch:

| Action | Count (approx) |
|---|---|
| INSERT_BYTES_AND_REGISTRY | ~29 (or fewer if hash collisions) |
| Metadata-only KF export insert | **125** sources (`storageRef=null`, not durable) |
| Conflicts | 0 (empty registry) |
| Company/snapshot updates | **0** |

Estimated BYTEA footprint: **~35.6 MiB** raw (+ TOAST overhead). Neon cost noise at this scale (see `postgres-bytea-cost-scale.md`).

## 5. Importer status

| Importer | Status | Gate |
|---|---|---|
| Original bytes → BYTEA + KnowledgeSource | **IMPLEMENTED** | `KF_CONSOLIDATION_LIVE_WRITE` |
| KF export metadata-only registry | **IMPLEMENTED** | same gate; not durable |
| Definition Encyclopedia consumer | Existing adapter | after durable A exists |
| Atlas / Basket / Amendment / Rare | ADAPTER_NEEDED / RESEARCH_ONLY | labeled; not force-promoted |

## 6. Recommended live sequence (post-approval)

1. Approve this plan naming Neon project/branch + both migrations.
2. `npx prisma migrate deploy`
3. Reconfirm companies=5, snapshots=3.
4. Gibraltar-only live byte persist + same-env hash verify.
5. Independent Agent B retrieve → `DURABLE_CORPUS_BACKFILL_PROVEN` for one doc.
6. Batch remaining 28 byte candidates (idempotent).
7. Optional metadata-only 125 (label non-durable).
8. Gibraltar→Chewy reuse experiment → `CROSS_DOCUMENT_REUSE_PROVEN` only if useful with citations.

## 7. Rollback

- Stop imports; do not reset DB.
- Additive tables can remain empty.
- Re-runs are idempotent (hash + sourceId uniqueness).
