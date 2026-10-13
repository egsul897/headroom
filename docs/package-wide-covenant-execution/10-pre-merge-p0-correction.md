# PR #348 pre-merge P0 authority correction

**Base main:** `d924f5b6` (post-#332/#345; NS-4 + PAI preserved)  
**Audited implementation SHA (pre-correction):** `e4dd5a88`  
**Scope:** Fix in #348 only — no new engine / integration PR.

## P0-1 — Verified remaining authority

- Added `CrossDomainAuthoritySurface` (`PRODUCTION` | `TEST_DEMO`)
- `sanitizeUtilizationAuthorityForSurface` forces `allowSyntheticRemaining=false` and replaces caller `trustedIssuerAuth` with `resolveTrustedIssuerAuthFromHost()` on PRODUCTION
- Default surface PRODUCTION for `evaluateCrossDomainTransaction` / Simulate
- TEST_DEMO opt-in only for isolated harnesses
- Null remaining preserved when evidence incomplete

## P0-2 — Remove fixture EBITDA value matching

- `resolveContractualEbitdaEvidenceForPackage` binds by companyId + asOf / packageKey / document hints / snapshot identity
- Identical EBITDA across companies never selects foreign evidence
- Simulate uses identity resolver only

## P0-3 — Verified permission

- `packagePermitted` requires `verifiedExecution.executionStatus === EXECUTED_SATISFIED` **and** `productionAuthority === PRODUCTION_AUTHORITY_ACTIVE`
- Modeled `overallStatus` kept separate; clear/EXECUTABLE labels alone never permit

## Coverage matrix

Unchanged: **0 EXECUTABLE · 10 PARTIAL · 2 UNSUPPORTED**

## Local proof

- Focused product suites: 59 passed (cross-domain + adversarial + package-transaction + generalization)
- `tsc --noEmit`: clean
- `next build`: success
- Pre-existing on `origin/main` (not introduced here): `certified-simulate-executable-safety` (1) and `unified-transaction-execution` handoff (documented; out of #348 scope)
