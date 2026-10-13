# Phase D — Acceptance

## Tests

```bash
npx vitest run tests/product/cfo-secured-debt-workflow.test.ts
npx tsx scripts/product-proof/run-cfo-secured-debt-workflow.ts
```

Coverage:

- Eight customer outputs + audit trail on Matthews
- Fail-closed omit-package → UNSUPPORTED
- Incomplete draft → NEEDS_INPUT
- Required external evidence listed (ABSENT / PARTIAL_FIXTURE_ONLY)
- Never PERMITTED / never non-null verified remaining on this path

## Working vs partial

| Function | Status |
|---|---|
| Select Matthews + ask $50M secured | **Working** |
| Citations + formulas + authority labels | **Working** |
| Operative docs + amendment limitations | **Partial** (leaf-encoded; not certified as-amended IR) |
| Baskets / ratios with modeled rooms | **Working** (remaining null) |
| Financial provenance | **Partial** (authentic fixture, not NS-4 APPROVED) |
| Utilization / remaining honesty | **Working** (refuses remaining) |
| Verified path simulation | **Partial** (invokes; REFUSED — no VEP) |
| Defensible result vocabulary | **Working** (NOT_PERMITTED modeled / NEEDS_INPUT) |
| Exportable audit trail | **Working** |
| Production PERMITTED / verified remaining | **Blocked by evidence** |

## SHA

Recorded in `artifacts/demo-summary.json` → `gitSha` after runner execution on this branch tip.

Focused acceptance (this branch):

- `tests/product/cfo-secured-debt-workflow.test.ts` — 4/4 passed
- `scripts/product-proof/run-cfo-secured-debt-workflow.ts` — primary `NOT_PERMITTED` (modeled SSNL) + fail-closed `UNSUPPORTED`
- Primary `workflowVerdict`: `CUSTOMER_WORKFLOW_PARTIAL`
- `verifiedRemainingUsd`: null; `verifiedSimulateExecutable`: false; path authority `NOT_CERTIFIED_4E`
