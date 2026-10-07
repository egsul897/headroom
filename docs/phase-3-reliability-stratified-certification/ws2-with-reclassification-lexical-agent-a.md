# WS2 WITH_RECLASSIFICATION — Agent A lexical discovery

Tip `3f1182511758c85ffc92023b06a46114820e69fe`. Discover only. No production code. No invented discovery id. No invented `RECLASSIFIABLE_TO` edge.

Soft gate. Invent-absence forever. IMPLEMENTED is not CERTIFIED. PINNED_OFFLINE is not CERTIFIED.

## Verdict

Section-wide reclassification prose is present. A `WITH_RECLASSIFICATION` edge is not.

The known prose seeds are CONMED §7.2, CONMED §7.3, Chewy §6.08, Chewy §6.01, and Chewy §1.08(f). Each authorizes classification among a range of clauses, or among the defined families Fixed Amounts and Incurrence-Based Amounts. None names one sealed source rule and one sealed destination rule. Two baskets sitting inside that range do not create an edge.

`RECLASSIFIABLE_TO` edges today: **0**.

Searched:

- Chewy paid-run units under `tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/`. The token `RECLASSIFIABLE_TO` occurs only inside the open verifier finding `MISSING_RECLASSIFICATION` on `unit-6.08.json` (`findingId` `d040cc39bc75feb31918694cff828bbc6025e78c569713504bc285f417038401`). `proposedIrEvidence` is `(absent from compiled IR)`. `sourceCitation` is `6.08`. `sourceEvidence` is `(no single source excerpt - an aggregate structural signal spanning the whole candidate's operative text)`. A walk of `textValue` fields in that unit found no `RECLASSIFIABLE_TO` dependency.
- `docs/canonical-covenant-map/maps/conmed-2025-credit-facility.map.json`: zero `RECLASSIFIABLE_TO` strings.

No offline pin under `docs/phase-3-reliability-stratified-certification/pins/` covers any discovery id listed below. No `01c-target-eligibility.json` exists for them. Discovery `reviewStatus` is not eligibility.

## How a row qualifies

A row is a prose seed when the operative sentence itself uses classify / reclassify (or an express “deemed incurred under” / “reallocated from basket A to basket B” formula) for a covenant item or its capacity.

A row is a `WITH_RECLASSIFICATION` edge only when a sealed Phase-3 dependency already has `relationshipType: RECLASSIFIABLE_TO`, a source rule id, and a target rule id. That record does not exist. This report does not create one.

Section-wide prose is insufficient for the edge. A description on a discovery candidate is insufficient when the stored `sourceCitation` does not contain the operative sentence. A shared section node that holds several different sentences is not a span identity.

## Corpus and method

| Package | File | Role |
|---|---|---|
| Chewy | `tests/fixtures/unseen-packages/chwy-2026-credit-agreement/extracted-text/doc-a-2026-06-23-credit-agreement.txt` | Extracted text of EX-10.1, Credit Agreement dated June 23, 2026. Extracted sha256 `f63b9dc6560e699cd5158ee0f254dba76da92612ad75fdc27756047ad8f49eeb`. Offsets below are 0-based indexes into this file. |
| CONMED A | `tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/ex10-1-eighth-ar-credit-agreement-2025-06-16.htm` and curated Article VII `curated/base-credit-agreement-article-vii-negative-covenants.txt` | Eighth A&R Credit Agreement. Article VII quotes are from the curated excerpt; the same §7.2 and §7.3 sentences were confirmed in tag-stripped HTML of Document A. |
| CONMED B | `raw-source/ex10-2-ar-guarantee-and-collateral-agreement-2025-06-16.htm` | Guarantee and collateral agreement. |
| CONMED C | `raw-source/ex10-2-second-amendment-2022-08-02.htm` | 2022 amendment to the prior (seventh) credit agreement. |
| CONMED D | `raw-source/ex10-1-first-omnibus-amendment-2026-06-01.htm` | 2026 omnibus amendment. Tag-stripped text reprints the Document A §7.2 sentence (normalized equal) and the Document A §7.3 / Document B capital-stock sentences. Not a new grant. |
| Discovery | CONMED sealed population `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2f-stage2-discovery-candidates.json` (163 candidates). Chewy `tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/stage2b-discovery.json` (839 candidates). | Ids below are copied from those files. None were minted. |

Variants run, case-insensitive, over Chewy extracted text and tag-stripped CONMED A–D: `reclassif*`, `redesignat*`, `recharacter*`, `reallocat*`, divide-and-classify, `anti-duplicat*`, `deemed incurred`, `deemed utilized`, `initially incurred under`, `subsequently treated as`, `may elect to treat`, `elect to classify`, `from time to time` near `classif*`, `later` near `classif*`, `another basket` / `other basket`, `incurred in reliance on`, `treated as incurred`, `basket switch*` / `basket migrat*`, `compliance on the date of reclassification`, `after giving effect to such reclassification`, sole-discretion near `classif*`. Every `classif*` token was then listed: Chewy 35, CONMED A 10, CONMED B 2, CONMED C 0, CONMED D 13.

