# Reproduce

```bash
# From repo root on branch tip
npx tsx scripts/product/run-matw-secured-01.ts
npx vitest run tests/product/matw-secured-01-operative-package.test.ts
```

Primary modules (read-only evaluation):

- `lib/product/matw-secured-01/evaluate.ts`
- Sources: `source-excerpts-matthews.ts`, `package-matthews.ts`, `docs/amendment-chain-research/before-after/matw-am6-lien-601j.json`, chain manifest, Q1 FY2025 financial fixture

Does **not** call paid providers, write Neon, or mutate permission rows.
