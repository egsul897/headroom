# Phase 3F.1.6.R — Certification Blocker Remediation + Live Contract-Analysis Integration

**Verdict: `PHASE_3F_1_6_R_CERTIFICATION_BLOCKER_REMEDIATION_PASSED`**

Phase 3F.1.6 Final Foundation Certification is complete and immutable
(`PHASE_3F_1_6_FINAL_FOUNDATION_CERTIFICATION_FAILED`, 11 independently
confirmed BLOCKER findings, production frozen throughout). This phase
existed solely to remediate those 11 certified blockers. Unlike the
certification, production changes were explicitly permitted here — but
this phase never certifies its own fixes; every disposition below reads
`REMEDIATED_PENDING_INDEPENDENT_RECERTIFICATION` (or, for one
architecture-scope decision, `ARCHITECTURE_SCOPE_RESOLVED_PENDING_
INDEPENDENT_RECERTIFICATION`) — never `CERTIFIED`.

## Starting state

- SHA `bbb82fc`, branch `claude/headroom-scaffold-covenant-engine-jrijk8`,
  clean tree, inheriting the certification's exact starting SHA
  `ea82ee8` plus its own final synthesis commit `77f6e11`.
- Postgres was down at session start; started via `pg_ctlcluster 16 main
  start`, consistent with precedent.
- tsc (6 pre-existing errors), eslint (1 pre-existing error), and build
  all matched the certified baseline exactly before any change was made.

## Methodology

Seven parallel isolated-worktree workstreams, each assigned one or a
tightly related bundle of the 11 frozen blockers, each required to
reproduce its defect first, root-cause it rather than patch the observed
example, and reuse this codebase's existing taxonomies rather than invent
new parallel ones:

| Workstream | Blockers | Focus |
|---|---|---|
| A | 2–6 | Supersession/operative-state uncertainty propagation |
| B | 8 | Semantic claim identity collision |
| C | 1 | Structural heading / rank-stack root fix |
| D | 9 | Independent verifier condition-omission |
| E | 7 | Source-trace backfill |
| F | 10 | Live contract-analysis integration (critical path, dispatched last so it could compose A–E's fixes) |
| G | 11 | Architecture-scope decision for Invariant #35 |

Each workstream's commit was individually reviewed and cherry-picked
onto the working branch (the same recurring worktree-staleness issue
from every prior phase recurred and was self-corrected by each agent
before real work began). One auto-merge (no manual conflict resolution
needed) occurred where Workstreams A and B both touched
`discovery/pass-d-reconcile.ts` and `semantic-coverage/types.ts`.

## What was fixed

**BLOCKER-1 (structural heading corruption).** Replaced the brittle
14-phrase citation-signal regex with a positive-evidence heuristic
(paragraph break / sentence-terminal punctuation / ARTICLE-adjacency).
All 7 certified `MATERIAL_STRUCTURAL_ERROR` anomalies eliminated; a
23-case false-negative guard confirms no legitimate-heading recall loss.

**BLOCKER-2 through 6 (uncertainty propagation).** Supersession status
now lives on `DiscoveredCandidate` itself — the type every real
downstream consumer receives — not just the upstream
`DeterministicCandidate`. Source-inventory's independence contract is
now genuinely reconciled with current-state safety rather than
mislabeled as protected. Null operative state now fails closed. Four of
five bypassing LLM evidence tools are fixed; the fifth is explicitly
labeled raw-by-design; a new mandatory `operativeStateDiscipline` field,
enforced by TypeScript, prevents a future tool from reintroducing the
bypass. Ambiguous DEFINITION-kind amendment targets can no longer reach
a false `FULLY_REPRESENTED_VERIFIED`.

**BLOCKER-7 (source-trace backfill).** A real, idempotent production
backfill corrected 95/95 affected `ContractRule` rows (191 entries)
against this environment's real Postgres, reusing the exact prospective
`stableKey` logic rather than a parallel reimplementation. A
separately-disclosed, out-of-scope defect (`DefinedTermNode.stableKey`
staleness) was found during verification and honestly reported, not
silently folded in or hidden.

**BLOCKER-8 (claim identity collision).** Fixed at both the discovery
layer (a families-derived content fingerprint added to identity
derivation) and the semantic-coverage layer (a generalized coordinate-
clause splitter for un-enumerated "clauseA and/or clauseB" sentences
spanning different covenant families). A residual, explicitly-disclosed
gap remains for same-family fused claims.

**BLOCKER-9 (verifier condition omission).** Root-caused to a
2-independent-marker threshold in `reconciliation.ts` that a real,
common single-condition drafting pattern never crossed, silently
starving the independent AI verifier of the chance to look. Fixing it
exposed a second, dormant false-positive in `ir-inventory.ts`, fixed
alongside it. The certification's own reproduction now catches 7/7 (was
6/7); a 9-form adversarial condition matrix passes; verifier
independence is preserved (no compiler reasoning used in the fix).

**BLOCKER-10 (live contract-analysis integration — the critical path).**
A new `lib/contract-model/analysis/` orchestrator composes the already-
fixed discovery, coverage, semantic-compilation, verification, and
safe-failure modules into one real flow, wired into the actual live
upload server action. A minimal `AnalysisRun` model (new migration)
tracks execution state with proven idempotency. Proven end-to-end via a
real call to the literal server action: an undiscovered covenant
produces a real `ClaimReviewItem`; a verified claim produces none. One
genuine integration bug (a deprecated field reference causing silent
empty text) was found and fixed while wiring real callee signatures.
Truth ownership is now explicit: contract-model owns structural/
operative/review-state truth; `lib/extraction/**` remains its own
separate, correct workflow — no competing "current truth" was
introduced. Disclosed gap: compiled semantic IR still has no durable
persistence anywhere in the codebase, by the compiler's own pre-existing
design, out of this blocker's scope.

