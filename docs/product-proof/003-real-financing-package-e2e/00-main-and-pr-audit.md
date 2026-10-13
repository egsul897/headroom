# Main + open integration PR audit

**Evaluated main SHA:** `8374fa2a8697ce39b8ff6d63f6703ea2612b8545`  
**Tip merge:** PR #334 — NS-4 canonical product (`fix(ns4): persist delivery evidence and historical cutoff binding`)  
**Prior tip absorbed:** PR #333 — PAI-01–12 false authority / false remaining closure

## What “canonical main” means for this proof

This evaluation runs **only** code reachable from `origin/main` at the SHA above:

| Surface | Main status |
|---|---|
| Matthews authentic vertical slice | On main — `lib/product/real-dashboard-vertical-slice/*` |
| Unified verified transaction execution | On main — `lib/product/verified-transaction-execution/*` |
| Verified simulate bridge (fail-closed) | On main — `lib/product/unified-position/certified-simulate-bridge.ts` |
| Phase 4E path enumeration | On main — refuses without VEP |
| Phase 4C/4D capacity + simulate | On main (in-memory / REQUIRE gates) |
| NS-4 certificate / cutoff / delivery | Newly on main via #334 |
| Cross-domain Simulate v2 | **Open** PR #340 (not on main) |
| Contractual EBITDA → leverage AFC absorb | **Open** PRs #322 / #341 / #338 / #344 (conflicting cluster) |
| APPROVED financial authority gate | **Open** PRs #339 / #345 |
| Canonical absorb landing tips | **Open** PRs #343 / #345 |

## Open integration PR landscape (human-merge only)

Do **not** self-merge. Competing stacks must land through a single human-chosen tip.

| PR | Mergeable | Role | Recommendation |
|---:|---|---|---|
| **#345** | MERGEABLE | post-#334 absorb #335/#339 no-write + NS-4 authority gates | Strong landing candidate after #334 |
| **#343** | MERGEABLE | Canonical landing #335+#334+#336 identity | Overlaps #345 — pick one absorb tip |
| **#342** | MERGEABLE | NS-4 reconcile #334+#336 uniques | Rebase/close after chosen absorb tip |
| **#340** | MERGEABLE | Cross-domain Simulate + verified-remaining authority v2 | Merge **after** NS-4 absorb; delete competing v1 modules |
| **#344** | CONFLICTING | #338 gates on #341/#335/#339 | Wait for AFC/#341 resolution |
| **#341** | CONFLICTING | Absorb #322 AFC financial path + P0 IF re-eval | Needs rebase onto post-#334/#345 tip |
| **#339** | CONFLICTING | APPROVED-only from validated NS-4 | Absorbed by #345 path — prefer #345 |
| **#338/#337/#336/#335/#332/#327/#325/#322** | mostly CONFLICTING | Parallel AFC / leverage / dashboard forks | Supersede via chosen absorb sequence — do not merge independently |
| **#308** | CONFLICTING | Verified remaining capacity integration | Reconcile with #340 remaining authority |
| **#309** | MERGEABLE | Docs acceptance only | Non-blocking |

## PR sequence implied by this proof (human)

1. Choose **one** NS-4 absorb tip post-#334 → prefer **#345** (or #343 if human prefers that absorb matrix).  
2. Land **#340** cross-domain v2; close #336/#342 competing modules.  
3. Rebase **#341** AFC path onto the new tip; do not merge conflicting #322/#325/#327/#338 independently.  
4. Only then attempt authentic multi-domain transaction E2E with real certificates / completeness.  
5. **No self-merge** at any step.

## Anti-metrics (this mission)

Progress is **not** measured by:

- open or merged PR count
- synthetic Coherent / Stage-D demo package passes
- individual covenant-family library demos without package binding
- modeled leaf arithmetic alone without verified remaining + selected path
