# Unified Product Integration — Stage 1 Dependency Map

**Integration branch:** `cursor/unified-product-integration-f673`  
**Baseline main:** `7f1dd3a202b026b9a862ef727480a1a9f284523a` (#237 merge)  
**Working tree:** clean at branch cut  
**Date:** 2026-10-10

## 1. Merged baseline (verified)

| Item | SHA / status |
|------|----------------|
| `origin/main` | `7f1dd3a202b026b9a862ef727480a1a9f284523a` |
| PR #229 (A8 capacity floors) | Merged; ancestor of main (`b99f934b`) |
| PR #237 (utilization authority) | Merged at main tip; canonical |
| PR #232 / #234 | **CLOSED / superseded** — do not merge |

Canonical utilization on main: `lib/capacity/utilization-authority.ts`, `utilization-resolver.ts`, `verified-remaining.ts`.

Canonical verified execution on main: `lib/contract-model/verified-execution.ts` (`evaluateVerifiedCapacity`, `simulateVerifiedTransaction`, `VERIFIED_EXECUTION_POLICY = "REQUIRE"`).

## 2. Candidate PR tips (rechecked)

| PR | Reported tip | Actual head | Match | Base | vs main |
|----|--------------|-------------|-------|------|---------|
| #223 | `c28f8b6b…` | `c28f8b6b…` | YES | main | +8 / −25 |
| #243 | `04677a62…` | `04677a62…` | YES | **#223 branch** | +13 / −25 |
| #220 | `744d371b…` | `744d371b…` | YES | main | +11 / −27 |
| #213 | `de5742a5…` | **`4ea51390…`** | **NO (moved)** | main | +7 / −0 (includes main) |
| #218 | `74aa2fba…` | `74aa2fba…` | YES | main | +17 / −27 |
| #233 | `325f6bb4…` | `325f6bb4…` | YES | main | +20 / −0 (includes main) |

**Stack proof:** `#223 tip` **is** ancestor of `#243 tip`. Integrate as one batch via #243 tip.

## 3. Overlap matrix (production paths, multi-PR)

| Pair | Hot overlaps | Risk |
|------|--------------|------|
| #223 ∩ #243 | sequential + verified-execution (stack) | Expected; take #243 |
| #218 ∩ #243 | `verified-execution.ts`, `capacity/state.ts`, `capacity/types.ts`, sequential runner | **High** — defer #218 until after #243; never take stale capacity |
| #218 ∩ #213 | Simulate/Ask UI, unified-position bridges | Stage 5 after Stage 4 |
| #233 ∩ #243/#223/#218 | `verified-execution.ts` only (companion-REQUIRES vs restore-authority) | Merge carefully in Stage 4 |
| #220 | Mostly greenfield `lib/financial-certificate-engine/**` | Low file overlap; Stage 3 |

### Critical file owners

| File | PRs touching vs main | Rule |
|------|----------------------|------|
| `capacity/state.ts` | #243, #218 | Keep **main #229 floors**; accept only #243 shared-cap unit-identity overlay |
| `capacity/types.ts` | #243, #218 | Prefer **byte-identical to main** |
| `verified-execution.ts` | #223/#243, #218, #233 | Stage 2: #243; later fold #233 companion + #218 only if nonduplicative |
| `capacity/graph.ts`, `rule-evaluator.ts` | #233 | Stage 4 |
| `lib/capacity/utilization-*` | none of open PRs | **main/#237 wins always** |

## 4. Stale / duplicate functionality

1. **#232 / #234 utilization** — superseded by #237 on main; discard competing authority from any branch.
2. **#218 capacity state/types** — based on pre-#229/#237 main; treat as stale for capacity; integrate only cross-document product modules.
3. **#223 alone** — obsolete as merge target; #243 supersedes.
4. **#213 reported tip `de5742a5`** — stale; use `4ea51390`.
5. **Product sequential runners that import runtime/capacity or runtime/transaction** — #243 routes through verified adapter; reject raw bypasses.

## 5. Selected integration sequence

1. **Stage 2 (now):** `#243` tip (= `#223` + verified sequential boundary) onto main → PR A  
2. **Stage 3:** `#220` financial certificate engine onto Stage 2 tip → PR B  
3. **Stage 4:** `#233` entity-scope/parent-scope + nonduplicative `#218` cross-document → PR C  
4. **Stage 5:** `#213` (current tip) Position/Simulate/Ask → PR D  
5. **Stage 6:** Independent acceptance across the stack  

Prefer small PRs; no automatic merges; no paid inference; no Neon writes.

## 6. Stage 2 preservation checklist

- [ ] `simulateVerifiedTransaction` / `evaluateVerifiedCapacity`
- [ ] `VERIFIED_EXECUTION_POLICY = "REQUIRE"`
- [ ] Architecture allowlist: only `verified-execution.ts` imports runtime execution surfaces
- [ ] Financial + ledger chaining across ≥2 sequential transactions
- [ ] Cross-rule / shared-capacity / restore / reclassification restrictions
- [ ] #229 fail-closed capacity statuses retained
- [ ] #237 utilization completeness untouched
- [ ] No customer-facing raw simulation/capacity bypass
