# Completeness authority integration — #234 × #232

**Status:** Combined integration candidate  
**Base:** post-#229 `main`  
**Inputs:** #234 (`lib/capacity/*` completeness authority) + #232 (solver shared-usage + neon activation)

## Single remaining-capacity authority contract

| Flag | Semantics (identical across all consumers) |
|---|---|
| `supportsRemainingClaim` | Validated completeness certificate supports remaining. Attributed rows alone never set this. |
| `productionAuthoritative` | AUTHENTIC cert + trusted COUNSEL_REVIEWER / LEDGER_CUSTODIAN (session/service-account). |
| `currentUsageAuthoritative` | **Deprecated alias** of `supportsRemainingClaim` — never means attributedKnown-only. |
| `currentUsageSupportsRemainingClaim` | Solver mirror of `supportsRemainingClaim`. |
| `currentUsageProductionAuthoritative` | Solver mirror of `productionAuthoritative`. |

Canonical types/validators: `lib/capacity/*`.  
Solver consumption: `lib/solver/shared-usage.ts` (no duplicate certificate type).  
Product publication: `refuseAuthoritativeRemaining` / `buildSharedProductCapacityViews`.  
Solver remaining publication: requires **both** supportsRemainingClaim **and** productionAuthoritative.

## Trusted issuer identity

Production authority is **not** established by stuffing `issuer.role = COUNSEL_REVIEWER` into a certificate blob.  
`TrustedIssuerAuthorizationContext` must independently authorize `issuer.actorId` via `authorizeCompletenessIssuer` (`lib/capacity/completeness-issuer-auth.ts`).

## Fingerprint invalidation

Certificates bind: governing document version, ledger epoch, financial snapshot + as-of, amendment set, shared-capacity ids. Any mismatch stale-invalidates.

## No automatic merge / Neon writes / synthetic certification

This integration branch does not auto-merge, does not write unauthorized Neon rows, and does not treat synthetic certificates as production authority.
