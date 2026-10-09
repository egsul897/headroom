# P0 — Correctness blockers reconciliation

**Coordinate with:** A8-01 owner (Agent8 / capacity status), Phase 4D maintainers, utilization loader callers.

## 1. A8-01 — failed-gate AVAILABLE status

| | |
|---|---|
| **Defect** | Phase-4A returns `EXECUTABLE` + `CAPACITY{GATE_NOT_SATISFIED}`; `statusFromEvaluation` mapped that to `AVAILABLE`. |
| **Risk** | Conditional capacity read as open headroom. |
| **Fix (canonical = PR #229)** | Domain status `NOT_SATISFIED` via `statusForAmount`; published amount stays `GATE_NOT_SATISFIED`. #232 previously used competing `REVIEW_REQUIRED` — **removed**; capacity files adopted from #229. |
| **Test** | `a8-gate-status-regression.test.ts` + `capacity-state.test.ts`. |
| **Owner note** | Do not re-introduce AVAILABLE or REVIEW_REQUIRED as the failed-gate floor. |

## 2. Unknown-utilization handling

| | |
|---|---|
| **Defect** | Shared-constraint `currentUsage` defaulted to silent `0`. |
| **Fix (PR #227)** | `lib/solver/shared-usage.ts` + loader option `basketUsage`. Statuses: `COMPUTED`, `ZERO_NO_ATTRIBUTED_USAGE`, `EXTERNAL_INPUT_REQUIRED`, `ENTITY_CLASS_USAGE_UNAVAILABLE`. |
| **Remaining** | Product Position/Simulate/Ask callers must pass attributed usage; do not treat zero as proven empty. |

## 3. Phase 4D — financial chaining

| | |
|---|---|
| **Issue** | Chaining effects across legs without explicit multi-transaction statement invents pro-forma state. |
| **Disposition** | Phase 4D already requires caller-stated transactions for chaining (`09-pre-post-state.json`). Neon activation **does not** auto-chain or invent overlays. |
| **Activation rule** | Legacy simulate proofs are single-shot; favorable legacy clear ≠ 4D certified simulation. |

## 4. Phase 4D — restoration authority

| | |
|---|---|
| **Issue** | Basket restoration / reclassification without encoded authority. |
| **Disposition** | `08-reclassification-simulation.json`: only caller-supplied election against encoded Phase-3 edge; `NO_EXPLICIT_RECLASSIFICATION_EDGE` blocks. |
| **Activation rule** | Summaries never invent restoration edges. |

## 5. Authoritative exposure gate

Newly activated rules (MODELED / UNVERIFIED / LEGACY_ENGINE) must **not** be exposed as authoritative customer permissions until:

1. A8-01-class status honesty holds (done for GATE_NOT_SATISFIED).
2. Utilization attribution status is surfaced (done in helpers; product wiring pending).
3. Applicable financial inputs are approved (not synthetic).
4. Human review / certification gates appropriate to the surface are satisfied.

**CapacityAuthority labels:** `LEGACY_ENGINE` · `NOT_CERTIFIED_4E` · `DISCOVERY_ONLY` · `NONE` — never silently upgrade.
