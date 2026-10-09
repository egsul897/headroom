# Phase 3 pivot (post-A2)

**After:** A2 closed at merge `42bba2d3` — durable knowledge proven, not certified.  
**Do not:** start another knowledge-storage initiative or expand the dashboard.

## IPV-04 — CLOSED

Package `c-amendment-supersession` acceptance signatures now pass (`acceptance-runs/a3c6816922a7`):

- `context:C-7.01(b)-amended:definitions` — `Default` retrieved from amendment-aware OPERATIVE_SOURCE
- `certification:credit-agreement::7.01` — CERTIFIED
- `certification:credit-agreement::7.01(b)@clause` — CERTIFIED
- CFP **0/741**

Fixes that closed residual signatures (no test weakening):

1. Context retrieval scans `operativeItem.excerptText` for definitions (not base DESCENDANTS).
2. Descendant splice preserves trailing whitespace so restated clauses do not glue to the next enumerator.
3. Figure-role verification prepends PARENT_SCOPE lead-in so clause-only exception baskets are not UNCLASSIFIED.
4. Entity-scope lead-in markers recognized after `;` / `:`.

## Queue (existing Phase 3 / legal excellence)

1. Finish remaining OPEN residuals: **IPV-19**, **IPV-15**, **IPV-16** (priority order after IPV-04).
2. Keep CRITICAL_FALSE_PERMISSION at 0 on product-acceptance `run-all`.
3. Produce genuinely CERTIFIED executable provisions (authentic VerifiedExecutionPackage).
4. Integrate certified paths into Phase 4E + Ask Headroom without inventing capacity.

Primary work surface: PR #197 / #194 tip — not new storage.
