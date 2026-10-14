# Phase P0 + P1 Report — Neon-First Persistence

```
PHASE_NAME: P0_INVENTORY_AND_P1_LEGAL_PLUS_FOUNDATION
STARTING_MAIN_SHA: 4f1a0b81207364373d9a4cb9fe515d4a1a002e56
ENDING_SHA: (see git after commit)
PR_URL: (filled after PR open)
SCHEMA_MODELS_ADDED:
  - OperativeAuthoritySnapshot
  - ContextRetrievalManifest
  - FinancialEvidenceBundle
  - UtilizationCompletenessRecord
  - CapacityCalculationRecord
  - TransactionSimulationRecord
  - InstitutionalAuditEvent
  - DependencyInvalidationRecord
SCHEMA_MODELS_REUSED:
  - SemanticTruthRecord
  - AnalysisRun
  - ContractInputSnapshot / Fact / Event
  - ContractLedgerUsage / Event
  - Document / DocumentRelationshipEdge / AmendmentEffect / DebtInstrument
  - DocumentByteObject
MIGRATIONS_ADDED:
  - 20261010160000_institutional_intelligence_persistence
WRITE_PATHS_IMPLEMENTED:
  - lib/persistence/operative-authority.ts
  - lib/persistence/context-manifest.ts
  - lib/persistence/financial-evidence.ts
  - lib/persistence/utilization-completeness.ts
  - lib/persistence/capacity-calculation.ts
  - lib/persistence/simulation.ts
  - lib/persistence/audit.ts
  - lib/persistence/invalidation.ts
READ_PATHS_IMPLEMENTED:
  - matching getters in the same modules + lib/persistence/index.ts
RESTART_DURABILITY_RESULTS: exercised via fresh PrismaClient in acceptance suite
HISTORICAL_REPLAY_RESULTS: operative supersession history + ledger event replay covered
TENANT_ISOLATION_RESULTS: cross-tenant read/write refused
INVALIDATION_RESULTS: capacity calc marked STALE on source change
TEST_COUNTS: (filled after vitest)
CI_STATUS: (after PR)
DATA_LOSS_RISK: NONE (additive migration, zero backfill)
PRODUCTION_DB_TOUCHED: NO
REMAINING_PERSISTENCE_GAPS:
  - Position/Ask/Simulate product wiring (P5)
  - Shared-capacity IR in SemanticTruthRecord
  - Durable IdP membership (depends on #282)
  - Semantic precedent Neon store
  - Full PackageGraphResult single-row archive (optional)
NEXT_PHASE_DEPENDENCIES:
  - P5 application integration
  - Absorb #293 product surfaces when merged
MERGE_DISPOSITION: DO_NOT_SELF_MERGE — human review required
```
