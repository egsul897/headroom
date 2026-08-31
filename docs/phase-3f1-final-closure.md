# Phase 3F.1 Final Closure — Final Report

**Verdict: `PHASE_3F_1_FINAL_CLOSURE_FAILED`**

## Scope

Issued immediately after the prior phase (`phase-3f1-terminal-architecture-decision`) returned
`PHASE_3F_1_TERMINAL_ARCHITECTURE_CLOSURE_FAILED`, with 4 of 6 named defects still open. This
phase's governing spec split those four into two categories: three real, reproduced code-level
defects (OPEN-1 structural heading, OPEN-2 context-evidence trust, OPEN-6 error totality) to fix
here, and one architecture (OPEN-4 condition-suspicion classifier) that had already passed code
inspection but whose real-model empirical validation was blocked by an exhausted account budget —
explicitly frozen from further production changes this phase unless real-model evidence falsified it.

- **Starting SHA**: `228b6f17c6e8e5112af20d364bf92301317c6f24`
- **Part A freeze SHA**: `b641ebfb9d1e9145470d06823b52c20dcd90e0a1`
- **Final SHA**: `14c73dd`

## Part A (implementation)

Three isolated workstreams fixed FIX-1, FIX-2, FIX-3 at what each believed was the root cause:

- **FIX-1**: removed `NOISE_DISCOUNTED` as a heading-acceptance score weight (the literal
  "noise removal must not itself count as evidence" invariant); added a new candidate-local
  `titleBodySeparationHolds` signal that inspects text *following* a candidate, plus a
  wrap-tolerance mechanism for multi-line headings that also fixed two incidental real-fixture
  regressions.
- **FIX-2**: routed every DEFINITION/SECTION/CROSS_REFERENCE context-bundle item through
  `resolveOperativeDefinitionEvidence`/a new `resolveOperativeSectionEvidence` at
  bundle-construction time, plus an independent tool-call-free compile/verify gate — honestly
  disclosing one residual gap (`getOperativeProvision`'s tool-call path) they judged, but did not
  verify, was covered by the new gates regardless.
- **FIX-3**: decomposed `classifyError` into `safeErrorMessage`/`safeErrorClass`, each individual
  property access independently try/catch-guarded — including their own self-caught bug where the
  `instanceof Error` check itself was initially left unguarded against a hostile `getPrototypeOf`
  trap.

Part A's own quality gates were green (259 files/2751 tests, 2 pre-existing flaky failures
confirmed reproducible at the pre-fix baseline; tsc/eslint at baseline; known-package regression
NO_REGRESSION; 14/14 false-credit controls NO_CREDIT), yielding
`PHASE_3F_1_FINAL_THREE_FIXES_READY_FOR_RECERTIFICATION`.

One process note: the read-only known-package regression script
(`scripts/phase-3f1-6-known-package-regression.ts`) rewrites a historical artifact
(`docs/phase-3f1-6-final-foundation-certification/26-known-package-regression.json`) as a
documented side effect of its own design. This was reverted via `git checkout --` both times it
was run in this phase, preserving historical-artifact immutability.

## OPEN-4 precondition check

Before dispatching any Part B auditor, a one-shot probe against the Vercel AI Gateway (credential
injected as a process-local environment variable for a single command only — never persisted to
`.env` or any committed file) returned:

```
HTTP 402: {"error":{"message":"Team budget exceeded. Current spend: $50.05, limit: $50.00. ..."}}
```

Identical account state to the immediately preceding phase's own finding. Real cost incurred:
**$0.00**. Per the governing spec, this makes OPEN-4 **ENVIRONMENT_BLOCKED** — no auditor was
dispatched, and `condition-suspicion-classifier.ts`/`verify.ts`'s two-gate routing were not
touched. Rerun instructions (once budget is restored) are recorded in
`docs/phase-3f1-final-closure/15-condition-real-model-validation.json`.

## Part B (independent recertification)

Three independent auditors, each pinned to the Part A freeze commit, forbidden from touching
production code, and required to write fresh adversarial tests never seen by the implementer,
recertified FIX-1, FIX-2, FIX-3:

