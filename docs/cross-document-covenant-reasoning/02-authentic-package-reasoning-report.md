# Agent 5 next mission — Authentic package reasoning

**PR:** https://github.com/egsul897/headroom/pull/218  
**Branch:** `cursor/cross-document-covenant-reasoning-5d11`  
**SHA:** `400f2abef7ea8a0fc386db577fdd1037fd007616`  
**Cost:** $0  

## Required return

| # | Metric | Result |
|---|---|---|
| 1 | Authentic vs synthetic scenario counts | **Synthetic (baseline):** 8 · **Authentic (EDGAR fixtures):** 6 · **Adversarial:** 10 (synthetic stress + authentic reuse) |
| 2 | Unseen packages evaluated | **CONMED** `conmed-2025-credit-facility` (CA Art VII + GCA); **DSGR** `dsgr-2022-2025-credit-facility` (2025 Second A&R). Neon `knowledge_sources` present (735) but CA+indenture pair evaluation used on-disk EDGAR fixtures (no invented Neon summaries). |
| 3 | Correct executable outcomes | Synthetic 8/8 · Authentic 6/6 · Adversarial 10/10 matched pre-declared expectations |
| 4 | Correct refusals | Absent ICA → UNDETERMINED; missing FCCR → not a grant; omitted Indenture cap → UNDETERMINED; secured without lien fit → CONDITIONALLY_PERMITTED / PROHIBITED as declared |
| 5 | Incorrect outcomes | **0** |
| 6 | False permissions | **0** (critical failure count) |
| 7 | Cross-document restrictions successfully identified | CONMED §7.2/7.3/7.6/7.8/7.2(l); DSGR §6.01/6.02/6.04/6.08/2.09; synthetic CA↔Indenture caps |
| 8 | Missed restrictions | **0** vs independent `mustCiteSectionRefs` |
| 9 | Numerical capacity calculations validated | `attachNumericalCapacity` via `evaluateProvision` / `computeCovenantPosition` / `simulateDebtIncurrence`; CONMED §7.2(o) $60M modeled; anti-stack notes preserved; non-numeric restrictions kept separate |
| 10 | Transaction-state transitions validated | Phase 4D `runFixtureCertifiedPath` + capacity-layer `prePost` / `verifiedSimulationResult`; **postsToLedger: false** |
| 11 | Production interface integration | PR #213 `unified-position` brought onto branch; `analyzeContemplatedTransaction` exposes `crossDocumentVerdict` + `legacySimulation` + `simulateHref` from the **same** draft |
| 12 | Tests / CI / PR / SHA / cost | See below |

## Priority 1 — Authenticity audit

See [`01-authenticity-audit.md`](./01-authenticity-audit.md).

**Correction:** PR #218’s eight scenarios are **SYNTHETIC** product-acceptance fixtures (Northfield / Granite Peak / Copperline), not EDGAR-authentic. Prior report language calling them “authentic fixtures” was wrong and is superseded.

## Priority 2 — Authentic packages

| Scenario | Package | Overall |
|---|---|---|
| auth-conmed-unsecured-general-basket | CONMED | PERMITTED |
| auth-conmed-secured-without-lien-path | CONMED | CONDITIONALLY_PERMITTED |
| auth-conmed-rp-basket | CONMED | PERMITTED |
| auth-conmed-nonguarantor-guarantee | CONMED | PROHIBITED |
| auth-dsgr-incremental-unevidenced | DSGR | CONDITIONALLY_PERMITTED |
| auth-dsgr-investment-lien-debt-bundle | DSGR | CONDITIONALLY_PERMITTED |

Ground-truth section cites were authored from operative source text **before** evaluator runs.

## Priority 3–4 — Capacity + 4D

- Composes Agent 3 / `covenant-engine` mathematics — no parallel calculator.
- Most restrictive modeled document capacity reported when sides are modeled; qualitative/intercreditor/guarantor limits stay non-numeric.
- Hypothetical debt sim updates leverage/ratio tests in memory only.

## Priority 5 — Ask / Simulate / Position

- Cherry-picked PR #213 `lib/product/unified-position/*` + Ask `legacySimulation` / `simulateHref`.
- Identical draft fields (`amountMillions`, `kind`, `secured`, `evaluationDate`) feed Simulate handoff and `crossDocumentVerdict.transaction`.

## Priority 6 — Adversarial

Ten attacks (omitted restriction, stale amendment, definition reclass, guarantor scope, debt without lien, double-count shared, missing ICA, missing metric, unverified pathway, conflicting classification) — **FP = 0**.

## Tests

```
npx vitest run tests/product/cross-document-covenant.test.ts \
  tests/product/cross-document-authentic-next.test.ts \
  tests/product/unified-position-handoff.test.ts
# 50 passed
```

Regression suite for the original eight scenarios preserved and green.
