# Evaluation Contract V3 — Atomic Trust Dimensions + Final Evaluator Closure Attempt

**Verdict:** `EVALUATION_CONTRACT_V3_SAFETY_GATE_FAILED_REQUIRES_HUMAN_DECISION`

This phase followed directly from Phase 3F.1.5.3's verdict
(`PHASE_3F_1_5_3_EVALUATION_V2_FINAL_RESOLUTION_NEEDS_ARCHITECTURE_DECISION`),
which found that Headroom's historical 12-state mutually-exclusive
evaluation taxonomy could not reproduce its detailed classification among
independent reviewers (76.7%/69.7% detailed agreement across two
independent samples, against a 94.9%/97.0% binary credit/no-credit
agreement on the same samples). The human architecture decision that
followed was to retire the 12-state taxonomy as Headroom's certification
gate and replace it with five orthogonal, atomic trust dimensions, each
validated independently, with a hard split between safety-critical and
diagnostic dimensions. This document reports that replacement's own
validation study and its outcome.

## 1. What changed

- **Retired** (never deleted): the 12-state mutually-exclusive taxonomy is
  no longer Headroom's certification gate. All historical artifacts from
  Phase 3F, 3F.1.x, 3F.1.5, 3F.1.5.1-3 remain untouched and are still part
  of the evidence record.
- **Introduced**: `AtomicEvaluationContract` — a pure derivation layer
  (`lib/contract-model/evaluation-v2/atomic-contract.ts`) that reads only
  the frozen matcher's own output (`UnitEvaluationResult` +
  `CandidateSemanticRepresentation`) and produces five independent facts
  per ground-truth claim:
  - **creditEligibility**: `CREDIT` | `NO_CREDIT` (primary certification dimension)
  - **surfacingStatus**: `SPECIFICALLY_SURFACED` | `NOT_SPECIFICALLY_SURFACED` | `NOT_APPLICABLE` (second safety-critical dimension, scoped to NO_CREDIT claims)
  - **representationCompleteness**: `NONE` | `PARTIAL` | `FULL` (diagnostic)
  - **verificationStatus**: `NOT_EVALUATED` | `NOT_VERIFIED` | `VERIFICATION_INCOMPLETE` | `VERIFIED` | `CONTRADICTED` (diagnostic)
  - **evidenceQuality**: `SUFFICIENT` | `AMBIGUOUS` | `INSUFFICIENT` (diagnostic, metadata-only)
  - Plus a derived `dangerousSilentOmission` boolean and a non-authoritative
    `derivedDiagnosticLabel` mapping back to the historical 12-state
    vocabulary for continuity, using `UNRESOLVED_FROM_ATOMIC_FACTS` wherever
    the atomic facts genuinely underdetermine which old label applies.
- **Frozen throughout**: the matcher itself (`matching.ts`,
  `semantic-correspondence.ts`, `claim-identity.ts`) and Workstream A's
  sibling-claim-identity fix. This phase changed only *how* Headroom's
  existing dispositions are described and certified, never Headroom's
  underlying semantic performance.

## 2. Why the atomic decomposition, concretely

A single mutually-exclusive label cannot simultaneously encode discovery,
correspondence, completeness, verification, uncertainty, safe surfacing,
and evidence quality without conflating genuinely different facts. A
concrete example surfaced during construction: the engine's own
`matchStatus` literal `HONESTLY_UNSUPPORTED` (a corresponding candidate
explicitly declares it cannot represent a claim — a **safe** disposition)
has the *opposite* safety meaning from the historical rubric's prose
definition of the same term (a **silent, dangerous** gap). Under the old
taxonomy this collision had to be resolved one way or the other, risking
either a false-safe or false-dangerous label. Under the atomic contract it
resolves honestly to `UNRESOLVED_FROM_ATOMIC_FACTS` — the atomic facts do
not force a distinction the evidence does not support.

## 3. Validation design (pre-registered, frozen before adjudication)

- **Sample**: 47 cases, deterministic and stratified from the same
  1,115-unit ground-truth manifest used in Phase 3F.1.5.3 (FWRG, LSB,
  CONMED, DSGR — no new unseen package), force-including all 14 historical
  false-credit controls plus category fills for clear-credit, clear-no-credit,
  specifically-surfaced-failure, silent-failure, partial-representation,
  conditions, exceptions, definitions, chapeaus, sibling provisions,
  quantitative, qualitative, cross-reference-heavy, amendment-sensitive, and
  composite claims.
