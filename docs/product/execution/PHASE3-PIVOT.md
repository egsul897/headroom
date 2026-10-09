# Phase 3 pivot (post-A2)

**After:** A2 closed at merge `42bba2d3` — durable knowledge proven, not certified.  
**Do not:** start another knowledge-storage initiative or expand the dashboard.

## Active blocker being addressed

**IPV-04 residual (WRONG_OPERATIVE_SOURCE / fail-closed section certification)**  
Package `c-amendment-supersession`:

- Section operative splice largely fixed on PR #194 tip.
- **In progress fix:** `buildCovenantContextBundle` now scans `operativeItem.excerptText` (amendment-aware) for definitions instead of base `DESCENDANTS` — so restated provisos that introduce `Default` are retrieved. Regression: `section-operative-splice.test.ts` IPV-04 case.
- Still OPEN until acceptance signatures pass:  
  - `pkg-c-amendment-supersession` → `context:C-7.01(b)-amended:definitions`  
  - `pkg-c-amendment-supersession` → `certification:credit-agreement::7.01`

## Queue (existing Phase 3 / legal excellence)

1. Finish authentic-agreement acceptance residuals (IPV-04, then IPV-19/IPV-15/IPV-16 as OPEN on #194).
2. Keep CRITICAL_FALSE_PERMISSION at 0 on product-acceptance `run-all`.
3. Produce genuinely CERTIFIED executable provisions (authentic VerifiedExecutionPackage — currently 0).
4. Integrate certified paths into Phase 4E + Ask Headroom without inventing capacity.

Primary work surface: PR #194 (`cursor/covenant-retrieval-legal-excellence-8de2`) and NS product tip #192 — not new storage.
