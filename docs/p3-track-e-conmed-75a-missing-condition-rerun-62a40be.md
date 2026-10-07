# Track E — CONMED §7.5(a) MISSING_CONDITION rerun

Soft gate. invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

No pin. No pin folder. No new condition type. No section-specific branch. Knife River was not opened. The historical evidence file was not edited.

| Field | Value |
|---|---|
| Tip | `62a40be22b9598d9732e9ce2574d86d2228d6270` |
| #120 | `82a91cfa2bbb03a2722727125e909215ab96d2d4` (`semantic-accountability-compiler.v11`, prompt v9) |
| Candidate | `discovery-candidate:baca43714b8502cc9c596c23` |
| Rule | `ir-rule:b752bbaf461e4c3b704300d2` |
| Section | §7.5(a) |
| Result | **1. material finding closes** |
| Pin eligibility | **N** |

Machine record: `docs/p3-track-e-conmed-75a-missing-condition-rerun-62a40be.json`.

---

## Commands and paths

Stored wire and old findings (read, not rewritten):

`docs/phase-3-conmed-population-verified/run-original/evidence/discovery-candidate:baca43714b8502cc9c596c23.json`

sha256 `19e2173b3fd261f74f55f36c5e4b9210ff1d1c841dd1e15bdfd4f1f41f7c636c`

Operative text sha256 `b5234392b81353005e573fd482a18db182ad460c0a2235fc77e9d240418014a0` (89 chars). Same hash as `docs/p3-lane-d-conmed-7.5a-discrepancy-1acdff3.md`.

```bash
git rev-parse HEAD
# 62a40be22b9598d9732e9ce2574d86d2228d6270

npx tsx scripts/p3-track-e-conmed-75a-rerun.ts
# writes docs/p3-track-e-conmed-75a-missing-condition-rerun-62a40be.json

npx vitest run tests/contract-model/semantic-compiler/unlimited-carveout-qualitative-gates.test.ts --reporter=verbose
# Test Files  1 passed (1)
# Tests  10 passed (10)
```

What the replay did:

- Input is the stored `compilation.rawModelOutput` (prompt v5 wire: `ORDINARY_COURSE_OF_BUSINESS`, `gatedBy: null`, sufficiency `COMPLETE`).
- `normalizeSubmission` is the current compiler (`semantic-accountability-compiler.v11`), including `applyUnlimitedCarveOutQualitativeGates`.
- `verifyCompiledCandidate` ran with `skipSemanticReview: true`. No provider call. Layer 2 was not invoked.
- Context excerpts were copied from the stored bundle. Items in that file have no `documentId`; the replay filled `documentId` from `compilerInput.sourceDocumentId` so the bundle type-checks. Gate excerpts bound to the operative tier, not to those items.
- `toolAccess.structuralIndex` is the stub in `tests/contract-model/semantic-compiler/test-helpers.ts`. `operativeState` is null. Supersession on this replay is `UNKNOWN_SUPERSESSION_STATUS`. The stored verification recorded `CURRENT_OPERATIVE` from the sealed index. That status was not re-derived. `determineStatus` blocks on `KNOWN_SUPERSEDED` only, so this stub did not choose the verification status below.

The generalized suite uses synthetic clauses (`surplus or damaged equipment`, and the same property-character phrase with a line break). It does not load this candidate. The candidate result is the replay, not that suite.

---

## Old finding

Historical verification status: `MATERIAL_DISCREPANCY`. Compiler on the stored artifact: `semantic-accountability-compiler.v4` / prompt v5.

| | |
|---|---|
| findingId | `82ce660a63258d57f778551fb7ec2ded12514afb0e310b704a5b9ea70c14d784` |
| findingType | `MISSING_CONDITION` |
| severity | `MATERIAL` |
| resolutionStatus | `OPEN` |
| verificationMethod | `SEMANTIC_ONLY` |
| irPath | `rules[0].conditions` |
| deterministicSignals | `[]` |

Stored IR the finding describes: one condition, `conditionType` `UNSUPPORTED`, excerpt `in the ordinary course of business`, description folding “obsolete or worn out property” into that ordinary-course sentence. `UNLIMITED_CAPACITY.gatedBy` null. Sufficiency `COMPLETE`.

The finding’s counterexample: a sale of new, non-obsolete equipment in the ordinary course satisfies the only modeled condition and is outside §7.5(a).

Separate historical finding, not this discrepancy: `ca99bcbc49fce9df8ab2548f5a7dbdc7c66a7621122d35070f745d2f86030c5c`, `MISSING_DEPENDENCY`, `UNCERTAIN`, `OPEN`, `SEMANTIC_ONLY`, irPath `rules[0].dependsOn; definitions`. Lane D left it open. This rerun does not adjudicate it.

