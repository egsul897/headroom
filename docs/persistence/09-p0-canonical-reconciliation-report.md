# P0 — Persistence / Canonical Reconciliation Report

Tip under test: production accept on `eb16e0e1` (identical product+persistence tree to tip aside from docs merges); branch tip below.

```
MAIN_SHA: 4f1a0b81207364373d9a4cb9fe515d4a1a002e56

PR_293_SHA: 59af93201de9d5db20eccadbf990feaba176638b
  state: OPEN, MERGEABLE
  base: main @ 4f1a0b81
  note: tip advanced during mission (force-updated past 66d00a97 → 74526ead rebase of binding,
        then 59c3c4b3 wrong-document production promotion guard, then docs pins through 59af9320)

PR_294_SHA: 1ead3e75902c78a7fce699a904c3923cfcb6e9bf
  state: OPEN, MERGEABLE
  base: main @ 4f1a0b81
  contains origin/pr-293 tip: YES (git merge-base --is-ancestor; empty `git log origin/pr-293 --not HEAD`)
  note: 42b57312 = absorb of #293 59af9320; 1ead3e75 = this report pin (docs only)

INTERVENING_COMMITS (ba39ab11d638f1d98c441d9d0389bdb2275bdde8..1ead3e75 on #294):
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
  857f9d6d docs(persistence): P0 canonical reconciliation report on tip dcd4d5a2
  eb16e0e1 merge(persistence): absorb current #293 tip 59c3c4b3 (wrong-document production guard)
  b6ae195b docs(persistence): refresh P0 report after absorbing #293 tip 59c3c4b3
  b43503e9 merge(persistence): absorb #293 docs tip d2b4d8e9 (wrong-document guard pin)
  42b57312 merge(persistence): absorb #293 tip 59af9320 (readable wrong-document pin)
  1ead3e75 docs(persistence): pin P0 reconciliation SHAs to tip 42b57312 / #293 59af9320
  (+ via merge) 74526ead rebased binding; 59c3c4b3 wrong-document guard; d2b4d8e9/59af9320 docs pins

CANONICAL_FEATURE_PARITY:
  #293 commits missing from #294 tip: NONE (after 42b57312/1ead3e75)
  8a4beb52 authority-summary correction: PRESENT
  operative→retrieval binding (66d00a97 / rebased 74526ead): PRESENT
  59c3c4b3 wrong-document production promotion refusal: PRESENT (absorbed; not reimplemented)
  docs pins for that guard (d2b4d8e9 / 59af9320): PRESENT
  Production delta #293...#294 (excl. docs): persistence layer only
    lib/persistence/**, persist-execution.ts, durable-capacity-identities.ts,
    prisma/schema + migration 20261010160000_institutional_intelligence_persistence
  Do not assume older #294 heads had every #293 fix — tip 42b57312 does.

AUTHORITY_SUMMARY_TEST:
  Command: npx vitest run tests/product/unified-transaction-execution.test.ts -t 'authority summary'
  Result: 3 passed / 0 failed
  Full product suites: unified-transaction-execution 22 + canonical-adversarial 13 = 35 passed
  Inactive operative production promotion:
    blocker = "incomplete operative production promotion — caveats/CP refuse PRODUCTION_AUTHORITY"
    productionAuthorityActive=false → PRODUCTION_AUTHORITY_BLOCKED
    Position / Ask / Simulate handoffs share traceId and agree on blockers
  Classification/refusal logic: not weakened

OPERATIVE_RETRIEVAL_BINDING_STATUS:
  PRESENT AND WIRED on tip
  resolveOperativeSource → bindCandidateToOperativeRetrievalSource → buildCovenantContextBundle
    - retrieval-source.ts present
    - offline-package-compile.ts binds before retrieval (OPERATIVE_RETRIEVAL_SOURCE_BLOCKED)
    - buildCovenantContextBundle resolves via resolveOperativeSource
  Tests: retrieval-source-binding.test.ts — 3 passed
  Wrong-document guard: wrong-document-production-guard.test.ts — 2 passed
  Persistence stores governing sourceDocumentId / authorityClassification / provisionalIdentity
    from the claim used at execution; provisional never promoted to confirmed

PERSISTENCE_TEST_RESULTS:
  SHA: eb16e0e1008912cc2771bad2eb58164d797fd71f (post-59c3c4b3 absorb; later tip commits are docs/merges only)
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
  Wrong-document / REVIEW_REQUIRED successors cannot keep base as CONFIRMED_OPERATIVE
  Stored results are not treated as current authority without re-check
  No duplicate solver or ledger introduced
  No production Neon writes; no paid inference; no self-merge

RECOMMENDED_MERGE_ORDER:
  Prefer Option A (smallest auditable risk):
    1) Human-approve and merge corrected #293 (59af9320) first — product/canonical surface only
    2) Rebase/reconcile #294 onto post-#293 main — persistence delta becomes reviewable in isolation
    3) Human-approve #294 after CI on the rebased tip; do not self-merge
  Option B (#294 as sole vehicle) is technically ready (contains #293 tip) but
  mixes product + persistence + migrations in one review surface — higher regression risk.
  Do NOT choose B merely because #294 has more commits.
  Do NOT re-merge #282/#283/#285/#287 individually.

REMAINING_BLOCKERS:
  - SSR Position/Ask/Simulate not on executeAndPersist path (product wiring follow-up)
  - Human approval required for both PRs (no self-merge)
  - Production activation remains BLOCKED by design
  - Durable IdP membership / ContextRetrievalManifest auto-write from VTE still open gaps
    (see 07-p5-p6 report)
  - #293 tip moved during mission; future tip advances require re-absorb before merge

FINAL_VERDICT: PERSISTENCE_CANONICAL_PARITY_PARTIAL
  Rationale: #294 tip has full canonical parity with current #293 (including 8a4beb52,
  operative→retrieval binding, and 59c3c4b3 wrong-document guard); disposable Postgres
  acceptance is green (47/47); live SSR Position/Ask/Simulate remain disconnected from
  the persisted execution path.
```
