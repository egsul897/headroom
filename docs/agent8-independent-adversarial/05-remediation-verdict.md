# A8-01 / A8-02 remediation verdict (post-fix)

## Before / after — original reproducer

Command: `npx tsx scripts/agent8-independent-adversarial/probe-gate-status.ts`

| Field | Before | After |
|---|---|---|
| `status` | `AVAILABLE` | `NOT_SATISFIED` |
| `gross.kind` | `GATE_NOT_SATISFIED` | `GATE_NOT_SATISFIED` |
| `rem.kind` | `GATE_NOT_SATISFIED` | `GATE_NOT_SATISFIED` |
| `simulate path` | `NOT_SATISFIED` | `NOT_SATISFIED` |

## Root cause

`statusFromEvaluation` mapped Phase-4A `EvaluationResult.status === "EXECUTABLE"` → `CapacityStatus.AVAILABLE` without consulting the evaluated capacity amount kind. A failed `UNLIMITED_CAPACITY` gate still evaluates (EXECUTABLE) but yields amount kind `GATE_NOT_SATISFIED`.

## Production fix

1. Extended `CapacityStatus` with domain-compatible `NOT_SATISFIED` (aligned with `CapacityAmount.GATE_NOT_SATISFIED` and transaction `NOT_SATISFIED`).
2. `statusForAmount` floors status when amount kind is `GATE_NOT_SATISFIED`.
3. Shared pools: on `OVER_CONSUMPTION`, withhold `remaining` as `NOT_DETERMINED`; keep deficit under new `overConsumption` + `provisional` fields (A8-02).

Files: `lib/contract-model/runtime/capacity/types.ts`, `lib/contract-model/runtime/capacity/state.ts`.

## Independent Agent 8 retest

| Metric | Value |
|---|---:|
| Cases | 32 |
| Passed | 32 |
| Incorrect favorable | **0** |
| Incorrect refusal | 0 |
| Release-blocking | **0** |
| Observations open | 0 |

## False-permission count (this remediation scope)

**0** after fix (was 1 status-layer false favorable: A8-01).

## Acceptance gate checklist

1. Original reproducer failed before, passes after — **YES**
2. No tested customer-reachable path emits AVAILABLE for unsatisfied gate — **YES** (see `04-available-consumer-audit.md`)
3. Legitimate favorable outcomes remain AVAILABLE — **YES** (regression cases 1, 2, 8; Agent 8 CORRECT_EXECUTABLE 16)
4. Independent adversarial tests pass — **YES** (32/32)
5. Coordinator integration / CI — evidence on this PR after push

## Exclusive ownership

See `03-remediation-ownership.md`. No automatic merge.
