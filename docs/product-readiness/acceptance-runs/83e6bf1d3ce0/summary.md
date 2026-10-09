# Offline product-acceptance run — 83e6bf1d3ce0

Generated 2026-10-08T16:04:34.056Z on branch `claude/independent-product-validation` (dirty tree). Corpus identity `27b06b5857e06e76…`.

## Execution contract

Provider calls: **0**. Network: **NONE**.

Mocked stages: SEMANTIC_INVENTORY, SEMANTIC_COMPOSITION, SEMANTIC_VERIFICATION_LAYER2. Not run: DISCOVERY_PASS_B_PLUS, AMENDMENT_INTERPRETER.

- Discovery Pass B–D were not run; the semantic candidate population is manifest-declared. Nothing here measures discovery coverage.
- Pass A inventory and Pass B composition were answered by scripted stand-ins derived from the fixtures and manifests. Nothing here measures model extraction quality.
- The Layer-2 reviewer and the condition-suspicion classifier returned zero findings by construction. Every refusal recorded is a deterministic-layer refusal; every acceptance is 'deterministic gates did not object'.
- The amendment interpreter, when invoked, answered UNKNOWN_CHANGE with confidence 0 (production fail-closed path).
- Package F runtime cases ran production runtime code over a hand-built fixture IR, not over compiler output.
- No certification evidence was produced or implied by this run.

## Totals

| checks | pass | fail | not tested | findings |
|---|---|---|---|---|
| 444 | 388 | 42 | 14 | 42 |

Findings by severity: MATERIAL_CONDITION_OMISSION 2, CRITICAL_FALSE_PERMISSION 3, NONMATERIAL_OMISSION 25, WRONG_OPERATIVE_SOURCE 2, SOURCE_PROVENANCE_FAILURE 4, UNSUPPORTED_AS_COMPLETE 3, MISSING_REQUIRED_COVENANT 2, MISSING_DEPENDENCY 1.

Findings by outcome class: INCORRECT_RESULT 29, CAPABILITY_NOT_IMPLEMENTED 8, CORRECT_FAIL_CLOSED 5.

## pkg-a-basic-credit-agreement

Package A — basic single credit agreement

Checks 40: pass 37, fail 2, not tested 1.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 1 as-of date(s) × 1 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 14 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 8 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 7 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | NOT_RUN | No runtime cases declared for this package. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-a-basic-credit-agreement:F1 | CERTIFICATION (mocked input) | MATERIAL_CONDITION_OMISSION | INCORRECT_RESULT | adversarial:A-P1:lineage-on-rule | certification CERTIFIED []; verification VERIFIED_NO_MATERIAL_GAP_FOUND []; compilation COMPLETED; target rule sufficiency COMPLETE, 0 cond, capacity MONEY scope=[BORROWER] audit UNWITNESSED/safe=false |
| pkg-a-basic-credit-agreement:F2 | CERTIFICATION (mocked input) | CRITICAL_FALSE_PERMISSION | INCORRECT_RESULT | adversarial:A-P2 | certification CERTIFIED []; verification VERIFIED_NO_MATERIAL_GAP_FOUND []; compilation COMPLETED; target rule sufficiency COMPLETE, 2 cond, capacity UNLIMITED_CAPACITY scope=[BORROWER,ANY_SUBSIDIARY] audit SOURCE_MATCH_CONFIRMED/safe=true |

<details><summary>Observations</summary>

- instrument keys from package graph: credit-agreement→instrument:credit-agreement (manifest key "harbor-lane-credit-agreement-2026" would yield RESOLVED/zero provisions)
- amendment effects: 0 (none); unattached: 0; conflicts: 0
- Pass A deterministic signals cover 6/6 material covenants (self or ancestor)
- semantic stage mock calls: inventory=14 passB=8 verifier/classifier=7; candidates=4; adversarial cases=3
- faithful run: package certification REVIEW_REQUIRED (3 certified / 1 review / 0 not certified of 4); blockers: CANDIDATE_REVIEW_REQUIRED, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM
- credit-agreement::7.01: outcome MAPPED, compilation COMPLETED (4 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- credit-agreement::7.02: outcome MAPPED, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- credit-agreement::7.03: outcome MAPPED, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 8 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, UNIT_SUFFICIENCY_INCOMPLETE]

</details>

## pkg-b-multi-document

Package B — credit agreement plus indenture with conflicting defined terms

Checks 48: pass 46, fail 1, not tested 1.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 1 as-of date(s) × 2 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 16 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 9 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 8 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | NOT_RUN | No runtime cases declared for this package. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-b-multi-document:F1 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CAPABILITY_NOT_IMPLEMENTED | certification:indenture::4.09 | NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE] verification VERIFICATION_INCOMPLETE / context bundle sufficiency REVIEW_REQUIRED:  / bundle: DEFINITION_CYCLE/MEDIUM: Restricted Subsidiary |

<details><summary>Observations</summary>

