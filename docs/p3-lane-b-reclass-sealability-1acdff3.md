# P3 Lane B — reclass sealability at `1acdff3`

Soft gate only. **IMPLEMENTED ≠ CERTIFIED.** invent-absence forever. Discovery and analysis only. No `discoveryId` was minted. No `RECLASSIFIABLE_TO` edge was written. No structural node was manufactured. `stage2b` was not edited. No implementation until an Architect contract.

Tip: `1acdff345fff655f602fd61ff20c395028b6f140`.

## Verdict

**HOLD.**

**Termination: `RECLASS_ARCHITECTURE_DECISION_REQUIRED`.**

The Chewy §1.08(f) reclass sentence is a real mechanic in the source. The existing discovery pipeline cannot legitimately produce a UNIQUE sealed candidate whose operative window is that sentence. The block is the generalized unit rule (marker node, owned span to the next marker, operative text = that span). It is not a Chewy-only defect, and a Chewy-only node would be a special case. That special case is refused.

Rejected terminations:

| Code | Why rejected |
|---|---|
| `RECLASS_IDENTITY_READY_EXISTING_IR` | No sealed sentence identity, so B2 does not issue an identity. Phase-3 `IRRuleDependency` also does not carry the sentence's stated mechanics. |
| `RECLASS_IDENTITY_READY_IR_GAP` | IR-gap is reachable only after a sealed sentence identity exists. Sealability failed first. |
| `RECLASS_SOURCE_EXISTS_NO_SEALED_IDENTITY` | The source mechanic exists and no sentence identity is sealed, but this is not a missed emit the current pipeline can repair by rerunning. The sealed population already contains a candidate that describes the mechanic and binds a broader node. |
| `NO_VALID_RECLASS_MECHANIC` | The sentence does state an automatic reclassification from Fixed Amounts into Incurrence-Based Amounts. |

## Primary text

