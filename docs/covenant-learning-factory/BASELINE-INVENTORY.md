# Covenant Learning Factory — Baseline Capability Inventory

Generated for `covenant-learning-factory.v1`. Classifications: reusable | incomplete | fixture-specific | missing.

| ID | Area | Status | Canonical path | Summary |
|---|---|---|---|---|
| `ingest-kf-pipeline` | Document ingestion / structural retrieval | **reusable** | `lib/knowledge-factory/pipeline/run.ts` | Deterministic KF acquire→text→structure→candidates with exact-byte dedupe. |
| `ingest-edgar-ehb` | Document ingestion / structural retrieval | **reusable** | `lib/edgar-historical-backfill/` | SEC EDGAR historical backfill with checkpoints, dedupe, CKF handoff queue. |
| `structural-index` | Document ingestion / structural retrieval | **reusable** | `lib/contract-model/compiler/stage-structure.ts + structural-index.ts` | Canonical document structure, definitions, references, structural index. |
| `discovery-pass-a` | Autonomous covenant discovery | **reusable** | `lib/contract-model/compiler/discovery/pass-a-signals.ts` | Deterministic Pass A covenant signals. |
| `discovery-catalogs` | Autonomous covenant discovery | **reusable** | `lib/contract-model/compiler/discovery/definition-exception-catalog.ts` | Definition/section exception catalogs + ratio section permissions. |
| `coverage-audit` | Autonomous covenant discovery | **reusable** | `lib/contract-model/compiler/coverage-audit/pipeline.ts` | Independent coverage auditor over discovered regions. |
| `semantic-ir-compile` | Semantic IR / verification | **reusable** | `lib/contract-model/compiler/semantic/compile.ts` | Semantic IR compilation with support-status gating. |
| `verification-envelope` | Semantic IR / verification | **reusable** | `lib/contract-model/verification-envelope/` | Verification envelope and verified-execution handoff. |
| `operative-amendment` | Operative amendment / version handling | **reusable** | `lib/contract-model/compiler/amendment/ + package-graph/` | Package graph, amendment effects, operative contract state, authority gates. |
| `offline-package-compile` | Covenant compilation / deterministic computation | **reusable** | `lib/contract-model/analysis/offline-package-compile.ts` | Issuer-agnostic offline package compile entry (structure→VE). |
| `capacity-runtime` | Covenant compilation / deterministic computation | **reusable** | `lib/contract-model/runtime/ + lib/capacity/` | Deterministic capacity / simulation runtime over certified rules + snapshots. |
| `neon-knowledge-source` | Neon schema / persistence | **reusable** | `prisma/schema.prisma → KnowledgeSource, DocumentByteObject, KnowledgeImportBatch` | KF source registry, BYTEA store, import batch checkpoints. |
| `neon-learning-tables` | Neon schema / persistence | **incomplete** | `prisma/migrations/20261013180000_covenant_learning_factory/` | Learning packages, runs, artifacts, error ledger, evaluations, cohorts. |
| `eval-source-to-covenant` | Evaluation corpora / golden tests | **reusable** | `datasets/source-to-covenant/` | Train/dev vs eval-heldout issuer-disjoint compilation dataset. |
| `eval-v2` | Evaluation corpora / golden tests | **reusable** | `lib/contract-model/evaluation-v2/` | Evaluation-v2 adjudication / correspondence framework. |
| `product-proof-unseen` | Evaluation corpora / golden tests | **reusable** | `docs/product-proof/001 + 002 (MTN/MHK)` | Authentic unseen-issuer proof packages with freeze manifests. |
| `kf-mass-precedent` | Precedent ingestion pipeline | **reusable** | `lib/knowledge-factory/mass-precedent/` | Mass-precedent inventory, SEC batch persist, analysis runs. |
| `neon-flywheel` | Continuous learning / evaluation | **incomplete** | `scripts/neon-corpus-flywheel/` | Batch analysis + compiler challenge loop over authentic packages. |
| `learning-factory-orchestrator` | Continuous learning / evaluation | **reusable** | `lib/covenant-learning-factory/` | Unified resumable batch loop: ingest→compile→eval→error ledger→proposals. |
| `issuer-specific-branches` | Anti-pattern | **fixture-specific** | `lib/product/autonomous-covenant-compilation/package-contexts.ts (Matthews loader)` | Fixture loaders may name issuers; production discovery must not. |

## Notes

- **ingest-kf-pipeline**: File corpus store; Neon KnowledgeSource optional via mass-precedent import.
- **ingest-edgar-ehb**: Rate-limited; requires HEADROOM_SEC_FETCH_OWNER.
- **structural-index**: Used by KF, offline compile, and compute jobs.
- **discovery-pass-a**: No LLM.
- **discovery-catalogs**: Issuer-agnostic; generalized nested numbering.
- **coverage-audit**: Wired in compileFrozenDebtPackage.
- **semantic-ir-compile**: Only supported structures compile to deterministic rules.
- **verification-envelope**: Production capacity separately refused without trusted identity.
- **operative-amendment**: Fail-closed on provisional / unresolved identity.
- **offline-package-compile**: Canonical entry for learning factory; fixed-dollar/greater-of VE slices.
- **capacity-runtime**: Learning factory must not write production Permission/SharedCapacity rows.
- **neon-knowledge-source**: Live Neon currently blocked on credentials/connectivity in this environment.
- **neon-learning-tables**: Additive migration shipped; apply when Neon is reachable. File store works offline.
- **eval-source-to-covenant**: Do not contaminate held-out or mutate goldens to pass.
- **eval-v2**: Heavy; learning factory uses lighter independent compile eval first.
- **product-proof-unseen**: MHK is default HELD_OUT CIK for learning factory.
- **kf-mass-precedent**: Live Neon write requires KF_MASS_PRECEDENT_LIVE_WRITE authorization.
- **neon-flywheel**: Offline remediation shipped; live inventory blocked on Neon auth historically.
- **learning-factory-orchestrator**: This workstream; wires existing compiler; no auto-promotion.
- **issuer-specific-branches**: Learning factory package-registry uses document loaders only.