- instrument keys from package graph: credit-agreement→instrument:credit-agreement, indenture→instrument:indenture (manifest key "northfield-credit-agreement-2026" would yield RESOLVED/zero provisions)
- amendment effects: 0 (none); unattached: 0; conflicts: 0
- Pass A deterministic signals cover 11/11 material covenants (self or ancestor)
- semantic stage mock calls: inventory=16 passB=9 verifier/classifier=8; candidates=6; adversarial cases=2
- faithful run: package certification FAILED (3 certified / 1 review / 2 not certified of 6); blockers: CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_REVIEW_REQUIRED, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM
- credit-agreement::7.01: outcome MAPPED, compilation COMPLETED (4 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- indenture::4.09: outcome MAPPED_WITH_REVIEW, compilation COMPLETED (5 rules, 0 defs, 0 shared), verification VERIFICATION_INCOMPLETE [], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE]
- indenture::4.10: outcome MAPPED, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- credit-agreement::7.02: outcome MAPPED, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 3 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED]
- indenture::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 4 defs, 0 shared), verification VERIFICATION_INCOMPLETE [WRONG_ENTITY_SCOPE/NON_MATERIAL], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, UNACCOUNTED_MATERIAL_SOURCE]

</details>

## pkg-c-amendment-supersession

Package C — original agreement with two amendments (restate and delete)

Checks 40: pass 35, fail 4, not tested 1.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 3 as-of date(s) × 1 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 14 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 8 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 7 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | NOT_RUN | No runtime cases declared for this package. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-c-amendment-supersession:F1 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:C-7.01(b)-amended:definitions | not in bundle (retrieved: Indebtedness); operative text uses the term as "Default" |
| pkg-c-amendment-supersession:F2 | SEMANTIC_COMPOSITION (mocked input) | WRONG_OPERATIVE_SOURCE | INCORRECT_RESULT | operative-text:credit-agreement::7.01 | operative text handed to Pass B still contains 7.01(b) SUPERSEDED: "$25,000,000"; 7.01(e) DELETED: "$15,000,000"; lineage null; Layer-1 source findings: MISSING_BASKET:$25,000,000, MISSING_BASKET:$15,000,000, UNSUPPORTED_IR_ADDITION:(no single source ex, QUALITATIVE_ASSERTION_UNGROUNDED:(the cited e |
| pkg-c-amendment-supersession:F3 | SEMANTIC_COMPOSITION (mocked input) | SOURCE_PROVENANCE_FAILURE | INCORRECT_RESULT | semantic:C-7.01(b)-amended | provenance excerpt null |
| pkg-c-amendment-supersession:F4 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CORRECT_FAIL_CLOSED | certification:credit-agreement::7.01 | REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, SUPPORT_UNACCEPTABLE, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN] compilation REVIEW_REQUIRED: INVENTORY_ITEM_MISSING_FROM_COMPOSITION / 5 open MATERIAL/UNCERTAIN finding(s) / 2 mate |

<details><summary>Observations</summary>

- instrument keys from package graph: credit-agreement→instrument:credit-agreement (manifest key "westmark-credit-agreement-2025" would yield RESOLVED/zero provisions)
- amendment effects: 2 (amendment-1→credit-agreement#7.01(b) REPLACE_TEXT RESOLVED eff August 15, 2025; amendment-2→credit-agreement#7.01(e) DELETE_TEXT RESOLVED eff February 2, 2026); unattached: 0; conflicts: 0
- Pass A deterministic signals cover 6/6 material covenants (self or ancestor)
- semantic stage mock calls: inventory=14 passB=8 verifier/classifier=7; candidates=4; adversarial cases=3
- faithful run: package certification REVIEW_REQUIRED (2 certified / 2 review / 0 not certified of 4); blockers: CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM, UNBOUND_EXECUTABLE_BINDING, UNBOUND_EXECUTABLE_BINDING
- credit-agreement::7.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (5 rules, 0 defs, 0 shared), verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL, MISSING_BASKET/MATERIAL, UNSUPPORTED_IR_ADDITION/MATERIAL, QUALITATIVE_ASSERTION_UNGROUNDED/MATERIAL, QUALITATIVE_ASSERTION_UNGROUNDED/MATERIAL], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, SUPPORT_UNACCEPTABLE, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]
- credit-agreement::7.02: outcome MAPPED, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- credit-agreement::7.01(b)@clause: outcome MAPPED, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 2 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED]

</details>

## pkg-d-qualitative-restrictions

Package D — unlimited carve-out with gating conditions, hanging proviso and an undefined term

Checks 34: pass 30, fail 3, not tested 1.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 1 as-of date(s) × 1 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 12 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 11 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 6 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | NOT_RUN | No runtime cases declared for this package. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-d-qualitative-restrictions:F1 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:D-7.05(j):definitions | not in bundle (retrieved: none); operative text uses the term as "Dispositions" |
| pkg-d-qualitative-restrictions:F2 | SEMANTIC_COMPOSITION (mocked input) | NONMATERIAL_OMISSION | INCORRECT_RESULT | action-ontology:credit-agreement::7.05 | [rule[r1]] ACTION_INCONSISTENT_WITH_SOURCE_ACT: action SELL_ASSET - the source act "make any Disposition" (ONTOLOGY_GAP: uncovered) does not fall in SELL_ASSET (OWN_SOURCE 7.05); the canonical action  |
| pkg-d-qualitative-restrictions:F3 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CORRECT_FAIL_CLOSED | certification:credit-agreement::2.05 | REVIEW_REQUIRED [UNACCOUNTED_MATERIAL_SOURCE] 1 material source item(s) are not accounted for by the IR |