**BLOCKER-11 (Architecture Invariant #35).** Investigated honestly
rather than patched: every `DebtEvent` creation site in the entire
codebase is an offline, engineer-run data-population script — zero live
`app/` route creates one today, and the one live-created financial model
(`LedgerEntry`) serves an unrelated purpose. `docs/HEADROOM-ROADMAP.md`
explicitly names this exact fork as Phase 6 (Living Headroom State)
work. Writing any value into `sourceLedgerEntryId` now would be
fabricated provenance, itself forbidden by other invariants. Resolved as
an architecture-scope decision (`FUTURE_ENFORCED`, Phase 6), not a code
change — the invariant's general principle is unweakened.

## An immutability near-miss, caught and corrected

Running the certification's own pre-existing regression script during
this phase's known-package check surfaced an undisclosed side effect:
the script hardcodes a write to a file under the frozen certification
directory. This produced an uncommitted modification, caught by this
session's own git-status discipline before any commit, immediately
reverted via `git checkout`, and confirmed byte-for-byte restored. The
frozen certification directory shows zero diff in the final committed
state — the regression data itself was independently captured in this
phase's own artifact before the revert, so no information was lost.

## Known-package regression and false-credit controls

FWRG and LSB show two real, correctly-explained changes: more, correctly
disambiguated material units (BLOCKER-8's fix working as designed) and
every coverage state collapsing to `OPERATIVE_STATE_UNRESOLVED`
(BLOCKER-4's fail-closed fix correctly overriding differentiated states
given this script's own known limitation of passing null operative
state). `materialUnitsWithoutClaimReviewItem` remains 0 for both.
CONMED's numbers are unchanged; its semantic-coverage gap remains
honestly disclosed as unavailable. DSGR shows a non-zero count, root-
caused to a pre-existing, already-disclosed fixture-versioning artifact
(confirmed via zero diff in the entire safe-failure module and the exact
fixture file since the certification's own close) — not a regression
from any of the 7 workstreams. All 14 permanent false-credit controls
remain unanimously `NO_CREDIT` (32/32 tests).

## Gates run

- `npx tsc --noEmit -p .` — 6 pre-existing errors, unchanged, 0 new.
- `npx eslint .` — 1 pre-existing error, unchanged, 0 new.
- `npx vitest run` — **210 test files, 2,148 tests, ALL PASSING** — a
  fully green run, stronger than the certification's own baseline
  (which had 2 disclosed pre-existing flaky/out-of-scope items).
- `npm run build` — succeeds, 21 routes, unchanged.
- `npx prisma migrate diff` against the live database — empty; zero
  schema drift.

## Diff classification

80 files changed since the phase's starting commit. Every production
file maps to exactly one (or, in 3 legitimately overlapping cases, two)
of the 11 certified blockers. Zero unrelated changes; zero forbidden-
category changes (no UI, financial connectors, simulation, dashboard,
Phase 4 arithmetic, new unseen package, evaluator redesign, or package-
specific tuning — independently confirmed via `git diff` against
`lib/contract-model/evaluation-v2/**`, which shows zero changes).

## Remaining risks (disclosed, not hidden)

Full detail in `docs/phase-3f1-6-r-blocker-remediation/27-remaining-risks.json`.
Highlights: the positive-evidence heading heuristic has not been tested
against every conceivable unseen formatting convention; same-family
fused claims remain an unfixed identity-collision class; compiled
semantic IR still lacks durable persistence; and — most importantly —
**none of these 11 fixes has been independently verified by anyone
other than the workstream that wrote it.**

## Verdict

```
PHASE_3F_1_6_R_CERTIFICATION_BLOCKER_REMEDIATION_PASSED
```

All 17 pass criteria are met. All 11 certified blockers are remediated
or architecture-scope-resolved. Full detail in
`docs/phase-3f1-6-r-blocker-remediation/28-final-verdict.json`.

## Next phase

Per this phase's own charter: **STOP here.** Do not run targeted
recertification, do not modify certification artifacts, do not select a
second unseen package, do not begin Phase 4, do not build financial
connectors, simulation, or dashboard, do not restart evaluator work. The
next phase is **Phase 3F.1.6.RC — Targeted Foundation Recertification**:
production-frozen, independently attacking only the previously-failed/
coupled trust boundaries, verifying the 11 dispositions above, and
re-checking only what this remediation materially touched — not
replaying every already-certified passing boundary. Only if 3F.1.6.RC
passes may the project proceed to Phase 3F.2.

## Artifact index

`docs/phase-3f1-6-r-blocker-remediation/`: 00 (baseline), 01 (frozen
blocker backlog, final dispositions), 03–04 (BLOCKER-1), 05–09
(BLOCKER-2 through 6), 10 (BLOCKER-7), 11–12 (BLOCKER-8), 13
(BLOCKER-9), 14–19 (BLOCKER-10), 20 (BLOCKER-11), 21 (major-finding
dispositions), 22–23 (known-package regression, false-credit controls),
24–26 (Postgres/migration results, quality gates, diff classification),
27 (remaining risks), 28 (final verdict).