Zero-count variants (all five files): `deemed utilized`, `may elect to treat`, `elect to classify`, `from time to time classify`, `attributable to another basket`, `treated as incurred pursuant to`, `compliance on the date of reclassification`, `after giving effect to such reclassification`, `basket switching`, `basket migration`, `anti-duplication`, `subsequently treated as`. Chewy has `initially incurred under` (refinancing cap cross-reference inside §6.01(b), not a reclassification grant) and `elect to treat` (two hits, both inside §1.08(f), recorded below). CONMED has neither.

## Edge census

| Location | `RECLASSIFIABLE_TO` edges |
|---|---|
| Chewy `unit-6.08.json` compiled IR | 0. Open `MISSING_RECLASSIFICATION` finding records the absence. |
| CONMED canonical map JSON | 0 |
| This report | 0 invented |

## Prose seeds — explicit reclassification right, not an edge

### S1 — CONMED §7.2 debt (known seed)

- **Document:** CONMED Document A, Eighth A&R Credit Agreement. Document D reprints the same sentence. Document C does not contain it.
- **Section:** §7.2, unlettered closing paragraph, “For purposes of determining compliance with this Section 7.2”.
- **Source span:** Curated Article VII characters 11523–12457 (through the start of `SECTION 7.3`). Operative sentence: Indebtedness “need not be permitted solely by reference to one category of permitted Indebtedness described in Section 7.2(a) through (s) but may be permitted in part under any combination thereof,” and if an item “meets the criteria of one or more of the categories … described in Sections 7.2(a) through (s), the Parent Borrower shall, in its sole discretion, classify or reclassify, or later divide, classify or reclassify” that item “in any manner that complies with this Section 7.2” and “will only be required to include the amount and type … in one of the above clauses,” and the item “shall be treated as having been incurred or existing pursuant to only one of such clauses.”
- **Discovery id (exists, not an edge):** `discovery-candidate:c76edbc49663c57628ed3cee`. `normalizedSourceRef` `7.2`. Role `OTHER_RELEVANT_RULE`. Families `DEFINITIONS_CALCULATION_RULES`, `INDEBTEDNESS`. `reviewStatus` `AUTO_ACCEPTED`. Structural node `conmed-doc-a-eighth-ar-credit-agreement::7.2`. Description matches the paragraph. Stored `sourceCitation` is the section heading and chapeau only. It does not contain “classify or reclassify”.
- **Not this id:** `discovery-candidate:19f36eb8514494897cd4a5b6` is §7.2(d), the finance-lease basket. The map note that a §7.2 compilation mentioned the classification paragraph in overallNotes does not make §7.2(d) the reclassification identity.
- **Target mechanic:** Borrower election to divide and later reclassify one item of Indebtedness among the §7.2(a)–(s) categories, with each portion counted under only one clause.
- **Authority:** Express. “shall, in its sole discretion, classify or reclassify, or later divide, classify or reclassify”.
- **Required defs / xrefs:** `Indebtedness`. The range §7.2(a) through (s), including §7.2(c) (debt secured by §7.3(g) liens, with a §7.1 pro forma compliance test), §7.2(r) (Convertible Notes and Permitted Refinancing), and §7.2(s) (debt assumed in Permitted Business Acquisitions). Those clauses are inside the named range. The paragraph does not state a separate from-to pair for any one of them.
- **Explicit vs inferred:** The section-wide right is explicit. Any claim that a particular clause reclassifies into a particular other clause is inferred from coexistence inside (a)–(s), and is rejected.
- **Identity status:** Section-node bound. Citation preview does not contain the operative sentence. Not span-unique to a source basket and a destination basket.
- **Eligibility:** No pin. No eligibility artifact. Not CERTIFIED.
- **WITH_RECLASSIFICATION:** Does not qualify. Section-wide prose. Zero `RECLASSIFIABLE_TO` edges. Do not bind this discovery id as an edge.

### S2 — CONMED §7.3 liens (known seed)

