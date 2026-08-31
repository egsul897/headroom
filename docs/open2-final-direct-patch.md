# OPEN-2 Final Direct Patch — Final Report

**Verdict: `PHASE_3F_1_CODE_FOUNDATION_CLOSED_CONDITION_VALIDATION_ENVIRONMENT_BLOCKED`**

## Scope

This was a small, direct correction of one incorrect boolean assumption inside one
already-selected helper function — not another architecture phase. It was issued after
independent recertification of the prior narrow correction found exactly one remaining
mechanism: `resolveNodeWithSupersessionAwareness`'s `currentText !== null` branch was
taken unconditionally, resting on an unenforced comment claim that non-null `currentText`
implies `view.status === "OPERATIVE_STATE_RESOLVED"` — false whenever a real amendment
has a genuinely unresolved/conditional effective date.

- **Starting SHA**: `602d38949ea5ec356f98c5d054df0a75275cbf12`
- **Implementation freeze SHA**: `4ca90f2e700f3baba1a03fcba57eec38a6f1bdac`
- **Final SHA**: `afde655`

## The fix

`view.status === "OPERATIVE_STATE_RESOLVED"` is now checked FIRST and structurally
dominates the `currentText` check, exactly per the mandated Case A/B/C/D decision table.
A new `textSource` value (`UNRESOLVED_AMENDED_TEXT`) ensures text served from a
non-resolved view is never mislabeled as current. `buildProvisionView`'s producer
semantics were not touched. Exactly one production file changed:
`lib/contract-model/compiler/semantic/tools.ts` — independently reconfirmed via `git diff`.

**Part A results**: the auditor's exact exploit was reproduced against pre-fix code
(git-stash verified) and confirmed closed post-fix for all 4 affected paths
(`getParentClause`, `getSiblingClauses`, `getReferencedProvision` absolute and relative).
A full 4-tool real-Postgres end-to-end matrix passed. An 18-case permanent invariant test
(3 non-RESOLVED statuses × null/non-null `currentText` × 3 node-supersession shapes, plus
defensive hand-built fixtures the real producer doesn't construct today) passed — the
helper remains safe even if future producer behavior changes. A narrow anti-pattern
search (bounded to `tools.ts`) found no other equivalent of this defect.

## Independent confirmation

A fresh auditor, pinned to the Part A freeze and forbidden from touching production code,
was asked one central question: **can any `OperativeProvisionView` with
`status !== OPERATIVE_STATE_RESOLVED` reach `evidenceCurrent=true` through any of the
CURRENT_OPERATIVE_EVIDENCE text tools?**

They confirmed the structural ordering claim by reading the actual code line by line
(not trusting the implementer's report), and found the fix holds via **two**
independently-correct mechanisms: `resolveNodeWithSupersessionAwareness`'s status-first
gate (used by the 4 previously-unsafe tools) and the 3 already-safe tools' own direct
status-gating (`getOperativeProvision`/`getRelatedAmendments` via
`isConfirmedCurrentOperativeEvidence`, `getDefinition` via
`resolveOperativeDefinitionEvidence`, `getChildren` via its own separate
`resolveParentSubstructureEvidence`). 18 fresh tests — distinct section numbers,
document names, amendment wording, and condition wording from every implementer
fixture — covered all 15 required attack angles: non-null/null `currentText` combined
with non-RESOLVED status, a fresh unresolved-effective-date construction, mixed
applied+unresolved amendments on the same section, CONFLICTED, PARTIAL, REVIEW_REQUIRED
via a different reason code than the implementer's own example, both
`getReferencedProvision` paths, sibling aggregate-masking, `getParentClause`,
`getChildren`, two full compile→verify→persist→fresh-Postgres-read constructions, and
clean controls. All 18 passed.

**Disposition: PASS.** OPEN-2 is CERTIFIED_CLOSED.

## OPEN-4

After OPEN-2's confirmation, a process-local Gateway probe (credential never persisted)
returned the identical HTTP 402 "Team budget exceeded. Current spend: $50.05, limit:
$50.00" — unchanged from every prior probe across this entire multi-phase engagement.
Real cost this phase: $0.00. Production code (`condition-suspicion-classifier.ts` and
all related files) was not modified. Per the governing spec's own rule, this determines
the final state: OPEN-2 closed, OPEN-4 still externally blocked.

## Cross-cutting findings

**Production freeze held**: `git diff 4ca90f2 HEAD` on `lib/**`, `app/**`,
`prisma/schema.prisma`, `prisma/migrations/**` is empty throughout the independent
confirmation.

**Quality gates (final state)**: 214/215 targeted files passing (1 confirmed
pre-existing OPEN-3 timing flake, unrelated to this phase's single-file diff); tsc 6
pre-existing errors (0 new); eslint 1 pre-existing error (0 new); known-package
regression NO_REGRESSION (fwrg=0, lsb=0, dsgr=215, conmed N/A); 14/14 false-credit
controls NO_CREDIT; OPEN-1/3/5/6 confirmed absent from the production diff, not
reopened.

## Verdict and required next action

**`PHASE_3F_1_CODE_FOUNDATION_CLOSED_CONDITION_VALIDATION_ENVIRONMENT_BLOCKED`.**

The entire code foundation of Phase 3F.1 (OPEN-1 through OPEN-3, OPEN-5, OPEN-6, and now
OPEN-2) is closed. No more production remediation is authorized for it. Only the frozen
OPEN-4 real-model holdout (22 pre-authored adversarial constructions, ready to run
unchanged) remains before formal 3F.1 certification — gated entirely on a human
increasing the Vercel AI Gateway team budget above the current $50.05 spend. This
session stops here, per instruction; Phase 3F.2 is not begun.
