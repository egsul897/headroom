# OPEN-4 Frozen Holdout Resume — Final Report

**Verdict: `PHASE_3F_1_CLOSED`**

## Scope

The prior phase (`docs/open4-final-real-model-holdout.md`) confirmed the frozen 22-case
OPEN-4 condition-suspicion holdout could not execute because the shared Vercel AI Gateway
team budget was exhausted (HTTP 402, "Team budget exceeded. Current spend: $50.05, limit:
$50.00"). This phase's sole task was to check whether that budget had been restored and, if
so, execute the existing frozen holdout for real — without modifying production code, the
classifier prompt, or the 22 cases themselves.

- **Starting SHA**: `5239d7de08574e81e1e88fad5b6d4f4b8f2c2c30`
- **Final SHA**: `5239d7de08574e81e1e88fad5b6d4f4b8f2c2c30` (unchanged — production code
  was not touched this session)
- **Provider/model**: Vercel AI Gateway, `anthropic/claude-sonnet-5`

## What happened

A one-shot precondition probe (credential injected as a process-local environment variable
for a single command invocation only — never written to any file) returned **HTTP 200** with
a real model response and real usage telemetry, the first success across this engagement's
entire history of prior 402s. This confirmed the budget had genuinely been restored.

All 22 frozen cases from `docs/phase-3f1-terminal-architecture-decision/19-condition-architecture-recertification.json`
(17 materially-conditional constructions + 5 benign controls, unmodified, in original order)
were then run for real against the unmodified production `classifyConditionSuspicion()`
function.

**Material safety gate: 17/17 (100%)** of the materially-conditional cases were answered
`MATERIAL_CONDITION_POSSIBLE` by the real model and route to independent review. **Zero
dangerous silent skips.** This is the first time this engagement has obtained the real
model's own semantic judgment on this set — every prior attempt's "100% routed to review"
figure was produced by the fail-safe reacting to a transport failure, not by the model
actually reading and judging the text.

**Benign controls**: 3 of 5 (B1, B2, B4) received clean `NO_MATERIAL_CONDITION_SUSPECTED`
verdicts — notably including B4, a case specifically engineered so that Gate 1's own
deterministic regex layer mis-flags it (bare "provided" as a false positive for the
conditional connective "provided that"); the real model correctly read it as the past
participle of "provide" and did not over-flag it, direct evidence of real semantic
discrimination beyond what the lexical layer can achieve. The remaining 2 (B3, B5) were
conservatively over-routed (40% benign over-route rate) — not a failure condition under this
architecture's safety-first design.

**Cost**: 22/22 real calls succeeded, zero failures/retries/rate-limits. 82,330 input tokens,
8,709 output tokens, **$0.25175 total**, average latency 5,544ms.

## Cross-cutting findings

**Production freeze held**: `git diff 5239d7d HEAD` on `lib/**`, `app/**`, `prisma/**` is
empty. Only this session's new artifacts under `docs/open4-final-real-model-holdout/`
(11-17 plus `12-real-model-results.json`) and this report were added; the 11 historical
artifacts from the prior environment-blocked phase were left untouched.

**Foundation not rechecked**: per the governing spec's own instruction, OPEN-1/2/3/5/6 were
not rerun — their `CERTIFIED_CLOSED` dispositions from prior phases stand unchanged.

## Verdict and disposition

**`PHASE_3F_1_CLOSED`.**

OPEN-4/BLOCKER-9 is now `CERTIFIED_CLOSED` on real, non-mocked model evidence: the safety
threshold (100% of material cases route safely, zero silent skips) was met by the model's
own genuine semantic judgment, not by a fail-safe reacting to an unreachable provider.
Phase 3F.1 is therefore permanently closed. Per the governing spec, Phase 3F.2 is explicitly
**not** begun in this session.
