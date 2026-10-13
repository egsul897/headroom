# #308 boundary — raw Phase-4 runtime imports (resolved)

Exact tip under test: see git HEAD.

## Defect (resolved)

`tests/contract-model/verified-execution.test.ts` §17 previously failed because:

- `lib/capacity/evaluate-verified-remaining-capacity.ts`
- `lib/capacity/ledger-utilization-bridge.ts`

imported `@/lib/contract-model/runtime/**` directly.

## Fix

- Capacity evaluation now calls `evaluateVerifiedCapacity` (REQUIRE) with paired
  `VerifiedUnitArtifact`s from the Agent-1 handoff.
- Ledger bridge and capacity types import from `verified-execution` /
  `north-star-bridge` only — never `contract-model/runtime`.
- EXEMPT list unchanged. No bypass of verified execution.

## CI disposition

- `capacity-path.yml` — approval provenance + verified remaining suites.
- `canonical-compiler.yml` certified path — §17 must pass on this tip.
- Absence of verification artifacts refuses Phase-4C evaluation (fail closed).

## Approval provenance (still required)

`projectFinancialSnapshotsFromSelection` continues to refuse manufactured
APPROVED snapshots without authentic `approvalProvenance` +
`productionAuthoritative`.
