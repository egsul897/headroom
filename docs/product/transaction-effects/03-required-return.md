# Required return — Agent 4 sequential financial & covenant state

## Architecture boundary (follow-up)

Unauthorized allowlist expansion for `sequential-execution.ts` was **reverted**. Sequential composition no longer imports raw `capacity/graph`, `capacity/state`, or `transaction/simulate`. Every step calls `simulateVerifiedTransaction` / `evaluateVerifiedCapacity`. Evidence: `06-architecture-boundary-remediation.md`.

## 1. TE-D2 / TE-D3 root causes
- **TE-D3:** product `advanceWorld` chained ledger/capacity but not financial overlays → next tx saw stale snapshot metrics.
- **TE-D2:** Phase 4D primitive allows restore by usageId; verified + sequential product paths did not enforce contractual authority.

## 2. Production reachability
Unauthorized restore reaches the engine only if a caller bypasses `verified-execution` (tests/scripts). Product sequential + Ask/Simulate certified paths enter through the verified adapter.

## 3. Corrected behavior
- `chainFinancialViewWithScope` lives on `verified-execution` (TE-D3).
- `assertRestoreAuthority` / `[authority:<ref>]` at verified-execution; sequential maps REFUSED.
- Shared-pool evaluation under REQUIRE uses the pool’s unit identity (runtime alignment with first-class SHARED_CAPACITY units).
- Architecture allowlist remains `["verified-execution.ts"]` only.

## 4. Independently validated examples
- Flat five-step demo (`02-sequential-demo-run.json`)
- Ratio-gated incur→dividend refusal (`04-ratio-gated-sequence.json`) — independent TNL 3.0→4.0 before Headroom
- Eligible vs ineligible equity → builder
- Shared-pool sequential anti-stacking (via verified adapter)

## 5. Existing tests preserved
Phase 4D transaction suites unchanged; `verified-execution` 29/29; certified architecture allowlist unchanged.

## 6. New regression results
`test:phase3-certification` **481/481**; sequential mission suites **30/30**; adversarial-verification + foundation adversarial matrix green.

## 7. Unauthorized restoration blocked
Yes — verified REFUSE (`UNAUTHORIZED_CAPACITY_RESTORE`). Recipes still refuse empty authority.

## 8. Financial chaining correctness
Yes — chained resolver shows builder-available 50→125; ratio gate uses post-incur debt.

## 9. Cross-document / shared consistency
Shared pool sequential draws refuse over-stack under REQUIRE; reclass still requires encoded edge (no invented corpus evidence).

## 10. PR / SHA / CI / cost
- **Branch:** `cursor/sequential-verified-boundary-8970` (base: `cursor/transaction-effects-covenant-state-8970`)
- **Cost:** $0.00
- **CI:** pending after push; local certified-path + sequential + adversarial green
- **No automatic merge**
