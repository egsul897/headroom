# Track 4 — CONMED §7.5(a) remaining blockers after #120

Soft gate. invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

No pin. No pin folder. No new condition type. No section-specific branch. No new discoveryId. Knife River was not opened. The historical evidence file was not edited. This note does not re-execute the replay.

| Field | Value |
|---|---|
| Compiler tip | `62a40be22b9598d9732e9ce2574d86d2228d6270` (#120 is `82a91cfa2bbb03a2722727125e909215ab96d2d4` on this tip) |
| Rerun record | `02b9f7a9a17070dbaed70300d1e5ac7a4759a7f7` (PR #124, merged at `554698a0e9403436c637f6789a663321fa03701a`) |
| Candidate | `discovery-candidate:baca43714b8502cc9c596c23` |
| Rule | `ir-rule:b752bbaf461e4c3b704300d2` |
| Section | §7.5(a) |
| Sealed evidence | `docs/phase-3-conmed-population-verified/run-original/evidence/discovery-candidate:baca43714b8502cc9c596c23.json` |
| Evidence sha256 | `19e2173b3fd261f74f55f36c5e4b9210ff1d1c841dd1e15bdfd4f1f41f7c636c` |
| Operative sha256 | `b5234392b81353005e573fd482a18db182ad460c0a2235fc77e9d240418014a0` (89 chars) |
| Pin eligibility on #124 | **N** |
| Phase-3 CERTIFICATION | **N** |

Machine record of the replay: `docs/p3-track-e-conmed-75a-missing-condition-rerun-62a40be.json`. Narrative: `docs/p3-track-e-conmed-75a-missing-condition-rerun-62a40be.md`.

Post-#124 state this note takes as given: the old MATERIAL `MISSING_CONDITION` is absent from the replay findings; the recompiled rule has two `UNSUPPORTED` conditions, an `AND` on `gatedBy`, and sufficiency `PARTIAL`; pin eligibility is N; Layer 1’s old finding is gone.

---

## Closed on the replay

| | |
|---|---|
| findingId | `82ce660a63258d57f778551fb7ec2ded12514afb0e310b704a5b9ea70c14d784` |
| findingType | `MISSING_CONDITION` |
| severity | `MATERIAL` |
| sealed resolution | `OPEN` in the evidence file (file not edited) |
| replay | absent from `verification.findings` |

The sealed file still shows that finding. The replay’s Layer 1 list is empty. Object excerpt `obsolete or worn out property` is condition[1], `SOURCE_BOUND_EXACT` on operative `[23, 52)`. Manner excerpt `in the ordinary course of business` is condition[0], `SOURCE_BOUND_EXACT` on `[53, 87)`. `gatedBy` is `AND` of two `UNSUPPORTED` leaves. Sufficiency is `PARTIAL`. That is the #120 carry. It is implemented. It is not a certification.

---

## Remaining blockers

Four remain. Each has one class.

| # | Blocker | Class |
|---|---|---|
| 1 | Replay status `VERIFICATION_INCOMPLETE` because the stored context bundle `sufficiencyState` is `REVIEW_REQUIRED` | `VERIFIER_ROUTING_BEHAVIOR` |
| 2 | Layer 2 did not run; production routing forces review on `UNLIMITED_CAPACITY_MARKER` and `UNSUPPORTED_MARKER` | `VERIFIER_ROUTING_BEHAVIOR` |
| 3 | Both qualitative gates stay `UNSUPPORTED`, composed with `AND`, sufficiency `PARTIAL` | `EXPECTED_UNSUPPORTED_SEMANTICS` |
| 4 | Sealed `MISSING_DEPENDENCY` `ca99bcbc…` stays `UNCERTAIN` / `OPEN`; the replay did not adjudicate it | `MISSING_DEPENDENCY` |

Classes with no remaining blocker on this candidate: `TRUE_SOURCE_LIMITATION`, `CONTEXT_RETRIEVAL_DEFECT`, `ARCHITECTURE_LIMIT`, `IMPLEMENTATION_DEFECT`.

### 1. `VERIFICATION_INCOMPLETE` from stored `REVIEW_REQUIRED`

`lib/contract-model/compiler/semantic-verification/verify.ts` `determineStatus` returns `VERIFICATION_INCOMPLETE` when `compilerInput.contextBundle.sufficiencyState !== "SUFFICIENT"`. That check sits after the material-finding check. The replay’s findings are empty, so this gate is what selected the status.

The stored bundle on the evidence file is `REVIEW_REQUIRED`. `stopReasons` is `[]`. Items present, each `evidenceState.status` `CURRENT`: operative §7.5(a), parent §7.5, `Disposition`, `Division`, `Property`, and two `UNVERIFIED_SIBLING_SIGNAL` siblings. The evidence writer (`scripts/p3-conmed-pilot/evidence.ts`) does not copy `unresolvedDependencies`, so the rows that produced `REVIEW_REQUIRED` are not on the replay input. This note does not invent those rows.

The operative clause and the `Disposition` definition excerpt are in the bundle. No stop reason is recorded. That is a verifier status gate on a stored label, which is `VERIFIER_ROUTING_BEHAVIOR`.

### 2. Layer 2 not run

`shouldInvokeSemanticReviewDeterministic` returns true when the IR inventory contains `UNLIMITED_CAPACITY_MARKER` or `UNSUPPORTED_MARKER`. The replay inventory contains the capacity marker and two unsupported markers. A production call without `skipSemanticReview` would invoke Layer 2.

The replay set `skipSemanticReview: true`. `semanticReviewInvoked` is false. The skip reason on the record is the caller override. An empty Layer 1 list is not a semantic clearance. The historical finding was `SEMANTIC_ONLY`. The sealed row stays `OPEN` in the evidence file.

That is the router doing what the router is written to do, plus a replay that skipped it. Class: `VERIFIER_ROUTING_BEHAVIOR`.

### 3. Two `UNSUPPORTED` gates, `AND`, `PARTIAL`

`CONTRACT_CONDITION_TYPES` has no member for a property-character test and no member for ordinary course. #120’s `applyUnlimitedCarveOutQualitativeGates` (`lib/contract-model/compiler/semantic/unlimited-carveout-honesty.ts`) writes each gate as `conditionType: "UNSUPPORTED"`, `expression: null`, composes them with `AND` on `UNLIMITED_CAPACITY.gatedBy`, and sets sufficiency `PARTIAL`. The recorded reason is:

`QUALITATIVE_GATE_NO_CLOSED_CONDITION_TYPE: an unlimited carve-out states a property-character object class and an ordinary-course manner; neither has a licensed computable condition type, so each gate is UNSUPPORTED, composed with AND on gatedBy, and sufficiency is PARTIAL (invent-absence; not a certification)`

The source states both restrictions. The licensed residual is the non-executable carry. A consumer that honors `conditions` and `gatedBy` cannot treat ordinary course as sufficient, and cannot execute the gate. That residual blocks an executable certification. Class: `EXPECTED_UNSUPPORTED_SEMANTICS`.

### 4. Open `MISSING_DEPENDENCY`

| | |
|---|---|
| findingId | `ca99bcbc49fce9df8ab2548f5a7dbdc7c66a7621122d35070f745d2f86030c5c` |
| findingType | `MISSING_DEPENDENCY` |
| severity | `UNCERTAIN` |
| resolutionStatus | `OPEN` |
| verificationMethod | `SEMANTIC_ONLY` |
| irPath | `rules[0].dependsOn; definitions` |

The sealed reasoning says the IR carries neither the `Disposition` body nor the `Property` body, and marks the gap uncertain because the IR may assume the reader still has the source definitions.

On the replay: `definitionCount` is 0, `dependsOn` is empty, and no `DEFINED_TERM_REFERENCE` for `Disposition` was emitted. The prompt’s source-ownership rule keeps a used defined term as `DEFINED_TERM_REFERENCE` and emits a `WireDefinition` only when the defining text is inside the operative window. The operative window is the 89-character clause. The defining text is a context item, not that window. #120 does not synthesize a term reference. #124 did not re-ask the finding.

`Disposition` is capitalized in the clause. Discovery on this candidate records `definedTermDependencyLikely: false` (`tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json`). Lowercase `property` in clause (a) is not the defined term `Property`. The `Property` excerpt in the bundle is a transitive dependency of the `Disposition` definition. This note does not promote `Property` to a dependency of clause (a), and it does not copy either body onto the rule.

The finding stays open and uncertain. Class: `MISSING_DEPENDENCY`.

---

## Observed, and not a remaining blocker

- `sourceReferenceAudit` classifies the stored wire’s `Section 7.5` edge as `MODEL_INVENTED_REFERENCE` (`statedReferences: []`, detail `related to none of the drafted references (); excluded`). `dependsOn` and `unresolvedDependencies` on the replay are empty. #124 records that this classification is outside the #120 diff, that Layer 1 raised no finding for it, and that it is not a pin input. It stays that way here.
- Replay `sourceInventorySupersessionStatus` is `UNKNOWN_SUPERSESSION_STATUS` because the structural index was the test-helper stub. The sealed inventory is `CURRENT_OPERATIVE`. `determineStatus` withholds a clean status for `KNOWN_SUPERSEDED`, and the stub did not select `VERIFICATION_INCOMPLETE`. This replay is not a new operative-state confirmation.
- The manner condition’s description still names “obsolete or worn out property” inside the ordinary-course sentence. The object class is also its own condition and its own `gatedBy` operand. Layer 1 raised nothing on that prose.
- Wire labels `ASSET_DISPOSITIONS`, `DISPOSE_OF_PROPERTY`, `ORDINARY_COURSE_OF_BUSINESS`, and `EXCEPTION_TO` are closed-enum normalizations already on the stored compile. They are not a fifth blocker beyond the classes above.
- `01-pin-matrix.json` has no `baca4371` row and no §7.5(a) pin folder. Absence of a row is the matrix fact. It is not a source class.

The earlier pin-path label `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE` was the unmodeled object class. That predicate is absent on the replay. This note does not reuse that label for blockers 1–4.

---

## Phase-3 CERTIFICATION

**N.**

`discovery-candidate:baca43714b8502cc9c596c23` is not a Phase-3 certification candidate on this record.

The #120 shape is on the replay, Layer 1’s old material finding is gone, and #124 already records pin eligibility N. What remains is a non-executable `PARTIAL` unit, verifier status `VERIFICATION_INCOMPLETE`, Layer 2 unrun where production routing would force it, and the open uncertain `MISSING_DEPENDENCY`. The qualitative-gate reason string says the `PARTIAL` carry is not a certification. **IMPLEMENTED ≠ CERTIFIED.** There is no pin, so there is no offline pin to treat as certification. **PINNED_OFFLINE ≠ CERTIFIED.** The generalized suite cited on #124 does not load this candidate.

No replacement pin is named. The process that selects one is the stratified pin matrix already on main:

1. Sealed discovery population only. No invented discoveryId.
2. Deterministic emitter `pinCandidate` in `scripts/stratified-cert/pin-candidate.ts`, writing the packet under `docs/phase-3-reliability-stratified-certification/pins/` (`00-pin-manifest.json` through `01c-target-eligibility.json`). Design: `docs/phase-3-reliability-stratified-certification/05-pin-pipeline-emitter-design.md`.
3. `eligible` is true only when that packet’s `eligibilityBlockers` is empty.
4. A row in `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json` is the matrix record of that packet.

This note does not run the emitter, does not add a row, and does not name another section.