<details><summary>Observations</summary>

- instrument keys from package graph: credit-agreement→instrument:credit-agreement (manifest key "pinecrest-credit-agreement-2026" would yield RESOLVED/zero provisions)
- amendment effects: 0 (none); unattached: 0; conflicts: 0
- Pass A deterministic signals cover 5/5 material covenants (self or ancestor)
- semantic stage mock calls: inventory=12 passB=11 verifier/classifier=6; candidates=3; adversarial cases=3
- faithful run: package certification REVIEW_REQUIRED (0 certified / 3 review / 0 not certified of 3); blockers: CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM, UNBOUND_EXECUTABLE_BINDING, UNBOUND_EXECUTABLE_BINDING, UNBOUND_EXECUTABLE_BINDING
- credit-agreement::7.05: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (4 rules, 0 defs, 0 shared), verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL, MISSING_RULE/NON_MATERIAL], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]
- credit-agreement::2.05: outcome MAPPED, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFIED_WITH_NON_MATERIAL_FINDINGS [MISSING_RULE/NON_MATERIAL], certification REVIEW_REQUIRED [UNACCOUNTED_MATERIAL_SOURCE]
- credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 4 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED]

</details>

## pkg-e-structural-ambiguity

Package E — table of contents, nested enumeration, inline definition enumeration, builder basket and hanging shared cap

Checks 49: pass 39, fail 6, not tested 4.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 1 as-of date(s) × 1 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 30 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 13 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 9 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | NOT_RUN | No runtime cases declared for this package. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-e-structural-ambiguity:F1 | STRUCTURE | UNSUPPORTED_AS_COMPLETE | CORRECT_FAIL_CLOSED | structure:credit-agreement#7.01 | AMBIGUOUS (2 occurrence(s)): "SECTION 7.01 Indebtedness ..... 62" / "SECTION 7.01 Indebtedness . The Borrower shall not" |
| pkg-e-structural-ambiguity:F2 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:E-7.06(b):definitions | not in bundle (retrieved: none); operative text uses the term as "Restricted Payments" |
| pkg-e-structural-ambiguity:F3 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CAPABILITY_NOT_IMPLEMENTED | certification:credit-agreement::7.06#2 | NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE] verification VERIFICATION_INCOMPLETE / context bundle sufficiency INCOMPLETE:  / 1 HIGH-severity unresolved context dependency / bundle: AMBIGUOUS_RELATIVE_REFERENCE/HIGH: SECTION 7.06; AMBIGUOU |
| pkg-e-structural-ambiguity:F4 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CAPABILITY_NOT_IMPLEMENTED | certification:credit-agreement::7.02#2 | NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE, DEPENDENCY_INVALID, UNACCOUNTED_MATERIAL_SOURCE] verification VERIFICATION_INCOMPLETE / compilation REVIEW_REQUIRED: [rule[r2]] dependsOn[0].targetRef "Section 7.01(b) |
| pkg-e-structural-ambiguity:F5 | SEMANTIC_COMPOSITION (mocked input) | NONMATERIAL_OMISSION | INCORRECT_RESULT | action-ontology:credit-agreement::7.01#2 | guard reads "purchase money Indebtedness" as PREPAY_DEBT (forces REVIEW on a correct submission) |
| pkg-e-structural-ambiguity:F6 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CAPABILITY_NOT_IMPLEMENTED | certification:credit-agreement::7.01#2 | NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE, UNIT_SUFFICIENCY_INCOMPLETE] verification VERIFICATION_INCOMPLETE / compilation REVIEW_REQUIRED: [rule[r3]] ACTION_INCONSISTENT_WITH_SOURCE_ACT: action INCUR_DEBT - th |

<details><summary>Observations</summary>

