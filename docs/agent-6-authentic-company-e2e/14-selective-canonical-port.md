# Selective Agent 6 → canonical port

**Branch:** `cursor/agent6-canonical-selective-port-aebc`  
**Base:** `cursor/canonical-integrated-product-10ff` (PR #253)  
**Reconciled with:** PR #255 (`stage-structure` nestRank / definition limbs) + Agent 6 A6-D6 (`SECTION_TITLE_CAPTURE`)

## Ported (minimal)

| Path | Why |
|---|---|
| `lib/contract-model/compiler/stage-structure.ts` | Three-way merge: A6 blank-line SECTION titles + #255 nestRank/definition limbs |
| `lib/contract-model/compiler/structural-definitions.ts` | #255 `findTopLevelDefinitionStarts` (required by nestRank path) |
| `lib/contract-model/compiler/package-graph/{instrument-grouping,types,pipeline}.ts` | PROVISIONAL_FAMILY + FINANCIAL_STATEMENT |
| `lib/contract-model/compiler/discovery/{eligibility,pass-a-signals}.ts` | Agent 1 gate + headline helper |
| `tests/agent6/knife-river-article-vii-structure.test.ts` | A6-D6 regression |
| `tests/agent6/a6-d4-provisional-instrument-family.test.ts` | Provisional ≠ confirmed |
| `tests/fixtures/authentic-packages/knife-river-2023-2026/` | Authentic KR corpus |
| `tests/neon-corpus-flywheel/definition-body-clause-scope.test.ts` | #255 regression |
| `scripts/agent6/attempt-knife-river-701-verified-rule.ts` | Fail-closed §7.01 pilot |

## Explicitly NOT ported

Full Agent 6 docs tree, all three-company scorecards, Benchmark/Insulet fixtures, bulk e2e harnesses (114-file dump). Add only as needed later.

## §7.01 verified-rule attempt

See `14-knife-river-701-verified-rule-attempt/`. Base doc-a only; amendments not consolidated. Without credentials + `KNIFE_RIVER_701_INFERENCE_AUTHORIZED=1`, report is OPERATIONAL blocker — no invented IR.
