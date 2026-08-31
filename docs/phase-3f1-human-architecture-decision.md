# Human Architecture Decision Execution — Final Report

**Verdict: `PHASE_3F_1_ARCHITECTURE_DECISION_EXECUTION_FAILED`**

## Scope

This phase executed a human architecture decision issued directly in response to
`PHASE_3F_1_FINAL_CLOSURE_FAILED`, which split the four previously-open defects into
two categories: OPEN-1 and OPEN-2 (real, reproduced code-level defects requiring the
mandated architecture below) and OPEN-4 (an already-inspected architecture blocked only
by an exhausted external Gateway budget, explicitly frozen this phase). OPEN-3, OPEN-5,
and OPEN-6 remained closed and were not reopened.

- **Starting SHA**: `a2b00f08fca13f066433b15917378c999d0942e1`
- **Part A freeze SHA**: `a7ee654f4eec1614ef59d47c5f07c597264edc5a`
- **Final SHA**: `d0dade3`

## OPEN-1 — structural heading triage + bounded ambiguity classifier

The human-mandated architecture: STOP trying to make deterministic heuristics alone
distinguish a real heading from an in-prose citation. Instead, deterministic triage
classifies every candidate `CONFIDENT_HEADING | CONFIDENT_PROSE_REFERENCE | AMBIGUOUS`;
only `AMBIGUOUS` candidates go to a bounded, source-only, fail-closed LLM classifier;
`UNCERTAIN` (or any classifier failure) never fabricates a structural boundary.

This was built and tested in isolation (109 tests), but the first wiring attempt made a
critical mistake: it wired the new architecture into `lib/contract-model/compiler/orchestrator.ts`,
which is **explicitly quarantined legacy code** that `app/**` is forbidden from calling.
A real user's compile run would not have reached the new code at all. This was caught —
by the implementing workstream's own honest self-report — and a targeted follow-up fix
wired the *actual* live entry point, `lib/contract-model/analysis/orchestrator.ts`'s
`runContractAnalysis` (called from `app/[companyId]/onboarding/documents/actions.ts`).

**Independent Part B recertification: CERTIFIED_CLOSED.** The auditor did not trust
either report — they independently traced the call chain themselves and confirmed the
real orchestrator genuinely calls the new triage-aware path. They then invented 38 fresh
adversarial cases (never copied from any prior test) covering every required true-heading
and prose-reference shape, plus dedicated rank-stack composition checks and a real
Postgres-backed end-to-end test. Result: zero false accepts, zero false rejects, zero
material hierarchy corruption. Confident-only documents cost zero classifier calls.

## OPEN-2 — universal evidence-tool trust invariant

The human-mandated architecture: any LLM-facing tool returning contract text usable as
current operative evidence must set `evidenceUnresolved = true` whenever that evidence
cannot be positively confirmed current — enforced mechanically via a shared helper every
`CURRENT_OPERATIVE_EVIDENCE`-declared tool's `execute()` must call, not left to
per-tool-author discipline.

The implementer built the shared helper, fixed the originally-reported `getOperativeProvision`
gap, and — via a one-time registry audit — found and fixed the *identical* gap in 5
additional tools nobody had individually reported.

**Independent Part B recertification: STILL_OPEN.** The auditor independently re-derived
the registry count (confirmed correct: exactly 7 `CURRENT_OPERATIVE_EVIDENCE` tools) and
confirmed the original exploit is genuinely closed. But 4 of the 7 "fixed" tools
(`getParentClause`, `getChildren`, `getSiblingClauses`, `getReferencedProvision`) share a
precisely root-caused residual gap: `resolveNodeWithSupersessionAwareness` only consults
the section's real operative status when `view.currentText` is non-null — but
`buildProvisionView` *always* nulls `currentText` for exactly the conflicted/unresolved
cases this invariant must catch. These 4 tools silently fall back to a raw per-node check
that defaults to `CURRENT_OPERATIVE` whenever no amendment effect has yet *actually
applied* — an ordinary real-world "signed but not-yet-effective conflict" shape, distinct
from the already-effective conflict the original fix covered. A fresh end-to-end exploit
via `getSiblingClauses` reaches a real, persisted `SemanticTruthRecord.trustStatus` of
`VERIFIED` off a genuinely conflicted section.

## OPEN-4 — condition-suspicion real-model validation

Reconfirmed `ENVIRONMENT_BLOCKED` at this phase's start via a process-local probe
(never persisted): the Vercel AI Gateway budget remains exhausted ($50.05/$50.00, real
cost $0.00). Production code was not touched. Since OPEN-2 came back STILL_OPEN, the
overall phase outcome does not hinge on OPEN-4's state — the frozen 22-case holdout was
not re-run this phase, per the governing spec's own framing (the `ENVIRONMENT_BLOCKED`
overall outcome requires OPEN-1 **and** OPEN-2 to both close first).

## Cross-cutting findings

**Production freeze held**: `git diff a7ee654 HEAD` on `lib/**`, `app/**`,
`prisma/schema.prisma`, `prisma/migrations/**` is empty. Neither Part B auditor touched
production code.

**Quality gates (final state)**: 209 targeted files / 2421 tests, ALL PASSING; tsc 6
pre-existing errors (0 new); eslint 1 pre-existing error (0 new); build succeeds;
known-package regression NO_REGRESSION (fwrg=0, lsb=0, dsgr=215, conmed N/A — unchanged
throughout); 14/14 false-credit controls NO_CREDIT; OPEN-3/OPEN-5/OPEN-6 confirmed
absent from the production diff, not reopened.

## Verdict and required next action

**`PHASE_3F_1_ARCHITECTURE_DECISION_EXECUTION_FAILED`.**

Per the governing spec's own final-outcome rule: OPEN-2 remains open, so this cannot be
`PHASE_3F_1_CLOSED`, and cannot be the `ENVIRONMENT_BLOCKED` overall outcome either (that
outcome requires OPEN-1 *and* OPEN-2 to both close first, with only OPEN-4 remaining).
OPEN-1's genuine closure does not offset OPEN-2's failure — the spec requires both.

**Per the governing spec's explicit stop rule, this phase does not loop back into another
fix-and-recertify cycle for OPEN-2's residual gap**, even though the auditor's own report
identifies a precise, narrow fix (make `resolveNodeWithSupersessionAwareness` and
`getChildren`'s equivalent check consult `view.status` directly and unconditionally
whenever a real `OperativeProvisionView` exists, mirroring the 3 already-safe tools,
rather than branching on whether `currentText` happens to be non-null). This exact
failure mechanism is returned to a human architecture lead. No new named remediation
phase is invented automatically, and Phase 3F.2 is not begun.
