# CONMED low-cost current-pipeline pilot

**Evidence label: `LOW_COST_DIAGNOSTIC_PIPELINE`** — not a canonical measurement of current
production. This run substituted a cheaper model than production's configured compiler model,
so it answers a diagnostic question, not a certification one.

## The question

Does the modern compiler architecture, when actually given the CONMED candidates, recover
materially more benchmark-relevant semantic representation than the frozen pre-compiler
evidence showed? The CONMED dataset is the cleanest possible test of that, because its frozen
artifact has no compilation stage at all — zero compiled rules exist anywhere in it.

## Verdict: CONMED_PILOT_BLOCKED_PROVIDER_CREDIT

The gateway stopped serving mid-run with HTTP 402 insufficient_funds, affecting 118 of 137 candidates. Only 19 were actually served. The pilot therefore cannot answer the diagnostic question over the full population, and the per-candidate failure counts are NOT a measurement of the substituted model — they are the point at which the account ran dry.

## What ran

| | |
| --- | --- |
| Sealed population | 163 |
| Eligible under production's own predicate | 163 |
| Exact duplicates removed | 26 |
| Compiled | 137 |
| Not run (budget guard) | 0 |
| Tier 1 | `deepseek/deepseek-v4-flash-0731` |
| Tier 2 | `anthropic/claude-sonnet-5` |
| Escalated | 125 |
| Actual cost | $0.0434 against a $75 ceiling |
| Cost per candidate | $0.00032 |

## The nine CONMED cases

| | before | after |
| --- | --- | --- |
| CREDIT | 0 | 3 |
| Specifically surfaced | 0 | 3 |
| Dangerous silent omissions | 3 | 0 |

Substantive representations produced where the frozen evidence had none: **8**.

The canonical 47-case score is untouched. This is a pilot comparison only.

## Cheap-model reliability

- Tier-1 success rate over the served subset: 63.2% (12/19)
- Provider refusals (HTTP 402, never reached the model): 118
- Raw failure rate including provider refusals: 91.2% — describes the run, not the model
- Escalation rate: 91.2%
- Malformed-output rate: 0.0%
- Wall-clock timeout rate: 36.8%
- Candidates that used the evidence-retrieval tools: 7/137

## Two caveats that change how this reads

**The cheapest models are not viable, and a cheap probe says otherwise.** Five models that
completed a toy tool-use call fail outright on the real eight-turn compilation protocol. Had
selection trusted the gateway's capability tags, this pilot would have produced a near-zero
result that looked like evidence against the architecture. §11's warning is not hypothetical.

**The first wall-clock ceiling fabricated failures.** At 300s per candidate every model looked
broken on the largest section; the frozen Sonnet run averaged about fourteen minutes per
candidate. Raised to 900s, the selected model went from apparent failure to 4/4 on probe. Any
cheap-model verdict is only as good as the ceiling it ran under.

## What this does NOT license

- It does not authorize A_FULL. §12 asks for a re-estimate under the cheap-first strategy first.
- It does not change production, the benchmark, or the canonical score.
- It does not settle whether current production — at its configured model — behaves this way.

