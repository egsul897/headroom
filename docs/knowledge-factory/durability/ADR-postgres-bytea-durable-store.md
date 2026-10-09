# ADR — PostgreSQL BYTEA as Cursor-first durable document byte store

**Status:** Accepted (implementation landed; migration deploy gated on explicit authorization)  
**Date:** 2026-10-09  
**Track:** A2 durable knowledge preservation  
**Supersedes for Cursor milestones:** hard dependency on Vercel Blob for A2 proof

## Context

PR #174 delivered a durable Knowledge Factory path that:

- binds original source bytes via `DocumentStorageProvider`
- registers canonical identity in Prisma `KnowledgeSource`
- fails closed on credential absence, content conflict, and hash mismatch

That path preferred Vercel Blob for bytes. Cursor Cloud Agents are now the development and execution environment. Owner decision: do **not** require Vercel Blob, separate AI API keys, or new infrastructure providers for current Headroom development and proof milestones. Existing Neon PostgreSQL remains the shared database.

## Decision

Use **PostgreSQL `BYTEA`** (Prisma `Bytes` → table `document_byte_objects`) as the **Cursor-first default** durable byte store, behind the existing `DocumentStorageProvider` abstraction.

| Concern | Choice |
|---|---|
| Byte store (default) | `PostgresDocumentStorageProvider` — content-addressed `pgbytea:v1:<sha256>` |
| Byte store (optional) | `VercelBlobStorageProvider` when `KF_BYTE_STORE=vercel-blob` + blob token |
| Canonical registry | Unchanged `KnowledgeSource` — **no competing corpus registry** |
| Selection | `selectDurableByteStore` / `resolveDurableByteProvider` in `durable-store.ts` |
| General onboarding factory | `DOCUMENT_STORAGE_BACKEND=postgres` selects BYTEA; Blob token still preferred when set |

## Invariants preserved

1. **SHA-256 identity** — `contentHash` is unique; storageRef embeds the hash.
2. **Canonical source identity** — `KnowledgeSource.sourceId` / `originalBytesHash` unchanged.
3. **Aliases** — identical bytes under a new sourceId update `metadata.aliasSourceIds` on the canonical row.
4. **Provenance / rights** — filing provenance and `usageRightsReviewStatus` remain on the registry row.
5. **Idempotency** — re-ingest same bytes → reuse row; no duplicate byte objects.
6. **Conflict detection** — same `sourceId` with different hash → `DurableContentConflictError` (no silent overwrite).
7. **Atomic persistence** — BYTEA row is a single insert (metadata + bytes); registry bind after store; orphan delete on DB failure.
8. **Fail-closed retrieve** — missing object, hash mismatch, size mismatch → error.
9. **Non-promoting legal semantics** — proof consumers assert `promotedToLegalTruth === 0`; representation levels stay non-certifying.
10. **Blob remains optional** — private Blob provider is not deleted.

## Alternatives considered

| Alternative | Why not for Cursor milestones |
|---|---|
| Require Vercel Blob | Blocked without new credentials/provider; owner rejected for current proof |
| Local `.local-knowledge-corpus` | Session-scoped; not cross-VM durable |
| Git-committed binaries | Not appropriate for multi-MB exhibits; not a live store |
| Separate object store (S3/R2) | New infrastructure provider — out of scope |
| Competing corpus registry table | Forbidden — would fork identity from `KnowledgeSource` |

## Tradeoffs

**Pros**

- Single credential (`DATABASE_URL`) already connected to Cursor
- Atomic byte+metadata insert; transactional cleanup possible later
- Content-addressed uniqueness enforced by DB unique index
- Works on Neon without Blob token

**Cons / limits**

- Large BYTEA values use TOAST; very large corpora increase DB storage and backup cost
- Loading multi-MB rows into Node buffers is fine for proof scale; not ideal for massive streaming corpora
- Object storage remains preferable above a size/ops threshold (see cost assessment)

## Migration

- Additive migration: `prisma/migrations/20261009013000_document_byte_objects`
- **Do not** `prisma migrate deploy` without explicit authorization
- Does not modify existing production-like rows

## Consequences

- Durability probe mode `POSTGRES_BYTEA_DURABLE` when `DATABASE_URL` is present
- A2 proof script accepts DATABASE_URL alone
- `DURABILITY_PROVEN` still requires independent agent retrieve (see independent proof plan)
- Blob path remains for future production object-storage preference via `KF_BYTE_STORE=vercel-blob`
