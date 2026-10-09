# Track A2 — Independent durability proof plan (Postgres BYTEA)

**Goal:** One authentic document persisted and independently retrieved with byte-identical SHA-256 — without Vercel Blob.  
**Source:** Gibraltar Industries EX-10.1  
`sourceId = edgar:0001140361-26-003087:ef20064499_ex10-1.htm`  
**Fixture:** `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/raw-html/ef20064499_ex10-1.htm` (~2.16 MiB)

## Verdict ladder

| Stage | Verdict | Meaning |
|---|---|---|
| Code + tests merged; migration not applied | `IMPLEMENTED` | Provider + KF wiring ready |
| Credentials missing / migration absent | `BLOCKED` / `DURABILITY_NOT_YET_PROVEN` | Fail closed |
| Same VM persist + retrieve OK | `SAME_ENV_ROUNDTRIP_OK_AWAITING_INDEPENDENT_RETRIEVE` | Necessary, not sufficient |
| Separate agent VM retrieve OK | `DURABILITY_PROVEN` | Only then claim cross-VM durability |

**Do not claim `DURABILITY_PROVEN` from temporary agent files or same-VM read-after-write alone.**

## Preconditions (authorization gates)

1. **Safe migration review** of `prisma/migrations/20261009013000_document_byte_objects` (additive `document_byte_objects` only).
2. **Explicit authorization** to run `npx prisma migrate deploy` against the approved Neon (`DATABASE_URL` already used by Cursor).
3. Confirm existing production-like data unchanged (companies/snapshots row counts spot-check after deploy).
4. No requirement for `BLOB_READ_WRITE_TOKEN` or AI API keys.

## Phase 0 — Credential + schema gate

```bash
npm run kf:durable-proof -- --phase=gate
# or
npx tsx scripts/knowledge-factory/durable-roundtrip-proof.ts --phase=gate
```

Expect `DURABLE_CREDENTIALS_PRESENT`, `byteStore: "postgres-bytea"`, mode `POSTGRES_BYTEA_DURABLE`.

## Phase 1 — Persist (Agent A)

On an agent with `DATABASE_URL` and migration applied:

```bash
npm run kf:durable-proof
```

Expect:

- `storageProvider: "postgres-bytea"`
- `storageRef` prefix `pgbytea:v1:`
- originating workspace deleted
- consumer `promotedToLegalTruth: 0`
- verdict `SAME_ENV_ROUNDTRIP_OK_AWAITING_INDEPENDENT_RETRIEVE` (not yet `DURABILITY_PROVEN`)

Record evidence under `docs/knowledge-factory/durability/a2-roundtrip-evidence.json`.

## Phase 2 — Independent retrieve (Agent B)

In a **new** Cursor Cloud Agent environment:

- Same `DATABASE_URL`
- **No** local `.local-knowledge-corpus` copy of Gibraltar bytes
- Checkout code that includes the BYTEA provider
- Run:

```bash
npx tsx scripts/knowledge-factory/durable-roundtrip-proof.ts \
  --phase=retrieve \
  --sourceId=edgar:0001140361-26-003087:ef20064499_ex10-1.htm
```

Pass criteria:

- `verdict: RETRIEVE_OK`
- `hashEqual: true`, `byteEqual: true`
- `retrievedBytesHash` equals fixture SHA-256
- `storageRef` begins with `pgbytea:v1:`

Only after Phase 2: update report verdict to **`DURABILITY_PROVEN`**.

## Phase 3 — Issuer-disjoint reuse (Gibraltar → Chewy)

After durability proven:

1. Keep Gibraltar as Document A (durable).
2. Execute Document B next-test design (`a2-document-b-next-test.md`) for Chewy — issuer-disjoint.
3. Consumer export rebuild from durable retrieve only; assert idempotency and non-promotion.

## Fail-closed behaviors to verify live

| Case | Expected |
|---|---|
| Missing `document_byte_objects` table | Persist/retrieve errors (not silent local fallback) |
| Wrong `sourceId` | `SOURCE_NOT_FOUND` |
| Corrupted BYTEA vs `contentHash` | `HASH_MISMATCH` |
| Re-persist same sourceId different bytes | `DURABLE_CONTENT_CONFLICT` |
| Duplicate ingest identical bytes | `reusedExisting: true`, single byte object |

## Explicit non-goals for this proof

- No Vercel Blob requirement
- No AI API tokens
- No certification / capacity promotion
- No competing registry
- No undeployed “proof” via gitignored local files
