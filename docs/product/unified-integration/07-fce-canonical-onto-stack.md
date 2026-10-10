# FCE canonical collapse onto unified stack (#220 → #250)

**Branch:** `cursor/fce-canonical-onto-unified-8d31`  
**Base:** Stage 5 tip `ac0ff925` (#250)  
**Source retained from #220:** `9c393298` / HEAD `60ab2cb9` (final integration)

## Intent

Apply the strongest #220 financial-engine final-integration work onto the existing #247–#250 stack. Do **not** re-merge #223/#243/#251 sequential trees.

## Retained from #220 (absent or weaker on #248)

| Artifact | Why retained |
|----------|----------------|
| `utilization-honesty.ts` → `#237` adapter | Collapses local mirror; remaining only via `computeVerifiedRemaining` |
| `authority.ts` `trustedProductionApprovalChannel` | Test emails / caller context cannot become REAL |
| `verified-path.ts` → `runSequentialTransactions` | Production sequential through #243 REQUIRE boundary + TE-D3 |
| `final-integration.test.ts` + hardened gate tests | Matthews synergy missing, cash/debt, shared capacity, authority |
| Gate docs under `docs/product/primary-engine/03-*` | Evidence pin |

## Superseded on stack

| Artifact | Disposition |
|----------|-------------|
| #248 local `#234`-mirror `utilization-honesty.ts` | **Superseded** by #237 adapter |
| #248 authority that upgrades on `productionContext` alone | **Superseded** |
| #248 verified-path hand-rolled sequential loop | **Superseded** by canonical `runSequentialTransactions` |
| #220 merge commits of `#243` / main onto FCE branch | **Not ported** — stack already owns sequential via #247 |
| #251 parallel sequential tree | **Not merged** — overlapping certified sequential; stack uses #247 path |

## ns4FinancialSync TypeScript investigation

| Baseline | Schema `Ns4FinancialSync` | `tsc` before `prisma generate` | `tsc` after |
|----------|---------------------------|--------------------------------|-------------|
| main `7f1dd3a2` | present | fails (stale client) | clean |
| #220 `60ab2cb9` | present (same model) | fails (stale client) | clean |
| #250 `ac0ff925` | present (same model) | fails (stale client) | clean |

**Root cause:** generated Prisma client in the environment lagged the schema (model exists since `2874c42e`). Not a schema/code mismatch introduced by #220 or the stack. **Does not block the combined build** after `prisma generate`.

## Recommendation

`READY_FOR_HUMAN_REVIEW` of this PR onto #250 (then human merge of #247→#250 stack). No auto-merge.
