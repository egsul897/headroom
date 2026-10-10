# Agent 8 — Independent Correctness and Adversarial Testing

Independent QA artifacts. Production `lib/` was not modified.

| File | Purpose |
|---|---|
| `00-independent-accuracy-report.md` | Full accuracy report, defects, holdouts, release recommendation |
| `01-results.json` | Machine-readable case results + outcome buckets |
| `02-critical-defects.json` | Release-blocking + material observation register |
| `08-continuation-results.json` | Post-#229/#237 continuation matrix |
| `09-continuation-accuracy-report.md` | Continuation report + DEFECT-A8-03 (#243 rebase risk) |

Runners:
- `npx tsx scripts/agent8-independent-adversarial/run.ts`
- `npx tsx scripts/agent8-independent-adversarial/run-continuation.ts`
- `A8_TIP_ROOT=/tmp/tip npx tsx scripts/agent8-independent-adversarial/probe-pending-integration-risk.ts`
- `npx tsx scripts/agent8-independent-adversarial/mutation-challenge.ts` (temp tree only)

Tests: `npx vitest run tests/agent8-independent-adversarial`
