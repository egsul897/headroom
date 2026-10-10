# CONMED §7.6 targeted correction

**Legal finding (independent fixture review):** §7.6(d)’s $40M annual basket is not an absolute Restricted Payment ceiling. §7.6(e) separately permits unlimited RPs subject to Consolidated Senior Secured Leverage Ratio ≤ 3.50x pro forma and no continuing/resulting Event of Default.

## Changes

1. **GT revised** — `gnd-conmed-76-above-45m` expected `CONDITIONALLY_PERMITTED` (selected-basket insufficiency ≠ whole-transaction PROHIBITED when §7.6(e) is unevidenced).
2. **New cases**
   - `gnd-conmed-76d-only-45m` — §7.6(d) only (exclude §7.6(e)) → `PROHIBITED`
   - `gnd-conmed-76e-unknown-45m` — §7.6(e) conditions unknown → `CONDITIONALLY_PERMITTED`
   - `gnd-conmed-76e-satisfied-45m` — CSSLR≤3.50 + no EOD affirmed → `PERMITTED`
3. **Production evaluator** — Investment (§7.8) PERMISSION facts are `INAPPLICABLE` as OR pathways for `RESTRICTED_PAYMENT` kind (cross-family OR blocked). §7.6(e) fact added to CONMED authentic provisions; knownFacts support for senior secured leverage / Event of Default.
4. **Standing allowlist** — `gnd-conmed-76-above-45m` removed from `KNOWN_STANDING_INCORRECT_FAVORABLES`.

## Production-facing?

**Yes** — `lib/product/covenant-intelligence/cross-document-covenant.ts` (Investment cross-family applicability + condition evidence for leverage/EOD) and CONMED authentic package provisions (`7.6(e)`). Soft gates / cert hardness unchanged.
