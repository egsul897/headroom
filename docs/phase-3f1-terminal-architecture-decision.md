# Phase 3F.1 Terminal Architecture Decision — Final Report

**Verdict: `PHASE_3F_1_TERMINAL_ARCHITECTURE_CLOSURE_FAILED`**

## Scope

This phase was issued immediately after the prior terminal-remediation phase
(3F.1.6.RX-FINAL, resumed under the incident-recovery phase) itself returned a
FAILED verdict with 6 of 8 defects still open. This phase declared the
database-concurrency incident permanently closed (not reopened here) and
scoped itself to exactly six named open defects, with one — OPEN-4, the
condition-suspicion architecture — explicitly designated the deciding test of
the whole phase.

- **Starting SHA**: `f1d14003deeb9668cc0900f41c7aa7406acc4bd2` (frozen lineage baseline)
- **Part A freeze SHA**: `0ef66a94bfe51d4c5652749ae1b57033d1c0e72f`
- **Part B freeze SHA (unchanged)**: `0ef66a9...` (production freeze — held throughout)
- **Final SHA checked**: `c6e9d4e`

## Part A (implementation)

All six defects were fixed at the root cause (not patched around specific
reported reproductions). Quality gates were green: 250 files / 2639 tests, 0
failures; tsc/eslint at the pre-existing baseline; build succeeded; 14/14
false-credit controls NO_CREDIT; known-package regression NO_REGRESSION
(FWRG=0, LSB=0, DSGR=215). OPEN-4's implementer honestly disclosed that
real-model generalization was unvalidated in their own credential-less
environment, correctly deferring that proof to Part B.

## Part B (independent recertification)

Six independent auditors (A–F), each pinned to the Part A freeze commit,
forbidden from touching production code, and required to write fresh
adversarial tests never seen by the implementer, recertified each defect:

| Defect | Scope | Auditor | Disposition |
|---|---|---|---|
| OPEN-1 | BLOCKER-1 structural heading | A | **STILL_OPEN** |
| OPEN-2 | BLOCKER-5/6 getDefinition operative-state safety | B | **STILL_OPEN** |
| OPEN-3 | BLOCKER-8/AUDIT-F4 N-way claim decomposition | C | CERTIFIED_CLOSED |
| OPEN-4 | BLOCKER-9 condition-suspicion architecture (deciding test) | D | **STILL_OPEN** |
| OPEN-5 | AUDIT-F2 AnalysisRun/SemanticTruth fencing | E | CERTIFIED_CLOSED |
| OPEN-6 | AUDIT-F7 failure-observability robustness | F | **STILL_OPEN** |

**Tally: 2 of 6 CERTIFIED_CLOSED, 4 of 6 STILL_OPEN.**

### OPEN-1 — STILL_OPEN
Part A's scored-heading mechanism fixes the inherited false negative but opens
a fresh false-positive class: `NOISE_DISCOUNTED` only checks whether
noise-stripping changed anything in a 200-char lookback, without requiring the
discounted noise to belong to the *same boundary* as the candidate. A genuine
footnote glued to an unrelated, earlier sentence's closing delimiter,
immediately preceding an ordinary in-text section citation, meets the
acceptance threshold and launders that citation into a false SECTION heading —
re-parenting a real lettered clause under it. Reproduced under two materially
different combinations; an isolation control confirms causation.

### OPEN-2 — STILL_OPEN
The whitespace-normalization fix and the new canonical
`resolveOperativeDefinitionEvidence` primitive are robust *when the
`getDefinition` tool is actually called*. But `evidenceUnresolved` is only
ever set inside that tool's own execution. `caller.ts`'s
`summarizeContextBundle` dumps raw `excerptText` into the model's first turn
with no operative-state/supersession field, inviting an answer with zero tool
calls. An end-to-end reproduction — a real CONFLICTED definition, stale text
embedded in the context bundle, a scripted model that answers on turn 1 with
no tool calls — reaches `VERIFIED_NO_MATERIAL_GAP_FOUND` off an unresolved
definition, exactly the outcome Part A's design claims is unreachable.

