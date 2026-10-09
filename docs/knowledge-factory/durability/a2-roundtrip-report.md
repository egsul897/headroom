# Track A2 — Durable canonical knowledge proof (Cursor-first Postgres BYTEA)

**Verdict:** `IMPLEMENTED` (code path) / `DURABILITY_NOT_YET_PROVEN` (live cross-agent)  
**Status:** Awaiting authorized `document_byte_objects` migrate deploy + independent Agent B retrieve

## SHAs

| Field | Value |
|---|---|
| CKF foundation merge | PR #154 |
| Blob durable path merge | PR #174 |
| Postgres BYTEA implementation | this PR (`cursor/postgres-bytea-durable-store-0e3f`) |

No second registry was created. Legal non-promotion semantics unchanged.

## Existing infrastructure reused

| Concern | Path | Credential |
|---|---|---|
| **Byte store (Cursor default)** | `lib/document-storage/postgres-bytea-provider.ts` | `DATABASE_URL` + migration `20261009013000_document_byte_objects` |
| Byte store (optional) | `lib/document-storage/vercel-blob-provider.ts` | `KF_BYTE_STORE=vercel-blob` + `BLOB_READ_WRITE_TOKEN` |
| Storage factory | `lib/document-storage/index.ts` | `DOCUMENT_STORAGE_BACKEND=postgres` or Blob token |
| Canonical registry | Prisma `KnowledgeSource` | `DATABASE_URL` + `20261008220000_knowledge_factory_foundation` |
| Pipeline / export / consumers | existing `lib/knowledge-factory/**` | n/a |

**Rejected as durability substitutes:** `LocalFilesystemStorageProvider`, `.local-knowledge-corpus/`, committed metadata/hashes alone, temporary agent files, mocked providers, same-VM-only read-after-write.

## Architecture

See:

- `ADR-postgres-bytea-durable-store.md`
- `postgres-bytea-cost-scale.md`
- `a2-independent-proof-plan-postgres.md`

`storageRef` format: `pgbytea:v1:<sha256-hex>`. Content-addressed; unique on `contentHash`.

## Tests

- `tests/document-storage/postgres-bytea-provider.test.ts` — store, idempotent reuse, P2002 race, missing/corrupt retrieve, delete best-effort
- `tests/knowledge-factory/durable-store-postgres.test.ts` — persist without Blob, conflict, orphan cleanup, retrieve
- `tests/knowledge-factory/durable-store-credentials.test.ts` — DATABASE_URL alone → `POSTGRES_BYTEA_DURABLE`
- `tests/knowledge-factory/durable-store-safety.test.ts` — Blob-path safety with `KF_BYTE_STORE=vercel-blob`

## Migration requirements (not deployed by this PR)

```sql
-- prisma/migrations/20261009013000_document_byte_objects/migration.sql
CREATE TABLE "document_byte_objects" ( ... "bytes" BYTEA NOT NULL ... );
UNIQUE ("contentHash");
```

**Do not** run `prisma migrate deploy` without explicit authorization.

## Intended authentic source

| Field | Value |
|---|---|
| sourceId | `edgar:0001140361-26-003087:ef20064499_ex10-1.htm` |
| Fixture | `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm` |
| Byte length | 2,266,666 |

## Independent proof

Follow `a2-independent-proof-plan-postgres.md`:

1. Authorized migrate deploy  
2. Agent A: `npm run kf:durable-proof`  
3. Agent B: `--phase=retrieve` only  
4. Then `DURABILITY_PROVEN`  
5. Then Gibraltar → Chewy issuer-disjoint reuse

## Precise remaining gates

1. Explicit authorization to apply `20261009013000_document_byte_objects` on Neon  
2. Independent agent retrieve of identical original bytes  

Blob token is **not** required for Cursor-first A2.
