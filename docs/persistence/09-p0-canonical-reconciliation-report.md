# P0 — Persistence / Canonical Reconciliation Report

Tip under test: `dcd4d5a2c4cea39f6908f0805757a2e587255b85` (#294 head).

```
MAIN_SHA: 4f1a0b81207364373d9a4cb9fe515d4a1a002e56

PR_293_SHA: 66d00a97e4d2787fb29c6758b316294d189685a6
  state: OPEN, MERGEABLE (mergeStateStatus UNSTABLE while checks in flight at report time)
  base: main @ 4f1a0b81
  last-observed earlier: 8a4beb52 → advanced to 66d00a97 (operative→retrieval binding)

PR_294_SHA: dcd4d5a2c4cea39f6908f0805757a2e587255b85
  state: OPEN, MERGEABLE, CLEAN
  base: main @ 4f1a0b81
  last-observed earlier: cde9cd3e → advanced through Agent #9 + merge absorb of #293 tip
  contains origin/pr-293 tip: YES (git merge-base --is-ancestor; empty `git log origin/pr-293 --not HEAD`)

INTERVENING_COMMITS (ba39ab11d638f1d98c441d9d0389bdb2275bdde8..dcd4d5a2):
  703291d5 docs(acceptance): execute Round 2 on #293 tip; record merge gate
  8a4beb52 fix(product): correct inverted production-promotion authority summary
  beee23f5 docs(persistence): record CI SUCCESS for P5/P6 tip ba39ab11
  043882dd merge(persistence): absorb current #294 tip onto #293 tip for Agent #9 durable wiring
  cde9cd3e feat(persistence): wire Agent #9 financial/utilization durable pathways
  1aa81306 test(persistence): green Agent #9 disposable Postgres acceptance + evidence
  ce2fd7ba docs(persistence): clarify Agent #9 Postgres execution SHA vs tip
  2d098703 fix(persistence): route utilization reconstruction through north-star-bridge
  66d00a97 fix(canonical): restore operative→retrieval binding from #283
  867e72c0 docs(persistence): pin Agent #9 report to tip 2d098703
  dcd4d5a2 merge(persistence): absorb #293 tip 66d00a97 (operative→retrieval binding fix)

CANONICAL_FEATURE_PARITY:
  #293 commits missing from #294: NONE
  8a4beb52 authority-summary correction: PRESENT (ancestor of tip)
  66d00a97 operative→retrieval binding: PRESENT (ancestor of tip; also merge dcd4d5a2)
  Production delta #293...#294 (excl. docs): persistence layer only
    lib/persistence/**, persist-execution.ts, durable-capacity-identities.ts,
    prisma/schema + migration 20261010160000_institutional_intelligence_persistence
  Do not assume older #294 heads had every #293 fix — tip dcd4d5a2 does.

AUTHORITY_SUMMARY_TEST:
  Command: npx vitest run tests/product/unified-transaction-execution.test.ts -t 'authority summary'
  Result: 3 passed / 0 failed / 19 skipped in file filter
  Inactive operative production promotion:
    blocker text = "incomplete operative production promotion — caveats/CP refuse PRODUCTION_AUTHORITY"
    productionAuthorityActive=false → PRODUCTION_AUTHORITY_BLOCKED
    Position / Ask / Simulate handoffs share traceId and agree on blockers
  Classification/refusal logic: not weakened (8a4beb52 only inverted summary ternary)

OPERATIVE_RETRIEVAL_BINDING_STATUS:
  PRESENT AND WIRED on tip
  resolveOperativeSource → bindCandidateToOperativeRetrievalSource → buildCovenantContextBundle
    - retrieval-source.ts restored
    - offline-package-compile.ts binds before retrieval (OPERATIVE_RETRIEVAL_SOURCE_BLOCKED)
    - buildCovenantContextBundle still resolves via resolveOperativeSource
  Tests: tests/operative-restatement-authority/retrieval-source-binding.test.ts — 3 passed
  Persistence: OperativeAuthoritySnapshot stores sourceDocumentId / authorityClassification /
    provisionalIdentity from the governing claim used at execution; provisional never promoted
    to confirmed in persist-execution.ts

PERSISTENCE_TEST_RESULTS:
  SHA: dcd4d5a2c4cea39f6908f0805757a2e587255b85
  Command: DATABASE_URL=postgresql://postgres:***@127.0.0.1:5432/postgres npm run test:persistence
  DB: local disposable headroom_test_* via createEphemeralDatabase (NOT Neon)
  PRODUCTION_DB_TOUCHED: NO
  Counts: 47 passed / 0 failed / 0 skipped (3 files)
    neon-first-acceptance.test.ts: 16 passed
    agent9-financial-utilization-persistence.test.ts: 21 passed
    product-execution-persistence.test.ts: 10 passed
  Restart durability: PASS
  Atomic writes / compensation: PASS
  Idempotency: PASS
  Concurrent execution: PASS
  Cross-tenant isolation: PASS
  Historical utilization preservation (empty ≠ zero): PASS
  Dependency invalidation: PASS
  Provenance / source identity: PASS
  Hypothetical simulation isolation (mutatesActualLedger=false): PASS
  Trusted issuer + identity requirements / activation BLOCKED: PASS
  Evidence: docs/persistence/evidence/2026-10-10-p0-reconcile-persistence-*.txt

SSR_POSITION_ASK_SIMULATE_STATUS:
  NOT persistence-complete — live routes still use pre-persist helpers
  Position: app/[companyId]/position/page.tsx
    → getCompanyDashboard / buildPositionView / runPackageLegalPath (Conmed)
    does NOT call executeAndPersistUnifiedVerifiedTransaction
  Ask: lib/ask/shell-runner.ts
    → attemptCertifiedTransaction({ verifiedPackage: null })
    does NOT call executeAndPersistUnifiedVerifiedTransaction
  Simulate: app/[companyId]/simulate/page.tsx
    → attemptVerifiedSimulate({ verifiedPackage: null })
    → attemptCertifiedTransaction internally
    does NOT call executeAndPersistUnifiedVerifiedTransaction
  Canonical persisted path exists and is tested:
    executeAndPersistUnifiedVerifiedTransaction (persist-execution.ts)
  Smallest safe SSR swap BLOCKED without:
    - assembling full UnifiedVerifiedTransactionRequest (VEP, operative claim, utilization cert)
    - server Prisma client + tenant auth at those entrypoints
    - preserving shared trace identity without treating stored rows as authoritative
  Do not label the live product persistence-complete while these routes remain disconnected.

PRODUCTION_AUTHORITY_INVARIANTS:
  PRODUCTION_ACTIVATION_STATUS / TRUSTED_IDENTITY_PRODUCTION_ACTIVATION = BLOCKED
  No PRODUCTION_AUTHORITATIVE persistence while activation blocked
  Simulation never mutates ContractLedgerUsage
  Provisional identity never persisted as confirmed operative
  Stored results are not treated as current authority without re-check
  No duplicate solver or ledger introduced
  No production Neon writes; no paid inference; no self-merge

RECOMMENDED_MERGE_ORDER:
  Prefer Option A (smallest auditable risk):
    1) Human-approve and merge corrected #293 (66d00a97) first — product/canonical surface only
    2) Rebase/reconcile #294 onto post-#293 main — persistence delta becomes reviewable in isolation
    3) Human-approve #294 after CI on the rebased tip; do not self-merge
  Option B (#294 as sole vehicle) is technically ready (already contains #293 tip) but
  mixes product + persistence + migrations in one review surface — higher regression risk.
  Do NOT choose B merely because #294 has more commits.
  Do NOT re-merge #282/#283/#285/#287 individually.

REMAINING_BLOCKERS:
  - SSR Position/Ask/Simulate not on executeAndPersist path (product wiring follow-up)
  - Human approval required for both PRs (no self-merge)
  - Production activation remains BLOCKED by design
  - Durable IdP membership / ContextRetrievalManifest auto-write from VTE still open gaps
    (see 07-p5-p6 report)

FINAL_VERDICT: PERSISTENCE_CANONICAL_PARITY_PARTIAL
  Rationale: #294 tip has full canonical parity with #293 (including 8a4beb52 + 66d00a97),
  disposable Postgres acceptance is green (47/47), authority summary + retrieval binding verified;
  live SSR Position/Ask/Simulate remain disconnected from the persisted execution path.
```
