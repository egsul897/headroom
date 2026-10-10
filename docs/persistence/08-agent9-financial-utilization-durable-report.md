# Agent #9 financial + utilization durable integration (P5)

```
MAIN_SHA: 4f1a0b81207364373d9a4cb9fe515d4a1a002e56
PR_293_SHA: 8a4beb52712a6e31e5458fe2a005026fadedd4f1 (OPEN, unmerged)
PR_294_SHA: 1aa81306fa08cff9584696145b985572a9784cbe (OPEN — tip with evidence docs)
POSTGRESQL_EXECUTION_SHA: cde9cd3e481b88f7bd50c183c60deb2caa205279 (code under test; evidence commit is docs-only)

AGENT_9_HANDOFF_RECONCILIATION:
  Handoff docs/persistence/06-agent9-financial-utilization-handoff.md retained.
  Agent #9 producers present on #293/#294 tip (normalizeFinancialStatementEvidence,
  reconstructUtilizationEvidence, buildVerifiedCapacityInputHandoff).
  Authority protections present: TRUSTED_ISSUER_ACTIVATION + 
  TRUSTED_IDENTITY_PRODUCTION_ACTIVATION + PRODUCTION_ACTIVATION_STATUS = BLOCKED.
  #293 delta since 2e8c9973: 8a4beb52 inverted production-promotion summary fix.
  #294 tip absorbed onto current #293; Agent #9 durable wiring added additively.
  #281 never imported.

FINANCIAL_WRITE_READ_PATH:
  normalizeFinancialStatementEvidence
    → durablyRememberFinancialEvidence / persistFinancialEvidenceBundle
      (metrics + snapshot envelope + ingestionAudit sidecar in payload)
    → fresh PrismaClient loadFinancialEvidenceSnapshot
    → revalidatePersistedFinancialEvidence
      (validateAuthenticatedFinancialSnapshot — stored ≠ trusted)
    → buildVerifiedCapacityInputHandoff / durablyBuildAndRememberVerifiedCapacityInput

UTILIZATION_WRITE_READ_PATH:
  HistoricalUtilizationEvent[] → reconstructUtilizationEvidence
    → durablyRememberUtilizationReconstruction / persistUtilizationReconstruction
      → ContractLedgerUsage via PrismaContractLedgerStore (attributed APPROVED+AUTHENTIC only)
      → reconstruction envelope on CapacityCalculationRecord.trace (util-recon:{ruleId})
    → loadUtilizationReconstructionEnvelope + loadAttributedLedgerUsages
    → evaluatePersistedUtilizationAuthority / resolveUtilization
  UNKNOWN_HISTORICAL_ACTIVITY preserved; empty ledger ≠ zero.

COMPLETENESS_CERTIFICATE_PATH:
  persistUtilizationCompletenessRecord (claimed cert stored for audit)
  getProductionEligibleCompletenessRecord (ACTIVE + AUTHENTIC structural only)
  Host trusted-issuer + identity gates remain BLOCKED — mayUseAsProductionCapacityInput false.
  Missing/invalid certs stay unverified; revoke → INVALIDATED dependents.

CAPACITY_SNAPSHOT_PATH:
  persistVerifiedCapacityInputSnapshot / durablyBuildAndRememberVerifiedCapacityInput
  Persists company scope, financialSnapshotIdentity, utilizationSnapshotIdentity,
  operativeAuthoritySnapshotId, verifiedIrIdentity, evaluationAsOf, deterministic
  inputHash, result authority status — never a bare capacity number.

INVALIDATION_TESTS:
  Financial revision / cert revoke → STALE or INVALIDATED CapacityCalculationRecord
  getLatestAuthorizedCapacityCalculation never returns STALE/SUPERSEDED/INVALIDATED
  Historical rows retained for audit

POSTGRESQL_TEST_RESULTS:
  Command: DATABASE_URL=<local disposable postgres> npx vitest run tests/persistence/
  agent9-financial-utilization-persistence: 21 passed / 0 failed / 0 skipped
  neon-first-acceptance: 16 passed
  product-execution-persistence: 10 passed
  Total persistence: 47 passed / 0 failed / 0 skipped
  Disposable DB: headroom_test_* via createEphemeralDatabase + assertDisposableDatabase
  Evidence: docs/persistence/evidence/2026-10-10-agent9-financial-utilization-*.txt

CROSS_TENANT_TEST_RESULTS: PASS (TenantIsolationError on foreign bundle id / metric entity)

HYPOTHETICAL_LEDGER_ISOLATION: PASS (durablyRememberSimulation; ContractLedgerUsage count unchanged)

TYPECHECK_AND_BUILD: tsc --noEmit PASS; next build PASS

CI_STATUS: pending after push (subscribe on #294 head)

REMAINING_GAPS:
  - Position/Ask/Simulate SSR route loaders not yet swapped to
    loadSharedDurableCapacityIdentities / executeAndPersist (documented in
    REMAINING_PRODUCT_DURABLE_WIRING_CALL_SITES)
  - Dual production activation gates remain BLOCKED (intentional)
  - ContextRetrievalManifest not auto-written from VTE path (prior #294 gap)

MERGE_ORDER:
  1) Prefer human review/merge of #294 (contains #293 tip + Agent #9 durable wiring)
  2) Or merge #293 first then rebase #294
  3) DO NOT SELF-MERGE

PRODUCTION_DB_TOUCHED: NO

FINAL_VERDICT: FINANCIAL_UTILIZATION_PERSISTENCE_VERIFIED
```
