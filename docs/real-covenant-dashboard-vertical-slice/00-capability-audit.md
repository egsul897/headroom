# Capability audit — debt docs → Position (canonical #293 tip)

**Branch:** `cursor/real-covenant-dashboard-vertical-slice-2ca3`  
**Base tip:** `origin/cursor/canonical-product-integration-5a28` (#293)  
**Classification:** IMPLEMENTED · CONNECTED · VERIFIED · PARTIAL · BLOCKED

## Dual stack (actual)

There are two stacks. They share libraries but do not meet at Position unless explicitly bridged.

| # | Stage | Status | Notes |
|---|---|---|---|
| 1 | Debt-document ingestion / package loading | **IMPLEMENTED** + **VERIFIED** (offline sealed) · **PARTIAL** (live SaaS) | `compileFrozenDebtPackage`; sealed fixtures under `tests/fixtures/unseen-packages/*` and product-proof sources. Live upload ≠ IR→Position. |
| 2 | Covenant discovery / clause catalog | **IMPLEMENTED** · **VERIFIED** (Pass A) · **PARTIAL** (Pass B unpaid) | Catalogs + structural parse. Synthetic Pass B when unpaid. |
| 3 | Operative authority | **IMPLEMENTED** · **CONNECTED** · **PARTIAL/BLOCKED** per package | `#274/#283` handoffs. AutoNation restatement REVIEW_REQUIRED. Caveats never promote to PRODUCTION_AUTHORITY_ACTIVE. |
| 4 | Legal context / definitions | **IMPLEMENTED** · **PARTIAL** · often **BLOCKED** sufficiency | WOR/AN: SUFFICIENT 0/10 under budget. |
| 5 | Verified rule IR | **IMPLEMENTED** · **VERIFIED** (fixed-dollar / greater-of slices) · **BLOCKED** → Position | MTN/MHK hypo VE; production capacity refused. |
| 6 | Financial statement evidence | **IMPLEMENTED** · **CONNECTED** · **BLOCKED** production | `#290` normalize path. Matthews AUTHENTIC fixture present; AN missing. |
| 7 | Utilization reconstruction | **IMPLEMENTED** · **CONNECTED** · **BLOCKED** remaining | UNKNOWN ≠ zero. Completeness cert absent on Matthews slice. |
| 8 | Capacity evaluation | **IMPLEMENTED** · **VERIFIED** (hypo/modeled) · **BLOCKED** production | Canonical engines only. IdP + trusted-issuer BLOCKED. |
| 9 | Position / dashboard | **IMPLEMENTED** · **CONNECTED** to legacy + **this bridge** · **BLOCKED** production remaining | Position uses covenant-engine; authentic Matthews slice now bridges via `loadAuthenticDashboardSlice`. |

## Blocked handoffs (preserved)

1. Offline compile → Neon Position DB (no writes without authorization).
2. Verified IR / VEP → Position remaining (still not the live engine path for IR).
3. Vertical-slice VE → PRODUCTION capacity (AUTHENTICATED_APPROVED + completeness required).
4. Trusted issuer / IdP → PRODUCTION_AUTHORITY_ACTIVE (`BLOCKED`).
5. UNKNOWN utilization → numeric remaining (refused; never zero).

## This mission's bridge

`lib/product/real-dashboard-vertical-slice/*` connects authentic Matthews financial+utilization fixture + populate-script permission formulas through **existing** `evaluateProvision` / capacity libs / `buildPositionView` into Position UI — without a second capacity engine and without Neon writes.
