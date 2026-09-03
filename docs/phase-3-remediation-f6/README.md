# Phase 3 Chewy Remediation 3: F-6 IR type-check degradation

Starting SHA `1a4070b020249157ab705dbb4244bb755072bd5f`. Zero paid calls.
Recorded compiler payloads only; the model was never rerun.

## Root cause

The type lattice conflated "type unknown" with "type invalid". A reference
with no `valueType` was defaulted to MONEY regardless of its slot, so
boolean predicates poisoned NOT/AND/OR/IF. Any honest UNSUPPORTED child
made the whole composite UNSUPPORTED, and normalization discarded it into a
diagnostic sidecar. The validator then reported the unknown-typed gate as a
TYPE_ERROR, failing the unit. Ratio gates, builder arithmetic,
shared-capacity definitions and 6.08 permissions all degraded this way.

## Fix (compositional, no new IR kinds)

- `analyzeType` separates UNKNOWN (unsupported child, known operands
  consistent) from CONFLICT (dimensionally inconsistent known operands).
- Normalization keeps a composite typed by its known part with the
  unsupported child in place; collapses only on CONFLICT or when no operand
  has a dimension. References with no `valueType` take the one dimension
  their slot fixes; explicit types are never overridden.
- Validation flags only real conflicts, plus FALSE_COMPLETENESS for a
  COMPLETE claim over an unsupported subtree.
- Pass C never credits an item whose most specific lineage is an
  UNSUPPORTED node.

## Artifacts

| File | Content |
|---|---|
| 01-reproduction-chewy-608.json | the 7 recorded F-6 expressions, raw payload, before-state, lost components |
| 02a / 02b | full Chewy replay before (starting SHA) and after |
| 03-failure-classification.json | A-G classification, earliest stage |
| 04-invariant-and-fix.json | invariant, type-system audit, shared-cap representation |
| 05a / 05b | corpus replay before and after (40 recorded payloads) |
| 06-same-root-search.json | same-root repairs across recorded outputs |
| 07-reference-608-rescore.json | frozen 6.08 reference items rescored (measurement only) |
| 08-tests-and-results.json | tests, suite results, verdict |

Verdict: **F6_CLOSED**.
