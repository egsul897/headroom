# Canonical covenant map - conmed-eighth-ar-credit-agreement

mapHash: `961e188cfeb1d2a258aa777efc15cbb82a2d491183e9dad0cf4fcc72530aaa77`  
schema: canonical-covenant-map.v3  
config: certified-compiler-config.v1|inventory=DUAL_PASS_ENSEMBLE|semantic=deepseek/deepseek-v4-flash|inventoryModel=deepseek/deepseek-v4-flash|verifier=deepseek/deepseek-v4-flash|tools=8/3/20000|conv=1+1|shardAttempts=1|maxOut=32000|deadline=480000|retry=2|expansions=CONTEXT_ONLY|passA=phase3-inventory-execution.v1|reasoning=DISABLED|deadline=180000|retry=2|batch=6000/24|calls=12|perSlot=1+c/150<=8|bounds=120/400/8/6/6|tpc=0.4|certified-execution.v1

## Completeness

| discovered | eligible | mapped | mapped w/ review | failed | unserved | nodes | edges | unresolved (blocking/review) | complete |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0 | 1 | 0 | 0 | 1 | 0 | 0/9 | no |

## Nodes (source order)

| # | doc | section | kind | family | type | posture | term | sufficiency | verification | identity | node id |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 7.2(c) | RULE | INDEBTEDNESS | QUANTITATIVE_PERMISSION | PERMISSION |  | PARTIAL | MATERIAL_DISCREPANCY | STRONG | `ir-rule:29309c463e06b77b4b243eda` |

## Edges

| type | from | to | relationship | derived from | reason |
|---|---|---|---|---|---|

## Package dependency bindings

| total | bound | executable | not in target set | owner not compiled | unit not found | unknown |
|---|---|---|---|---|---|---|
| 6 | 0 | 0 | 6 | 0 | 0 | 0 |

| from | path | relationship | target ref | status | bound to | executable |
|---|---|---|---|---|---|---|
| `ir-rule:29309c463e06b77b4b243eda` | conditions[0].referencesRuleTargets[0] | CONDITION_TARGET | Section 7.1(a) | TARGET_CANDIDATE_NOT_IN_TARGET_SET | - | no |
| `ir-rule:29309c463e06b77b4b243eda` | conditions[0].referencesRuleTargets[1] | CONDITION_TARGET | Section 7.1(b) | TARGET_CANDIDATE_NOT_IN_TARGET_SET | - | no |
| `ir-rule:29309c463e06b77b4b243eda` | conditions[0].referencesRuleTargets[2] | CONDITION_TARGET | Section 7.1(c) | TARGET_CANDIDATE_NOT_IN_TARGET_SET | - | no |
| `ir-rule:29309c463e06b77b4b243eda` | conditions[0].referencesRuleTargets[3] | CONDITION_TARGET | Section 7.1(d) | TARGET_CANDIDATE_NOT_IN_TARGET_SET | - | no |
| `ir-rule:29309c463e06b77b4b243eda` | sourceDependencies[0] | REQUIRES | Section 7.3(g) | TARGET_CANDIDATE_NOT_IN_TARGET_SET | - | no |
| `ir-rule:29309c463e06b77b4b243eda` | sourceDependencies[1] | REQUIRES | Section 7.1 | TARGET_CANDIDATE_NOT_IN_TARGET_SET | - | no |

## Unresolved