- **Document:** CONMED Document A. Document D reprints the same mechanic. Document C does not.
- **Section:** §7.3, unlettered closing paragraph, “For purposes of determining compliance with this Section 7.3”.
- **Source span:** Curated Article VII characters 18511–19510 (through `SECTION 7.4`). Same shape as §7.2: combination permitted, then “classify or reclassify, or later divide, classify or reclassify,” “in any manner that complies with this covenant,” counted “in one of the above clauses,” “treated as being incurred or existing pursuant to only one of such clauses.”
- **Source mismatch inside the sentence, not resolved here:** Limb (A) says categories “described in Section 7.3(a) through (q).” Limb (B) says “Section 7.3(a) through (p).” The lettered lien exceptions in the curated excerpt run (a) through (p). There is no §7.3(q) in that excerpt. The sealed description on the discovery candidate says “clauses (a) through (q).” That description matches limb (A) and not limb (B).
- **Discovery id (exists, not an edge):** `discovery-candidate:9fda59c688efd0a4baac658f`. `normalizedSourceRef` `7.3`. Role `DESIGNATION_RULE`. Families `LIENS`, `INDEBTEDNESS`, `DEFINITIONS_CALCULATION_RULES`. `reviewStatus` `AUTO_ACCEPTED`. Structural node `conmed-doc-a-eighth-ar-credit-agreement::7.3`. `sourceCitation` is the §7.3 heading. It does not contain “classify or reclassify”.
- **Target mechanic:** Borrower election to divide and later reclassify a lien securing indebtedness among the §7.3 categories, one clause per portion.
- **Authority:** Express sole discretion.
- **Required defs / xrefs:** `Lien`, `Indebtedness`, `Section 7.3(a)` through the range written in each limb. §7.2 is the debt covenant that several lien clauses cross-refer. No per-clause edge.
- **Explicit vs inferred:** Section-wide right explicit. Pairwise basket edges inferred, and rejected.
- **Identity status:** Section-node bound. Citation preview lacks the verb. The (p)/(q) discrepancy is unresolved source text, not a reason to pick a destination clause.
- **Eligibility:** No pin. Not CERTIFIED. The existing §7.3(m) pin (`discovery-candidate:b5bb07b092f9863985f89812`) is a general lien basket. It is not this paragraph and it is not an edge.
- **WITH_RECLASSIFICATION:** Does not qualify. Section-wide prose. Zero edges.

### S3 — Chewy §6.08 restricted payments and investments (known seed)

- **Document:** Chewy Credit Agreement, extracted text.
- **Section:** End of §6.08, “For purposes of determining compliance with this Section 6.08”. Not clause (h).
- **Source span:** Extracted characters 696782–697570. “the Initial Borrower shall be entitled to classify or later reclassify (based on circumstances existing on the date of such reclassification)” a Restricted Payment or Investment “among such Sections 6.08(b)(1) through (25) and Section 6.08(a) … and/or one or more of the exceptions contained in the definition of “Permitted Investments,” in a manner that otherwise complies with this Section 6.08.”
- **Discovery id:** Do not use `discovery-candidate:e8467da748d59de764b93705`. Its `normalizedSourceRef` is `6.08(h)`, role `DESIGNATION_RULE`, family `RESTRICTED_PAYMENTS`, `reviewStatus` `AUTO_ACCEPTED`, and its description restates this paragraph, but its `sourceCitation` is the sale-and-leaseback builder: “(h) 100% of the aggregate amount received in cash … sale and leaseback transaction”. The citation does not contain the reclassification sentence. That is a mis-binding, not an identity. `discovery-candidate:9b0565bc34f297cfc65cf938` is the §6.08 general-prohibition heading. No sealed citation in the Chewy population contains this operative sentence. No new id is assigned.
- **Target mechanic:** Later reclassification of a restricted payment or investment among §6.08(a), §6.08(b)(1)–(25), and Permitted Investment exceptions, tested on circumstances existing on the reclassification date.
- **Authority:** Express. “shall be entitled to classify or later reclassify”.
- **Required defs / xrefs:** `Restricted Payment`, `Permitted Investments`, `Initial Borrower`, §6.08(a), §6.08(b)(1) through (25). The measurement definitions `Available RP Capacity Amount` and `Available Investment Capacity Amount` point back at “any reallocation or reclassification permitted hereunder” and, for the RP capacity reduction, “as described in Section 6.08” (see R1). They are not a second grant.
- **Explicit vs inferred:** The section-wide right, including the reclassification-date circumstances clause, is explicit. No source-clause to destination-clause pair is named.
- **Identity status:** Operative sentence is in the extracted agreement. It is not bound to a sealed discovery citation. The §6.08(h) candidate must not be treated as that sentence.
- **Eligibility:** No pin. Chewy `unit-6.08.json` records `MISSING_RECLASSIFICATION` with the edge absent. The NON_MATERIAL downgrade does not create the edge. Not CERTIFIED.
- **WITH_RECLASSIFICATION:** Does not qualify. Section-wide prose over a numbered range. Zero edges.

### S4 — Chewy §6.01 debt, including ratio debt (known seed)

