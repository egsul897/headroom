# Capacity status contract — alignment with PR #229

## Competing semantics found

| PR | Failed-gate status | Mechanism |
|---|---|---|
| **#229** (canonical A8-01/A8-02) | `CapacityStatus.NOT_SATISFIED` | `statusForAmount` floors when amount kind is `GATE_NOT_SATISFIED` |
| **#232** (prior) | `REVIEW_REQUIRED` + limitation `CAPACITY_GATE_NOT_SATISFIED` | Competing / weaker — conflates determined gate failure with review ambiguity |

## Resolution on this branch

Adopted **#229**’s `lib/contract-model/runtime/capacity/{state,types}.ts` and `a8-gate-status-regression.test.ts` as the single domain contract:

- `GATE_NOT_SATISFIED` amount → status **`NOT_SATISFIED`**
- Never `AVAILABLE`
- Not rewritten to `NOT_DETERMINED` solely because of the failed gate
- Aligns with transaction simulation’s `NOT_SATISFIED` / `CAPACITY_GATE_NOT_SATISFIED` limitation vocabulary
- Serialization / product consumers that key on `status === "AVAILABLE"` cannot treat failed gates as headroom

## Ownership

PR #229 claims exclusive ownership of capacity `state.ts` / `types.ts`. This branch **defers** to that contract; do not reintroduce `REVIEW_REQUIRED` as the failed-gate floor.
