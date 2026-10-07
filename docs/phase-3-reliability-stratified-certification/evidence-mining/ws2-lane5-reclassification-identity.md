# WS2 Lane 5 — reclassification identity analyst

Tip `3f1182511758c85ffc92023b06a46114820e69fe`. Discover only. No production code. No minted discovery id. No minted `RECLASSIFIABLE_TO` or `REDESIGNATES_TO` edge.

Soft gate. Invent-absence forever. **IMPLEMENTED ≠ CERTIFIED.** **PINNED_OFFLINE ≠ CERTIFIED.** `reviewStatus: AUTO_ACCEPTED` is not span identity and is not certification. A `NON_MATERIAL` downgrade is not an edge.

## Verdict

| Bucket | Candidates |
|---|---|
| SOURCE EXISTS but NO SEALED IDENTITY | B1 Chewy §1.08(f) sentence, B2 CONMED §7.2(B), B3 Chewy §6.08 closing, B4 Chewy §6.01(1), B5 CONMED §7.3(B). Also Pass A rows A1, A2, A3, and the later §1.08(f)(ii) (y)→(x) election (R4). |
| NO SOURCE MECHANIC | Pass A rows R1, R2, R3, R5, R6, R7, and N1–N12, for the question “an amount already using one permission is later treated as using another.” |
| SOURCE+IDENTITY but REPRESENTATION EDGE MISSING | None. |

`RECLASSIFIABLE_TO` edges proposed: **0**. Discovery ids minted: **0**.

Bounded implementation residual: **none**. The generalized IR already stores a reclassification right only as `IRRuleDependency { relationshipType, targetRuleId, description }`. No candidate supplies two sealed rule ids. Choosing a fan-out, a hub, or a family-name endpoint is an architectural choice. **HOLD.**

Section-wide prose is a source sentence. It is not an edge. A description match on a coarser node is not a sealed identity of the sentence.

## Inputs

Analyzed, not re-searched:

