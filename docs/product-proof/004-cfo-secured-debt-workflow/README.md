# Product Proof 004 — CFO Secured-Debt Customer Workflow

One end-to-end customer workflow: a CFO selects the authentic Matthews package,
asks whether a proposed **$50 million secured debt** transaction is permitted,
and receives a defensible, exportable answer — without fabricated PERMITTED,
verified remaining, or Phase-3 certification.

## Verdict

**CUSTOMER_WORKFLOW_PARTIAL**

Working: orchestrated eight-output answer + audit trail + fail-closed no-package path  
Blocked for PERMITTED / verified remaining: Matthews VEP, NS-4 APPROVED, utilization completeness, trusted issuer, CERTIFIED_4E dual-path

## Product entry (canonical CFO journey)

| | |
|---|---|
| Route | `/{companyId}/simulate` with `companyId=matthews` |
| Panel | `CfoSecuredDebtWorkflowPanel` (eight outputs + audit download) |
| Entry loader | `loadCfoSecuredDebtProductEntry` |
| Handoff | Optional `?amount=&asOf=` seeds the $50M / dated ask |

Modeled `NOT_PERMITTED` is labeled `MODELED_NOT_CERTIFIED_4E` — not a certified legal determination. Verified remaining stays null; certified simulation unavailable.

## Reproduce

```bash
npx tsx scripts/product-proof/run-cfo-secured-debt-workflow.ts
npx vitest run tests/product/cfo-secured-debt-workflow.test.ts tests/product/cfo-secured-debt-product-entry.test.ts
```

## Package

| Field | Value |
|---|---|
| Company | Matthews International (`matthews`) |
| Package key | `matthews-international-q1-fy2025` |
| Authenticity | `AUTHENTIC_SOURCE_BACKED` |
| As-of | 2024-12-31 (Q1 FY2025 10-Q) |
| Ask | $50M secured debt |

## Deliverables

| File | Contents |
|---|---|
| `00-inventory.md` | Phase A inventory + blocker list |
| `01-critical-path.md` | Phase B evidence binding |
| `02-demonstration.md` | Phase C customer demo |
| `03-acceptance.md` | Phase D acceptance + SHA |
| `11-final-verdict.md` | Required mission verdict |
| `artifacts/` | Machine-readable workflow JSON |

## Constraints honored

- No competing engine / broad integration PR
- No fabricated Phase-3 VEP / CERTIFIED_4E
- No PERMITTED without genuine gates
- Verified remaining forced null
- No self-merge / no production authority activation
