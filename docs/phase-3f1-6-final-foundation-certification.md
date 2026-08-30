# Phase 3F.1.6 — Final Foundation Certification

**Verdict: `PHASE_3F_1_6_FINAL_FOUNDATION_CERTIFICATION_FAILED`**

This phase was an independent CERTIFICATION, not an implementation, architecture,
or evaluator-methodology phase. Its charter was explicit: production code
changes were presumptively forbidden, and any genuine blocker discovered was
to be reported, never silently repaired. The question this phase set out to
answer was: does Headroom's contract-model foundation, exactly as it now
exists, deserve to be trusted enough to proceed to Phase 3F.2 (second
unseen-package validation) and Phase 4 (Contract Computation)?

## Starting state

- SHA `ea82ee80f4528117e7dc6669be8e1ebf28b24108`, branch
  `claude/headroom-scaffold-covenant-engine-jrijk8`, clean working tree.
- Phase 3F.1.5.R's verdict (`PHASE_3F_1_5_R_RESIDUAL_FOUNDATION_CLOSURE_PASSED`)
  and every number in its own artifacts were treated as fixed historical fact,
  never re-litigated or rewritten — only independently re-verified where
  practical.
- Postgres was down at session start (a different container state than the
  immediately preceding phase) and was started via `pg_ctlcluster 16 main
  start` — local test infrastructure only, consistent with precedent.

## Methodology

Six parallel, isolated-worktree "auditor" agents were dispatched, each
production-frozen (only new test/script/doc files allowed; instructed to
STOP and report rather than fix if a production change seemed needed), each
required to build its OWN adversarial tests and scripts against real
Postgres and real source fixtures rather than trusting any prior phase's own
self-reported claims, and each required to classify every finding as
BLOCKER / MAJOR_NON_BLOCKING / MINOR / INFORMATIONAL without downgrading
severity because a fix looked easy.

| Auditor | Certified trust boundaries |
|---|---|
| 1 | Structural integrity, rank-stack false-negative audit, supersession awareness |
| 2 | Package relationships, operative state, definition isolation, source trace |
| 3 | Ingestion identity, tenant isolation, database/migration integrity |
| 4 | Discovery coverage, semantic claim identity, semantic compilation safety, independent verification |
| 5 | Safe-failure model, safe-failure wiring, NO_SILENT_MATERIAL_FAILURE, review-event signal/false-negative quality, false-credit controls |
| 6 | Architecture invariant audit, cross-module failure propagation, known-package regression, adversarial matrix, static danger-pattern audit |

Each auditor's isolated-worktree commit was individually reviewed and
cherry-picked onto the real working branch (a recurring, independently
self-corrected worktree-staleness issue — every agent found itself
provisioned at a stale commit and self-corrected before starting real work).
Zero merge conflicts across all 6 integrations.

## What the 6 auditors found

11 of the 16 lettered trust boundaries independently PASS or CERTIFY WITH
DISCLOSED, NON-BLOCKING gaps: document/occurrence identity, package
relationships, amendment precedence/operative state, definition isolation,
semantic compilation safety, tenant isolation, deterministic ingestion
identity, and persistence/migration integrity. The explicit claim-level
safe-failure architecture's own data model, its NO_SILENT_MATERIAL_FAILURE
compliance, and its review-event signal quality are all independently
confirmed sound.

**11 independently-confirmed, de-duplicated BLOCKER findings** exist across
5 trust boundaries plus one cross-cutting architecture-invariant violation:

1. **P1-10's rank-stack fix is incomplete.** All 7 residual structural
   anomalies in CONMED/DSGR — which the prior phase disposed of as benign —
   were independently re-inspected against real source text and are all
   `MATERIAL_STRUCTURAL_ERROR`: the exact original misattachment mechanism
   still reproduces because the plausibility gate's citation-signal phrase
   list is narrower than the concept it targets.
2. **P1-11's fix is functionally inert where it matters.** The supersession
   signal computed at Pass A never survives into `DiscoveredCandidate`, the
   type every real downstream consumer actually receives — plus two more
   consumer-classification defects (a mislabeled "protected by independence
   invariant" consumer, and 5 of 14 LLM-facing evidence tools that bypass
   operative state entirely), alongside the one gap the prior phase already
   disclosed.
3. **A cross-module composition gap** lets an independently-confirmed
   ambiguous DEFINITION-kind amendment target reach a confident-but-wrong
   `FULLY_REPRESENTED_VERIFIED`, violating Architecture Invariant #13 — found
   twice, independently, by an executed end-to-end test and a static grep.
4. **95 real, already-compiled `ContractRule` rows remain unbackfilled**
   after the source-trace `stableKey` fix — the fix's own logic is correct,
   but its rollout across existing persisted state is not complete.
5. **A real production sibling-claim identity collision** at the
   discoveryId/semanticUnitId layer, distinct from the two narrower risks
   the prior phase correctly scoped as evaluator-only.
6. **The independent verifier misses an omitted qualifying condition**,
   reaching a false "no material gap found."