### OPEN-3 — CERTIFIED_CLOSED
Oxford-comma recognition, the narrowed restated-modal guard, and the
linear-time incremental-Set scanning all held under fresh mixed-construction
adversarial tests, a novel false-positive control, nested parentheticals, and
an independent linear-scaling re-measurement.

### OPEN-4 — STILL_OPEN (the deciding test)
Manual code inspection **passes** the disqualifying bar: the classifier's
system prompt is genuinely compositional (role-based reasoning, zero
regex/word lists) and `verify.ts`'s two-gate routing is airtight — no path
skips review without an explicit successful
`NO_MATERIAL_CONDITION_SUSPECTED`. But the deciding *empirical* claim — real
semantic generalization on 22 fresh, never-seen condition constructions
(covering all 17 required categories) — could not be validated: the
account-level Vercel AI Gateway budget was already exhausted ($50.05/$50.00)
before this recertification began. All 22 real calls, plus an independent raw
HTTP probe, returned HTTP 402 (real cost incurred: **$0.00**). Every call
fail-safed to UNCERTAIN, producing 100% routing-to-review — but this is the
fail-safe path, not genuine model judgment, and does not validate the central
claim. Given this exact defect class has failed four prior recertifications
on unvalidated empirical claims, architecture inspection alone is
insufficient for closure. The 22 constructions are pre-authored and
committed, ready to run once a human restores the account budget.

### OPEN-5 — CERTIFIED_CLOSED
7 consecutive clean runs against real, unmocked Postgres: multi-object races,
a three-generation flux race across single and 4 concurrent objects, and a
25-way deadlock-risk probe (never hung). No stale write ever took effect.

### OPEN-6 — STILL_OPEN
Part A correctly wrapped the last-resort `console.error` in try/catch. But
`classifyError`, called *before* `console.error` at both call sites, can
itself throw via a poisoned error value's `toString()`/`.message` getter — a
new sub-defect one statement earlier in the same call chain, still capable of
a fully silent failure.

## Cross-cutting findings

**Production freeze held**: `git diff 0ef66a9 HEAD` on `lib/**`, `app/**`,
`prisma/schema.prisma`, `prisma/migrations/**` is empty. No auditor touched
production code.

**A same-day, non-production regression was found and fixed during this
synthesis** (not by any auditor): the `AI_GATEWAY_API_KEY` persisted to
`.env` earlier in this phase (to let auditor D attempt real calls) caused 7
test files / 9 tests to fail on a full untargeted run, because it routed
those tests off the synthetic-fallback path into the real provider, which
then 402'd against the exhausted budget. This was not a code regression
(freeze diff confirmed empty) — it was purely local `.env` credential state.
The key has been commented out (not deleted, with an explanatory note) since
it is non-functional until a human increases the budget; the full suite was
re-verified green afterward: **255 files / 2686 tests, 0 failures**.

**Quality gates (final state)**:
- tsc: 6 pre-existing errors, identical set to baseline, 0 new.
- eslint: 1 pre-existing error, identical to baseline, 0 new.
- vitest: 255 files / 2686 tests, ALL PASSING.
- 14/14 false-credit controls: NO_CREDIT (part of the green run).
- Destructive-pattern checker: unchanged from baseline, 0 new findings.

## Verdict and required next action

**`PHASE_3F_1_TERMINAL_ARCHITECTURE_CLOSURE_FAILED`.**

The final-pass standard (all six CERTIFIED_CLOSED) is not met — only 2 of 6
are. Per the governing phase specification: this phase does not auto-repair,
does not invent another named 3F.1 remediation phase, and does not begin
3F.2. The four open defects (OPEN-1, OPEN-2, OPEN-4, OPEN-6) are returned to
a human architecture lead for a decision. This session stops here.
