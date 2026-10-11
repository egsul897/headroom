# Round 2 acceptance evidence hygiene

## Rule

Do **not** create endless documentation-only commits chasing self-referential tip hashes.

## Recorded SHAs (separate)

| Role | SHA | Notes |
|---|---|---|
| **Evaluated production code** (adversarial fixture + authority gates) | `60dbdeeeb1e067e1823972f2ea79ea5f3ba19f72` | Controlling for safety acceptance |
| **Acceptance HEAD** used in prior Round 2B | `40d26d308a00b18f8d01d8f020df6cca92a4d0ac` | Docs tip; production tree identical to `60dbdeee` for non-docs |
| **Frozen Round 1 legal-reference seal** | `393facc432182df08dae690e3fc0e751a4c3a410b71c0e7b93a54122915fa1bd` | Immutable |

## Regeneration decision (this consolidation)

**Skipped full Round 2 harness re-run for tip-stamp chase.**

Rationale (from prior independent reconciliation):

- Controlling artifacts (OA, clause coverage, adversarial matrix, case-level, capacity tracks) already reproduce identically.
- Only tip-SHA stamps / wall-clock noise differed.
- Regenerating again after every docs pin does not change acceptance semantics.

If humans want tip stamps refreshed once after #293 merges to main, run:

```bash
npx tsx scripts/agent-11/run-round-2-acceptance.ts
```

on the **post-merge main SHA**, and record that SHA as documentation-generation SHA separately from `60dbdeee`.

Frozen Round 1 inputs under `docs/agent-11-e2e-acceptance-round1-frozen/` must not be rewritten.
