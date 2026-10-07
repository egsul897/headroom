# P3 Lane A — definition identity at tip `1acdff3`

**Status:** discovery / architecture analysis only. No production code. Soft gate. Invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.**

**Tip:** `1acdff345fff655f602fd61ff20c395028b6f140`

**Verdict:** `DEFINITION_IDENTITY_REQUIRES_ARCHITECTURE_DECISION`

This lane does not select a Chewy definition. It does not set `eligible: true`.

## Scope

Known blocked cells, replayed through `pinCandidate` on this tip (package `chwy-2026-credit-agreement`, `asOfDate` `2026-10-06`):

| Cell | discoveryId | sectionRef | role | operative chars | eligible | eligibilityBlockers |
| --- | --- | --- | --- | --- | --- | --- |
| BUILDER | `discovery-candidate:f62db8ebcda9d35c4fc03b2a` | `6.01(b)(4)(a)(i)` | `BUILDER` | 285 | `false` | `UNRESOLVED_OPERATIVE_EVIDENCE` |
| ASSET_SALES | `discovery-candidate:b54ed7fe4f8f7bb7c224d99b` | `6.05(a)(2)(c)` | `BASKET` | 857 | `false` | `UNRESOLVED_OPERATIVE_EVIDENCE` |

No other discoveryId was created. The BUILDER cell has no pin folder. The ASSET_SALES pin folder stays as already sealed, `eligible: false`.

Both bundles’ only non-current items are the same two definition dependencies. Context-item ids match across the two cells. Retrieval depth differs. The reason string matches `resolveOperativeDefinitionEvidence`’s no-amendment branch.

| normalizedRef | context item | BUILDER depth | ASSET_SALES depth | evidence |
| --- | --- | --- | --- | --- |
| `Subsidiary` | `context-item:cf103904c4db39198a1df5c96371e827e1e08e49a92a36434865653392f44440` | 5 | 4 | `AMBIGUOUS_TARGET`, `isCurrentTruth: false` |
| `Uniform Commercial Code` | `context-item:8ecf1273c334183560e1c91bb3a048033dbd232877cf8e440f0b1d5e9ead3577` | 5 | 5 | `AMBIGUOUS_TARGET`, `isCurrentTruth: false` |

Shared reason shape: `term "<term>" matches 2 distinct physical definitions in document "doc-a", and it has no recorded amendment history to disambiguate it`.

Both bundles also record stop reasons `CONTEXT_BUDGET_EXCEEDED` for `maxDefinitionDepth (5)`, `maxTextBudgetChars`, and `maxCrossReferenceDepth (3)`. Those stop reasons are not entries in `eligibilityBlockers`. The emitter’s eligibility contract is `eligible === (eligibilityBlockers.length === 0)`.

## How the occurrences were enumerated

The offline pin path builds the Chewy structural index from the extracted credit agreement (`scripts/f7a-lib.ts` `buildChewy` → `detectStructuralDefinitions` → `buildStructuralIndex`). `resolveUniqueDefinitionByRef` keeps every `DetectedDefinition` in `doc-a` whose `normalizedTerm` equals `normalizeDefinedTermRef(term)` (`whitespace-collapse + trim + lowercase`). Cardinality `2+` is `AMBIGUOUS`. The `nested` flag is not an input to that filter.

A whole-document scan with the same means-declaration grammar (`"…" means|shall mean|shall have the meaning|has the meaning`) returned the same four match anchors the index kept for these two normalized terms. The HTML filing (`raw-html/doc-a-2026-06-23-credit-agreement.htm`, manifest `sourceOfTruth`) contains the same two `subsidiary`/`Subsidiary` means-entries and the same two `Uniform Commercial Code` shall-mean sites. No third means-declaration of either normalized term is in the extracted text or the HTML.

`DetectedDefinition` has no effective-date field. Full-text spans below are the per-occurrence slice `getDefinitionFullText` uses: from that occurrence’s `charStart` to the next **non-nested** definition’s `charStart`. Hashes are SHA-256 over the exact UTF-8 slice.

