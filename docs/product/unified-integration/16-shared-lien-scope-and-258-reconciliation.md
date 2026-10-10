# Shared-lien scope + PR #258 reconciliation (PR #253)

**PR:** https://github.com/egsul897/headroom/pull/253  
**Audited semantic-safety SHA:** `4ff3374a6d4e0ddbfe47ba7f2249b46e355932f5`  
**Disposition:** `SEMANTIC_SAFETY_ACCEPTED_INTEGRATION_REVIEW_PENDING`  
**Do not auto-merge.**

## Two different conservation surfaces

| Layer | What the four TX-engine tests prove | What they do **not** prove |
|-------|-------------------------------------|----------------------------|
| **Transaction engine (Phase 4D)** | Shared-capacity aggregation when debt+lien (or multi-member) draws hit one overlapping shared pool — excess fails closed; exact exhaust SATISFIED; historical usage counts; per-leg headroom alone is insufficient | Solver-side independent-lien conservation across elections |
| **Solver (election / service)** | Independent LIEN members on one shared constraint must not double-count to authorize secured debt above the shared remaining — remediated on #258 and reconciled here | Phase 4D shared-pool draw aggregation (already covered by TX tests) |

Evidence:

- TX-engine: `tests/contract-model/runtime/transaction/shared-lien-aggregate-conservation.test.ts` (4/4)
- Solver: `tests/solver/shared-lien-double-count-repro.test.ts`, `secured-debt-lien-adversarial.test.ts`, `secured-capacity-adversarial-matrix.test.ts` (from #258)
- Cross-layer boundary: `tests/solver/solver-to-simulation-shared-lien-boundary.test.ts`

## PR #258 reconciliation onto #253

Adopted onto `cursor/canonical-integrated-product-10ff`:

- `lib/solver/election.ts` — `assessIndependentLienCoverageForDebtLeg` + utilization fail-closed for independent liens / shared constraints
- `lib/solver/service.ts` — service wiring consistent with election conservation
- Adversarial / repro test suites listed above

EXECUTABLE bridge and exact path-selection protections from semantic-safety remediation are **preserved unmodified**.

## Cross-layer secured verdict

For a secured scenario with two independent $100 liens on one $100 shared cap proposing $150:

- Solver overall is **not** CLEAR; EXACT maximum (when present) ≤ 100
- Phase 4D dual draws 75+75 against $100 shared pool fail closed (`INSUFFICIENT_*`)
- Exact 55+45 exhaust is SATISFIED with aggregate usage 100
- Product `isAffirmativelyExecutable` remains false on capacity-only stubs

**Verdict:** `SOLVER_TO_SIMULATION_SHARED_LIEN_CROSS_LAYER_PASS` — no false CLEAR, no EXECUTABLE inflation, no inflated EXACT max on the tested boundary.

## Tracked register (unchanged)

Foundation FA-P1-01 / FA-P2-01 / FA-P2-02 and concurrency proof gaps (FA-CONC-*) remain in
`14-tracked-merge-blockers-and-limitations.md`. Green CI is **not** resolution of those defects.
OUT-VEP-01 and OUT-NS4-01 remain outstanding for authentic production remaining claims.
