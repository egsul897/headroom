# BLK-USAGE-ZERO — consolidated regression matrix

**Rule:** Unknown utilization must never silently become zero on any customer-reachable path.  
**Main:** `bae24ced` · **Related PRs:** #213 (overview), #215 (solver wire), Phase-4C `state.ts` (already safe)

## Path matrix

| # | Customer-reachable path | Entry | Main behavior | After #213 | After #215 | Required acceptance |
|---|---|---|---|---|---|---|
| U1 | Position capacity rows (Permission) | `lib/covenant-overview-builder.ts` `buildCapacityRowFromPermission` | `NOT_TRACKED` → `utilizationPct: 0`, `remaining: capacity` (**unsafe**) | `remaining/util null` (**safe**) | n/a | UI never shows 0% used / full remaining without attributed usage |
| U2 | Position capacity rows (legacy Provision) | same file `buildCapacityRowFromProvision` | same unsafe | null (**safe**) | n/a | same |
| U3 | Solver SharedConstraint loader | `loadCompanySolverStaticData` → `currentUsage` | hardcoded `0` | unchanged | Computes named-member usage **only if** `basketUsage` passed; else still `0`; status discarded | Must refuse / NOT_DETERMINABLE when status ≠ `COMPUTED` |
| U4 | Solver election shared remaining | `lib/solver/election.ts` uses `constraint.currentUsage` | inherits U3 zero | inherits | inherits residual | Cap − unknown must not yield favorable room |
| U5 | Legal-intel package path | `run-package-path.ts` `ledger = 0` | hardcoded 0 | unchanged | unchanged | Fail closed or explicit UNKNOWN |
| U6 | Phase-4C capacity state | `lib/contract-model/runtime/capacity/state.ts` | empty usage → `NOT_DETERMINED` (**safe**) | safe | safe | Keep; regression that empty ≠ AMOUNT(0) |
| U7 | Phase-4D verified simulate | `runtime/transaction/simulate.ts` | uses capacity state | safe if U6 | safe if U6 | Simulated AVAILABLE only with known usage |
| U8 | Ask / Simulate legacy bridge | #213 `legacy-simulate-bridge` / main simulate | Coherent path uses engine; util display from overview | overview honesty | n/a | Ask must not claim clearance from painted remaining |
| U9 | Unified customer façade | #221 `lib/product/unified-customer/**` | not on main | n/a | must consume U3 fail-closed | `MISSING_EVIDENCE` when usage unknown |
| U10 | SharedCapacityConstraint Neon rows | product DB (3 constraints) | loader zeros usage | — | optional wire only | Attributed events or refuse |

## Status after proposed P0 lands (#213 + #215 only)

| Safe | Still unsafe / incomplete |
|---|---|
| U1, U2 (with #213) | U3 default path (no basketUsage) |
| U6, U7 (main) | U3 EXTERNAL / ENTITY_CLASS (status ignored → 0) |
| | U5 run-package-path |
| | U4 when fed U3 zeros |
| | U9 until wired to fail-closed usage |

**Verdict:** Neither #213 nor #215 alone closes BLK-USAGE-ZERO. Together they close **Position display** and enable **named-member attributed usage**, but **do not** prevent false favorable solver capacity when usage is unknown.

## Required consolidated tests (WS-CAP ownership)

Place under `tests/product/capacity-validation/usage-zero-matrix.test.ts` (or extend #214 matrix):

1. Overview NOT_TRACKED ⇒ remaining/util null (pin #213).  
2. `loadCompanySolverStaticData` without basketUsage + NAMED_MEMBER constraint ⇒ capacity evaluation **refuses** or marks unknown (today fails — define #215b).  
3. With attributed basketUsage ⇒ usage = sum(outstanding) and remaining = cap − usage.  
4. EXTERNAL_INSTRUMENT_BALANCE without external balances ⇒ refuse (not usage 0).  
5. Phase-4C empty ledger ⇒ `NOT_DETERMINED` remaining (pin main).  
6. run-package-path must not pass numeric ledger 0 as known usage.  
7. Unified simulate (#221) with unknown usage ⇒ `MISSING_EVIDENCE` / not `SUPPORTED_PERMISSION`.

## #215b (mandatory follow-up — do not skip)

Owner: WS-CAP (+ Neon if touching loader).  
Change: propagate `SharedUsageComputationStatus` into solver static data; treat non-`COMPUTED` as unknown usage (fail closed). Do not keep `.usage` alone when status is `EXTERNAL_INPUT_REQUIRED` / `ENTITY_CLASS_USAGE_UNAVAILABLE` / `ZERO_NO_ATTRIBUTED_USAGE` if product interprets zero as known empty history.
