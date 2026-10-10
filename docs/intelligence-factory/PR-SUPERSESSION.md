# PR supersession / incorporation analysis

## Does #232 fully incorporate #225 and #227?

**Yes — commit ancestry.**

| PR | Head / tip incorporated | Ancestor of #232 branch tip? |
|---|---|---|
| #225 `cursor/synthetic-extraction-prose-fix-2229` | `d2d1dca0` | **Yes** |
| #227 `cursor/neon-activation-e2e-proof-2229` | `8b81dffb` | **Yes** (via merge commit `3ad21ed1`) |

### File-level (#225 contents present on #232)

- `lib/extraction/synthetic-formula.ts`
- `lib/extraction/synthetic-provider.ts`
- `tests/extraction/synthetic-formula.test.ts`
- `docs/intelligence-factory/EXTRACTION-PROSE-FIX.md`
- `scripts/onboarding-precedent-acceptance.ts`

### File-level (#227 contents present on #232)

- `lib/solver/shared-usage.ts` (extended further on #232 for utilization integrity)
- `lib/covenant-engine.ts` (basketUsage loader options)
- `scripts/intelligence-factory/neon-activation-e2e-proof.ts`
- `docs/intelligence-factory/neon-activation-e2e-proof.json`
- `tests/solver/shared-usage.test.ts`

#232 **supersedes** #225/#227 for merge order if landed together; landing #232 alone is sufficient for their file contents. Prefer closing #225/#227 as superseded-by #232 once CI is green, or merge them first then #232.

## Coordination — #229 (Agent 8 A8-01/A8-02)

| Topic | Disposition |
|---|---|
| Status | **MERGED** to main (`b99f934b`). Do **not** close or supersede. |
| Capacity `state.ts` / `types.ts` | Live on main; #232 rebased onto main and keeps files byte-identical. |
| Provenance | Preserve #229 merge commit history. |

## Coordination — #230 (Agent 3 authentic capacity matrix)

| Topic | Disposition |
|---|---|
| Overlap | Authentic Coherent/Matthews gross capacity evaluation; utilization blocker agrees with our audit |
| Reuse | Same `evaluateProvision` leaf; do not fork math |
| Difference | #230 focuses VERIFIED company Permissions + FinancialSnapshot; #232 focuses Neon summary → counsel compile path |
| Action | Reuse #230 authentic execution results; do not duplicate matrix. Remaining-capacity claims blocked until attributed usage (shared finding). |

## Coordination — #220 (Agent 2 financial certificate engine)

| Topic | Disposition |
|---|---|
| Overlap | Authentic Matthews/Coherent financial fixtures; capacity bridge |
| Reuse | Authentic figures used in #232’s separated authentic-financial test (labeled `AUTHENTIC_SOURCE_BACKED`) |
| Action | Prefer #220 snapshot/certificate pipeline for approved financial inputs in durable pilot; do not invent a second financial engine |

## Recommendation

1. Land **#229** (or keep capacity files byte-compatible).
2. Land **#232** as the activation/supersession vehicle for #225/#227.
3. Keep **#230** / **#220** as complementary authentic math / financial ingest — integrate at call sites, not by copying engines.