- **Document:** Chewy Credit Agreement, extracted text.
- **Section:** “For purposes of determining compliance with this Section 6.01,” paragraph (1).
- **Source span:** The allocate/classify/reclassify sentence begins at extracted character 636521. “in the event that an item of Indebtedness, Disqualified Stock or Preferred Stock (or any portion thereof) meets the criteria of more than one of the categories … described in Sections 6.01(b)(1) through (33) … or is entitled to be incurred pursuant to Section 6.01(a) … the Initial Borrower, in its sole discretion, shall allocate, classify and reclassify … in any manner that complies with this Section 6.01 and shall only be required to include the amount and type … in one (1) of the above clauses or subsections,” provided that closing-date Agreement debt “shall be treated as incurred under Section 6.01(b)(1)(X)” and closing-date ABL debt “shall be treated as incurred under Section 6.01(b)(1)(Y).”
- **Discovery id (exists, not an edge):** `discovery-candidate:e93fc56312525fd9ac9bfd04`. `normalizedSourceRef` `6.01`. Role `DESIGNATION_RULE`. Family `INDEBTEDNESS`. `reviewStatus` `AUTO_ACCEPTED`. `multipleRulesLikely` true. `supersessionStatus` `UNKNOWN_SUPERSESSION_STATUS`. Description matches. `sourceCitation` is the §6.01 heading only (113 characters) and does not contain “reclassify”.
- **Target mechanic:** Sole-discretion allocation and reclassification of debt, disqualified stock, or preferred stock across §6.01(b)(1)–(33) and §6.01(a), one clause per portion, with a closing-date lock into §6.01(b)(1)(X) and (Y).
- **Authority:** Express.
- **Required defs / xrefs:** §6.01(a) (the ratio / Permitted Ratio Debt gate is named in the sentence), §6.01(b)(1) through (33), §6.01(b)(1)(X), §6.01(b)(1)(Y), `ABL Credit Agreement`, `Transactions`, `Effective Date`. The (X)/(Y) provisos are an initial classification mandate for closing debt. They are not a later from-to edge.
- **Explicit vs inferred:** Section-wide right explicit, and it does expressly include items “entitled to be incurred pursuant to Section 6.01(a).” It still does not name which §6.01(b) clause reclassifies into which other clause.
- **Identity status:** Section-node bound. Citation preview lacks the verb. Supersession unknown. Not a from-to identity.
- **Eligibility:** No pin. Not CERTIFIED.
- **WITH_RECLASSIFICATION:** Does not qualify. Section-wide prose. Zero edges.

### S5 — Chewy §1.08(f) fixed-to-incurrence automatic reclassification (known seed)

- **Document:** Chewy Credit Agreement, extracted text.
- **Section:** §1.08(f), after the incremental ordering sentence and before §1.08(g). §1.08 heading is at extracted character 376281 (“Limited Condition Transactions, Pro Forma Calculations and Other Calculations”). The `(f)` marker that introduces this block is at 387511. The automatic-reclassification sentence is at 392590–393488. §1.08(g) begins at 393488.
- **Source span:** “Unless the Initial Borrower elects otherwise, each Incremental Facility shall be deemed incurred first under the Ratio Incremental Amount to the extent permitted, with the balance incurred under the Fixed Incremental Amount. In addition, any Indebtedness (and associated Liens, subject to the applicable priorities required pursuant to the applicable Incurrence-Based Amounts), Investments, liquidations, dissolutions, mergers, consolidations, Restricted Payments or any prepayments of Indebtedness (or, in each case, any portion thereof) incurred or otherwise effected in reliance on Fixed Amounts shall be automatically and immediately reclassified at any time, unless the Initial Borrower otherwise elects from time to time, as incurred under the applicable Incurrence-Based Amounts if the Borrowers subsequently meets the applicable ratio for such Incurrence-Based Amounts on a Pro Forma Basis.”
- **Discovery ids (exist, not edges):**
  - `discovery-candidate:82f0f8f14f2426d932b513dc`. Ref `1.08(f)`. Role `DESIGNATION_RULE`. Families indebtedness, liens, investments, restricted payments. `reviewStatus` `NEEDS_REVIEW`. Description matches the automatic sentence. `sourceCitation` is `(f)` (4 characters).
  - `discovery-candidate:501eb9d39a0af643dc5dc8ec`. Ref `1.08(f)`. Role `BUILDER`. Description matches only the “deemed incurred first” ordering sentence. `sourceCitation` is also `(f)`.
  - Both share the subsection label. Neither citation contains “reclassified”.
