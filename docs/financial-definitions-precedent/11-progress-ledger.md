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

## 2026-10-08 — Phase 3: calculation semantics + independent validation

- SHA reconciliation: prompt-reported `ead0fc1` vs GitHub PR head `23e42a5` = same-branch WS-FDP follow-up (peer path sync + Riot); no foreign concurrent edits; HOLD not required. Focused tests on reconciled tree: 11/11.
- Fixture batch: DSGR doc-d EBITDA / Cost Savings / Combined Cap; Gibraltar Builder Basket DEF_XREF + operative §7.05(a)(y); Riot §2.06 Margin Demand + Initial/Release LTV. Atlas 49 → 57.
- Typed calculations (`14-typed-calculations.json`, `fdp.typed-calc.v1`): 7 records covering base/addback/deduction/cap/lookback/PF/cure/ratio/inputs/conditional/double-count; GIB AA blocked as `REVIEW_REQUIRED`.
- Independent arithmetic (`15-arithmetic-evaluation.json`, `fdp.arith.v1`): 13 cases (positive, missing-input, double-count trap, addback-cap, PF timing, negative controls). Arithmetic ≠ legal correctness.
- Legal states: `SOURCE_SPAN_VERIFIED` / `ARITHMETICALLY_TESTED` / `SEMANTIC_HYPOTHESIS` / `INDEPENDENTLY_LEGALLY_REVIEWED` / `REVIEW_REQUIRED`; independently reviewed count = 0.
- Canonical export v2 + source registry; join keys only; no competing production schemas; no new SEC acquisition; no production calc-engine edits.

## 2026-10-08 — Phase 4: complete models, amendment authority, ≥50 arith scenarios

- Starting SHA `153d33a`. Consumed Amendment Chain Research join keys (`cnmd-seventh-ar-to-eighth-ar`, `dsgr-2022-04-01-ar-credit`) + peer export paths without modifying peer trees or production calc engine.
- `20-calculation-models.json`: 7 models — 6 `MODEL_COMPLETE_SEMANTIC_HYPOTHESIS`, GIB AA `BLOCKED_REVIEW_REQUIRED` (`UQ-GIB-705AY-CITATION` retained).
- `21-amendment-authority.json`: per-model instrument identity, chain, effective-date status, superseded terms, unresolved authority.
- Arithmetic: +64 independently specified Phase-4 cases (total 77) covering cap boundaries, zero/neg denominators, multi-addbacks, double-count, PF acq/disposition, lookforward, threshold equality, amendment as-of transitions, currency mismatch, missing collateral prices, builder ambiguity.
- `23-legal-completeness.json`: eight structural dimensions; independently legally reviewed = 0; arithmetic ≠ legal verification.
- Canonical export v3 published.

## 2026-10-08 — Phase 4 follow-up: peer join field aliases

- Incorporated peer-inventory findings: encyclopedia/basket/atlas/amendment/CKF field names do not 1:1 match FDP declared joins; recorded `joinFieldAliases` in canonical export v3 + amendment-authority.
- Confirmed ACR coverage: CONMED + DSGR only; CHWY/RIOT/GIB have no amendment-chain IDs (already reflected as gap notes / REVIEW_REQUIRED).
- Peer trees remain remote-only; production calc engine untouched.

## 2026-10-08 — Phase 5: fail-closed calculation safety

- Starting SHA `b234d46` (reported P4 `0e92747` + join-alias follow-up only; no HOLD).
- Fixed missing-input refusal FAILs for CONMED-PF / CHWY-TLR / CHWY-ANTIDUPE with MISSING_INPUT cases + silent-zero negative controls.
- Fixed DSGR unsupported-case refusal FAIL: unmodeled addbacks, missing source authority, unattested provisos, full-EBITDA branch → UNSUPPORTED_CASE (no affirmative EBITDA).
- CONMED PF marked `PARTIAL_SEMANTIC_MODEL` with completeness taxonomy; arithmetic must not upgrade to legally complete.
- Amendment as-of refusals: Amd2 survival, wrong parent, Omnibus effectiveness, DSGR missing Am1/Am2, Riot schedule, CHWY no inferred amendment history.
- Gibraltar `UQ-GIB-705AY-CITATION` remains OPEN; capacity not inferred.
- Independent legal challenger package (`24-…`) for all 7 models; ≥3 selected including CONMED-PF + DSGR; independently reviewed count = 0.
- Legal-completeness: missingInputRefusal 7/7 PASS; unsupportedCaseRefusal 7/7 PASS.
