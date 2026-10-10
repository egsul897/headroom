# Final #250 merge reconciliation and P0 correctness gate

## P0-A — Canonical tip reconciliation

| Item | Value |
|------|-------|
| Canonical PR | [#250](https://github.com/egsul897/headroom/pull/250) |
| Canonical branch | `cursor/unified-stage5-position-ask-f673` |
| Reported remediation SHA | `def5e4eca576705f5a52d08b8e0103dbcc21026e` |
| Actual PR head (pre-this-fix) | `f9b942e4d42971e2164edd6ff62874cb4d62cbed` |

**Finding:** Remediation was on the same branch. Tip advanced with two non-force-pushed commits after `def5e4eca`:

1. `37fc3ee5` — `fix(solver): reconcile #256 lien semantics onto #250 canonical`
2. `f9b942e4` — `fix(utilization): require authenticity + trusted issuer for production remaining`

P0 remediation commits (`592d53c8` … `def5e4eca`) remain ancestors of the tip. No tip mismatch across branches; no force-push required.

## P0-B — Shared lien constraint conservation

**Root cause:** While building `independentCoveragePool`, each independent LIEN applied `min(lienCapacity, sharedHeadroom)` using the full remaining headroom from `constraint.currentUsage` / `sharedConsumption`, but did **not** decrement a per-constraint remaining when counting one lien into the pool. Two liens on one `$100m` constraint therefore contributed `$100 + $100 = $200`.

**Reproduction (reference-calculated):**

- Shared constraint cap `$100m`, usage `$0` → headroom `$100m`
- Lien A / Lien B each FLAT `$500m`, debt FLAT `$500m`, request `$150m`
- Pre-fix: CLEAR @ `$150m`, EXACT max `$200m` (false favorable)
- Conserved reference: pool `$100m` → BLOCKED @ `$150m`; maxCapacity ≤ `$100m`

**Fix:** Track `sharedLienConstraintRemaining` keyed by constraint id while building the pool; capacity counted for one lien is subtracted before the next. Liens without a shared constraint remain additive.

## Preserved

- `isAffirmativelyExecutable` / SIMULATED+SATISFIED
- `PATH_NOT_FOUND` exact pathId
- LIEN excluded from debt principal
- Auto-lien eligibility re-evaluation
- Zero-probe maxCapacity clamp
- Ratio Debt per-leg lien path
- #237 utilization authenticity / trusted issuer (`f9b942e4`) and REQUIRE sequential boundary