## Package facts used for version, amendment, supersession, exhibit

| Fact | Value |
| --- | --- |
| documentId | `doc-a` |
| Index source file | `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` |
| Extracted chars / SHA-256 | `864362` / `f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb` (matches `extraction-manifest.json`) |
| HTML source file | `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/raw-html/doc-a-2026-06-23-credit-agreement.htm` |
| HTML SHA-256 | `5fbd8c90046305871d3f93e78bf5726ae77a0004eef93183d43a887befa9c4af` |
| Preamble labels | `EX-10.1`, `Exhibit 10.1`, `EXECUTION VERSION`, `CREDIT AGREEMENT dated as of June 23, 2026` |
| Manifest filing | Form `8-K`, exhibit `EX-10.1`, filed `2026-06-24`, accession `0001193125-26-281042` |
| Package graph | 1 classification: `doc-a` `CREDIT_AGREEMENT` (`DETERMINISTIC_TITLE_PATTERN`). 1 instrument: `instrument:doc-a`, `baseDocumentId` `doc-a`. Relationship candidates: `0`. |
| Operative state | `OPERATIVE_STATE_RESOLVED`, provisions `0`, amendment effects `0`, unattached effects `0`. Fixture frozen `2026-09-03`. |
| Exhibit / schedule / annex structural nodes | `0` |

`ARTICLE I` (`DEFINITIONS`, chars `8957–402937`) contains `SECTION 1.01` (`Defined Terms`, chars `8980–362503`). Every occurrence below has its `charStart` inside that Section 1.01 span.

The index’s leaf `sectionRef` on these occurrences is the enclosing clause node from `findEnclosingNode`, not a definition-entry heading. Those deep nodes have empty headings. Their opening text is a numbered parenthetical inside other Section 1.01 prose (`(51) undetermined or inchoate Liens…`, `(c) the Secured Swap Obligations…`, `(b) make other conforming changes…`, `(i) a Saturday…`). The titled structural containers are Article I and Section 1.01. `resolveUniqueDefinitionByRef` does not read `sectionRef`.

## A1 — physical definition occurrences

### A1.1 `Subsidiary` — normalized term `subsidiary` — 2 occurrences

`resolveUniqueDefinitionByRef(index, "doc-a", "Subsidiary")` → `AMBIGUOUS`, `candidateCount: 2`.

Query `UCC` is a different normalized key and is `NOT_FOUND`. The alias token `UCC` is not its own `DetectedDefinition`.

#### Occurrence S1

| Field | Value |
| --- | --- |
| documentId | `doc-a` |
| source file | `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` |
| exactTerm | `subsidiary` |
| normalizedTerm | `subsidiary` |
| declarationKind | `MEANS` |
| nested | `false` |
| forwardingTarget | none |
| sectionRef (enclosing node) | `1.01(51)(c)(a)(4)(b)(b)` |
| nodeType | `SUBCLAUSE` |
| sourceNodeId | `structural-node:cd324d3e7484f2374b985be6` |
| structural parent | `structural-node:1c26649fe28b5e49963bbf5a` `CLAUSE` `1.01(51)(c)` (empty heading) |
| ancestor chain | `ARTICLE I` `DEFINITIONS` `8957–402937` → `SECTION 1.01` `Defined Terms` `8980–362503` → `SUBSECTION 1.01(51)` `287513–362503` → `CLAUSE 1.01(51)(c)` `324822–362503` → enclosing subclause `332815–347240` |
| declaration charStart / charEnd | `339816` / `339836` |
| declaration text | `“ subsidiary ” means` |
| declaration SHA-256 | `48ebd3430ee827769469c44b984b7fe20e10693c2554325298492f35b58efac7` |
| full-text charStart / charEnd | `339816` / `341757` |
| full-text chars | `1941` |
| full-text SHA-256 | `f3b8e353bea7693e59265657131cf245c711a6afcd4900f0efcc5a2a3e13cb68` |
| version / amendment authority | Base document `doc-a` only. No `AmendmentEffectCandidate`. No `OperativeProvisionView`. No per-occurrence effective date. Instrument preamble date: `dated as of June 23, 2026`. Preamble version label: `EXECUTION VERSION`. |
| supersession | No supersession record. The no-amendment `AMBIGUOUS` branch returns before `getNodeSupersessionStatus`. |
| operative? | Not designated current. Bundle item `isCurrentTruth: false`. |
| historical / exhibit? | Inside Section 1.01. Not an exhibit node. Not `HISTORICAL_ONLY`. |

