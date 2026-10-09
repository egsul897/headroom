# Agent 5 — Generalize Authentic Cross-Document Execution

## Required return

| # | Item | Result |
|---|------|--------|
| 1 | Independently enumerated applicable restrictions | CONMED Art VII §7.1–7.8 + GCA; DSGR §6.01/6.02/6.04/6.08/2.09/9.02/10.01 + Incremental Amount + Applicable Intercreditor Agreement — see `cross-document-completeness-audit.ts` |
| 2 | Missed restrictions | **0** after remediation (pre-remediation gaps: DSGR Art X, §9.02, Incremental Amount shared capacity, ICA condition — now modeled) |
| 3 | False non-applicability results | **0** |
| 4 | Authentic packages tested | CONMED, DSGR, **Gibraltar**, **Chewy**, **FWRG** (12 authentic EDGAR scenarios) |
| 5 | Correct executable outcomes | 12/12 match pre-declared expectations; synthetic 8/8 + adversarial 10/10 preserved |
| 6 | Correct refusals | Gibraltar missing ICA → `UNDETERMINED`; builder/Incremental unevidenced → not `PERMITTED` |
| 7 | False favorable outcomes | **0** (`verifyCrossDocumentVerdictIndependently`) |
| 8 | Verified engine integration | A8-01 `NOT_SATISFIED` floor from PR #229; Agent 4 sequential runner + restore-authority on `simulateVerifiedTransaction`; Phase 4D/4E reused (no competing capacity engine) |
| 9 | Sequential state integration | `buildConmedSequentialDemo`: debt → RP → overflow; updates debt/liens/RP/shared basket/ratios; `postsToLedger: false`; utilization UNKNOWN without affirmation |
| 10 | UI consistency | Ask exposes `crossDocumentVerdict` ∥ `legacySimulation` ∥ `permissionLayers` on the same draft; numerical deferred on Ask; Simulate handoff unchanged |
| 11 | Tests, CI, PR, SHA, cost | See MISSION-REPORT tip SHA; tests in `cross-document-generalize.test.ts` + A8 regression + Agent 4 sequential suites |

## Honesty layers

`projectPermissionLayers` distinguishes:

1. Numerically modeled capacity (`LEGACY_ENGINE_CAPACITY` / pathway flats)
2. Legally applicable restrictions
3. Conditions satisfied vs unresolved
4. Overall permission (`crossDocumentVerdict.overallResult`)
5. Certification status (`pathEnumeration` / verified 4D — never legacy-as-certified)

## Packages

| Package | Scenarios | Notes |
|---------|-----------|-------|
| conmed-2025-credit-facility | 4 | Preserved |
| dsgr-2022-2025-credit-facility | 2 | Completeness remediation provisions added |
| gibraltar-2026-credit-agreement | 3 | General basket, missing ICA, RP builder |
| chwy-2026-credit-agreement | 2 | Shared RP/Investment + Incremental |
| fwrg-2021-credit-agreement | 1 | Non-Loan Party §6.01(j) basket |

**Tip SHA:** `6fddaf90f5ab7cf24dae56360a7981c003165998`
