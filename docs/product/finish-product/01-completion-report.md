# Finish the product — completion report

**Verdict:** `CANONICAL_PRODUCT_WORKING_WITH_DOCUMENTED_LIMITATIONS`  
**Canonical branch:** `cursor/finish-product-canonical-a9e4` (from PR #250 tip `37fc3ee5`)  
**Base main:** `7f1dd3a202b026b9a862ef727480a1a9f284523a`  
**Tip:** `2155fe5788ff107faf1b4b984d13a9ae9582b47e`  
**CI on tip `b1d9da3d`:** 6/6 SUCCESS (canonical-compiler, home-overview, p3-r0-soft-gate, dashboard-invent-absence, Vercel, Vercel Preview Comments)  
**Auto-merge:** **no**

## A. Canonical integration

| Item | Decision |
|---|---|
| Baseline | **PR #250** Stages 2–5 + P0 merge-hold (#253/#254 ports) + #256 lien semantics (`37fc3ee5`) |
| Integrated | Typecheck/zero-probe fix; #250/#256 lien-semantics merge; authentic VEP offline tests; finish-product demo + report |
| Milestone add | Authentic affirmative probe + regression lock (`02-authentic-affirmative-blocker.md`) — no gate weakening |
| Deliberately not integrated | **#241** full completeness-certificate issuer/fingerprint gate (additive harden; #237 authority already on main/#250) |
| | **#255** structural flywheel / **#246** KF graph — keep separate until their CI gates pass |
| | **#252** FCE collapse — already largely on #250 Stage 3 |
| | **#226** unseen-package readiness — evidence reference only |
| Competing #253/#254 | Absorbed by port into #250; do not merge standalone |

**PR clean for human merge?** Yes on prior tip `b1d9da3d` (MERGEABLE, CI green). Milestone evidence commit follows; re-confirm CI on new tip before merge.

## B. Product demonstration

**Package chosen:** CONMED Eighth A&R Article VII authentic Phase-3 evidence (`7.2c-recompute-phase2-certified`) — only on-disk authentic CERTIFIED candidate.

| Stage | Authentic CONMED | Stage D (synthetic labeled) |
|---|---|---|
| Documents | EXECUTED (fixture + Phase-3 packets) | EXECUTED (acceptance VEP) |
| Covenant discovery | EXECUTED (1 CERTIFIED, 5 REVIEW_REQUIRED) | EXECUTED |
| Verified legal rule | EXECUTED (§7.2(c) CERTIFIED) | EXECUTED (§7.01(b)+§7.02(b)) |
| VEP | DERIVED | Present |
| Path enumeration | CERTIFIED_4E (paths UNSUPPORTED for cross-rule) | CERTIFIED_4E |
| Capacity REQUIRE | **BLOCKED** — `CROSS_RULE_GATE_NOT_EXECUTABLE` (§7.1 / §7.3(g)) | **EXECUTED** — debt+lien AVAILABLE |
| Transaction sim | **BLOCKED** (capacity refused) | **EXECUTED** — dual-path $15M SATISFIED |
| Position/Simulate/Ask | Consistent empty-ledger fail-closed (remaining null) | Same shared projection |

**Authentic affirmative milestone:** Executed probe proves §7.2(c) is **not** companion-dischargeable (UNLIMITED + `OTHER_RULE_SATISFIED` §7.1 + missing companions). Alternatives §7.5(j) / §7.3(g)(ii)(B) are not CERTIFIED. See `02-authentic-affirmative-blocker.md`.

## C. Defects

| Kind | Item |
|---|---|
| Fixed | TS2367 / zero-probe EXACT assertion (CI typecheck) |
| Fixed | Stale `authenticated-vep-offline` assertions (0 CERTIFIED → 1 DERIVED) |
| Integrated | #250/#256 lien-semantics reconcile onto canonical |
| Disproven | Silent pathId substitution / capacity-as-EXECUTABLE — #250 P0 suites green |
| Disproven (milestone) | “Small runtime patch can open authentic §7.2(c)” — four independent blockers; companion discharge correctly stays closed |
| Blocker (ops) | Neon unreachable (`P1001`) — DB-backed north-star E2E skipped |
| Blocker (product) | Authentic affirmative REQUIRE — irreducible without CERTIFIED §7.3(g) + §7.1 compliance evaluator + APPROVED financials |

## D. Business readiness

| Category | Status |
|---|---|
| WORKING | Solver secured debt∩lien; certified-simulate safety; Stage D dual-path; #237 utilization fail-closed; Phase-3 CERTIFIED→DERIVED VEP; honest authentic refusal |
| WORKING BUT LIMITED | Authentic CONMED through VEP/4E without numeric remaining; LEGACY Position/Simulate need DB |
| BLOCKED | Live Neon customer workflow; authentic affirmative capacity (see `02-`) |
| BROKEN | None on tip after typecheck + lien merge + affirmative probe lock |

**Prospect demo today?** Yes, with honest labels (synthetic affirmative + authentic refusal). **Paying pilot?** No.

**Top 3 before first pilot**
1. CERTIFIED §7.3(g) companion + CERTIFIED §7.1 + certified pro-forma compliance evaluator for `OTHER_RULE_SATISFIED` (or a different authentic CERTIFIED finite basket without those gates).
2. APPROVED financial snapshots + attributed utilization with completeness certificates.
3. Reliable Neon (or ephemeral DB) for live Position/Simulate/Ask.

## E. Evidence

- Demo: `docs/product/finish-product/00-demo-report.json`
- Affirmative blocker: `docs/product/finish-product/02-authentic-affirmative-blocker.md` + `02-authentic-affirmative-probe.json`
- Commands:
  - `npx tsc --noEmit -p .`
  - `npx vitest run tests/product/authentic-conmed-72c-affirmative-blocker.test.ts tests/product/certified-simulate-executable-safety.test.ts tests/product/stage-d-pkgi-secured-dual-path.test.ts tests/product/authenticated-vep-offline.test.ts`
  - `npx tsx scripts/product/run-finish-product-demo.ts`
- CI tip `b1d9da3d`: 6/6 SUCCESS
- PR: https://github.com/egsul897/headroom/pull/258
