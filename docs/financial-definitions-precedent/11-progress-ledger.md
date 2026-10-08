# WS-FDP progress ledger (append-only)

## 2026-10-08 — initial draft dataset

- Fetched `origin/main` @ `9de4e5737166fcec84a35fdc9a3404870549211f`.
- Created branch `cursor/financial-definitions-precedent-43af`.
- Claimed exclusive paths `docs/financial-definitions-precedent/**`, `tests/financial-definitions-precedent/**`.
- Built atlas from fixtures: `chwy-2026-credit-agreement`, `conmed-2025-credit-facility`, `fwrg-2021-credit-agreement`, `lsb-2023-abl-credit-agreement`.
- Counts at generation: 31 atlas entries, 6 negative examples, 12 missing-input keys, 6 unresolved items, 8 regression candidates, 18 add-back families, 5 divergence pairs.
- All `excerpt`/`excerptSha256` spans re-validated against source files (including HTML→plain for CONMED raw exhibit).
- Coordination notes published for Definition Encyclopedia and Basket Formula Library; no peer production files modified.
- No paid calls; no certification changes.

## 2026-10-08 — citation sidecar for CONMED HTML

- Added `source-normalize/conmed-2025-eighth-ar-ca.plain.txt` (html.unescape + tag strip + whitespace collapse).
- Rebound CONMED definition atlas entries to the owned sidecar so vitest span checks do not depend on divergent HTML-entity decoders.
- Focused tests: `npx vitest run tests/financial-definitions-precedent`.