Exact full text (index slice `339816:341757`):

```
“ subsidiary ” means, with respect to any Person:

(1) any corporation, association, or other business entity (other than a partnership, joint venture, limited liability company or similar entity) of which more
than 50% of the total voting power of shares of Capital Stock entitled (without regard to the occurrence of any contingency) to vote in the election of directors, managers or trustees thereof is at the time of determination owned, directly or
indirectly, by such Person or one or more of the other Subsidiaries of that Person or a combination thereof; and
(2) any partnership, joint venture,
limited liability company or similar entity of which:
(x) more than 50% of the capital accounts, distribution rights, total equity and voting interests or
general or limited partnership interests, as applicable, are owned, directly or indirectly, by such Person or one or more of the other Subsidiaries of that Person or a combination thereof whether in the form of membership, general, special or
limited partnership or otherwise; and
(y) such Person or any Restricted Subsidiary of such Person is a controlling general partner or otherwise controls
such entity; and
(3) at the Initial Borrower’s election (except to the extent otherwise included in clause (1) or (2) of this definition), any
partnership, joint venture, limited liability company or similar entity of which such Person or any Restricted Subsidiary of such Person is a controlling general partner or otherwise controls such entity; and

(4) at the Initial Borrower’s election (except to the extent otherwise included in clause (1) or (2) of this definition), any entity the accounts
of which would be consolidated with those of such Person in such Person’s consolidated financial statements if such financial statements were prepared in accordance with GAAP.

Unless the context otherwise requires, any references to subsidiaries refer to a subsidiary of the Borrowers.

```

#### Occurrence S2

| Field | Value |
| --- | --- |
| documentId | `doc-a` |
| source file | same extracted file as S1 |
| exactTerm | `Subsidiary` |
| normalizedTerm | `subsidiary` |
| declarationKind | `MEANS` |
| nested | `false` |
| forwardingTarget | none |
| sectionRef (enclosing node) | `1.01(51)(c)(a)(4)(b)(b)` |
| nodeType | `SUBCLAUSE` |
| sourceNodeId | `structural-node:cd324d3e7484f2374b985be6` (same node as S1) |
| structural parent | same parent as S1 |
| ancestor chain | same chain as S1 |
| declaration charStart / charEnd | `341757` / `341777` |
| declaration text | `“ Subsidiary ” means` |
| declaration SHA-256 | `b5b7f140e0516c6fd1dfef4191fff5993b05adfe986118ceed3f0c495fc49aca` |
| full-text charStart / charEnd | `341757` / `341818` |
| full-text chars | `61` |
| full-text SHA-256 | `bb7c4e9a0308e0bbcd0865f7c1fdd8cd8ea9bb8c02c28ced79714fba97ff3bfc` |
| version / amendment authority | Same as S1. S2 is the next base-document declaration in Section 1.01. It is not an amendment effect. |
| supersession | Same as S1. Sharing `sourceNodeId` with S1 means a future node-level supersession record would name that node once; no such record exists now. |
| operative? | Not designated current. |
| historical / exhibit? | Inside Section 1.01. The slice includes the extraction page marker `-74-` before the next definition (`Subsidiary Loan Party` at `341818`). That marker is not a second document and not an exhibit node. |

Exact full text (index slice `341757:341818`):

```
“ Subsidiary ” means any subsidiary of the Borrowers.

-74-

```

#### S1 vs S2

