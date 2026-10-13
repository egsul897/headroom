# Canonical integration — executable financial path (PR follow-on)

**Tip at report:** see git HEAD on `cursor/afc-canonical-integration-45d6`.

## P0 — Conditional fulfillment

`lib/contract-model/runtime/input/information-request.ts` no longer treats
`status === CONDITIONAL` as implicitly usable. Unresolved CONDITIONAL /
OPTIONAL_FOR_BOUND_ONLY leaves block `executable` unless:

1. **PATH_IRRELEVANT** disposition with `branchLabel` matching `conditionalOn`, or
2. **SAFE_BOUND** disposition when `allowSafeBoundWithoutUnresolvedConditional`
   and `safeBoundAvailableWithoutThis` (REQUIRED leaves with a literal sibling
   remain REQUIRED for exact answers).

Adversarial suite: `tests/contract-model/runtime/input/conditional-fulfillment-adversarial.test.ts`.

## NS-4 bind + canonical path

- `lib/product/contractual-leverage/ns4-bind.ts` — APPROVED-only metric bind
- `lib/product/contractual-leverage/canonical-integration.ts` — components →
  FIXED_POINT / SUM EBITDA → leverage; Simulate handoff shares as-of identity;
  supersession invalidation helper

## Acceptance

`tests/product/canonical-financial-path-acceptance.test.ts` (requires `DATABASE_URL`).

Preserved: fulfillment join, FIXED_POINT_ADDBACK_CAP, Matthews uncapped SUM,
non-positive denominator boundary, gross ≠ verified capacity.

No self-merge. No production Neon writes. No parallel calculation engine.
