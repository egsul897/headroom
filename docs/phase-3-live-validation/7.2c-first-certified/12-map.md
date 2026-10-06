# Canonical covenant map - conmed-eighth-ar-credit-agreement

mapHash: `70efc5ada6e7cadcfca82c52c7341359618777c12fbf9d5a7007ddf5d80e4b18`  
schema: canonical-covenant-map.v2  
config: certified-compiler-config.v1|inventory=DUAL_PASS_ENSEMBLE|semantic=deepseek/deepseek-v4-flash|inventoryModel=deepseek/deepseek-v4-flash|verifier=deepseek/deepseek-v4-flash|tools=8/3/20000|conv=1+1|shardAttempts=1|maxOut=32000|deadline=480000|retry=2|expansions=CONTEXT_ONLY|passA=phase3-inventory-execution.v1|reasoning=DISABLED|deadline=180000|retry=2|batch=6000/24|calls=12|perSlot=1+c/150<=8|bounds=120/400/8/6/6|tpc=0.4|certified-execution.v1

## Completeness

| discovered | eligible | mapped | mapped w/ review | failed | unserved | nodes | edges | unresolved (blocking/review) | complete |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0 | 1 | 0 | 0 | 2 | 1 | 0/4 | no |

## Nodes (source order)

| # | doc | section | kind | family | type | posture | term | sufficiency | verification | identity | node id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 7.2(c) | RULE | INDEBTEDNESS | QUANTITATIVE_PERMISSION | PERMISSION |  | PARTIAL | MATERIAL_DISCREPANCY | STRONG | `ir-rule:11f0445de25e714a1a3cfe31` |
| 2 | 0 | 7.2 | RULE | INDEBTEDNESS | PROHIBITION | PROHIBITION |  | AMBIGUOUS | MATERIAL_DISCREPANCY | STRONG | `ir-rule:c9757e8a02da1880d66214f2` |

## Edges

| type | from | to | relationship | derived from | reason |
|---|---|---|---|---|---|
| RULE_SUBJECT_TO_GENERAL_PROHIBITION | `ir-rule:11f0445de25e714a1a3cfe31` | `ir-rule:c9757e8a02da1880d66214f2` |  | STRUCTURAL_ANCESTRY | ir-rule:c9757e8a02da1880d66214f2 is the prohibition of the same structural unit |

## Unresolved

| severity | kind | candidate | node | section | detail |
|---|---|---|---|---|---|
| REVIEW | CANDIDATE_COMPILE_REVIEW_REQUIRED | discovery-candidate:7a3f36589dacd05c41331a80 |  | 7.2(c) | compilation REVIEW_REQUIRED: OPERATIVE_STATE_UNRESOLVED, SEMANTIC_SUPPORT_REVIEW_REQUIRED |
| REVIEW | CANDIDATE_VERIFICATION_NOT_PASSED | discovery-candidate:7a3f36589dacd05c41331a80 |  | 7.2(c) | verification MATERIAL_DISCREPANCY: 3 material finding(s) |
| REVIEW | UNIT_SUFFICIENCY_NOT_SUFFICIENT | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:c9757e8a02da1880d66214f2 | 7.2 | rule sufficiency AMBIGUOUS: The parent Section 7.2 is an umbrella prohibition ('Create, incur, assume or suffer to exist any Indebtedness, except:') whose exceptions (of which 7.2(c) is one) are each independently operative permissions. The implied prohibition itself adds no operative economics beyond its exceptions; it is emitted only to preserve the section's overall posture and is not a determinable quantitative test. |
| REVIEW | UNIT_SUFFICIENCY_NOT_SUFFICIENT | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:11f0445de25e714a1a3cfe31 | 7.2(c) | rule sufficiency PARTIAL: The core permission (Indebtedness secured by Liens under 7.3(g)) and its pro forma compliance gate are faithfully represented as UNLIMITED_CAPACITY gated by a boolean pro forma compliance condition. However, the Section 7.1 financial covenant tests (Senior Secured Leverage <= 3.75:1, Total Leverage <= 5.50:1, Interest Coverage >= 2.75:1, Liquidity, each with Material Acquisition step-ups and Early Maturing Debt mechanics) are themselves separately operative covenants in another section; they are carried here only as an explicit REQUIRES dependency, not fully expanded into this rule.; The 'compliance with the financial covenants in Section 7.1' gate is real but is a composite of four separately-defined obligations in another section rather than a single deterministic dollar/ratio threshold determinable at this rule's granularity, which warrants PARTIAL rather than COMPLETE at the parent rule's level.; unrecognized expression kind "REQUIRES" - not a real IR node type; AND keeps its structure with at least one UNSUPPORTED operand in place - typed BOOLEAN from its represented operands; PARTIAL, never executable (F-6); dependsOn[0].targetRef "Section 7.3(g)" is not a rule in this compilation unit - preserved as an unresolved cross-unit dependency (review required), never guessed or dropped; dependsOn[1].targetRef "Section 7.1" is not a rule in this compilation unit - preserved as an unresolved cross-unit dependency (review required), never guessed or dropped; ENTITY_SCOPE_UNDERINCLUSIVE_VS_SOURCE: entityScope ["BORROWER"] touches no class for source binding "Subsidiaries" (witness: the rule's own provenance excerpt); scope reset to unspecified, not widened by guess |

## Candidates

| section | outcome | compile | verify | nodes | conversations (semantic+refinement) | transport attempts | cost |
|---|---|---|---|---|---|---|---|
| 7.2(c) | MAPPED_WITH_REVIEW | REVIEW_REQUIRED | MATERIAL_DISCREPANCY | 2 | 1+1 | 2 | 0.010140314 |
