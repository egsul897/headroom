# Track A2 — Durable canonical knowledge proof (Cursor-first Postgres BYTEA)

**Verdict:** `A2_LIVE_DURABILITY_PROVEN`  
**Status:** Live Neon persist + fresh-process independent retrieve + hash verify complete

## SHAs

| Field | Value |
|---|---|
| CKF foundation merge | PR #154 |
| Blob/durable path merge | PR #174 (`fa6c578a`) |
| Main tip at live proof | `2338e9e09fc9a6435bcfa4a330c424dd240ffb4d` |

No second registry was created. Legal non-promotion semantics unchanged.

## Existing infrastructure reused

| Concern | Path | Credential |
|---|---|---|
| **Byte store (Cursor default)** | `lib/document-storage/postgres-bytea-provider.ts` | `DATABASE_URL` + migration `20261009013000_document_byte_objects` |
| Byte store (optional) | `lib/document-storage/vercel-blob-provider.ts` | `KF_BYTE_STORE=vercel-blob` + `BLOB_READ_WRITE_TOKEN` |
| Canonical registry | Prisma `KnowledgeSource` | `DATABASE_URL` + `20261008220000_knowledge_factory_foundation` |
| Pipeline / export / consumers | existing `lib/knowledge-factory/**` | n/a |

**Rejected as durability substitutes:** `LocalFilesystemStorageProvider`, `.local-knowledge-corpus/`, committed metadata/hashes alone, temporary agent files, mocked providers.

## Live proof results (Document A — Gibraltar)

| Field | Value |
|---|---|
| sourceId | `edgar:0001140361-26-003087:ef20064499_ex10-1.htm` |
| DB id | `cmv0aqwg00002ndhsetpsslgx` |
| storageRef | `pgbytea:v1:6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a` |
| bytes | 2,266,666 |
| SHA-256 | `6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a` |
| Migration | Already applied (`prisma migrate status`: up to date, 35 migrations) |
| Fresh-process retrieve | `RETRIEVE_OK` |

## Document B (Chewy) generalization

See `a2-live-idempotency-docb.json`. Separate identities/hashes/storageRefs; both `DISCOVERED_CANDIDATE`; Gibraltar does not override Chewy operative bytes.

## Artifacts

- `a2-roundtrip-evidence.json`
- `a2-independent-retrieve.json`
- `a2-live-idempotency-docb.json`
- `a2-live-proof-report.md`
- `scripts/knowledge-factory/a2-live-idempotency-docb.ts`