- structure health diagnostics: DUPLICATE_LABEL_EXPECTED, AMBIGUOUS_LEGAL_REFERENCE, DUPLICATE_LABEL_EXPECTED, AMBIGUOUS_LEGAL_REFERENCE, DUPLICATE_LABEL_EXPECTED, AMBIGUOUS_LEGAL_REFERENCE, DUPLICATE_LABEL_EXPECTED, AMBIGUOUS_LEGAL_REFERENCE, DUPLICATE_LABEL_EXPECTED, AMBIGUOUS_LEGAL_REFERENCE, DUPLICATE_LABEL_EXPECTED, AMBIGUOUS_LEGAL_REFERENCE, DUPLICATE_NORMALIZED_PATH, DUPLICATE_NORMALIZED_PATH, DUPLICATE_NORMALIZED_PATH, DUPLICATE_NORMALIZED_PATH, DUPLICATE_NORMALIZED_PATH, DUPLICATE_NORMALIZED_PATH
- instrument keys from package graph: credit-agreement→instrument:credit-agreement (manifest key "ironvale-credit-agreement-2026" would yield RESOLVED/zero provisions)
- amendment effects: 0 (none); unattached: 0; conflicts: 0
- Pass A deterministic signals cover 9/9 material covenants (self or ancestor)
- credit-agreement: non-operative text "SECTION 7.01 Indebtedness ..... 62…" sits in 1 structural node(s) (7.01), Pass A hits 1
- semantic stage mock calls: inventory=30 passB=13 verifier/classifier=9; candidates=7; adversarial cases=5
- faithful run: package certification FAILED (0 certified / 0 review / 7 not certified of 7); blockers: BLOCKING_UNRESOLVED_ITEM, CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, DEPENDENCY_UNKNOWN, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM
- credit-agreement::7.06#1: outcome COMPILE_FAILED, compilation FAILED (0 rules, 0 defs, 0 shared), verification none [], certification NOT_CERTIFIED [COMPILATION_FAILED!, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE] failure=PARTIAL_COMPILATION:PARTIAL_COMPILATION,SEMANTIC_INVENTORY_COVERAGE_GAP
- credit-agreement::7.06#2: outcome MAPPED_WITH_REVIEW, compilation COMPLETED (3 rules, 0 defs, 0 shared), verification VERIFICATION_INCOMPLETE [], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE]
- credit-agreement::7.02#1: outcome COMPILE_FAILED, compilation FAILED (0 rules, 0 defs, 0 shared), verification none [], certification NOT_CERTIFIED [COMPILATION_FAILED!, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE] failure=PARTIAL_COMPILATION:PARTIAL_COMPILATION,SEMANTIC_INVENTORY_COVERAGE_GAP
- credit-agreement::7.02#2: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (2 rules, 0 defs, 0 shared), verification VERIFICATION_INCOMPLETE [MISSING_DEPENDENCY/NON_MATERIAL], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE, DEPENDENCY_INVALID, UNACCOUNTED_MATERIAL_SOURCE]
- credit-agreement::7.01#1: outcome COMPILE_FAILED, compilation FAILED (0 rules, 0 defs, 0 shared), verification none [], certification NOT_CERTIFIED [COMPILATION_FAILED!, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE] failure=PARTIAL_COMPILATION:PARTIAL_COMPILATION,SEMANTIC_INVENTORY_COVERAGE_GAP
- credit-agreement::7.01#2: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (4 rules, 0 defs, 1 shared), verification VERIFICATION_INCOMPLETE [], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE, UNIT_SUFFICIENCY_INCOMPLETE]
- credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 4 defs, 0 shared), verification VERIFICATION_INCOMPLETE [MISSING_RULE/NON_MATERIAL, MISSING_DEPENDENCY/NON_MATERIAL], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE]

</details>

## pkg-f-capacity-ledger-honesty

Package F — capacity, ledger usage, shared caps, foreign currency and reclassification

Checks 57: pass 52, fail 4, not tested 1.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 1 as-of date(s) × 1 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 14 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 13 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 7 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | PRODUCTION | Phase-4 runtime over a HAND-BUILT fixture IR (not compiler output): snapshotInputResolver, buildCapacityGraph, evaluateCapacityState. |
| RUNTIME_SIMULATION | PRODUCTION | simulateTransaction over the same fixture IR. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-f-capacity-ledger-honesty:F1 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:F-7.06(b):definitions | not in bundle (retrieved: none); operative text uses the term as "Restricted Payments", "Investments" |
| pkg-f-capacity-ledger-honesty:F2 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:F-7.08(c):definitions | not in bundle (retrieved: none); operative text uses the term as "Investments", "Restricted Payments" |
| pkg-f-capacity-ledger-honesty:F3 | CERTIFICATION (mocked input) | CRITICAL_FALSE_PERMISSION | INCORRECT_RESULT | adversarial:F-P3 | certification CERTIFIED []; verification VERIFIED_NO_MATERIAL_GAP_FOUND []; compilation COMPLETED |
| pkg-f-capacity-ledger-honesty:F4 | CERTIFICATION (mocked input) | CRITICAL_FALSE_PERMISSION | INCORRECT_RESULT | adversarial:F-P3:lineage-on-rule | certification CERTIFIED []; verification VERIFIED_NO_MATERIAL_GAP_FOUND []; compilation COMPLETED |

<details><summary>Observations</summary>

