# A8-01 / A8-02 — post-merge close (PR #229)

## Merge

| Field | Value |
|---|---|
| PR | https://github.com/egsul897/headroom/pull/229 |
| Merged at | 2026-10-09T23:10:20Z |
| Pre-merge tip | `b33f86554e398af4eb3204120b5f5046e21ffe7d` |
| Merge commit on `main` | `b99f934b1d94b2631fb40ba3ca131a914bef2370` |
| Pre-merge CI | 3/3 SUCCESS on tip (run 38001123584) |

## Post-merge verification on `main`

| Check | Result |
|---|---|
| `main` SHA | `b99f934b1d94b2631fb40ba3ca131a914bef2370` |
| `statusForAmount` present in `lib/contract-model/runtime/capacity/state.ts` | **YES** |
| `CapacityStatus.NOT_SATISFIED` in `types.ts` + precedence map | **YES** |
| Rule + shared publishers call `statusForAmount` | **YES** |
| Probe `npx tsx scripts/agent8-independent-adversarial/probe-gate-status.ts` | `status=NOT_SATISFIED`, amount `GATE_NOT_SATISFIED`, simulate `NOT_SATISFIED` |
| Targeted regressions | a8-gate-status-regression 13/13; Agent 8 adversarial 1/1; shared-and-ledger 21/21 (**35/35**) |

## Defect status

| ID | Status |
|---|---|
| **DEFECT-A8-01** | **CLOSED** (verified on `main`) |
| **DEFECT-A8-02** | **CLOSED** (verified on `main`) |

False-permission count (this remediation): **0**.

## Next priority (coordinator)

1. Eliminate remaining silent-zero utilization paths (`ZERO_NO_ATTRIBUTED_USAGE` / empty-ledger-as-zero).
2. Reconcile **PR #232** onto post-#229 `main` as the canonical Neon activation vehicle (do not re-land a second A8 capacity edit).
3. Coordinate **PR #234** (utilization resolver / verified remaining) with #232 solver utilization — one authoritative utilization contract.
4. Do **not** automatically merge unrelated PRs.
