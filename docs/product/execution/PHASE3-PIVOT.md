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

## IPV-15 — CLOSED

Package `j-restricted-payments-builder` `certification:credit-agreement::7.08` now CERTIFIED:

- Faithful plan emits a BUILDER `sharedCapacity` (Available Amount) with local member `7.08(d)` instead of an invented `dependsOn` to `7.06(c)` (SA-1 preserved).
- Nested undefined-term scan recognizes IPV-09 plural surface forms (`Restricted Payments` → `Restricted Payment`) and keeps administrative denylist phrases (`Closing Date`) at LOW so the 7.08 bundle can be SUFFICIENT.
- IPV-10 preserved: `7.06(c)` stays REVIEW_REQUIRED for undefined Consolidated EBITDA / Consolidated Total Debt.

## IPV-16 — CLOSED

Unclassified side-letter / override path:

- Safe side-letter capacity capture derives superseding operative language when the override window has exactly one money figure (package M: `$15,000,000` on 7.01(b)); consents / multi-amount windows stay `newText` null (fail-closed).
- MUT-08/12/13/14/15/16 PRODUCT verdicts pass (instrument not RESOLVED; effect surfaced).
- INV-16b PRODUCT: override attached; derived `$15,000,000` (or preserved base when capture fails); clause/parent retrieval withheld.
- `operative:7.01(b)` SUPERSEDED by side-letter with `$15,000,000`; parent `semantic:7.01` still fail-closed while the override remains REVIEW_REQUIRED.
- Package-M `certification:7.02` REVIEW under `OPERATIVE_STATE_UNACCEPTABLE` remains correct fail-closed.

## IPV-19 — CLOSED

Definition amendments target DEFINITION (not whole Section 1.01). Quote-preferring capture + leading-`"` restore keep `"Term" means` matchable; pkg-i/m/h `semantic:*::1.01` compile every expected term. INV-05/05b PRODUCT failures cleared.

Also: inbound override retrieval for Article/section `notwithstanding` caps (INV-04 / 9.15 on package I).

## Queue (existing Phase 3 / legal excellence)

1. Keep CRITICAL_FALSE_PERMISSION at 0 on product-acceptance `run-all`.
2. Produce genuinely CERTIFIED executable provisions (authentic VerifiedExecutionPackage).
3. Integrate certified paths into Phase 4E + Ask Headroom without inventing capacity.
4. Optional later: derive superseding text for unclassified overrides; junior-debt family (IPV-18).

Primary work surface: PR #197 — not new storage.