| Question | Result |
| --- | --- |
| Identical? | Different. Declaration hashes differ. Full-text hashes differ. `exactTerm` case differs (`subsidiary` vs `Subsidiary`). Bodies differ. |
| Same normalized key? | Yes. `normalizeDefinedTermRef` lowercases both to `subsidiary`. |
| Supersession between them? | None recorded. |
| Both operative? | The resolver does not mark either current. `DefinitionEvidenceStatus` has no dual-operative value. Outcome is `AMBIGUOUS`, text withheld. |
| One historical or an exhibit? | Neither. Both are base-document declarations inside Section 1.01. |

### A1.2 `Uniform Commercial Code` — normalized term `uniform commercial code` — 2 occurrences

`resolveUniqueDefinitionByRef(index, "doc-a", "Uniform Commercial Code")` → `AMBIGUOUS`, `candidateCount: 2`.

The means-grammar match captures the second quoted alternative in `“ UCC ” or “ Uniform Commercial Code ” shall mean`. `isNestedDeclaration` then sees the preceding `or` inside the same sentence, so both rows are `nested: true`. The entry anchors below are the start of that alias pattern. The index `charStart` is the detector match, 11 characters later on U1 and 9 characters later on U2.

#### Occurrence U1

| Field | Value |
| --- | --- |
| documentId | `doc-a` |
| source file | same extracted file as S1 |
| exactTerm | `Uniform Commercial Code` |
| normalizedTerm | `uniform commercial code` |
| declarationKind | `MEANS` |
| nested | `true` |
| forwardingTarget | none |
| alias-entry charStart | `354380` (`“ UCC ” or “ Uniform Commercial Code ” shall mean`) |
| sectionRef (enclosing node) | `1.01(51)(c)(b)(i)` |
| nodeType | `SUBCLAUSE` |
| sourceNodeId | `structural-node:1dcffe6b25b9551c7a1ca3c5` |
| structural parent | `structural-node:1c26649fe28b5e49963bbf5a` `CLAUSE` `1.01(51)(c)` (empty heading; same clause node id as the Subsidiary parent) |
| ancestor chain | `ARTICLE I` `8957–402937` → `SECTION 1.01` `8980–362503` → `SUBSECTION 1.01(51)` `287513–362503` → `CLAUSE 1.01(51)(c)` `324822–362503` → enclosing subclause `353913–355870` (opening text: `(i) a Saturday, (ii) a Sunday…`) |
| declaration charStart / charEnd | `354391` / `354429` |
| declaration text | `“ Uniform Commercial Code ” shall mean` |
| declaration SHA-256 | `bdd7f34728a823b625d323a88897fbe9132edf58ac485314ba700d9a146ca8e8` |
| full-text charStart / charEnd | `354391` / `355168` (next non-nested definition is `UK Financial Institution` at `355168`) |
| full-text chars | `777` |
| full-text SHA-256 | `f086bd238b67884d6df8ee9cda5bc42d5c474d15e378ec09f5f137f41e1bda34` |
| version / amendment authority | Same base-document facts as S1. No amendment effect. No per-occurrence effective date. |
| supersession | None recorded. `AMBIGUOUS` returns before the supersession check. |
| operative? | Not designated current. |
| historical / exhibit? | Inside Section 1.01. Not an exhibit node. Not `HISTORICAL_ONLY`. Preceded by the forwarding definition `U.S. Tax Compliance Certificate` (`354277`) and the page marker `-77-`. |

Exact full text (index slice `354391:355168`):

```
“ Uniform Commercial Code ” shall mean the Uniform Commercial Code as in
effect from time to time in the State of New York; provided , however , that, at any time, if by reason of mandatory provisions of law, any or all of the perfection or priority of the Collateral Agent’s security interest in any
item or portion of the Collateral is governed by the Uniform Commercial Code (or equivalent legislation) as in effect in a jurisdiction other than the State of New York, the term “UCC” or “Uniform Commercial Code” shall mean
the Uniform Commercial Code (or equivalent legislation) as in effect, at such time, in such other jurisdiction for purposes of the provisions hereof relating to such perfection or priority and for purposes of definitions relating to such provisions.

```

#### Occurrence U2