- **Target mechanic:** Two adjacent rules. First, a default ordering at incurrence: incremental facilities use Ratio Incremental Amount, then Fixed Incremental Amount, unless the borrower elects otherwise. Second, a later automatic reclassification of items incurred on Fixed Amounts into Incurrence-Based Amounts once the ratio is met on a pro forma basis, unless the borrower elects otherwise from time to time. The second sentence covers indebtedness, associated liens, investments, restricted payments, and debt prepayments.
- **Authority:** Express. “shall be automatically and immediately reclassified” and “unless the Initial Borrower otherwise elects from time to time”.
- **Required defs / xrefs:** `Fixed Amounts` and `Incurrence-Based Amounts` (both defined in §1.08(f)), `Ratio Incremental Amount`, `Fixed Incremental Amount`, `Pro Forma Basis`, `Incremental Facility`. `Fixed Incremental Amount` (see R2) subtracts prior fixed-incremental usage “to the extent not subsequently reclassified.” That clause assumes this sentence. It does not identify a destination rule id.
- **Explicit vs inferred:** The family-to-family reclassification (Fixed Amounts to the applicable Incurrence-Based Amounts) is explicit. A graph edge from one numbered basket to another numbered basket is not stated.
- **Identity status:** Subsection-level. Two different mechanics share ref `1.08(f)` and the same four-character citation. Not a source-rule / target-rule pair. Supersession `UNKNOWN_SUPERSESSION_STATUS`.
- **Eligibility:** No pin. Not CERTIFIED. Existing Chewy pins of §1.08(d)(i), §1.08(d)(ii), and §1.08(g) are other subsections.
- **WITH_RECLASSIFICATION:** Does not qualify as an edge. This is the strongest prose seed, and it is still category-family prose. Zero `RECLASSIFIABLE_TO` edges. Do not mint endpoints.

## Other explicit lexical hits — not edges

### A1 — Chewy definition of Asset Sale (asset sale, restricted payment, investment)

- **Document / section:** Chewy §1.01, closing sentence of the definition `Asset Sale`. Not the operative covenant §6.05.
- **Source span:** Extracted 34122–34687. If a transaction meets one or more Asset Sale exceptions, or would be an Asset Sale and/or a Restricted Payment or Permitted Investment, “the Initial Borrower, in its sole discretion, shall be entitled to divide and classify or reclassify (based on circumstances existing on the date of such reclassifications)” it “as an Asset Sale and/or one or more of the types of Restricted Payments or Permitted Investments.”
- **Discovery id:** `discovery-candidate:58c0707a3ae002247a5319a3`. Ref `1.01`. Role `DESIGNATION_RULE`. Families `ASSET_SALES`, `RESTRICTED_PAYMENTS`, `INVESTMENTS`. `reviewStatus` `NEEDS_REVIEW`. Structural node `doc-a::1.01`. `sourceCitation` is the opening of §1.01 (the ABL Administrative Agent definition) and does not contain this sentence. The same node and the same citation preview are shared with A2 and R3.
- **Authority:** Express.
- **Required defs / xrefs:** `Asset Sale`, `Restricted Payment`, `Permitted Investments`, `Initial Borrower`.
- **Identity status:** Shared definitions-article node. Not span-unique.
- **Eligibility:** No pin. Not CERTIFIED.
- **WITH_RECLASSIFICATION:** Prose seed across three families. Not an edge. §6.05’s own operative text (extracted 650502–658982) contains no `classif*` token. Do not treat the asset-sale covenant pin `discovery-candidate:b54ed7fe4f8f7bb7c224d99b` (§6.05(a)(2)(c)) as this sentence.

### A2 — Chewy definition of Permitted Liens

- **Document / section:** Chewy §1.01, “For purposes of determining compliance with this definition.”
- **Source span:** Extracted 287986–289133. Limb (x): a lien may be incurred under any combination of Permitted Lien categories. Limb (y): if a lien meets more than one category, the Initial Borrower “shall, in its sole discretion, classify or reclassify” it “in any manner that complies with this definition.” Limb (z): a portion that could be secured under clause (20) “may” be classified under clause (20), and the remainder under other clauses. Limb (z) uses “classify”, not “reclassify”.
- **Discovery id:** `discovery-candidate:11126e5d9b3471382e895e99`. Ref `1.01`. Role `DESIGNATION_RULE`. Family `LIENS`. `reviewStatus` `NEEDS_REVIEW`. Same shared `doc-a::1.01` citation preview as A1. Citation does not contain the sentence.
- **Required defs / xrefs:** `Permitted Liens`, clause (20) of that definition, `Indebtedness`, `Obligations`.
- **Identity status:** Shared definitions node. Not span-unique. Chewy §6.02 (the lien covenant) contains no `classif*` token; it points at Permitted Liens and then addresses equal-and-ratable liens. The reclassification sentence is in the definition, not in §6.02.
- **Eligibility:** No pin. Not CERTIFIED.
- **WITH_RECLASSIFICATION:** Definition-wide prose. Not an edge. Do not derive edges from the list of Permitted Lien clauses.

### A3 — Chewy §5.18 affiliate transactions