| Defect | Scope | Disposition |
|---|---|---|
| OPEN-1 | FIX-1 structural heading | **STILL_OPEN** |
| OPEN-2 | FIX-2 context-evidence trust | **STILL_OPEN** |
| OPEN-4 | condition-suspicion real-model validation | **ENVIRONMENT_BLOCKED** (not dispatched) |
| OPEN-6 | FIX-3 error totality | CERTIFIED_CLOSED |

### OPEN-1 — STILL_OPEN
The original noise-adjacency false positive is genuinely closed. But `titleBodySeparationHolds`
only detects a fake citation when its continuation is **lowercase**. Any ordinary, well-punctuated
citation followed by a capitalized, digit-led, or quote-led new sentence — the normal shape of real
drafting, not an edge case — still launders through, reproducing the exact rank-stack corruption
with zero footnote, noise, or bad grammar involved. A minimal pair (identical text, correctly
rejected unwrapped, wrongly accepted once a single newline splits the title before its own
lowercase tell) isolates the new wrap-tolerance mechanism itself as an independent false-positive
path — exactly the new-surface-area risk this phase's charter asked the auditor to scrutinize. A
secondary, lower-confidence opposite-direction finding: a "Term. means ..." definitions-style real
heading is wrongly vetoed.

### OPEN-2 — STILL_OPEN
The original zero-tool-call context-bundle bypass is genuinely closed — bundle-construction-time
routing checks out at every real call site. But the implementer's own disclosed residual gap
(`getOperativeProvision`'s tool-call path never setting `evidenceUnresolved`) was claimed to be
independently covered by the new gates "regardless" of that gap — this claim was directly tested
and found **false**. A fresh end-to-end exploit (a genuinely `OPERATIVE_STATE_CONFLICTED` section,
never embedded in the context bundle, reached only via a real `getOperativeProvision` tool call)
reaches a persisted `SemanticTruthRecord.trustStatus` of `VERIFIED`, confirmed via a real Postgres
round-trip. None of the three OR'd safety gates fire for this shape.

### OPEN-4 — ENVIRONMENT_BLOCKED
See above. Architecture already passed code inspection in the prior phase; empirical validation
remains blocked by an exhausted external account budget, unrelated to any code defect.

### OPEN-6 — CERTIFIED_CLOSED
A fresh 19-value hostile-value matrix (Symbol.hasInstance poisoning, has-trap-only Proxies,
toStringTag divergence, two-level `constructor.name` poisoning, revoked `Proxy.revocable()`, and
more) found no way to break totality. Line-by-line review confirmed every property access on the
untrusted value is independently guarded, and several requested attack channels are structurally
inert. The auditor's own initial false positive (vitest's `.toThrow()` internals tripped by the
same global poisoning used to test the production code) was correctly diagnosed as a
test-methodology artifact, not a production defect, and fully disclosed.

## Cross-cutting findings

**Production freeze held**: `git diff b641ebf HEAD` on `lib/**`, `app/**`,
`prisma/schema.prisma`, `prisma/migrations/**` is empty. No auditor touched production code.

**Quality gates (final state)**: 262 files / 2799 tests, ALL PASSING; tsc 6 pre-existing errors
(0 new); eslint 1 pre-existing error (0 new); build succeeds; known-package regression
NO_REGRESSION (fwrg=0, lsb=0, dsgr=215, conmed N/A — identical throughout); 14/14 false-credit
controls NO_CREDIT; OPEN-3 (N-way decomposition) and OPEN-5 (fencing) not reopened, confirmed
absent from the production diff.

## Verdict and required next action

**`PHASE_3F_1_FINAL_CLOSURE_FAILED`.**

The final-pass standard (OPEN-1, OPEN-2, OPEN-4, OPEN-6 all CERTIFIED_CLOSED) is not met: only
OPEN-6 is. This is **not** an overall `ENVIRONMENT_BLOCKED` verdict — that outcome is reserved for
when Part A has otherwise passed and only the OPEN-4 real-model holdout is externally blocked. Here,
OPEN-1 and OPEN-2 carry genuine, independently-reproduced code-level defects entirely unrelated to
any credential or budget constraint. Per the governing spec: this phase does not auto-repair, does
not invent another named 3F.1 remediation phase, and does not begin 3F.2. The two open code defects
(OPEN-1, OPEN-2) and the one environment-blocked item (OPEN-4) are returned to a human architecture
lead for a decision. This session stops here.
