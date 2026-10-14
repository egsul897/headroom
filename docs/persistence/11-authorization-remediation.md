# PR #294 authorization remediation

Tip under test: see git HEAD after this commit.

## Defects

### A. Completeness certificate authorization — FIXED
`getProductionEligibleCompletenessRecord` now requires `trustedIssuerAuth` and
`authorizeCompletenessIssuer` success. ACTIVE+AUTHENTIC caller fields alone return null.

### B. Manufactured approval timestamps — FIXED
`approvedAt` is never minted from `verificationStatus=VERIFIED`.
Only `approvalEvent` with non-UNAUTHENTICATED actor may set `approvedAt`.

### C. SSR readiness semantics — FIXED
Gate version `ssr-persisted-execution-gate.v2`.
Canonical field: `structuralRequestAssemblyComplete`.
Deprecated alias: `mayCallExecuteAndPersist`.
`gateSemantics: "STRUCTURAL_PREFLIGHT_ONLY"`.
Empty evidence objects and incomplete operative authority are explicit blockers.
Live Position/Ask/Simulate still do not call `executeAndPersist`.

## Tests (exact tip, local disposable Postgres)

See `docs/persistence/evidence/2026-10-11-auth-remediation-persistence.txt`
68/68 persistence tests passed including `authorization-adversarial.test.ts`.

## Also absorbed from #293

`offline-package-compile.ts` positive-confirmation identity gate
(absence of provisional ≠ confirmed).

## Verdict

`PR294_READY_FOR_HUMAN_REVIEW` for authorization remediation + persistence validation.
SSR production wiring remains `PERSISTENCE_READY_BLOCKED_ON_DEPENDENCIES`.
Do not merge until human review; prefer #293 merge first then rebase.
