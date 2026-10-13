# Exact-tip CI — `e4dd5a8876d006540cde381204929ce65c7f9628`

**PR:** [#348](https://github.com/egsul897/headroom/pull/348)  
**Branch:** `cursor/package-wide-covenant-execution-b8f6`  
**Recorded:** 2026-10-13  

## GitHub checks (all SUCCESS)

| Check | Conclusion | URL |
|---|---|---|
| home overview (soft gate) | SUCCESS | https://github.com/egsul897/headroom/actions/runs/38362006386/job/115178165525 |
| home overview (soft gate) | SUCCESS | https://github.com/egsul897/headroom/actions/runs/38362034864/job/115178253016 |
| Vercel | SUCCESS | https://vercel.com/debt-compass/headroom/DgKJQT4kimUpi6bMczh6J6EyK3Pv |
| Vercel Preview Comments | SUCCESS | https://github.com/egsul897/headroom/runs/115178606700 |

**Commit status aggregate:** `success`  
**Workflows triggered:** path-filtered — only `home-overview.yml` (+ Vercel). Product / capacity / certified-path workflows did not match changed paths.

## Local exact-tip product proof (required for this surface)

```
tests/product/cross-domain-transaction.test.ts           9 passed
tests/product/cross-domain-authority-adversarial.test.ts 22 passed
tests/product/package-transaction-execution.test.ts       6 passed
tests/product/package-wide-generalization.test.ts         8 passed
tests/product/contractual-computation.test.ts             8 passed
tests/product/contractual-ebitda-derivation.test.ts       6 passed
tests/product/debt-intelligence-dashboard.test.ts         2 passed
TOTAL                                                    61 passed
tsc --noEmit                                             clean on changed surface
```

Log: `09-local-test-results.txt`
