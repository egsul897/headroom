# Agent 8 — Independent Correctness and Adversarial Testing

Independent QA artifacts. Production `lib/` was not modified.

| File | Purpose |
|---|---|
| `00-independent-accuracy-report.md` | Full accuracy report, defects, holdouts, release recommendation |
| `01-results.json` | Machine-readable case results + outcome buckets |
| `02-critical-defects.json` | Release-blocking + material observation register |

Runner: `npx tsx scripts/agent8-independent-adversarial/run.ts`  
Tests: `npx vitest run tests/agent8-independent-adversarial`
