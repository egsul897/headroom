# MATW-SECURED-01 — Authentic operative debt + lien package

Customer question: Can Matthews incur or refinance **$50M additional secured debt** as of **2024-12-31**, under which operative indebtedness and lien provisions?

## Starting / ending SHA

| | SHA |
|---|---|
| Historical inventory baseline (do not assume current) | `d924f5b6c47f1d63982bb4385579d6858cdaf067` |
| **STARTING_MAIN_SHA** (fetched `origin/main`) | `14c805c6412ca36bfe753112abac78fa6c3736fa` |
| **ENDING_SHA** | see `artifacts/summary.json` → `endingSha` |

## Readiness verdict

**BLOCKED_BY_SOURCE_EVIDENCE**

Do **not** claim `CERTIFIED_4E`, verified remaining, transaction PERMITTED, or `AUTHENTIC_OPERATIVE_PACKAGE_READY_FOR_PHASE3`.

## Reproduce

```bash
npx tsx scripts/product/run-matw-secured-01.ts
npx vitest run tests/product/matw-secured-01-operative-package.test.ts
```

## Deliverables (Phase D)

| # | Artifact |
|---|---|
| 1 | `artifacts/01-document-manifest.json` |
| 2 | `artifacts/02-amendment-precedence.json` |
| 3 | `artifacts/03-source-citations.json` |
| 4 | `artifacts/04-independent-semantic-verification.json` |
| 5 | `artifacts/05-candidate-path-matrix.json` |
| 6 | `artifacts/06-financial-utilization-dependencies.json` |
| 7 | `artifacts/07-missing-inputs-limitations.json` |
| 8 | `08-reproduce.md` |
| 9 | `09-sha-pinned-report.md` |
| 10 | `10-readiness-verdict.md` |
| E | `11-next-stage-recommendation.md` (compile withheld) |

## Constraints honored

- No production financial resolver / simulation / UI / permission-semantics changes
- No synthetic fixtures as authentic EDGAR exhibits
- No self-merge / production activation / parallel engine
