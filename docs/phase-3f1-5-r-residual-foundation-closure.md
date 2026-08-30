# Phase 3F.1.5.R — Bounded Residual Foundation Closure + Explicit Claim-Level Safe-Failure Architecture

**Verdict: `PHASE_3F_1_5_R_RESIDUAL_FOUNDATION_CLOSURE_PASSED`**

This phase followed the human architecture decision made after Evaluation
Contract V3's failure (`EVALUATION_CONTRACT_V3_SAFETY_GATE_FAILED_REQUIRES_HUMAN_DECISION`):
evaluation methodology research is now paused as a standalone development
stream, and Headroom's production architecture must instead explicitly
record, as first-class persisted state, every material contractual claim it
encounters but cannot safely convert into trusted semantic representation.
This document reports both halves of the phase's bounded mandate: (A)
closing four already-known residual foundation defects, and (B) building
that explicit safe-failure architecture.

## Starting state

- SHA `a77f76c1a32475e129c97460aa643b23585659e4`, branch
  `claude/headroom-scaffold-covenant-engine-jrijk8`, clean working tree.
- Evaluation Contract V3's exact numbers are preserved immutable and were
  not reinterpreted: creditEligibility inter-reviewer 95.7% /
  evaluator-vs-consensus 89.4%; surfacingStatus inter-reviewer 74.1% /
  evaluator-vs-consensus 66.7%; all 14 historical false-credit controls
  NO_CREDIT.
- Real Postgres was available this session (unlike the immediately
  preceding phase), so every gate below is a genuine DB-backed result.

## Part A — Residual defect closure

Four parallel, isolated-worktree workstreams closed the defects named in
Phase 3F.1.4's own honest disclosure of what it left open:

| Defect | Description | Disposition |
|---|---|---|
| **P1-10** | An in-text citation shaped like a heading corrupted `stage-structure.ts`'s rank-stack, misattaching real clauses to a spurious node. | **Genuinely remediated** — a plausibility gate rejects citation-shaped headings before they ever become nodes. Real regression: CONMED's `SECTION_NUMBER_SEQUENCE_ANOMALY` count dropped 4→1, DSGR's dropped 27→6, with real duplicate-label counts also corrected (CONMED 377→366, DSGR 546→517). FWRG/LSB byte-identical. |
| **P1-11** | No supersession marker on structural nodes; two named consumers (`pass-a-signals.ts`, `source-inventory.ts`) could treat superseded text as current. | **Genuinely remediated** for the two named consumers via a new fail-closed `NodeSupersessionIndex` primitive. A broader audit found the same pattern in 3 more locations (one protected by a deliberate independence-contract invariant) — disclosed, not fixed this phase. |
| **P1-3** | The wired onboarding upload action bypassed content-hash dedup entirely. | **Genuinely remediated** — routed through the existing, tested `uploadDocumentThroughIngestion` wrapper. Fixing this surfaced and fixed a real concurrent-upload race in the wrapper itself. |
| **Definition fallbacks + source-trace + operative×structural-health** (Workstream D, 3 sub-tasks) | Cross-document definition leakage risk in 3 named call sites; a suspected `definedTermRefs`/`stableKey` format mismatch; operative-state resolution never composed structural health. | **All three genuinely remediated.** 2 of 3 definition-fallback sites fixed, 1 proven already safe. The `stableKey` mismatch was a real, confirmed defect, now fixed. Operative confidence now requires structural health to be sufficient, not just a unique target match. |

All four workstreams' isolated-worktree commits were individually reviewed
and cherry-picked onto the real working branch (a stale worktree
merge-base was discovered and deliberately avoided rather than merged
directly, which would have reverted unrelated prior work). One real merge
conflict (two workstreams both extending `amendment/operative-state.ts`)
was resolved manually with both additions coexisting cleanly.

## Part B — Explicit claim-level safe-failure architecture

**Design decision, not an invention from scratch.** Auditing this
codebase's existing review-workflow models found that Phase 3E's own
`semantic-coverage` module already computes almost everything this
architecture needs — a coverage-state taxonomy, a dangerous-unaccounted-
reason taxonomy, and a stable, sibling-safe, content-derived claim
identity (`MaterialSemanticUnit.semanticUnitId`) — but only as an
in-memory report object, never persisted, never lifecycle-bearing, called
only from offline scripts and tests. This phase's entire architectural
contribution is promoting that already-correct computation into durable,
queryable, resolvable production state, reusing the exact
`ExtractionCandidate`/`CandidateReviewEvent` audit-trail pattern already
proven in this codebase's onboarding pipeline, generalized to the live
contract-model compiler's own domain.