- **Document / section:** Closing sentences of §5.18. Outside the named basket list (debt / lien / investment / RP / asset sale / incremental / ratio debt / acquisitions / refinancing). Recorded because the lexical search hit it.
- **Source span:** Extracted character 606596. “the Initial Borrower may, in its sole discretion, classify or later divide, classify or reclassify” a §5.18 transaction “in a manner that complies with this Section 5.18” and need only include it “in one or more of the above clauses,” and may split a transaction across categories “so long as each portion … would be permitted by the applicable provision.”
- **Discovery id:** `discovery-candidate:027b4c423907d829595478fb`. Ref `5.18`. Role `DESIGNATION_RULE`. Family `AFFILIATE_TRANSACTIONS`. `reviewStatus` `AUTO_ACCEPTED`. `sourceCitation` is the section heading only. Sibling `discovery-candidate:eb95ad81afaff31d4df3648d` describes the split-across-categories proviso, not the reclassify verb.
- **Identity status:** Section-node bound. Citation lacks the verb.
- **Eligibility:** No pin. Not CERTIFIED.
- **WITH_RECLASSIFICATION:** Explicit section-wide prose for affiliate transactions. Not an edge, and not inside the named basket list.

### R1 — Chewy capacity definitions that refer to reclassification

- **Document / section:** §1.01 definitions `Available Investment Capacity Amount` and `Available RP Capacity Amount`, near extracted 35391–37245.
- **Source span:** Both amounts are measured “after giving effect to any reallocation or reclassification permitted hereunder.” The RP definition then says capacity under §6.08 “shall be reduced (with such reduction to be classified and/or reclassified among such clauses by the Borrowers as described in Section 6.08).” A later sentence: “The Initial Borrower may elect to allocate or reallocate from time to time the Available RP Capacity Amount.”
- **Discovery id:** None whose `sourceCitation` contains these sentences. Do not mint one. Do not reuse the shared §1.01 ids from A1/A2.
- **Authority:** Express cross-reference. The grant it points at is S3 (§6.08), not these definitions.
- **WITH_RECLASSIFICATION:** Measurement and allocation language. Not an edge. “as described in Section 6.08” does not identify a destination rule id.

### R2 — Chewy `Fixed Incremental Amount` carve-out

- **Document / section:** §1.01 definition `Fixed Incremental Amount`.
- **Source span:** The definition sums a greater-of dollar / EBITDA amount plus unused §6.01(b)(12)(b), unused `General Lien Basket Reallocated Amount`, and unused `Available RP Capacity Amount`, minus incremental facilities, incremental equivalent debt, and debt incurred in reliance on §6.01(b)(1)(Z) or (14)(e)(2) that was incurred on the Fixed Incremental Amount, “in each case, to the extent not subsequently reclassified.” The words “not” and “subsequently reclassified” are separated by a newline at extracted character 185329.
- **Discovery id:** None bound to this sentence. Do not mint one.
- **Required defs / xrefs:** `Fixed Incremental Amount`, `General Lien Basket Reallocated Amount`, `Available RP Capacity Amount`, §6.01(b)(12)(b), §6.01(b)(1)(Z), §6.01(b)(14)(e)(2), and the §1.08(f) sentence in S5, which is the only Chewy sentence that actually reclassifies fixed-amount items.
- **WITH_RECLASSIFICATION:** A usage exclusion that assumes later reclassification. Not a grant and not an edge.

### R3 — Chewy `General Lien Basket Reallocated Amount`

- **Document / section:** §1.01. Extracted 191220–191712.
- **Source span:** “any amount then available to be incurred under the General Lien Basket that, at the option of the Initial Borrower, has been reallocated from the General Lien Basket to the Fixed Incremental Amount,” usable to incur additional pari or junior secured debt. `General Lien Basket` means clause (21) of `Permitted Liens`.
- **Discovery id:** `discovery-candidate:c02d33ea41790350d10d2e43`. Ref `1.01`. Role `PROVISO`. Families `LIENS`, `INDEBTEDNESS`. `reviewStatus` `NEEDS_REVIEW`. Confidence 0.55. Same shared §1.01 citation preview. Citation does not contain “reallocated”.
- **Authority:** Express option to move unused capacity from one defined basket to another.
- **WITH_RECLASSIFICATION:** Capacity reallocation of an amount “then available to be incurred,” not reclassification of an outstanding item, and not a `RECLASSIFIABLE_TO` edge between sealed rules. Do not award `WITH_RECLASSIFICATION` because a lien basket and an incremental basket are both named.

### R4 — Chewy §1.08(f)(ii) “elect to treat”