- instrument keys from package graph: credit-agreement→instrument:credit-agreement (manifest key "summit-ridge-credit-agreement-2026" would yield RESOLVED/zero provisions)
- amendment effects: 0 (none); unattached: 0; conflicts: 0
- Pass A deterministic signals cover 9/9 material covenants (self or ancestor)
- semantic stage mock calls: inventory=14 passB=13 verifier/classifier=7; candidates=4; adversarial cases=3
- faithful run: package certification REVIEW_REQUIRED (2 certified / 2 review / 0 not certified of 4); blockers: CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM, UNBOUND_EXECUTABLE_BINDING
- credit-agreement::7.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (5 rules, 0 defs, 0 shared), verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL, MISSING_RECLASSIFICATION/NON_MATERIAL], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]
- credit-agreement::7.06: outcome MAPPED, compilation COMPLETED (2 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- credit-agreement::7.08: outcome MAPPED, compilation COMPLETED (2 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 3 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED]
- runtime F base state: 7.01(b)=AVAILABLE:USD 32000000, 7.01(c)=NEEDS_INPUT:NOT_DETERMINED(a financial fact this capacity depends on is missing), 7.01(f)=AVAILABLE:EUR 10000000, 7.06(b)=AVAILABLE:USD 7000000, 7.08(c)=AVAILABLE:USD 7000000; snapshotBinding []; ledgerIssues 0

</details>

## pkg-g-adversarial-evidence

Package G — adversarial: non-operative exhibit, recital number, duplicate section, dropped letter, stale amendment, undefined term, truncated document

Checks 48: pass 41, fail 5, not tested 2.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 1 as-of date(s) × 1 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 24 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 14 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 10 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | NOT_RUN | No runtime cases declared for this package. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-g-adversarial-evidence:F1 | STRUCTURE | MISSING_REQUIRED_COVENANT | INCORRECT_RESULT | structure:credit-agreement#7.03(d) | NOT_FOUND (0 occurrence(s)) |
| pkg-g-adversarial-evidence:F2 | STRUCTURE | SOURCE_PROVENANCE_FAILURE | INCORRECT_RESULT | definition-forbidden:credit-agreement#Indebtedness<-exhibit-summary-of-terms | definition record(s) found: exhibit-summary-of-terms:UNIQUE |
| pkg-g-adversarial-evidence:F3 | DISCOVERY_PASS_A | MISSING_REQUIRED_COVENANT | INCORRECT_RESULT | discovery:pass-a-coverage | uncovered: G-7.03(d) (no node) |
| pkg-g-adversarial-evidence:F4 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:G-7.03(a):definitions | not in bundle (retrieved: none); operative text uses the term as "Investments" |
| pkg-g-adversarial-evidence:F5 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CAPABILITY_NOT_IMPLEMENTED | certification:credit-agreement::7.01#2 | NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE] verification VERIFICATION_INCOMPLETE / context bundle sufficiency INCOMPLETE:  / 1 HIGH-severity unresolved context dependency / bundle: AMBIGUOUS_RELATIVE_REFERENCE/HIGH: SECTION 7.01 |

<details><summary>Observations</summary>

- structure health diagnostics: DUPLICATE_LABEL_EXPECTED, AMBIGUOUS_LEGAL_REFERENCE, DUPLICATE_NORMALIZED_PATH
- non-operative document stale-amendment (STALE_AMENDMENT) yields 2 structural node(s) and 0 definition record(s)
- non-operative document exhibit-summary-of-terms (NON_OPERATIVE_EXHIBIT) yields 0 structural node(s) and 3 definition record(s)
- instrument keys from package graph: credit-agreement→instrument:credit-agreement (manifest key "bluewater-credit-agreement-2026" would yield RESOLVED/zero provisions)
- amendment effects: 1 (stale-amendment→?#7.09 MODIFY_PROVISION UNRESOLVED eff March 30, 2024); unattached: 1; conflicts: 0
- Pass A deterministic signals cover 9/10 material covenants (self or ancestor); uncovered: G-7.03(d) (no node)
- Pass A on non-operative stale-amendment: 1 candidate(s) 1
- Pass A on non-operative exhibit-summary-of-terms: 0 candidate(s) 
- credit-agreement: non-operative text "without operative effect, the parties no…" sits in 0 structural node(s) (none - preamble/recital), Pass A hits 0
- exhibit-summary-of-terms (non-operative, NON_OPERATIVE_EXHIBIT): "up to $100,000,000…" sits in 0 node(s); Pass A candidates 0
- stale-amendment (non-operative, STALE_AMENDMENT): "$60,000,000…" sits in 1 node(s); Pass A candidates 1 at 1
- semantic stage mock calls: inventory=24 passB=14 verifier/classifier=10; candidates=5; adversarial cases=5
- faithful run: package certification FAILED (0 certified / 2 review / 3 not certified of 5); blockers: CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM, UNBOUND_EXECUTABLE_BINDING
- credit-agreement::7.01#1: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (4 rules, 0 defs, 0 shared), verification VERIFICATION_INCOMPLETE [], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE, UNIT_SUFFICIENCY_INCOMPLETE]
- credit-agreement::7.01#2: outcome MAPPED_WITH_REVIEW, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFICATION_INCOMPLETE [], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE, CONTEXT_CONTRACT_UNACCEPTABLE]
- credit-agreement::7.03: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (3 rules, 0 defs, 0 shared), verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]
- credit-agreement::7.04: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (1 rules, 0 defs, 0 shared), verification VERIFIED_WITH_NON_MATERIAL_FINDINGS [MISSING_CONDITION/NON_MATERIAL], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE]
- credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 2 defs, 0 shared), verification VERIFICATION_INCOMPLETE [], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE]