| Field | Value |
| --- | --- |
| documentId | `doc-a` |
| source file | same extracted file as S1 |
| exactTerm | `Uniform Commercial Code` |
| normalizedTerm | `uniform commercial code` |
| declarationKind | `MEANS` |
| nested | `true` |
| forwardingTarget | none |
| alias-entry charStart | `354871` (`“UCC” or “Uniform Commercial Code” shall mean`) |
| sectionRef (enclosing node) | `1.01(51)(c)(b)(i)` |
| nodeType | `SUBCLAUSE` |
| sourceNodeId | `structural-node:1dcffe6b25b9551c7a1ca3c5` (same node as U1) |
| structural parent | same parent as U1 |
| ancestor chain | same chain as U1 |
| declaration charStart / charEnd | `354880` / `354916` |
| declaration text | `“Uniform Commercial Code” shall mean` |
| declaration SHA-256 | `2977470997ff9d3ebea7e40270bcd521194354358303944516c7280ece83a5d5` |
| full-text charStart / charEnd | `354880` / `355168` |
| full-text chars | `288` |
| full-text SHA-256 | `c9c5494a61a2c745f98b8d87bc25c09ebc2d8ab07d67d4258ee678043d6251d3` |
| version / amendment authority | Same as U1. U2’s declaration sits inside U1’s full-text slice. |
| supersession | Same as U1. |
| operative? | Not designated current. |
| historical / exhibit? | Inside Section 1.01 and inside U1’s sentence. Not an exhibit. Not `HISTORICAL_ONLY`. |

Exact full text (index slice `354880:355168`):

```
“Uniform Commercial Code” shall mean
the Uniform Commercial Code (or equivalent legislation) as in effect, at such time, in such other jurisdiction for purposes of the provisions hereof relating to such perfection or priority and for purposes of definitions relating to such provisions.

```

#### U1 vs U2

| Question | Result |
| --- | --- |
| Identical? | Different. Declaration hashes differ (internal spacing of the quoted term differs). Full-text hashes differ. U2’s full-text bytes are a suffix of U1’s full-text bytes. |
| Same normalized key? | Yes. Both lowercase to `uniform commercial code`. |
| Supersession between them? | None recorded. |
| Both operative? | The resolver does not mark either current. Outcome is `AMBIGUOUS`, text withheld. |
| One historical or an exhibit? | Neither. |

### A1.3 Terms that share a substring and are different keys

These are `DetectedDefinition` rows whose normalized term contains `subsidiary` or `uniform commercial` and is not the two keys above. They are not candidates for the `AMBIGUOUS_TARGET` on `Subsidiary` or `Uniform Commercial Code`. Listed so the census is closed.

| exactTerm | normalizedTerm | charStart | declarationKind | nested |
| --- | --- | --- | --- | --- |
| Converted Restricted Subsidiary | `converted restricted subsidiary` | `121495` | `FORWARDING` | false |
| Converted Unrestricted Subsidiary | `converted unrestricted subsidiary` | `121614` | `FORWARDING` | false |
| Domestic Subsidiary | `domestic subsidiary` | `143040` | `MEANS` | false |
| Excluded Subsidiary | `excluded subsidiary` | `172916` | `MEANS` | false |
| Foreign Subsidiary | `foreign subsidiary` | `185990` | `MEANS` | false |
| Immaterial Subsidiary | `immaterial subsidiary` | `195637` | `MEANS` | false |
| Material Subsidiary | `material subsidiary` | `227151` | `MEANS` | false |
| Non-Loan Party Subsidiary | `non-loan party subsidiary` | `235352` | `MEANS` | false |
| Qualified Restricted Subsidiary | `qualified restricted subsidiary` | `301640` | `MEANS` | false |
| Receivables Subsidiary | `receivables subsidiary` | `307326` | `MEANS` | false |
| Restricted Subsidiary | `restricted subsidiary` | `319023` | `MEANS` | false |
| Significant Subsidiary | `significant subsidiary` | `329190` | `MEANS` | false |
| Subsidiary Loan Party | `subsidiary loan party` | `341818` | `MEANS` | false |
| Unrestricted Subsidiary | `unrestricted subsidiary` | `355835` | `MEANS` | false |
| wholly owned subsidiary | `wholly owned subsidiary` | `360729` | `MEANS` | false |

