# Product Proof 002 — Baseline Assessment

**Date:** 2026-10-10  
**Branch:** `cursor/pp002-compiler-baseline-8a8b`  
**Claim:** Product Proof 002 is **not established**.  
**Method:** Sealed authentic fixtures + code path audit + cheap offline tests. Not green CI, not synthetic-only success, not documentation volume.

KF graph remediation (#246) is frozen separately for human merge of remediation code/docs only. This assessment does **not** resume Neon expand, apply dedupe migration, enable dual write tokens, or promote DISCOVERED→CERTIFIED.

---

## Objective

Generalized compilation of **authentic, unfamiliar debt-agreement clauses** into **source-backed IR**, with independently verified rules that reach **capacity** and **transaction simulation**.

---

## Pipeline (what actually exists)

| Stage | Path |
| --- | --- |
| Discovery | `lib/contract-model/compiler/discovery/pipeline.ts` |
| Semantic compile | `lib/contract-model/compiler/semantic/compile.ts` (`compileCovenantToIR`) |
| Verification / verified units | `lib/contract-model/compiler/semantic-verification/`, `lib/contract-model/verified-units.ts` |
| Capacity / sim bridge | `lib/contract-model/verified-execution.ts` → `evaluateVerifiedCapacity` / `simulateVerifiedTransaction` |
| Product fail-closed wrapper | `lib/product/north-star-workflow/certified-transaction.ts`, `authoritative-capacity.ts` |
| Legacy Permission leaf (not generalized IR) | `lib/covenant-engine.ts` + Neon Permissions |

---

## Actual compilation coverage (authentic)

| Corpus / run | Coverage | Source |
| --- | --- | --- |
| VIC Phase 2 (21 authentic on-disk docs) | 6,680 Pass-A candidates → 5,109 UNVERIFIED → 34 semantic hypotheses → **0 independently verified** | `docs/vercel-independent-covenant-compilation/09-phase2-mandatory-return.md` |
| CONMED population (n=100) | FAILED **53** / REVIEW_REQUIRED **41** / PARTIAL **6** — **0 COMPLETE package compile** | `docs/phase-3-conmed-population-verified/run-original/01-statuses.json` (re-counted this session) |
| CONMED continuation-2 | 19 rules compiled · 9 units verified · 11 missing verification | `…/run-continuation-2/evidence/verified-units-manifest.json` |
| RIOT unseen | 755 eligible · 15 compile attempts · **0 fully verified** · package incomplete | phase-3f2 riot final-summary (fixture docs) |
| Chewy Phase-3-final production IR | **not produced** (cost gate) | `docs/phase-3-final-chewy/04-production-compilation-results.json` |
| Phase-1B FWRG / LSB EXECUTABLE promotions | **0 / 0** (capability-based) | `docs/phase-1b-executability-semantics.md` |
| Stratified live CERTIFIED board | **0** | `docs/product/customer-workflow/authenticated-vep/00-blocker-report.md` |
| Evaluator registry | `FIXED_AMOUNT` + `RATIO_TEST` only | `lib/contract-model/compiler/evaluator-registry.ts` |
| Neon KS → Permissions (legacy leaf) | ~734 sources → **39** Permissions | `docs/covenant-capacity-mathematics/03-integration-blockers.json` |

**Interpretation:** Discovery scale is large. Authentic unfamiliar packages almost never complete to package-scale verified/CERTIFIED executable IR.

---

## Material omissions

1. KF corpus (`DISCOVERED_CANDIDATE` / structural index) does not compile into Permissions/IR (`semantic_truth_records=0` in capacity blockers).
2. Growers / % of assets / builders / ratio room → `MISSING_EVALUATOR` on ContractRule path.
3. Phase-4C adapter refuses LEVERAGE/COVERAGE_RATIO_ROOM, RATIO_GATE, BUILDER_BASKET (honest; still not executable via generalized IR).
4. CONMED §7.5(a) object restriction (“obsolete or worn out”) historically over-complete / unlimited — documented representation defect; not a closed package certification.
5. WITH_BUILDERS / WITH_RECLASSIFICATION deferred or blocked; Chewy FINANCIAL_TEST / LIENS / INVESTMENTS strata incomplete.
6. Related-series aggregation unsupported interim.
7. Amendment authority / semantic uncertainty unresolved at VIC scale (thousands of unresolved AMENDMENT_AUTHORITY / SEMANTIC_UNCERTAINTY signals).
8. Package CERTIFIED ≠ single-candidate offline pin (`PINNED_OFFLINE ≠ CERTIFIED`).
9. Utilization / attributed remaining capacity not claimable on curated Permission leaf.

---

## False executable permissions

| Item | Status | Evidence |
| --- | --- | --- |
| A8-01 AVAILABLE while GATE_NOT_SATISFIED | Remediated in capacity status layer | `docs/agent8-independent-adversarial/05-remediation-verdict.md` |
| Phase-1A presence-based EXECUTABLE | Corrected to capability model | phase-1a / phase-1b docs |
| ROCK §2.01 incremental as MODELED $0 | Justified `KNOWN_NOT_MODELED` (not false favorable) | `docs/intelligence-factory/FORMULA-DISCREPANCY-ROCK-2.01.md` |
| CONMED §7.5(a) COMPLETE + UNLIMITED missing object gate | **Open representation risk** if treated as certified capacity | Phase-3 unlock / Lane D reports |
| MODELED / PINNED_OFFLINE / LEGACY_ENGINE | Explicitly **not** customer-authoritative CERTIFIED | IF neon-activation matrix |

No new status-layer CRITICAL false-AVAILABLE found in sealed Agent 8 remediation. Residual risk: over-complete IR and equating pins/MODELED with executable permission.

---

## Capacity and transaction simulation reach

**PARTIAL.**

- **Wired in library:** `evaluateVerifiedCapacity` / `simulateVerifiedTransaction` call capacity state + `simulateTransaction` (`lib/contract-model/verified-execution.ts`).
- **Product path fail-closed** without `VerifiedExecutionPackage` → NEEDS_INPUT / NOT_CERTIFIED.
- **Authenticated CONMED VEP** reaches capacity evaluate and **REFUSES** (cross-rule gate / missing companions).
- **No generalized corpus→IR→capacity loop:** customer Position/Simulate still centered on hand-curated Permissions via `lib/covenant-engine.ts`.
- Sealed Permission-leaf gross math (Coherent/Matthews) is not PP002 generalized compilation success.

---

## Bottleneck (honest)

Turning authentic unfamiliar clauses into **source-backed, representation-sufficient, verified IR that is package-CERTIFIED and capacity-executable with real financials and attributed usage**.

Discovery/structure volume is not the proof. Green CI, synthetic matrices, and offline pins do not establish Product Proof 002.

---

## Next engineering focus (PP002)

1. Measure compile→verify→sufficiency on one held-out authentic package end-to-end without paid-inference inflation claims.  
2. Close representation defects that produce false COMPLETE / unlimited (e.g. object restrictions).  
3. Expand evaluator/capability surface only where authentic clauses demand it — refuse rather than over-label EXECUTABLE.  
4. Wire verified packages into capacity/sim with attributed utilization — fail closed when companions/financials missing.  
5. Keep KF expand paused; do not confuse DISCOVERED graph edges with CERTIFIED IR.
