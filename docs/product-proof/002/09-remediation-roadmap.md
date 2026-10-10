# Remediation roadmap

## Completed this continuation

1. Diagnose and fix MHK structural heading zero-out (generalized NNBSP/WS).
2. Fixed-dollar basket vertical slice through existing IR architecture.
3. Independent fidelity + adversarial refuse-closed tests.
4. Wire slice into `compileFrozenDebtPackage` with production capacity refuse.
5. Replay MTN + MHK; separate discovery vs executable metrics.

## Recommended next bounded engineering task

**Owner: primary engineering (PP002 follow-on, not a new product-proof cycle unless authorized)**

Implement a second generalized family for **greater-of fixed-dollar vs % of Total Assets** (or facility-difference secured basket), with:

1. Source-backed formula IR using existing expression kinds only
2. Explicit refuse when Total Assets / Facility Amount inputs lack authenticated provenance
3. Shared-capacity conservation tests for linked debt↔lien baskets (MHK 7.01(u)↔7.03(g); MTN Liens(d)↔Debt(l))
4. No issuer hardcoding; replay MTN + MHK; keep production capacity refuse-closed

Do **not** start an unrelated third product-proof cycle from this handoff.
