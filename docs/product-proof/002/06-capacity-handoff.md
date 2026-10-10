# Phase 5 — Capacity handoff

## Policy

Only verified, supported units with non-refused executable authority may enter `evaluateVerifiedCapacity`.

Deterministic offline compile sets every unit:

```
executableAuthority: "REFUSED"
```

## Observed outcomes

| Package | Attempted | Outcome |
|---|---|---|
| MTN regression | yes | `REFUSED_NO_VEP` |
| MHK holdout | yes | `REFUSED_NO_VEP` |
| Synthetic Acme test | yes | refuse / skip path |

Detail recorded in compile summaries:

> No verified IR units available; numerical capacity claims refused. Missing financial/utilization evidence would also refuse remaining capacity even if gross were modeled.

## What was not done

- No fabricated VEP
- No manufactured affirmative capacity number
- No utilization binding from missing 10-K/period inputs for holdout
- No Neon writes

This is a **safety success** for the handoff gate, not proof of numerical capacity.
