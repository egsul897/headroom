# Debt package → transaction answer (CONMED)

End-to-end product milestone over the authentic CONMED 2025 credit facility package.

## Run

```bash
npx prisma generate   # required after NS-4 schema (PR #204) if client is stale
npm run product:debt-package-transaction-answer
```

## Outputs

| File | Purpose |
|---|---|
| `report.json` | Machine-readable pipeline + six scenario results |
| `customer-report.md` | CFO / treasurer / counsel-readable determination |
| `answer-sheet.md` | Independent expectations vs Headroom (ground-truth authored first) |

## Starting conditions recorded

- Base: `origin/main` after PR #204 merge
- PR #200: **not** merged here (merge conflicts + failed Vercel on tip) — covenant-intelligence training remains on that branch
- PR #204: merged; Prisma client must be regenerated for `ContractInputSnapshot`

## Success definition used

A refusal under REQUIRE / NEEDS_INPUT / UNSUPPORTED / REVIEW_REQUIRED is **success** when authentic evidence cannot support execution. Numeric “permitted” capacity is not claimed without APPROVED financials, ledger, and executable cross-rule companions.
