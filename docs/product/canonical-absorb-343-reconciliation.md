# #343 Canonical Absorption Reconciliation

**Verdict:** `SELECTIVE_ABSORPTION_REQUIRED` (narrow) → selective port of one missing UI authority gate.

| Ref | SHA |
|-----|-----|
| Reported #343 tip | `f845e2aca960e4c4b85982c36010ffa8405047e4` |
| Reported later main | `db0f2fd32bf76755a53b8dd8e57ebee474c04d4c` (#345 merge) |
| Actual `origin/main` at reconcile | `d924f5b6c47f1d63982bb4385579d6858cdaf067` (#332 after #345) |
| #343 ↔ main merge-base | `8374fa2a` (#334) |
| #343 ancestry of main | **no** |
| #343 mergeable vs main | **CONFLICTING** (do **not** wholesale-merge) |
| Canonical successor | **#345** (`d91b0a97` → merge `db0f2fd3`) |

## Invariant matrix (production evidence on main)

| Invariant | Status on main | Production surface | Regression evidence |
|-----------|----------------|--------------------|---------------------|
| #333 PAI protections | **present** | `selectSourceBackedGrossMm`, Position PAI absorb `14137841` / `#333` `1fb258d2` | `tests/product/cross-domain-capacity.test.ts`; PAI git ancestry |
| #334 persisted delivery provenance | **present** (+ #332 seal) | `certificate-deliveries.ts` → `delivery-evidence` persisted-only | `tests/contract-model/runtime/input/delivery-authority-adversarial.test.ts` |
| null-VEP fail-closed | **present** | `certified-simulate-bridge.ts` (`verifiedPackage` null → not executable) | `tests/product/certified-simulate-executable-safety.test.ts` (`missing VEP`) |
| gross vs verified remaining | **present** | `mayClaimVerifiedRemaining`, cross-domain `verifiedRemainingMillions: null` | authority-adversarial + `cross-domain-transaction.test.ts` + capacity tests |
| Dashboard GET no-write | **present** (#345) | `loadContractualMetricsForDashboard` → `allowNeonWrite: false` | `dashboard-contractual-metrics-no-write.test.ts` |
| provisional headline labeling | **present** (#345) | `DEFINITION_EXECUTED_PROVISIONAL` + UI “provisional” labels | no-write + serialize tests |
| demotion-only `forceEvidenceAuthority` | **superseded stronger** | production API **removed** force override (#339 via #345) | `authority-adversarial.test.ts`; no-write “does not export” |
| NS-4 `APPROVED_BOUND` authority | **present** (band); **headline gate gap** | `loadNs4DashboardFinancialState` / binder; headline strip needed #343 gate | dashboard-ns4-read + selective port test |
| shared financial identity / acquisition invalidation | **present via #334 binder** | `loadApprovedFinancialInputBundle` on Position/Simulate; NS-4 e2e invalidation | `ns4-approved-capacity-simulation.e2e.test.ts`, `cross-domain-transaction.test.ts` |

## Unique #343 behavior

| Item | Disposition |
|------|-------------|
| `DashboardClient` `ns4ApprovedBound` provisional suppress + retain note | **SELECTIVE PORT** (only missing required safeguard) |
| `ns4-shared-financial-identity.ts` | **reject** — thinner duplicate of `loadApprovedFinancialInputBundle` |
| `forceEvidenceAuthority` demotion-only API | **reject** — main removed caller override entirely |
| Duplicate Dashboard / Simulate / financial-input stacks | **reject** — do not wholesale-merge #343 |
| Provider-free acquisition/invalidation tests | **reject as required** — covered by main `cross-domain-transaction` + NS-4 e2e |
| Absorption matrix doc only | informational |

## Human recommendation

1. Merge the selective port branch (this reconcile) — **not** #343 tip `f845e2ac`.
2. Close #343 as superseded by #345 + this selective gate port.
3. Do not self-merge; do not activate production authority.
