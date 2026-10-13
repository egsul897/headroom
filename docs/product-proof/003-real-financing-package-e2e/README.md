# Product Proof 003 — Real financing-package E2E

Authentic Matthews International Q1 FY2025 package evaluated on **canonical main** through existing engines only.

## Verdict

**PARTIAL_PRODUCT_CAPABILITY_PROVEN** — three contemplated transactions all **REFUSED / NOT DETERMINED** with explicit truthful blockers. No false affirmatives.

## Reproduce

```bash
npm ci
npx prisma generate   # client only; do not write production Neon
npx tsx scripts/product-proof/run-003-real-package-e2e.ts
# optional lock:
npx vitest run tests/product/product-proof-003-real-package-e2e.test.ts
```

## Package

| Field | Value |
|---|---|
| Issuer | Matthews International Corporation |
| Slice | `matthews-international-q1-fy2025` |
| Authenticity | `AUTHENTIC_SOURCE_BACKED` |
| As-of | `2024-12-31` |
| Indenture | 8.625% Senior Secured Second Lien Notes due 2027 |
| Credit agreement | Third A&R Loan Agreement (through Sixth Amendment) |
| Financials | EDGAR 10-Q `0000063296-25-000006` |
| Fixture | `tests/fixtures/financial-utilization-evidence/matthews-q1-fy2025-slice.json` |

Secondary reference (frozen): MTN Product Proof 001 capacity refusal artifact.

## Deliverables

| File | Contents |
|---|---|
| `00-main-and-pr-audit.md` | Main SHA + open integration PR landscape |
| `01-domain-status.md` | Nine-domain executability matrix |
| `02-transaction-evaluations.md` | Three transactions with full covenant trails |
| `03-gap-roadmap.md` | Five highest-impact engineering tasks |
| `04-final-verdict.md` | Single overall verdict |
| `artifacts/*.json` | Machine-readable run outputs |
| `MISSION-REPORT.md` | Copy-ready mission report |

## Constraints honored

- Canonical main implementation only (no competing engine)
- No invented financial approvals
- No zero-utilization assumptions
- No synthetic legal interpretations / favorable path selection
- No Neon writes / no paid inference / no self-merge
