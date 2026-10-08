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

## 2026-10-08 — Phase 2 (acquisition handoff / IBR / fleet-safe SEC)

- Starting SHA: `1526986781805da41e2fa477ef6b550696f778d2`
- SEC placeholder UA removed; live requires configured authorized contact.
- Fleet contract: process-local limiter honesty + `HEADROOM_SEC_FETCH_OWNER` / shared budget path.
- Legacy queue validated 126/126; CKF handoff export shipped.
- IBR: engine resolved 80 in pilot-100-v2; residuals RESOLVED 45 / MISSING_ACCESSION 19 / NEEDS_ORIGINAL_INDEX 10.
- Pilot-100-v2: **100/100 distinct CIKs**, 78,859 filings, 873 exhibits, 868 distinct agreements, **149 fetchable** queued (108 inline + 41 IBR_RESOLVED).
- Resume bug fixed (hydrate completed manifests when cursor at end); queue regeneration idempotent.
- Tests: 29/29. Draft PR #142.

## 2026-10-08 — Phase 2 final integration gate

- Merged `origin/main` @ `ab87979` (`.gitignore` conflict resolved via broad `data/` + `.cache/`).
- Scope audit: 47 files vs main stay in EHB exclusive trees + `.env.example` / `.gitignore`; no CKF/registry overlap.
- IBR denominators documented: engine 80 (pre-dedupe) ≠ residual RESOLVED 45 ≠ queue IBR_RESOLVED 41 (`07-ibr-denominator-reconciliation.md`).
- CKF handoff: 149 fetchable, offline validation 149/149, `queueIdSetSha256=7570a95…`, no second registry.
- Resume replay: `secRequests=0`, identical 149 queueIds; `tsc --noEmit` clean; 29/29 tests.
- Marked PR ready; notified WS-PAR Integration Lead for prompt merge (agent does not merge).
