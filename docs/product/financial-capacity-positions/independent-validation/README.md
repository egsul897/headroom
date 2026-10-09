# Independent validation — Coherent capacity & sequential transactions

Corrects and deepens PR #231 reporting.

## Critical correction

| Claim | Status |
|---|---|
| Package-wide **unsecured** capacity = **$5,129M** | Correct — CA §6.11 TNL ≤ 4.25x |
| Package-wide **secured** capacity = **$5,129M** | **FALSE FAVORABLE** — binding is Indenture `mila_secured` **$4,041M** |
| Dashboard solver-native secured remaining = $5,129M | Diverges from capacityFormulas cross-document; do not use as secured capacity |

## Run

```bash
npm run product:financial-capacity-independent-validation
npx vitest run tests/product/financial-capacity-independent-validation.test.ts
```

## Sequential chain

S1 incur → S2 repay (on S1 post) → S3 dividend → S4 equity → S5 investment.

Neon ledger is never mutated. Cash effects that the RP sim omits are applied as explicit overlays and labeled as limitations.

## Financial authority

`EVALUATION_SEED_NOT_NS4_APPROVED` — zero NS-4 APPROVED snapshots for Coherent. Not Phase-4 REQUIRE.