7. **The entire safe-failure architecture — and the contract-model compiler
   pipeline beneath it — has zero live application callers.** A real
   customer's uploaded document today never reaches any of the
   structural/semantic/verification/safe-failure apparatus certified
   elsewhere in this report.
8. **Architecture Invariant #35 is violated**: `DebtEvent.sourceLedgerEntryId`
   is read but never written anywhere in production code.

Full evidence, reproduction steps, blast radius, and smallest remediation
boundary for each is in `docs/phase-3f1-6-final-foundation-certification/30-certification-findings.json`.
8 MAJOR_NON_BLOCKING, 3 MINOR, and 6 INFORMATIONAL findings were also
recorded, none of which affect the verdict.

One test failure (`tests/extraction/vercel-ai-gateway-provider.test.ts`) was
found during the quality-gate run, fully diagnosed as a pre-existing (code
byte-identical to this phase's starting commit), environment-dependent
anomaly entirely outside the 16 certified trust boundaries — disclosed, not
silently re-run until green, and not counted toward the verdict.

## Historical defect ledger

Every P0 (6) and P1 (12) from the original Phase 3F.1.3 audit, plus every
material finding disclosed by Phase 3F.1.4 and Phase 3F.1.5.R, now carries a
final, independently-verified disposition (no `PENDING_AUDITOR_VERIFICATION`
entries remain): `CLOSED_AND_CERTIFIED`, `CLOSED_BUT_NOT_YET_INDEPENDENTLY_CERTIFIED`,
`INTENTIONALLY_DEFERRED_NON_BLOCKING`, `OPEN_BLOCKER`, or
`OBSOLETE_FALSE_POSITIVE`. Full detail in
`docs/phase-3f1-6-final-foundation-certification/01-historical-defect-ledger.json`.

## Production freeze

Zero production code changes occurred during this entire phase, confirmed
both by each auditor's own self-report and by a direct `git diff` against
the phase's starting commit across the entire `lib/`, `app/`, and
`prisma/schema.prisma` trees plus migrations: all 57 files changed (7,939
insertions, 0 deletions) fall into `docs/`, `scripts/`, or `tests/` only.
Full detail in `docs/phase-3f1-6-final-foundation-certification/02-production-freeze-proof.json`.

## Gates run

- `npx tsc --noEmit -p .` — 6 errors, byte-identical to the pre-existing
  baseline; 0 new.
- `npx eslint .` — 1 error, identical to the pre-existing baseline; 0 new.
- `npx vitest run` — 202 test files (201 passed, 1 failed), 2,043 tests
  (2,042 passed, 1 failed); the 1 failure is the disclosed, out-of-scope
  environmental anomaly above. All ~105 new tests added by the 6 auditors
  pass.
- `npm run build` — succeeds, 21 routes, unchanged bundle profile.

Full detail in `docs/phase-3f1-6-final-foundation-certification/29-quality-gates.json`.

## Verdict

```
PHASE_3F_1_6_FINAL_FOUNDATION_CERTIFICATION_FAILED
```

Under this phase's own burden-of-proof framing, a foundation with 11
independently-reproduced BLOCKER findings — several of which are the same
classes of defect (silent claim disappearance, structural misattachment,
identity collision) that motivated Phase 3F.1.5.R's own safe-failure
architecture, now shown to still occur through paths that architecture does
not yet cover — does not meet the bar to proceed to Phase 3F.2 or Phase 4.
This is not a regression introduced by this phase (zero production changes
were made); it is this phase successfully doing the job it was chartered to
do. Full checklist in `docs/phase-3f1-6-final-foundation-certification/31-final-verdict.json`.

This certification did not assess, and makes no claim about, financial data
accuracy, covenant arithmetic, simulation correctness, dashboard/UI
correctness, or CFO-readiness — only the contract-model foundation itself.

Per this phase's own charter: no blocker above has been repaired, Phase
3F.2 has not been started, no unseen package has been selected, Phase 4 has
not begun, evaluator development has not been restarted, and no financial
connectors or UI have been built. A separate human decision will determine
remediation.

## Artifact index

`docs/phase-3f1-6-final-foundation-certification/`: 00 (baseline), 01
(historical defect ledger, final dispositions), 02 (production freeze
proof), 03–05 (Auditor 1: structural integrity, rank-stack false-negative,
supersession), 06–09 (Auditor 2: package relationships, operative state,
definition isolation, source trace), 10–11, 22–23 (Auditor 3: ingestion
identity, tenant isolation, database integrity, migrations), 12–15 (Auditor
4: discovery coverage, claim identity, semantic compiler, independent
verifier), 16–21 (Auditor 5: safe-failure model/wiring, no-silent-failure,
review-event signal/false-negative, false-credit controls), 24–28 (Auditor
6: invariant audit, cross-module propagation, known-package regression,
adversarial matrix, static danger patterns), 29 (quality gates), 30
(consolidated certification findings), 31 (final verdict).
