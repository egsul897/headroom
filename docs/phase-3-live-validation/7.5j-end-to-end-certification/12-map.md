# Canonical covenant map - conmed-eighth-ar-credit-agreement

mapHash: `16f9462d1cde7c6d73e32270200eae7b0e76c5f599fda686775124194ddd4e1b`  
schema: canonical-covenant-map.v3  
config: certified-compiler-config.v1|inventory=DUAL_PASS_ENSEMBLE|semantic=deepseek/deepseek-v4-flash|inventoryModel=deepseek/deepseek-v4-flash|verifier=deepseek/deepseek-v4-flash|tools=8/3/20000|conv=1+1|shardAttempts=1|maxOut=32000|deadline=480000|retry=2|expansions=CONTEXT_ONLY|passA=phase3-inventory-execution.v1|reasoning=DISABLED|deadline=180000|retry=2|batch=6000/24|calls=12|perSlot=1+c/150<=8|bounds=120/400/8/6/6|tpc=0.4|certified-execution.v1

## Completeness

| discovered | eligible | mapped | mapped w/ review | failed | unserved | nodes | edges | unresolved (blocking/review) | complete |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0 | 1 | 0 | 0 | 1 | 0 | 0/2 | no |

## Nodes (source order)

| # | doc | section | kind | family | type | posture | term | sufficiency | verification | identity | node id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | Section 7.5(j) | RULE | QUALITATIVE_NEGATIVE_COVENANTS | QUANTITATIVE_PERMISSION | PERMISSION |  | PARTIAL | VERIFIED_WITH_NON_MATERIAL_FINDINGS | STRONG | `ir-rule:813a03f3488f210788389510` |

## Edges

| type | from | to | relationship | derived from | reason |
|---|---|---|---|---|---|

## Package dependency bindings

| total | bound | executable | not in target set | owner not compiled | unit not found | unknown |
|---|---|---|---|---|---|---|
| 0 | 0 | 0 | 0 | 0 | 0 | 0 |

## Unresolved

| severity | kind | candidate | node | section | detail |
|---|---|---|---|---|---|
| REVIEW | CANDIDATE_COMPILE_REVIEW_REQUIRED | discovery-candidate:5aeac47ab31feb23331e4f89 |  | 7.5(j) | compilation REVIEW_REQUIRED: SEMANTIC_INVENTORY_COVERAGE_GAP, INVENTORY_ITEM_MISSING_FROM_COMPOSITION, SEMANTIC_SUPPORT_REVIEW_REQUIRED |
| REVIEW | UNIT_SUFFICIENCY_NOT_SUFFICIENT | discovery-candidate:5aeac47ab31feb23331e4f89 | ir-rule:813a03f3488f210788389510 | Section 7.5(j) | rule sufficiency PARTIAL: deterministic post-processing: 1 limit(s) raised under this rule, so COMPLETE was downgraded to PARTIAL; covenantFamily "LIMITATIONS_ON_SALE_OF_ASSETS" not recognized - defaulted to QUALITATIVE_NEGATIVE_COVENANTS (verify manually); ACTION_INCONSISTENT_WITH_SOURCE_ACT: action SELL_ASSET - the source act "issue or sell any shares" (ONTOLOGY_GAP: uncovered) does not fall in SELL_ASSET (PARENT_SCOPE 7.5); the canonical action is not re-mapped by guess |

## Candidates

| section | outcome | compile | verify | nodes | conversations (semantic+refinement) | transport attempts | cost |
|---|---|---|---|---|---|---|---|
| 7.5(j) | MAPPED_WITH_REVIEW | REVIEW_REQUIRED | VERIFIED_WITH_NON_MATERIAL_FINDINGS | 1 | 1+0 | 1 | 0.091061822 |
