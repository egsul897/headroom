# Cycle 3 — SharedConstraint currentUsage wiring

**Branch:** `cursor/shared-constraint-usage-wire-2229`  
**Paid inference:** $0  
**Neon mutations:** 0  

## Change

- Added pure helpers in `lib/solver/shared-usage.ts`:
  - `basketUsageFromAttributedEvents`
  - `computeSharedConstraintCurrentUsage`
- `loadCompanySolverStaticData` accepts optional `basketUsage` and sets `SharedConstraint.currentUsage` for **NAMED_MEMBER_CLAUSES** only.
- **EXTERNAL_INSTRUMENT_BALANCE** / **ENTITY_CLASS_FILTER** remain `0` (fail-closed; do not invent balances).
- Without `basketUsage`, behavior matches prior hardcoded `0` (Coherent/Matthews loaders unchanged).

## Validation

- Unit tests: `tests/solver/shared-usage.test.ts`
- Existing solver election/service tests remain green

## Not done (intentional)

- Auto-loading DebtEvents inside the Prisma adapter (attribution / circular-import caution)
- Wiring every product caller to pass basketUsage
- Entity-class outstanding debt measurement
