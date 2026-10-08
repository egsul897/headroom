# EDGAR Historical Backfill Engine

Metadata-first historical discovery, coverage measurement, and backfill scheduling for public financing documents. Produces a durable acquisition queue for the Covenant Knowledge Factory (WS-CKF).

## Reproducible commands

```bash
# Focused unit tests (no network)
npx vitest run tests/edgar-historical-backfill

# Small live smoke (respectful fair-access; uses SEC public APIs)
npx tsx scripts/edgar-historical-backfill/run-discovery.ts --issuers 5 --prefer F,AAL,CNMD,MATW,COHR --max-indexes 6

# 100-issuer pilot
npx tsx scripts/edgar-historical-backfill/run-pilot-100.ts

# Resume after interruption
npx tsx scripts/edgar-historical-backfill/run-pilot-100.ts --resume

# 1,000-issuer scale-up (same engine, larger universe)
npx tsx scripts/edgar-historical-backfill/run-discovery.ts --scale scale-1000 --max-indexes 6
```

## Outputs

Under `data/edgar-historical-backfill/<run>/`:

- `checkpoint.json` — durable resume
- `manifests/<cik>.json` — issuer + filing + exhibit manifests
- `manifests/<cik>.duplicates.json` — duplicate groups
- `coverage.json` — by year / document kind + gaps
- `acquisition-queue.json` — ranked queue for CKF
- `.sec-cache/` — fair-access response cache

## Soft gates

No paid model calls. No merges. No certification changes. No second source registry. No blind full-body downloads.
