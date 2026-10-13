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
| `live-analysis-orchestrator` | Covenant compilation / deterministic computation | **reusable** | `lib/contract-model/analysis/orchestrator.ts → runContractAnalysis` | Live Phase 2A–2G + semantic compile/verify orchestration for company analysis runs. |
| `capacity-runtime` | Covenant compilation / deterministic computation | **reusable** | `lib/contract-model/runtime/ + lib/capacity/ + verified-execution.ts` | Deterministic capacity / simulation runtime; product REQUIRE boundary. |
| `neon-knowledge-source` | Neon schema / persistence | **reusable** | `prisma/schema.prisma → KnowledgeSource, DocumentByteObject, KnowledgeImportBatch` | KF source registry, BYTEA store, import batch checkpoints. |
| `neon-learning-tables` | Neon schema / persistence | **incomplete** | `prisma/migrations/20261013180000_covenant_learning_factory/` | Learning packages, runs, artifacts, error ledger, evaluations, cohorts. |
| `covenant-summary-prisma` | Neon schema / persistence | **missing** | `lib/product/covenant-intelligence/summarize.ts (JSON artifacts; no Prisma model)` | Document covenant summaries exist as product/JSON; no first-class CovenantSummary table. |
| `eval-source-to-covenant` | Evaluation corpora / golden tests | **reusable** | `datasets/source-to-covenant/` | Train/dev vs eval-heldout issuer-disjoint compilation dataset. |
| `eval-v2` | Evaluation corpora / golden tests | **reusable** | `lib/contract-model/evaluation-v2/` | Evaluation-v2 adjudication / correspondence framework. |
| `product-proof-unseen` | Evaluation corpora / golden tests | **reusable** | `docs/product-proof/001 + 002 (MTN/MHK)` | Authentic unseen-issuer proof packages with freeze manifests. |
| `kf-mass-precedent` | Precedent ingestion pipeline | **reusable** | `lib/knowledge-factory/mass-precedent/` | Mass-precedent inventory, SEC batch persist, analysis runs. |
| `kf-uncertainty-queue` | Continuous learning / evaluation | **incomplete** | `lib/knowledge-factory/queue/uncertainty.ts + semantic-priority.ts` | Active-learning style uncertainty queue; semantic priority queue for paid compile (disabled). |
| `neon-flywheel` | Continuous learning / evaluation | **incomplete** | `scripts/neon-corpus-flywheel/` | Batch analysis + compiler challenge loop over authentic packages. |
| `learning-factory-orchestrator` | Continuous learning / evaluation | **reusable** | `lib/covenant-learning-factory/` | Unified resumable batch loop: ingest→compile→eval→error ledger→proposals. |
| `phase-c-compiler-quarantine` | Anti-pattern | **fixture-specific** | `lib/contract-model/compiler/orchestrator.ts (runContractCompiler)` | Legacy Phase C compiler — quarantined; do not rebuild on top of it. |
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
- **live-analysis-orchestrator**: Prefer over quarantined Phase C compiler/orchestrator.ts. CLF uses offline compile for batch precedents.
- **capacity-runtime**: Learning factory must not write production Permission/SharedCapacity rows.
- **neon-knowledge-source**: Live Neon blocked on auth (28P01/P1010 for neondb_owner); host TCP/TLS open over IPv4. Bulk write needs a working owner password.
- **neon-learning-tables**: Additive migration shipped; apply when Neon auth succeeds. File store works offline. PROPOSED is LearningKnowledgeState, not KnowledgeRepresentationLevel.
- **covenant-summary-prisma**: Do not invent a summary table in this PR; mass-precedent embeds summary JSON. Out of CLF MVP scope.
- **eval-source-to-covenant**: Do not contaminate held-out or mutate goldens to pass.
- **eval-v2**: Heavy; learning factory uses lighter independent compile eval first.
- **product-proof-unseen**: MHK is default HELD_OUT CIK for learning factory.
- **kf-mass-precedent**: Live Neon write requires KF_MASS_PRECEDENT_LIVE_WRITE + APPROVAL_CHECKPOINT owner approval.
- **kf-uncertainty-queue**: Queue builders reusable; paid semantic execution hard-disabled. Not model training.
- **neon-flywheel**: Offline remediation shipped; live inventory blocked on Neon auth historically.
- **learning-factory-orchestrator**: Partially fills prior gap of unified issuer-disjoint TRAIN_DEV/HELD_OUT registry across KF/flywheel/product. No auto-promotion.
- **phase-c-compiler-quarantine**: ESLint + foundation-audit quarantine tests. Use analysis/orchestrator or offline-package-compile.
- **issuer-specific-branches**: Learning factory package-registry uses document loaders only.