- **New Prisma models** (migration `20260829232147`, additive only):
  `ClaimReviewItem` (one row per deduplicated claim), `ClaimReviewObservation`
  (append-only per-stage detection log), `ClaimReviewDecision` (append-only
  resolution-lifecycle audit trail).
- **New domain layer** (`lib/contract-model/compiler/safe-failure/`):
  claim identity reuses `semanticUnitId` directly; `derive.ts` is a pure
  translation of semantic-coverage's own already-computed safety signal
  into a persisted review item, introducing zero new semantic judgment;
  `service.ts` implements dedup, resolution lifecycle, and the thin
  evaluator-compatibility function
  (`explicitSafeFailure = noCredit && claimSpecificReviewEventExists`);
  `integrate.ts` is the single wired emission point.
- **New permanent invariant** (#37, `NO_SILENT_MATERIAL_FAILURE`) added to
  `docs/HEADROOM-ARCHITECTURE-INVARIANTS.md`.
- **Validated** with 15 adversarial tests covering all 16 required
  scenarios, and a real, zero-cost volume analysis against FWRG and LSB
  coverage-audit evidence: **477 distinct claim-level review items from
  827 real semantic units** (477 at CRITICAL/MATERIAL tier).
- **False-credit-control check**: all 14 permanent controls remain
  NO_CREDIT with zero regression; a reasoned extrapolation from the
  evaluator's own real DSGR disposition data concludes all 14 would have
  generated an explicit review event under this architecture (they were
  all discovered/encountered, none never-discovered) — disclosed as an
  extrapolation, not a literal end-to-end execution, since no DSGR
  fixture exists yet for `semantic-coverage`'s own test harness.

## Gates run

- `npx vitest run` — **189 test files, 1938 tests, 0 failures** (real
  Postgres available this session).
- `npx tsc --noEmit -p .` — 0 new errors; only the pre-existing baseline
  errors remain (confirmed unchanged via `git show` on the baseline commit).
- `npx eslint .` — 1 pre-existing error (confirmed present at baseline),
  0 new.
- `npm run build` — succeeds, 21 routes, unchanged bundle profile.

## Diff classification

45 files changed since baseline, all falling into allowed categories
(residual-defect fixes/tests, safe-failure architecture/tests,
documentation, artifacts, schema migration). Zero forbidden changes
(no IR/AI-compiler redesign, no financial connectors, no dashboard/
simulation, no new evaluator methodology, no new benchmark package,
no package-specific tuning). Full detail in
`docs/phase-3f1-5-r-residual-foundation/21-diff-classification.json`.

## Remaining risks (disclosed, not hidden)

- P1-11's fix is genuine for its two named consumers; 3 more locations
  with the same raw-scan pattern were found and disclosed, not fixed
  (one is protected by a deliberate independence-contract invariant that
  would need its own `ARCHITECTURE_CHANGE_PROPOSAL` to relax).
- The safe-failure architecture has one wired emission point
  (the coverage auditor); it is not yet wired into any live `app/` route,
  matching the current, disclosed state of the whole semantic-coverage
  pipeline.
- The two narrower claim-identity risks carried forward from Phase
  3F.1.5.3 (different-base-section false matches; bare-section
  overmatch) were determined to be evaluator-only, not production-relevant,
  and were correctly left untouched.

Full detail in `docs/phase-3f1-5-r-residual-foundation/22-remaining-foundation-risks.json`.

## Verdict

```
PHASE_3F_1_5_R_RESIDUAL_FOUNDATION_CLOSURE_PASSED
```

All 15 production-capability gate criteria pass (Section 38 of this
phase's charter; full checklist in
`docs/phase-3f1-5-r-residual-foundation/23-final-verdict.json`). Per this
phase's own stop rule, this session does not proceed to Phase 3F.1.6 Final
Foundation Certification, does not select a new unseen package, does not
begin Phase 4, and does not create an Evaluation Contract V4 — the result
is reported and the session stops here.

## Artifact index

`docs/phase-3f1-5-r-residual-foundation/`: 00 (baseline), 02 (failure-
boundary map), 03–06 (safe-failure architecture/identity/emission-policy/
dedup-resolution design), 07–08 (P1-10 root-cause/remediation), 09
(P1-11 remediation), 10 (P1-3 remediation), 11 (definition isolation), 12
(claim-identity residual-risk audit), 13 (source-trace audit), 14
(operative×structural-health audit), 15 (safe-failure adversarial
results), 16 (structural adversarial results), 17 (real-data regression),
18 (review-event volume analysis), 19 (false-credit-control regression),
20 (test quality gates), 21 (diff classification), 22 (remaining risks),
23 (final verdict).