| severity | kind | candidate | node | section | detail |
|---|---|---|---|---|---|
| REVIEW | CANDIDATE_COMPILE_REVIEW_REQUIRED | discovery-candidate:7a3f36589dacd05c41331a80 |  | 7.2(c) | compilation REVIEW_REQUIRED: OPERATIVE_STATE_UNRESOLVED |
| REVIEW | CANDIDATE_VERIFICATION_NOT_PASSED | discovery-candidate:7a3f36589dacd05c41331a80 |  | 7.2(c) | verification MATERIAL_DISCREPANCY: 1 material finding(s) |
| REVIEW | UNIT_SUFFICIENCY_NOT_SUFFICIENT | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:29309c463e06b77b4b243eda | 7.2(c) | rule sufficiency PARTIAL: ENTITY_SCOPE_UNRECOGNIZED_TAG: entityScope tag "Restricted Subsidiary" is not an EntityClassTag value - scope made non-authoritative, tag preserved in entityScopeAudit, not guessed; TARGET_ECONOMICS_IN_DEPENDENCY_PROSE: dependsOn[0] on "Section 7.3(g)" restated 1 figure(s) that the candidate's operative source never states; they belong to the target's own certified unit, were excluded from this unit and are recorded in the dependency-prose diagnostics; ENTITY_SCOPE_UNRECOGNIZED_TAG: wire entity tag(s) "Restricted Subsidiary" (entityScope) are not EntityClassTag values; the affected scope field is reset to unspecified and the tag is preserved verbatim in entityScopeAudit - its meaning is not guessed |
| REVIEW | UNRESOLVED_SOURCE_DEPENDENCY | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:29309c463e06b77b4b243eda | 7.2(c) | conditions[0].referencesRuleTargets[0] CONDITION_TARGET "Section 7.1(a)" [TARGET_CANDIDATE_NOT_IN_TARGET_SET]: owning candidate(s) discovery-candidate:8fe38049fe62ea9e9e741511 are known to the sealed population but not in this package's target set |
| REVIEW | UNRESOLVED_SOURCE_DEPENDENCY | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:29309c463e06b77b4b243eda | 7.2(c) | conditions[0].referencesRuleTargets[3] CONDITION_TARGET "Section 7.1(d)" [TARGET_CANDIDATE_NOT_IN_TARGET_SET]: owning candidate(s) discovery-candidate:1b08da2e952127a1caebe77d are known to the sealed population but not in this package's target set |
| REVIEW | UNRESOLVED_SOURCE_DEPENDENCY | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:29309c463e06b77b4b243eda | 7.2(c) | sourceDependencies[1] REQUIRES "Section 7.1" [TARGET_CANDIDATE_NOT_IN_TARGET_SET]: owning candidate(s) discovery-candidate:a26970121ceb558846ff8d1c, discovery-candidate:e37352369564a1e784e0560b are known to the sealed population but not in this package's target set |
| REVIEW | UNRESOLVED_SOURCE_DEPENDENCY | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:29309c463e06b77b4b243eda | 7.2(c) | conditions[0].referencesRuleTargets[2] CONDITION_TARGET "Section 7.1(c)" [TARGET_CANDIDATE_NOT_IN_TARGET_SET]: owning candidate(s) discovery-candidate:5f83b15ed6cd0ea8b06289a0 are known to the sealed population but not in this package's target set |
| REVIEW | UNRESOLVED_SOURCE_DEPENDENCY | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:29309c463e06b77b4b243eda | 7.2(c) | conditions[0].referencesRuleTargets[1] CONDITION_TARGET "Section 7.1(b)" [TARGET_CANDIDATE_NOT_IN_TARGET_SET]: owning candidate(s) discovery-candidate:cf15af8f5fb1f77bd861a2ac are known to the sealed population but not in this package's target set |
| REVIEW | UNRESOLVED_SOURCE_DEPENDENCY | discovery-candidate:7a3f36589dacd05c41331a80 | ir-rule:29309c463e06b77b4b243eda | 7.2(c) | sourceDependencies[0] REQUIRES "Section 7.3(g)" [TARGET_CANDIDATE_NOT_IN_TARGET_SET]: owning candidate(s) discovery-candidate:082c80836268c7277cc39c18 are known to the sealed population but not in this package's target set |

## Candidates

| section | outcome | compile | verify | nodes | conversations (semantic+refinement) | transport attempts | cost |
|---|---|---|---|---|---|---|---|
| 7.2(c) | MAPPED_WITH_REVIEW | REVIEW_REQUIRED | MATERIAL_DISCREPANCY | 1 | 1+1 | 2 | 0.010315181999999999 |
