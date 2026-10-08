# Independent defect register

Record: `03-defect-register.json` (product-acceptance-defect-register.v1). Baseline `9de4e5737166`. Independent product validation (adversarial QA) - not the compiler's own diagnostics.

Compiler/runtime remediation is owned by the Cursor track. Entries here are inputs to that track, not fixes.

Evidence: docs/product-readiness/acceptance-runs/<sha>/report.json (offline, mocked model stages, zero provider calls). A defect stays OPEN until `tests/product-acceptance/known-defects.test.ts` reports its signatures no longer fail.

| id | severity | outcome | stage | title | packages |
|---|---|---|---|---|---|
| IPV-01 | CRITICAL_FALSE_PERMISSION | INCORRECT_RESULT | CERTIFICATION | Entity-scope widening is confirmed and certified when the clause narrows the section's governing scope | a-basic-credit-agreement |
| IPV-02 | CRITICAL_FALSE_PERMISSION | INCORRECT_RESULT | CERTIFICATION | A dropped "together with … pursuant to Section X" shared cap certifies as two independent baskets | f-capacity-ledger-honesty |
| IPV-03 | MATERIAL_CONDITION_OMISSION | INCORRECT_RESULT | CERTIFICATION | Lineage laundering: a dropped material condition certifies when its inventory item is cited on the rule node | a-basic-credit-agreement, h-unseen-composition |
| IPV-04 | WRONG_OPERATIVE_SOURCE | INCORRECT_RESULT | SEMANTIC_COMPOSITION | A section-level candidate is compiled from superseded/deleted sub-clause text with no operative lineage | b-multi-document, c-amendment-supersession |
| IPV-05 | WRONG_OPERATIVE_SOURCE | INCORRECT_RESULT | OPERATIVE_STATE | An unresolved amendment leaves the instrument's operative state RESOLVED with zero unattached effects | h-unseen-composition |
| IPV-06 | SOURCE_PROVENANCE_FAILURE | INCORRECT_RESULT | STRUCTURE | Inline enumerations inside a definition are minted as structural nodes and capture the following definitions | h-unseen-composition, e-structural-ambiguity |
| IPV-07 | MISSING_REQUIRED_COVENANT | INCORRECT_RESULT | STRUCTURE | A dropped enumeration letter merges the next clause into the previous sibling | g-adversarial-evidence |
| IPV-08 | SOURCE_PROVENANCE_FAILURE | INCORRECT_RESULT | STRUCTURE | Non-operative exhibit "Term:" lines become definition records with no source node | g-adversarial-evidence |
| IPV-09 | NONMATERIAL_OMISSION | INCORRECT_RESULT | CONTEXT_RETRIEVAL | Plural use of a defined term is not resolved to its definition | d-qualitative-restrictions, e-structural-ambiguity, f-capacity-ledger-honesty, g-adversarial-evidence, i-secured-debt-lien, k-three-way-builder, m-composed-p0 |
| IPV-10 | UNSUPPORTED_AS_COMPLETE | INCORRECT_RESULT | CONTEXT_RETRIEVAL | Undefined terms inside a retrieved definition are not reported; the bundle claims SUFFICIENT | h-unseen-composition, j-restricted-payments-builder |
| IPV-11 | UNSUPPORTED_AS_COMPLETE | CAPABILITY_NOT_IMPLEMENTED | STRUCTURE | Table-of-contents lines are parsed as duplicate ARTICLE/SECTION nodes on the certified path; every covenant becomes ambiguous | e-structural-ambiguity |
| IPV-12 | NONMATERIAL_OMISSION | CAPABILITY_NOT_IMPLEMENTED | CONTEXT_RETRIEVAL | A self-referential definition trips DEFINITION_CYCLE and blocks certification of every dependent covenant | b-multi-document |
| IPV-13 | NONMATERIAL_OMISSION | INCORRECT_RESULT | SEMANTIC_COMPOSITION | Action-ontology guard misreads "make any Disposition" (gap) and "purchase money Indebtedness" (PREPAY_DEBT) | d-qualitative-restrictions, e-structural-ambiguity |
| IPV-14 | NONMATERIAL_OMISSION | CORRECT_FAIL_CLOSED | CERTIFICATION | Residual fail-closed outcomes on faithful submissions (recorded, not defects): unaccounted Layer-1 items on 2.05 and 7.01 (C) and the stale-text rejection of the correct amended basket | d-qualitative-restrictions, g-adversarial-evidence, i-secured-debt-lien, k-three-way-builder |
| IPV-15 | NONMATERIAL_OMISSION | CORRECT_FAIL_CLOSED | SEMANTIC_COMPOSITION | Shared capacity mediated through a definition (Available Amount netting across 7.06(c)/7.08(d)) has no representation channel; a dependsOn to the sibling is rejected as invented | j-restricted-payments-builder |
| IPV-16 | CRITICAL_FALSE_PERMISSION | INCORRECT_RESULT | OPERATIVE_STATE | A side letter that overrides a covenant cap 'notwithstanding' the credit agreement produces no amendment effect; the operative state stays RESOLVED with the base-agreement text | a-basic-credit-agreement, b-multi-document, c-amendment-supersession, h-unseen-composition, i-secured-debt-lien, m-composed-p0 |
| IPV-17 | MISSING_DEPENDENCY | INCORRECT_RESULT | CONTEXT_RETRIEVAL | [CLOSED - harness false positive] Definition-mediated cross-reference closure appeared asymmetric for J 7.08(d); the sibling was present under a different bundle item type | j-restricted-payments-builder |
| IPV-18 | UNSUPPORTED_AS_COMPLETE | CORRECT_FAIL_CLOSED | SEMANTIC_COMPOSITION | No covenant family exists for voluntary prepayments / redemptions of junior (subordinated) debt; the normalizer silently relabels the unit QUALITATIVE_NEGATIVE_COVENANTS | k-three-way-builder |
| IPV-19 | WRONG_OPERATIVE_SOURCE | INCORRECT_RESULT | OPERATIVE_STATE | A definition amendment ('The definition of "X" in Section 1.01 … is hereby amended and restated … to read as follows') is resolved as a REPLACE_TEXT of the whole of Section 1.01; the operative state then reads Section 1.01 as that single definition | a-basic-credit-agreement, c-amendment-supersession, i-secured-debt-lien, m-composed-p0 |
| IPV-20 | CRITICAL_FALSE_PERMISSION | INCORRECT_RESULT | CONTEXT_RETRIEVAL | Definition retrieval hands the compiler the base-agreement definition text even when the operative state holds a RESOLVED amendment to the section the definition lives in | a-basic-credit-agreement, m-composed-p0 |
| IPV-21 | UNSUPPORTED_AS_COMPLETE | INCORRECT_RESULT | CONTEXT_RETRIEVAL | A diamond dependency (a covenant names term T and term U, and U's definition names T) is reported as DEFINITION_CYCLE; the context contract then refuses certification of every such covenant (false refusal) | a-basic-credit-agreement, i-secured-debt-lien, l-affiliate-transactions |
| IPV-22 | CRITICAL_FALSE_PERMISSION | INCORRECT_RESULT | CERTIFICATION | A figure's role and direction are not verified: a comparator-introduced threshold is certified as a basket cap, and a ratio test with its comparator flipped is certified | a-basic-credit-agreement, h-unseen-composition, l-affiliate-transactions |

## IPV-01 — Entity-scope widening is confirmed and certified when the clause narrows the section's governing scope

**Status** OPEN · **Severity** CRITICAL_FALSE_PERMISSION · **Outcome** INCORRECT_RESULT · **Stage** CERTIFICATION · **Deterministic** true

- **failingInput**: 7.01(c): "Indebtedness of the Borrower, so long as … Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00" under a 7.01 lead-in "The Borrower shall not, and shall not permit any Subsidiary to …". Submission sets entityScope [BORROWER, ANY_SUBSIDIARY].
- **expected**: Not CERTIFIED: the clause's own words restrict the ratio basket to the Borrower.
- **actual**: CERTIFIED; entityScopeAudit SOURCE_MATCH_CONFIRMED / safeToRely=true; Layer-1 VERIFIED_NO_MATERIAL_GAP_FOUND (Layer-2 mocked silent).
- **repro**: scripts/product-acceptance: adversarial SET_SCOPE on credit-agreement::7.01 {sectionRef:"7.01(c)", entityScope:["BORROWER","ANY_SUBSIDIARY"]}
- **impact**: A subsidiary could be shown a ratio-based debt basket that the contract reserves for the Borrower.
- **hypothesis**: The entity-scope guard witnesses the scope against the governing section lead-in and accepts any tag set that matches it, without checking the clause's own narrowing phrase ("of the Borrower").
- **acceptance**: A clause whose own text names a narrower entity set than its governing lead-in must downgrade or refuse a wider submitted scope (audit status UNDERINCLUSIVE/AMBIGUOUS or a MATERIAL finding).
- **signatures**: `pkg-a-basic-credit-agreement` → `adversarial:A-P2`

## IPV-02 — A dropped "together with … pursuant to Section X" shared cap certifies as two independent baskets

**Status** OPEN · **Severity** CRITICAL_FALSE_PERMISSION · **Outcome** INCORRECT_RESULT · **Stage** CERTIFICATION · **Deterministic** true

- **failingInput**: 7.06(b) and 7.08(c) each read "in an aggregate amount, together with [the other], not to exceed $20,000,000". Submission omits sharedCapacities.
- **expected**: Not CERTIFIED (MISSING_SHARED_CAP or unaccounted shared-cap source).
- **actual**: CERTIFIED in both the pure-omission and lineage-on-rule variants; Layer-1 VERIFIED_NO_MATERIAL_GAP_FOUND.
- **repro**: adversarial DROP_SHARED_CAPS on credit-agreement::7.06
- **impact**: Capacity reported per clause ($16m remaining) instead of the shared pool ($7m remaining).
- **hypothesis**: Neither the inventory accountability layer (the clause is one inventory item, consumed by the basket rule) nor the Layer-1 deterministic source inventory detects the "together with … pursuant to Section" shared-cap phrase; MISSING_SHARED_CAP exists as a finding type but has no deterministic detector for this drafting.
- **acceptance**: Layer-1 must raise MISSING_SHARED_CAP (or the inventory must carry a separate SHARED_CAP item that cannot be consumed by a plain basket node) for "together with … pursuant to Section" drafting.
- **signatures**: `pkg-f-capacity-ledger-honesty` → `adversarial:F-P3`; `pkg-f-capacity-ledger-honesty` → `adversarial:F-P3:lineage-on-rule`

## IPV-03 — Lineage laundering: a dropped material condition certifies when its inventory item is cited on the rule node

**Status** OPEN · **Severity** MATERIAL_CONDITION_OMISSION · **Outcome** INCORRECT_RESULT · **Stage** CERTIFICATION · **Deterministic** true

- **failingInput**: 7.01(b) "… provided that no Default has occurred …" (A) and 7.03(b) "… provided that the Payment Conditions are satisfied" (H). Submission emits the basket with zero conditions but lists the proviso's inventory item id on the rule node.
- **expected**: Not CERTIFIED (the CONDITION-role item is not represented by any condition node).
- **actual**: CERTIFIED with 0 conditions; the same omission WITHOUT the rule-level citation is correctly refused (COMPILATION_NOT_COMPLETED).
- **repro**: adversarial DROP_CONDITIONS, variant LINEAGE_ON_RULE
- **impact**: An unconditional basket where the contract has a no-Default / Payment Conditions gate.
- **hypothesis**: Accountability treats any node citing an item as consuming it; a CONDITION-role item consumed by a rule node (not a condition node) is not checked for role/node compatibility, and Layer-1 condition detection does not fire on the proviso.
- **acceptance**: A CONDITION/EXCEPTION/SHARED_CAP-role inventory item must be consumed by a node of a compatible kind; otherwise MISSING_FROM_COMPOSITION.
- **signatures**: `pkg-a-basic-credit-agreement` → `adversarial:A-P1:lineage-on-rule`; `pkg-h-unseen-composition` → `adversarial:H-P3:lineage-on-rule`

## IPV-04 — A section-level candidate is compiled from superseded/deleted sub-clause text with no operative lineage

**Status** OPEN · **Severity** WRONG_OPERATIVE_SOURCE · **Outcome** INCORRECT_RESULT · **Stage** SEMANTIC_COMPOSITION · **Deterministic** true

- **failingInput**: Amendment No. 1 restates 7.01(b) ($25m → $40m + no-Default proviso); Amendment No. 2 deletes 7.01(e). Operative state resolves both (RESOLVED). Candidate anchored at SECTION 7.01, as of 2026-06-30.
- **expected**: The operative text handed to composition excludes the superseded $25,000,000 text and the deleted $15,000,000 clause, or the candidate carries lineage/evidence status that forbids treating them as current.
- **actual**: Operative text still contains both; operativeLineage null; Layer-1 raises MISSING_BASKET for $25,000,000 and $15,000,000 (demanding the stale baskets) and rejects the correct $40,000,000 excerpt as NOT_IN_SOURCE. The clause-level 7.01(b) candidate receives the amended text correctly, but its compiled rule has a null provenance excerpt and its context bundle is derived from the base text (the amended proviso's term "Default" is not retrieved). Breadth (T4, package B First Supplemental Indenture restating indenture 4.09(c) to $75,000,000 effective 2026-05-01): the amendment resolves against the SECOND instrument correctly (4.09(c) SUPERSEDED at 2026-06-30, CURRENT at 2026-03-31, credit agreement untouched), yet the section-level candidate indenture::4.09 is still handed operative text containing the superseded '$50,000,000' with lineage null - the same stale-parent-span defect on a second instrument.
- **repro**: buildCandidateCompilerInput(candidate 7.01, operativeState@2026-06-30).operativeSourceText; faithful submission for credit-agreement::7.01
- **impact**: Any section-level unit over an amended agreement is verified against the wrong text; a deleted basket can be certified as live.
- **hypothesis**: Supersession is attached per physical node; the parent section's operative text is the base DESCENDANTS span and the per-node supersession index is not consulted when assembling it; the clause-level path binds provenance against the amendment text but context retrieval scans the base node.
- **acceptance**: A candidate whose descendants are superseded/deleted at the as-of date must have its operative text spliced from the operative provisions (or be refused with an explicit lineage status); context retrieval and provenance binding must use the operative text.
- **signatures**: `pkg-c-amendment-supersession` → `operative-text:credit-agreement::7.01`; `pkg-c-amendment-supersession` → `semantic:C-7.01(b)-amended`; `pkg-c-amendment-supersession` → `context:C-7.01(b)-amended:definitions`; `pkg-c-amendment-supersession` → `certification:credit-agreement::7.01`; `pkg-b-multi-document` → `operative-text:indenture::4.09`

## IPV-05 — An unresolved amendment leaves the instrument's operative state RESOLVED with zero unattached effects

**Status** OPEN · **Severity** WRONG_OPERATIVE_SOURCE · **Outcome** INCORRECT_RESULT · **Stage** OPERATIVE_STATE · **Deterministic** true

- **failingInput**: "FIRST AMENDMENT dated as of December 1, 2026 to the ABL Credit Agreement dated as of September 9, 2026" restating the definition of "Available Amount". Base document title: "ABL CREDIT AGREEMENT dated as of September 9, 2026".
- **expected**: SUPERSEDED definition as of 2027-03-31 ($15,000,000 starter), or an operative state that is not RESOLVED.
- **actual**: Package graph: AMENDS → UNRESOLVED ("no explicit reference to another agreement (by name + execution date)"); amendment effect UNRESOLVED; computeOperativeContractState for the ABL instrument reports OPERATIVE_STATE_RESOLVED with 0 provisions and 0 unattached effects. The optional disclosure input `unresolvedTargetEffectsForThisInstrument` is not passed by any production caller. Consequence carried on disk by the definition-currency audit: 7.03(b) is compiled against the base 'Available Amount' ($10,000,000) although the manifest's amendment restates it to $15,000,000 - the amendment never resolved, so retrieval cannot know (IPV-20 is the separate case where the amendment IS resolved and retrieval still reads the base text).
- **repro**: runAmendmentPipeline → effects[0].status; computeOperativeContractState({instrumentKey:'instrument:abl-credit-agreement', asOfDate:'2027-03-31'})
- **impact**: A consumer reading the instrument state sees a clean RESOLVED state and the pre-amendment definition.
- **hypothesis**: Relationship resolution requires an exact agreement-type label match ("Credit Agreement" vs "ABL Credit Agreement") and the operative-state layer only discloses unresolved effects the caller affirmatively attributes; no production caller does.
- **acceptance**: An amendment-shaped document whose target cannot be resolved must surface in the operative state of every candidate instrument in the package as REVIEW_REQUIRED/PARTIAL, never as RESOLVED with none.
- **signatures**: `pkg-h-unseen-composition` → `operative:2027-03-31:abl-credit-agreement#Available Amount`; `pkg-h-unseen-composition` → `context:H-7.03(b):definition-currency:Available Amount`

## IPV-06 — Inline enumerations inside a definition are minted as structural nodes and capture the following definitions

**Status** OPEN · **Severity** SOURCE_PROVENANCE_FAILURE · **Outcome** INCORRECT_RESULT · **Stage** STRUCTURE · **Deterministic** true

- **failingInput**: "Payment Conditions" means … (i) no Default … and (ii) Availability … not less than the greater of (A) $12,500,000 and (B) 12.5% of the Borrowing Base. followed by "Subsidiary" means … and "Term Loan Agreement" means …
- **expected**: Definitions sourced from Section 1.01; no SUBSECTION/CLAUSE nodes 1.01(i), 1.01(ii), 1.01(ii)(A), 1.01(ii)(B).
- **actual**: Nodes 1.01(i), 1.01(ii), 1.01(ii)(A), 1.01(ii)(B) exist; "Subsidiary" and "Term Loan Agreement" are attributed to source node 1.01(ii)(B). Package E likewise mints 1.01(a)/(b)/(c) from the "Available Amount" definition.
- **repro**: resolveUniqueDefinitionByRef(index, 'abl-credit-agreement', 'Subsidiary').definition.sourceNodeId
- **impact**: Wrong source citations for definitions; downstream provenance points at a clause that does not exist in the drafting.
- **hypothesis**: The enumerator parser does not distinguish an enumeration that starts mid-sentence inside a quoted definition from a hanging-indent clause list.
- **acceptance**: Enumerators inside a definition sentence stay inside the definition record; subsequent definitions are sourced to the definitions section.
- **signatures**: `pkg-h-unseen-composition` → `definition:abl-credit-agreement#Subsidiary`; `pkg-h-unseen-composition` → `definition:abl-credit-agreement#Term Loan Agreement`

## IPV-07 — A dropped enumeration letter merges the next clause into the previous sibling

**Status** OPEN · **Severity** MISSING_REQUIRED_COVENANT · **Outcome** INCORRECT_RESULT · **Stage** STRUCTURE · **Deterministic** true

- **failingInput**: 7.03 enumerates (a), (b), (d) - (c) absent (a conformed copy with a dropped letter).
- **expected**: 7.03(d) is its own node (or an ENUMERATION_GAP ambiguity), carrying the $2,500,000 basket.
- **actual**: No 7.03(d) node; the (d) text and its $2,500,000 value are absorbed into 7.03(b)'s own text. The deterministic layers then flag the unrepresented value under (b) (REVIEW), so the clause is never attributable to (d).
- **repro**: resolveUniqueNodeByRef('credit-agreement','7.03(d)') → NOT_FOUND
- **impact**: A basket attributed to the wrong clause; its cross-references by letter fail silently.
- **hypothesis**: The enumerator state machine requires contiguous letters and treats a non-successor enumerator as prose continuation.
- **acceptance**: A non-contiguous enumerator either opens a node (with an ENUMERATION_GAP health finding) or produces an explicit ambiguity; never silent absorption.
- **signatures**: `pkg-g-adversarial-evidence` → `structure:credit-agreement#7.03(d)`; `pkg-g-adversarial-evidence` → `discovery:pass-a-coverage`

## IPV-08 — Non-operative exhibit "Term:" lines become definition records with no source node

**Status** OPEN · **Severity** SOURCE_PROVENANCE_FAILURE · **Outcome** INCORRECT_RESULT · **Stage** STRUCTURE · **Deterministic** true

- **failingInput**: EXHIBIT A - SUMMARY OF PRINCIPAL TERMS: "Indebtedness: the Borrower may incur Indebtedness in an aggregate principal amount of up to $100,000,000 …" (self-declared non-operative).
- **expected**: No definition record for "Indebtedness", "Liens", "Restricted Payments" from the exhibit.
- **actual**: Three definition records attributed to the exhibit with sourceNodeId null (the exhibit yields zero structural nodes).
- **repro**: index.allDefinitions().filter(d => d.documentId === 'exhibit-summary-of-terms')
- **impact**: A $100,000,000 non-operative figure enters the definition index and can be retrieved as a definition of Indebtedness.
- **hypothesis**: The definition detector accepts a "Capitalized Term:" colon pattern without requiring a defining verb or a definitions section.
- **acceptance**: Colon-style term lines outside a definitions context are not definition records, or are recorded with operative=false and excluded from retrieval.
- **signatures**: `pkg-g-adversarial-evidence` → `definition-forbidden:credit-agreement#Indebtedness<-exhibit-summary-of-terms`

## IPV-09 — Plural use of a defined term is not resolved to its definition

**Status** OPEN · **Severity** NONMATERIAL_OMISSION · **Outcome** INCORRECT_RESULT · **Stage** CONTEXT_RETRIEVAL · **Deterministic** true

- **failingInput**: "Dispositions of property …", "Investments in Subsidiaries …", "Restricted Payments in an aggregate amount …" with singular definitions "Disposition", "Investment", "Restricted Payment".
- **expected**: The singular definition is retrieved as a DEFINITION context item.
- **actual**: Not retrieved; the singular form in sibling clauses is retrieved. Package I adds: "Guarantors", "Foreign Subsidiaries", "Liens" not resolved to Guarantor / Foreign Subsidiary / Lien.
- **repro**: buildCandidateCompilerInput(candidateFor('credit-agreement','7.05(j)')).bundle.items
- **impact**: Pass B compiles without the governing definition in context; sufficiency can be overstated.
- **hypothesis**: Term matching is exact-string on the defined term; no inflection normalization.
- **acceptance**: Regular plural/possessive forms of a defined term resolve to the definition (with the matched form recorded).
- **signatures**: `pkg-d-qualitative-restrictions` → `context:D-7.05(j):definitions`; `pkg-e-structural-ambiguity` → `context:E-7.06(b):definitions`; `pkg-f-capacity-ledger-honesty` → `context:F-7.06(b):definitions`; `pkg-f-capacity-ledger-honesty` → `context:F-7.08(c):definitions`; `pkg-g-adversarial-evidence` → `context:G-7.03(a):definitions`; `pkg-i-secured-debt-lien` → `context:I-7.01(b):definitions`; `pkg-i-secured-debt-lien` → `context:I-7.01(c):definitions`; `pkg-i-secured-debt-lien` → `context:I-7.02(a):definitions`; `pkg-i-secured-debt-lien` → `context:I-7.02(b):definitions`; `pkg-i-secured-debt-lien` → `context:I-7.02(c):definitions`; `pkg-k-three-way-builder` → `context:K-7.06(c):definitions`; `pkg-k-three-way-builder` → `context:K-7.08(d):definitions`; `pkg-m-composed-p0` → `context:M-7.01(b):definitions`

## IPV-10 — Undefined terms inside a retrieved definition are not reported; the bundle claims SUFFICIENT

**Status** OPEN · **Severity** UNSUPPORTED_AS_COMPLETE · **Outcome** INCORRECT_RESULT · **Stage** CONTEXT_RETRIEVAL · **Deterministic** true

- **failingInput**: 7.11 depends on "Fixed Charge Coverage Ratio" (defined) which depends on "Consolidated EBITDA" and "Fixed Charges" (never defined).
- **expected**: Unresolved dependencies for the two undefined terms; sufficiency not SUFFICIENT.
- **actual**: sufficiency SUFFICIENT; the two unresolved items reported are heading/fragment noise ("Financial Covenant", "Fixed Charge Coverage Ratio of"). Package J: Total Leverage Ratio → Consolidated EBITDA / Consolidated Total Debt (undefined) not reported; bundle SUFFICIENT.
- **repro**: buildCandidateCompilerInput(candidateFor('abl-credit-agreement','7.11')).bundle
- **impact**: A springing financial covenant is presented as computable when its metric is undefined.
- **hypothesis**: Undefined-term detection runs on the operative text only, not on retrieved definition text.
- **acceptance**: Capitalized multi-word terms inside retrieved definitions that resolve to no definition are reported as UNRESOLVED_DEFINED_TERM with appropriate severity.
- **signatures**: `pkg-h-unseen-composition` → `context:H-7.11`; `pkg-j-restricted-payments-builder` → `context:J-7.06(c)`

## IPV-11 — Table-of-contents lines are parsed as duplicate ARTICLE/SECTION nodes on the certified path; every covenant becomes ambiguous

**Status** OPEN · **Severity** UNSUPPORTED_AS_COMPLETE · **Outcome** CAPABILITY_NOT_IMPLEMENTED · **Stage** STRUCTURE · **Deterministic** true

- **failingInput**: A TABLE OF CONTENTS block ("SECTION 7.01 Indebtedness ..... 62") preceding the operative text.
- **expected**: The operative 7.01/7.02/7.06 resolve uniquely; TOC lines are not provisions.
- **actual**: parseDocumentStructure mints a node per TOC line; resolveUniqueNodeByRef → AMBIGUOUS for every section; context bundles INCOMPLETE (AMBIGUOUS_RELATIVE_REFERENCE HIGH); 0 of 7 candidates certifiable; the cross-reference "Section 7.01(b)(ii)(A)" (a unique subclause) resolves to no node. parseDocumentStructureWithTriage correctly flags the six TOC lines as AMBIGUOUS candidates, but the certified pipeline (scripts/p3-conmed-pilot) uses the plain parser.
- **repro**: resolveUniqueNodeByRef('credit-agreement','7.01'); parseDocumentStructureWithTriage(doc).ambiguousCandidates
- **impact**: Fail-closed (nothing wrong is certified) but any agreement with a TOC is uncertifiable on the certified path.
- **hypothesis**: Wiring gap: the triage/ambiguity-resolution structure stage is not on the certified path.
- **acceptance**: Certified path consumes the triage parser (or a deterministic TOC filter); TOC lines never become nodes.
- **signatures**: `pkg-e-structural-ambiguity` → `structure:credit-agreement#7.01`; `pkg-e-structural-ambiguity` → `certification:credit-agreement::7.06#2`; `pkg-e-structural-ambiguity` → `certification:credit-agreement::7.02#2`; `pkg-e-structural-ambiguity` → `certification:credit-agreement::7.01#2`

## IPV-12 — A self-referential definition trips DEFINITION_CYCLE and blocks certification of every dependent covenant

**Status** OPEN · **Severity** NONMATERIAL_OMISSION · **Outcome** CAPABILITY_NOT_IMPLEMENTED · **Stage** CONTEXT_RETRIEVAL · **Deterministic** true

- **failingInput**: "Unrestricted Subsidiary" means any Subsidiary of the Issuer designated as an Unrestricted Subsidiary …; "Restricted Subsidiary" means any Subsidiary … that is not an Unrestricted Subsidiary.
- **expected**: Standard drafting; bundle SUFFICIENT.
- **actual**: DEFINITION_CYCLE/MEDIUM on Restricted Subsidiary → bundle REVIEW_REQUIRED → VERIFICATION_INCOMPLETE → NOT_CERTIFIED for 4.09 (and the indenture definitions candidate). Package I: DEFINITION_CYCLE on "Subsidiary" and "Guarantor" ("Guarantor" means each Subsidiary that has executed the Guarantee; "Foreign Subsidiary" means any Subsidiary …) blocks 7.01, 7.02 and 7.04 - no genuine cycle exists. (Package I's 7.01/7.02/7.04 signatures were re-attributed to IPV-21 on 2026-10-08: their DEFINITION_CYCLE is a false cycle on a diamond dependency, not a self-referential definition.)
- **repro**: buildCandidateCompilerInput(candidateFor('indenture','4.09')).bundle.unresolvedDependencies
- **impact**: Fail-closed, but a ubiquitous drafting pattern makes indenture covenants uncertifiable.
- **hypothesis**: The cycle detector treats a term's own name appearing inside its definition ("designated as an Unrestricted Subsidiary") as a dependency edge.
- **acceptance**: A definition that mentions its own term is not a cycle; genuine A→B→A cycles still are.
- **signatures**: `pkg-b-multi-document` → `certification:indenture::4.09`

## IPV-13 — Action-ontology guard misreads "make any Disposition" (gap) and "purchase money Indebtedness" (PREPAY_DEBT)

**Status** OPEN · **Severity** NONMATERIAL_OMISSION · **Outcome** INCORRECT_RESULT · **Stage** SEMANTIC_COMPOSITION · **Deterministic** true

- **failingInput**: 7.05 "shall not … make any Disposition" submitted as SELL_ASSET; 7.01(b)(ii)(A) "purchase money Indebtedness may be secured by the property so acquired" submitted as INCUR_DEBT.
- **expected**: Consistent (ASSET_SALES/SELL_ASSET) or an explicit ontology gap that does not force review; purchase-money debt is INCUR_DEBT/CREATE_LIEN, never PREPAY_DEBT.
- **actual**: ACTION_INCONSISTENT_WITH_SOURCE_ACT: "make any Disposition" ONTOLOGY_GAP (uncovered) vs SELL_ASSET; "purchase money Indebtedness" read as PREPAY_DEBT. Both force REVIEW on a correct submission.
- **repro**: faithful submission for credit-agreement::7.05 / credit-agreement::7.01#2 → compilation.unresolvedIssues
- **impact**: False reviews on correct units; a wrong canonical act recorded.
- **hypothesis**: "Disposition" is not in the SELL_ASSET verb set; a "purchase" token inside "purchase money" matches PREPAY/purchase heuristics.
- **acceptance**: Ontology covers Disposition/dispose; multi-word terms of art (purchase money) are matched as a unit.
- **signatures**: `pkg-d-qualitative-restrictions` → `action-ontology:credit-agreement::7.05`; `pkg-e-structural-ambiguity` → `action-ontology:credit-agreement::7.01#2`

## IPV-14 — Residual fail-closed outcomes on faithful submissions (recorded, not defects): unaccounted Layer-1 items on 2.05 and 7.01 (C) and the stale-text rejection of the correct amended basket

**Status** OPEN · **Severity** NONMATERIAL_OMISSION · **Outcome** CORRECT_FAIL_CLOSED · **Stage** CERTIFICATION · **Deterministic** true

- **failingInput**: D 2.05 (mandatory prepayment with a time period); G second SECTION 7.01 occurrence (a genuine duplicate label).
- **expected**: CERTIFIED for a faithful submission (D); AMBIGUOUS/REVIEW for a genuinely duplicated section (G).
- **actual**: D 2.05 REVIEW_REQUIRED (1 Layer-1 source item unaccounted - the mock did not represent the 'five Business Days' period as a unit); G 7.01#2 NOT_CERTIFIED with AMBIGUOUS_RELATIVE_REFERENCE - the correct outcome for a conflicting duplicate. Package I 9.15: REVIEW_REQUIRED (1 Layer-1 source item unaccounted - the "Notwithstanding anything to the contrary in Article VII" override phrase is not a unit the mock represents).
- **repro**: faithful submission for credit-agreement::2.05 / credit-agreement::7.01#2
- **impact**: None (fail-closed); listed so the register accounts for every finding in the report.
- **hypothesis**: Mock incompleteness (D) and correct behaviour (G).
- **acceptance**: Close when the acceptance matrix no longer reports them, or re-classify if a real cause emerges.
- **signatures**: `pkg-d-qualitative-restrictions` → `certification:credit-agreement::2.05`; `pkg-g-adversarial-evidence` → `certification:credit-agreement::7.01#2`; `pkg-i-secured-debt-lien` → `certification:credit-agreement::9.15`; `pkg-k-three-way-builder` → `certification:credit-agreement::7.06`; `pkg-k-three-way-builder` → `certification:credit-agreement::7.08`

## IPV-15 — Shared capacity mediated through a definition (Available Amount netting across 7.06(c)/7.08(d)) has no representation channel; a dependsOn to the sibling is rejected as invented

**Status** OPEN · **Severity** NONMATERIAL_OMISSION · **Outcome** CORRECT_FAIL_CLOSED · **Stage** SEMANTIC_COMPOSITION · **Deterministic** true

- **failingInput**: "Available Amount" means … minus the aggregate amount of Restricted Payments made under Section 7.06(c) and Investments made under Section 7.08(d) …; 7.08(d) permits Investments up to the Available Amount.
- **expected**: 7.08(d) and 7.06(c) are linked as sharing one pool (via the definition) and the Default kill-switch inside the definition is attached to both.
- **actual**: A dependsOn from 7.08(d) to Section 7.06(c) is excluded as MODEL_INVENTED_REFERENCE (the clause's own text never names 7.06(c)) and the unit stays REVIEW. The link exists only in the definition text; neither sharedCapacities (member rules) nor dependsOn can carry a definition-mediated relationship without the source-reference guard rejecting it.
- **repro**: faithful submission for pkg-j credit-agreement::7.08 → compilation.unresolvedIssues (MODEL_INVENTED_REFERENCE_EXCLUDED)
- **impact**: Fail-closed today (REVIEW). A future model that drops the link to satisfy the guard would report two independent $20,000,000 baskets (J-P2).
- **hypothesis**: The source-reference fidelity guard scopes admissible references to the unit's own text and its retrieved regions; definition text that names other sections is not an admissible reference source for the citing unit.
- **acceptance**: References stated inside a retrieved definition the unit depends on are admissible for that unit, or a definition-level shared-capacity construct exists.
- **signatures**: `pkg-j-restricted-payments-builder` → `certification:credit-agreement::7.08`

## IPV-16 — A side letter that overrides a covenant cap 'notwithstanding' the credit agreement produces no amendment effect; the operative state stays RESOLVED with the base-agreement text

**Status** OPEN · **Severity** CRITICAL_FALSE_PERMISSION · **Outcome** INCORRECT_RESULT · **Stage** OPERATIVE_STATE · **Deterministic** true

- **failingInput**: Package B plus an in-memory side letter (role AMENDMENT, effective 2026-03-01): 'Notwithstanding Section 7.01(b) of the Credit Agreement, the Borrower agrees that it shall not incur other Indebtedness under Section 7.01(b) … exceeding $10,000,000' (MUT-12; the tightening direction). MUT-08 is the loosening twin ($60,000,000). Also: MUT-13 (A, $10m), MUT-14 (C, $30m 'notwithstanding Section 7.01(b) … as amended by Amendment No. 1'), MUT-15 (H, 7.02(d) $2.5m), MUT-16 (I, consent raising 7.02(b) to $30m).
- **expected**: The override reaches the operative state as an effect on 7.01(b) (resolved, REVIEW_REQUIRED or unattached) so the instrument state is not reported RESOLVED with the base text as current; at minimum the instrument state carries the unresolved override.
- **actual**: runAmendmentPipeline yields 0 effects and 0 unattached effects from the side letter (0 interpreter calls: the deterministic parser produces no modification candidate for 'notwithstanding … shall not … exceeding'); computeOperativeContractState(2026-06-30) is OPERATIVE_STATE_RESOLVED with no provision view for 7.01(b), so 7.01(b) reads $30,000,000 CURRENT. The package graph does record a cross-document lead side-letter→credit-agreement (REVIEW_REQUIRED) and the hybrid closure includes side-letter#1, but neither is propagated to the operative state. Breadth (mutants MUT-13…16, same mechanism): a tightening side letter on the single-agreement package A, on package C after two real amendments (the amendments still apply; the override is dropped), on the ABL package H (7.02(d)), and a lender CONSENT on package I ('The Required Lenders hereby consent to … notwithstanding the limitation in Section 7.02(b)') - 0 effects in every case. ON DISK (package M, side letter effective 2026-05-01 capping 7.01(b) at $15,000,000): no provision view for 7.01(b); the base node is CURRENT_OPERATIVE at 2026-06-30; the manifest's expectation that the side letter governs fails in the acceptance run (first acceptance-run signature for this defect).
- **repro**: npx tsx -e "import('./scripts/product-acceptance/mutations').then(async m=>{const {loadPackage}=await import('./scripts/product-acceptance/corpus');const o=await m.observeMutation(loadPackage('pkg-b-multi-document'),m.MUTATIONS.find(x=>x.id==='MUT-12'));console.log(o.verdicts.filter(v=>v.kind==='PRODUCT'))})"
- **impact**: A consumer that answers capacity from the operative state (the certified path's lineage input) would report a $30,000,000 cap where the package caps it at $10,000,000: a false permission of $20,000,000. In the loosening direction (MUT-08) the answer is merely stale ($30m instead of $60m). The dangerous direction is deterministic and silent.
- **hypothesis**: modification-candidates.ts recognises amend/restate/replace/delete/insert drafting forms only; an override or waiver clause ('notwithstanding', 'the Lenders agree that', 'shall not … exceeding') is not a modification candidate, so the amendment pipeline never sees it and the operative state has no channel for an unparsed override. The REVIEW_REQUIRED cross-document lead at the package-graph level is informational only.
- **acceptance**: A side letter / waiver / override document that names a section of the base agreement yields at least an unattached or REVIEW_REQUIRED effect for that instrument (operative state not RESOLVED), or a documented package-level 'unclassified override document' blocker that the certification path consumes. Verified by MUT-08/MUT-12 PRODUCT verdicts passing.
- **signatures**: `pkg-b-multi-document` → `mutation:MUT-12:instrument-status:2026-06-30`; `pkg-b-multi-document` → `mutation:MUT-12:effects:side-letter`; `pkg-b-multi-document` → `mutation:MUT-08:instrument-status:2026-06-30`; `pkg-b-multi-document` → `mutation:MUT-08:effects:side-letter`; `pkg-a-basic-credit-agreement` → `mutation:MUT-13:instrument-status:2026-06-30`; `pkg-a-basic-credit-agreement` → `mutation:MUT-13:effects:side-letter`; `pkg-c-amendment-supersession` → `mutation:MUT-14:instrument-status:2026-06-30`; `pkg-c-amendment-supersession` → `mutation:MUT-14:effects:side-letter`; `pkg-h-unseen-composition` → `mutation:MUT-15:instrument-status:2027-03-31`; `pkg-h-unseen-composition` → `mutation:MUT-15:effects:side-letter`; `pkg-i-secured-debt-lien` → `mutation:MUT-16:instrument-status:2026-12-31`; `pkg-i-secured-debt-lien` → `mutation:MUT-16:effects:consent`; `pkg-m-composed-p0` → `operative:2026-06-30:credit-agreement#7.01(b)`

## IPV-17 — [CLOSED - harness false positive] Definition-mediated cross-reference closure appeared asymmetric for J 7.08(d); the sibling was present under a different bundle item type

**Status** CLOSED · **Severity** MISSING_DEPENDENCY · **Outcome** INCORRECT_RESULT · **Stage** CONTEXT_RETRIEVAL · **Deterministic** true

- **failingInput**: "Available Amount" means … minus the aggregate amount of Restricted Payments made under Section 7.06(c) and Investments made under Section 7.08(d) …; candidate credit-agreement::7.08(d) ("Investments in an aggregate amount not to exceed the Available Amount").
- **expected**: The context bundle for 7.08(d) carries a CROSS_REFERENCE item for 7.06(c) (reached through the retrieved Available Amount definition), exactly as the bundle for 7.06(c) carries one for 7.08(d). The structural index resolves both references from 1.01 (Section 7.06(c)→7.06(c):resolved, Section 7.08(d)→7.08(d):resolved).
- **actual**: buildCandidateCompilerInput(7.08(d)).bundle.items contains CROSS_REFERENCE 7.08(d) (depth 2, 'Referenced within a definition's own text ("Section 7.08(d)")' - the candidate's own section) and no item for 7.06(c); sufficiencyState SUFFICIENT with zero unresolved dependencies. For 7.06(c) the bundle contains CROSS_REFERENCE 7.08(d), VII, 7.06, 7.08 and (correctly) no self item. The same definition therefore yields a different reference set depending on which sibling is being compiled, and the one it drops is the earlier-named sibling.
- **repro**: npx tsx: loadPackage('pkg-j-restricted-payments-builder') → runDeterministicStages → buildCandidateCompilerInput(candidateFor(index,'credit-agreement','7.08(d)',…), candidatePkg).bundle.items.filter(i=>i.type==='CROSS_REFERENCE') (see acceptance check context:J-7.08(d):cross-references)
- **impact**: None (false positive). The deterministic root claimed under IPV-15 does not exist at the retrieval layer; IPV-15 remains a representation gap at the semantic layer only.
- **hypothesis**: Withdrawn: the positional-drop hypothesis was wrong (K control symmetric).
- **acceptance**: Met: context:J-7.08(d):cross-references and context:K-*:cross-references pass.
- **signatures**: `pkg-j-restricted-payments-builder` → `context:J-7.08(d):cross-references`

## IPV-18 — No covenant family exists for voluntary prepayments / redemptions of junior (subordinated) debt; the normalizer silently relabels the unit QUALITATIVE_NEGATIVE_COVENANTS

**Status** OPEN · **Severity** UNSUPPORTED_AS_COMPLETE · **Outcome** CORRECT_FAIL_CLOSED · **Stage** SEMANTIC_COMPOSITION · **Deterministic** true

- **failingInput**: SECTION 7.09 Prepayments of Junior Indebtedness. The Borrower shall not prepay, redeem or repurchase any Junior Indebtedness, except: (a) … equity proceeds; (b) prepayments in an aggregate amount not to exceed the Available Amount. Submission labels the family PREPAYMENTS_OF_JUNIOR_DEBT (no production family fits: the Prisma CovenantFamily enum has RESTRICTED_PAYMENTS, MANDATORY_PREPAYMENTS, … but nothing for restricted debt payments).
- **expected**: A family for restricted debt payments (junior / subordinated debt prepayment covenants are standard in leveraged credit agreements and share builder pools with Restricted Payments and Investments), or an explicit UNSUPPORTED_FAMILY refusal that names the gap.
- **actual**: normalize.ts: matchEnum fails and defaults to QUALITATIVE_NEGATIVE_COVENANTS with a 'verify manually' issue; compilation REVIEW_REQUIRED; certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, UNIT_SUFFICIENCY_INCOMPLETE]. The harness's semantic audit records the family mismatch as WRONG_OPERATIVE_SOURCE (its label for 'representation does not match the source'); the product outcome is fail-closed.
- **repro**: pkg-k faithful submission for credit-agreement::7.09 → compilation.unresolvedIssues ('covenantFamily "PREPAYMENTS_OF_JUNIOR_DEBT" not recognized - defaulted to QUALITATIVE_NEGATIVE_COVENANTS')
- **impact**: Fail-closed today (REVIEW). The relabelled unit loses its action (null) and family cue, so a builder pool shared with 7.06(c)/7.08(d) cannot be represented across all three members even once IPV-15 is fixed; the runtime's shared-pool arithmetic would exclude 7.09(b).
- **hypothesis**: The family enum was grown from the covenant families seen in the evaluation packages; junior-debt prepayment covenants were absent from them.
- **acceptance**: A family (e.g. RESTRICTED_DEBT_PAYMENTS) with an action, or an explicit refusal naming an unsupported family; verified by semantic:K-7.09(b) and certification:credit-agreement::7.09 passing with the faithful submission.
- **signatures**: `pkg-k-three-way-builder` → `semantic:K-7.09`; `pkg-k-three-way-builder` → `semantic:K-7.09(b)`; `pkg-k-three-way-builder` → `certification:credit-agreement::7.09`

## IPV-19 — A definition amendment ('The definition of "X" in Section 1.01 … is hereby amended and restated … to read as follows') is resolved as a REPLACE_TEXT of the whole of Section 1.01; the operative state then reads Section 1.01 as that single definition

**Status** OPEN · **Severity** WRONG_OPERATIVE_SOURCE · **Outcome** INCORRECT_RESULT · **Stage** OPERATIVE_STATE · **Deterministic** true

- **failingInput**: Package A plus an in-memory Amendment No. 1 (effective May 1, 2026): 'The definition of "Consolidated EBITDA" in Section 1.01 of the Credit Agreement is hereby amended and restated in its entirety to read as follows: "Consolidated EBITDA" means … and non-cash stock compensation expense for such period.' (form F1; F3 'set forth in Section 1.01 … to read in its entirety as follows' behaves the same).
- **expected**: A DEFINITION-kind effect (targetDefinedTermRef 'Consolidated EBITDA') applied from 2026-05-01, so that the operative definition changes and Section 1.01's other ten definitions are untouched; or an unresolved/REVIEW effect.
- **actual**: runAmendmentPipeline: one effect, target kind SECTION, targetSectionRef 1.01, operation REPLACE_TEXT, status RESOLVED, resolved deterministically (0 interpreter calls). computeOperativeContractState(2026-06-30): instrument OPERATIVE_STATE_RESOLVED; provision SECTION 1.01 applied 1, currentText = the 243-character restated definition, where the base Section 1.01 is 1,537 characters holding eleven definitions. Form F2 ('Section 1.01 … is hereby amended by amending and restating the definition of …') goes to the interpreter and is REVIEW_REQUIRED (correct fail-closed offline). INV-05b: the same mis-targeting for a definition amendment that REMOVES an add-back (A) and for a definition amendment layered on package C after two resolved section amendments (the two section amendments stay intact; the definition amendment again becomes a REPLACE_TEXT of Section 1.01, currentText 153 chars). ON DISK (package I, Amendment No. 1 effective 2026-10-15 restating 'Foreign Subsidiary' to exclude Canadian Subsidiaries): no DEFINITION provision view for 'Foreign Subsidiary'; Section 1.01 SUPERSEDED with currentText lacking every other definition; and the certified path's definitions candidate for 1.01, compiled from that operative text, now reports Permitted Liens, Guarantor, Foreign Subsidiary and Lien MISSING (semantic:credit-agreement::1.01) - the downstream consequence predicted above, now evidenced in the acceptance run. COMPOSITION (package M: definition amendment + side letter + Guarantor/Subsidiary definitions): the mis-targeted Section 1.01 replacement makes every unit that depends on a 1.01 definition carry 'unresolved operative evidence (partial amendment state)', so 7.01 and 7.02 are REVIEW_REQUIRED with OPERATIVE_STATE_UNACCEPTABLE. That fail-closed side effect is currently the only thing preventing the IPV-16 ($40,000,000 after the side letter) and IPV-20 (stale EBITDA) false permissions from certifying on M: the adversarial M-P1 is 'refused' solely by it. Fixing IPV-19 before IPV-16/IPV-20 would expose both. The Guarantor/Subsidiary diamond did not fire here because 7.01(b) says 'Guarantors' (plural) and the mention finder is singular-only (IPV-09) - two defects cancelling.
- **repro**: npx tsx scripts/product-acceptance/run-invariants.ts → INV-05 (scripts/product-acceptance/invariants.ts, DEFINITION_AMENDMENT_FORMS F1/F3)
- **impact**: Evidence corruption at the operative-state layer (priority 0): every other definition in Section 1.01 is reported superseded with no text as of the amendment date; a consumer compiling the definitions candidate from the operative text would see one definition. The amendment itself is applied to the wrong unit, so lineage for 'Consolidated EBITDA' never exists (see IPV-20 for the retrieval consequence).
- **hypothesis**: The deterministic parser's target resolver matches 'in Section 1.01' before (or instead of) 'the definition of "…"', so the explicit-pattern path binds a SECTION target with the restated text as the replacement; the DEFINITION target kind exists in the type but this drafting form never reaches it.
- **acceptance**: F1 and F3 yield a DEFINITION-kind effect (or REVIEW), the 1.01 provision keeps its other definitions, and a DEFINITION provision view for 'Consolidated EBITDA' exists at 2026-06-30 with the new text; invariant:INV-05:F1/F3 PRODUCT verdicts pass.
- **signatures**: `pkg-a-basic-credit-agreement` → `invariant:INV-05:F1:effect-targets-definition`; `pkg-a-basic-credit-agreement` → `invariant:INV-05:F1:state-section-1.01-not-replaced`; `pkg-a-basic-credit-agreement` → `invariant:INV-05:F3:effect-targets-definition`; `pkg-a-basic-credit-agreement` → `invariant:INV-05:F3:state-section-1.01-not-replaced`; `pkg-a-basic-credit-agreement` → `invariant:INV-05b:A:effect-targets-definition`; `pkg-a-basic-credit-agreement` → `invariant:INV-05b:A:state-section-1.01-not-replaced`; `pkg-a-basic-credit-agreement` → `invariant:INV-05b:C:definition-amendment-targets-definition`; `pkg-i-secured-debt-lien` → `operative:2026-12-31:credit-agreement#Foreign Subsidiary`; `pkg-i-secured-debt-lien` → `operative:2026-12-31:credit-agreement#1.01`; `pkg-i-secured-debt-lien` → `semantic:credit-agreement::1.01`; `pkg-m-composed-p0` → `operative:2026-06-30:credit-agreement#Consolidated EBITDA`; `pkg-m-composed-p0` → `operative:2026-06-30:credit-agreement#1.01`; `pkg-m-composed-p0` → `semantic:credit-agreement::1.01`; `pkg-m-composed-p0` → `certification:credit-agreement::7.01`; `pkg-m-composed-p0` → `certification:credit-agreement::7.02`

## IPV-20 — Definition retrieval hands the compiler the base-agreement definition text even when the operative state holds a RESOLVED amendment to the section the definition lives in

**Status** OPEN · **Severity** CRITICAL_FALSE_PERMISSION · **Outcome** INCORRECT_RESULT · **Stage** CONTEXT_RETRIEVAL · **Deterministic** true

- **failingInput**: As IPV-19; buildCandidateCompilerInput for credit-agreement::7.01 with operativeState(2026-06-30), amendmentEffects and supersessionIndex supplied.
- **expected**: The DEFINITION / DEFINITION_DEPENDENCY item for 'Consolidated EBITDA' at 2026-06-30 carries the amended text (with the stock-compensation add-back), or the bundle flags the definition's supersession status as unresolved.
- **actual**: The bundle item for Consolidated EBITDA carries the original base-agreement text ('… depreciation and amortization expense for such period.'); no flag. The ratio basket 7.01(c) would be compiled against the pre-amendment EBITDA. INV-05b (false-permission direction): with an amendment that removes the income-tax add-back resolved in the operative state, the compiler is still handed the base definition WITH the add-back - every ratio basket would be sized on an overstated EBITDA. ON DISK (package M): 7.01(c) is handed the base Consolidated EBITDA (with income tax expense) at 2026-06-30 although Amendment No. 1 removed it from 2026-04-01 (definition-currency audit).
- **repro**: npx tsx scripts/product-acceptance/run-invariants.ts → INV-05 bundle-definition-current
- **impact**: Demonstrated in the false-permission direction (INV-05b): a definition amendment that shrinks EBITDA leaves the compiler with the larger pre-amendment definition. Mechanism independent of IPV-19: definition items are read from the static definitions index, never re-resolved against the operative state.
- **hypothesis**: buildCovenantContextBundle resolves definitions through the static definitions index (exactTermsByDocument / allDefinitions) and only consults the operative state for the candidate's own anchor node (operativeSourceTextFor / deriveOperativeLineage).
- **acceptance**: With a resolved definition amendment, the definition item text equals the operative text and the item records its lineage; invariant:INV-05:F1/F3 bundle-definition-current pass.
- **signatures**: `pkg-a-basic-credit-agreement` → `invariant:INV-05:F1:bundle-definition-current`; `pkg-a-basic-credit-agreement` → `invariant:INV-05:F3:bundle-definition-current`; `pkg-a-basic-credit-agreement` → `invariant:INV-05b:A:bundle-definition-current`; `pkg-m-composed-p0` → `context:M-7.01(c):definition-currency:Consolidated EBITDA`

## IPV-21 — A diamond dependency (a covenant names term T and term U, and U's definition names T) is reported as DEFINITION_CYCLE; the context contract then refuses certification of every such covenant (false refusal)

**Status** OPEN · **Severity** UNSUPPORTED_AS_COMPLETE · **Outcome** INCORRECT_RESULT · **Stage** CONTEXT_RETRIEVAL · **Deterministic** true

- **failingInput**: Minimal reproduction (INV-19, package A in memory): add '"Guarantor" means each Subsidiary that has executed the Guarantee.' and make 7.01(b) read 'other Indebtedness of the Borrower and any Guarantor …'. 'Subsidiary' means any corporation or other entity that is controlled by the Borrower (no reference back). Real packages: I 7.01 (Subsidiary/Guarantor), L 7.07 (Loan Parties/Subsidiary).
- **expected**: No DEFINITION_CYCLE: Subsidiary is reached by two paths (directly and through Guarantor) but no definition refers to itself or to a term that refers back to it. Context contract acceptable. The B indenture's Restricted Subsidiary ↔ Unrestricted Subsidiary pair, which IS circular, keeps being reported (positive control passes).
- **actual**: buildCandidateCompilerInput → bundle.unresolvedDependencies contains DEFINITION_CYCLE 'guarantor -> subsidiary -> guarantor' (MEDIUM), sufficiency REVIEW_REQUIRED; the same definition without the covenant naming Guarantors reports nothing (control). I 7.01: 'subsidiary -> guarantor -> subsidiary'; L 7.07: 'loan parties -> subsidiary -> loan parties'. Certification of I 7.01/7.02/7.04 and L 7.07 is blocked with CONTEXT_CONTRACT_UNACCEPTABLE. (The acceptance run records the blocked certifications as NONMATERIAL_OMISSION / CAPABILITY_NOT_IMPLEMENTED: fail-closed; the defect-level severity UNSUPPORTED_AS_COMPLETE names the false refusal.)
- **repro**: npx tsx scripts/product-acceptance/run-invariants.ts → INV-19 (scripts/product-acceptance/invariants.ts)
- **impact**: False refusal on the most common definitional drafting in credit agreements ('Guarantor' / 'Loan Party' / 'Restricted Subsidiary' defined in terms of 'Subsidiary'): every covenant naming both terms is uncertifiable. Fail-closed, so no false permission, but it makes a realistic package unusable and masks adversarial evidence (I-P2, L-P1…P3 refusals cite this blocker). Breadth (INV-19b): 4 of the 33 section-level manifest covenants across the twelve packages are blocked by a false cycle (I 7.01, 7.02, 7.04; L 7.07); the only genuine cycle in the corpus (B indenture) is reported correctly.
- **hypothesis**: context-retrieval/definition-graph.ts retrieveDefinitionsRecursive: the reported path 'guarantor -> subsidiary -> guarantor' is only possible if, while expanding Subsidiary (whose own text names no Guarantor), the text being scanned still contains 'Guarantor' - i.e. the candidate's or the parent's sourceText is scanned at depth 2 instead of the newly retrieved definition's text, or pathTermsStack is not popped between sibling expansions. Not traced line by line.
- **acceptance**: invariant:INV-19:diamond-is-not-a-cycle, no-false-cycle:i:7.01 and no-false-cycle:l:7.07 pass while true-cycle-still-reported keeps passing; I 7.01/7.02/7.04 and L 7.07 certification rows no longer cite CONTEXT_CONTRACT_UNACCEPTABLE for a cycle.
- **signatures**: `pkg-a-basic-credit-agreement` → `invariant:INV-19:diamond-is-not-a-cycle`; `pkg-a-basic-credit-agreement` → `invariant:INV-19:no-false-cycle:i:7.01`; `pkg-a-basic-credit-agreement` → `invariant:INV-19:no-false-cycle:l:7.07`; `pkg-i-secured-debt-lien` → `certification:credit-agreement::7.01`; `pkg-i-secured-debt-lien` → `certification:credit-agreement::7.02`; `pkg-i-secured-debt-lien` → `certification:credit-agreement::7.04`; `pkg-l-affiliate-transactions` → `certification:credit-agreement::7.07`; `pkg-b-multi-document` → `invariant:INV-19b:no-false-cycles-corpus-wide`

## IPV-22 — A figure's role and direction are not verified: a comparator-introduced threshold is certified as a basket cap, and a ratio test with its comparator flipped is certified

**Status** OPEN · **Severity** CRITICAL_FALSE_PERMISSION · **Outcome** INCORRECT_RESULT · **Stage** CERTIFICATION · **Deterministic** true

- **failingInput**: L 7.07(d): '(d) any other transaction with an Affiliate involving aggregate consideration in excess of $5,000,000, so long as such transaction has been approved by a majority of the disinterested members of the board of directors of the Borrower.' Submission (adversarial L-P2, CLAIM_COMPLETE): rule for 7.07(d) with capacityExpression MONEY 5,000,000 (excerpt '$5,000,000', verbatim in the source), one APPROVAL condition, sufficiency COMPLETE. Run on the in-memory L variant without the Loan-Parties diamond so IPV-21 does not mask the result.
- **expected**: Not CERTIFIED: the figure is the lower bound of the gate ('in excess of'), not a cap; the clause has no quantitative capacity at all. At minimum REVIEW_REQUIRED with a numeric-direction or 'threshold vs cap' finding.
- **actual**: certification CERTIFIED []; verification VERIFIED_NO_MATERIAL_GAP_FOUND []; compilation COMPLETED; the deterministic numeric assertion check finds the $5,000,000 figure in the source and the excerpt is verbatim, so nothing objects. Layer-2 reviewer is mocked (silent); whether a live reviewer would catch it is untested (doc 15 E3). Breadth (INV-25b, every comparator-introduced dollar figure in the corpus): H intercreditor 4.01 'shall not make any payment … if Availability would be less than $15,000,000' submitted as a $15,000,000 payment basket is CERTIFIED (second instance, different document type); H 7.11's springing trigger ($10,000,000) and H 7.03(b) with the Payment Conditions floor ($12,500,000, a figure that lives in a definition) are refused - the latter two for Layer-1 accountability reasons (missing baskets / figure not in the clause's own text), not because the comparator was understood. INV-09b (ratio direction): A 7.01(c) 'so long as … the Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00' submitted with the COMPARE operator flipped to GTE ('available when the ratio is at least 3.50') is CERTIFIED with VERIFIED_NO_MATERIAL_GAP_FOUND; the same clause with the threshold raised to 4.50 is refused (the figure is absent from the source), and B 4.09 flipped is refused only because of its genuine definition cycle (IPV-12), so that case is masked.
- **repro**: npx tsx scripts/product-acceptance/run-invariants.ts → INV-25 (scripts/product-acceptance/invariants.ts); the same submission on the on-disk package L is refused only because of IPV-21.
- **impact**: A treasury user would be told 7.07(d) gives $5,000,000 of Affiliate-transaction room without board approval; the clause gives none. Same class as IPV-01/02/03: the deterministic gates verify figures and excerpts, not the comparator or the role of the figure (threshold vs cap). Two of five comparator-introduced figures in the corpus certify as caps (L 7.07(d), H ICA 4.01). A flipped ratio comparator inverts when a ratio basket is available (open when leverage is high instead of low) and passes every deterministic gate.
- **hypothesis**: semantic-verification/numeric-assertion.ts matches currency amounts by value and the verifier's reconciliation accepts any source figure as accounting for a capacity expression; no check relates the figure's comparator phrase ('in excess of', 'not less than', 'greater than') to the capacity direction. The same gap covers COMPARE operators: numeric-assertion / reconciliation verify that each figure in the IR appears in the source, never that the operator matches the source's comparator phrase.
- **acceptance**: invariant:INV-25:L-P2-refused passes: a MONEY capacity whose only source figure is introduced by 'in excess of' / 'exceeding' / 'greater than' is refused or forced to REVIEW with a named finding. And: invariant:INV-09b:A-T1-refused passes (a COMPARE operator inconsistent with the clause's comparator phrase is refused or forced to REVIEW).
- **signatures**: `pkg-l-affiliate-transactions` → `invariant:INV-25:L-P2-refused`; `pkg-h-unseen-composition` → `invariant:INV-25b:H-T2-refused`; `pkg-a-basic-credit-agreement` → `invariant:INV-09b:A-T1-refused`

## Observations (not defects)

- HardDispatchBudget refuses any request whose model has no rate card (UNPRICEABLE_MODEL) - a safety property; the mock therefore carries a priced model id while the client is a stand-in.
- The inventory stage skips a caller flagged isSynthetic (INVENTORY_SKIPPED_NO_PROVIDER) and the compilation then fails closed - honest, but it means a synthetic-provider dry run can never exercise accountability.
- Any non-empty Pass B overallNotes string is treated as an unresolved issue and forces compilation REVIEW_REQUIRED (COMPILATION_NOT_COMPLETED).
- computeOperativeContractState with an instrument key that does not match the package graph's `instrument:<base>` key returns OPERATIVE_STATE_RESOLVED with zero provisions (silent). Production scripts pass a hard-coded constant that must match.
- A definition with sufficiency PARTIAL makes every dependent capacity AMBIGUOUS at runtime ('legal state not safe to rely on') - honest; a reported value must declare overridesDefinitionId to be used.
- The runtime dependency manifest queries a bare term/metric reference with the evaluation date as an EXACT as-of selector; an approved pack dated earlier is NEEDS_INPUT, never carried forward (verified F-R2c).
- Pass A deterministic signals are over-inclusive by design: they fire on a stale amendment's '$60,000,000' section; the amendment pipeline then leaves it UNRESOLVED and no supersession is applied (verified).
