# Pass A frozen inventory (human-readable)

candidateRef: discovery-candidate:5aeac47ab31feb23331e4f89
inventoryStatus: INVENTORY_COVERAGE_GAP
inventoryStatusReason: 12 canonical item(s) from 2 independent passes: 4 exactly corroborated, 6 coverage-corroborated, 2 single-run (2 CRITICAL/MATERIAL), 0 conflicted; 6 support group(s); 2 stretch(es) of source remain UNACCOUNTED_SOURCE after the union - accountability for that text is not established by either pass; 2 CRITICAL/MATERIAL item(s) carry support asymmetry or conflict - REVIEW_REQUIRED unless independently resolved later
sourceContextState: COMPLETE_LOCAL_SOURCE
executionPolicy: phase3-inventory-execution.v1|reasoning=DISABLED|deadline=180000|retry=2|batch=6000/24|calls=12|perSlot=1+c/150<=8|bounds=120/400/8/6/6|tpc=0.4
items: 12  rejectedOverBound: 0  rejectedUnverifiable: 0  rejectedDuplicate: 4
unaccountedSource: [{"regionId":"operative","charStart":4,"charEnd":43,"excerpt":"any Disposition of Property or business","reason":"no inventory item anchors this text and no deterministic rule classifies it as non-semantic - materiality undetermined, never assumed immaterial","values":[]},{"regionId":"operative","charStart":104,"charEnd":132,"excerpt":"which yields net proceeds to","reason":"no inventory item anchors this text and no deterministic rule classifies it as non-semantic - materiality undetermined, never assumed immaterial","values":[]}]
uninventoriedValues: []
ensemble: {"algorithmVersion":"semantic-ensemble.v2","policy":"SUPPORT_AWARE_CANONICAL_UNION","passIds":["pass-1","pass-2"],"passHashes":{"pass-1":"da6c482d1d8087974b30e43aa186d9e4d6e8face5798e8f0d92dd682e36bd612","pass-2":"1be1d4b03e801ea847370cf6f4a5313db1bedb6bfb235a234c184d62654fef63"},"counts":{"canonicalItems":12,"corroborated":4,"coverageCorroborated":6,"singleRun":2,"singleRunByPass":{"pass-1":1,"pass-2":1},"conflicted":0,"materialSingleRun":2,"informationalSingleRun":0,"materialConflicted":0,"rejectedUnverifiable":0,"supportGroups":6},"supportReviewRequired":true,"supportReviewFraction":0.1667,"conflicts":[],"compatibility":{"mode":"STRICT","sourceContextHash":"b8a2c799feb20e5de1c93e53e24c391dd003a44ca70522a240eec5fbb7233179","partitionHash":"b7c8a2f4ccb04e28be8d0ba33fcaf59f85f68cf3daafa246c26f1cc8a7f0a29b","documentIds":["conmed-doc-a-eighth-ar-credit-agreement"],"passes":{"pass-1":{"algorithmVersion":"semantic-accountability.v6","promptVersion":"semantic-inventory-prompt.v6","provider":"vercel-ai-gateway","model":"deepseek/deepseek-v4-flash","sourceContextHash":"b8a2c799feb20e5de1c93e53e24c391dd003a44ca70522a240eec5fbb7233179","sourceIdentityMethod":"RECORDED_AT_FREEZE","partitionHash":"b7c8a2f4ccb04e28be8d0ba33fcaf59f85f68cf3daafa246c26f1cc8a7f0a29b","documentId":"conmed-doc-a-eighth-ar-credit-agreement"},"pass-2":{"algorithmVersion":"semantic-accountability.v6","promptVersion":"semantic-inventory-prompt.v6","provider":"vercel-ai-gateway","model":"deepseek/deepseek-v4-flash","sourceContextHash":"b8a2c799feb20e5de1c93e53e24c391dd003a44ca70522a240eec5fbb7233179","sourceIdentityMethod":"RECORDED_AT_FREEZE","partitionHash":"b7c8a2f4ccb04e28be8d0ba33fcaf59f85f68cf3daafa246c26f1cc8a7f0a29b","documentId":"conmed-doc-a-eighth-ar-credit-agreement"}},"checks":[{"check":"candidate-ref","pass":true,"detail":"pass-1: candidateRef discovery-candidate:5aeac47ab31feb23331e4f89 matches"},{"check":"source-identity-recorded","pass":true,"detail":"pass-1: source identity RECORDED_AT_FREEZE"},{"check":"source-context-hash","pass":true,"detail":"pass-1: source-context hash b8a2c799feb20e5d vs ensemble b8a2c799feb20e5d"},{"check":"partition","pass":true,"detail":"pass-1: slot partition b7c8a2f4ccb04e28 vs ensemble b7c8a2f4ccb04e28"},{"check":"document","pass":true,"detail":"pass-1: document conmed-doc-a-eighth-ar-credit-agreement vs ensemble conmed-doc-a-eighth-ar-credit-agreement"},{"check":"algorithm-generation","pass":true,"detail":"pass-1: algorithm semantic-accountability.v6 supported"},{"check":"prompt-generation","pass":true,"detail":"pass-1: prompt semantic-inventory-prompt.v6 supported"},{"check":"pass-status","pass":true,"detail":"pass-1: INVENTORY_COVERAGE_GAP"},{"check":"candidate-ref","pass":true,"detail":"pass-2: candidateRef discovery-candidate:5aeac47ab31feb23331e4f89 matches"},{"check":"source-identity-recorded","pass":true,"detail":"pass-2: source identity RECORDED_AT_FREEZE"},{"check":"source-context-hash","pass":true,"detail":"pass-2: source-context hash b8a2c799feb20e5d vs ensemble b8a2c799feb20e5d"},{"check":"partition","pass":true,"detail":"pass-2: slot partition b7c8a2f4ccb04e28 vs ensemble b7c8a2f4ccb04e28"},{"check":"document","pass":true,"detail":"pass-2: document conmed-doc-a-eighth-ar-credit-agreement vs ensemble conmed-doc-a-eighth-ar-credit-agreement"},{"check":"algorithm-generation","pass":true,"detail":"pass-2: algorithm semantic-accountability.v6 supported"},{"check":"prompt-generation","pass":true,"detail":"pass-2: prompt semantic-inventory-prompt.v6 supported"},{"check":"pass-status","pass":true,"detail":"pass-2: INVENTORY_COVERAGE_GAP"},{"check":"algorithm-generation","pass":true,"detail":"pass-2 vs pass-1: algorithm semantic-accountability.v6 vs semantic-accountability.v6"},{"check":"prompt-generation","pass":true,"detail":"pass-2 vs pass-1: prompt semantic-inventory-prompt.v6 vs semantic-inventory-prompt.v6"},{"check":"provider-model","pass":true,"detail":"pass-2 vs pass-1: vercel-ai-gateway/deepseek/deepseek-v4-flash vs vercel-ai-gateway/deepseek/deepseek-v4-flash"}],"declaredExceptions":[]}}

