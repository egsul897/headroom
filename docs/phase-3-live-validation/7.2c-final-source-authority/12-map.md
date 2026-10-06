# Canonical covenant map - conmed-eighth-ar-credit-agreement

mapHash: `ae8c7e50b0a28a5dab218453eea11db541bed0960c04a176531a580adb48cae6`  
schema: canonical-covenant-map.v3  
config: certified-compiler-config.v1|inventory=DUAL_PASS_ENSEMBLE|semantic=deepseek/deepseek-v4-flash|inventoryModel=deepseek/deepseek-v4-flash|verifier=deepseek/deepseek-v4-flash|tools=8/3/20000|conv=1+1|shardAttempts=1|maxOut=32000|deadline=480000|retry=2|expansions=CONTEXT_ONLY|passA=phase3-inventory-execution.v1|reasoning=DISABLED|deadline=180000|retry=2|batch=6000/24|calls=12|perSlot=1+c/150<=8|bounds=120/400/8/6/6|tpc=0.4|certified-execution.v1

## Completeness

| discovered | eligible | mapped | mapped w/ review | failed | unserved | nodes | edges | unresolved (blocking/review) | complete |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0 | 1 | 0 | 0 | 1 | 0 | 0/4 | no |

## Nodes (source order)

| # | doc | section | kind | family | type | posture | term | sufficiency | verification | identity | node id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 7.2(c) | RULE | INDEBTEDNESS | QUANTITATIVE_PERMISSION | PERMISSION |  | COMPLETE | MATERIAL_DISCREPANCY | STRONG | `ir-rule:11f0445de25e714a1a3cfe31` |

## Edges

| type | from | to | relationship | derived from | reason |
|---|---|---|---|---|---|

## Package dependency bindings

| total | bound | executable | not in target set | owner not compiled | unit not found | unknown |
|---|---|---|---|---|---|---|
| 2 | 0 | 0 | 2 | 0 | 0 | 0 |

| from | path | relationship | target ref | status | bound to | executable |
|---|---|---|---|---|---|---|
| `ir-rule:11f0445de25e714a1a3cfe31` | conditions[0].referencesRuleTargets[0] | CONDITION_TARGET | Section 7.1 | TARGET_CANDIDATE_NOT_IN_TARGET_SET | - | no |
| `ir-rule:11f0445de25e714a1a3cfe31` | sourceDependencies[0] | REQUIRES | Section 7.3(g) | TARGET_CANDIDATE_NOT_IN_TARGET_SET | - | no |

## Unresolved

| severity | kind | candidate | node | section | detail |
|---|---|---|---|---|---|
| REVIEW | CANDIDATE_COMPILE_REVIEW_REQUIRED | discovery-candidate:7a3f36589dacd05c41331a80 |  | 7.2(c) | compilation REVIEW_REQUIRED: OPERATIVE_STATE_UNRESOLVED |
| REVIEW | CANDIDATE_VERIFICATION_NOT_PASSED | discovery-candidate:7a3f36589dacd05c41331a80 |  | 7.2(c) | verification MATERIAL_DISCREPANCY: 1 material finding(s) |
| REVIEW | UNRESOLVED_SOURCE_DEPENDENCY | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:11f0445de25e714a1a3cfe31 | 7.2(c) | conditions[0].referencesRuleTargets[0] CONDITION_TARGET "Section 7.1" [TARGET_CANDIDATE_NOT_IN_TARGET_SET]: owning candidate(s) discovery-candidate:a26970121ceb558846ff8d1c, discovery-candidate:e37352369564a1e784e0560b are known to the sealed population but not in this package's target set |
| REVIEW | UNRESOLVED_SOURCE_DEPENDENCY | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:11f0445de25e714a1a3cfe31 | 7.2(c) | sourceDependencies[0] REQUIRES "Section 7.3(g)" [TARGET_CANDIDATE_NOT_IN_TARGET_SET]: owning candidate(s) discovery-candidate:082c80836268c7277cc39c18 are known to the sealed population but not in this package's target set |

## Candidates

| section | outcome | compile | verify | nodes | conversations (semantic+refinement) | transport attempts | cost |
|---|---|---|---|---|---|---|---|
| 7.2(c) | MAPPED_WITH_REVIEW | REVIEW_REQUIRED | MATERIAL_DISCREPANCY | 1 | 1+1 | 2 | 0.010963806 |
