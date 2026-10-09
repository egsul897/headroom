# Emergency reconciliation — 2026-10-09 (SUPERSEDES prior merge sequence)

**Coordinator:** WS-AEC · PR #216 · tip at publish time below  
**Main SHA:** `bae24ced33fdd6963d0615265a1e67cb181233e8`  
**Paid inference:** $0 · **Auto-merge:** forbidden  
**Supersedes:** `18-pr-integration-sequence.json` recommendedOrder from session start; `20-specialist-pr-wave` collision notes retained and expanded.

## A. Current main SHA

`bae24ced33fdd6963d0615265a1e67cb181233e8`  
Tip merges: #204 NS-4 sync/retrieval-index; #203 Phase 3→4; no specialist wave merged.

## B. Live PR status matrix (GitHub truth)

| PR | Head | Base OID | MergeState | Mergeable | Draft | CI | Files |
|---|---|---|---|---|---|---|---|
| #190 | `dea9b7346eef` | `2338e9e09fc9` | DIRTY | CONFLICTING | yes | PASS | 15 |
| #200 | `80f5d7339d07` | `6cd1dfeb9f31` | DIRTY | CONFLICTING | yes | FAIL | 100 |
| #205 | `bd3de2527e86` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 21 |
| #206 | `8b037d986bd9` | `bae24ced33fd` | UNSTABLE | MERGEABLE | yes | FAIL | 13 |
| #207 | `5fa7eb1f25a0` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 24 |
| #208 | `2b89c202956d` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 1 |
| #209 | `3652afa4724a` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 9 |
| #210 | `f7fc1e51a2e6` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 9 |
| #211 | `470fcdddf47f` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 9 |
| #212 | `6ae382e953de` | `f7fc1e51a2e6` (#210) | CLEAN | MERGEABLE | yes | PASS | 7 |
| #213 | `5df495300543` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 14 |
| #214 | `85e682effae5` | `bae24ced33fd` | UNSTABLE | MERGEABLE | yes | FAIL | 4 |
| #215 | `2f55ccbb538a` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 4 |
| #216 | `bcea445ed506` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 11 |
| #217 | `2867a241acb7` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 30 |
| #218 | `3fa338b6d0f3` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 7 |
| #219 | `80f9052f35af` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 9 |
| #220 | `49de9e7990b4` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS* | 23 |
| #221 | `1e45309580d7` | `bae24ced33fd` | CLEAN | MERGEABLE | yes | PASS | 24 |
| #222 | `2af660c06353` | `bae24ced33fd` | UNSTABLE | MERGEABLE | yes | PEND | 12 |
| #223 | `569ef3868fd4` | `bae24ced33fd` | UNSTABLE | MERGEABLE | yes | PEND | 12 |

All listed PRs remain **unmerged**. Do not treat historical handoffs as landed.

## C. Dependency graph (semantic)

```
P0 false-permission / unknown≠zero
  #213 (Position NOT_TRACKED→null) ──independent──┐
  #215 (solver basketUsage wire, PARTIAL) ─────────┼──▶ WS-CAP follow-up FAIL_CLOSED (#215b)
  #207 ──needs──▶ #205 (file base) ──▶ #211 (enumeration)
  #171 qualitative gate (CLEAN, adjacent)

P1 financial + utilization
  #190 (DIRTY) ──rebase──▶ main+#204
  #220 FCE ──collides──▶ #190 schema / #215 covenant-engine
  #205 authentic VEP path (synthetic CTA labeled)

P2 cross-doc + capacity
  #218 cross-document conjunction
  #214 capacity math matrix (CI FAIL — fix first)
  #209 Stage C ratio
  #223 txn effects

P3 unified surfaces
  #221 unified-customer façade (canonical UCP)
  #213 overview honesty — CHERRY-PICK into #221 or land before #221 rebase
  #206 txn-answer E2E (CI FAIL)

P4 Neon / intelligence
  #210 → #212 (stack) → #219 expansion (parallel OK)
  #217 Agent1 — REBASE after #210/#212 (progress-manifest collision)

HOLD isolated
  #200 DIRTY/FAIL · #136 · #163 · #135
```

## D. Superseded vs unresolved blockers