</details>

## pkg-h-unseen-composition

Package H — unseen composition: ABL agreement, intercreditor agreement and a definition-changing amendment

Checks 54: pass 48, fail 5, not tested 1.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 2 as-of date(s) × 2 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 24 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 12 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 12 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | NOT_RUN | No runtime cases declared for this package. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-h-unseen-composition:F1 | STRUCTURE | SOURCE_PROVENANCE_FAILURE | INCORRECT_RESULT | definition:abl-credit-agreement#Subsidiary | source node 1.01(ii)(B) ≠ 1.01 |
| pkg-h-unseen-composition:F2 | STRUCTURE | SOURCE_PROVENANCE_FAILURE | INCORRECT_RESULT | definition:abl-credit-agreement#Term Loan Agreement | source node 1.01(ii)(B) ≠ 1.01 |
| pkg-h-unseen-composition:F3 | OPERATIVE_STATE | WRONG_OPERATIVE_SOURCE | INCORRECT_RESULT | operative:2027-03-31:abl-credit-agreement#Available Amount | no provision view recorded for this section/term (provision absent; node supersession=N/A) / upstream: REPLACE_TEXT UNRESOLVED: the source document itself has no resolvable reference to another agreement while instrument state is OPERATIVE_STATE_RESOLVED with 0 unattached |
| pkg-h-unseen-composition:F4 | CONTEXT_RETRIEVAL | UNSUPPORTED_AS_COMPLETE | INCORRECT_RESULT | context:H-7.11 | undefined term "Consolidated EBITDA" not reported as an unresolved dependency; undefined term "Fixed Charges" not reported as an unresolved dependency (3 definition item(s) [abl-credit-agreement], 2 unresolved, sufficiency SUFFICIENT, operative text 373 chars) |
| pkg-h-unseen-composition:F5 | CERTIFICATION (mocked input) | MATERIAL_CONDITION_OMISSION | INCORRECT_RESULT | adversarial:H-P3:lineage-on-rule | certification CERTIFIED []; verification VERIFIED_NO_MATERIAL_GAP_FOUND []; compilation COMPLETED; target rule sufficiency COMPLETE, 0 cond, capacity DEFINED_TERM_REFERENCE scope=[BORROWER] audit UNWITNESSED/safe=false |

<details><summary>Observations</summary>

- instrument keys from package graph: abl-credit-agreement→instrument:abl-credit-agreement, intercreditor-agreement→instrument:intercreditor-agreement (manifest key "copperline-abl-2026" would yield RESOLVED/zero provisions)
- amendment effects: 1 (amendment-1→?#1.01 REPLACE_TEXT UNRESOLVED eff December 1, 2026); unattached: 1; conflicts: 0
- Pass A deterministic signals cover 8/8 material covenants (self or ancestor)
- semantic stage mock calls: inventory=24 passB=12 verifier/classifier=12; candidates=6; adversarial cases=6
- faithful run: package certification FAILED (1 certified / 5 review / 0 not certified of 6); blockers: CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, DEPENDENCY_UNKNOWN, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM, UNBOUND_EXECUTABLE_BINDING
- abl-credit-agreement::7.02: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (3 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, DEPENDENCY_INVALID, UNIT_SUFFICIENCY_INCOMPLETE]
- abl-credit-agreement::7.03: outcome MAPPED, compilation COMPLETED (3 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification CERTIFIED []
- abl-credit-agreement::7.11: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (1 rules, 0 defs, 0 shared), verification REVIEW_REQUIRED [MISSING_BASKET/UNCERTAIN, MISSING_BASKET/UNCERTAIN, MISSING_RULE/NON_MATERIAL], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]
- intercreditor-agreement::4.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (1 rules, 0 defs, 0 shared), verification REVIEW_REQUIRED [MISSING_BASKET/UNCERTAIN], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]
- intercreditor-agreement::2.01: outcome MAPPED, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFIED_WITH_NON_MATERIAL_FINDINGS [MISSING_CONDITION/NON_MATERIAL], certification REVIEW_REQUIRED [UNACCOUNTED_MATERIAL_SOURCE]
- intercreditor-agreement::2.01: non-material candidate, certification REVIEW_REQUIRED [UNACCOUNTED_MATERIAL_SOURCE] observed only
- abl-credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 7 defs, 0 shared), verification MATERIAL_DISCREPANCY [MISSING_BASKET/MATERIAL, MISSING_BASKET/MATERIAL, MISSING_BASKET/MATERIAL, MISSING_BASKET/MATERIAL, MISSING_RULE/NON_MATERIAL], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]

</details>

## pkg-i-secured-debt-lien

Package I — secured debt: a debt basket constrained by a separate lien covenant and an out-of-article secured-debt cap

