# Pass A frozen inventory (human-readable)

candidateRef: discovery-candidate:7a3f36589dacd05c41331a80
inventoryStatus: INVENTORY_OK
inventoryStatusReason: 5 canonical item(s) from 2 independent passes: 5 exactly corroborated, 0 coverage-corroborated, 0 single-run (0 CRITICAL/MATERIAL), 0 conflicted; 5 support group(s)
sourceContextState: DEPENDENCY_EXPANDED_SOURCE
executionPolicy: phase3-inventory-execution.v1|reasoning=DISABLED|deadline=180000|retry=2|batch=6000/24|calls=12|perSlot=1+c/150<=8|bounds=120/400/8/6/6|tpc=0.4
items: 5  rejectedOverBound: 0  rejectedUnverifiable: 0  rejectedDuplicate: 5
unaccountedSource: []
uninventoriedValues: []
ensemble: {"algorithmVersion":"semantic-ensemble.v2","policy":"SUPPORT_AWARE_CANONICAL_UNION","passIds":["pass-1","pass-2"],"passHashes":{"pass-1":"7285597a4c1dffd5c0fc057e2251916d71aa95cec12f65c2f6fb972602424e70","pass-2":"c7e051d1daeb26da6ebabf7d8923c93f4634e85b1ddf2f988fbbaed1bc17d67b"},"counts":{"canonicalItems":5,"corroborated":5,"coverageCorroborated":0,"singleRun":0,"singleRunByPass":{"pass-1":0,"pass-2":0},"conflicted":0,"materialSingleRun":0,"informationalSingleRun":0,"materialConflicted":0,"rejectedUnverifiable":0,"supportGroups":5},"supportReviewRequired":false,"supportReviewFraction":0,"conflicts":[],"compatibility":{"mode":"STRICT","sourceContextHash":"7d4b22affb87e780c7bc822b36dad68d2f881b35a6bcd426fca93e57bc4465a4","partitionHash":"dc529c7875eea192860a151524ab15714d3a12b479b110f1e49893bb095aa1ad","documentIds":["conmed-doc-a-eighth-ar-credit-agreement"],"passes":{"pass-1":{"algorithmVersion":"semantic-accountability.v5","promptVersion":"semantic-inventory-prompt.v6","provider":"vercel-ai-gateway","model":"deepseek/deepseek-v4-flash","sourceContextHash":"7d4b22affb87e780c7bc822b36dad68d2f881b35a6bcd426fca93e57bc4465a4","sourceIdentityMethod":"RECORDED_AT_FREEZE","partitionHash":"dc529c7875eea192860a151524ab15714d3a12b479b110f1e49893bb095aa1ad","documentId":"conmed-doc-a-eighth-ar-credit-agreement"},"pass-2":{"algorithmVersion":"semantic-accountability.v5","promptVersion":"semantic-inventory-prompt.v6","provider":"vercel-ai-gateway","model":"deepseek/deepseek-v4-flash","sourceContextHash":"7d4b22affb87e780c7bc822b36dad68d2f881b35a6bcd426fca93e57bc4465a4","sourceIdentityMethod":"RECORDED_AT_FREEZE","partitionHash":"dc529c7875eea192860a151524ab15714d3a12b479b110f1e49893bb095aa1ad","documentId":"conmed-doc-a-eighth-ar-credit-agreement"}},"checks":[{"check":"candidate-ref","pass":true,"detail":"pass-1: candidateRef discovery-candidate:7a3f36589dacd05c41331a80 matches"},{"check":"source-identity-recorded","pass":true,"detail":"pass-1: source identity RECORDED_AT_FREEZE"},{"check":"source-context-hash","pass":true,"detail":"pass-1: source-context hash 7d4b22affb87e780 vs ensemble 7d4b22affb87e780"},{"check":"partition","pass":true,"detail":"pass-1: slot partition dc529c7875eea192 vs ensemble dc529c7875eea192"},{"check":"document","pass":true,"detail":"pass-1: document conmed-doc-a-eighth-ar-credit-agreement vs ensemble conmed-doc-a-eighth-ar-credit-agreement"},{"check":"algorithm-generation","pass":true,"detail":"pass-1: algorithm semantic-accountability.v5 supported"},{"check":"prompt-generation","pass":true,"detail":"pass-1: prompt semantic-inventory-prompt.v6 supported"},{"check":"pass-status","pass":true,"detail":"pass-1: INVENTORY_OK"},{"check":"candidate-ref","pass":true,"detail":"pass-2: candidateRef discovery-candidate:7a3f36589dacd05c41331a80 matches"},{"check":"source-identity-recorded","pass":true,"detail":"pass-2: source identity RECORDED_AT_FREEZE"},{"check":"source-context-hash","pass":true,"detail":"pass-2: source-context hash 7d4b22affb87e780 vs ensemble 7d4b22affb87e780"},{"check":"partition","pass":true,"detail":"pass-2: slot partition dc529c7875eea192 vs ensemble dc529c7875eea192"},{"check":"document","pass":true,"detail":"pass-2: document conmed-doc-a-eighth-ar-credit-agreement vs ensemble conmed-doc-a-eighth-ar-credit-agreement"},{"check":"algorithm-generation","pass":true,"detail":"pass-2: algorithm semantic-accountability.v5 supported"},{"check":"prompt-generation","pass":true,"detail":"pass-2: prompt semantic-inventory-prompt.v6 supported"},{"check":"pass-status","pass":true,"detail":"pass-2: INVENTORY_OK"},{"check":"algorithm-generation","pass":true,"detail":"pass-2 vs pass-1: algorithm semantic-accountability.v5 vs semantic-accountability.v5"},{"check":"prompt-generation","pass":true,"detail":"pass-2 vs pass-1: prompt semantic-inventory-prompt.v6 vs semantic-inventory-prompt.v6"},{"check":"provider-model","pass":true,"detail":"pass-2 vs pass-1: vercel-ai-gateway/deepseek/deepseek-v4-flash vs vercel-ai-gateway/deepseek/deepseek-v4-flash"}],"declaredExceptions":[]}}

