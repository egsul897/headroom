# P3 missing-evidence inventory at `82a91cfa2bbb03a2722727125e909215ab96d2d4`

**Tip:** `82a91cfa2bbb03a2722727125e909215ab96d2d4` (full OID). Commit subject: P3 Lane D unlimited carve-out dual qualitative gates are UNSUPPORTED (#120). `origin/main` at the time of this note is that SHA.

**Mode:** invent-safe gap inventory only. Docs only. Soft gate. invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.** **DEVELOPMENT ≠ CERTIFIED.** **LOCK ≠ GRANT.** No pin minted. No pin folder. No `discoveryId` minted. No `eligible: true`. No matrix edit. No Phase-3 GRANT. No `CERTIFIED` claim.

**Knife River:** BLIND. The credit-agreement body was not opened for this note.

**Not reopened:** hunters #109, #110, and #111. The unlock report on this tip still names them as drafts. Their cell lists are not copied here.

Each bucket has one terminal:

`READY_TO_PIN` | `READY_FOR_GENERALIZED_IMPLEMENTATION` | `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE` | `BLOCKED_BY_ARCHITECTURE` | `NO_VALID_CANDIDATE`

| Bucket | Terminal |
| --- | --- |
| 1. WITH_BUILDERS | `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE` |
| 2. WITH_RECLASS / OPERATIVE_SUBWINDOW | `BLOCKED_BY_ARCHITECTURE` |
| 3. Asset-sales / weak cells | `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE` |
| 4. CONMED pin path (`baca4371`) | `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE` |
| 5. Knife River | `NO_VALID_CANDIDATE` |
| 6. PINNED_OFFLINE → cert | `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE` |

---

## 1. WITH_BUILDERS

**Terminal:** `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`

#118 locked the definition-identity refusal. It did not supply a pin, and it did not supply the amendment evidence a pin would need.

### What the tip already records

- Discovery note: `docs/phase-3-reliability-stratified-certification/p3-lane-a-definition-identity-1acdff3.md` (landed in #114, `b44c3dc699d59a803e6fedcdd2c412b72dbef75a`). Verdict in that file: `DEFINITION_IDENTITY_REQUIRES_ARCHITECTURE_DECISION`.
- Architecture lock: `docs/architecture/DUAL-DECLARATION-FAIL-CLOSED-AMBIGUOUS-ADR.md` (landed in #118, `d9c4cb64414cf00612a2d10e0205c66c7eec1bfa`). Status ACCEPTED. Product lock `FAIL_CLOSED_AMBIGUOUS`. Decision text: a dual declaration stays `AMBIGUOUS_TARGET`. **LOCK ≠ GRANT** for a resolver implement.
- Held cell, named in both files: `discovery-candidate:f62db8ebcda9d35c4fc03b2a`, section `6.01(b)(4)(a)(i)`, role `BUILDER`, 285 characters, `eligible: false`, blocker `UNRESOLVED_OPERATIVE_EVIDENCE`. The discovery note says this cell has no pin folder.
- Matrix row still on this tip: `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json` cross-cut `WITH_BUILDERS`, `status` `DEFERRED`, `honestyOutcome` `PIN_HOLD`. `coverageSummary.crossCutsDeferred` contains `WITH_BUILDERS`. `coverageSummary.crossCutsPinnedOffline` does not. The #120 diff does not include this file.
- Same two non-current definition dependencies on the builder bundle and on the asset-sales bundle (`p3-lane-a-definition-identity-1acdff3.md`):
  - `Subsidiary`, `context-item:cf103904c4db39198a1df5c96371e827e1e08e49a92a36434865653392f44440`, evidence `AMBIGUOUS_TARGET`, `isCurrentTruth: false`.
  - `Uniform Commercial Code`, `context-item:8ecf1273c334183560e1c91bb3a048033dbd232877cf8e440f0b1d5e9ead3577`, evidence `AMBIGUOUS_TARGET`, `isCurrentTruth: false`.
- ADR §2.2 records the physical pairs and says neither side is a winner: Subsidiary S1 `charStart` 339816, sha256 `f3b8e353bea7693e59265657131cf245c711a6afcd4900f0efcc5a2a3e13cb68`; S2 `charStart` 341757, sha256 `bb7c4e9a0308e0bbcd0865f7c1fdd8cd8ea9bb8c02c28ced79714fba97ff3bfc`. Uniform Commercial Code U1 `charStart` 354391, sha256 `f086bd238b67884d6df8ee9cda5bc42d5c474d15e378ec09f5f137f41e1bda34`; U2 `charStart` 354880, sha256 `c9c5494a61a2c745f98b8d87bc25c09ebc2d8ab07d67d4258ee678043d6251d3`. Shared reason shape: two physical definitions in `doc-a`, no recorded amendment history.
- ADR §2.2 package inputs that do not break the tie: one credit agreement, zero relationship candidates, zero amendment effects, zero exhibit / schedule / annex nodes.
- ADR §3 forbids the selectors that would pick a body (case identity, drop `nested`, alias counted once, later-declaration-wins, both bodies jointly operative, equal-text collapse, alias `UCC`). It forbids coercing `eligible: true` while either dependency is `AMBIGUOUS_TARGET`.
- CONMED sealed discovery file `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json` (document id on the first row: `conmed-doc-a-eighth-ar-credit-agreement`). A search of that file for the field `"role": "BUILDER"` returned no matches. The unlock report already states the same count as a hunt result (`docs/phase-3-reliability-stratified-certification/PHASE-3-TARGETED-UNLOCK-REPORT-1acdff3.md` §2 and §8). This note does not mint a CONMED builder id to fill that count.

### MISSING

**Unanswered question:** Which physical declaration is operative for `Subsidiary` (S1 at 339816 versus S2 at 341757) and for `Uniform Commercial Code` (U1 at 354391 versus U2 at 354880) on `discovery-candidate:f62db8ebcda9d35c4fc03b2a`?

**Expected source:** an amendment view, relationship candidate, or exhibit already in the Chewy package that disambiguates the normalized term. The ADR says the cells stay `eligible: false` until a separately granted rule exists in the amendment chain, the document graph, or source authority. That grant is not this ADR.

**Why the existing record cannot answer:** the package inputs in the ADR are one agreement and zero amendment effects. The resolver path the ADR cites already returns `AMBIGUOUS_TARGET` and serves no candidate text. #118 forbids the selectors and forbids `eligible: true`. The matrix row is still `PIN_HOLD`. A builder pin from this tip would coerce eligibility or invent a selector.

---

## 2. WITH_RECLASS / OPERATIVE_SUBWINDOW

**Terminal:** `BLOCKED_BY_ARCHITECTURE`

#119 named the sentence-window contract. Naming is not an emit, and D2 is still open. `RECLASSIFIABLE_TO` on the sealed Chewy discovery file is still 0. That is not implement ground.

### What the tip already records

- Lane B note: `docs/p3-lane-b-reclass-sealability-1acdff3.md` (landed in #115, `65be893f10ad4033afca43ba591074c05a49dd87`). Header: **HOLD.** Termination: `RECLASS_ARCHITECTURE_DECISION_REQUIRED`. Closing paragraph: implementation stays HOLD until an architect contract decides the window question and the category-to-category question.
- Architecture lock: `docs/architecture/OPERATIVE-SUBWINDOW-SEAL-ADR.md` (landed in #119, `7683a14697dceaa264ac97268e4909d45725bbb5`). Arch decision D1 only: name `OPERATIVE_SUBWINDOW`, requirements 1–6. Deferred: D2. The file’s own “Does not authorize” line lists production seal code, a Stage-1 marker, a `discoveryId`, a `stage2b` edit, a structural node, a pin, a `RECLASSIFIABLE_TO` edge, a percentage raise, and a `CERTIFIED` claim.
- Sentence facts in ADR §2.1, document `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt`: span `[392815, 393488)`, 673 characters, sha256 `78b081e801e06744fd6e665164b5b0801857a621de0f041eb6d5b21abeb4c83e`. No marker inside the span. Sealed candidate `discovery-candidate:82f0f8f14f2426d932b513dc` binds `structural-node:4769fe34429021eab497c82b`, `normalizedSourceRef` `1.08(f)`, span `[387511, 393489)`, 5978 characters. The sentence is a suffix of that span, not the span.
- ADR §2.1: `RECLASSIFIABLE_TO` occurrences in `tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json`: 0. Re-checked on this tip: a search of that file for `RECLASSIFIABLE_TO` returned no matches. The same search of `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json` returned no matches.
- ADR §3 requirement 6: naming is not an emit. “The pipeline on this tip still cannot produce a UNIQUE candidate whose operative window is the sentence. Implementation stays HOLD until a later grant.”
- ADR §3 D2: `IRRuleDependency` is `relationshipType`, `targetRuleId`, `description`, and optional `inventoryItemIds`. The sentence names categories, not a rule id. Mapping categories onto basket rules would invent targets. The ADR does not write a `RECLASSIFIABLE_TO` edge.
- Matrix row still on this tip: `01-pin-matrix.json` cross-cut `WITH_RECLASSIFICATION`, `status` `BLOCKED`, blocker text: no sealed Chewy/CONMED discovery candidate yet bound offline to a concrete classification/reclassification mechanic identity. `coverageSummary.crossCutsBlocked` contains `WITH_RECLASSIFICATION`.
- Unlock report `docs/phase-3-reliability-stratified-certification/PHASE-3-TARGETED-UNLOCK-REPORT-1acdff3.md` (rebind #121, `7076f028b0b74814439e3f5857df696ad39c3889`) §8 still records the lane terminal as HOLD `RECLASS_ARCHITECTURE_DECISION_REQUIRED`, and §10 says D2 remains open. That report’s live-tip banner is `7683a14697dceaa264ac97268e4909d45725bbb5` (#119). It predates #120 and was not rewritten by #120.

### What is not missing evidence

The sentence span, the container node, the zero edge count, and the six requirements are already written. A further census of the same sentence would not create implement ground. The ADR forbids reading the name as a grant to implement the seal, to mint a pin, or to invent the edge.

### Still open as architecture

**D2, unanswered:** whether a category-to-category automatic reclassification is representable by anything other than `IRRuleDependency { relationshipType, targetRuleId, description }`.

**Implement grant, not issued:** ADR requirement 6 says implementation stays HOLD until a later grant. #119 is the name. It is not that grant. This inventory does not open one.

---

## 3. Asset-sales / weak cells

**Terminal:** `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`

The Chewy asset-sales identity pin exists and stays `eligible: false`. The certified path for that cell is still blocked by the same unresolved definitions as bucket 1. CONMED §7.5(a) is a separate unpinned cell (bucket 4). Draft #110’s weak-cell list is not in this tip tree and is not imported.

### Tip-grounded cells

| Cell | Where it is written | Pin state on this tip |
| --- | --- | --- |
| Chewy `discovery-candidate:b54ed7fe4f8f7bb7c224d99b`, §`6.05(a)(2)(c)`, role `BASKET`, 857 characters | Pin folder `docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1/`. Manifest `00-pin-manifest.json` `status` `PINNED_OFFLINE`. Eligibility `01c-target-eligibility.json`: `eligible` false, blocker `UNRESOLVED_OPERATIVE_EVIDENCE`, `hasUnresolvedOperativeEvidence` true. Non-current items are the same Subsidiary and Uniform Commercial Code context items as bucket 1, both `AMBIGUOUS_TARGET`. | Identity pin stands. Certified path does not. Matrix stratum `ASSET_SALES` is `PINNED_OFFLINE` with `eligible` false (`01-pin-matrix.json`). `coverageSummary.assetSalesPinned` is true. `coverageSummary.assetSalesEligibleForCertifiedPath` is false. Pin `why` text: live CERTIFIED path remains blocked until defs disambiguate. |
| CONMED `discovery-candidate:baca43714b8502cc9c596c23`, §7.5(a) | Lane D note and the sealed evidence file in bucket 4. | No pin folder. Glob for `baca4371` under the repo returned no pin path. |
| CONMED §7.5(j) | `docs/phase-3-reliability-stratified-certification/00-selection-contract.json` stratum notes: already live-exhausted, interim-B series residuals, not first target. Matrix pin `why` for the Chewy asset-sales row: distinct from historically live-exhausted CONMED §7.5(j). Canonical map row in `docs/canonical-covenant-map/maps/conmed-2025-credit-facility.map.md`: `discovery-candidate:5aeac47ab31feb23331e4f89`, §7.5(j), `COMPILE_FAILED`. | Not a stratified pin. This note does not reopen it and does not re-pay it. |
| Gibraltar §7.04 Asset Dispositions | `docs/p3-lane-c-gibraltar-dev-edgar-1acdff3.md` §3 (landed in #112, `7c079b49703702e028441d88c35070a8313c3828`). 5,767 characters. Bare ref 7.04 called AMBIGUOUS. “No discoveryId.” | DEVELOPMENT evidence. Not a matrix cell. Not a pin. Not `CERTIFIED`. |

`00-selection-contract.json` `matrixRowsTbd` still has an `ASSET_SALES` object whose only field is `blocker`: “Prefer non-7.5(j) basket; exclude series-aggregation-only windows until A/C ADR”. Unlike the LIENS, INVESTMENTS, and FINANCIAL_COVENANTS rows in that same array, this object has no `status`, no `pinAuthority`, and no `pinFolder`. The pin authority for the Chewy identity pin is `01-pin-matrix.json`, which does record the pin. This note does not treat the stale selection-contract object as the absence of that pin, and it does not edit either file.

### MISSING (certified path for the pinned Chewy cell)

**Unanswered question:** same as bucket 1, for this cell: which physical `Subsidiary` declaration and which physical `Uniform Commercial Code` declaration is operative for `discovery-candidate:b54ed7fe4f8f7bb7c224d99b`?

**Expected source:** an amendment view in the Chewy package that disambiguates those two normalized terms. The eligibility file already stores the no-amendment reason strings.

**Why the existing record cannot answer:** the identity pin’s eligibility file records both items as `AMBIGUOUS_TARGET` with `isCurrentTruth: false`, and `eligible` is false. #118 forbids coercing `eligible: true`. `assetSalesEligibleForCertifiedPath` is false. `PINNED_OFFLINE` on this cell is not a certified path.

### Weak-cell hunter

`PHASE-3-TARGETED-UNLOCK-REPORT-1acdff3.md` §13 lists #110 as Draft, “Discover-only weak-cell holds,” and §12 says that draft is not merged. The hold list from that draft is not a file on this tip. It is not restated here.

---

## 4. CONMED pin path (`baca4371`)

**Terminal:** `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`

A pin is forbidden while the sealed `MATERIAL` finding is open. #120 implemented a generalized compiler pass. It did not replace the sealed verification, and it did not mint a pin.

### What #116 recorded

`docs/p3-lane-d-conmed-7.5a-discrepancy-1acdff3.md` (landed in #116, `6df53b4f225adfbe40bbc765647f1b4c17a2b7c3`).

| Field | Value in that note |
| --- | --- |
| Candidate | `discovery-candidate:baca43714b8502cc9c596c23` |
| Rule | `ir-rule:b752bbaf461e4c3b704300d2` |
| Section | §7.5(a) |
| Role | EXCEPTION |
| Operative sha256 | `b5234392b81353005e573fd482a18db182ad460c0a2235fc77e9d240418014a0` |
| Operative text | `(a) the Disposition of obsolete or worn out property in the ordinary course of business;` |
| Compile | `REVIEW_REQUIRED` / `SEMANTIC_ACCOUNTABILITY_INCOMPLETE` |
| Verify | `MATERIAL_DISCREPANCY` |
| MATERIAL finding | `82ce660a63258d57f778551fb7ec2ded12514afb0e310b704a5b9ea70c14d784`, `MISSING_CONDITION`, `resolutionStatus` `OPEN` |
| UNCERTAIN finding | `ca99bcbc49fce9df8ab2548f5a7dbdc7c66a7621122d35070f745d2f86030c5c`, `MISSING_DEPENDENCY`, `resolutionStatus` `OPEN` |
| Lane terminal | `GENERALIZED_REPRESENTATION_DEFECT` |

The note says the pin folder’s absence does not create or remove the widening, and “Missing pin is not the blocker.” The blocker it names is the unmodeled object class: `gatedBy` null, one ordinary-course condition, sufficiency `COMPLETE`.

### What the sealed packet still says on this tip

`docs/phase-3-conmed-population-verified/run-original/evidence/discovery-candidate:baca43714b8502cc9c596c23.json`

- `verification.status`: `MATERIAL_DISCREPANCY`
- Finding `82ce660a…c14d784`: `severity` `MATERIAL`, `resolutionStatus` `OPEN`, `irPath` `rules[0].conditions`
- `proposedIrEvidence` in that finding: `UNLIMITED_CAPACITY` with `gatedBy` null; sufficiency `COMPLETE`; only the ordinary-course condition
- Finding `ca99bcbc…86030c5c`: `severity` `UNCERTAIN`, `resolutionStatus` `OPEN`
- `compiledAt`: `2026-09-25T02:21:52.154Z`

Canonical map row for the same id, `docs/canonical-covenant-map/maps/conmed-2025-credit-facility.map.json` (candidate object at the `7.5(a)` entry): `verificationStatus` `MATERIAL_DISCREPANCY`, `compilationStatus` `REVIEW_REQUIRED`, `certificationStatus` `NOT_CERTIFIED`, `certificationBlockers` includes `CERTIFICATION_NOT_PERFORMED`, `operativeSourceSha256` `b5234392b81353005e573fd482a18db182ad460c0a2235fc77e9d240418014a0`, `operativeSourceChars` 89, `role` `EXCEPTION`. The map markdown review table repeats compilation `REVIEW_REQUIRED` and verification `MATERIAL_DISCREPANCY: 1 material finding(s)` for this id (`docs/canonical-covenant-map/maps/conmed-2025-credit-facility.map.md`).

That map `NOT_CERTIFIED` value is the map’s recorded status. It is not a new certification decision, and it is not a claim that some other status was reached.

### What #120 changed, and what it did not

#120 (`82a91cfa2bbb03a2722727125e909215ab96d2d4`) adds `lib/contract-model/compiler/semantic/unlimited-carveout-honesty.ts` and calls `applyUnlimitedCarveOutQualitativeGates` from `lib/contract-model/compiler/semantic/normalize.ts`. The module header says an uncapped permission that conjoins a property-character object class with an ordinary-course manner keeps both as `UNSUPPORTED` gates, AND-composed on `gatedBy`, with sufficiency `PARTIAL`. It says the pass does not invent a condition type and does not special-case an agreement or a section. Header line: **IMPLEMENTED ≠ CERTIFIED.**

The unit test `tests/contract-model/semantic-compiler/unlimited-carveout-qualitative-gates.test.ts` uses synthetic section `9.07(a)` and the string `the transfer of obsolete or worn out property in the ordinary course of business`. That string is not the sealed CONMED window, and the test file does not name `baca43714b8502cc9c596c23`.

The #120 file list does not include the sealed evidence JSON, the canonical map, `01-pin-matrix.json`, or any pin folder.

The unlock report §6 and §9, written at #121 before this tip, say #116 is the analysis and not the rem, and that a rem grant file was not in that merge. #120 later landed compiler code. No file on this tip is a post-#120 verification of the sealed candidate.

### MISSING

**Unanswered question:** After `applyUnlimitedCarveOutQualitativeGates` at this tip, does a recompile of the sealed operative window (sha256 `b5234392b81353005e573fd482a18db182ad460c0a2235fc77e9d240418014a0`) close finding `82ce660a63258d57f778551fb7ec2ded12514afb0e310b704a5b9ea70c14d784` (`MISSING_CONDITION`, `MATERIAL`, `OPEN`)?

**Expected source:** an append-only recompile and semantic-verification record for `discovery-candidate:baca43714b8502cc9c596c23` produced from this tip’s compiler, with `verification.status` and each finding’s `resolutionStatus`. Not an in-place edit of the 2026-09-25 packet.

**Why the existing record cannot answer:** the preserved packet still has `gatedBy` null, sufficiency `COMPLETE`, `verification.status` `MATERIAL_DISCREPANCY`, and both findings `OPEN`. The #120 test does not use the sealed window. The map row is still `MATERIAL_DISCREPANCY` and `NOT_CERTIFIED` with `CERTIFICATION_NOT_PERFORMED`. No pin folder exists. A pin while that MATERIAL finding is `OPEN` is not an honest pin path.

The paired UNCERTAIN finding `ca99bcbc…86030c5c` is also still `OPEN` on the sealed packet. Lane D says that finding is not the material discrepancy. This note does not mark it resolved.

---

## 5. Knife River

**Terminal:** `NO_VALID_CANDIDATE`

**Sealed status:** BLIND. Body unread. This note does not request the body.

Designation text, not a filing body:

- `docs/p3-lane-c-gibraltar-dev-edgar-1acdff3.md` header and §4. Tip label on that note is `1acdff345fff655f602fd61ff20c395028b6f140`. Designation recorded there: Gibraltar is DEVELOPMENT. Knife River is BLIND. Arch+Cert OPTION B, timestamp in the note `2026-10-07T15:05:09Z`. §4: the body was not opened; clauses were not searched; covenant wording was not inspected. §5: the designation stands.
- `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/provenance.json` key `knifeRiver`: `designation` `BLIND`, `bodyOpened` false, `clausesSearched` false, `covenantWordingInspected` false, `metadataRecordedFromThisRun` false. The `reason` string says this lane did not look up, request, or store a Knife River URL or accession.
- Unlock report §5 and §8: body not opened; stays BLIND.

Gibraltar, already in-repo from #112, remains DEVELOPMENT in that lane note. It is not a selected matrix cell, not a pin, and not `CERTIFIED`. This bucket does not promote it.

No Knife River `discoveryId` is recorded in those designation files. None is minted here.

---

## 6. PINNED_OFFLINE → cert

**Terminal:** `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`

The inequality **PINNED_OFFLINE ≠ CERTIFIED** is already written on this tip. The evidence that would be required before anyone could discuss certification of these blocked cells is not on this tip. This note does not certify any row.

### Tip artifacts that state the inequality

- `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json`: top-level `status` is `OFFLINE_PIN_MATRIX_PARTIAL`. A search of that file for `"status": "CERTIFIED"` returned no matches. `coverageSummary.note` states `PINNED_OFFLINE is not CERTIFIED` and `IMPLEMENTED is not CERTIFIED`. `reviewAsk.passUnlocks` states the same, and states that the packet is not `CERTIFIED`.
- Stratum and pin objects in that matrix use `PINNED_OFFLINE` or `BASELINE_PINNED` or `DEFERRED` or `BLOCKED`. Example manifest: `docs/phase-3-reliability-stratified-certification/pins/chwy-2026-credit-agreement/6.05(a)(2)(c)--b54ed7fe/v1/00-pin-manifest.json` `status` `PINNED_OFFLINE`.
- `docs/phase-3-reliability-stratified-certification/00-selection-contract.json`: `certifiedMeans` is candidate status `CERTIFIED` under `phase3-candidate-certification.v1` with STRONG source identities, no REVIEW/BLOCKING blockers, and no interim-B series false credit. Acceptance text: certification uses production `certifyCandidate` blockers; `CERTIFIED` only when blockers are empty.
- `lib/contract-model/phase3-certification/certify.ts`: `certifyCandidate` sets status `CERTIFIED` only when the blockers array is empty. Any remaining blocker yields `REVIEW_REQUIRED` if none are `BLOCKING`, otherwise `NOT_CERTIFIED`. `OK_VERIFICATION` is `VERIFIED_NO_MATERIAL_GAP_FOUND` or `VERIFIED_WITH_NON_MATERIAL_FINDINGS`. A verification status outside that set and outside the failed set, which is where `MATERIAL_DISCREPANCY` sits relative to those two sets, is blocker `VERIFICATION_NOT_CLEAN`. An open `MATERIAL` or `UNCERTAIN` finding is blocker `OPEN_MATERIAL_OR_UNCERTAIN_FINDING`. Unresolved operative evidence is blocker `OPERATIVE_STATE_UNACCEPTABLE`. A unit whose sufficiency is not `COMPLETE` is blocker `UNIT_SUFFICIENCY_INCOMPLETE`.
- `notCertified` helper in the same file: a candidate that never reached certification is `NOT_CERTIFIED` with blocker `CERTIFICATION_NOT_PERFORMED`. That is the blocker on the `baca4371` map row.
- Unlock report §12: the matrix has 12 rows; the number whose status is `CERTIFIED` is 0; rows that are `PINNED_OFFLINE` or `BASELINE_PINNED`, including rows with `eligible: true`, are not `CERTIFIED`. The carried board sentence in that section (“about 25%”, “CERTIFIED 0/12”) is prose in that file. This inventory does not recompute it and does not raise it. The report’s live-tip banner is #119, not this tip. #120 did not edit the matrix.

### MISSING before a cert discussion of these cells

**Unanswered question:** For which discovery id in this inventory, if any, does `certifyCandidate` return an empty blockers array?

**Expected source:** a `phase3-candidate-certification.v1` record whose inputs are the compile, the verification, the snapshot, and the verified-unit package for that discovery id, and whose blockers array is empty. The selection contract’s `certifiedMeans` names that shape.

**Why the existing record cannot answer:**

- Builder cell `f62db8eb…` and asset-sales cell `b54ed7fe…` are `eligible: false` with `UNRESOLVED_OPERATIVE_EVIDENCE`. The asset-sales eligibility file sets `hasUnresolvedOperativeEvidence` true. `certifyCandidate` records that condition as a blocker.
- `baca4371` verification status on the sealed packet is `MATERIAL_DISCREPANCY`, with an open MATERIAL finding and an open UNCERTAIN finding. The map certification status is `NOT_CERTIFIED` / `CERTIFICATION_NOT_PERFORMED`.
- `WITH_RECLASSIFICATION` is `BLOCKED` and has no sealed sentence candidate.
- Knife River has no candidate.
- `PINNED_OFFLINE` rows, including rows whose `eligible` field is true, are labeled on the matrix as not `CERTIFIED`. This inventory did not run `certifyCandidate` on them and does not convert those labels into a certification discussion.

An empty-blocker record is what would have to exist before certification of one of these cells could be discussed. This file is not that record. No row is `CERTIFIED`.
