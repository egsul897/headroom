# Phase 3 — uncontaminated system-output regeneration + V3.1.1 re-score

This directory is the record of an **evidence-regeneration** mission. It does not change
production, and it does not claim a production defect it has not measured.

## Status: BLOCKED on paid-call authorization

§1 requires the deterministic cost and model-call plan to be recorded before any paid call,
and instructs the mission to stop and return `PAID_CALL_AUTHORIZATION_REQUIRED` if the
environment requires explicit human approval. It does. **No model call has been made.**

Artifacts 05, 06, 07, 09, 10, 11 therefore record `NOT_GENERATED — awaiting paid-call
authorization` rather than being absent, so "not done" is distinguishable from "not reported".

## What was settled at zero cost

| Question | Answer | Artifact |
| --- | --- | --- |
| Which cases carry contaminated evidence? | **All 47**, not the 20 previously named | `03` |
| Why? | Pipeline identity: frozen evidence stamps a prompt version production no longer runs | `03` |
| How big is an honest regeneration? | 1,274 candidates, benchmark-blind, uncapped | `04` |
| What would it cost? | ~$387 central, $194–$581 band, ~75 h at concurrency 4 | `02`, `13` |
| Can anything be reused from cache? | No — the cache key carries the prompt version | `02` |
| Does the composed-citation verification demotion still reproduce? | **Yes**, in current production | `08` |

## The selection rule is benchmark-blind

Each package contributes the Article family its own covenant architecture places its negative
covenants in. No caseId, no claim address and no expected answer takes part in selection, and
`tests/phase-3-regeneration/` enforces that mechanically rather than by assertion.

## What this mission did NOT do

- It did not change any production file. `15-verdict.json` carries the diff proof.
- It did not fix verification (§6 forbids it) — `08` only establishes that the behaviour is current.
- It did not touch the benchmark ground truth, the V3.1.1 corrected claims, the frozen reviewer
  artifacts or any previous audit artifact.
- It did not begin production remediation and did not begin Phase 4E.