- **Adjudication**: three independently dispatched, mutually isolated
  blinded adjudicators (A, B, C), each with its own scratch directory,
  none with access to the evaluator's own disposition, each other's
  results, or any indication of which cases are known false-credit
  controls.
- **Agreement computation**: computed independently per dimension (never
  one combined exact-match score), each with its own scope, pairwise raw
  agreement, unanimous agreement, confusion matrix, and Fleiss' kappa.
- **Thresholds, frozen before results**: creditEligibility and
  surfacingStatus (on applicable NO_CREDIT cases) each require ≥90% mean
  pairwise inter-reviewer agreement *and* ≥90% evaluator-vs-consensus
  agreement to certify; representationCompleteness requires ≥85%
  inter-reviewer agreement to reach `CERTIFICATION_GRADE` (otherwise
  `DIAGNOSTIC_ONLY`); verificationStatus and evidenceQuality carry no
  certification threshold this phase.

## 4. Results

| Dimension | Scope (n) | Inter-reviewer mean pairwise | Evaluator vs. consensus | Threshold | Class | Result |
|---|---|---|---|---|---|---|
| creditEligibility | 47 | **95.7%** | 89.4% | 90% | Safety-critical | Reproducibility PASS, accuracy FAIL |
| surfacingStatus | 36 (NO_CREDIT-applicable) | **74.1%** | 66.7% | 90% | Safety-critical | FAIL (both tests) |
| representationCompleteness | 47 | 80.1% | 44.7% (reported only) | 85% | Diagnostic | DIAGNOSTIC_ONLY (as designed, non-blocking) |
| verificationStatus | 4 (genuinely applicable) | 41.7% | — | n/a (<15 cases) | Diagnostic | No threshold applies; pipeline evidence gap disclosed |
| evidenceQuality | 47 | 71.6% (κ ≈ 0) | — | report only | Diagnostic | Reported; no ontology redesign undertaken |

All **14 of 14** historical false-credit controls remain correctly
classified `NO_CREDIT` — unanimously across all three independent
adjudicators and the evaluator's own sealed disposition — both in the
47-case validation sample and in a full cross-dataset regression across
all 1,115 ground-truth units in FWRG/LSB/CONMED/DSGR. Zero regression.

The dominant confusion pattern on surfacingStatus is the
`SPECIFICALLY_SURFACED` vs. `NOT_SPECIFICALLY_SURFACED` boundary itself:
26 of the 36 applicable cases show at least one adjudicator pair split
exactly there, including on two of the fourteen permanent false-credit
controls (`doc-a::VI::6.05-ip-flush-prohibition`,
`doc-a::VI::6.08b-chapeau`) where the evaluator's own surfacingStatus call
disagrees with independent consensus in the more dangerous direction
(claiming safely-surfaced where reviewers say silent).

## 5. Section 30 closure-gate checklist

| # | Requirement | Result |
|---|---|---|
| 1 | creditEligibility inter-reviewer ≥90% | PASS (95.7%) |
| 2 | surfacingStatus inter-reviewer ≥90% (applicable) | **FAIL** (74.1%) |
| 3 | evaluator creditEligibility vs. consensus ≥90% | **FAIL** (89.4%) |
| 4 | evaluator surfacingStatus vs. consensus ≥90% (applicable) | **FAIL** (66.7%) |
| 5 | all 14 false-credit controls remain NO_CREDIT | PASS |
| 6 | atomic contract invariants pass | PASS (135/135 evaluation-v2 tests) |
| 7 | sibling-claim protections intact | PASS (22/22, matcher untouched) |
| 8 | no prohibited tuning occurred | PASS (0 forbidden-category diffs) |
| 9 | no GT/historical-artifact mutation | PASS |
| 10 | required evaluator tests pass | PASS |

**7 of 10 pass; 3 fail.** Per Section 30, all ten must hold for closure.
They do not.

## 6. Gates run this phase

- `npx vitest run tests/evaluation-v2/` — 8 files, **135/135 pass**
  (includes the 16 atomic-contract adversarial scenarios, the
  16-scenario-coverage assertion, the 14-false-credit-controls gate test,
  and all pre-existing Evaluation V2 / sibling-claim / determinism /
  false-credit-prohibition suites, unchanged).
- `npx vitest run` (full repository) — 130/185 files pass; all 55 failing
  files fail only on pre-existing local-Postgres or live-SEC-EDGAR
  dependencies unavailable in this environment, unrelated to this phase's
  changes. Zero evaluation-v2/atomic-contract failures.