| ID | Status | Notes |
|---|---|---|
| A2 durable corpus | **SUPERSEDED / PASS** | Proven on main lineage; ≠ legal certification |
| Prior merge seq (208→210→205…) | **SUPERSEDED** | Incomplete fleet; replaced by this plan |
| BLK-USAGE-ZERO Position overview | **PARTIAL — fixed in #213 tip** | Main still paints remaining=capacity, util%=0 when NOT_TRACKED |
| BLK-USAGE-ZERO solver SharedConstraint | **UNRESOLVED (PARTIAL #215)** | Status discarded; empty basketUsage → usage 0; EXTERNAL/ENTITY still 0 |
| BLK-USAGE-ZERO run-package-path | **UNRESOLVED** | `ledger = 0` still on main; not in #213/#215 |
| BLK-USAGE-ZERO Phase-4C state.ts | **SAFE on main** | empty → `NOT_DETERMINED` |
| BLK-CROSS-RULE §7.2(c) | **UNRESOLVED** | Honest REFUSED; #205 §7.2(d) alternate |
| BLK-FILE-COLLISION-205-207 | **UNRESOLVED** | Still overlapping trees |
| BLK-DUAL-UCP-213-221 | **NEW** | Two unify PRs; #221 canonical; #213 honesty must not be lost |
| BLK-NEON-MANIFEST-217 | **UNRESOLVED** | #217 vs #210/#212 |
| BLK-PACKAGE-CERTIFIED CONMED | **UNRESOLVED** | PARTIAL certifyPackage |
| Agent1 50% FP | **NOT customer-reachable as stated** | CKG synthetic micro-controls (2 cases) |
| Agent5 FP=0 | **Suite-local** | 8 cross-doc scenarios; different path |

## E. Exact integration order (founder merge only)

1. **#216** coordinator reconciliation pack (this) — docs/tests only  
2. **#208** primary-engine audit — docs  
3. **#213** Position unknown-utilization honesty — **P0 customer UI**  
4. **#215** solver usage wire — **P0 partial**; require follow-up issue/PR **#215b** before claiming closed  
5. **#210 → #212** Neon stack  
6. **#205 → #207 → #211** authentic path + lien + Stage D honesty  
7. **#218** cross-document (after #211 preferred)  
8. **#221** unified-customer — rebase onto post-#213 main; absorb Ask/Simulate overlap  
9. **#209** Stage C ratio  
10. **#214** after CI green  
11. **#223** txn effects (rebase as needed)  
12. **#220** after #190 strategy (or thin FCE without store fork)  
13. **#190** rebase onto main  
14. **#217** rebase onto Neon tip  
15. **#219** Neon expansion — parallel after #210; owner-gated writes only  
16. **#206** after CI green + evidence discipline  
HOLD: #200, #136, #163, #135, #222 until certified-path/entity-scope green and non-duplicative

## F. File collision analysis (production)

| Files / area | PRs | Resolution |
|---|---|---|
| authentic-72d + capacity/graph + definition-graph | #205, #207 (+#200) | Land #205 then rebase #207 |
| verified-path-enumeration | #207, #211 | Sequence after #207 |
| `docs/intelligence-factory/progress-manifest.json` | #210, #212, #217 | Neon owns; #217 rebase |
| `package.json` | many | Last-writer rebase |
| `app/.../simulate/page.tsx`, `AskShell.tsx` | #213, #221 | #221 rebases; keep #213 overview null semantics |
| `lib/covenant-engine.ts` | #215, #220 | #215 first; #220 rebase |
| `prisma/schema.prisma` | #190, #220 | Coordinate NS-4 vs FCE |

## G. Customer-reachable false-permission analysis

See `22-usage-zero-regression-matrix.md` and § below.

**Confirmed customer-reachable risk on main today:** Position overview (`covenant-overview-builder.ts`) sets `utilizationPct: 0` and `remaining: capacity` when `usageState: NOT_TRACKED` — paints unknown usage as fully available. **#213 fixes this.**

**Confirmed residual after #215 alone:** `loadCompanySolverStaticData` takes only `.usage` from `computeSharedConstraintCurrentUsage`, discarding statuses `EXTERNAL_INPUT_REQUIRED` / `ENTITY_CLASS_USAGE_UNAVAILABLE` / `ZERO_NO_ATTRIBUTED_USAGE`. Solver can still treat unknown as zero. **Not closed.**

**Agent1 50% vs Agent5 0%:** not contradictory. Agent1 = CKG held-out **synthetic micro-controls** (2 FP cases, 1 miss → 50%), research eval, not Position/Simulate. Agent5 = 8 product-acceptance cross-doc scenarios, conjunction evaluator, FP count 0. Neither proves the other wrong. **Release blocker** remains the overview + solver unknown-as-zero paths, not the CKG 50% headline.

## H. End-to-end benchmark

See `24-e2e-benchmark-plan.md`. Package split: **Coherent** = engine-complete executable consistency; **CONMED** = authentic refusal / partial certification honesty. No fabricated successful CONMED clearance.

## I–J

Assignments + merge recommendations in `23-integration-plan-v2.md`.