---

## New finding

Replay verification status: `VERIFICATION_INCOMPLETE`.

`verification.findings`: **empty**. Reconciliation items: 0. `materialUnresolvedCount`: 0. Qualitative grounding verdict on the rule: `GROUNDED`. `FALSE_COMPLETENESS`: none.

The material predicate is absent from the recompiled rule:

| Stored v4 IR | Replay through v11 |
|---|---|
| 1 condition, excerpt ordinary course | 2 conditions, both `UNSUPPORTED`, `expression: null` |
| object class only inside condition[0]’s description | condition[1] excerpt `obsolete or worn out property`, `SOURCE_BOUND_EXACT` on the operative span `[23, 52)` |
| manner excerpt `in the ordinary course of business` | kept as condition[0], `SOURCE_BOUND_EXACT` on `[53, 87)` |
| `gatedBy` null | `gatedBy` `AND` of two `UNSUPPORTED` leaves, `type: null`, `requiredReview: true`, `sourceEvidence` equal to those two excerpts |
| sufficiency `COMPLETE` | sufficiency `PARTIAL` |

Sufficiency reasons include the v11 limit:

`QUALITATIVE_GATE_NO_CLOSED_CONDITION_TYPE: an unlimited carve-out states a property-character object class and an ordinary-course manner; neither has a licensed computable condition type, so each gate is UNSUPPORTED, composed with AND on gatedBy, and sufficiency is PARTIAL (invent-absence; not a certification)`

`validateRule` reported no `FALSE_COMPLETENESS`. No new condition-type enum value. The object gate’s `conditionType` is `UNSUPPORTED`.

A consumer that honors `conditions` and `gatedBy` cannot treat ordinary course as sufficient. The sale-of-new-equipment counterexample does not satisfy the recompiled gate. That is the close.

`VERIFICATION_INCOMPLETE` is not a remaining `MISSING_CONDITION`. `lib/contract-model/compiler/semantic-verification/verify.ts` returns that status when `contextBundle.sufficiencyState !== "SUFFICIENT"` and no material finding was raised. The stored bundle’s `sufficiencyState` is `REVIEW_REQUIRED`. That value predates #120.

---

## What this rerun does not close

Layer 2 did not run. The historical finding was `SEMANTIC_ONLY`. `shouldInvokeSemanticReviewDeterministic` returns true when the IR inventory contains `UNLIMITED_CAPACITY_MARKER` or `UNSUPPORTED_MARKER` (`verify.ts`). This replay’s inventory contains both, plus a second `UNSUPPORTED_MARKER`. A production call without `skipSemanticReview` would invoke the reviewer. This run set the skip because the gate is soft and no provider was called. An empty Layer 1 list is not a new semantic clearance. The historical row stays `OPEN` in the evidence file.

`MISSING_DEPENDENCY` `ca99bcbc…` was not re-asked. `definitionCount` is 0. No `DEFINED_TERM_REFERENCE` for `Disposition` was emitted. That uncertain finding is not marked closed and was not promoted.

The stored v4 rule kept `dependsOn` / unresolved `REQUIRES` toward `Section 7.5`. The replay classifies that emission `MODEL_INVENTED_REFERENCE` (`source-reference-fidelity.v2`, detail `related to none of the drafted references (); excluded`) because the operative window states no section reference (`statedReferences: []`). `dependsOn` and `unresolvedDependencies` are empty. That classification is not in the #120 diff. Layer 1 did not raise a finding for it. It is not a new material blocker and it is not a pin input.

Entity-scope audit on the replay is `SOURCE_MATCH_CONFIRMED` from the parent lead-in. The stored v4 audit was `UNWITNESSED`. No verifier finding followed.

Supersession was not re-derived (`UNKNOWN_SUPERSESSION_STATUS` on the stub). Do not read this replay as confirming `CURRENT_OPERATIVE`.

---

## Pin eligibility

**N.**

1. Verifier status on the replay is `VERIFICATION_INCOMPLETE`, not a pass.
2. Layer 2 did not run. The original material finding was semantic. Skipping the review that production routing would force is not clearance.
3. Sufficiency is `PARTIAL`. Both gates are non-executable `UNSUPPORTED`. The limit string says this is not a certification.
4. `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json` has no `baca4371` row and no §7.5(a) pin. This rerun does not add a pin folder and does not set `eligible`.
5. The uncertain definition dependency is still un-adjudicated.
6. **IMPLEMENTED ≠ CERTIFIED.** A green generalized suite (10/10) plus this replay is not a Phase-3 percentage change and not `CERTIFIED`.

---

## Terminal

`MISSING_CONDITION` on this candidate: the representation defect #120 was written to carry is absent after recompiling the stored wire. Result **1**. Pin **N**. No further code change came out of the replay.