Document: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt`.

Span: half-open `[392815, 393488)`, 673 characters. The span ends on the period of "Pro Forma Basis." The next character (`393488`) is a newline. `§1.08(g)` starts at `393489`.

SHA-256 of those 673 characters: `78b081e801e06744fd6e665164b5b0801857a621de0f041eb6d5b21abeb4c83e`.

> In addition, any Indebtedness (and associated Liens, subject to the applicable priorities required pursuant to the applicable Incurrence-Based Amounts), Investments, liquidations, dissolutions, mergers, consolidations, Restricted Payments or any prepayments of Indebtedness (or, in each case, any portion thereof) incurred or otherwise effected in reliance on Fixed Amounts shall be automatically and immediately reclassified at any time, unless the Initial Borrower otherwise elects from time to time, as incurred under the applicable Incurrence-Based Amounts if the Borrowers subsequently meets the applicable ratio for such Incurrence-Based Amounts on a Pro Forma Basis.

The span contains no parenthesized clause marker and no page footer. The word "reclassified" occurs once.

## Near sealed candidate — not the sentence

`discovery-candidate:82f0f8f14f2426d932b513dc` is in the sealed Chewy stage2b population (`tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json`).

| Field | Sealed value |
|---|---|
| `normalizedSourceRef` | `1.08(f)` |
| `structuralNodeIds` | `structural-node:4769fe34429021eab497c82b` only |
| `role` | `DESIGNATION_RULE` |
| `discoveryMethods` | `SEMANTIC_CLASSIFICATION` only |
| `evidenceSignals` | `[]` |
| `multipleRulesLikely` | `false` |
| `valueAnchors` | `[]` |
| `verifiedQuoteFingerprint` | absent |
| `sourceCitation` | `(f) ` |
| `reviewStatus` | `NEEDS_REVIEW` |
| description | automatic reclassification of amounts originally under Fixed Amounts into Incurrence-Based Amounts |

That node is `doc-a::1.08(f)`, `SUBSECTION`, `[387511, 393489)`, **5978** characters. `resolveOperativeSource` (`lib/contract-model/compiler/candidate-span.ts`) returns `getNodeText(anchor, "DESCENDANTS")`, which is that full span. The 673-character sentence is a suffix of it. The candidate's description is not its operative window.

`sourceCitation` is `(f) ` because Pass C stores the first 300 characters of the anchor's **OWN** text (`pass-c-neighborhood.ts`), and the first child `1.08(f)(i)` starts at `387515`.

A second sealed candidate shares the same node and the same ref:

- `discovery-candidate:501eb9d39a0af643dc5dc8ec`, role `BUILDER`, description is the Incremental Facility ordering sentence (Ratio Incremental Amount first), not the reclass sentence.

`normalizedSourceRef` `1.08(f)` occurs **twice** in stage2b. The structural index has one node with that ref, so `resolveUniqueNodeByRef` would be `UNIQUE` for the **node**. Pin `singleOccurrence` (`emit-pin-packet.ts`) is `sameRef.length === 1`, which is false here. The pin comment states that UNIQUE is sectionRef single occurrence, not a clean operative window, and that a dirty span is not narrowed.

`RECLASSIFIABLE_TO` occurrences in that stage2b file: **0**.

## B1 — sealability

**No.** The existing pipeline cannot legitimately produce a UNIQUE sealed candidate whose operative window is `[392815, 393488)`.

### 1. Node membership

No sealed node, and no node the current tip's `buildClauseTree` emits, has `charStart == 392815` or a span equal to the sentence.

Sealed index (`tests/fixtures/unseen-packages/phase-3-validation-chwy-run/stage1-all-nodes.json`). Every node that contains the sentence:

| sectionRef | nodeId suffix | span | length | contains sentence |
|---|---|---|---|---|
| `1.08(f)` | `4769fe34429021eab497c82b` | `[387511, 393489)` | 5978 | yes — sealed anchor |
| `1.08(f)(i)` | `b9f8d8181baa476ee5fd1d5f` | `[387515, 393489)` | 5974 | yes |
| `1.08(f)(i)(i)(B)(A)(B)` | `42bf031c5fbe7821f4d8f94d` | `[389977, 393489)` | 3512 | yes — deepest sealed container |

Current tip `buildClauseTree` on the §1.08 region (`lib/contract-model/compiler/clause-hierarchy.ts`, called the way `stage-structure.ts` calls it) still emits nothing at `392815`. Deepest live container is `1.08(f)(i)(i)(B)(B)` at `[389977, 393489)`. The live tree drops the inline reference `clause (A)` at `388989`, which the sealed index had accepted as a structural marker. That difference changes nesting labels. It does not create a sentence node.

### 2. Why no sentence emit

Pass C anchors a candidate only to a structural node that `resolveRelativeRef` resolves uniquely. An unresolved relative ref falls back to the section node. The comment in `pass-c-neighborhood.ts` states that this path does not fabricate a node. `distinguishingQuote` is a fingerprint input to `discoveryId` (prompt asks for under 200 characters; storage slices at 240). It does not replace operative text. The sealed reclass candidate has no verified quote.

`candidate-span.ts` is the operative-source rule. For a base document with no resolved operative-state replacement, the window is the anchor node's descendant span. There is no sentence slicer on that path. Pin dirty-span diagnostics (`PDF_PAGE_FOOTER_EMBEDDED`, `MULTIPLE_RULES_LIKELY`) record that the span was not narrowed. The §1.08(f) window contains the page line `-84-`. The 673-character sentence does not.

Pass B did describe the mechanic. That description was sealed onto the subsection. Description text is not a window.

### 3. Coarse index

Yes. Clause nodes are parenthesized sequence markers (`MARKER_OCCURRENCE` in `clause-hierarchy.ts`). Owned `charEnd` is the next node whose rank is less than or equal, else the enclosing region end (`stage-structure.ts` rank stack). The last marker accepted inside §1.08(f) does not close before the reclass sentence, so the sentence, the incremental-facility ordering sentence, the cash-netting proviso, and the remainder of the "(B)" / "(y)" election text share one span. The sealed discovery anchor is coarser than that deepest clause: the whole subsection.

Inside the sealed `(f)` span, `(ii)` at `389287` is written `, (ii)`. The marker regex's comma-space lookbehind drops it before the tree runs. That limitation is documented on `findRawMarkerOccurrences` as a generalized comma-separated-list limitation. `(iii)` at `391035` survives the inline-reference filter and is then rejected by the sequence rule, because the open roman level is still waiting for `(ii)`. Repairing that sequence would attach the unenumerated reclass sentence to the last accepted clause's `charEnd`. It would not emit a node whose span is the sentence. A hanging paragraph only reattaches the next **label**; "In addition" is not a label, and the text immediately before it is not a blank-line break that would create a node.

### 4. Which stage fails

**Stage 1 structure** (`buildClauseTree` plus owned-span). That stage never produces a node whose span is the sentence, so later stages have nothing legitimate to bind.

| Stage | What it did |
|---|---|
| Stage 1 structure | Failed to isolate the sentence. This is the failing stage. |
| Pass A | No deterministic-signal record for `structural-node:4769fe34429021eab497c82b` (sealed supersession reason). |
| Pass B | Described the reclass mechanic and the ordering mechanic as separate roles. |
| Pass C | Bound both to `1.08(f)`. Did not narrow the window. |
| Pass D | Reconciles candidates. It does not split a node into a sentence. |
| `candidate-span` / pin | Operative window = descendant span. Explicitly does not narrow. |

### 5. Generalized rule?

Yes, the block is general:

1. A structural node is a sequence marker, not a sentence.
2. `charEnd` runs to the next accepted marker.
3. A discovery anchor is one of those nodes.
4. The operative window is that node's descendant text.

An unenumerated trailing sentence cannot become a sealed operative window under those four rules. `distinguishingQuote` does not add a fifth rule that narrows the window.

### 6. Chewy-specific?

No. The same four rules are what bind the corroborating paragraphs below to a section or to a neighboring clause. A hand-assigned node, a hand-assigned `discoveryId`, or a Chewy-only span exception for `[392815, 393488)` would be a special case. **HOLD.**

## B2 — representation

Not issued. Sealability failed, so this lane does not derive a sealed identity and does not fill `SOURCE` / `DEST` / `TRIGGER` / `TIMING` / `CONDITIONS` / `CAPACITY` / `RESTORE` / `ANTI-DUP` / `AUTO_OR_ELECTIVE` / `PROSPECTIVE_OR_RETRO` as IR fields.

Phase-3 comparison, as a gap statement rather than an assignment:

`IRRuleDependency` is `relationshipType`, `targetRuleId`, `description`, plus optional `inventoryItemIds` (`lib/contract-model/ir/types.ts`). Phase 4C records that this edge carries no amount, no effective date, and no direction constraint, and that execution never auto-elects (`docs/phase-4c/08-reclassification-model.json`; `lib/contract-model/runtime/capacity/types.ts`). The sentence's endpoints are the defined categories "Fixed Amounts" and "the applicable Incurrence-Based Amounts", not a single rule id. Those category terms are defined earlier in the same subsection. Mapping them onto basket rules would invent targets. This lane does not do that. `RECLASSIFIABLE_TO` count on the sealed Chewy discovery population remains 0.

What the 673 characters state, recorded so `NO_VALID_RECLASS_MECHANIC` is not available, and not promoted to an identity:

| Slot | Stated in the sentence | Not stated |
|---|---|---|
| SOURCE | reliance on Fixed Amounts | a section number or a rule id |
| DEST | the applicable Incurrence-Based Amounts | a section number or a rule id |
| TRIGGER | the Borrowers subsequently meet the applicable ratio for those Incurrence-Based Amounts | — |
| TIMING | automatically and immediately; at any time | an effective date, a test period, or a deadline |
| CONDITIONS | on a Pro Forma Basis; associated Liens subject to the applicable priorities required pursuant to the applicable Incurrence-Based Amounts | — |
| CAPACITY | any portion thereof | a dollar cap, a percentage, or a formula |
| RESTORE | — | no restoration mechanic in the sentence |
| ANTI-DUP | — | no anti-duplication clause in the sentence |
| AUTO_OR_ELECTIVE | shall be automatically reclassified, unless the Initial Borrower otherwise elects from time to time | — |
| PROSPECTIVE_OR_RETRO | — | the sentence reclassifies items already incurred or otherwise effected under Fixed Amounts when the ratio is subsequently met; it does not say the original incurrence date is rewritten, and it does not say only future incurrences are covered. No prospective/retro label is assigned. |

Objects named in the sentence: Indebtedness and associated Liens, Investments, liquidations, dissolutions, mergers, consolidations, Restricted Payments, and prepayments of Indebtedness.

## B3 — corroboration only

These passages show the same sealability pattern. None of them is promoted to a section-wide identity, and none of them is treated as the same mechanic as the §1.08(f) sentence. The §1.08(f) sentence is automatic unless the Initial Borrower elects otherwise. The passages below are sole-discretion classification among enumerated baskets.

### CONMED §7.2

Sealed candidate `discovery-candidate:c76edbc49663c57628ed3cee`, role `OTHER_RELEVANT_RULE`, `normalizedSourceRef` `7.2`, anchor `conmed-doc-a-eighth-ar-credit-agreement::7.2`.

Section node span `[47792, 56635)`, **8843** characters. `sourceCitation` is the section heading ("SECTION 7.2 Limitation on Indebtedness."), not the trailing classification paragraph. The last sealed clause `7.2(s)(i)` is `[54567, 56635)` and runs to the section end, so the trailing "For purposes of determining compliance with this Section 7.2 … classify or reclassify" paragraph sits inside that clause's owned span. `RECLASSIFIABLE_TO` count in `phase-2f-stage2-discovery-candidates.json`: **0**.

### CONMED §7.3

Sealed candidate `discovery-candidate:9fda59c688efd0a4baac658f`, role `DESIGNATION_RULE`, `normalizedSourceRef` `7.3`.

Section node span `[56635, 63688)`, **7053** characters. `sourceCitation` is the section heading. Separately, `discovery-candidate:d743c01b399ff5f9bd439df9` on `7.3(p)` has a `sourceCitation` that already continues from the `(p)` escrow sentence into "For purposes of determining compliance with". That is owned-span absorption of the trailing classification paragraph into the preceding clause, plus a section-level designation candidate. Neither window is the paragraph.

### Chewy §6.01

Sealed candidate `discovery-candidate:e93fc56312525fd9ac9bfd04`, role `DESIGNATION_RULE`, anchor `structural-node:4feea9391572c23efd068db4`, `doc-a::6.01`, span `[608901, 642524)`, **33623** characters. `sourceCitation` is the section heading.

The classification sentence begins at `636063` ("For purposes of determining compliance with this Section 6.01") and the "(1) … allocate, classify and reclassify" clause runs to `637338`, where "(2)" starts a different measurement sentence. Smallest sealed container of that text is `6.01(d)(2)(ii)(ii)(ii)(b)` at `[633606, 642524)`, **8918** characters. Several other candidates share `6.01`. Not a sentence identity.

### Chewy §6.08

Sealed candidate `discovery-candidate:e8467da748d59de764b93705`, role `DESIGNATION_RULE`, anchor `structural-node:8b6cc54c39d1cf390ea4fe2f`, `doc-a::6.08(h)`, span `[669505, 669729)`.

The classification paragraph is `[696782, 697512)` (788 characters), inside section `6.08` `[659042, 697571)` and inside `6.08(i)(iii)(II)` `[693852, 697571)`. **`6.08(h)` does not contain it.** The candidate's `sourceCitation` is the `(h)` sale-and-leaseback sentence. Its description talks about reclassification. The operative window is a different clause. This is the same failure mode as §1.08(f), one step further: the description and the window have come apart. Section `6.08` is not an identity for that paragraph.

## What this lane does not authorize

- A rerun of discovery treated as if it could emit the sentence window.
- A new `discoveryId`, a new structural node, or an edit to stage2b.
- A `RECLASSIFIABLE_TO` edge, a `targetRuleId`, or a mapping from Fixed Amounts / Incurrence-Based Amounts onto basket rules.
- A Chewy-only span exception.
- Certification credit. A written HOLD is not a certified reclass identity.

Architect contract, if any, has to decide two separate things this lane does not decide: whether an unenumerated sentence can be a sealed operative window under a generalized rule, and whether a category-to-category automatic reclassification is representable by anything other than `IRRuleDependency { relationshipType, targetRuleId, description }`. Until that contract exists, implementation stays HOLD.
