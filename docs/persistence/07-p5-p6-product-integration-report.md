# P5/P6 — Canonical Product Persistence Integration Report

```
MAIN_SHA: 4f1a0b81207364373d9a4cb9fe515d4a1a002e56
PR_293_SHA_AND_STATUS: 2e8c9973ac05f729ec5096599c66dd7243d5dba8 — OPEN, MERGEABLE, unmerged
PR_294_SHA_AND_STATUS: 790423512f202cde548edd29cde85ace21158930

INTERVENING_COMMIT_RECONCILIATION:
  30fd75b8 → 11ca5f3c = docs-only "record CI SUCCESS for PR #294"
  11ca5f3c → 1e9d807c = Agent #9 docs handoff (06-agent9-financial-utilization-handoff.md)
  No unreviewed migration, production DB op, or authority promotion.

SCHEMA_AUDIT: docs/persistence/06-schema-audit-p5.md — eight models PASS
  (tenant FKs, uniqueness, supersession, append-only audit, indexes)

PRODUCT_WRITE_PATHS:
  executeAndPersistUnifiedVerifiedTransaction
    → persistUnifiedTransactionExecution
      → OperativeAuthoritySnapshot (product claim)
      → FinancialEvidenceBundle
      → UtilizationCompletenessRecord (when cert present)
      → CapacityCalculationRecord (incl. refusals)
      → TransactionSimulationRecord (mutatesActualLedger=false)
      → InstitutionalAuditEvent (+ Position/Ask/Simulate traceIds)
  Compensating INVALIDATED mark on mid-flight failure.
  P2002 race-safe upserts on concurrent duplicate writes.

PRODUCT_READ_PATHS:
  loadPersistedUnifiedExecution(companyId, calculationId) — ACTIVE-only
  Fresh PrismaClient read-back proven
  toProductExecutionHandoff surfaces remain pure projections

POSTGRESQL_TEST_RESULTS:
  Command: DATABASE_URL=<local disposable postgres> npm run test:persistence
  Results: 26 passed / 0 failed / 0 skipped
  Also: unified-transaction-execution + canonical-product-integration-adversarial = 32 passed
  DB identity: disposable headroom_test_* via createEphemeralDatabase
  Neon production host: NOT used

RESTART_DURABILITY: PASS
TRANSACTIONAL_ATOMICITY: PASS (compensation + unique races handled)
IDEMPOTENCY: PASS
CONCURRENCY: PASS
HISTORICAL_RECONSTRUCTION: PASS
DEPENDENCY_INVALIDATION: PASS
SECURITY_AND_AUTHORITY_INVARIANTS:
  PRODUCTION_ACTIVATION_STATUS=BLOCKED
  No PRODUCTION_AUTHORITATIVE persistence while blocked
  Simulation never mutates ContractLedgerUsage
  Cross-tenant reads refused
  #282/#293 gates preserved (VTE unchanged; persistence wraps)

REMAINING_PERSISTENCE_GAPS:
  - Position/Ask/Simulate SSR pages still call pre-VTE bridges; not yet swapped to executeAndPersist
  - Durable IdP membership (post-#282)
  - Shared-capacity IR in SemanticTruthRecord
  - ContextRetrievalManifest not yet auto-written from VTE path

MERGE_ORDER_RECOMMENDATION:
  1) #294 tip already contains #293 via explicit merge — prefer reviewing #294 as
     the persistence+integration vehicle, acknowledging #293 content is included.
  2) Alternatively merge #293 first then rebase #294 — but avoid duplicating product modules.
  3) Do not re-merge #282/#283/#285/#287/#290/#291 individually.
  4) DO NOT SELF-MERGE.

PRODUCTION_DB_TOUCHED: NO

FINAL_VERDICT: PERSISTENCE_PRODUCT_INTEGRATION_VERIFIED
  (canonical VTE write/read lifecycle proven on disposable Postgres;
   UI page swap to executeAndPersist remains an explicit follow-up gap)
```
