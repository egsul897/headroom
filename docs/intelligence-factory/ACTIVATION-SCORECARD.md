# Neon Activation — Scorecard (Repeatable Execution)

**As of:** 2026-10-09  
**Branch:** `cursor/neon-activation-repeatable-2229`  
**Paid inference:** $0  
**Neon corpus writes:** 0 (ephemeral E2E/matrix companies cleaned up)  
**Production Neon writes:** authorization-gated — none performed for promotion

## Required return

| # | Metric | Value |
|---:|---|---:|
| 1 | Authentic provisions tested | **11** |
| 2 | Correct formulas | **10** |
| 3 | Independently reviewed interpretations | **11** (pre-engine expecteds; **not** counsel certification) |
| 4 | Durable executable rules created | **0** production; **3** ephemeral MODELED/UNVERIFIED (cleaned up) |
| 5 | Actual vs synthetic financial examples | **0** actual / **11** synthetic (`SYNTHETIC_NUMERIC_INPUTS`) |
| 6 | Utilization-backed calculations | **1** (attributed); unattributed → `ZERO_NO_ATTRIBUTED_USAGE` |
| 7 | Correct executable outcomes | **9** |
| 8 | Correct refusals | **2** |
| 9 | False favorable outcomes | **0** |
| 10 | Current certification status | **NOT_CERTIFIED** — DISCOVERED/MODELED/UNVERIFIED only; VERIFIED ≠ CERTIFIED |
| 11 | CI, PRs, SHAs, cost | See below |

### Outcome breakdown (separate)

| Class | Count | Cases |
|---|---:|---|
| SUCCESS | 9 | fixed, EBITDA grower, asset grower, ratio debt, RP, investments, lien companion, shared util, amendment |
| CORRECT_REFUSAL | 2 | missing totalAssets; unsupported incremental |
| UNSUPPORTED_MECHANIC | 0 | — |
| ERROR | 0 | — |
| FALSE_FAVORABLE | 0 | — |

## PRs / SHAs / cost

| Item | Value |
|---|---|
| PR #225 | Synthetic extraction prose fix (merged into this branch) |
| PR #227 | Neon E2E activation proof (merged into this branch) |
| This PR | Repeatable activation: A8-01 + matrix + lifecycle/funnel |
| Paid inference | **$0** |
| Artifacts | `neon-activation-e2e-proof.json`, `neon-activation-matrix.json` |

## Before → after

| Metric | Before | After |
|---|---:|---:|
| Authentic agreements (hashes) | 708 | unchanged (inventory) |
| Structured provisions (summaries) | ~30,051 | unchanged — **≠ usable rules** |
| Cold-start extract threshold/formula/grant | 0/3 | **3/3** (#225) |
| CONMED E2E capacity proof | — | **$84M** (#227) |
| Diverse mechanic classes validated | 1 | **9 classes** (matrix) |
| A8-01 GATE_NOT_SATISFIED → AVAILABLE | defect | **FIXED → REVIEW_REQUIRED** |
| Silent-zero utilization | hardcoded 0 | **status-aware** |
| KF / SemanticTruth CERTIFIED | 0 | **0** (gate preserved) |

## Safety

- No silent promotion DISCOVERED → CERTIFIED
- Newly activated rules not exposed as authoritative customer permissions
- Legacy favorable output ≠ certified permission
- Numerical basket ≠ overall legal permission
- Phase 4D chaining/restoration: caller-stated / encoded-edge only (documented)

## Commands

```bash
npm run if:neon-activation-e2e
npm run if:neon-activation-matrix
npx vitest run tests/contract-model/runtime/capacity/capacity-state.test.ts tests/solver/shared-usage.test.ts tests/extraction/synthetic-formula.test.ts
```
