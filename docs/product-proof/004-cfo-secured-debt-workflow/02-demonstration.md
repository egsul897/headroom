# Phase C — Customer demonstration

## Happy path (Matthews package bound)

```bash
npx tsx scripts/product-proof/run-cfo-secured-debt-workflow.ts
```

Produces:

| Mission item | Artifact field |
|---|---|
| 1. Covenants + citations | `applicableCovenants[]` |
| 2. Operative / amendment state | `operativeAndAmendmentState` |
| 3. Baskets + ratio conditions | `debtBasketsAndRatioConditions[]` |
| 4. Financial provenance | `approvedFinancialInputs` (non-APPROVED labeled) |
| 5. Utilization / remaining | `utilizationAndRemaining` (`verifiedRemainingUsd: null`) |
| 6. Path + simulation | `pathAndSimulation` (verified simulate REFUSED) |
| 7. Defensible result | `result` ∈ {NOT_PERMITTED, NEEDS_INPUT, …} — never false PERMITTED |
| 8. Audit trail | `auditTrail` + `artifacts/audit-trail.json` |

Product modules exercised (existing interfaces — no second engine):

- Ask draft parse → `parseTransactionDraft`
- Position / covenants → `evaluateMatthewsVerticalSlice` + VE bridge
- Simulate → `attemptVerifiedSimulate` + `enumerateCertifiedPaths`
- Recipe limitations → `recipeSecuredBorrowing` (empty draws)
- Modeled cross-domain → `evaluateMatthewsScenario`

## Fail-closed (missing package)

Same runner writes `fail-closed-no-package.json`:

- `result: UNSUPPORTED`
- `workflowVerdict: CUSTOMER_WORKFLOW_BLOCKED_BY_EVIDENCE`
- No covenants, no remaining, verified simulate still invoked and refused

## North Star / PAI protections preserved

- REQUIRE verified spine not bypassed
- UNKNOWN utilization not treated as zero
- Trusted issuer / identity production remain BLOCKED
- No Neon production writes; no paid inference
- No self-merge; no production authority activation
