# Transaction evaluations — PP003 capability execution

All three transactions: **`verifiedSimulate.executable = false`**. Verified remaining always **null**. No invented favorable paths.

| Transaction | Amount | Package | Path authority | Capacity | Simulate | Path result | Remaining | Overall |
|---|---:|---|---|---|---|---|---|---|
| Debt-funded acquisition | $50M | Matthews debt/lien + CONMED §7.8(l) investment leg | Matthews `NOT_CERTIFIED_4E`; Inv leg `CERTIFIED_4E` | Inv REQUIRE `EXECUTED` | Inv REQUIRE `EXECUTED` | `INDETERMINATE` | null | REFUSED as a whole — Matthews no VEP; CA §6.01(j)=0; Inv remaining null |
| Restricted payment | $25M | CONMED §7.6(d) | `CERTIFIED_4E` | REQUIRE `EXECUTED` | REQUIRE `EXECUTED` | `INDETERMINATE` | null | GROSS unit present; not `VERIFIED_TRANSACTION_PERMITTED` |
| Asset sale | $40M | CONMED §7.5(j) | `CERTIFIED_4E` | REQUIRE `EXECUTED` | REQUIRE `EXECUTED` | `INDETERMINATE` | null | Draft kind `ASSET_SALE`; recipe bound to capacity node; remaining null |

### Intake / recipes

- `parseTransactionDraft` classifies asset-sale asks as `ASSET_SALE` (not `UNKNOWN`).
- `recipeDividendPayment` / `recipeAssetSale` bind CONMED rule capacity nodes when present.
- Empty-resolver REQUIRE path keeps PAI-04 UNKNOWN utilization ≠ zero remaining.

Machine-readable: `artifacts/02-transactions.json`.
