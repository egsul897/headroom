# ADR: OPERATIVE_SUBWINDOW seal

**Status:** ACCEPTED (COO formal grant; docs-only architecture lock)
**Date:** 2026-10-07
**Base:** main @ `65be893f10ad4033afca43ba591074c05a49dd87` (#115). Lane B census was taken at `1acdff345fff655f602fd61ff20c395028b6f140`. This lock was rebound from that starting tip through #113 (`99a5a5fbd14e648a58d26434fd3d3c74815c4424`), #114 (`b44c3dc699d59a803e6fedcdd2c412b72dbef75a`), #118 (`d9c4cb64414cf00612a2d10e0205c66c7eec1bfa`), #116 (`6df53b4f225adfbe40bbc765647f1b4c17a2b7c3`), onto #115. Those merges are docs-only. The compiler lines cited below are unchanged. The sentence hash was re-read on the pre-#118 tree and the fixture is untouched by #113, #114, #118, #116, and #115.
**Arch decision:** D1 only. Name the generalized seal contract `OPERATIVE_SUBWINDOW` (requirements 1–6 below).
**Deferred:** D2. Whether a category-to-category automatic reclassification is representable by anything other than `IRRuleDependency` is not decided here.
**Does not authorize:** production seal code; a Stage-1 marker; a `discoveryId`; a `stage2b` edit; a structural node; a pin or pin folder; a `RECLASSIFIABLE_TO` edge; a Phase-3 percentage raise; a `CERTIFIED` claim
**Related:**
- Lane B record `docs/p3-lane-b-reclass-sealability-1acdff3.md` on this tip (landed in #115, `461f24b9924b2766f12acfbb7ef69be97b70435e`). Verdict: HOLD, `RECLASS_ARCHITECTURE_DECISION_REQUIRED`.
- `lib/contract-model/compiler/candidate-span.ts` `resolveOperativeSource`
- `lib/contract-model/compiler/stage-structure.ts` rank-stack owned span
- `lib/contract-model/compiler/clause-hierarchy.ts` `MARKER_OCCURRENCE`
- `lib/contract-model/compiler/discovery/pass-c-neighborhood.ts` `runPassCNeighborhoodExpansion`
- `scripts/stratified-cert/lib/emit-pin-packet.ts` pin UNIQUE comment
- `lib/contract-model/ir/types.ts` `IRRuleDependency` (D2 context only; not decided)
- Grant FROZEN sha256 `eb5c6aabf9632755ced189683be6fb021f47e873b6f6bc39fb6a36ff0c33b84a` (recorded MATCH). Invent-safe ALL Y. CEO APPROVE on record. This is the naming-lock digest. It is not the C1 implement preimage.
- C1 seal-primitive grant body `docs/architecture/PHASE-3-TRACK-C1-SEAL.FROZEN.md`. sha256 of those bytes is `35907db264d8b6201189d315ee1a282e0dca008023b953652d39f71862005f4d` (MATCH verifiable by `sha256sum` on that path). Distinct from the naming-lock digest above. This citation does not amend requirements 1–6 and does not certify. **IMPLEMENTED ≠ CERTIFIED.** **Seal ≠ CERTIFIED.**

This ADR names the D1 seal contract. It does not emit a window, mint an identity, or choose an IR edge. Soft gate. Invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

---

## 1. Context

Lane B isolated one Chewy sentence and stopped. The sentence is a real automatic reclassification from Fixed Amounts into Incurrence-Based Amounts. The existing pipeline cannot seal a UNIQUE candidate whose operative window is that sentence. Termination on the Lane B record is `RECLASS_ARCHITECTURE_DECISION_REQUIRED`.

That record leaves two decisions, and only two:

1. Whether an unenumerated sentence can be a sealed operative window under a generalized rule.
2. Whether a category-to-category automatic reclassification is representable by anything other than `IRRuleDependency { relationshipType, targetRuleId, description }`.

Arch D1 answers (1) by naming `OPERATIVE_SUBWINDOW`. Decision (2) is D2 and stays deferred. A Chewy-only span is not an answer to either question.

---

## 2. Evidence at this tip

### 2.1 The sentence is not the sealed window

Document: `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt`.

| Fact | Value on this tip |
| --- | --- |
| Span | half-open `[392815, 393488)` |
| Length | 673 characters |
| SHA-256 | `78b081e801e06744fd6e665164b5b0801857a621de0f041eb6d5b21abeb4c83e` |
| Ends on | the period of `Pro Forma Basis.` |
| Next character `393488` | newline |
| `§1.08(g)` | starts at `393489` (`(g)`) |
| Marker inside the span | none |

Sealed candidate `discovery-candidate:82f0f8f14f2426d932b513dc` in `tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json` binds `structural-node:4769fe34429021eab497c82b` only, `normalizedSourceRef` `1.08(f)`, role `DESIGNATION_RULE`, `discoveryMethods` `SEMANTIC_CLASSIFICATION`, `evidenceSignals` `[]`, `multipleRulesLikely` `false`, `valueAnchors` `[]`, `sourceCitation` `(f) `, `reviewStatus` `NEEDS_REVIEW`. No `verifiedQuoteFingerprint` on that object. Its description talks about the reclassification. The description is not the window.

Sealed node (`tests/fixtures/unseen-packages/phase-3-validation-chwy-run/stage1-all-nodes.json`): `doc-a::1.08(f)`, `SUBSECTION`, `[387511, 393489)`, 5978 characters. The 673-character sentence is a suffix of that span.

`RECLASSIFIABLE_TO` occurrences in that stage2b file: 0.

### 2.2 Why the current unit rule cannot seal the sentence

| Site | Rule on this tip |
| --- | --- |
| `resolveOperativeSource` (`candidate-span.ts` L33–39) | With no resolved operative-state replacement, operative text is `getNodeText(anchor, "DESCENDANTS")`. |
| Rank stack (`stage-structure.ts` L1027–1028) | A node's owned span closes at the next node of equal or shallower rank. A deeper rank nests and does not close the opener. |
| `MARKER_OCCURRENCE` (`clause-hierarchy.ts` L121) | A clause node is a parenthesized sequence marker. The comma-space lookbehind (L107–115) drops a marker written `, (ii)`. |
| Pass C (`pass-c-neighborhood.ts` L149–156) | Anchor is a uniquely resolved structural node, else the section node. The comment states this path does not fabricate a node reference. |
| Pin UNIQUE (`emit-pin-packet.ts` L57, L218) | UNIQUE is `sectionRef` single occurrence (`sameRef.length === 1`), not a clean operative window. Dirty-span facts record that the span was not narrowed. |

`1.08(f)` occurs twice in that stage2b file (the reclass candidate and `discovery-candidate:501eb9d39a0af643dc5dc8ec`, role `BUILDER`). One structural node carries that ref. Pin `singleOccurrence` is therefore false. Node uniqueness is not a sentence window.

Pass B described the mechanic. Pass C bound the description to the subsection. Neither step isolates `[392815, 393488)`.

### 2.3 Corroboration stays corroboration

Lane B recorded the same owned-span pattern on CONMED §7.2, CONMED §7.3, Chewy §6.01, and Chewy §6.08, and refused to promote those passages to identities. This ADR does not reopen them and does not treat them as the same mechanic as the §1.08(f) sentence. The §1.08(f) sentence is automatic unless the Initial Borrower elects otherwise. Those passages are sole-discretion classification among enumerated baskets. They show the window problem. They are not granted identities here.

---

## 3. Decision

**Name `OPERATIVE_SUBWINDOW`.** An unenumerated sentence may be a sealed operative window under one generalized rule. The six requirements below are that rule. They are Arch D1. No seventh requirement is added.

### Requirements 1–6

1. **The window is the sentence span.** Operative text for an `OPERATIVE_SUBWINDOW` is the sentence's own half-open character span in the extracted document. For the recorded Chewy sentence that span is `[392815, 393488)`. The enclosing marker's descendant text (`[387511, 393489)` on `1.08(f)`) is the container. It is not this window.

2. **The window is source bytes.** The span's extracted text is the window. A Pass B `description`, a `sourceCitation` prefix (`(f) ` on the sealed candidate), and a `distinguishingQuote` / `verifiedQuoteFingerprint` do not define the window. Pin dirty-span diagnostics do not narrow it.

3. **No Stage-1 marker.** The subwindow is not a node `buildClauseTree` or the rank-stack owned span emits. This contract does not add a parenthesized marker, a hanging-paragraph label, or a comma-list repair so Stage 1 will emit the sentence. "In addition" is not a label.

4. **The container node stays.** `structural-node:4769fe34429021eab497c82b` remains the structural container for `1.08(f)`. The subwindow does not replace that node, does not split the structural index, and does not change the pin rule that UNIQUE is `sectionRef` single occurrence.

5. **One generalized class.** The same six requirements apply to every unenumerated sentence that sits inside a marker-owned span and has no marker of its own. A Chewy-only span, a hand-assigned node, or a hand-assigned `discoveryId` for `[392815, 393488)` is refused. Corroboration passages are evidence of the class. This ADR does not promote them to identities.

6. **Naming is not an emit.** This contract does not mint a `discoveryId`, does not edit sealed `stage2b`, does not manufacture a structural node, and does not mint a pin. A discovery rerun is not a way to emit the window. The pipeline on this tip still cannot produce a UNIQUE candidate whose operative window is the sentence. Implementation stays HOLD until a later grant.

### D2 deferred

Lane B did not issue a representation. This ADR does not issue one.

`IRRuleDependency` on this tip is `relationshipType`, `targetRuleId`, `description`, and optional `inventoryItemIds` (`lib/contract-model/ir/types.ts` L693–699). Phase 4C records that a `RECLASSIFIABLE_TO` edge carries no amount, no effective date, and no direction constraint, and that execution never auto-elects (`docs/phase-4c/08-reclassification-model.json`). The sentence names the categories "Fixed Amounts" and "the applicable Incurrence-Based Amounts", not a rule id. Mapping those categories onto basket rules would invent targets. This ADR does not map them, does not fill SOURCE / DEST / TRIGGER / TIMING / CONDITIONS / CAPACITY / RESTORE / ANTI-DUP / AUTO_OR_ELECTIVE / PROSPECTIVE_OR_RETRO as IR fields, and does not write a `RECLASSIFIABLE_TO` edge.

### Honesty bindings

- Fail closed. Invent-absence forever.
- **IMPLEMENTED ≠ CERTIFIED.** A green soft-gate run is not certification credit. This docs lock is not a Phase-3 percentage raise. Formal Phase-3 percentage stays where the board left it.
- **PINNED_OFFLINE ≠ CERTIFIED.**
- No live/paid cert. No related-series A/C. No NS-4 Slice 3.

---

## 4. Consequences

**Positive:** The window question has a name and six requirements. A later implementer cannot treat a Chewy-only node, a quote, a description, or a Stage-1 marker as already authorized by the Lane B HOLD.

**Negative:** No candidate on this tip has the sentence as its operative window. `RECLASSIFIABLE_TO` remains 0 in the sealed Chewy discovery file. D2 remains open, so the sentence still has no IR identity.

**Forbidden:** Treating this ADR as a grant to implement the seal, to mint a pin, to invent a marker, or to invent a reclassification edge.

---

## 5. Out of scope

- Production seal code, including any edit to `candidate-span.ts`, `stage-structure.ts`, `clause-hierarchy.ts`, or Pass C
- Stage-1 marker invention, hanging-paragraph labels, and comma-list repair
- `discoveryId` mint, `stage2b` edits, and manufactured structural nodes
- Pin folders and `01-pin-matrix.json`
- D2: `RECLASSIFIABLE_TO`, `targetRuleId`, and category-to-basket mapping
- Promoting CONMED §7.2, CONMED §7.3, Chewy §6.01, or Chewy §6.08 to identities
- Phase-3 percentage, live/paid cert, NS-4, related-series A/C

---

## 6. Acceptance

- This file is the architecture lock at `docs/architecture/OPERATIVE-SUBWINDOW-SEAL-ADR.md` with Status **ACCEPTED** under the COO formal grant.
- Base tip is `65be893f10ad4033afca43ba591074c05a49dd87`.
- Decision is Arch D1 only: the seal contract is `OPERATIVE_SUBWINDOW`, requirements 1–6 in §3.
- D2 is deferred. No `RECLASSIFIABLE_TO` edge is specified.
- Docs only. No production seal. No pin. **IMPLEMENTED ≠ CERTIFIED.**
