# Checkpoint — covenant computation map

Main SHA at this note: `dada7fb5fe7b7c8ca8d0b1e2e75d033960326af1` (PR #351).
UCD-0 audit (`docs/universal-company-dashboard/00-ucd0-capability-audit.md`) still holds: the dashboard reads the legacy engine. Draft #356 (`cursor/covenant-learning-factory-c387`) owns `learning_*` tables and the error ledger. This tree does not add a second ledger.

## Modules

| Path | Role today |
|---|---|
| `lib/financial-certificate-engine` | Extract statement/certificate facts. `deriveContractualMetrics` can derive total net leverage, interest coverage, and FCCR when evidence exists. Does not classify baskets. |
| `lib/contract-model/compiler/fixed-dollar-basket`, `greater-of-assets-basket`, `ratio-incurrence` | Clause classifiers. No package-wide cap evaluation. |
| `lib/contract-model/compiler/semantic/*` | Compile/verify IR. Not a ratio calculator. |
| `lib/contract-model/runtime/evaluate-expression.ts`, `leverage-ratio.ts` | Canonical 4A arithmetic. FCCR is not aliased here. No first-lien identity unless the IR names it. |
| `lib/contract-model/runtime/capacity/*` | 4C capacity state. Unknown usage is not zero. Not what the dashboard calls. |
| `lib/contract-model/financial-definitions` | Definition identity and input readiness. Not an evaluator. |
| `lib/basket-formula-corpus` | Formula taxonomy only. |
| `lib/negative-covenant-exceptions` | Exception corpus. No cap math. |
| `lib/product/covenant-intelligence*` | Retrieval, cross-document, loop stages. Does not compute a full covenant set. |
| `lib/covenant-engine.ts` | Legacy dashboard path. `fixedChargeCoverage` is interest coverage. No first-lien ratio. |
| `scripts/neon-corpus-flywheel` | Read-only Neon inventory. |
| `prisma/schema.prisma` | No `learning_*` models on this SHA (they live on #356). |

## Computes vs missing

Computes, with limits: fixed-dollar and greater-of-assets classification; 4A `DIVIDE` when an IR expression and inputs are supplied; FCE extraction of EBITDA, debt, cash, interest, fixed charges; legacy leverage/coverage from flat fields (FCCR wrong).

Missing: one pass that, for a real package, computes contract-defined leverage, first-lien, secured, FCCR, and interest coverage with numerator/denominator cites and headroom; typed basket category plus cap evaluation on the 4A spine; records a #356 `CALCULATION` artifact can store. First-lien ratio is absent. Legacy FCCR is interest coverage. Cash-netting caps are not contractual. CA §5.14 operative text is not in the Matthews reconstructed excerpt, so maintenance headroom cannot be cite-bound from that file.

## Backlog

1. Contract-defined ratio pass on 4A (this change): FCCR ≠ interest; first lien stays `NEEDS_INPUT` without a first-lien fact.
2. Bind full CA §5.14 text so maintenance leverage and interest-coverage thresholds are citeable.
3. Bind secured and first-lien ratio definitions from the full indenture, not the reconstructed excerpt.
4. Permitted-cash netting as expression components, not flat cash.
5. Dollar room under a ratio test only when the contract states the conversion.
6. Builder / Available Amount on a package that actually contains one (Chewy), still partial-sum refused.
7. Reclass elections require an election record; do not invent the transfer.
8. Remaining capacity only with verified utilization (#356 / 4C). Do not zero-fill.
9. #356 persists emitted `CALCULATION` artifacts and `CALCULATION_MISMATCH` errors. No second schema.
10. Dashboard cutover off `lib/covenant-engine.ts` is a later read-model change, not this pass.
