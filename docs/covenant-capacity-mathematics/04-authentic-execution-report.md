# AGENT 3 — Authentic capacity execution

## Verdict

The production leaf capacity mathematics (`evaluateProvision` / `permissionAsProvision`) correctly computes **gross** contractual capacity for authentic Neon-stored Coherent and Matthews rules against real financial snapshots. **0 incorrect evaluations.** Remaining capacity after utilization cannot yet be claimed: attributed ledger wiring is missing.

Synthetic 53-case matrix preserved (53/53). No production mathematics changes. Cost **$0**.

## Required return counts

| # | Metric | Value |
|---|---|---|
| 1 | Authentic provisions evaluated | **51** |
| 2 | Successfully represented | **51** |
| 3 | Independently correct executable results (gross) | **45** |
| 4 | Correctly refused | **6** (automatic-link liens → independent ceiling 0) |
| 5 | Incorrectly evaluated | **0** |
| 6 | Blocked by missing financials | **0** (for selected authentic rows) |
| 7 | Blocked by missing utilization (remaining claim) | **45** |
| 8 | Blocked by certification | **0** on these rows; corpus-wide cert path empty (`semantic_truth_records=0`) |
| 9 | Generalizable defects | **None demonstrated** |
| 10 | Tests / CI / PR / SHA / cost | see below |

Correct refusals are **not** counted in (3).

## Mechanics exercised (authentic)

Fixed baskets · greater-of growers · ratio debt · incremental facilities · Available Amount builder · restricted payments · investments · shared capacity.

Companies: Coherent Corp. (VERIFIED population), Matthews International (VERIFIED population), CONMED Article VII demo counsel extract (labeled DEMO, not presented as actual company capacity for commercial claims).

## Priority 2 — Why ~734 Neon sources → ~39 Permissions

| Blocker | Finding |
|---|---|
| Extraction | 672 DISCOVERED_CANDIDATE + 62 STRUCTURALLY_INDEXED; KF does not compile Permissions |
| Definition resolution | Summaries do not bind IRDefinition calculation trees to executable rules |
| Unsupported representations | Phase-4C legacy adapter refuses ratio/builder shapes (honest); legacy leaf still executes them |
| Missing financials | Coherent/Matthews have FinancialSnapshot; North-Star APPROVED snapshots are fixture companies |
| Missing utilization | Basket-family LedgerEntry only; `SharedCapacityConstraint.currentUsage` hardcoded 0; 1 synthetic `contract_ledger_usages` row |
| Certification | `semantic_truth_records=0`; no corpus→certified IR promotion |
| Runtime failures | None on authentic VERIFIED rows with snapshots |

## Priority 3 — Financials / utilization / Position·Simulate

| Store | Status for authentic Cos |
|---|---|
| FinancialSnapshot | Present (Coherent, Matthews) — feeds Position via `loadCompanyCovenantData` |
| FinancialState totalAssets | Matthews present; Coherent not required for evaluated set |
| Attributed historical usage | **Missing** — cannot fabricate |
| Shared-capacity consumption | Cap formulas evaluate; usage not attributed |
| Remaining basket capacity | Gross verified; remaining after usage **blocked** |
| Pro forma / Simulate | Solver leaf + Phase-4D path unchanged; same formulas feed Simulate when inputs exist |
| Phase-4C dual-check | 31 adaptable formulas cross-checked; 20 adapter refusals (ratio/builder) — correct refusals |

## Artifacts

- `scripts/capacity/authentic-capacity-execution.ts`
- `tests/contract-model/runtime/capacity/authentic-capacity-execution.test.ts`
- `docs/covenant-capacity-mathematics/02-authentic-execution-matrix.json`
- `docs/covenant-capacity-mathematics/03-integration-blockers.json`
- Preserved: `capacity-mathematics-matrix.test.ts` (53 cases)

## Cost

**$0** — no paid model/API calls.
