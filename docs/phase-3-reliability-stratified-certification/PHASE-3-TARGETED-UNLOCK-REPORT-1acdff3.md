# Phase 3 targeted unlock report

**Live main tip:** `7683a14697dceaa264ac97268e4909d45725bbb5`  
**Live tip commit:** pull request #119, “P3-LANE-B: name OPERATIVE_SUBWINDOW seal contract (Arch D1).” Docs name only. Not a sealed sentence, not an edge, not a certification gate. D2 stays deferred. Naming is not an emit.  
**Checked:** 2026-10-07T15:42:14Z. `origin/main` was that SHA.  
**Earlier check (not the live tip):** 2026-10-07T15:28:50Z recorded `65be893f10ad4033afca43ba591074c05a49dd87` (#115). That sentence was true at that clock. #112, #117, and #119 merged at 15:39Z. This file’s first merge (#117 at `ad9b6e728a8dd2ed0fadd290d97f9c922741f141`) still contains that earlier banner. This rebind replaces it.

**Historical study base (not the current tip):** `1acdff345fff655f602fd61ff20c395028b6f140` (merge of #103). The five lane notes were written against that tree. This file’s name keeps that SHA as the study label. It is not a claim that `1acdff3` is still `main`.

**Docs on main since that study base.** Parent order, newest last. Each merge is a document. None of them is `CERTIFIED`.

| Merge | SHA | What landed |
|---|---|---|
| #113 | `99a5a5fbd14e648a58d26434fd3d3c74815c4424` | Lane E metrics note |
| #114 | `b44c3dc699d59a803e6fedcdd2c412b72dbef75a` | Lane A definition-identity discovery note |
| #118 | `d9c4cb64414cf00612a2d10e0205c66c7eec1bfa` | Lane A `FAIL_CLOSED_AMBIGUOUS` ADR |
| #116 | `6df53b4f225adfbe40bbc765647f1b4c17a2b7c3` | Lane D §7.5(a) discrepancy note (analysis, not a rem) |
| #115 | `65be893f10ad4033afca43ba591074c05a49dd87` | Lane B reclass HOLD note |
| #112 | `7c079b49703702e028441d88c35070a8313c3828` | Lane C Gibraltar DEVELOPMENT fixture and lane note. Not selected. Not a matrix cell. |
| #117 | `ad9b6e728a8dd2ed0fadd290d97f9c922741f141` | This consolidator, first landed while it still named tip `65be893f…` |
| #119 | `7683a14697dceaa264ac97268e4909d45725bbb5` | Lane B `OPERATIVE_SUBWINDOW` name (Arch D1). Current main tip. Not an emit. Not a seal. |

`01-pin-matrix.json` is unchanged from `1acdff3` to this tip.

**Mode:** one docs consolidator. Soft gate. Invent-absence forever. No product code. No pin. No new discoveryId, key, chunk, or HOLD. A path-filter omit is not a green check.

**IMPLEMENTED ≠ CERTIFIED. PINNED_OFFLINE ≠ CERTIFIED. DEVELOPMENT ≠ CERTIFIED. A merged analysis note is not a rem. A merged HOLD is not a seal. A merged contract name is not an emit. LOCK ≠ GRANT for a resolver implement.**

This note folds five lane reports so a reader can see what was learned, what is locked as fail-closed, what is still a HOLD, and what is still blocked for lack of evidence. It does not certify anything. It does not raise a Phase 3 percentage. The carried “about 25%” in §12 is retired by `docs/phase-3-reliability-stratified-certification/TRACK-E-SCOREBOARD-HONESTY-62a40be.md`.

## 1. Soft-gate banner

Allowed here: read the lane drafts, restate their terminals, and say which claims are in those drafts and which claims are not.

Not allowed, and not done: product edits, a pin folder, a minted discoveryId, a `RECLASSIFIABLE_TO` edge, an `eligible: true` flip, a Knife River body, a Gibraltar cell selected into the matrix, or a higher completion percentage.

A lane that is open on GitHub is not merged. Ready-for-review is not merged. A merged docs note is not `CERTIFIED`. A written HOLD is not a certified identity. A workflow the path filter does not run is omitted. That omit is not a green check and is not certification credit. Pull request #116 on main is the §7.5(a) analysis, not the honesty rem.

## 2. What this directive allowed

The five lanes were a targeted reading of cells that were already stuck. They were not a new hunter across the corpus.

| Lane | Job | What it was not allowed to do |
|---|---|---|
| A | Say why Chewy `Subsidiary` and `Uniform Commercial Code` stay ambiguous | Pick a definition. Set `eligible: true`. Mint a pin. |
| B | Say whether the Chewy §1.08(f) reclass sentence can be sealed as its own window | Invent a node, a discoveryId, or a Chewy-only span. Write an edge. |
| C | Fetch one development credit agreement (Gibraltar). Leave Knife River blind | Run Pass B/C/D without a key. Select a matrix cell. Pin anything. |
| D | Name the CONMED §7.5(a) representation gap and the licensed way to carry it | Add an enum. Special-case the section. Pin the candidate. |
| E | Recompute three old metrics at this tip and say whether they block the semantic freeze | Remediate the product. Rescore the frozen study. Block step 3 on folklore. |

Prior terminals that this note does not reopen as unlocked:

- `WITH_BUILDERS` (Chewy and CONMED): still `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE` or pin HOLD, as already stamped. CONMED’s sealed population has no `BUILDER` role.
- `WITH_RECLASSIFICATION`: still `NO_VALID_CANDIDATE` on the packet hunt, and `BLOCKED` on the pin matrix.
- `ASSET_SALES` Chewy §6.05(a)(2)(c): still identity-only, `eligible: false`.
- CONMED §7.5(a): still not a pin. Lane D names the representation defect. It does not clear the pin path.

## 3. Lane A — definition identity

| | |
|---|---|
| Agent | https://cursor.com/agents/bc-79eb922b-592a-50f1-9b56-fd3606ce855b |
| Branch | `cursor/p3-lane-a-definition-identity-855b` |
| Head | `458687921afd19319486b3e5c93d4d91da185764` |
| Remote | **ON_REMOTE.** Not local-only. |
| Pull request | https://github.com/egsul897/headroom/pull/114 |
| PR state at check | **MERGED** at `b44c3dc699d59a803e6fedcdd2c412b72dbef75a`. The discovery note is on main. That merge is not `CERTIFIED` and does not set `eligible: true`. |
| Record | `docs/phase-3-reliability-stratified-certification/p3-lane-a-definition-identity-1acdff3.md` (on main) |

**Terminal in the lane record:** `DEFINITION_IDENTITY_REQUIRES_ARCHITECTURE_DECISION`

Both cells stay `eligible: false` with `UNRESOLVED_OPERATIVE_EVIDENCE`. No pin was added. `eligible` was not set to true.

| Cell | discoveryId | Section | Eligible |
|---|---|---|---|
| BUILDER | `discovery-candidate:f62db8ebcda9d35c4fc03b2a` | `6.01(b)(4)(a)(i)` | `false` |
| ASSET_SALES | `discovery-candidate:b54ed7fe4f8f7bb7c224d99b` | `6.05(a)(2)(c)` | `false` |

The shared reason is two normalized terms, each with two physical definitions in `doc-a`, and no amendment history that would pick one. The package has one credit agreement, zero relationship candidates, zero amendment effects, and zero exhibit nodes. The resolver’s existing answer is `AMBIGUOUS_TARGET`. That refusal is already implemented. A rule that would choose which text is operative is not in the amendment chain, the document graph, the source-authority seal, the North Star, or the structural-identity ADR.

The census in the lane note (not repeated here) distinguishes the two `Subsidiary` bodies and shows that the second `Uniform Commercial Code` “shall mean” sits inside the first sentence. Context-budget stop reasons are recorded and are not themselves `eligibilityBlockers`.

**Lock path:** pull request #118 is **MERGED** at `d9c4cb64414cf00612a2d10e0205c66c7eec1bfa`. The file on main is `docs/architecture/DUAL-DECLARATION-FAIL-CLOSED-AMBIGUOUS-ADR.md`. Product lock named there: `FAIL_CLOSED_AMBIGUOUS`. A dual declaration stays `AMBIGUOUS_TARGET`. No silent pick of `Subsidiary` or `Uniform Commercial Code`. Chewy-only is forbidden. The ADR’s own status line says ACCEPTED as a docs lock. It also says **LOCK ≠ GRANT** for a resolver implement. It does not authorize a resolver change, an `eligible: true` coerce, a pin, or a percentage raise. Both cells above stay `eligible: false`.

The earlier frozen id `PHASE-3-LANE-A-DEFINITION-IDENTITY.FROZEN.9817b099…` is not the file that merged. The merged ADR records grant sha256 `7a19614eee57bfe9f4a6e060b20cb22230fc5147728ede7743643dc43cf08e9d` as “recorded MATCH,” plus “Invent-safe ALL Y” and “CEO APPROVE on record.” This consolidator did not recompute that hash. The merge is not `CERTIFIED`.

## 4. Lane B — reclass sealability, §1.08(f)

| | |
|---|---|
| Agent | https://cursor.com/agents/bc-34660c7b-764d-5ea4-b8cb-502cff2a9e3f |
| Branch | `cursor/p3-lane-b-reclass-sealability-9e3f` |
| Head | `461f24b9924b2766f12acfbb7ef69be97b70435e` |
| Remote | **ON_REMOTE.** |
| Pull request | https://github.com/egsul897/headroom/pull/115 |
| PR state at check | **MERGED** at `65be893f10ad4033afca43ba591074c05a49dd87`. Diff is the HOLD note only (`docs/p3-lane-b-reclass-sealability-1acdff3.md`, 187 lines). That commit is not the current main tip. |
| Record | `docs/p3-lane-b-reclass-sealability-1acdff3.md` (on main) |

**Terminal:** HOLD. `RECLASS_ARCHITECTURE_DECISION_REQUIRED`

The merge puts that HOLD on main. It does not mint a node, a discoveryId, or a `RECLASSIFIABLE_TO` edge. It does not make the 673-character sentence a sealed operative window. A merged HOLD is not a seal and not `CERTIFIED`.

Pull request #119 (“P3-LANE-B: name OPERATIVE_SUBWINDOW seal contract”) is **MERGED** at `7683a14697dceaa264ac97268e4909d45725bbb5`. That commit is the current main tip. The file on main is `docs/architecture/OPERATIVE-SUBWINDOW-SEAL-ADR.md`. It names Arch D1. It does not emit a window, mint a discoveryId, write a `RECLASSIFIABLE_TO` edge, or authorize production seal code. D2 stays deferred. A merged name is not a seal and not `CERTIFIED`. Implementation of the seal stays HOLD. The ADR’s base line still records `65be893f…` (#115). That base label is the ADR’s own historical base. It is not this live tip.

The sentence is real. Half-open span `[392815, 393488)`, 673 characters, SHA-256 `78b081e801e06744fd6e665164b5b0801857a621de0f041eb6d5b21abeb4c83e`. It says amounts incurred under Fixed Amounts are automatically reclassified into the applicable Incurrence-Based Amounts unless the Initial Borrower elects otherwise.

The pipeline cannot seal a UNIQUE candidate whose operative window is that sentence. Stage 1 structure builds nodes from parenthesized markers and runs each node’s owned span to the next marker. The sentence has no marker. The sealed candidate that describes the mechanic is `discovery-candidate:82f0f8f14f2426d932b513dc`, bound to subsection node `structural-node:4769fe34429021eab497c82b`, span `[387511, 393489)`, 5978 characters. The sentence is a suffix of that span, not the span. `RECLASSIFIABLE_TO` in the sealed Chewy discovery file is 0. A Chewy-only node for this sentence was refused.

The same owned-span pattern shows up, as corroboration only, on CONMED §7.2, CONMED §7.3, Chewy §6.01, and Chewy §6.08(h). None of those was promoted to a new identity.

This is a different note from draft pull request #108 (Lane 5 prose, no span seal). Lane B does not convert #108, or the packet hunt’s `NO_VALID_CANDIDATE`, into a sealable candidate.

## 5. Lane C — Gibraltar development, Knife River blind

| | |
|---|---|
| Agent | https://cursor.com/agents/bc-d5db4b48-705e-546a-a356-11c7118c07a3 |
| Branch | `cursor/gibraltar-dev-edgar-07a3` |
| Head | `34f72c97732a20a2c0e96e5282b5ae52465d924c` |
| Remote | **ON_REMOTE.** |
| Pull request | https://github.com/egsul897/headroom/pull/112 |
| PR state at check | **MERGED** at `7c079b49703702e028441d88c35070a8313c3828`. The development fixture and the lane note are on main. Not selected. Not a pin. Not `CERTIFIED`. |
| Record | `docs/p3-lane-c-gibraltar-dev-edgar-1acdff3.md` |
| Designation | Gibraltar = DEVELOPMENT. Knife River = BLIND. Arch+Cert OPTION B, recorded in the lane note as 2026-10-07T15:05:09Z. |

**Terminal:** development package retrieved. Pass A only. Not selected. Not pinned. Not certified.

EDGAR facts in the lane note:

| Field | Value |
|---|---|
| Issuer | Gibraltar Industries, Inc. (ROCK) |
| CIK | `0000912562` |
| Accession | `0001140361-26-003087` |
| Form / exhibit | 8-K, EX-10.1, filed 2026-02-02 |
| Instrument | ORIGINAL credit agreement dated as of February 2, 2026 |
| Body SHA-256 | `6dc23ab0e008b95b8bca4547cb485cef7f6269f698befbfbe02856098445f27a` |
| Fixture | `tests/fixtures/unseen-packages/gibraltar-2026-credit-agreement/` |

Pass A produced 946 deterministic candidates. Pass B, Pass C, and Pass D did not run. The lane note says `AI_GATEWAY_API_KEY` and `ANTHROPIC_API_KEY` were unset, and a synthetic Pass B was refused. No discoveryId was minted. Structural node ids in the fixture are compiler output. They are not discovery ids.

Three topics appeared and were **not** selected:

| Topic | Why it is not a cell |
|---|---|
| Builder basket | The HTML disagrees with itself: the definition cites §7.05(a)(y), the printed marker is `(vi)`, and the parenthetical says clause `(y)`. Compiler path `7.05(a)(4)(ii)(vi)(B)` matches neither citation. |
| §7.01 reclassification | Inside a 21,491-character section. Compiler path `7.01(b)(a)`. Page furniture in the window. |
| §7.04 Asset Dispositions | Real heading. Bare label 7.04 is ambiguous because the table of contents repeats it. Not a short unique window. |

Knife River’s body was not opened. The lane note says the tip had no Knife River record, the retrieval URL list has no Knife River, KNF, or MDU URL, and the Gibraltar fixture tree contains no “Knife River” string.

The packet hunt (#111) recorded Gibraltar as absent. #111 is still a draft and is not this tip. #112 later put the development fixture and the lane note on main. That fixture is DEVELOPMENT evidence. It is not selected, not a matrix cell, and not a pin. Knife River’s body is still not in the tree. Absence of a selected cell remains the tip fact. Presence of the development fixture is not a selection.

## 6. Lane D — CONMED §7.5(a) discrepancy

| | |
|---|---|
| Agent | https://cursor.com/agents/bc-431cc4fd-e703-5d52-b1ba-437a18fa8cfa |
| Branch | `cursor/p3-lane-d-conmed-7.5a-discrepancy-8cfa` |
| Head | `f382179954143139fb0e97d29a53064104e3af5a` |
| Remote | **ON_REMOTE.** Not local-only. |
| Pull request | https://github.com/egsul897/headroom/pull/116 |
| PR state at check | **MERGED** at `6df53b4f225adfbe40bbc765647f1b4c17a2b7c3`. Diff is the discrepancy note only (180 lines). Analysis. Not the honesty rem. Not a pin. Not `CERTIFIED`. |
| Record | `docs/p3-lane-d-conmed-7.5a-discrepancy-1acdff3.md` (on main) |

**Terminal in the lane record:** `GENERALIZED_REPRESENTATION_DEFECT`

The owner directive says “ADOPT” that terminal. The published note uses the terminal string and describes the licensed carry. It does not contain the word ADOPT.

Candidate `discovery-candidate:baca43714b8502cc9c596c23`, rule `ir-rule:b752bbaf461e4c3b704300d2`, section §7.5(a). Source text: the Disposition of obsolete or worn out property in the ordinary course of business. Operative sha256 in the note: `b5234392b81353005e573fd482a18db182ad460c0a2235fc77e9d240418014a0`.

What is wrong: the compiled permission is unlimited capacity, one condition, sufficiency `COMPLETE`. That condition’s excerpt is ordinary course. The object restriction (obsolete or worn out) is prose, not a gate. A sale of new equipment in the ordinary course satisfies the model and is outside the clause. Open material finding: `MISSING_CONDITION` `82ce660a63258d57f778551fb7ec2ded12514afb0e310b704a5b9ea70c14d784`. The open `MISSING_DEPENDENCY` on definition bodies is uncertain and is not this discrepancy. A missing pin folder is not this discrepancy.

Licensed carry, already in the contract the note cites, and not a new enum:

- Keep `UNLIMITED_CAPACITY`.
- Gate it with an `AND` of two non-executable tests: the object (“obsolete or worn out property”) and the manner (“in the ordinary course of business”).
- Each test is `UNSUPPORTED` (condition type and/or expression kind). Ordinary course is already `UNSUPPORTED`. The object test is a second `UNSUPPORTED`.
- Sufficiency becomes `PARTIAL`.
- No new condition-type name. No §7.5(a) special case.

**Pin path:** still `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`. No pin folder. Map certification on the earlier hunt remains `NOT_CERTIFIED`. Lane D does not clear that.

**Freeze and grant state — directive versus repo:**

The owner directive names all of the following: Architect invent-safe ALL Y; frozen id `PHASE-3-LANE-D-CONMED-7.5A-REPRESENTATION-HONESTY.FROZEN.*` with sha256 prefix `48670a2a`; CEO approval of the honesty rem; COO conditional grant ready once the draft pull request is open.

Checked against main at this tip: those Lane D freeze and grant strings are not in the merged discrepancy note. The hash was not recomputed. Merging #116 published the analysis. It did not publish a rem, a pin folder, or those grant files. This consolidator does not treat the directive’s sentence as a landed rem grant.

## 7. Lane E — holdout, “C7”, support review

| | |
|---|---|
| Agent | https://cursor.com/agents/bc-0f8b9bc7-e0c4-58f1-9a4b-b92120eaf249 |
| Branch | `cursor/p3-lane-e-metrics-f249` |
| Head | `9742cfa5f9509f96e772052ceceef1bf7caf07bf` |
| Remote | **ON_REMOTE.** |
| Pull request | https://github.com/egsul897/headroom/pull/113 |
| PR state at check | **MERGED** at `99a5a5fbd14e648a58d26434fd3d3c74815c4424`. The metrics note is on main. That merge is not a certification gate and does not finish step 2. |
| Record | `docs/p3-lane-e-metrics-from-tip-1acdff3.md` (on main) |

The freeze list this lane used is `acceptanceCriteria.beforeSemanticFreeze` in `docs/phase-3-reliability-stratified-certification/00-selection-contract.json`. That list does not contain a 95% holdout bar, a 90% V3 agreement bar, or a requirement that §7.5(j) `supportReviewRequired` be false. Step 2 (the stratified set) is still what the selection contract says unblocks step 3. Lane E does not score step 2.

| Folklore | Recomputed at this tip | Freeze input? |
|---|---|---|
| Holdout disposition stability | 82/91 = 0.9010989010989011. Fails its own ≥95% gate (G5). Nine shared items change label. | No. Do not keep step 3 blocked on it. |
| “C7 V3 agreement <90%” | The label `C7` does not name an agreement metric. **UNVERIFIED_CARRIED_FORWARD_CLAIM.** | No. |
| V3 shortfalls that do reproduce | Checklist item 2 surfacing inter-reviewer mean 0.7407 (FAIL). Item 3 evaluator-vs-consensus credit 42/47 = 0.8936 (FAIL). Item 4 evaluator-vs-consensus surfacing 24/36 = 0.6667 (FAIL). Item 7 sibling-claim protections PASS. | No. Do not lower the bars. |
| `supportReviewRequired` on frozen §7.5(j) | true. Numerator 2, denominator 12, fraction 0.1667. | Not a freeze input. It remains a per-candidate rule: `reviewItems > 0` keeps compilation off `COMPLETED`, which `certifyCandidate` records as `COMPILATION_NOT_COMPLETED`. |

Leaving these three items off the freeze list does not clear an unpinned stratum, a missing cross-cut, or any other `beforeSemanticFreeze` bullet.

## 8. Cross-lane matrix

Rows below are the cells these lanes touched. #112, #113, #114, #115, #116, #117, #118, and #119 are merged documents. The pin matrix file is the same as at `1acdff3`. `eligible` flags below were not flipped by those merges. None of those merges is `CERTIFIED`.

| Cell | Tip matrix / prior hunt | What the lanes added | Terminal now |
|---|---|---|---|
| `WITH_BUILDERS` Chewy `f62db8eb…` §6.01(b)(4)(a)(i) | `DEFERRED` / `PIN_HOLD`. Hunt: `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`. `eligible: false`. | Lane A discovery is on main (#114). #118 locks `FAIL_CLOSED_AMBIGUOUS`: stay `AMBIGUOUS_TARGET`. | Unchanged. No pin. Not `eligible: true`. Not `CERTIFIED`. |
| `WITH_BUILDERS` CONMED | Sealed population has 0 `BUILDER` roles (hunt). | No lane bound one. | `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`. |
| `WITH_RECLASSIFICATION` | Matrix `BLOCKED`. Hunt: `NO_VALID_CANDIDATE`. `RECLASSIFIABLE_TO` = 0. | Lane B HOLD note is on main (#115). #119 names `OPERATIVE_SUBWINDOW` and does not emit the window. The sentence exists and is not a sealed window. | HOLD `RECLASS_ARCHITECTURE_DECISION_REQUIRED`. Still not a candidate. Still no edge. |
| `ASSET_SALES` Chewy `b54ed7fe…` §6.05(a)(2)(c) | `PINNED_OFFLINE`, `eligible: false`. Hunt: certified path `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`. | Lane A: same two definitions, same `AMBIGUOUS_TARGET`. | Identity pin stands. Certified path still blocked. `PINNED_OFFLINE` is not `CERTIFIED`. |
| `ASSET_SALES` CONMED §7.5(a) `baca4371…` | Sealed row. No pin. Map `NOT_CERTIFIED`. `MATERIAL_DISCREPANCY`. | Lane D analysis is on main (#116). Object restriction is unmodeled. Licensed carry is a second `UNSUPPORTED` in an `AND`, sufficiency `PARTIAL`. | Analysis terminal `GENERALIZED_REPRESENTATION_DEFECT`. Not a rem. Pin path still `BLOCKED_BY_SPECIFIC_MISSING_EVIDENCE`. |
| Gibraltar builder / §7.01 reclass / §7.04 dispositions | Not a matrix row. Hunt #111 (still draft) recorded `NO_VALID_CANDIDATE` before the fixture landed. | Lane C: development evidence on main via #112. Not selected. | `DEVELOPMENT`. Not a matrix cell. Not `CERTIFIED`. |
| Knife River | No body at tip. | Lane C: body not opened. | Stays BLIND. |
| Holdout G5, “C7”, §7.5(j) support-review flag | Historical failures, often treated as freeze blockers. | Lane E: reproduced, and not on `beforeSemanticFreeze`. | Folklore. Do not block step 3 on them. Do not treat step 3 as unblocked. |

The other matrix rows (debt, liens, restricted payments, investments, financial covenants, and the WITHOUT_* cross-cuts) were not targets of this directive. Their tip status stays `PINNED_OFFLINE` or `BASELINE_PINNED`. That status is not `CERTIFIED`.

## 9. What is invent-safe to implement next

One named change, and only that change: the Lane D honesty rem on the existing CONMED §7.5(a) representation.

The shape is the one already written in the Lane D note. Carry “obsolete or worn out” as its own non-executable gate, conjoined with the ordinary-course gate that is already `UNSUPPORTED`. Set sufficiency to `PARTIAL`. Do not add an enum value. Do not special-case the section. Do not mint a pin. Do not set `eligible: true`.

The analysis is on main via #116. That commit is the note. It is not the rem. This consolidator does not start the rem.

The Architect freeze, CEO approval, and COO grant named in the original Lane D directive are not in the merged note. This consolidator does not describe the rem as granted.

Nothing in lanes A, B, C, or E is invent-safe to implement from this consolidator. Lane A’s merged ADR locks the refusal and does not grant a resolver change. Lane B’s merged note is a HOLD. #119 names the seal contract and does not authorize the seal. Lane C is an unselected development fixture on main via #112. Lane E says not to remediate the three folklore metrics in order to unblock the freeze.

## 10. What requires an Architect decision

**Lane A.** The selector question is closed on main by #118 as a refusal, not as a pick. `FAIL_CLOSED_AMBIGUOUS`: stay `AMBIGUOUS_TARGET`. Case-as-identity, dropping a nested proviso, counting an alias once, later-declaration-wins, and both-bodies-operative stay absent. Both Chewy cells stay `eligible: false`. The ADR does not grant a resolver implement.

**Lane B.** The HOLD note is on main via #115. #119, merged at the live tip, names `OPERATIVE_SUBWINDOW` (requirements 1–6) and defers D2. That file says naming is not an emit and does not authorize production seal code. The category-to-category question is still open: whether an automatic reclassification can be represented by anything other than `IRRuleDependency` (`relationshipType`, `targetRuleId`, `description`). A Chewy-only span is not an acceptable answer. The merged name is not a seal. Implementation stays HOLD.

## 11. What remains evidence-blocked

Pins and the certified path are unchanged.

- Builder pin: Chewy `discovery-candidate:f62db8ebcda9d35c4fc03b2a` is unique and role-`BUILDER`, and `eligible: false` because the definition evidence is unresolved. No other sealed row is a sentence-bound builder with an empty blocker list.
- Reclass pin: no sealed sentence identity, no edge, architecture HOLD on the only sentence that was isolated.
- Asset-sale certified path: Chewy §6.05(a)(2)(c) stays `eligible: false` for the same definitions. `assetSalesEligibleForCertifiedPath` on the tip matrix is false.
- CONMED §7.5(a) pin: still no eligibility packet and no pin folder. The representation note does not fill that gap.
- Gibraltar: development signals were recorded and not selected. No discoveryId, so there is nothing to pin.
- Knife River: blind. No body.
- Live `CERTIFIED`: `certifyCandidate` still requires an empty blocker list. No lane produced that packet.

## 12. Formal percentage

**Retired.** The sentence that called Phase 3 “about 25%” is not a board figure and is not a field in `01-pin-matrix.json`. Track E retires it: `docs/phase-3-reliability-stratified-certification/TRACK-E-SCOREBOARD-HONESTY-62a40be.md`. Recount at tip `62a40be22b9598d9732e9ce2574d86d2228d6270`: 12 matrix rows, status `CERTIFIED` on **0**. That count is not a completion percentage. This report does not publish one.

Historical carried prose, no longer standing: Phase 3 remains BLOCKED_BY_EVIDENCE, about 25%, CERTIFIED 0/12.

What this tip shows:

- `docs/phase-3-reliability-stratified-certification/01-pin-matrix.json` is byte-unchanged from `1acdff3`. Its status remains `OFFLINE_PIN_MATRIX_PARTIAL`.
- The matrix has 12 rows: 6 strata and 6 cross-cuts. The number of those rows whose status is `CERTIFIED` is **0**. That count was taken on the `1acdff3` matrix and the file has not changed.
- Several rows are `PINNED_OFFLINE` or `BASELINE_PINNED`, including rows with `eligible: true`. Those are not `CERTIFIED`.
- The “about 25%” sentence above is retired carried prose. It is not a status value in `01-pin-matrix.json`. The matrix status remains `OFFLINE_PIN_MATRIX_PARTIAL`. This report does not turn that prose into a certification gate. Live disposition of draft #110 is in the Track E note.
- The live tip merge (#119) names the Lane B seal contract. It is not an emit. #117 is this consolidator. #112 is the Gibraltar development fixture. #115 is the Lane B HOLD note. #116 is the Lane D analysis. #118 is the fail-closed ADR. #114 and #113 are the discovery and metrics notes. None of those commits is a certification gate.

No certification gate has landed. The carried percentage is retired. The counted board is **CERTIFIED 0/12**.

## 13. Pull request state

Checked 2026-10-07T15:42:14Z. Merged docs are not `CERTIFIED`. Draft is not merged. Live disposition of #104–#111 after that clock is in the Track E note. The table below is the 15:42 snapshot.

| PR | State | What it is |
|---|---|---|
| #119 | **MERGED** `7683a146…` | Lane B `OPERATIVE_SUBWINDOW` name (Arch D1). Current main tip. Not an emit. Not a seal. |
| #117 | **MERGED** `ad9b6e72…` | This consolidator, first landed naming tip `65be893f…`. This rebind corrects that banner. |
| #116 | **MERGED** `6df53b4f…` | Lane D discrepancy analysis. Not a rem. |
| #115 | **MERGED** `65be893f…` | Lane B HOLD note. Not the current main tip. Not a seal. |
| #114 | **MERGED** `b44c3dc6…` | Lane A definition-identity discovery |
| #113 | **MERGED** `99a5a5fb…` | Lane E metrics |
| #118 | **MERGED** `d9c4cb64…` | Lane A `FAIL_CLOSED_AMBIGUOUS` ADR. LOCK ≠ GRANT. |
| #112 | **MERGED** `7c079b49…` | Lane C Gibraltar DEVELOPMENT fixture and lane note. On main. Not selected. Not `CERTIFIED`. |
| #111 | Draft | Discover-only packet hunt: builders, reclass, asset sales |
| #110 | Draft | Discover-only weak-cell holds |
| #109 | Draft | Fresh-blind package prep, blocked |
| #108 | Draft | Lane 5 reclass prose, no span seal, no edge |
| #107 | Draft | Lane 7 ranked blind debt-package hunt |
| #106 | Draft | WB1 Agent B semantic/legal discovery, builder pin HOLD |
| #105 | Draft | WS2 reclass semantic spans, discover only |
| #104 | Draft | WS2 reclass lexical seeds, zero edges |

## 14. Stop

No further generic hunters. Do not fetch another issuer to unstick builders, reclass, or asset sales. Do not open Knife River. Do not select the Gibraltar signals. Do not mint a pin. Do not invent a discoveryId. Do not raise the formal percentage.

Next actions, and only these:

1. **Architect.** Lane A’s refusal is on main (#118): stay `AMBIGUOUS_TARGET`. Lane B’s HOLD is on main (#115). #119 names `OPERATIVE_SUBWINDOW` and does not emit a window. The category-to-category representation question (D2) was later locked fail-closed by #122 at `62a40be22b9598d9732e9ce2574d86d2228d6270`. That lock is not an emit and not `CERTIFIED`. The sentence “D2 is still open” described the #119 tip, not `62a40be`. The merged name is not an answer, and the later lock is not an implement.
2. **COO.** The only named implementation candidate is the Lane D honesty rem. The analysis is already merged (#116). A rem grant file was not in that merge. This report is not that grant.
3. **Implementer.** Do not start from this consolidator. Do not treat #116 as the rem. If the Lane D rem is later authorized, the shape is section 9. No new enum, no pin, no `eligible: true`.

Step 3 of the roadmap stays behind step 2. Lane E removed three false freeze blockers. It did not finish the stratified set.