- **Document / section:** Inside §1.08(f), extracted about 389583 and 390670.
- **Source span:** For a revolving or delayed-draw commitment, the borrower may “(x) elect to treat” all or a portion as fully drawn on the implementation date, or “(y) elect to test” drawings on the draw date. Separately, the borrower “may, at any time in its sole discretion, elect to treat” a commitment incurred under (y) “to be incurred in reliance of clause (x)” if on a pro forma basis it could be incurred under (x) at that time.
- **Discovery id:** `discovery-candidate:0a8f0ee1944b13c6adb66710`. Ref `1.08`. Role `PERMISSION`. `reviewStatus` `NEEDS_REVIEW`. Description covers the fully-drawn versus draw-date election. `sourceCitation` is the §1.08 heading, not clause (x)/(y). The later (y)-to-(x) election is not a separate sealed citation.
- **WITH_RECLASSIFICATION:** Express elections about when a commitment is tested and, in the second sentence, a later election to count a (y) commitment under (x). Still clause-internal prose inside §1.08(f). Not a sealed from-to edge. The exact variant `may elect to treat` does not occur; the text is `elect to treat`.

### R5 — Chewy §1.08(f)(i) parenthetical “basket reclassification”

- **Document / section:** §1.08(f)(i)(i)(A), inside the definition of `Incurrence-Based Amounts`.
- **Source span:** Extracted 388014. Actions under a ratio-based basket include “any other action (including in connection with any basket reclassification).”
- **Discovery id:** `discovery-candidate:b6faec2341f3a04dbe755ff1`. Ref `1.08(f)(i)(i)(A)`. Role `DEFINITIONAL_DEPENDENCY_CANDIDATE`. `reviewStatus` `NEEDS_REVIEW`. This is the only Chewy `sourceCitation` that contains the word `reclassification`. The citation is the parenthetical, not S5’s operative sentence.
- **WITH_RECLASSIFICATION:** The parenthetical acknowledges that a basket reclassification can be an action under a ratio basket. It does not grant the right and it does not name endpoints. Not an edge.

### R6 — Chewy §6.01 refinancing deeming

- **Document / section:** §6.01, after the compliance paragraphs. Extracted 638109–638789.
- **Source span:** If debt originally incurred under a Consolidated EBITDA percentage or under a §6.01(a) ratio is refinanced under §6.01(a) and the refinancing would exceed the maximum, the refinancing is still permitted and “such additional Indebtedness, Disqualified Stock or Preferred Stock shall be deemed to have been incurred, and permitted to be incurred, under such Section 6.01(a).”
- **Discovery id:** None whose citation is this sentence. Nearby `discovery-candidate:618c5032e02b802103e5ebd6` is the “outstanding amount after refinancing proceeds” rule. Nearby `discovery-candidate:87fb70357ae030c02dd1354d` is the refinancing permission. Do not re-label either as this deeming.
- **WITH_RECLASSIFICATION:** One-time deeming of the excess into the same section’s ratio gate at refinancing. It does not say the original basket is later reclassified into a different basket. Not an edge. A separate sentence in the same neighborhood deems a dollar cap not exceeded when the only change is the exchange rate; that is an FX savings clause, not reclassification.

### R7 — “initially incurred under” inside Chewy §6.01(b)

- **Source span:** Refinancing caps in §6.01(b)(12)(b), (18), (19), and (27) count outstanding refinancing debt that refinances debt “initially incurred under” or “initially incurred in reliance on” the original clause. Extracted example at 622805.
- **WITH_RECLASSIFICATION:** Cross-reference that keeps refinancing debt inside the original basket’s cap. Not a reclassification grant and not an edge.

## Non-qualifying lexical hits

These matched a searched variant. They are not basket reclassification. No edge is drawn from them.

| ID | Where | What the text does | Why it is not WITH_RECLASSIFICATION |
|---|---|---|---|
| N1 | Chewy, `Consolidated Net Income` add-back, extracted 119405 | GAAP reclassification of assets or liabilities between current and noncurrent | Accounting classification |
| N2 | Chewy, capitalized-lease / GAAP change, extracted 56138 | Obligations need not be `re-characterized` as capitalized leases after a GAAP change | Accounting characterization |
| N3 | Chewy, `Permitted Acquisition` and several investment / builder clauses (extracted 249672, 250565, 260496, 668315, 668716, 862568, 862782) | `redesignation` of an Unrestricted Subsidiary as a Restricted Subsidiary, or of a Discretionary Guarantor as an Excluded Subsidiary, including a deemed outstanding Investment on that redesignation (`discovery-candidate:cefdc7fed888bce05f3e4c10`, ref `9.23(b)`) | Entity designation. The word is redesignation. No basket-to-basket edge |
| N4 | Chewy §2.20(a)(ii) and §2.22(b) | `Reallocation of Payments` for a Defaulting Lender; loan-modification “reallocations and exchanges” | Lender payment and class mechanics. Ids include `f2dcc00a2bf9186585da3a9a`, `8a31deb36c9c209fa56fee01`, `d334812636b84ad036a77b8f`, `69d48675eae2ee94fab9fe33` |
| N5 | Chewy §2.19(a) | Refinancing amendment may include `redesignating` loans and commitments as Other Loans / Other Commitments. Id `e4e5d21e4fdbab8cb2038c90` | Facility-class label, not a covenant basket |
| N6 | CONMED A §1.5, reprinted in D | Delayed-draw term debt “incurred in reliance on” a senior-secured or total leverage incurrence test is tested as if fully drawn | Testing convention. Not reclassification |
| N7 | CONMED A §2.27, reprinted in D | Defaulting-lender `reallocation` of swingline and L/C exposure | Lender exposure mechanics |
| N8 | CONMED A, two `classif*` hits outside §7.2/§7.3 | Intangible assets “classified as such in accordance with GAAP”; finance-lease obligations “classified and accounted for as finance leases” | GAAP classification |
| N9 | CONMED §7.4(a)(iii) / §7.4 proviso | A Division “shall be deemed to be a utilization of the applicable baskets in Section 7.5.” Ids `90d9d73e1fda41693532da4a` and `d4ddf49148401c57934b4838` | Deemed use of a disposition basket. Not an election to reclassify an incurred item |
| N10 | CONMED B §5.4, reprinted near the end of Document D | Stock certificate issued in a `reclassification` of capital, or property distributed on `reclassification` of an issuer’s capital | Corporate capital reclassification. Not a covenant basket |
| N11 | CONMED incremental-facility paragraph | Lenders “in [their] sole discretion” may permit an incremental facility | Consent to incur. The sentence does not classify or reclassify |
| N12 | CONMED C | No hits on any high-signal pattern, and zero `classif*` | Absence in the 2022 amendment. Not evidence about Document A |