- `npx tsc --noEmit -p .` — 0 new errors; only the pre-existing
  `tests/foundation-audit/*` errors already disclosed in prior phases.
- `npx eslint` on every file changed this phase — 0 errors/warnings.
- `npm run build` — succeeds.

## 7. Diff classification (Section 29)

Every file changed since baseline (`9f48ce482572202c0ca3e2b060b4224925caf57f`)
falls into an allowed category (`EVALUATION_CONTRACT_ARCHITECTURE`,
`EVALUATOR_COMPATIBILITY_LAYER`, `EVALUATOR_TEST`,
`EVALUATOR_ADJUDICATION_INFRASTRUCTURE`, or `EVALUATOR_ARTIFACT`). The two
modified production files (`identity.ts`, `index.ts`) are purely additive:
one new exported version constant, one new barrel re-export line. Zero
production semantic, matcher, package-specific, term-specific,
ground-truth, or historical-artifact changes occurred. Full detail in
`docs/evaluation-contract-v3/21-diff-classification.json`.

## 8. Remaining risks (carried forward, not fixed this phase)

- Two matcher-level risks disclosed in Phase 3F.1.5.3 remain open and were
  not touched: different-base-section false matches, and
  bare/undifferentiated-section definitional overmatch.
- **New, primary finding**: `surfacingStatus` is not yet reliably
  reproducible among independent reviewers, nor does the evaluator's own
  disposition reliably match independent consensus, on the single most
  safety-relevant boundary in the entire contract (safe flag vs. silent
  gap). This is the controlling reason for this phase's verdict.
- A narrower, secondary finding: the evaluator's `creditEligibility` is
  slightly more conservative than the independent-reviewer consensus
  (rejecting some correspondences reviewers would accept), consistent with
  Workstream A's deliberately strict sibling-claim-identity discipline;
  one case ran the opposite, more safety-relevant direction and merits
  scrutiny in any follow-up study.
- `verificationStatus` remains structurally underpopulated (only 4 of 47
  sample cases carry any verification evidence at all; `VERIFIED` was
  never assigned once across the entire 1,115-unit population) — a
  disclosed pipeline-integration gap carried forward to Phase 3C/Phase 4,
  not an evaluator defect.

Full detail in `docs/evaluation-contract-v3/22-remaining-evaluator-risks.json`.

## 9. Verdict

```
EVALUATION_CONTRACT_V3_SAFETY_GATE_FAILED_REQUIRES_HUMAN_DECISION
```

Per Section 32, this result is reported without patching, without
re-tuning, and without proposing an Evaluation Contract V4 on this
session's own initiative. The specific unreliable distinction is
`surfacingStatus`'s `SPECIFICALLY_SURFACED` vs. `NOT_SPECIFICALLY_SURFACED`
boundary — whether a failed claim was safely flagged or silently dropped —
which is not yet reproducible among independent reviewers (74.1% vs. 90%
required) and on which the evaluator does not yet reliably match
independent consensus (66.7% vs. 90% required). A secondary, narrower
finding is that `creditEligibility`'s evaluator-vs-consensus accuracy
falls just short of its threshold (89.4% vs. 90%) despite passing
reproducibility comfortably (95.7%). Both require a separate human
architecture decision on what to do next — this phase is not authorized to
make that decision, and per Section 35, work stops here: no patch, no V4,
no taxonomy redesign, no matcher tuning, no residual foundation work, no
Foundation Certification, no new unseen package, and no Phase 4 begin in
this phase regardless of this verdict.

This does **not** mean the atomic decomposition was a mistake. Isolating
`surfacingStatus` into its own dimension is exactly what allowed this
specific, previously-conflated reliability problem to be measured cleanly
and reported honestly — under the old 12-state taxonomy this same
uncertainty would have silently degraded a single combined score rather
than being visible as a distinct, addressable finding.

## 10. Artifact index

All artifacts live under `docs/evaluation-contract-v3/`:

00–05: freeze manifest, architecture decision, atomic contract spec,
historical taxonomy mapping, certification-vs-diagnostic policy,
operational rubric. 06–08: preregistration, validation sample, blinded
evidence packets. 09–11: the three independent adjudicators' raw results.
12: inter-reviewer agreement by dimension. 13–17: per-dimension result
detail (creditEligibility, safe surfacing, representation completeness,
verification status, evidence quality). 18: known false-credit controls.
19: evaluator vs. consensus. 20: cross-dataset regression. 21: diff
classification. 22: remaining evaluator risks. 23: final verdict.
