# Utilization authority contract (reconciled #232 + #234)

**Status:** binding for the utilization integration batch  
**Main base:** post-#229 `b99f934b`  
**Implementation:** `lib/capacity/utilization-authority.ts`  
**Consumers:** `lib/solver/shared-usage.ts`, `lib/capacity/verified-remaining.ts`, debt-intelligence remaining publication

## Canonical kinds

| Kind | Meaning | Remaining claim? |
|---|---|---|
| `KNOWN_ATTRIBUTED` | Approved attributed usage sum is well-defined | **Only** with `VERIFIED_COMPLETE` cert |
| `VERIFIED_ZERO` | Affirmative empty ledger | **Only** with `VERIFIED_EMPTY` cert |
| `UNKNOWN` | Missing history / empty table / no attribution | **No** |
| `PARTIALLY_KNOWN` | Partial attribution, mixed currency, cert mismatch | **No** |
| `EXTERNAL_UNKNOWN` | External instrument / entity-class balances | **No** |
| `SYNTHETIC_ONLY` | Labeled synthetic evidence | **No** (unless test `allowSyntheticRemaining`) |

## Completeness certificates

| Certificate | Required evidence | Remaining |
|---|---|---|
| `VERIFIED_EMPTY` | No attributed active usage | remaining = gross (usage 0) |
| `VERIFIED_COMPLETE` | Attributed set is the full usage set | remaining = gross − attributed |

Approved individual ledger rows **never** establish completeness by themselves.

### Production-authoritative remaining (solver path)

An `APPROVED` certificate alone is **not** enough. Production-authoritative remaining requires:

1. `authenticity: "AUTHENTIC"` — **missing authenticity refuses** (coordinates with #241 authenticity gate).
2. Trusted issuer authorization via `TrustedIssuerAuthorizationContext` (`lib/capacity/completeness-issuer-auth.ts`, selective port from #244) — caller-supplied `issuer.role` alone never suffices.
3. Demo/synthetic remaining only via explicit `allowSyntheticRemaining` + `SYNTHETIC_LABELED` (never production).

**Activation requirement (documented, not wired here):** production identity-provider → `TrustedIssuerAuthorizationContext` host wiring remains outstanding until real attestations are enabled. No broad utilization refactor; #237 authority bridge preserved; #244 is a source of improvements, not a merge candidate (#250 remains canonical product integration).

### Identity-provider activation status (cross-surface gate)

| Host path | Supplies `trustedIssuerAuth`? | Production remaining today |
|---|---|---|
| `loadCompanySolverStaticData` / `buildSolverContext` | **No** — option exists; prod callers omit | Fail-closed (`currentUsageAuthoritative=false`) |
| Position / Simulate / Ask via `buildSharedProductCapacityViews` | Caller must supply; app pages currently unwired to shared views | Refuse via `refuseAuthoritativeRemaining` |
| `resolveUtilization` / debt-intelligence | Option exists; production passes null certs + no auth | Fail-closed |

**Smallest future activation requirement:** host session / service-account lookup that builds `productionTrustedIssuerAuth([{ actorId, authorizedRoles, identityAssurance: "SESSION_AUTHENTICATED"|"SERVICE_ACCOUNT", status: "ACTIVE" }])` from independently authenticated identity — never from the certificate blob's `issuer.role`. Fixture identities (`TEST_FIXTURE_REGISTRY`, `SYSTEM_FIXTURE`) must not enable production authority.

### Live Position / Simulate / Ask routes (not only shared helpers)

| Route | Calculator | Production-authoritative utilization remaining? |
|---|---|---|
| Position (`getCompanyDashboard` → `computeRemainingCapacityAfterDebtIncurrence`) | LEGACY / modeled gross − amount | **No** — `utilizationRemainingAuthority: NOT_PRODUCTION_AUTHORITATIVE`; UI labeled MODELED |
| Simulate (`simulateDebtIncurrence`) | LEGACY clear vs gross capacity | **No** — clear is contractual vs modeled capacity; Ask bridge labels `LEGACY_ENGINE · NOT_CERTIFIED_4E` |
| Ask (`analyzeContemplatedTransaction` / legacy-simulate-bridge) | Same LEGACY path | **No** — `authority: LEGACY_ENGINE` |
| Shared views (`buildSharedProductCapacityViews`) | Completeness + trusted issuer | Only when AUTHENTIC + trusted issuer; else `refuseAuthoritativeRemaining` |

Do not treat an unused shared-view helper as production protection for pages that still call LEGACY calculators.

## Solver status mapping

| Solver `currentUsageStatus` | Authority | `currentUsageAuthoritative` |
|---|---|---|
| `ZERO_NO_ATTRIBUTED_USAGE` | UNKNOWN | false |
| `PARTIAL_ATTRIBUTED_USAGE` | PARTIALLY_KNOWN | false |
| `ATTRIBUTED_INCOMPLETE` | KNOWN_ATTRIBUTED without cert | false |
| `VERIFIED_ZERO` | VERIFIED_ZERO + EMPTY cert | true |
| `COMPUTED` | KNOWN_ATTRIBUTED + COMPLETE cert | true |
| `EXTERNAL_INPUT_REQUIRED` / `ENTITY_CLASS_USAGE_UNAVAILABLE` | EXTERNAL_UNKNOWN | false |

## Product publication

- `computeVerifiedRemaining` → `mayPublishAvailable` only when gate satisfied **and** remaining supported.
- Debt intelligence must not publish `remaining` / `COMPUTED` basket status from empty or unattributed ledgers.
- Synthetic evidence cannot publish AUTHENTIC AVAILABLE.

## Non-goals

- Does not weaken A8-01 `CapacityStatus.NOT_SATISFIED` / `statusForAmount` (byte-identical to #229 on this branch).
- Does not auto-merge #232 or #234 as independent PRs.
