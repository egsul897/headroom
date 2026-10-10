# Unified Product Integration — Required Return

## 1. Current main SHA

`7f1dd3a202b026b9a862ef727480a1a9f284523a` (#237 utilization authority merge)

## 2. Exact PR ancestry and overlap matrix

| PR | Actual tip used | Ancestry notes |
|----|-----------------|----------------|
| #229 | merged (`b99f934b`) | On main |
| #237 | = main tip | Canonical utilization |
| #223 | `c28f8b6b…` | Ancestor of #243 |
| #243 | `04677a62…` | Stacked on #223; +13/−25 vs main |
| #220 | `744d371b…` | +11/−27 vs main; greenfield FCE |
| #233 | `325f6bb4…` | Includes main; Stage D |
| #218 | `74aa2fba…` | Selective intake only |
| #213 | **`696bd7fa…`** | Rechecked (reported `de5742a5` / `4ea51390` stale) |

Hot overlaps: `verified-execution.ts` (#243/#218/#233); `capacity/state|types` (#243/#218 — #218 refused); Ask/Simulate (#213/#218). Full matrix: `01-stage1-dependency-map.md`.

## 3. Integration sequence selected

1. Stage 2: #243 (=#223) → PR **#247**  
2. Stage 3: #220 → PR **#248**  
3. Stage 4: #233 + selective #218 → PR **#249**  
4. Stage 5: #213 → PR **#250** (full stack tip)  
5. Stage 6: independent acceptance on #250 tip  

## 4. Code changes and conflicts resolved

- **Stage 2:** auto-merge `state.ts` = main #229 floors + #243 shared-cap unit identity; `types.ts` byte-identical to main; `lib/capacity/*` untouched  
- **Stage 3:** clean merge; FCE added; authorities preserved  
- **Stage 4:** #233 auto-merge companion-REQUIRES + restore coexistence; #218 capacity/sequential **refused**; remediation R8 non-empty scope  
- **Stage 5:** conflicts in `transaction-analysis.ts` / `legacy-simulate-bridge.ts` / demo docs — #213 verified path + Stage 4 cross-doc Ask fields  

## 5. Integration PR links and SHAs

| Stage | PR | Branch tip |
|-------|-----|------------|
| 2 | https://github.com/egsul897/headroom/pull/247 | `0838455d0ef4a7336d998284bbfc2fb8585bd0a8` |
| 3 | https://github.com/egsul897/headroom/pull/248 | `dd727d2b7813d909331ce46dc2f2d28765749ec3` |
| 4 | https://github.com/egsul897/headroom/pull/249 | `f6322ed70f6712fda83504f7df7cd2360a717397` |
| 5 (full stack) | https://github.com/egsul897/headroom/pull/250 | **`230505709e4350eb6634b6f23d3032fc160dfa95`** |

## 6. Tests and CI results

Local on tip `23050570`:

- `tsc` pass  
- phase3-certification **481/481**  
- Product/financial/sequential/utilization/cross-doc/Stage D/unified-position: **pass**  
- Foundation-audit: 14 env timeout/flake failures (not integration regressions)  

CI: subscribed on Stage 2 + Stage 5 branches; human merge only after green.

## 7. Verified execution call graph

```
Ask / Simulate / Position
  → analyzeContemplatedTransaction / attemptVerifiedSimulate / certified-simulate-bridge
  → evaluateVerifiedCapacity / simulateVerifiedTransaction
       policy = REQUIRE (constant)
       → assertRestoreAuthority
       → buildCapacityGraph + evaluateCapacityState (+ #229 floors, #243 pool identity)
       → simulateTransaction (internal)
  → sequential-execution (product runner re-export)
       → same verified adapter for multi-step chaining
Utilization remaining claims → lib/capacity/utilization-authority (#237)
Cross-document conjunction → covenant-intelligence/cross-document-* (#218 selective)
Entity scope → entity-scope-guard + governing-scope parent chapeau (#233)
```

## 8. Remaining safety issues

1. FCE `utilization-honesty.ts` still mirrors #237 — must not be used as a second customer authority  
2. Coherent legacy-vs-solver remaining-capacity representational mismatch remains documented (`REPRESENTATION_DIFFERENCE_ONLY`) — not redesigned  
3. Foundation-audit DB race tests flake under 5s timeout in this environment  
4. No automatic merge; synthetic evidence not promoted to legal certification  
5. Customer-grade product readiness **not** declared  

## 9. Independent acceptance results

See `06-stage6-independent-acceptance.md`. False favorables checked: debt-only≠secured, missing VEP refuse, cross-doc FP=0, failed-gate not AVAILABLE, remaining without completeness refused. Expectations not rewritten.

## 10. Next smallest integration batch

1. Land stacked PRs #247→#250 after CI green (human merge)  
2. Collapse FCE utilization-honesty → #237 adapter  
3. Close superseded component PRs without merging stale capacity from #218  
