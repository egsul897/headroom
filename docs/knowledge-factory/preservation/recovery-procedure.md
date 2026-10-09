# CKF acquisition recovery procedure

## Status

**Durability claim: NONE** in this environment.

- Missing: DATABASE_URL pointing at an approved shared Postgres instance with KnowledgeSource* migrations applied
- Missing: BLOB_READ_WRITE_TOKEN or VERCEL_BLOB_READ_WRITE_TOKEN for durable object storage of source bytes

## Manifest

- Schema: `knowledge-factory.acquisition-manifest.v1`
- Content digest: `a00d534fd40b20761c0932746e5433e40718984d11fb5e6cacfd0d8c2115ae60`
- Financing locators: 113
- Knowledge factory version: `knowledge-factory.v1`
- Structural parser version: `phase-3f1-open1-wiring-structural-ambiguity.v1`

## Steps

1. Ensure `HEADROOM_SEC_FETCH_OWNER=WS-CKF` (coordinate with WS-EHB if contended).
2. Run:

```bash
HEADROOM_SEC_FETCH_OWNER=WS-CKF npx tsx scripts/knowledge-factory/recover-from-manifest.ts
```

3. The script fetches each `archivesUrl` / `sourceUrl`, verifies SHA-256 against `rawContentSha256`, and upserts via `processAcquiredDocument`.
4. Exact-byte duplicates do **not** create new canonical `sourceId` rows.
5. Rebuild consumer export:

```bash
npx tsx scripts/knowledge-factory/phase3-preserve-and-export.ts
```

## Fair access

Use identifying User-Agent, ≤10 req/s shared budget, cache, retries. Coordinate with WS-EHB when HEADROOM_SEC_FETCH_OWNER is contended.

## What this is not

- Not cross-VM durable storage.
- Not automatic legal verification or capacity promotion.
- Not a substitute for Postgres + object-storage persistence once approved credentials exist.