Checks 45: pass 35, fail 9, not tested 1.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 1 as-of date(s) × 1 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 10 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 6 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 5 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | NOT_RUN | No runtime cases declared for this package. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-i-secured-debt-lien:F1 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:I-7.01(b):definitions | not in bundle (retrieved: Indebtedness); operative text uses the term as "Guarantors" |
| pkg-i-secured-debt-lien:F2 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:I-7.01(c):definitions | not in bundle (retrieved: Indebtedness); operative text uses the term as "Foreign Subsidiary" |
| pkg-i-secured-debt-lien:F3 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:I-7.02(a):definitions | not in bundle (retrieved: none); operative text uses the term as "Liens" |
| pkg-i-secured-debt-lien:F4 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:I-7.02(b):definitions | not in bundle (retrieved: Indebtedness); operative text uses the term as "Liens" |
| pkg-i-secured-debt-lien:F5 | CONTEXT_RETRIEVAL | NONMATERIAL_OMISSION | INCORRECT_RESULT | context:I-7.02(c):definitions | not in bundle (retrieved: none); operative text uses the term as "Liens" |
| pkg-i-secured-debt-lien:F6 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CAPABILITY_NOT_IMPLEMENTED | certification:credit-agreement::7.01 | NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE] verification VERIFICATION_INCOMPLETE / context bundle sufficiency REVIEW_REQUIRED:  / bundle: DEFINITION_CYCLE/MEDIUM: Subsidiary |
| pkg-i-secured-debt-lien:F7 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CAPABILITY_NOT_IMPLEMENTED | certification:credit-agreement::7.02 | NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE] verification VERIFICATION_INCOMPLETE / context bundle sufficiency REVIEW_REQUIRED:  / bundle: DEFINITION_CYCLE/MEDIUM: Subsidiary |
| pkg-i-secured-debt-lien:F8 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CAPABILITY_NOT_IMPLEMENTED | certification:credit-agreement::7.04 | NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE] verification VERIFICATION_INCOMPLETE / context bundle sufficiency REVIEW_REQUIRED:  / bundle: DEFINITION_CYCLE/MEDIUM: Guarantor |
| pkg-i-secured-debt-lien:F9 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CORRECT_FAIL_CLOSED | certification:credit-agreement::9.15 | REVIEW_REQUIRED [UNACCOUNTED_MATERIAL_SOURCE] 1 material source item(s) are not accounted for by the IR |

<details><summary>Observations</summary>

- instrument keys from package graph: credit-agreement→instrument:credit-agreement (manifest key "granite-peak-credit-agreement-2026" would yield RESOLVED/zero provisions)
- amendment effects: 0 (none); unattached: 0; conflicts: 0
- Pass A deterministic signals cover 10/10 material covenants (self or ancestor)
- semantic stage mock calls: inventory=10 passB=6 verifier/classifier=5; candidates=5; adversarial cases=0
- faithful run: package certification FAILED (0 certified / 1 review / 4 not certified of 5); blockers: CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_NOT_CERTIFIED, CANDIDATE_REVIEW_REQUIRED, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM, UNBOUND_EXECUTABLE_BINDING
- credit-agreement::7.01: outcome MAPPED_WITH_REVIEW, compilation COMPLETED (5 rules, 0 defs, 0 shared), verification VERIFICATION_INCOMPLETE [], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE]
- credit-agreement::7.02: outcome MAPPED_WITH_REVIEW, compilation COMPLETED (4 rules, 0 defs, 0 shared), verification VERIFICATION_INCOMPLETE [], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE]
- credit-agreement::7.04: outcome MAPPED_WITH_REVIEW, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFICATION_INCOMPLETE [], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, CONTEXT_CONTRACT_UNACCEPTABLE]
- credit-agreement::9.15: outcome MAPPED, compilation COMPLETED (1 rules, 0 defs, 0 shared), verification VERIFIED_WITH_NON_MATERIAL_FINDINGS [MISSING_CONDITION/NON_MATERIAL], certification REVIEW_REQUIRED [UNACCOUNTED_MATERIAL_SOURCE]
- credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 4 defs, 0 shared), verification VERIFICATION_INCOMPLETE [WRONG_ENTITY_SCOPE/NON_MATERIAL, MISSING_DEPENDENCY/NON_MATERIAL], certification NOT_CERTIFIED [VERIFICATION_NOT_COMPLETED!, COMPILATION_NOT_COMPLETED, CONTEXT_CONTRACT_UNACCEPTABLE, UNACCOUNTED_MATERIAL_SOURCE]

</details>

## pkg-j-restricted-payments-builder

Package J — restricted payments builder basket constrained by a definition elsewhere

Checks 29: pass 25, fail 3, not tested 1.