| Pass | Record | Commit |
|---|---|---|
| A lexical (#104) | `docs/phase-3-reliability-stratified-certification/ws2-with-reclassification-lexical-agent-a.md` | `f3cf9ebb580eda89e4eb6e0697536a4ec83afb18` |
| B semantic (#105) | `docs/phase-3-reliability-stratified-certification/evidence-mining/ws2-with-reclassification-agent-b-semantic.json` | `34042dd9d7bce2f99dd9aef1ff25b7c4f3347fbe` |

Re-read on this tip, without a new variant search: the sealed discovery rows the two passes cite; Chewy `unit-6.08.json` finding `d040cc39bc75feb31918694cff828bbc6025e78c569713504bc285f417038401`; CONMED map rows for `c76edbc49663c57628ed3cee` and `9fda59c688efd0a4baac658f`; the five Pass B spans against source text.

Span check. Chewy extracted text sha256 `f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb` (864362 chars). CONMED joined text (definitions excerpt, two newlines, Article VII) sha256 `d4659601000fae07d5050167ecffb0d9da91708a57111c59dff0db40fb86540c` (94258 chars). Each Pass B bounded span reproduces its recorded sha256.

Pass A’s window for the §1.08(f) automatic sentence starts at 392590. Pass B’s grant sentence is the tighter span `[392815, 393488)`. This report uses the tighter span. The bytes before 392815 are the separate ordering sentence.

## Identity gate

A sealed identity of the grant is an already-existing discovery candidate where all of the following hold:

1. `sourceCitation` contains the operative classify / reclassify sentence.
2. The structural node equals that sentence (`nodeEqualsBoundedSpan`).
3. The role is that sentence. A second sealed role on the same node, or a tighter node sealed as a different mechanic, is a different identity.

A matching `description` on a section node, a four-character citation `(f)`, a heading-only citation, or a shared `doc-a::1.01` opening fails the gate. `AUTO_ACCEPTED` does not cure the failure.

The third bucket requires a grant that passes this gate and a missing `RECLASSIFIABLE_TO` between two rule ids the text already names. No ranked candidate passes the gate, so the third bucket stays empty.

## Ranked candidates

### B1 — Chewy §1.08(f) `[392815, 393488)` — SOURCE EXISTS but NO SEALED IDENTITY

Best candidate in Pass B. One occurrence. 673 chars. sha256 `78b081e801e06744fd6e665164b5b0801857a621de0f041eb6d5b21abeb4c83e`.

The sentence says an item incurred in reliance on Fixed Amounts is automatically and immediately reclassified at any time as incurred under the applicable Incurrence-Based Amounts if the Borrowers subsequently meet the applicable ratio on a Pro Forma Basis, unless the Initial Borrower otherwise elects from time to time. It names Indebtedness, associated Liens, Investments, liquidations, dissolutions, mergers, consolidations, Restricted Payments, and prepayments, and any portion of those.

Container on the same subsection, failing the gate:

| Field | `discovery-candidate:82f0f8f14f2426d932b513dc` |
|---|---|
| Role | `DESIGNATION_RULE` |
| Ref | `1.08(f)` |
| Node | `doc-a::1.08(f)` |
| Citation | `(f) ` (4 characters). It does not contain “reclassified”. |
| Review | `NEEDS_REVIEW`. Confidence 0.6. `multipleRulesLikely` false. Supersession `UNKNOWN_SUPERSESSION_STATUS`. |
| Description | Matches the automatic sentence. |
| Span | Pass B: node contains the sentence, node is 5978 chars, node does not equal the sentence. |

Same node also seals `discovery-candidate:501eb9d39a0af643dc5dc8ec`, role `BUILDER`, description the incurrence-time ordering sentence (Ratio Incremental Amount first, balance under Fixed Incremental Amount, unless the borrower elects otherwise). Same four-character citation. That builder is a different mechanic.

No Chewy file exists under `docs/canonical-covenant-map/maps/`. No pin of this discovery id. Existing Chewy pins of §1.08(d)(i), §1.08(d)(ii), and §1.08(g) are other subsections.

### B2 — CONMED §7.2(B) `[55967, 56634)` — SOURCE EXISTS but NO SEALED IDENTITY

Joined-text span. 667 chars. sha256 `faadbc0faf861b2236420cea28b103de013fc9d3e6930e6cd62a30a8da6496db`. One occurrence.

Clause (B): if an item of Indebtedness meets one or more categories in Sections 7.2(a) through (s), the Parent Borrower shall, in its sole discretion, classify or reclassify, or later divide, classify or reclassify, that item in any manner that complies with Section 7.2, include it in one of those clauses, and treat it as incurred or existing pursuant to only one of such clauses.

Container, failing the gate:

| Field | `discovery-candidate:c76edbc49663c57628ed3cee` |
|---|---|
| Role | `OTHER_RELEVANT_RULE` |
| Ref | `7.2` |
| Node | `conmed-doc-a-eighth-ar-credit-agreement::7.2` |
| Citation | `SECTION 7.2 Limitation on Indebtedness.` plus the chapeau. It does not contain “classify or reclassify”. |
| Review | `AUTO_ACCEPTED`. Confidence 0.85. |
| Map | `outcome: UNSERVED`. `compilationStatus: null`. `certificationStatus: NOT_CERTIFIED`. Operative source 8843 chars (the section). Blocker `CERTIFICATION_NOT_PERFORMED`. |

The smallest structural node that contains clause (B) is `7.2(s)(i)`, sealed as `discovery-candidate:5b0cf887a4cf4a3b5caa1c81`, role `FINANCIAL_TEST`, citation the acquisition-debt pro forma test. That identity is the financial test. `discovery-candidate:19f36eb8514494897cd4a5b6` is the §7.2(d) finance-lease basket.

### B3 — Chewy §6.08 closing `[696782, 697570)` — SOURCE EXISTS but NO SEALED IDENTITY

788 chars. sha256 `1c0c7c368afc9fb9bdeabe0f2b5845a555cc9408ef294decc8ee36ee42271056`. One occurrence.

The Initial Borrower shall be entitled to classify or later reclassify a Restricted Payment or Investment among Sections 6.08(b)(1) through (25), Section 6.08(a), and exceptions in “Permitted Investments,” based on circumstances existing on the date of such reclassification, in a manner that otherwise complies with Section 6.08.

Mis-anchored candidate, failing the gate:

| Field | `discovery-candidate:e8467da748d59de764b93705` |
|---|---|
| Role | `DESIGNATION_RULE` |
| Ref | `6.08(h)` |
| Node | `doc-a::6.08(h)`, chars 669505–669729 |
| Citation | The sale-and-leaseback builder: “(h) 100% of the aggregate amount received in cash … sale and leaseback transaction”. It does not contain “reclassify”. The node does not contain the proved span. |
| Review | `AUTO_ACCEPTED`. Confidence 0.75. |
| Description | States the later-reclassification mechanic. The description and the citation are different sentences. |

`discovery-candidate:9b0565bc34f297cfc65cf938` is the §6.08 heading, role `GENERAL_PROHIBITION`, confidence 0.15, and its description says the operative text was not in the citation. Pass B: no discovery candidate has `structuralNodeKeys[0]` equal to the tightest node `doc-a::6.08(i)(iii)(II)`. That node is a parser container (3719 chars), not the 788-character sentence.

Chewy `unit-6.08.json` lists `e8467da7…` in the discovery input under ref `6.08(h)`. A search of compiled `sourceSectionRef` values found no `6.08(h)` rule. Open finding `d040cc39bc75feb31918694cff828bbc6025e78c569713504bc285f417038401` is `MISSING_RECLASSIFICATION`, severity `NON_MATERIAL`, `resolutionStatus: OPEN`, `proposedIrEvidence: "(absent from compiled IR)"`, `sourceCitation: "6.08"`, `sourceEvidence` an aggregate signal with no single excerpt. The downgrade leaves the absence in place.

### B4 — Chewy §6.01(1) `[636063, 637329)` — SOURCE EXISTS but NO SEALED IDENTITY

1266 chars. sha256 `828cc561953971d3a9e544e859d93c8c4337c4f65a74968ed89c5d0952410de7`. One occurrence.

Paragraph (1): if an item of Indebtedness, Disqualified Stock, or Preferred Stock meets more than one category in Sections 6.01(b)(1) through (33), or is entitled to be incurred pursuant to Section 6.01(a), the Initial Borrower, in its sole discretion, shall allocate, classify and reclassify it in any manner that complies with Section 6.01 and shall only be required to include the amount and type in one of the above clauses. Proviso (X) treats Effective Date facility debt as incurred under Section 6.01(b)(1)(X). Proviso (Y) treats Effective Date ABL debt as incurred under Section 6.01(b)(1)(Y). The adverbs “later” and “at any time” are absent. The verb “reclassify” is present.

Container, failing the gate:

| Field | `discovery-candidate:e93fc56312525fd9ac9bfd04` |
|---|---|
| Role | `DESIGNATION_RULE` |
| Ref | `6.01` |
| Node | `doc-a::6.01` |
| Citation | The section heading (113 characters). It does not contain “reclassify”. |
| Review | `AUTO_ACCEPTED`. Confidence 0.8. `multipleRulesLikely` true. Supersession `UNKNOWN_SUPERSESSION_STATUS`. |
| Span | Pass B: node contains the paragraph, node is 33623 chars, node does not equal the paragraph. |

No primary candidate on the tightest parser node `doc-a::6.01(d)(2)(ii)(ii)(ii)(b)` (8918 chars). No pin.

### B5 — CONMED §7.3(B) `[62975, 63687)` — SOURCE EXISTS but NO SEALED IDENTITY

712 chars. sha256 `75f32ba1879832ba0c6538b7585bc69107f798e7f2d000a2d5a02128f4fbf2df`. One occurrence.

Clause (B): a Lien securing Indebtedness that meets categories in Section 7.3(a) through (p) may be classified or reclassified, or later divided, classified, or reclassified, in the Parent Borrower’s sole discretion, in any manner that complies with the covenant, and counted in one of those clauses. Clause (B) cites “through (p)”. Limb (A) of the same closing cites “through (q)”. The curated lettered lien exceptions end at (p). This report does not pick (p) or (q).

Container, failing the gate:

| Field | `discovery-candidate:9fda59c688efd0a4baac658f` |
|---|---|
| Role | `DESIGNATION_RULE` |
| Ref | `7.3` |
| Node | section `7.3` |
| Citation | The §7.3 heading and chapeau. It does not contain “classify or reclassify”. |
| Description | Says “clauses (a) through (q)”, which follows limb (A). |
| Map | `outcome: UNSERVED`. `compilationStatus: null`. `certificationStatus: NOT_CERTIFIED`. Operative source 7053 chars. Blocker `CERTIFICATION_NOT_PERFORMED`. |

The structural index splits the closing on “through (q)” and creates `conmed-doc-a-eighth-ar-credit-agreement::7.3(q)` whose text begins “(q) but may be permitted”. Pass B: that node has zero sealed discovery candidates. `discovery-candidate:d743c01b399ff5f9bd439df9` is §7.3(p), role `EXCEPTION`, the acquisition-escrow lien. Its citation includes the start of the closing (“For purposes of determining compliance with”) and does not contain clause (B). The §7.3(m) pin `discovery-candidate:b5bb07b092f9863985f89812` is the general lien basket.

## Pass A rows Pass B left unranked

Classified from Pass A’s register and the sealed rows re-read on this tip. No new lexical search.

| Row | Source mechanic for this question | Sealed row | Bucket |
|---|---|---|---|
| A1 Asset Sale definition, extracted 34122–34687 | The Initial Borrower may divide and classify or reclassify a transaction as an Asset Sale and/or a Restricted Payment or Permitted Investment. | `58c0707a3ae002247a5319a3`, `DESIGNATION_RULE`, ref `1.01`, node `doc-a::1.01`. Citation is the opening of §1.01 through the ABL Administrative Agent definition. | SOURCE EXISTS but NO SEALED IDENTITY |
| A2 Permitted Liens definition, extracted 287986–289133 | Sole-discretion classify or reclassify among Permitted Lien categories. Limb (z) uses “classify” for clause (20). | `11126e5d9b3471382e895e99`, same shared `doc-a::1.01` citation. | SOURCE EXISTS but NO SEALED IDENTITY |
| A3 Chewy §5.18 closing | Sole-discretion classify or later reclassify a §5.18 transaction among the clauses of that section. | `027b4c423907d829595478fb`, `DESIGNATION_RULE`, citation the §5.18 heading. Sibling `eb95ad81afaff31d4df3648d` is the split-across-categories proviso. | SOURCE EXISTS but NO SEALED IDENTITY |
| R4 §1.08(f)(ii) later (y)→(x) election | A commitment tested under (y) may later be elected as incurred under (x) if it could then be incurred under (x). Separate from B1. | `0a8f0ee1944b13c6adb66710`, `PERMISSION`, ref `1.08`, citation the §1.08 heading, `multipleRulesLikely` true. Description is the fully-drawn versus draw-date election. Pass A: the later (y)→(x) sentence has no sealed citation of its own. | SOURCE EXISTS but NO SEALED IDENTITY |

## NO SOURCE MECHANIC

These rows do not answer the later-treatment question. No edge is drawn from them.

| Row | What the recorded text does |
|---|---|
| R1 Available Investment / RP Capacity Amount | Measures capacity “after giving effect to any reallocation or reclassification permitted hereunder” and points at Section 6.08. The grant is B3. |
| R2 Fixed Incremental Amount | Subtracts usage “to the extent not subsequently reclassified.” It assumes B1. |
| R3 General Lien Basket Reallocated Amount | An amount then available to be incurred under the General Lien Basket may be reallocated to the Fixed Incremental Amount. The amount is unused capacity. `c02d33ea41790350d10d2e43` shares the §1.01 opening citation and the citation does not contain “reallocated”. |
| R5 §1.08(f)(i) parenthetical | “any other action (including in connection with any basket reclassification).” Acknowledgement inside the Incurrence-Based Amounts list. `b6faec2341f3a04dbe755ff1` is that parenthetical, role `DEFINITIONAL_DEPENDENCY_CANDIDATE`. It is the only Chewy citation Pass A found that contains the word “reclassification”. |
| R6 §6.01 refinancing deeming | Excess refinancing is deemed incurred under Section 6.01(a). One-time deeming into the ratio gate named in the same sentence. Nearby ids `618c5032e02b802103e5ebd6` and `87fb70357ae030c02dd1354d` stay what Pass A recorded them as. |
| R7 “initially incurred under” | Refinancing caps keep debt inside the original clause’s cap. |
| N1–N2 | GAAP reclassification and lease re-characterization. |
| N3 | Subsidiary or guarantor redesignation, including `cefdc7fed888bce05f3e4c10` at §9.23(b), an Investment measurement on redesignation of a Discretionary Guarantor. Basket reclassification is a different question. `REDESIGNATES_TO` is not proposed. |
| N4–N5 | Lender payment reallocation and facility-class redesignation. |
| N6 | CONMED delayed-draw testing convention. |
| N7 | CONMED defaulting-lender exposure reallocation. |
| N8 | CONMED GAAP classification. |
| N9 | CONMED §7.4 deemed utilization of a §7.5 basket. |
| N10 | CONMED capital-stock reclassification in the collateral agreement. |
| N11 | CONMED incremental-facility lender consent. |
| N12 | CONMED Document C: Pass A recorded zero `classif*` hits. Absence in that amendment is silence about Document A. |

Canonical-map directory at this tip: zero `RECLASSIFIABLE_TO` strings. Pass A’s walk of Chewy `unit-6.08.json` `textValue` fields found the token only inside the open `MISSING_RECLASSIFICATION` finding.

## Proof grid

A `RECLASSIFIABLE_TO` edge is proposed only when every column is proved from the sentence and the endpoints are sealed rule ids. Market practice is not evidence. Phase 4C’s move (usage leaves the source and arrives at the destination) is runtime behavior for an edge that already exists. It does not fill a blank cell.

`IRRuleDependency` stores `relationshipType`, `targetRuleId`, and `description`. It does not store conditions, timing, authority, a mandatory bit, capacity, restoration, or an anti-duplication predicate. Those cells are recorded because a proposed edge would have to prove them. They are not a reason to extend the schema in this lane.

| Cell | B1 §1.08(f) sentence | B2 §7.2(B) | B3 §6.08 closing | B4 §6.01(1) | B5 §7.3(B) |
|---|---|---|---|---|---|
| Source | Sentence above. Fixed Amounts → applicable Incurrence-Based Amounts. | Clause (B) among §7.2(a)–(s). | Closing among §6.08(a), §6.08(b)(1)–(25), and Permitted Investments exceptions. | Paragraph (1) among §6.01(b)(1)–(33) and §6.01(a), plus Effective Date (X)/(Y) lock-in. | Clause (B) among §7.3(a)–(p). Limb (A) says through (q). |
| From | Family name “Fixed Amounts”. No sealed rule id. | The range. No pair. | The range. No pair. | The range. (X) and (Y) name initial classification of closing debt, not a later pair. | The range in clause (B). No pair. |
| To | “the applicable Incurrence-Based Amounts”. No sealed rule id. | The same range. | The same range. | The same range. | The same range, with the (p)/(q) discrepancy unresolved. |
| Conditions | Applicable ratio subsequently met on a Pro Forma Basis. Associated Liens subject to the priorities the applicable Incurrence-Based Amounts require. | The item meets one or more of (a)–(s), and the classification complies with §7.2. | The item meets the named criteria or is entitled to be made under them, and the classification otherwise complies with §6.08. | The item meets more than one category or is entitled to be incurred under §6.01(a), and the classification complies with §6.01. | The Lien meets one or more of (a)–(p), and the classification complies with the covenant. |
| Timing | “automatically and immediately” “at any time” once the ratio is subsequently met. | “later divide, classify or reclassify” is in the sentence. No date. | “later reclassify” “based on circumstances existing on the date of such reclassification”. | No “later” or “at any time”. The verb “reclassify” is present. (X)/(Y) are Effective Date treatments. | “later divide, classify or reclassify” is in the sentence. No date. |
| Authority | Automatic, unless the Initial Borrower otherwise elects from time to time. | Parent Borrower, sole discretion. | Initial Borrower “shall be entitled”. | Initial Borrower, sole discretion. (X) and (Y) are “shall be treated”. | Parent Borrower, sole discretion. |
| Mandatory / optional | Default is automatic. The borrower may elect otherwise from time to time. The sentence does not say whether that election is irrevocable. | “shall” and “sole discretion” are both in the sentence. They are not split into two machine bits. | Entitlement. The sentence does not impose a duty to reclassify. | “shall” and “sole discretion” are both in the sentence. (X) and (Y) are mandatory initial classifications of named closing debt. | Same “shall” plus “sole discretion” pattern as B2. |
| Capacity at reclass time | The ratio on a Pro Forma Basis is the condition. No amount and no currency. | “complies with this Section 7.2”. No amount. | Circumstances on the reclassification date. No amount. | “complies with this Section 6.01”. No amount. | “complies with this covenant”. No amount. |
| Original basket restored? | Unproved. The sentence does not say Fixed Amounts capacity comes back. | Unproved. | Unproved. | Unproved. | Unproved. |
| Anti-duplication | Unproved. The token is absent from the sentence. | The item is included in one clause and treated as incurred under only one clause. That sentence has no from-rule and no to-rule. | Unproved. This sentence does not say “only one clause”. | The borrower is only required to include the amount in one clause. Same limit as B2: no endpoints. | Included in one clause and treated as existing under only one clause. No endpoints. |
| Edge proposed | No | No | No | No | No |

A1, A2, A3, and R4 fail on the same from/to columns: the sentence names a family or a section range, and the sealed citation is not the sentence. Their authority words are sole discretion or an election. Restoration is unproved in each. No edge is proposed.

## Why there is no implementation residual

The edge type already exists.

- `lib/contract-model/ir/types.ts` `IRRuleDependency` is `relationshipType`, `targetRuleId`, `description`.
- `lib/contract-model/runtime/capacity/reclassification.ts` executes a caller-supplied election only when the graph already has `RECLASSIFIABLE_TO` from that source rule to that destination rule. Missing edge → `NO_EXPLICIT_RECLASSIFICATION_EDGE`. The file states that a transition cannot be derived from the IR.
- `lib/contract-model/runtime/capacity/graph.ts` reports an unresolved reclassification reference as `RECLASSIFICATION_NOT_EXECUTABLE` and does not guess it into an edge.
- `lib/contract-model/runtime/rule-evaluator.ts` reports `reclassification.status: NOT_IMPLEMENTED_IN_PHASE_4A` and counts edges already on the rule.
- `docs/phase-4c/08-reclassification-model.json` records `neverAutoElects: true` and `neverDecidesToReclassify: true`. B1’s “shall be automatically and immediately reclassified” is not a behavior that file already runs.

A residual would be a named edge between two rule ids the tip already specifies. The tip specifies the shape and specifies that the edge is never invented. It does not specify endpoints for these sentences. Compiling a `DESIGNATION_RULE` description into a dependency would invent `targetRuleId`. That step is not already specified.

## HOLD

These choices stay open. This lane does not select one.

1. Whether a future span-sealed grant of “among clauses (a) through (n)” becomes one rule with no edge, a hub, or a pair for every clause in the range.
2. Whether “Fixed Amounts” and “Incurrence-Based Amounts” are ever rule endpoints. They are family names inside B1. They are not sealed rule ids in the records read here.
3. Whether B1’s automatic default and the elective sentences in B2–B5 are one relationship type. The stored dependency has no automatic-versus-elective field. Phase 4C does not auto-elect.
4. Whether single-counting language (“only one of such clauses”) is a ledger restoration of the original basket. The sentences do not say the original capacity is restored. Phase 4C’s source-minus / destination-plus pair is not a reading of those sentences.
5. CONMED §7.3 limb (A) “through (q)” versus limb (B) “through (p)”, and the parser node labeled `7.3(q)` that begins “(q) but may be permitted”.
6. Whether unused-capacity reallocation (R3) belongs under `RECLASSIFIABLE_TO`, `SHARES_CAPACITY_WITH`, `BASKET_FEEDING`, or none of them. The sentence is a different mechanic, and its citation is not sealed to the sentence.

## What this does not authorize

- A discovery id for the Chewy §6.08 closing, the Chewy §1.08(f) sentence, the CONMED clause (B) sentences, or any Pass A row whose citation misses the verb.
- Binding `82f0f8f14f2426d932b513dc`, `501eb9d39a0af643dc5dc8ec`, `e8467da748d59de764b93705`, `e93fc56312525fd9ac9bfd04`, `c76edbc49663c57628ed3cee`, `9fda59c688efd0a4baac658f`, `5b0cf887a4cf4a3b5caa1c81`, or the shared `doc-a::1.01` ids as a from-to edge.
- Treating the open `MISSING_RECLASSIFICATION` finding as a repaired edge.
- A pin, a compile, or a certification. No `01c-target-eligibility.json` exists for these ids.
- Reading `RECLASS_RE` in `scripts/stratified-cert/lib/cross-cuts.ts` as an edge. A regex hit is a string match.
