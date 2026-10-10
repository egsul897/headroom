# Unified Product — Final Correctness Acceptance

**Branch:** `cursor/unified-stage5-position-ask-f673` (#250)  
**Starting tip:** `ac0ff92547d4b3154255a4dd9afae4a52d96f5a4`  
**Ending tip:** 

## Priority 1 — Coherent secured-debt solver defect

### Adopted from #231 (`ee460cc3`)

| Change | Location | Rationale |
|--------|----------|-----------|
| Per-debt-leg lien coverage for secured elections | `lib/solver/election.ts` | Engine-level: auto-lien on leg A does not cover debt leg B |
| CONCURRENT_COUNTED fixed+ratio `maxCapacity` | `lib/solver/election.ts` | Prevents summing standalones that share leverage headroom |
| `SOLVER_CLAMPED_TO_LEGACY` + `packageAuthoritative` | `lib/covenant-engine.ts` | Document/package ceilings fail-closed; labeled MODELED not CERTIFIED |
| Adversarial + election regression tests | `tests/solver/*` | Non-Coherent synthetic + gate0 liens |

### Superseded / not adopted

| Source | What | Why |
|--------|------|-----|
| #231 | Removal of `utilizationUnknown` / non-authoritative shared-usage fail-closed | Would regress **#237** |
| #231 | Deletion of `tests/solver/shared-usage.test.ts` | Preserve #237 |
| #231 | Wholesale financial-capacity-workflow product surface | Out of scope for this remediation |
| #251 (`887d7011`) | Presentation-only `CROSS_DOCUMENT_MODELED` floor without election lien gate | Insufficient alone; sequential stack already on #250 |

Independent expectation for synthetic package: Indenture SSNL room **$4,041M** binds secured; CA TNL-shaped **$5,129M** must not publish as secured package remaining. Proven via `capacityFormulas` + `computeCovenantPosition` / `computeRemainingCapacityAfterDebtIncurrence` — not a UI override.

## Priority 2 — Single utilization authority

`lib/financial-certificate-engine/utilization-honesty.ts` now **delegates** to `#237` `resolveUtilization`. No parallel completeness decision. Remaining requires approved attributed evidence + APPROVED completeness certificate.

## Priority 3 — Product consistency

`tests/product/unified-product-consistency.test.ts`: Ask draft ≡ Simulate handoff; verified refuse without VEP; FCE remaining uses #237.

## Explicit non-claims

- MODELED cross-document binding ≠ CERTIFIED / NS-4 approved permission
- Synthetic / evaluation-seed Coherent figures ≠ authentic Neon certification
- No auto-merge; no paid inference; no production Neon mutation
