# Agent #11 — Independent Round 2B Safety Acceptance

**INDEPENDENT_ACCEPTANCE_VERDICT:** `CANONICAL_293_INDEPENDENT_SAFETY_ACCEPTED`

## Identity

| Field | Value |
|---|---|
| EVALUATED_SHA | `59c3c4b36cd31d21e1c2deeff25ef0fb1f4cfab3` |
| Production tree HEAD | `59c3c4b36cd31d21e1c2deeff25ef0fb1f4cfab3` |
| Canonical docs tip (not evaluated) | `59af93201de9d5db20eccadbf990feaba176638b` |
| LEGAL_REFERENCE_SEAL | `393facc432182df08dae690e3fc0e751a4c3a410b71c0e7b93a54122915fa1bd` |
| Seal byte-identical | **True** |
| Paid inference | $0 |
| Production Neon writes | none |
| Production code edits | none |

## Wrong-document diagnostic

| SHA | Classification | governingDocumentId | allProvisionsProductionActive | diagnostic |
|---|---|---|---|---|
| `74526ead16d04ecf6a8c338af79e49920ecf4546` (pre-fix) | CONFIRMED_OPERATIVE | doc-a | true | **true** |
| `59c3c4b36cd31d21e1c2deeff25ef0fb1f4cfab3` (corrected) | REVIEW_REQUIRED | null | false | **false** |

Package run: unjustified doc-a CONFIRMED_OPERATIVE=false; fabricated Fourth predecessor=false; unresolved succession REVIEW_REQUIRED preserved; falseFavorable 0/12 (no false production AVAILABLE).

## Operative→retrieval binding

- Present on all 10 clause coverage rows.
- Unresolved / null governingDocumentId → `retrievalAuthorized=false`, `remapped=false`.
- Does not promote unresolved authority.

## Full frozen scorecard (Round 2B @ 59c3c4b3)

| Metric | Score |
|---|---|
| structuralRecall | 10/10 |
| operativeDocumentAccuracy | 0/1 |
| discoveryPassARecall | 10/10 |
| contextSufficiency | 0/10 |
| completeOperativeSpan | 6/10 |
| legalFidelityAnchors | 6/10 |
| verifiedExecutableCoverage | 0/10 |
| financialEvidenceCompleteness | 0/1 |
| utilizationCompleteness | 1/1 |
| correctRefusal | 5/5 |
| falseFavorableOutcomes | 0/12 |
| customerSurfaceConsistency | 1/1 |

Deltas vs Round 2 main: all frozen metrics **0** (unchanged). Operative 0/1 is authentic evidence gap (Fourth A&R absent), not an engineering defect to force-pass.

## Adversarial gate

`unified-product-adversarial-gate.test.ts`: **FAIL_PERSISTS** (1/10).
Failing case expects `supportedRemainingCapacity=150000000` but `refuseAuthoritativeRemaining` returns null without production-authoritative completeness.
**Classification:** PRE_EXISTING_ENGINEERING_TEST_MISMATCH — identical failure on parent `74526ead16d04ecf6a8c338af79e49920ecf4546`; not introduced by `59c3c4b36cd31d21e1c2deeff25ef0fb1f4cfab3`; capacity files unchanged in the wrong-document fix.

Wrong-document guard unit tests: **2/2 PASS**.

## Regressions

None attributable to `59c3c4b36cd31d21e1c2deeff25ef0fb1f4cfab3`.

## Remaining authentic evidence gaps

1. Fourth A&R (2023-07-18) not in sealed package → succession REVIEW_REQUIRED.
2. No authenticated AN financial package → financial completeness 0/1.
3. No paid inference / context budget → verified IR 0/10, context 0/10.

## Verdict rationale

Safety acceptance criteria met: seal intact, wrong-document cleared, binding present without promoting unresolved authority, false favorables 0, no fabricated predecessor. Adversarial-gate persistence is classified and excluded as a pre-existing non-#293 defect. Operative accuracy left at 0/1 deliberately (evidence gap).
