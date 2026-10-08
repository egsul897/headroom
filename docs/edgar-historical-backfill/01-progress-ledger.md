# WS-EHB Progress Ledger (append-only)

## 2026-10-08 — initial implementation

- **baseMainSha:** `9de4e5737166fcec84a35fdc9a3404870549211f`
- **branch:** `cursor/edgar-historical-backfill-c45c`
- **bcId:** `bc-01a11d8b-4342-7f20-8183-2aa3b387c45c`
- Claimed exclusive paths under `docs|lib|scripts|tests/edgar-historical-backfill/**` (unassigned in WS-PAR map; does not overlap WS-CKF exclusive trees).
- Built discovery engine, SEC fair-access coordinator, IBR resolver, dedupe, coverage, acquisition queue, checkpoints, reproducible scripts.
- Coordinated with WS-CKF by publishing `acquisition-queue.json` contract and not duplicating downloader/registry.
