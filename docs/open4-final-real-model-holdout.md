# OPEN-4 Final Real-Model Holdout — Final Report

**Verdict: `PHASE_3F_1_CONDITION_VALIDATION_ENVIRONMENT_BLOCKED`**

## Scope

The Phase 3F.1 code foundation was closed by the immediately preceding phase (OPEN-1/2/3/5/6
all CERTIFIED_CLOSED). This session's sole task was the last remaining requirement before
formal Phase 3F.1 closure: running the already-frozen OPEN-4 real-model condition-suspicion
holdout — 22 pre-authored adversarial constructions (17 materially conditional, 5 benign
controls), unchanged, against the real configured model.

- **Starting SHA**: `855b7bf7a32420cfc1b21a4765bf7de7fae21666`
- **Final SHA**: `855b7bf7a32420cfc1b21a4765bf7de7fae21666` (unchanged — no commits altered
  production or test code this session)
- **Provider/model**: Vercel AI Gateway, `anthropic/claude-sonnet-5`

## What happened

Per the governing spec's own required first step, one tiny authenticated probe was made
against the Gateway (credential injected as a process-local environment variable for a
single command invocation only — never written to `.env`, `.env.local`, source files, test
fixtures, or any committed artifact):

```
HTTP 402: {"error":{"message":"Team budget exceeded. Current spend: $50.05, limit: $50.00.
Please contact your administrator to increase the budget.","type":"quota_for_entity_exceeded"}}
```

This is the identical account state found by every prior probe across this entire
multi-phase engagement — the budget has not been increased since it was first found
exhausted. Real cost incurred by this probe: **$0.00** (rejected before any token billing).

Per the spec's explicit instruction, this requires an immediate stop: **no holdout
execution, no code changes, no case rewriting, no prompt tuning.** The 22 frozen cases were
located (`docs/phase-3f1-terminal-architecture-decision/19-condition-architecture-recertification.json`)
and confirmed present and unmodified (17 material + 5 benign, matching every prior phase's
count), but **zero cases were sent to any model this session.**

One check that requires no model call was still performed, per the spec's own separate
numbered section: confirming from the frozen production code (without modifying it) that
the classifier receives source text only. `classifyConditionSuspicion(sourceText: string, ...)`
enforces this at the TypeScript type level — the content parameter is exactly `string`, and
`buildConditionSuspicionUserContent` builds the model's entire input from that raw string
plus a static, hardcoded few-shot block. No compiled IR or compiler answer can reach it.

## Cross-cutting findings

**Production freeze held**: `git diff 855b7bf HEAD` on `lib/**`, `app/**`, `prisma/**` is
empty. Only this session's own new artifact directory
(`docs/open4-final-real-model-holdout/`) was added.

**Foundation not rechecked**: per the spec's own instruction, no adversarial campaigns were
rerun for OPEN-1, OPEN-2, OPEN-3, OPEN-5, or OPEN-6 — their CERTIFIED_CLOSED dispositions
from the immediately preceding phase stand unchanged.

## Verdict and required next action

**`PHASE_3F_1_CONDITION_VALIDATION_ENVIRONMENT_BLOCKED`.**

OPEN-4's status is unchanged — neither newly failed nor newly closed, simply still unable to
run. The frozen 22-case holdout remains exactly as-is, ready to execute the moment a human
increases the Vercel AI Gateway team budget above the current $50.05 spend. Per the
governing spec: do not rerun closed foundation work, do not modify production code, and do
not begin Phase 3F.2. This session stops here.
