# OPEN-2 Terminal Trust-Boundary Correction — Final Report

**Verdict: `PHASE_3F_1_OPEN2_TERMINAL_CORRECTION_FAILED`**

## Scope

This was a narrow, surgical, single-mechanism correction to OPEN-2 — not a broad
remediation cycle — issued after independent code review confirmed the remaining
defect precisely: a conflation of two distinct concepts, provision operative-state
health ("can this provision's current legal state be trusted?") and physical node
supersession status ("has this particular old physical occurrence actually been
superseded?"). OPEN-1, OPEN-3, OPEN-4, OPEN-5, and OPEN-6 were frozen and not touched.

- **Starting SHA**: `cdf3394341a6e9e0ac34886ef6cc43864ef15423`
- **Implementation freeze SHA**: `b3773adb8643d83cb2c57c029aef7eded59199ec`
- **Final SHA**: `a2a79ef`

## The confirmed root cause and the mandated fix

`resolveNodeWithSupersessionAwareness` (`lib/contract-model/compiler/semantic/tools.ts`)
discarded a real, matching `OperativeProvisionView`'s `status` whenever `currentText`
was null — falling through to a raw, physical-node-only supersession check that could
report `CURRENT_OPERATIVE` for a signed-but-not-yet-effective conflicting amendment,
since no amendment had yet actually *applied* to that node. This let `evidenceUnresolved`
come back `false` and a real exploit reach a persisted `VERIFIED` trust status via 4
tools: `getParentClause`, `getChildren`, `getSiblingClauses`, `getReferencedProvision`.

The mandated fix: text selection and trust selection must be separate. Whenever a real
matching `OperativeProvisionView` exists, its `status` must participate in trust
determination unconditionally — never silently discarded because `currentText` happened
to be null.

## Part A implementation

A single, surgically-scoped workstream built this exactly: a new `ResolvedNodeEvidence`-
shaped design separating `textSource` from `evidenceCurrent`, applied to all 4 affected
tools, with `getChildren` given its own dedicated resolver (a structurally different
question — substructure validity, not text trustworthiness). The original certified
exploit was reproduced against pre-fix code first, then confirmed closed post-fix
end-to-end (compile → verify → real Postgres persistence). A full 8-case × 4-tool
(32-cell) matrix passed. The 3 already-safe tools (`getOperativeProvision`, `getDefinition`,
`getRelatedAmendments`) showed zero behavioral change. Exactly one production file
changed (`lib/contract-model/compiler/semantic/tools.ts`), independently reconfirmed via
`git diff`. Quality gates: 271/274 files passing (2 confirmed pre-existing flaky files,
unrelated), tsc/eslint at exact baseline, known-package regression NO_REGRESSION, 14/14
false-credit controls NO_CREDIT.

## Independent recertification

A fresh auditor, pinned to the Part A freeze and forbidden from touching production
code, independently re-derived the root cause from the code itself (matching the
implementer's claim for the *original* defect), reproduced the original exploit
(confirmed genuinely closed), and then went beyond the implementer's own 32-cell matrix
with fresh conflict-timing combinations.

**This surfaced a second, genuinely fresh residual defect the implementer did not
construct**, inside the very same fixed function: the `currentText !== null` branch is
taken **unconditionally**, never re-checking `view.status`. Its own header comment
asserts this only happens when `status === RESOLVED` — that claim is false. A provision
that is honestly `OPERATIVE_STATE_REVIEW_REQUIRED` purely via
`AMENDMENT_SEQUENCE_UNRESOLVED` (a real, signed amendment with a genuinely
conditional/unresolved effective date — e.g. "effective upon satisfaction of the Merger
Condition") never enters `appliedChain`, so `currentText` stays as the untouched base
text (non-null). `getParentClause`, `getSiblingClauses`, and `getReferencedProvision`
(both its absolute-reference and `fromNodeId` paths) all report `CURRENT_OPERATIVE` /
`evidenceUnresolved: false` for this shape — reaching compile `COMPLETED`, verify
`VERIFIED_*`, and a real, persisted `SemanticTruthRecord.trustStatus` of `VERIFIED`,
confirmed via a fresh Postgres round-trip. `getChildren` (its own separate, status-only
resolver) and the 3 previously-safe tools are unaffected — confirmed to correctly resist
this same new construction too.

**Per-tool disposition**: `getChildren` CERTIFIED_CLOSED. `getParentClause`,
`getSiblingClauses`, `getReferencedProvision` STILL_OPEN.

## Cross-cutting findings

**Production freeze held**: `git diff b3773ad HEAD` on `lib/**`, `app/**`,
`prisma/schema.prisma`, `prisma/migrations/**` is empty. The auditor touched no
production code.

**OPEN-4**: reconfirmed `ENVIRONMENT_BLOCKED` via a process-local probe (never
persisted) — Gateway budget remains exhausted ($50.05/$50.00, $0 real cost this phase).
Production code untouched; the frozen 22-case holdout was not run since the overall
outcome does not hinge on it while OPEN-2 remains open.

**Quality gates (final state)**: 210/212 targeted files passing (2 confirmed
pre-existing OPEN-3 timing flakes, unrelated to this phase's single-file diff); tsc 6
pre-existing errors (0 new); eslint 1 pre-existing error (0 new); known-package
regression NO_REGRESSION (fwrg=0, lsb=0, dsgr=215, conmed N/A); 14/14 false-credit
controls NO_CREDIT; OPEN-1/3/5/6 confirmed absent from the production diff, not
reopened.

## Verdict and required next action

**`PHASE_3F_1_OPEN2_TERMINAL_CORRECTION_FAILED`.**

Per the governing spec's own defined terminal-outcome rule: OPEN-2 remains STILL_OPEN
after independent recertification, so this cannot be `PHASE_3F_1_CLOSED` or the
`ENVIRONMENT_BLOCKED` overall variant. The exact failure mechanism — the same
`currentText`-presence-driven anti-pattern this phase set out to eliminate, discovered
one layer deeper in the very same function — is returned to a human architecture lead.
No auto-repair was attempted, no new remediation phase is invented automatically, and
Phase 3F.2 is not begun.
