# #308 boundary blocker — raw Phase-4 runtime imports

Exact tip under test: see git HEAD.

## Defect (pre-existing on Agent 2 integration; exposed by CI)

`tests/contract-model/verified-execution.test.ts` §17 fails:

- `lib/capacity/evaluate-verified-remaining-capacity.ts`
- `lib/capacity/ledger-utilization-bridge.ts`

Both import `@/lib/contract-model/runtime/**` directly. Product surfaces must
use `lib/contract-model/verified-execution.ts` (`evaluateVerifiedCapacity`) —
not raw `buildCapacityGraph` / `evaluateCapacityState`.

## CI disposition

- Dedicated workflow `.github/workflows/capacity-path.yml` runs capacity suites
  (approval provenance + verified remaining) provider-free.
- Do **not** merge #308 to main until capacity evaluation is routed through the
  verified-execution boundary (or an equivalent fail-closed adapter). Do not
  weaken the §17 test / EXEMPT list.

## Approval provenance (still required)

`projectFinancialSnapshotsFromSelection` continues to refuse manufactured
APPROVED snapshots without authentic `approvalProvenance` +
`productionAuthoritative`.