## Basket coverage

| Basket | Explicit reclassification prose | `RECLASSIFIABLE_TO` edge |
|---|---|---|
| Debt | CONMED §7.2 (S1). Chewy §6.01 (S4). Chewy §1.08(f) indebtedness limb (S5). | 0 |
| Lien | CONMED §7.3 (S2). Chewy Permitted Liens definition (A2). Chewy §1.08(f) “associated Liens” limb (S5). Chewy §6.02 covenant text itself: no `classif*`. | 0 |
| Investment | Chewy §6.08 and Permitted Investments (S3). Chewy Asset Sale definition (A1). Chewy §1.08(f) (S5). CONMED §7.8: baskets coexist through (m); the closing sentence is a cost-measurement rule; no classify / reclassify. | 0 |
| Restricted payment | Chewy §6.08 (S3), Asset Sale definition (A1), §1.08(f) (S5). CONMED §7.6(a)–(g): no classification paragraph. | 0 |
| Asset sale | Chewy Asset Sale definition (A1). Chewy §6.05 operative covenant: no `classif*`. CONMED §7.5(a)–(n): no classification paragraph. The §7.4 deemed-utilization sentence (N9) is not one. | 0 |
| Incremental | Chewy §1.08(f) ordering plus automatic reclassification (S5), Fixed Incremental Amount carve-out (R2), General Lien Basket reallocation into Fixed Incremental Amount (R3). CONMED: no classify / reclassify on incremental facilities. | 0 |
| Ratio debt | Named inside Chewy §6.01(a) in S4, and inside the Incurrence-Based Amounts family in S5. CONMED §7.2(c) is inside the §7.2 range and has no sentence of its own. | 0 |
| Permitted acquisitions | CONMED §7.2(s) and lien/investment acquisition clauses sit in sections that either have section-wide prose (§7.2, §7.3) or do not (§7.8). No acquisition-specific reclassification sentence. Chewy `Permitted Acquisition` uses subsidiary redesignation (N3). | 0 |
| Refinancing | Chewy excess refinancing deemed incurred under §6.01(a) (R6). Chewy “initially incurred under” cap cross-references (R7). CONMED §7.2(r) is inside the §7.2 range only. | 0 |
| Affiliate transactions | Chewy §5.18 (A3). Not in the named basket list. | 0 |

## What this does not authorize

- Do not pin `WITH_RECLASSIFICATION` on S1–S5 or A1–A3.
- Do not treat `discovery-candidate:c76edbc49663c57628ed3cee`, `9fda59c688efd0a4baac658f`, `e93fc56312525fd9ac9bfd04`, `82f0f8f14f2426d932b513dc`, `e8467da748d59de764b93705`, or the shared `doc-a::1.01` ids as a from-to edge.
- Do not invent a discovery id for the Chewy §6.08 compliance paragraph to replace the mis-bound §6.08(h) citation.
- Do not invent a `RECLASSIFIABLE_TO` dependency, a source rule id, or a target rule id.
- Do not read the open `MISSING_RECLASSIFICATION` finding as a repaired edge. Its proposed IR evidence is the absence.
- The cross-cut helper `RECLASS_RE` in `scripts/stratified-cert/lib/cross-cuts.ts` matches the words `reclassify`, `reclassification`, `re-characterize`, and `anti-duplication` in a window. A regex hit is not an edge and not certification.
