# HEADROOM-1 — Next Bounded Family Handoff

**Status:** recommendation only — do **not** implement without a separate assignment.  
**Prepared after:** greater-of assets vertical slice on PR #266.

## Selection

**Next family: facility-difference secured-debt permissions**

Concrete authentic anchor: **MTN Permitted Debt (l)** — *Secured Debt … not to exceed the difference between the Maximum Facility Amount and the Facility Amount when incurred* — with **Permitted Liens (d)** as a secured-collateral adjunct (*Liens on the Collateral securing Debt … permitted by clause (l)*).

## Why this family (coverage + legal importance)

| Criterion | Facility-difference | Ratio-based debt | Builder baskets | Reclassification | Qualitative object-only |
|---|---|---|---|---|---|
| Authentic MTN/MHK presence | **Debt (l) + Liens (d)** on frozen MTN | Present but often maintenance/ratio tests outside basket IR | Sparse / complex on these packages | Sparse | Already partially gated as residuals on fixed-dollar / greater-of |
| Blocks false secured capacity | **Highest** — Liens (d) must not invent a second pool | High for leverage tests | Medium | Medium | Lower (already fail-closed as gates) |
| Reuses existing IR/engines | Difference / MAX / product limbs; needs MFA + Facility Amount resolution | Ratio IR exists elsewhere; different capacity story | New accumulation semantics | State-machine heavy | Already partially done |
| Upstream dependency | HEADROOM-2 for Adjusted EBITDA limb of MFA; HEADROOM-3 for amendment identity of Bond/facility docs | HEADROOM-2 heavy | HEADROOM-2 utilization | HEADROOM-3 | Low |

Facility-difference is the highest-value **remaining unsupported affirmative permission** on the MTN regression package that still produces secured borrowing headroom if mis-modeled. Greater-of TCA is now covered on MHK; fixed-dollar is covered; Liens (d) is **not** a mutual without-duplication shared TCA pool (confirmed: one-way “securing Debt permitted by clause (l)” — correctly **not** shared-capacity under HEADROOM-1 rules).

## Legal linkage finding (do not invent shared capacity)

| Pair | Source relationship | Model |
|---|---|---|
| MHK §7.01(u) ↔ §7.03(g) | Mutual `when combined (without duplication)` + reciprocal cites | **Shared capacity** (done) |
| MTN Liens (d) → Debt (l) | One-way permission to secure Debt under (l); capacity is the Debt (l) difference basket | **Dependent lien adjunct**, not a second independent dollar pool; **not** IRSharedCapacity of the MHK form |

## Bounded acceptance criteria (for the separate assignment)

1. Classify facility-difference issuer-agnostically (no MTN hardcoding).
2. Resolve `Maximum Facility Amount` and `Facility Amount` definitions (MFA’s greater-of $ / 3.50× Adjusted EBITDA remains metric-gated — refuse when EBITDA unauthenticated).
3. Independent fidelity: tampered difference limbs fail.
4. Liens (d) cannot manufacture capacity beyond Debt (l) remaining.
5. Preserve all five fixed-dollar + two greater-of verified-executable units; production refuse unchanged.
6. Adversarial: missing Facility Amount, stale EBITDA, FX, amendment conflict, double-count via Liens (d).

## Explicit non-goals for that assignment

- Ratio maintenance covenants as first slice
- Builder / grower accrual accounting
- UI / Neon / paid inference / certification promotion

## Owner boundaries

- HEADROOM-1: legal IR + fidelity for the difference formula and lien adjunct
- HEADROOM-2: authenticated Adjusted EBITDA / utilization for MFA grower limb
- HEADROOM-3: package/amendment identity for facility docs
- HEADROOM-5: holdout scoring after implementation
