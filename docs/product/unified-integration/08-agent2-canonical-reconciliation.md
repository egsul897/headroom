# Agent 2 — Final Canonical Reconciliation (#252 → current #250 + #253 safety)

**Branch:** `cursor/fce-reconcile-onto-250-8d31`  
**Base:** current #250 tip (not stale `ac0ff925`)  
**Sources:** #252 FCE (`24ad7487`), #253 simulate safety (`e46dd9ea`), #250 secured-lien (`f0e46aa9`)

## Starting SHAs

| Tip | SHA |
|-----|-----|
| #250 (designated target) | `f0e46aa9a375ce79a6a97d0cb64eea520c9a00a9` |
| #252 (Agent 2; CONFLICTING vs tip) | `24ad74878286b85ee635adb016514ed50c18a103` |
| #253 (semantic safety) | `e46dd9ea762b52f085c26c6784245972c2bad750` |
| #252 original base (stale) | `ac0ff925` — **not** used as merge base |

## File matrix (pre-reconcile)

| File | #250 tip | #252 | #253 | Action |
|------|----------|------|------|--------|
| `utilization-honesty.ts` | #237 via `resolveUtilization`; hardcoded APPROVED/AUTHENTIC | `computeVerifiedRemaining`; defaults APPROVED/AUTHENTIC | old #234 mirror | **Rewrite** fail-closed `#237` adapter |
| `authority.ts` | `productionContext` alone → REAL | + `trustedProductionApprovalChannel` | same as #250 | **Take #252** + strict `=== true` |
| `verified-path.ts` | hand-rolled simulate loop | `runSequentialTransactions` REQUIRE | same as #250 | **Take #252** |
| `authentic-capacity-bridge.ts` | older | #237 notes + channel false | same as #250 | **Take #252** + trusted cert opts |
| FCE final-integration tests | absent | present | absent | **Take #252** + authority-defaults |
| `certified-simulate-bridge.ts` | older | n/a | EXECUTABLE gates + pathId | **Take #253** |
| `election.ts` / lien adversarial | **#250 P0** sufficient lien | n/a | divergent #253 variant | **Keep #250** |

## Adopted from #253

- Affirmative EXECUTABLE gates (VEP + capacity + simulation SATISFIED)
- Exact `pathId` match (no silent fallback)
- Simulation input validation (nonfinite/imprecise amounts, bad dates)
- `LedgerWriteResult` typing on sequential append surface
- `certified-simulate-executable-safety.test.ts`

## Kept from #250 (not superseded by #253)

- `fix(solver): require sufficient lien coverage for secured debt` (`f0e46aa9`)
- `tests/solver/secured-debt-lien-adversarial.test.ts`
- COUNTED / cross-document / #237 product wiring already on tip

## Authority-default remediation

Missing `approvalState` / `authenticity` → evidence excluded (never defaulted).  
Missing `gateSatisfied` → not affirmatively satisfied.  
Completeness cert requires `trustedCompletenessProvenance: true`.  
Reviewer booleans require both `productionContext === true` and `trustedProductionApprovalChannel === true`.