| stage | mode | note |
|---|---|---|
| STRUCTURE | PRODUCTION | parseDocumentStructure + detectStructuralDefinitions/References + buildStructuralIndex |
| PACKAGE_GRAPH | PRODUCTION | buildPackageGraph (classification, identities, relationships, modification candidates) |
| DISCOVERY_PASS_A | PRODUCTION | runPassADeterministicSignals per document (Pass B–D need a provider: NOT_RUN) |
| DISCOVERY_PASS_B_PLUS | NOT_RUN | Semantic discovery passes require a provider. The candidate population for the semantic stage is MANIFEST-DECLARED, which is a capability gap recorded in the report, not evidence of discovery coverage. |
| AMENDMENT_DETERMINISTIC | PRODUCTION | runAmendmentPipeline deterministic pass + independent verification gate |
| AMENDMENT_INTERPRETER | NOT_RUN | No ambiguous amendment operation needed interpretation; the interpreter was never invoked. |
| OPERATIVE_STATE | PRODUCTION | computeOperativeContractState + buildNodeSupersessionIndex for 1 as-of date(s) × 1 instrument(s) |
| SEMANTIC_INVENTORY | MOCKED | 6 Pass A calls answered by the scripted inventory stand-in (verbatim propositions; no model). |
| SEMANTIC_COMPOSITION | MOCKED | 5 Pass B calls answered by manifest-derived scripted submissions (faithful + adversarial); the production normalizer, source coverage, provenance binding and composition checks ran on them. |
| SEMANTIC_VERIFICATION_LAYER1 | PRODUCTION | Deterministic Layer-1 verification ran on every compiled candidate. |
| SEMANTIC_VERIFICATION_LAYER2 | MOCKED | 3 reviewer/classifier calls answered with zero findings / NO_MATERIAL_CONDITION_SUSPECTED. No evidence about reviewer behaviour. |
| CERTIFICATION | PRODUCTION | certifyCandidate/certifyPackage ran on the (mocked-input) artefacts; a CERTIFIED verdict here means 'the deterministic gates did not object', not 'the model was right'. |
| RUNTIME_CAPACITY | NOT_RUN | No runtime cases declared for this package. |

| id | stage | severity | outcome | expectation | actual |
|---|---|---|---|---|---|
| pkg-j-restricted-payments-builder:F1 | CONTEXT_RETRIEVAL | UNSUPPORTED_AS_COMPLETE | INCORRECT_RESULT | context:J-7.06(c) | undefined term "Consolidated EBITDA" not reported as an unresolved dependency; undefined term "Consolidated Total Debt" not reported as an unresolved dependency (8 definition item(s) [credit-agreement], 1 unresolved, sufficiency SUFFICIENT, operative text 187 chars) |
| pkg-j-restricted-payments-builder:F2 | CONTEXT_RETRIEVAL | MISSING_DEPENDENCY | INCORRECT_RESULT | context:J-7.08(d):cross-references | no structural reference to 7.06(c) from 7.08(d) and no CROSS_REFERENCE bundle item for it (refs seen: none; bundle cross-references: 7.08(d)) |
| pkg-j-restricted-payments-builder:F3 | CERTIFICATION (mocked input) | NONMATERIAL_OMISSION | CORRECT_FAIL_CLOSED | certification:credit-agreement::7.08 | REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, UNIT_SUFFICIENCY_INCOMPLETE] compilation REVIEW_REQUIRED: [rule[r3]] MODEL_INVENTED_REFERENCE_EXCLUDED: rule[r3].dependsOn[0] emitted "Section 7.06(c)", which the candidate's source never s / executable unit(s) are not COMPLETE / issues: [rule[r3]] MODEL_I |

<details><summary>Observations</summary>

- instrument keys from package graph: credit-agreement→instrument:credit-agreement (manifest key "lakeshore-credit-agreement-2026" would yield RESOLVED/zero provisions)
- amendment effects: 0 (none); unattached: 0; conflicts: 0
- Pass A deterministic signals cover 6/6 material covenants (self or ancestor)
- semantic stage mock calls: inventory=6 passB=5 verifier/classifier=3; candidates=3; adversarial cases=0
- faithful run: package certification REVIEW_REQUIRED (0 certified / 3 review / 0 not certified of 3); blockers: CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, CANDIDATE_REVIEW_REQUIRED, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_ONLY_EXECUTABLE_DEPENDENCY, REVIEW_UNRESOLVED_ITEM
- credit-agreement::7.06: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (3 rules, 0 defs, 0 shared), verification MATERIAL_DISCREPANCY [MISSING_RULE/MATERIAL], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, OPEN_MATERIAL_OR_UNCERTAIN_FINDING, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE, VERIFICATION_NOT_CLEAN]
- credit-agreement::7.08: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (3 rules, 0 defs, 0 shared), verification VERIFIED_NO_MATERIAL_GAP_FOUND [], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, UNIT_SUFFICIENCY_INCOMPLETE]
- credit-agreement::1.01: outcome MAPPED_WITH_REVIEW, compilation REVIEW_REQUIRED (0 rules, 5 defs, 0 shared), verification VERIFIED_WITH_NON_MATERIAL_FINDINGS [MISSING_DEPENDENCY/NON_MATERIAL, MISSING_DEPENDENCY/NON_MATERIAL], certification REVIEW_REQUIRED [COMPILATION_NOT_COMPLETED, UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE]

</details>

