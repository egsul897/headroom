# WS-EHB Progress Ledger (append-only)

## 2026-10-08 — initial implementation

- **baseMainSha:** `9de4e5737166fcec84a35fdc9a3404870549211f`
- **branch:** `cursor/edgar-historical-backfill-c45c`
- **bcId:** `bc-01a11d8b-4342-7f20-8183-2aa3b387c45c`
- Claimed exclusive paths under `docs|lib|scripts|tests/edgar-historical-backfill/**` (unassigned in WS-PAR map; does not overlap WS-CKF exclusive trees).
- Built discovery engine, SEC fair-access coordinator, IBR resolver, dedupe, coverage, acquisition queue, checkpoints, reproducible scripts.
- Coordinated with WS-CKF by publishing `acquisition-queue.json` contract and not duplicating downloader/registry.

## 2026-10-08 — live pilot + IBR primary-index path

- Ran 100-issuer pilot (metadata-first): 42,258 filings scanned, 439 exhibits after dedupe, 126 queued; 81 distinct CIKs (ticker→CIK collision — fixed).
- Added primary 10-K/10-Q Item 15 exhibit-index parser for IBR (TOC-last-match), Form+date→accession resolution against submissions.
- Smoke (CNMD/MATW/AAL/ROCK/F): 67 IBR exhibits discovered (1 RESOLVED with source URI, 66 PARTIAL with accession/form-date).
- Focused tests: 21/21 passing.
- Draft PR: https://github.com/egsul897/headroom/pull/142
