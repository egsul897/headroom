# docs/phase-3-final-closure-resolution

AMB-1 specification resolution, blinded independent re-adjudication packets, residual
semantic-accountability forensics, and sealed recertification.

Starting SHA: `1189a1be883933c4670ca856ed67ed11db04c2d5` (verified independently, §1).

## Verdict

**PHASE3_HUMAN_READJUDICATION_REQUIRED** — the intermediate outcome §34 names as acceptable
and expected. Phase 3 is **not** closed. Phase 4E is **not** started and **not** evaluated.

27 of the 32 §33 closure requirements pass. One fails: genuine independent re-adjudication does
not exist yet. Four more depend on it and are therefore not measurable. Nothing was faked to
close that gap.

## AMB-1, resolved by specification

A claim-specific unsafe/review flag attached to one sub-part of a composite claim surfaces
**that sub-part**, not its siblings. Neither historical reviewer position was adopted: the
"any claim-specific flag" rule is rejected, and so is "dominant material content", which would
have replaced one ambiguity with another subjective test (§3).

Coverage is decided from two signals the frozen matcher already computes — the structural scope
relation between the claim's address and the flag's address, and the pair's correspondence —
with structure decisive where it exists.

A first formulation of that rule, which read partial semantic correspondence as sub-proposition
anchoring, was **measured and rejected before adoption**: it would have moved 407 of 1,115 units
and raised dangerous-silent-omission counts from 322 to 673 on an inference rather than on
evidence. The adopted rule moves 46 units, every one of them a claim anchored at a chapeau whose
every warning sits on a strict enumerated descendant.

## The residual semantic-accountability set

All 18 red identities are resolved. One was a real production defect — the I27 "Notwithstanding"
false gap — fixed generically by modelling override-operator ownership. The other 16 were stale
expectations, each proven stale fragment by fragment before being touched. The corrected tests
are **stricter** than the originals: every scenario now declares its residual set verbatim, so a
new residual and a silently-closed residual both fail the suite.

## What human reviewers must complete

| File | What to do |
|------|------------|
| `review-packets/R1.json` | adjudicate all 47 cases under the V3.1 rubric |
| `review-packets/R2.json` | same, independently |
| `review-packets/R3.json` | same, independently |

Write answers to `review-packets/R{1,2,3}-responses.json` in the shape given by
`06-reviewer-response-schema.json`, then run:

```
npx tsx scripts/import-v31-review-responses.ts
```

It validates before it computes, and computes nothing until every reviewer file is valid.
Do not open `review-packets/_case-id-map-DO-NOT-OPEN-BEFORE-REVIEW.json` first.

## Artifacts

| # | File | Covers |
|---|------|--------|
| 01 | starting-state | §1 verified HEAD, trees, contract and corpus hashes |
| 02 | v31-atomic-surfacing-contract | §2–§5 the AMB-1 resolution, versioned and frozen |
| 03 | v31-contract-diff | §5 what changed vs V3 and what deliberately did not |
| 04 | evaluator-delta-analysis | §6 evaluator audited against V3.1 before any code change |
| 05 | blinded-reviewer-packet-manifest | §8 packet build, seeds, blinding assertions |
| 06 | reviewer-response-schema | §11 machine-readable response contract |
| 07 | consensus-contract | §13 frozen before any result was seen |
| 08 | historical-adjudication-preservation | §7 zero historical decisions modified |
| 09 | semantic-accountability-residuals | §18 all 18 identities, 8 fragments, individually adjudicated |
| 10 | i27-forensics | §19 reproduced, root-caused, fixed |
| 11 | safety-improvement-residuals | §20 verified independently |
| 12 | plausible-review-residuals | §21 classified, not blessed |
| 13 | stability-forensics | §22 four I1-derived failures |
| 14 | production-remediation | §24 the ten-point boundary |
| 15 | false-credit-regression | §17 14/14 NO_CREDIT after the evaluator change |
| 16 | cross-dataset-regression | §17 1,115 units under V3.1 |
| 17 | downstream-regression | §27 4A/4B/4C/4D plus the eight red-team harnesses |
| 18 | end-to-end-trace | §28 31,000,000 → 1,000 → 30,999,000 |
| 19 | independent-review-import | §12 importer output — currently "no responses present" |
| 20 | final-agreement-metrics | §14 deliberately not computed |
| 21 | sealed-manifest | §32 sealed for everything this mission can seal |
| 22 | phase3-final-gate | §33 all 32 requirements scored |
| 23 | phase4e-readiness | §36 not evaluated, and why |

## Evidence preservation (§1, §7)

`docs/phase-3-final-closure/`, `docs/evaluation-contract-v3/`, `docs/evaluation-v2*/`,
`docs/phase-4d/` and `docs/source-coverage-repair/` are untouched. The frozen V3 cross-dataset
artifact is byte-identical before and after (sha256 `9d562dee…`), and the frozen end-to-end trace
was never written to — its script was copied and redirected.
