# AGENT 2 — Verified Remaining Capacity

## Verdict

**Financial/utilization-to-capacity integration landed.** Contractual basket ceiling is computationally distinct from remaining borrowing capacity. Numeric remaining is published only under explicit completeness authority. Production trusted-issuer activation remains **BLOCKED**. `VERIFIED_REMAINING` is demonstrated under labeled synthetic completeness (demo hatch); production-authoritative remaining is **not** claimed.

## SHAs

| Marker | SHA |
| --- | --- |
| Starting `origin/main` | `67027b8f499921a12cee7b9b9f04d832898b6384` |
| Ending tip | `1d973160f958f035b8aa5945eee7077ff7d59f09` |

## Existing components reused

| Component | Path |
| --- | --- |
| Financial evidence validation | `lib/capacity/financial-evidence.ts` |
| Verified-input handoff | `lib/capacity/verified-input-contract.ts` |
| Utilization reconstruction | `lib/capacity/utilization-evidence-reconstruction.ts` |
| Utilization resolver + remaining | `lib/capacity/utilization-resolver.ts`, `verified-remaining.ts` |
| Completeness / issuer gates | `lib/capacity/utilization-authority.ts`, `completeness-issuer-auth.ts` |
| Phase 4C capacity engine | `evaluateCapacityState` / `buildCapacityGraph` |
| Phase 4B snapshot resolver | `snapshotInputResolver` |
| Identity activation (BLOCKED) | `lib/capacity/identity/*`, `trusted-issuer-host.ts` |
| PR #294 persistence (reviewed, not merged) | financial bundles, completeness certs, capacity calculation records — consumption deferred until Neon-first lands |

## New production interfaces

| Export | Role |
| --- | --- |
| `selectFinancialState` | Select evidence by company/entity, period, as-of, currency, metric, source, approval, supersession. Missing/stale ≠ zero. Persisted ≠ approved. |
| `classifyUtilizationCompletenessAuthority` | Explicit ladder: `NO_UTILIZATION_RECORDS` → `SOME_UTILIZATION_RECORDS` → `RECONCILED_UTILIZATION_HISTORY` → `REVIEWED_COMPLETENESS` → `TRUSTED_AUTHORIZED_COMPLETENESS`. No implicit promotion. |
| `historicalEventsToLedgerUsage` / `utilizationRecordsToLedgerUsage` | Ledger bridge preserving transaction identity + chronology (reclass / repayment / supersession). |
| `evaluateVerifiedRemainingCapacity` | Orchestrator for Agent 3: financial + utilization + shared capacity + Phase 4C → auditable result. |
| `ExecutableRuleHandoff` | Agent 1 contract surface — consumes pre-compiled IR only; does not compile. |

### Capacity output fields

`grossContractualAmount` · `financiallyModeledAmount` · `historicalUtilization` · `remainingAmount` (nullable) · `bindingRestrictions` · `missingInputs` · `confidenceAuthority` · `completenessAuthority` · `calculationTrace` · `provenance`

## Tests (adversarial)

`tests/capacity/verified-remaining-capacity-integration.test.ts` — **11/11 pass**

1. Empty ledger without completeness → no remaining  
2. Partially populated ledger → SOME; reconciled-without-cert still withholds remaining  
3. Approved vs unapproved financial evidence (persisted ≠ approved)  
4. Shared-capacity double consumption fail-closed  
5. Reclassification + repayment identity/chronology  
6. Superseded financial statements excluded  
7. Wrong-entity financial inputs refused  
8. FX mismatch fail-closed  
9. As-of-date consistency (future usage + stale metrics)  
10. Replay determinism (identical `inputHash` / `stateHash`)  
(+ demo remaining under synthetic completeness without production activation)

**Database:** in-memory fixtures only. **PRODUCTION_DB_TOUCHED:** NO. No Neon writes.

## Remaining evidence blockers

1. `TRUSTED_ISSUER_ACTIVATION` / `TRUSTED_IDENTITY_PRODUCTION_ACTIVATION` = **BLOCKED** (no production IdP).  
2. Authentic Neon attributed ledger for live packages still sparse (pre-existing).  
3. PR #294 persistence not on main — durable selection/load of financial bundles deferred.  
4. Agent 1 executable-rule verification completeness still optional on handoff.  
5. Production AUTHENTIC financial evidence path not activated.

## Is VERIFIED_REMAINING demonstrated?

| Claim | Status |
| --- | --- |
| Gross contractual ≠ remaining (enforced) | **YES** |
| Remaining withheld without completeness | **YES** |
| Demo `REMAINING_REVIEWED_DEMO` / synthetic remaining | **YES** (labeled, non-production) |
| Production `PRODUCTION_AUTHORITATIVE` remaining | **NO** — dual gates BLOCKED by design |
| `mayPublishProductionRemaining` | always `false` in this mission |

## Coordination

- **Agent 1:** consumes `ExecutableRuleHandoff` (IR rules / shared capacities / definitions). Compiler not duplicated.  
- **Agent 3:** consume `evaluateVerifiedRemainingCapacity` → `VerifiedRemainingCapacityResult` (+ nested `artifacts.verifiedInputHandoff`).  
- **PR #294:** reviewed; persistence wrappers can later store this result’s identities without changing arithmetic.
