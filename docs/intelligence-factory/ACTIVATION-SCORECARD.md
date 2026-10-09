# Neon Activation — Scorecard (Correctness & Durability Gate)

**As of:** 2026-10-09  
**PR:** https://github.com/egsul897/headroom/pull/232  
**Depends on / includes:** #225, #227 (fully incorporated); capacity status aligned with #229  
**Paid inference:** $0  
**Neon corpus writes:** 0 (ephemeral only, cleaned up)  
**Production Neon writes:** authorization-gated — none for promotion

## Required return (correctness gate)

| # | Metric | Value |
|---:|---|---|
| 1 | Root cause of incorrect formula | **ROCK §2.01** prepayment incremental — not an incorrect parse; prior 10/11 was metric + mislabeled expected `FLAT_AMOUNT 0`. Actual = `KNOWN_NOT_MODELED` (justified exclusion). |
| 2 | Corrected formula accuracy | **10/10** among formula-applicable provisions (`matrixFullyCorrectFormulas: true`); 1 justified exclusion |
| 3 | Status-contract compatibility with #229 | **Aligned** — `GATE_NOT_SATISFIED` → `NOT_SATISFIED` (canonical); competing `REVIEW_REQUIRED` floor removed |
| 4 | Utilization integrity | Statuses: `VERIFIED_ZERO` / `COMPUTED` (authoritative); `ZERO_NO_ATTRIBUTED_USAGE` / `PARTIAL` / `EXTERNAL` / `ENTITY_CLASS` (non-authoritative). Loader attaches `currentUsageStatus` + `currentUsageAuthoritative`. |
| 5 | Durable activation readiness | Path exists; **blocked** by company/document binding + counsel ACCEPT + VERIFIED review. Pilot proposed in `DURABLE-ACTIVATION-PILOT.md` — no unauthorized writes. |
| 6 | Authentic vs synthetic financial coverage | Matrix: **0** actual / **11** synthetic. Separated authentic Matthews Q1 FY2025 test: **2** gross calcs + utilization non-claim. |
| 7 | False favorable outcomes | **0** |
| 8 | PR supersession analysis | #232 incorporates #225+#227; defers capacity files to #229; coordinates with #230/#220 — see `PR-SUPERSESSION.md` |
| 9 | Tests, CI, SHA, cost | See below; paid inference **$0** |

## Matrix outcomes

| Class | Count |
|---|---:|
| SUCCESS | 9 |
| CORRECT_REFUSAL | 2 |
| FALSE_FAVORABLE | 0 |
| ERROR | 0 |
| Justified formula exclusion | 1 (`rock-2.01`) |

## Tests

```bash
npx vitest run \
  tests/contract-model/runtime/capacity/a8-gate-status-regression.test.ts \
  tests/contract-model/runtime/capacity/capacity-state.test.ts \
  tests/solver/shared-usage.test.ts \
  tests/intelligence-factory/rock-2.01-incremental-refusal.test.ts \
  tests/intelligence-factory/authentic-financial-capacity.test.ts
npm run if:neon-activation-matrix
```

## Artifacts

- `FORMULA-DISCREPANCY-ROCK-2.01.md`
- `STATUS-CONTRACT-229.md`
- `UTILIZATION-INTEGRITY.md`
- `DURABLE-ACTIVATION-PILOT.md`
- `PR-SUPERSESSION.md`
- `neon-activation-matrix.json`
