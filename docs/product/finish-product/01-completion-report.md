# Finish the product — completion report

**Verdict:** `CANONICAL_PRODUCT_WORKING_WITH_DOCUMENTED_LIMITATIONS`  
**Canonical branch:** `cursor/finish-product-canonical-a9e4` (from PR #250 tip `37fc3ee5`)  
**Base main:** `7f1dd3a202b026b9a862ef727480a1a9f284523a`  
**Tip:** `58b5c4df50accd1a32eac719d086c4a2130313b1`  
**Prior CI-green content tip:** `72991f256b6ef78facb815b469a981ef53769ffb` (6/6 before #250 lien refresh)  
**Auto-merge:** **no**

## A. Canonical integration

| Item | Decision |
|---|---|
| Baseline | **PR #250** Stages 2–5 + P0 merge-hold (#253/#254 ports) + #256 lien semantics (`37fc3ee5`) |
| Integrated | Typecheck/zero-probe fix; #250/#256 lien-semantics merge; authentic VEP offline tests; finish-product demo + report |
| Deliberately not integrated | **#241** full completeness-certificate issuer/fingerprint gate (additive harden; #237 authority already on main/#250) |
| | **#255** structural flywheel / **#246** KF graph — keep separate until their CI gates pass |
| | **#252** FCE collapse — already largely on #250 Stage 3 |
| | **#226** unseen-package readiness — evidence reference only |
| Competing #253/#254 | Absorbed by port into #250; do not merge standalone |

## B. Product demonstration

**Package chosen:** CONMED Eighth A&R Article VII authentic Phase-3 evidence (`7.2c-recompute-phase2-certified`) — only on-disk authentic CERTIFIED candidate. Affirmative dual-path exercised on Stage D acceptance VEP labeled **SYNTHETIC_LABELED_TECHNICAL_DEMO**.

| Stage | Authentic CONMED | Stage D (synthetic labeled) |
|---|---|---|
| Documents | EXECUTED (fixture + Phase-3 packets) | EXECUTED (acceptance VEP) |
| Covenant discovery | EXECUTED (1 CERTIFIED, 5 REVIEW_REQUIRED) | EXECUTED |
| Verified legal rule | EXECUTED (§7.2(c) CERTIFIED) | EXECUTED (§7.01(b)+§7.02(b)) |
| VEP | DERIVED | Present |
| Path enumeration | CERTIFIED_4E (paths UNSUPPORTED for cross-rule) | CERTIFIED_4E |
| Capacity REQUIRE | **BLOCKED** — `CROSS_RULE_GATE_NOT_EXECUTABLE` (§7.1 / §7.3(g)) | **EXECUTED** — debt+lien AVAILABLE |
| Transaction sim | **BLOCKED** (capacity refused) | **EXECUTED** — dual-path $15M SATISFIED |
| Position/Simulate/Ask | Consistent empty-ledger fail-closed (remaining null); verified simulate without VEP refuses | Same shared projection |

**First authentic blocker:** certified cross-rule satisfaction evaluator + independently CERTIFIED companions for §7.1 / §7.3(g) (+ APPROVED financials when companions execute).

## C. Defects

| Kind | Item |
|---|---|
| Fixed | TS2367 / zero-probe EXACT assertion (CI typecheck) |
| Fixed | Stale `authenticated-vep-offline` assertions (0 CERTIFIED → 1 DERIVED) |
| Integrated | #250/#256 lien-semantics reconcile onto canonical |
| Disproven | Silent pathId substitution / capacity-as-EXECUTABLE — #250 P0 suites green |
| Blocker (ops) | Neon unreachable (`P1001`) — DB-backed north-star E2E skipped |
| Blocker (product) | Authentic affirmative REQUIRE capacity — cross-rule gate |

## D. Business readiness

| Category | Status |
|---|---|
| WORKING | Solver secured debt∩lien; certified-simulate safety; Stage D dual-path; #237 utilization fail-closed; Phase-3 CERTIFIED→DERIVED VEP |
| WORKING BUT LIMITED | Authentic CONMED through VEP/4E without numeric remaining; LEGACY Position/Simulate need DB |
| BLOCKED | Live Neon customer workflow; authentic affirmative remaining (cross-rule + financials) |
| BROKEN | None on this tip after typecheck + lien merge |

**Prospect demo today?** Yes, with honest labels (synthetic affirmative + authentic refusal). **Paying pilot?** No — need companions/cross-rule + APPROVED financials + Neon.

**Top 3 before first pilot**
1. Certified companion units + cross-rule evaluator for authentic CONMED (or a package without cross-rule REQUIRES).
2. APPROVED financial snapshots + attributed utilization with completeness certificates.
3. Reliable Neon (or ephemeral DB) for live Position/Simulate/Ask.

## E. Evidence

- Demo: `docs/product/finish-product/00-demo-report.json`
- Commands:
  - `npx tsc --noEmit -p .`
  - `npx vitest run tests/product/certified-simulate-executable-safety.test.ts tests/product/stage-d-pkgi-secured-dual-path.test.ts tests/product/authenticated-vep-offline.test.ts tests/solver/secured-capacity-adversarial-matrix.test.ts tests/solver/secured-debt-lien-adversarial.test.ts`
  - `npx tsx scripts/product/run-finish-product-demo.ts`
- Prior CI-green content tip `72991f25`: 6/6 SUCCESS; refreshed tip awaits CI after #250 lien merge
- PR: https://github.com/egsul897/headroom/pull/258
