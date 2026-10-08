# EDGAR Historical Backfill Engine

Metadata-first historical discovery, coverage measurement, and backfill scheduling for public financing documents. Produces a durable acquisition queue for the Covenant Knowledge Factory (WS-CKF).

## Reproducible commands

```bash
# Required for any live SEC traffic (authorized contact — never invent one)
export SEC_EDGAR_CONTACT_EMAIL='your-authorized@email'
# or: export SEC_EDGAR_USER_AGENT='HeadroomHistoricalBackfill/1.0 (contact: your-authorized@email; research)'
export HEADROOM_SEC_FETCH_OWNER=WS-EHB   # single live-fetch owner across fleet agents

# Focused unit tests (no network)
npx vitest run tests/edgar-historical-backfill

# Offline validate an existing queue + emit CKF handoff
npx tsx scripts/edgar-historical-backfill/validate-queue.ts data/edgar-historical-backfill/pilot-100-v2/acquisition-queue.json

# Small live smoke
npx tsx scripts/edgar-historical-backfill/run-discovery.ts --issuers 5 --prefer CNMD,MATW,AAL,ROCK,F --max-indexes 10

# 100-issuer pilot (distinct CIKs)
npx tsx scripts/edgar-historical-backfill/run-pilot-100.ts
npx tsx scripts/edgar-historical-backfill/run-pilot-100.ts --resume

# Quality audit (discovery metadata only; discovered ≠ acquired)
npx tsx scripts/edgar-historical-backfill/quality-audit.ts data/edgar-historical-backfill/pilot-100-v2

# 1,000-issuer tier — only after SEC owner/shared-budget + checkpoint gates
# Do NOT run concurrent live fetches from multiple Cloud Agents.
npx tsx scripts/edgar-historical-backfill/run-discovery.ts --scale scale-1000 --max-indexes 6
```

## Outputs

Under `data/edgar-historical-backfill/<run>/` (**EPHEMERAL_WORKSPACE** — gitignored via `data/`):

- `checkpoint.json` — resume cursor + stats
- `manifests/<cik>.json` — issuer + filing + exhibit manifests
- `manifests/<cik>.duplicates.json` — duplicate groups
- `coverage.json` — by year / document kind + gaps
- `acquisition-queue.json` — ranked queue for CKF
- `.sec-cache/` — fair-access response cache

Committed under `docs/edgar-historical-backfill/`: summaries, audits, and gate reports only — not SEC source bytes.

## Soft gates

No paid model calls. No merges. No certification changes. No second source registry. No blind full-body downloads. Single SEC-fetch owner across fleet agents.