Index definition count for `doc-a`: `486`.

## A2 — precedence contract already in the architecture

Conceptual only. This is the composition of functions that already exist. It is not an implementation and it is not a new rule.

```
resolveDefinedTerm(index, operativeState, supersessionIndex, term, searchDocumentIds):
  // operativeState is already as-of filtered. Date order is not re-decided here.
  view = operativeState.provisions
        .find(p => p.kind == "DEFINITION"
                && normalizeDefinedTermRef(p.definedTermRef) == normalizeDefinedTermRef(term))
  if view exists:
     // Branch 1 of resolveOperativeDefinitionEvidence. Always disclose. Never pick.
     if view.targetResolutionStatus == "AMBIGUOUS":
        return FOUND, AMBIGUOUS_TARGET, text null, isCurrentTruth false
     if view.targetResolutionStatus == "NOT_FOUND":
        return FOUND, HISTORICAL_ONLY, text = view.attemptedText, isCurrentTruth false
     if view.status in {OPERATIVE_STATE_CONFLICTED, OPERATIVE_STATE_REVIEW_REQUIRED}:
        return FOUND, OPERATIVE_STATE_UNRESOLVED, isCurrentTruth false
     if view.status == OPERATIVE_STATE_PARTIAL:
        return FOUND, PARTIAL_AMENDMENT, isCurrentTruth false
     return FOUND, CURRENT, text = view.currentText, isCurrentTruth true
  else:
     // Branch 2. No recorded amendment activity for this normalized term.
     for docId in searchDocumentIds:   // caller-scoped; home document first
        matches = allDefinitions where documentId == docId
                  and normalizedTerm == normalizeDefinedTermRef(term)
        if matches.length >= 2:
           return AMBIGUOUS, AMBIGUOUS_TARGET, candidateCount = matches.length
           // nested is ignored
           // exactTerm case is ignored
           // full-text equality is ignored
           // char order is ignored
           // supersession index is not consulted
        if matches.length == 1:
           text = full span from match.charStart to the next non-nested definition
           if supersessionIndex says match.sourceNodeId is KNOWN_SUPERSEDED:
              return FOUND, KNOWN_SUPERSEDED, isCurrentTruth false
           return FOUND, CURRENT, isCurrentTruth true
     return NOT_FOUND
```

What that contract is made of, in the order the code already applies:

1. **Identity key.** `normalizeDefinedTermRef` in `lib/contract-model/compiler/amendment/chain.ts`: collapse whitespace, trim, lowercase. The same lowercase key is used by IR definition identity (`lib/contract-model/ir/identity.ts`), defined-term persistence `stableKey` (`lib/contract-model/compiler/persistence.ts`), and covenant-map joins. Grammatical-number variants are named and refused (`findDefinedTermVariant`); they are not served under the queried name.

2. **As-of amendment chain, only when effects exist.** `buildProvisionChain` orders dated effects by `effectiveDate`, never by amendment number. Two effects with the same effective date on the same provision are `AMENDMENT_CONFLICT`; `currentText` is withheld; `candidateTexts` are sorted by `effectId`, and the code states that ingestion order is not precedence. Undated effects are `AMENDMENT_SEQUENCE_UNRESOLVED` and sit at the end of the chain. An effect applies only when `effectiveDate.date !== null` and `date <= asOfDate` (`buildProvisionView`). `currentText` is also withheld when the base target is not `UNIQUE` or the resolved node fails structural-health ERROR diagnostics, even if an effect carries `newText`.

3. **Document restatement graph.** `computeOperativeDocument` designates one operative document only for a single un-superseded end of a `RESTATE_AGREEMENT` chain. A fork, a cycle, or an unresolved target is `REVIEW_REQUIRED` with no operative document. Zero restatement effects yield `NOT_APPLICABLE`.

