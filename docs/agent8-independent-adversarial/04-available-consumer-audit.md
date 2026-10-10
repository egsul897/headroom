# Audit: `status === "AVAILABLE"` and favorable-status consumers

**Scope:** customer-reachable paths that could publish or act on a false favorable capacity status after A8-01.  
**Date:** 2026-10-09  
**Production fix:** `NOT_SATISFIED` capacity status when amount kind is `GATE_NOT_SATISFIED`.

## Production (`lib/`) hits

| Location | Role | False-AVAILABLE risk after fix |
|---|---|---|
| `lib/contract-model/runtime/capacity/state.ts` | Publishes `CapacityStateEntry.status` / `SharedConstraintState.status` | **Fixed** — `statusForAmount` floors `GATE_NOT_SATISFIED` → `NOT_SATISFIED` |
| `lib/contract-model/runtime/transaction/simulate.ts` | Consumes amount kind `GATE_NOT_SATISFIED` → effect `NOT_SATISFIED`; also reads `entry.status` into capacity effect metadata | Safe — simulate already refused on amount kind; status now agrees |
| `lib/product/north-star-workflow/authoritative-capacity.ts` | Product capacity entry; uses distinct `AuthoritativeCapacityStatus` (`CERTIFIED_EXECUTED` / `REVIEW_REQUIRED` / …), not Phase-4 `AVAILABLE` | No direct `AVAILABLE` check on Phase-4 capacity status |
| `lib/product/north-star-workflow/fixture-verified-package.ts` | Comment warning against treating AVAILABLE shared remainings as proven | Advisory only |
| `lib/covenant-research/knowledge-factory.ts` | Integration probe statuses (different domain) | Unrelated to capacity gate |
| `lib/contract-model/runtime/verification-gate.ts` | Floors via `CapacityStatus` dominance | Compatible with new `NOT_SATISFIED` precedence |

## App / UI

`rg` over `app/**` for `status === "AVAILABLE"` on capacity: **no hits**.

## Scripts / tests (non-customer)

Many harnesses assert `status === "AVAILABLE"` for *legitimate* favorable cases (Package F runtime, phase-4c gates). These must continue to pass when gates are satisfied — covered by A8 regression cases 1–2 and 8.

## Shared remaining consumers

| Location | Risk |
|---|---|
| `evaluateCapacityState` explanations `sharedConstraints[].remaining` | Now publishes withheld `NOT_DETERMINED` on over-consumption; deficit in `overConsumption`/`provisional` |
| Member `tighter()` bound | Uses `provisional.remaining` when withheld so pool still bounds members without exposing negative headroom on `remaining` |

## Conclusion

After the fix, **no tested customer-reachable path emits `AVAILABLE` for an unsatisfied mandatory gate**. Simulation and serialization agree with status. Legitimate favorable outcomes (satisfied gate, grower alternatives, healthy shared pools) remain `AVAILABLE`.
