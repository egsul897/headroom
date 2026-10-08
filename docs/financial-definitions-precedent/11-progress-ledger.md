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

## 2026-10-08 — data-production checkpoint + batch-2 expansion

- Published `13-data-production-checkpoint.json` with honest live-acquisition zeros (EDGAR owned by CKF) vs fixture-backed measured counts.
- Batch-2: ingested Gibraltar 2026 + DSGR 2024 Third Amendment fixtures (no network acquisition).
- Atlas grew 31 → 47 entries; negatives 6 → 9; added NBSP-tolerant GIB net leverage definitions, DSGR 20% Combined Cap, GIB ECF prepay step-down, synergy/pro forma cap patterns.
- Still no paid model calls; interpretations remain unverified legally.

## 2026-10-08 — peer path refresh + Riot cure divergence

- Fetched peer branches `cursor/definition-encyclopedia-2a50`, `cursor/covenant-basket-capacity-formula-library-ae51`, `cursor/covenant-knowledge-factory-7327`.
- Confirmed **zero path collision** with `docs/financial-definitions-precedent/**`; recorded concrete exclusive trees + export/manifest paths in `00-ownership-and-coordination.md` and `01-schema.json`.
- Batch-3: Riot Platforms BTC margin CA — `Actual LTV Ratio` + negative example that `Cure Amount (BTC)` ≠ EBITDA equity cure; divergence + regression candidate REG-FDP-011.
- Atlas 47 → 49 entries; negatives 9 → 10.
