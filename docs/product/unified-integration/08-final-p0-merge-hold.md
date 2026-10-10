# Final P0 merge hold — PR #250 tip remediation

**Status:** MERGE_HOLD (do not merge until human confirms independent CI green on this tip)  
**Prior CI-green tip:** `f0e46aa9` (PR #250)  
**Remediation tip:** `592d53c89595f77547b5de21d4e43cdc57c090b5` (`592d53c89`)  
**Scope:** Fix false-favorable paths identified after #250 CI green; reconcile #253/#254 without regressing #237 utilization or REQUIRE.

## Reproduced failures (pre-fix / adversarial)

| ID | Defect | Reproduction |
|----|--------|--------------|
| EXECUTABLE | Capacity `EXECUTED` alone could be read as permission | #253 bridge: `isAffirmativelyExecutable` requires SIMULATED+SATISFIED; capacity alone → false |
| pathId | Explicit unknown pathId silent substitute risk | `selectEnumeratedPath` → `PATH_NOT_FOUND` (no fallback to sole other candidate) |
| LIEN principal | LIEN FIXED capacity in debt waterfall | `debtMembers` excludes `grantType === "LIEN"` from principal allocation |
| Auto-lien eligibility | Provisional SATISFIED on auto-link; non-member eligibility not re-checked | Removed provisional SATISFIED; re-evaluate auto-lien eligibility; FAILED/UNKNOWN fail-closed |
| Zero-probe EXACT | `$0` secured CLEAR + positive `maxCapacity` → EXACT without lien at max | Lien headroom clamp on amount-independent `maxCapacity` |
| Free-ride @ $0 alloc | Concurrent Ratio Debt skipped lien gate when FIXED absorbed request | Every secured debt leg requires lien path even at `$0` allocation |

## Fixes (this tip)

1. **`certified-simulate-bridge.ts` (#253)** — exact `pathId` identity; affirmative EXECUTABLE gate; wired via `transaction-analysis.ts`.
2. **`election.ts` / `service.ts`** — `debtMembers` principal filter; auto-lien eligibility fail-closed; independent lien pool + shared-constraint headroom (preserve #250/`f0e46aa9`); maxCapacity lien clamp; `assessIndependentLienCoverageForDebtLeg` exported for #254 matrix.
3. **`packageAuthoritative`** — kept (#250); T19 adapted (do not rename to #254 `PackageCapacityAuthorityLayers`).
4. **#237 / REQUIRE** — no edits to `utilization-resolver` / `utilization-honesty`; sequential path stays on `evaluateVerifiedCapacity` / `simulateVerifiedTransaction`.

## Regression evidence (local, provider-free)

- `tests/product/certified-simulate-executable-safety.test.ts` — pathId + EXECUTABLE (incl. production entry `attemptVerifiedSimulate`)
- `tests/solver/secured-capacity-adversarial-matrix.test.ts` — T3–T25 + P0-LIEN-PRINCIPAL / P0-AUTO-LIEN-FAILED / P0-AUTO-LIEN-UNKNOWN / P0-ZERO-PROBE-MAX
- `tests/solver/election.test.ts`, `secured-debt-lien-adversarial.test.ts`, `service.test.ts`, `gate0-security-scope.test.ts`, `synthetic-solver-native.test.ts`
- `tests/product/unified-position-integration-gate.test.ts`, `unified-product-adversarial-gate.test.ts`, `unified-position-verified-and-completeness.test.ts`

## Human merge recommendation

**MERGE_HOLD until required CI is green on the exact new tip SHA.**  
Do not merge competing #253/#254 branches over this tip (reconcile-by-port only).  
Do not declare P0 closed, auto-merge, or promote CERTIFIED.  
No Neon production writes; no paid inference.

When CI is green on the tip recorded below: human may merge #250 into the integration base after independent review of this hold checklist.
