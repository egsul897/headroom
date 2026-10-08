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

## Independent validation workstream layout (added at checkpoint 2)

| path | purpose |
|---|---|
| `tests/fixtures/product-acceptance/packages/pkg-{a..h}-*/documents/*.txt` | synthetic corpus (hash-pinned) |
| `tests/fixtures/product-acceptance/packages/*/expectations.json` | independent expectation manifests (`product-acceptance-expectations.v1`) |
| `scripts/product-acceptance/corpus.ts` | loader, zod schema, fixture identity |
| `scripts/product-acceptance/pin-corpus.ts` | pin / `--check` document hashes |
| `scripts/product-acceptance/stages.ts` | deterministic production stages (structure, package graph, Pass A, amendment pipeline, operative state per instrument) |
| `scripts/product-acceptance/auditor.ts` | manifest vs stage output checks (structure, definitions, operative state, Pass A coverage, context retrieval, non-operative) |
| `scripts/product-acceptance/mocks.ts` | MOCKED inventory / verifier / Pass B client (labelled; priced model id for the budget only) |
| `scripts/product-acceptance/semantic-plan.ts` | faithful + adversarial submissions derived from manifests |
| `scripts/product-acceptance/semantic-stage.ts` | runs `certifyDiscoveredCovenantPackage` over the manifest-declared population and audits the result |
| `scripts/product-acceptance/runtime-f.ts` | package F runtime cases over a hand-built IR |
| `scripts/product-acceptance/runner.ts`, `run-all.ts`, `summary.ts` | orchestration, CLI, human summary |
| `scripts/product-acceptance/render-register.ts` | renders `03-defect-register.md` from the JSON record |
| `tests/product-acceptance/corpus-integrity.test.ts` | manifests validate, hashes match, no real names |
| `tests/product-acceptance/acceptance-runner.test.ts` | harness contract + safety invariants that hold on the baseline |
| `tests/product-acceptance/known-defects.test.ts` | register ↔ run synchronization |
| `docs/product-readiness/02…06` | acceptance matrix, defect register, scorecard, MVP spec, commercial plan |
| `docs/product-readiness/acceptance-runs/<sha>/` | committed report.json + summary.md per run |