## item 1  inv-item:0e5329437d345c7c5674b0b7
- slot: operative:region#1  span: 7.5(j) [0-132] §7.5(j)
- excerpt: "(j)\nany Disposition of Property or business or series of related Dispositions of Property or businesses which yields net proceeds to"
- proposition: Applies to any Disposition of Property or business
- primary role: TRIGGER  declared roles: ["TRIGGER"]  functions: {"effect":"NONE","logic":["TRIGGER"],"quantitative":[],"dependency":[]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: ["Disposition","Property"]  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1","pass-2"],"supportStatus":"CORROBORATED","memberItemIds":{"pass-1":["inv-item:0e5329437d345c7c5674b0b7"],"pass-2":["inv-item:0e5329437d345c7c5674b0b7"]},"supportGroupId":"support-group:0e5329437d345c7c5674b0b7"}

## item 2  inv-item:c262463526204a96714cd8f6
- slot: operative:region#1  span: 7.5(j) [44-103] §7.5(j)
- excerpt: "or series of related Dispositions of Property or businesses"
- proposition: Includes series of related Dispositions
- primary role: ALTERNATIVE  declared roles: ["ALTERNATIVE"]  functions: {"effect":"NONE","logic":["ALTERNATIVE"],"quantitative":[],"dependency":[]}
- materiality: MATERIAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: ["Disposition"]  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1"],"supportStatus":"SINGLE_RUN","memberItemIds":{"pass-1":["inv-item:c262463526204a96714cd8f6"]},"supportGroupId":"support-group:c262463526204a96714cd8f6"}

## item 3  inv-item:2bb0c84da8ad713ef2667e0f
- slot: operative:region#1  span: 7.5(j) [47-103] §7.5(j)
- excerpt: "series of related Dispositions of Property or businesses"
- proposition: Series of related dispositions treated as one
- primary role: TRIGGER  declared roles: ["TRIGGER"]  functions: {"effect":"NONE","logic":["TRIGGER"],"quantitative":[],"dependency":[]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: ["Disposition","Property"]  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-2"],"supportStatus":"COVERAGE_CORROBORATED","memberItemIds":{"pass-2":["inv-item:2bb0c84da8ad713ef2667e0f"]},"coverageBy":[{"itemId":"inv-item:0e5329437d345c7c5674b0b7","passId":"pass-1","overlapFraction":1,"reason":"containment; same role TRIGGER; values compatible; references compatible"}],"supportGroupId":"support-group:0e5329437d345c7c5674b0b7"}

## item 4  inv-item:541d14cc3ca11673e0ef03da
- slot: operative:region#2  span: 7.5(j) [133-271] §7.5(j)
- excerpt: "the Parent Borrower or any of its Subsidiaries (valued at the initial principal amount thereof in the case of non-cash proceeds consisting"
- proposition: Net proceeds to Parent Borrower or its Subsidiaries
- primary role: TRIGGER  declared roles: ["TRIGGER","REFERENCE","VALUE"]  functions: {"effect":"NONE","logic":["TRIGGER"],"quantitative":["VALUE"],"dependency":["REFERENCE"]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: ["Parent Borrower","Subsidiaries"]  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1","pass-2"],"supportStatus":"CORROBORATED","memberItemIds":{"pass-1":["inv-item:541d14cc3ca11673e0ef03da"],"pass-2":["inv-item:541d14cc3ca11673e0ef03da"]},"supportGroupId":"support-group:541d14cc3ca11673e0ef03da"}

## item 5  inv-item:da2ae7a8c96e1ad42210a94e
- slot: operative:region#2  span: 7.5(j) [181-271] §7.5(j)
- excerpt: "valued at the initial principal amount thereof in the case of non-cash proceeds consisting"
- proposition: Valuation of non-cash proceeds
- primary role: FORMULA_COMPONENT  declared roles: ["FORMULA_COMPONENT","CONDITION"]  functions: {"effect":"NONE","logic":["CONDITION"],"quantitative":["FORMULA_COMPONENT"],"dependency":[]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: []  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1","pass-2"],"supportStatus":"CORROBORATED","memberItemIds":{"pass-1":["inv-item:da2ae7a8c96e1ad42210a94e"],"pass-2":["inv-item:da2ae7a8c96e1ad42210a94e"]},"supportGroupId":"support-group:da2ae7a8c96e1ad42210a94e"}

## item 6  inv-item:cfa2c306e7039e94371d186b
- slot: operative:region#3  span: 7.5(j) [272-405] §7.5(j)
- excerpt: "of notes or other debt securities and valued at fair market value in the case of other non-cash proceeds) of less than the greater of"
- proposition: Valuation of other non-cash proceeds at fair market value
- primary role: FORMULA_COMPONENT  declared roles: ["FORMULA_COMPONENT"]  functions: {"effect":"NONE","logic":["ALTERNATIVE"],"quantitative":["FORMULA_COMPONENT"],"dependency":[]}
- materiality: MATERIAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: []  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1"],"supportStatus":"COVERAGE_CORROBORATED","memberItemIds":{"pass-1":["inv-item:cfa2c306e7039e94371d186b"]},"coverageBy":[{"itemId":"inv-item:5e02c2d017c10fdbce5ccaf7","passId":"pass-2","overlapFraction":0.7143,"reason":"containment; same role FORMULA_COMPONENT; values compatible; references compatible"}],"supportGroupId":"support-group:49cd4edb5551607ed5273395"}

## item 7  inv-item:5e02c2d017c10fdbce5ccaf7
- slot: operative:region#3  span: 7.5(j) [310-405] §7.5(j)
- excerpt: "valued at fair market value in the case of other non-cash proceeds) of less than the greater of"
- proposition: Valuation of other non-cash proceeds
- primary role: FORMULA_COMPONENT  declared roles: ["FORMULA_COMPONENT"]  functions: {"effect":"NONE","logic":["ALTERNATIVE"],"quantitative":["FORMULA_COMPONENT"],"dependency":[]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: []  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-2"],"supportStatus":"COVERAGE_CORROBORATED","memberItemIds":{"pass-2":["inv-item:5e02c2d017c10fdbce5ccaf7"]},"coverageBy":[{"itemId":"inv-item:49cd4edb5551607ed5273395","passId":"pass-1","overlapFraction":0.2842,"reason":"containment; compatible functions (NONE/ALTERNATIVE vs NONE/ALTERNATIVE); values compatible; references compatible"},{"itemId":"inv-item:cfa2c306e7039e94371d186b","passId":"pass-1","overlapFraction":1,"reason":"containment; same role FORMULA_COMPONENT; values compatible; references compatible"}],"supportGroupId":"support-group:49cd4edb5551607ed5273395"}

## item 8  inv-item:49cd4edb5551607ed5273395
- slot: operative:region#3  span: 7.5(j) [378-405] §7.5(j)
- excerpt: "of less than the greater of"
- proposition: Proceeds less than the greater of specified amounts
- primary role: THRESHOLD  declared roles: ["THRESHOLD"]  functions: {"effect":"NONE","logic":["ALTERNATIVE"],"quantitative":["THRESHOLD"],"dependency":[]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: []  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1"],"supportStatus":"COVERAGE_CORROBORATED","memberItemIds":{"pass-1":["inv-item:5e02c2d017c10fdbce5ccaf7"]},"coverageBy":[{"itemId":"inv-item:5e02c2d017c10fdbce5ccaf7","passId":"pass-2","overlapFraction":1,"reason":"containment; compatible functions (NONE/ALTERNATIVE vs NONE/ALTERNATIVE); values compatible; references compatible"}],"supportGroupId":"support-group:49cd4edb5551607ed5273395"}

## item 9  inv-item:8178744a0966f30b34bfd88d
- slot: operative:region#4  span: 7.5(j) [406-421] §7.5(j)
- excerpt: "(x) $25,000,000"
- proposition: $25,000,000 threshold
- primary role: THRESHOLD  declared roles: ["THRESHOLD"]  functions: {"effect":"NONE","logic":[],"quantitative":["VALUE","THRESHOLD"],"dependency":[]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: [{"kind":"OTHER","rawText":"$25,000,000","normalizedValue":25000000,"unit":"USD","charStart":410,"charEnd":421},{"kind":"MONEY","rawText":"$25,000,000","normalizedValue":25000000,"unit":"USD","charStart":410,"charEnd":421}]
- referenced terms: []  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1"],"supportStatus":"COVERAGE_CORROBORATED","memberItemIds":{"pass-1":["inv-item:8178744a0966f30b34bfd88d"]},"coverageBy":[{"itemId":"inv-item:5ac2fef6fb6c8558c27ae9af","passId":"pass-2","overlapFraction":1,"reason":"containment; same role THRESHOLD; values compatible; references compatible"}],"supportGroupId":"support-group:5ac2fef6fb6c8558c27ae9af"}

## item 10  inv-item:5ac2fef6fb6c8558c27ae9af
- slot: operative:region#4  span: 7.5(j) [406-507] §7.5(j)
- excerpt: "(x) $25,000,000 and (y) 1.5% of Consolidated Total Assets (measured on the date of such Disposition);"
- proposition: Threshold amount $25,000,000
- primary role: THRESHOLD  declared roles: ["THRESHOLD"]  functions: {"effect":"NONE","logic":[],"quantitative":["THRESHOLD"],"dependency":[]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: [{"kind":"OTHER","rawText":"$25,000,000","normalizedValue":25000000,"unit":"USD","charStart":410,"charEnd":421},{"kind":"MONEY","rawText":"$25,000,000","normalizedValue":25000000,"unit":"USD","charStart":410,"charEnd":421},{"kind":"PERCENT","rawText":"1.5%","normalizedValue":0.015,"unit":"%","charStart":430,"charEnd":434}]
- referenced terms: ["Consolidated Total Assets","Disposition"]  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-2"],"supportStatus":"SINGLE_RUN","memberItemIds":{"pass-2":["inv-item:5ac2fef6fb6c8558c27ae9af"]},"supportGroupId":"support-group:5ac2fef6fb6c8558c27ae9af"}

## item 11  inv-item:83b1553ecb2a2291a82e3532
- slot: operative:region#4  span: 7.5(j) [426-506] §7.5(j)
- excerpt: "(y) 1.5% of Consolidated Total Assets (measured on the date of such Disposition)"
- proposition: 1.5% of Consolidated Total Assets threshold
- primary role: THRESHOLD  declared roles: ["THRESHOLD","FORMULA_COMPONENT"]  functions: {"effect":"NONE","logic":[],"quantitative":["FORMULA_COMPONENT","THRESHOLD"],"dependency":[]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: [{"kind":"OTHER","rawText":"1.5%","normalizedValue":1.5,"unit":"PERCENT","charStart":430,"charEnd":434},{"kind":"PERCENT","rawText":"1.5%","normalizedValue":0.015,"unit":"%","charStart":430,"charEnd":434}]
- referenced terms: ["Consolidated Total Assets"]  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1","pass-2"],"supportStatus":"CORROBORATED","memberItemIds":{"pass-1":["inv-item:83b1553ecb2a2291a82e3532"],"pass-2":["inv-item:83b1553ecb2a2291a82e3532"]},"supportGroupId":"support-group:5ac2fef6fb6c8558c27ae9af"}

## item 12  inv-item:d137a073dabf7eee99c1276a
- slot: operative:region#4  span: 7.5(j) [465-505] §7.5(j)
- excerpt: "measured on the date of such Disposition"
- proposition: measurement date of Consolidated Total Assets
- primary role: FORMULA_COMPONENT  declared roles: ["FORMULA_COMPONENT"]  functions: {"effect":"NONE","logic":[],"quantitative":["FORMULA_COMPONENT"],"dependency":[]}
- materiality: MATERIAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: []  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1"],"supportStatus":"COVERAGE_CORROBORATED","memberItemIds":{"pass-1":["inv-item:d137a073dabf7eee99c1276a"]},"coverageBy":[{"itemId":"inv-item:5ac2fef6fb6c8558c27ae9af","passId":"pass-2","overlapFraction":1,"reason":"containment; compatible functions (NONE/- vs NONE/-); values compatible; references compatible"},{"itemId":"inv-item:83b1553ecb2a2291a82e3532","passId":"pass-2","overlapFraction":1,"reason":"containment; compatible functions (NONE/- vs NONE/-); values compatible; references compatible"}],"supportGroupId":"support-group:5ac2fef6fb6c8558c27ae9af"}