## item 1  inv-item:ac31a719a47d4995cf16b375
- slot: operative:region#1  span: 7.2(c) [4-62] §7.2(c)
- excerpt: "Indebtedness secured by Liens permitted by Section 7.3(g);"
- proposition: Permitted incurrence of Indebtedness secured by Liens under Section 7.3(g)
- primary role: PERMISSION  declared roles: ["PERMISSION","CONDITION"]  functions: {"effect":"PERMISSION","logic":["CONDITION"],"quantitative":[],"dependency":["REFERENCE"]}
- materiality: MATERIAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: ["Indebtedness"]  referenced sections: ["Section 7.3(g)"]
- ambiguity: NONE
- support: {"supportingPasses":["pass-1","pass-2"],"supportStatus":"CORROBORATED","memberItemIds":{"pass-1":["inv-item:ac31a719a47d4995cf16b375"],"pass-2":["inv-item:ac31a719a47d4995cf16b375"]},"supportGroupId":"support-group:ac31a719a47d4995cf16b375"}

## item 2  inv-item:ec8b311518c4ef230e54f0b3
- slot: operative:region#2  span: 7.2(c) [63-123] §7.2(c)
- excerpt: "provided that the Parent Borrower shall be in compliance, on"
- proposition: Condition: Parent Borrower compliance on pro forma basis
- primary role: CONDITION  declared roles: ["CONDITION","REQUIREMENT"]  functions: {"effect":"REQUIREMENT","logic":["CONDITION"],"quantitative":[],"dependency":[]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: ["Parent Borrower"]  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1","pass-2"],"supportStatus":"CORROBORATED","memberItemIds":{"pass-1":["inv-item:ec8b311518c4ef230e54f0b3"],"pass-2":["inv-item:ec8b311518c4ef230e54f0b3"]},"supportGroupId":"support-group:ec8b311518c4ef230e54f0b3"}

## item 3  inv-item:55c1c59cc23002bacf0f41f8
- slot: operative:region#3  span: 7.2(c) [124-251] §7.2(c)
- excerpt: "a pro forma basis after giving effect to the incurrence of such Indebtedness, with the financial covenants contained in Section"
- proposition: Compliance with financial covenants after giving effect to incurrence
- primary role: CONDITION  declared roles: ["CONDITION","REQUIREMENT"]  functions: {"effect":"REQUIREMENT","logic":["CONDITION"],"quantitative":[],"dependency":["REFERENCE"]}
- materiality: CRITICAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: ["Indebtedness"]  referenced sections: ["Section 7.1"]
- ambiguity: NONE
- support: {"supportingPasses":["pass-1","pass-2"],"supportStatus":"CORROBORATED","memberItemIds":{"pass-1":["inv-item:55c1c59cc23002bacf0f41f8"],"pass-2":["inv-item:55c1c59cc23002bacf0f41f8"]},"supportGroupId":"support-group:55c1c59cc23002bacf0f41f8"}

## item 4  inv-item:197d6a75e518b433abd00585
- slot: operative:region#4  span: 7.2(c) [252-391] §7.2(c)
- excerpt: "7.1 recomputed as at the last day of the most recently ended fiscal quarter of the Parent Borrower and its Subsidiaries for which financial"
- proposition: Recompute as at last day of most recently ended fiscal quarter
- primary role: REFERENCE  declared roles: ["REFERENCE","TIME_PERIOD","FORMULA_COMPONENT","CONDITION","TRIGGER"]  functions: {"effect":"NONE","logic":["CONDITION","TRIGGER"],"quantitative":["FORMULA_COMPONENT","TIME_PERIOD"],"dependency":["REFERENCE"]}
- materiality: MATERIAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: ["Parent Borrower","Subsidiaries"]  referenced sections: ["7.1","Section 7.1"]
- ambiguity: NONE
- support: {"supportingPasses":["pass-1","pass-2"],"supportStatus":"CORROBORATED","memberItemIds":{"pass-1":["inv-item:197d6a75e518b433abd00585"],"pass-2":["inv-item:197d6a75e518b433abd00585"]},"supportGroupId":"support-group:197d6a75e518b433abd00585"}

## item 5  inv-item:a898fe5b6cdf0d0ca5334548
- slot: operative:region#5  span: 7.2(c) [392-528] §7.2(c)
- excerpt: "statements are available as if such Indebtedness had been incurred on the first day of each relevant period for testing such compliance;"
- proposition: Treat indebtedness as incurred on first day of relevant period for testing
- primary role: CONDITION  declared roles: ["CONDITION","TRIGGER","FORMULA_COMPONENT"]  functions: {"effect":"NONE","logic":["CONDITION","TRIGGER"],"quantitative":["FORMULA_COMPONENT"],"dependency":[]}
- materiality: MATERIAL  operative: OPERATIVE  detection: MODEL
- values: []
- referenced terms: ["Indebtedness"]  referenced sections: []
- ambiguity: NONE
- support: {"supportingPasses":["pass-1","pass-2"],"supportStatus":"CORROBORATED","memberItemIds":{"pass-1":["inv-item:a898fe5b6cdf0d0ca5334548"],"pass-2":["inv-item:a898fe5b6cdf0d0ca5334548"]},"supportGroupId":"support-group:a898fe5b6cdf0d0ca5334548"}
