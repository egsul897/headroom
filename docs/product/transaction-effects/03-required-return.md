# Required return — Agent 4 sequential financial & covenant state

## 1. TE-D2 / TE-D3 root causes
- **TE-D3:** product `advanceWorld` chained ledger/capacity but not financial overlays → next tx saw stale snapshot metrics.
- **TE-D2:** Phase 4D primitive allows restore by usageId; verified + sequential product paths did not enforce contractual authority.

## 2. Production reachability
Unauthorized restore could reach `simulateTransaction` via `simulateVerifiedTransaction` and the sequential runner. Direct Phase 4D tests still can (primitive preserved).

## 3. Corrected behavior
- `chainFinancialViewWithScope` SETs prior APPLIED results into the next base resolver.
- `assertRestoreAuthority` / `[authority:<ref>]` at verified-execution + sequential-execution.
- Product no longer imports raw `runtime/*`.

## 4. Independently validated examples
- Flat five-step demo (`02-sequential-demo-run.json`)
- Ratio-gated incur→dividend refusal (`04-ratio-gated-sequence.json`) — independent TNL 3.0→4.0 before Headroom
- Eligible vs ineligible equity → builder
- Shared-pool sequential anti-stacking

## 5. Existing tests preserved
Phase 4D transaction suites unchanged; `verified-execution` 29/29.

## 6. New regression results
`sequential-state-correctness.test.ts` 10/10; recipes 9/9; sequential-effects 11/11. **59/59** on the mission suite.

## 7. Unauthorized restoration blocked
Yes — verified REFUSE + sequential pre-check. Recipes still refuse empty authority.

## 8. Financial chaining correctness
Yes — chained resolver shows builder-available 50→125; ratio gate uses post-incur debt.

## 9. Cross-document / shared consistency
Shared pool sequential draws refuse over-stack; reclass still requires encoded edge (no invented corpus evidence).

## 10. PR / SHA / CI / cost
- **PR:** https://github.com/egsul897/headroom/pull/223
- **Tip:** see branch head after push
- **Cost:** $0.00
- **CI:** local mission suite green; unrelated product tests (authenticated-vep-offline, conmed-demo nav) fail on main tip as before
