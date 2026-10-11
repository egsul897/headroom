# Canonical Product Integration — PR-to-main Reconciliation Register

**Starting SHA (`origin/main`):** `4f1a0b81207364373d9a4cb9fe515d4a1a002e56`  
**Integration branch:** `cursor/canonical-product-integration-5a28`  
**Date:** 2026-10-10  
**#246:** FROZEN (not merged)  
**#281:** SUPERSEDED / CLOSED (not merged; #290 used instead)

| PR | Source tip | Merge disposition | Changes accepted | Changes rejected | Reason |
| --- | --- | --- | --- | --- | --- |
| **#291** | `786d7643` | **ACCEPTED** (merge) | Disposable EVAL Postgres persistence verification docs + vitest/migrate evidence | None | Docs/evidence only; closes #274 live-DB gap; no production Neon writes |
| **#290** | `a3706771` | **ACCEPTED** (merge) | `financial-statement-ingestion.ts`, `utilization-evidence-reconstruction.ts`, Matthews fixture, slice tests, contract docs | Re-port of #279 financial-evidence core | Compatible pathway atop post-#279 main; UNKNOWN≠zero preserved |
| **#282** | `2c575a22` | **ACCEPTED** (merge + `lib/capacity/index.ts` resolve) | Full `lib/capacity/identity/*`, adversarial tests, IdP workstream docs | Inventing a production IdP; flipping activation to ACTIVE | Fail-closed boundary; production activation remains BLOCKED |
| **#283** | `dee2545d` | **ACCEPTED** (merge) | `lib/contract-model/compiler/operative-authority/*`, WOR Fourth/Fifth tests, offline-compile wire-in, docs | Package-graph rewrite; silent CP satisfaction | Confirmed vs provisional preserved; WITH_CAVEATS ≠ unconditional production |
| **#287** | `b2bff75e` | **ACCEPTED** (merge; was 53 behind, ort clean) | `body-anchor.ts`, `manifest.ts`, recursive closure deltas, WOR diagnostic, tests/docs | Threshold lowering to improve SUFFICIENT scores | WOR baseline 1/10 SUFFICIENT / 9/10 REVIEW_REQUIRED / 0 false SUFFICIENT preserved |
| **#285** | `5a3cc982` | **ACCEPTED** (merge + integration wiring) | `lib/product/verified-transaction-execution/*`, unified tests, call-graph docs, trace script | New solver / parallel capacity engine / production shortcuts | Single entrypoint `executeUnifiedVerifiedTransaction`; engines reused |

## Integration-only deltas (this tip)

Beyond raw PR merges:

1. **`lib/capacity/index.ts`** — keep both #290 ingestion/reconstruction and #282 identity exports.
2. **`adapters/operative-authority.ts`** — project #283 `GoverningProvisionResolution`; call `evaluateProductionAuthorityPromotion`; expose caveats/CP.
3. **`execute.ts` / `types.ts`** — await `#282 authorizeDecision` before evidence gates; refuse PRODUCTION_AUTHORITY while IdP activation BLOCKED; surface #283 promotion refusals.
4. **`executeUnifiedVerifiedTransaction` → async** — required to await identity authorization without inventing a sync bypass.
5. **`tests/product/canonical-product-integration-adversarial.test.ts`** — twelve required fail-closed cases + WOR WITH_CAVEATS projector pin.
6. **This docs pack** — register, call graph, test report, traces, blockers, Round 2 handoff, merge checklist.

## Already on main (not re-merged)

#268, #274, #266, #279, #280, #278, #289, #276/#277 foundations (`evaluateVerifiedCapacity`, `simulateVerifiedTransaction`, trusted-issuer host, package-graph persistence, WOR holdout docs).
