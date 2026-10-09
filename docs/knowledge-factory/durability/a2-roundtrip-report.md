# Track A2 — Durable canonical knowledge proof

**Verdict:** `DURABILITY_NOT_YET_PROVEN`  
**Status:** `DURABILITY_BLOCKED_CREDENTIALS`

## SHAs

| Field | Value |
|---|---|
| Starting main (CKF merged) | `2a8b70cd7683c6522087f4535f7ee996a6012c3c` (PR #154) |
| Ending tip | see commit on this branch after evidence landing |

PR #154 was **not** reopened. No second registry was created.

## Existing infrastructure reused

| Concern | Path | Credential |
|---|---|---|
| Object storage | `lib/document-storage/vercel-blob-provider.ts` | `BLOB_READ_WRITE_TOKEN` |
| Storage factory | `lib/document-storage/index.ts` | rejects silent local fallback on Vercel |
| Canonical registry | Prisma `KnowledgeSource` (+ migration `20261008220000_knowledge_factory_foundation`) | `DATABASE_URL` |
| Pipeline / export / consumers | existing `lib/knowledge-factory/**` | n/a |

**Rejected as durability substitutes:** `LocalFilesystemStorageProvider`, `.local-knowledge-corpus/`, committed metadata/hashes alone, mocked providers.

## Minimum durable integration added

- `lib/knowledge-factory/preservation/durable-store.ts` — fail-closed persist/retrieve against Blob + `KnowledgeSource`
- `scripts/knowledge-factory/durable-roundtrip-proof.ts` — independently runnable proof (`npm run kf:durable-proof`)
- Credential gate tests: `tests/knowledge-factory/durable-store-credentials.test.ts`

Behavior: if either credential is missing, the proof **exits without writing source bytes to local disk** and records `DURABILITY_BLOCKED_CREDENTIALS`.

## Intended authentic source (ready, not persisted)

| Field | Value |
|---|---|
| sourceId | `edgar:0001140361-26-003087:ef20064499_ex10-1.htm` |
| Fixture | `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm` |
| Byte length | 2,266,666 (from prior CKF gate) |
| Content hash | sha256 of fixture body (computed at proof time when credentials exist) |

Durable object/database identifiers: **not created** — blocked before persist.

## Independent fresh-environment retrieval

**Not executed.** Requires shared credentials. Originating-workspace termination + cross-session retrieve is implemented in the proof script and will run when credentials are present.

## Consumer export / idempotency

Deferred until durable retrieve succeeds. Script rebuilds `consumer-export.v1` from retrieved bytes and runs DEF + Atlas pass-2 idempotency with `promotedToLegalTruth: 0`.

## Precise missing dependencies

1. `DATABASE_URL` pointing at an approved **shared** Postgres instance with `KnowledgeSource*` migrations applied  
2. `BLOB_READ_WRITE_TOKEN` or `VERCEL_BLOB_READ_WRITE_TOKEN` for durable private object storage of source bytes  

## Next action

Configure both credentials on the Cloud Agent environment (or a shared durable destination), then:

```bash
npx prisma migrate deploy
npm run kf:durable-proof
# second process / fresh workspace:
npx tsx scripts/knowledge-factory/durable-roundtrip-proof.ts --phase=retrieve --sourceId=edgar:0001140361-26-003087:ef20064499_ex10-1.htm
```

Machine twin: `a2-roundtrip-evidence.json`.
