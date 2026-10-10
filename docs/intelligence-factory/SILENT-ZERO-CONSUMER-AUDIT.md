# Silent-zero remaining-capacity consumer audit

**Branch:** `cursor/utilization-authority-integration-4f52`  
**Base:** `main` @ `b99f934b` (post-#229)

## Rule

Any path that publishes **AVAILABLE** or numeric **remaining** must have `authoritativeForRemaining === true` under `lib/capacity/utilization-authority.ts` (completeness certificate required). Empty ledgers, missing certificates, partial attribution, and synthetic-only evidence must not invent zero utilization.

## Consumers audited

| Consumer | Path | Silent-zero risk | Disposition |
|---|---|---|---|
| Solver election | `lib/solver/election.ts` `headroomAndConsume` | Was: `cap − currentUsage` when usage=0 | **Fail-closed** unless `currentUsageAuthoritative === true` |
| Solver shared usage | `lib/solver/shared-usage.ts` | Was: attributed-zero → VERIFIED_ZERO authoritative | **Reconciled** — requires `VERIFIED_EMPTY` cert |
| Solver loader | `loadCompanySolverStaticData` | Empty basketUsage → usage 0 | Status `ZERO_NO_ATTRIBUTED_USAGE`, authoritative **false**; certs optional via options |
| Debt intelligence | `debt-intelligence.ts` baskets | Was: `capacity − ledgerTotal` with empty→0 | Uses `resolveUtilization` + `computeVerifiedRemaining`; remaining null without cert |
| Verified remaining | `lib/capacity/verified-remaining.ts` | N/A (new) | Gate fail → not AVAILABLE; util unknown → GROSS_ONLY; synthetic blocked by default |
| Product views | `product-capacity-view.ts` | N/A | Thin projection of verified remaining |
| Phase-4C capacity state | `runtime/capacity/state.ts` | A8-01/A8-02 | **Byte-identical to #229**; amount-kind floor intact |
| Covenant engine waterfall | `evaluateTransactionWaterfall` | `remaining` undefined when not determinable | Preserved — never fabricated as 0 |
| Post-txn headroom helper | `remainingCapacity?: number` | Documented undefined-not-zero | Unchanged |

## Negative controls required

1. Empty ledger → not AVAILABLE remaining  
2. Attributed records without completeness cert → GROSS_ONLY / ATTRIBUTED_INCOMPLETE  
3. Synthetic cert without `allowSyntheticRemaining` → remaining withheld  
4. Failed gate → not AVAILABLE (A8-01)  

## Residual watch

- Any future UI that displays `currentUsage === 0` without reading `currentUsageAuthoritative`
- Legacy Position paths that label gross as “remaining”
- Neon durable writes must not mint completeness certificates without human authorization
