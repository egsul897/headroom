# MEASUREMENT-ONLY — accuracy-check-20261017 (Grok independent verification)

**Do not tune on this sample.** Never use these documents, their text, or their scores to fix, regression-pin, calibrate or fixture any engine rule. A fix must be justified by its root-cause mechanism on other documents, then re-measured here.

## Files
| File | Contents |
|---|---|
| `manifest.json` | 15 scored and 5 reserve EDGAR credit agreements: CIK, accession, exhibit and SEC URL; selection method; exclusion counts. Document bytes are not committed. |
| `scores.json` | 75 hand-scored checks (5 per agreement): engine output, governing clause text, class and root-cause mechanism. |
| `RESULTS.md` | The full report: headline counts, census by mechanism, per-check table, top root causes, limitations. |
| `engine-output-398-xbrl/` | Raw #398 (`cursor/clf-ebitda-optimizer` @ 796af948) outputs with SEC companyfacts financials. |
| `engine-output-release1-summary.json` | Trimmed release-1 (@ f0b1b0f4) checklist, non-OTHER computed baskets, and customer-summary items. |

## Reproduce
1. Download each manifest URL to `<docs>/<ID>.htm`, using a declared EDGAR User-Agent.
2. Release-1 run: `npx tsx scripts/accuracy-check/run-sample.ts <docs> <out>`. Set `CUSTOMER=0` to skip the customer path, and `ONLY=ID1,ID2` to filter.
3. #398 run, on a checkout of #398: `SEC_EDGAR_USER_AGENT="name email" npx tsx scripts/accuracy-check/run-ebitda.ts <docs> <out>`.
4. Tally: `python3 scripts/accuracy-check/tally.py`.

No AI, no database and no engine changes are involved.
