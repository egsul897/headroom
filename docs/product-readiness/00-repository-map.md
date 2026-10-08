# Repository map for the independent acceptance workstream (written once; starting SHA `9de4e5737166fcec84a35fdc9a3404870549211f`)

Read-only production interfaces the harness drives (never edited here):

| stage | interface | model needed? |
|---|---|---|
| structure | `parseDocumentStructure` (`compiler/stage-structure.ts`), `detectStructuralDefinitions`, `detectStructuralReferences`, `buildStructuralIndex` | no |
| package graph | `buildPackageGraph(companyId, packageKey, documents)` (`compiler/package-graph/pipeline.ts`) | no |
| discovery | Pass A `runPassADeterministicSignals(documentId, index)` is deterministic; Pass B–D (`runDiscoveryPipeline`) need a provider → **not exercised**; candidate populations are manifest-declared and labelled so | Pass B+ yes |
| amendment | `runAmendmentPipeline(caller, {documents, packageGraph, index})`: deterministic parser + optional semantic interpreter for ambiguous clauses; `computeOperativeContractState`, `buildNodeSupersessionIndex` (`compiler/amendment/*`) | only for ambiguous clauses (refusing caller → REVIEW_REQUIRED) |
| context | `buildCandidateCompilerInput(candidate, pkg)` (`covenant-map/candidate-input.ts`) → `CovenantContextBundle` | no |
| semantic compile / verify / certify | `certifyDiscoveredCovenantPackage(pkg, deps)` (`covenant-map`); Pass A inventory, Pass B composition, Layer-2 review are provider calls → **scripted adversarial submissions**, labelled MOCKED | yes (mocked) |
| runtime | `snapshotInputResolver` (4B), `buildCapacityGraph` + `evaluateCapacityState` (4C), `simulateTransaction` (4D), `evaluateVerifiedCapacity` (`verified-execution.ts`) | no |

Existing harness patterns reused (imported, not copied): `tests/contract-model/context-retrieval-test-utils.ts` (`buildTestIndex`), `tests/contract-model/certified/golden-harness.ts` (scripted callers, `fakeClient`, `BoundedSemanticCaller`), `tests/contract-model/runtime/transaction/helpers.ts` (IR/snapshot/ledger builders).

Owned by Cursor (not touched): `lib/contract-model/**`, Gibraltar runners (`scripts/phase-3-*gibraltar*`, `cursor/*` branches), Phase-3 pin matrices (`docs/phase-3-reliability-stratified-certification/`), sealed evidence (`docs/phase-3-live-validation/`, `docs/phase-3-conmed-population-verified/`), CI workflows.

Workstream paths (all new): `tests/fixtures/product-acceptance/`, `scripts/product-acceptance/`, `tests/product-acceptance/`, `docs/product-readiness/`. Test runner: `npx vitest run tests/product-acceptance` (picked up by the existing `tests/**/*.test.ts` include; no config change).

Vocabularies used in manifests (production enums): families `INDEBTEDNESS LIENS RESTRICTED_PAYMENTS INVESTMENTS ASSET_SALES DISPOSITIONS FINANCIAL_COVENANTS SPRINGING_COVENANTS DEFINITIONS_CALCULATION_RULES QUALITATIVE_NEGATIVE_COVENANTS …`; discovery roles `GENERAL_PROHIBITION PERMISSION BASKET EXCEPTION RATIO_BASED_PERMISSION BUILDER CONDITION PROVISO FINANCIAL_TEST SHARED_CAP DEFINITIONAL_DEPENDENCY_CANDIDATE`; actions `INCUR_DEBT CREATE_LIEN PAY_DIVIDEND MAKE_INVESTMENT SELL_ASSET …`; capacity statuses `AVAILABLE NEEDS_INPUT UNSUPPORTED AMBIGUOUS REVIEW_REQUIRED ERROR`; snapshot statuses `DRAFT REVIEW_REQUIRED APPROVED SUPERSEDED`.
