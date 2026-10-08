# Covenant Dependency Atlas — Phase 2 Mission Report

Starting PR: #140 · Starting SHA: `1e36be14c94dbd40112c3c341ecccd7acec0bc2c`  
Branch: `cursor/covenant-dependency-atlas-5021` (continued; not merged)

## Hard constraints honored

- No paid inference, merges, certification changes, or production resolver edits
- No Claude-owned fixture modifications
- Unresolved edges never promoted to resolved without evidence
- No textual-similarity-only edges
- Multi-MB exports under `.local-dependency-atlas/` (gitignored)

## Coordination

| Peer | Branch / PR |
|---|---|
| EDGAR Historical Backfill | `cursor/edgar-historical-backfill-c45c` (#142) |
| Covenant Knowledge Factory | `cursor/covenant-knowledge-factory-7327` |
| CKG Benchmark (Gibraltar holdout) | `cursor/covenant-knowledge-generalization-bench-7f51` (#145) |

## Mandatory returns (summary)

See `docs/covenant-dependency-atlas/phase-2/00-summary.json` for machine-readable detail.

1. **New authentic documents / issuers:** 25 available texts; issuers CHWY, CNMD, DSGR, FWRG, LSB, RIOT, ROCK (eval), SXI
2. **Edges without ground-truth assistance:** 10,932 structural-index-only edges across 25 documents
3. **Independently measured recall/precision:** recall 0.583 (7/12), precision probe 1.0 on authored source sample (not legal certification)
4. **GT-assisted resolution:** resolved 1,513 · unresolved 715 · ambiguous 82
5. **Root-cause distribution (GT open edges):** MISSING_DEFINITION 624 · AMBIGUOUS_REFERENCE 82 · AMENDMENT_TARGET_RESOLUTION 51 · STRUCTURAL_PARSING_FAILURE 35 · MISSING_EXTERNAL_DOCUMENT 5 · controlling-restriction risk 135
6. **Motif audit:** 7 cycles → 5 textual-reference · 1 structural artifact · 1 genuine semantic; 25 diamond sample · 0 false cycles from shared deps
7. **Priority coverage (structural):** see `05-priority-coverage.json`
8. **KF import:** export-ready locally (`knowledge-factory.dependency-dataset.v1`); durable CKF mapping coordinated, not merged
9. **SHA / PR / tests:** `a099e30be37da06d8b801fc2e8b6b016b36f72f8` · PR #140 · `npx vitest run tests/covenant-dependency-atlas` → 23 passed

## Completeness semantics (corrected)

Deprecated `completenessScore` = **inventoryCoverage only**.  
`legalSemanticVerification` is always `NOT_PERFORMED` / `0`.  
Priority kinds with zero edges remain gaps even when inventory minimum is 0.

## Node identity (2,490 vs 2,482)

Raw atlas nodes 2,490; unique after flatten+dedupe 2,482.  
Duplicates are shared `financial_input:*` leaves across doc-a/b/d (8 extra rows).  
`silentDataLoss: false` — proven in tests.