4. **Chewy inputs to those rules.** Package graph: one credit agreement, zero relationship candidates. Operative state: zero provisions, zero effects. `getOperativeDefinition` returns null. Branch 1 does not run. Branch 2 sees two matches and returns `AMBIGUOUS_TARGET`.

5. **Index lookup is a different function.** `StructuralIndex.getDefinition` is `.find()` — the earliest `charStart` in that document. Comments on `resolveUniqueDefinitionByRef` and on `getDefinition` in `semantic/tools.ts` call that first-match the collision bug the uniqueness primitive exists to stop. The operative path does not use it once cardinality is `2+`. `getDefinition` the tool refuses the `AMBIGUOUS` outcome and serves no text.

6. **`nested` is a span rule, not a precedence rule.** `structural-definitions.ts` says a nested declaration is indexed for lookup, does not end the enclosing definition’s span, and does not become its own planner unit. `getDefinitionFullText` skips `nested` rows only when choosing the **next** boundary. `resolveUniqueDefinitionByRef` still counts them.

7. **Promotion conflict rule, not on this pin path.** `lib/onboarding/promotion.ts` groups defined terms by `documentId + termName`. Identical `sectionRef`/`fullText` corroborates. Different text is `CONFLICTING_DEFINED_TERMS` and is not promoted. The comment states there is no last-write winner. The Chewy offline pin does not go through that promoter. Prisma `DefinedTerm` uniqueness is `(documentId, termName)` on the stored string. That store is not the resolver for these bundles.

8. **Legacy document supersession is a separate system.** Phase 2G’s own report records `Document.supersedesDocumentId` / `effectiveFrom` / `effectiveTo` on the covenant engine as untouched by the amendment module. `loadChewy` does not consult it.

9. **North Star and source authority.** North Star v2 makes the debt documents, through operative state and the certified rulebook, the source of what the contract requires, and it withholds guessing. The sealed source-authority work (`semantic-accountability.v8`) binds quantitative evidence to retrieved spans. Neither document states a case-sensitive definition identity, a nested-proviso collapse, or a later-declaration-wins rule.

10. **Structural identity ADR.** Physical occurrence identity is `nodeId` (document + type + char position). A shared `sectionRef` does not merge occurrences. That principle keeps S1 and S2, and U1 and U2, as separate declarations even when they share a `sourceNodeId`. It does not choose which declaration’s text is the term.

Applied to this package, the contract’s result for both queried terms is Branch 2 `AMBIGUOUS_TARGET`, candidate count 2, no text, no supersession comparison, no operative designation.

The architecture contains no selector among these absent choices: case as part of identity; a nested proviso `shall mean` excluded from cardinality; an `“A” or “B” shall mean` alias counted once from the first quote; later text in the same section superseding earlier text; both bodies jointly operative; equal text collapsed (the bodies here are unequal anyway).

## A3 — termination

`DEFINITION_IDENTITY_REQUIRES_ARCHITECTURE_DECISION`

The occurrences are enumerated. The texts differ. The package has one document, zero amendment effects, zero supersession records, and zero exhibit nodes. The existing resolver’s answer is `AMBIGUOUS_TARGET` because two `DetectedDefinition` rows share a lowercased key and no amendment view exists. That refusal is implemented. A rule that decides which physical text is the operative definition, or that a proviso or a case pair is one definition, is not in the amendment chain, the document graph, the source-authority seal, the North Star, or the structural-identity ADR.

Analytic impact on the two cells, under the contract above, with no new rule and no manual pick:

- BUILDER `discovery-candidate:f62db8ebcda9d35c4fc03b2a` stays `eligible: false` with blocker `UNRESOLVED_OPERATIVE_EVIDENCE`, because `Subsidiary` and `Uniform Commercial Code` stay `AMBIGUOUS_TARGET`.
- ASSET_SALES `discovery-candidate:b54ed7fe4f8f7bb7c224d99b` stays `eligible: false` with the same blocker and the same two items.

This lane does not change those flags.
