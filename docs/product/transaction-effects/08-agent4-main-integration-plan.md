# Agent 4 → post-#237 main — separate integration plan

**Status:** planning only. Not authorized for merge into `main`.  
**Does not equate** PR #243 mergeability against the Agent 4 feature branch with readiness to land the complete stack on `main`.

## Current stack

| Layer | Branch / tip | Role |
|-------|----------------|------|
| Sequential boundary (#243) | `cursor/sequential-verified-boundary-8970` @ `04677a62d3da30ef3db2ff7b5809470ca97544e0` | Verified-only sequential composition |
| Agent 4 feature | `cursor/transaction-effects-covenant-state-8970` | Recipes + sequential demos (base of #243) |
| Integration trunk | `main` (post-#229 / #237) | A8 floors + utilization authority |

## Overlapping files (changed on both sides since merge-base)

These will require a deliberate merge when integrating Agent 4 (+ #243) onto `main`:

| File | Main side | Agent 4 / #243 side | Resolution rule |
|------|-----------|---------------------|-----------------|
| `lib/contract-model/runtime/capacity/types.ts` | #229 NOT_SATISFIED / overConsumption | **Already byte-identical** to main on #243 tip | Take main / already synced |
| `lib/contract-model/runtime/capacity/state.ts` | #229 A8 floors | main + shared-cap `unitId`/`unitIdentity` under REQUIRE | **Keep both:** A8 floors from main + #243 identity overlay only |
| `tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts` | Present on main | Present on #243 (from main) | Prefer main; ensure still green with identity overlay |

`git merge-tree` reports **`changed in both`** for the capacity surface — expected. No other two-sided overlaps detected at planning time.

## Main-only modules Agent 4 stack lacks (must land via merge, not rewrite)

Do **not** invent alternate utilization logic on the Agent 4 branch:

- `lib/capacity/utilization-authority.ts` (+ resolver / types / verified-remaining / product-capacity-view / index)
- `tests/capacity/utilization-and-remaining.test.ts`
- Related #232 / #234 consumers already on `main`

## Agent 4 / #243-only modules (additive on merge)

Safe to bring as new files if absent on main:

- `lib/contract-model/sequential-execution.ts`
- `lib/contract-model/restore-authority.ts`
- `lib/product/north-star-workflow/sequential-*`, `transaction-effect-recipes.ts`, `utilization-history.ts`
- `docs/product/transaction-effects/*`
- Sequential / boundary gate tests
- Additive edits to `verified-execution.ts` (REQUIRE + `chainFinancialViewWithScope` + type re-exports)

## Recommended integration sequence (when authorized)

1. Land / confirm #243 onto Agent 4 feature branch (human review of sequential boundary).
2. Open a **new** integration branch from `main` (post-#237). Do not expand #243 scope.
3. Merge Agent 4 tip into that branch (or rebase Agent 4 onto main — prefer merge for auditability).
4. Resolve `state.ts` by: start from `main`, re-apply **only** the shared-cap unit-identity block from #243; keep `statusForAmount` / overConsumption / provisional withholding untouched.
5. Confirm `types.ts` remains identical to main.
6. Take `lib/capacity/*` from main unchanged — no “fix” of utilization-authority during conflict resolution.
7. Re-run: architecture allowlist, certified-path, A8 regression, utilization-and-remaining, sequential boundary gate, shared-capacity artifact matrix, adversarial suites.
8. Human review of the integration PR; **no auto-merge**.

## Explicit non-goals for that future PR

- No certification bypass / ALLOW_MISSING on product paths
- No paid inference / production Neon writes
- No unrelated production module edits to “make merge green”
- No weakening of #237 unknown-versus-zero or completeness-certificate rules

## Remaining blockers (before main)

1. Human acceptance of #243 sequential boundary (this closeout).
2. Authorized integration PR onto post-#237 `main` following the sequence above.
3. CI green on the **integration** tip (not merely #243 vs Agent 4 feature base).
