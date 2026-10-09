# Intelligence Factory — Cycle 2 Report

## Starting and ending SHA

- **Starting SHA:** `f7fc1e51a2e6e027854dbe79d2f4fef152ecd51d` (Cycle 1 tip / branch cut)
- **Ending SHA:** `278f5744b6b52f0bd06b1422acd9a1ad8b0a686c`
- **Related PR:** Cycle 1 baseline — https://github.com/egsul897/headroom/pull/210

## New agreements and provisions processed

- None ingested. Offline evaluation over existing Coherent seed + synthetic fixtures only.

## Corpus size and deduplication changes

- No corpus writes.

## Newly understood contractual mechanics

- Capacity matrix covers fixed, greater-of, grower (assets), ratio metrics/leaves, builder, document aggregates, shared-capacity headroom — with attempted vs skipped labeled.
- Cold-start: synthetic E2E works; real-prose synthetic extract fails formula/threshold fidelity.

## Genuine interpretation defects discovered

1. Synthetic extractor: `$X,000,000` unscaled (1e6×), always `FLAT_AMOUNT`, lien grantType miss, maintenance covenants invisible (no gap).
2. Gibraltar offline Pass A candidate count drift (711 vs 938).
3. Production `SharedConstraint.currentUsage` still unwired (matrix row skipped with explicit reason).

## Generalizable corrections

- Offline `if:capacity-math-matrix` emitter + regression test (no Neon, $0 inference).
- Cold-start readiness mapped onto existing status enums (no parallel status inventing).

## Capacity calculations independently validated

| Mechanic | Attempted | Passed | Skipped |
|---|---:|---:|---:|
| fixed | 1 | 1 | 0 |
| greater_of | 2 | 2 | 0 |
| grower | 2 | 2 | 0 |
| ratio | 5 | 5 | 0 |
| builder | 1 | 1 | 0 |
| document_aggregate | 6 | 6 | 0 |
| shared_capacity | 1 | 1 | 1 (loader unwired) |
| **Total scored** | **18** | **18** | simulations + out-of-scope skipped |

Artifact: `docs/intelligence-factory/capacity-math-eval-matrix.json`

## Regression and blind-holdout results

- Matrix vitest: pass
- Synthetic onboarding: 13/13
- Setup/analysis readiness: 4/4
- Gibraltar offline: 1 fail (count drift)
- Blind holdout customer package: not fully certified this cycle

## Customer cold-start performance

- Synthetic full workflow: **pass** (manual gates still required)
- Real-prose extract: recall 75%, formulaType 0/3, threshold 0/3
- Manual interventions: review, financials, facilities, certification, golden UNVERIFIED

## False permissions

- 0 in capacity matrix
- Extract path: precision 100% on section identity but wrong economic/formula semantics (would understate grower capacity if promoted blindly — fail-closed review status mitigates)

## Paid inference cost

- **$0**

## PR links and CI

- Cycle 1: https://github.com/egsul897/headroom/pull/210
- Cycle 2: this branch PR

## Next highest-value tasks

1. Wire `SharedConstraint.currentUsage` behind unit tests (Workstream D).
2. Extraction scale + greater-of + maintenance recognition (or authorized LLM eval).
3. Owner-gated UNKNOWN reclassify (13/180).
4. Customer-facing readiness assessment API using existing enums.
5. Rebaseline or fix Gibraltar Pass A discovery counts.
