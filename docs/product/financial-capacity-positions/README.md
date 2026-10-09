# Financial capacity positions (multi-company)

Next milestone after PR #206 (CONMED fail-closed refusals).

Builds **real covenant positions and transaction consequences** for authentic Neon packages when evidence exists — not another CONMED refusal cycle.

## Eligible packages

| Company | Financials | Ledger | Provisions | Permissions | Executable capacity |
|---|---|---|---|---|---|
| Coherent | yes | yes (6) | yes (15) | yes (22) | yes (solver-native) |
| Matthews | yes | no | **no** | yes (7) | **refuse** (fail-closed) |

## Run

```bash
npm run product:financial-capacity-positions
# or
npx vitest run tests/product/financial-capacity-positions.test.ts
```

## Outputs

| File | Purpose |
|---|---|
| `report.json` | Machine-readable positions, scenarios, Neon intelligence, metrics |
| `customer-report.md` | Measurable milestone report |

## Transaction state changes (Coherent)

1. Debt incurrence $50M secured — TNL room consumed
2. Debt repayment $50M TLA — net-leverage room unaffected
3. Dividend $25M — builder step consumed; general RP unaffected
4. Equity contribution $100M — TNL + builder increased
5. Restricted investment $25M — shared Available Amount consumed; CA leverage unaffected

## Independent validation

Expectations authored from CA §6.11 / Notes builder formulas + Neon financial inputs — never from engine output under test.

## Neon intelligence

Reusable calculation cases persisted as `KnowledgeSource` with `DISCOVERED_NOT_LEGAL_TRUTH`. Never auto-promoted to legal truth (`promotedToLegalTruth: 0`).

## CONMED regressions

PR #206 six CORRECT_REFUSAL scenarios remain the unsupported-package regression suite. This milestone does not re-run or weaken them.
