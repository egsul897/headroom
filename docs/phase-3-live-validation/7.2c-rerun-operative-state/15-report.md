# CONMED §7.2(c) — certified live semantic rerun with real Phase-2 operative state (one attempt)

Run `live-7.2c-rerun-operative-state-2026-10-05T03:06:50.176Z`; model deepseek/deepseek-v4-flash (requested = reported on all 5 responses); hard ceiling $0.25; exact spend $0.008703052; paid requests 5; candidate attempts 1; transport retries 0 (every response HTTP 200).

## Verdict

**PHASE3_LIVE_SEMANTIC_VALIDATION_SEMANTIC_FAILURE** — the compiled semantic artifact met every target, but the Layer-2 verifier recorded one MATERIAL finding of Phase-3 origin (verifier projection omits `sourceDependencies`). See Verification.

## Target and operative state

- target discovery-candidate:7a3f36589dacd05c41331a80, conmed-doc-a-eighth-ar-credit-agreement §7.2(c), 529 chars, sha256 d1d9ba7d8d98729d30df82d6b5e3ac4016a7e9155917786247592d57d3477472; all identity assertions passed before dispatch
- Phase-2 state: tests/fixtures/unseen-packages/phase-2f-freeze/phase-2g/conmed-amendment-regression.json (runId PHASE_2G_CONMED_AMENDMENT_REGRESSION, sha256 e036ebac936d7120b2bcd298f380b95b4257910653f94e8fe5496d374126d4d6, as-of 2026-08-27); instrument OPERATIVE_STATE_REVIEW_REQUIRED; governing provision for the target: none (base structural node governs); run as-of 2026-10-05; as-of consistency PROVEN (EVERY_PACKAGE_DOCUMENT_REPRESENTED; DOCUMENT_COUNT_MATCHES; NO_PACKAGE_DOCUMENT_AFTER_PHASE2_AS_OF)
- relied-upon definition `Indebtedness`: HISTORICAL_ONLY — an amendment effect targeting it has effective date CONDITIONAL_UNRESOLVED (Phase 2 could not establish it from text); AMENDMENT_LEAD OPERATIVE_STATE_UNRESOLVED. This is the upstream condition; Phase 3 failed closed on it (OPERATIVE_STATE_UNRESOLVED / OPERATIVE_STATE_UNACCEPTABLE).

## Pass A / ensemble v2

- 2 calls, max_tokens 6218 each, thinking disabled, output tokens 977, 981, 5 items returned / 5 accepted each, schema OK
- ensemble: {"canonicalItems": 5, "corroborated": 5, "coverageCorroborated": 0, "singleRun": 0, "singleRunByPass": {"pass-1": 0, "pass-2": 0}, "conflicted": 0, "materialSingleRun": 0, "informationalSingleRun": 0, "materialConflicted": 0, "rejectedUnverifiable": 0, "supportGroups": 5}; supportReviewRequired False; conflicts 0

  - ac31a719a47d4995cf16b375 [4-62] PERMISSION/MATERIAL CORROBORATED: Permitted incurrence of Indebtedness secured by Liens under Section 7.3(g)
  - ec8b311518c4ef230e54f0b3 [63-123] CONDITION/CRITICAL CORROBORATED: Condition: Parent Borrower compliance on pro forma basis
  - 55c1c59cc23002bacf0f41f8 [124-251] CONDITION/CRITICAL CORROBORATED: Compliance with financial covenants after giving effect to incurrence
  - 197d6a75e518b433abd00585 [252-391] REFERENCE/MATERIAL CORROBORATED: Recompute as at last day of most recently ended fiscal quarter
  - a898fe5b6cdf0d0ca5334548 [392-528] CONDITION/MATERIAL CORROBORATED: Treat indebtedness as incurred on first day of relevant period for testing

The five items cover: (1) the permission to incur Indebtedness secured by Liens permitted by §7.3(g); (2) the pro forma compliance proviso (Parent Borrower); (3) compliance with the §7.1 financial covenants after giving effect to the incurrence; (4) the last-ended-fiscal-quarter recomputation selector; (5) the deemed first-day-of-period incurrence assumption. No numeric economics were invented (quantitative values: none).

## Context retrieval

- SUFFICIENT; stopReasons []; 19 items; maxDefinitionDepth 5; maxCrossReferenceDepth 1; traversals 1
- ownership stops: 7.3(g) -> discovery-candidate:082c80836268c7277cc39c18; 7.1 -> discovery-candidate:a26970121ceb558846ff8d1c, discovery-candidate:e37352369564a1e784e0560b

## Composition

- status REVIEW_REQUIRED; failureReasons ['OPERATIVE_STATE_UNRESOLVED'] (UPSTREAM_OPERATIVE_STATE: OPERATIVE_STATE_UNRESOLVED; SEMANTIC_LAYER: none)
- 1 rule (7.2(c)), 0 definitions, 0 shared capacities; contextOnlyEmissions []; invalidWireKinds []; Pass C: 5/5 material items represented, 0 missing
- rule: PERMISSION / INCUR_DEBT / entityScope [BORROWER] (raw 'Parent Borrower' → BORROWER via alias; witness OWN_EXCERPT: Borrower@84 OBLIGOR, Borrower@338 MEASUREMENT_CONTEXT, Subsidiaries@355 MEASUREMENT_CONTEXT); capacity UNLIMITED_CAPACITY locally (no independent cap)
- lien scope: sourceDependencies[0] REQUIRES Section 7.3(g) → 7.3(g) SOURCE_REFERENCE_RESOLVED, owner discovery-candidate:082c80836268c7277cc39c18, boundSemanticTargetIds []
- compliance: condition OTHER_RULE_SATISFIED, referencesRuleTargets [Section 7.1 → SOURCE_REFERENCE_RESOLVED, owners discovery-candidate:a26970121ceb558846ff8d1c, discovery-candidate:e37352369564a1e784e0560b], targetCombination ALL_SATISFIED, expression null; evaluationBasis proForma true, transactionEffect 'after giving effect to the incurrence of such Indebtedness', asOfSelector 'last day of the most recently ended fiscal quarter of the Parent Borrower and its Subsidiaries for which financial statements are available', deemedEffectiveAt 'as if such Indebtedness had been incurred on the first day of each relevant period for testing such compliance', testingPeriod 'each relevant period for testing compliance'; plus sourceDependencies[1] REQUIRES Section 7.1
- target economics in child IR: 80% / 3.75:1 / 5.50:1 / 2.75:1 all absent (dependencyProseDiagnostics excluded nothing: the model restated nothing)
- inheritedAttributes: [] (the parent §7.2 lead-in is context only; the compiler attributed no inherited attribute for this bundle)

## Verification (phase-3c-semantic-verifier.v2)

- status MATERIAL_DISCREPANCY; 1 finding; findingIdsUnique true; deterministic layers clean (reconciliation materialUnresolved 0; numeric groundings none; qualitative grounding GROUNDED, 0 ungrounded)
- MATERIAL OTHER_MATERIAL_SEMANTIC_DISCREPANCY at rules[0] (SEMANTIC_ONLY, Layer-2 reviewer): "The proposed IR drops the Section 7.3(g) limitation entirely … exceptions and dependsOn are empty; no reference to Section 7.3(g) … appears anywhere in the rule."
- origin: PHASE3_SEMANTIC (verification projection). `reviewer.ts` builds `proposedIr.rules` from a fixed field list (ruleId, sourceSectionRef, action, posture, capacityExpression, conditions, exceptions, dependsOn, entityScope, entityScopeExcluded, sufficiency); the typed `sourceDependencies` introduced by the closure are not projected, so the reviewer could not see the REQUIRES Section 7.3(g) dependency that the compiled unit carries. The runner's human-readable IR renderer has the same omission. The finding is a false positive against the artifact, but a real Phase-3 defect; it is not suppressed.

## Old finding classes

- A_MISSING_CONDITION_secured_by_liens_omitted: **RECURRED_AS_VERIFIER_FALSE_POSITIVE** — IR carries the limitation as sourceDependencies[0] REQUIRES Section 7.3(g) (SOURCE_REFERENCE_RESOLVED, owning candidate discovery-candidate:082c80836268c7277cc39c18) and as the capacity's sourceEvidence; the Layer-2 reviewer projection does not include sourceDependencies and reported it dropped (MATERIAL OTHER_MATERIAL_SEMANTIC_DISCREPANCY). Executable semantics are not lost: Phase 4 fails closed on the REQUIRES dependency.
- B_OTHER_MATERIAL_REQUIRES_normalized_to_UNSUPPORTED: **RESOLVED** — invalidWireKinds = []; no UNSUPPORTED node in the compiled rule; the model used referencesRuleTargets + REQUIRES dependsOn, never an invented expression kind
- C_OTHER_MATERIAL_unspecified_as_of_MONEY_compliance: **RESOLVED** — no AS_OF node, no '(unspecified)', no METRIC_REFERENCE; the proviso is OTHER_RULE_SATISFIED -> Section 7.1 (ALL_SATISFIED) with evaluationBasis carrying the contractual selector verbatim
- D_UNSUPPORTED_NUMERIC_80_percent: **RESOLVED** — '80%' absent from compiled rules and verified-unit IR; dependencyProseDiagnostics.targetEconomicsExcluded = [] (the model restated nothing)
- E_UNSUPPORTED_NUMERIC_3_75: **RESOLVED** — '3.75' absent from compiled rules and verified-unit IR
- F_UNSUPPORTED_NUMERIC_5_50: **RESOLVED** — '5.50' absent from compiled rules and verified-unit IR
- G_UNSUPPORTED_NUMERIC_2_75: **RESOLVED** — '2.75' absent from compiled rules and verified-unit IR
- H_QUALITATIVE_LINEAGE_GAP_foreign_parent_prohibition: **RESOLVED** — the model emitted no parent-scope rule (contextOnlyEmissions = []); qualitative-grounding.v3: 1 unit GROUNDED, materialUngrounded 0, nonMaterialLineageGaps 0

## Snapshot, verified package, certification, package

- snapshotHash 30e73e658a64593a9b0498c0ff3d7b7288548387cdbe589b780be66571473f7c; 1 unit ir-rule:316fa105093456e00580e9bb (RULE 7.2(c)); no foreign parent rule
- verified package p3-verified-unit-package.v2 hash 75d27156f6577f7205b45104dc2acb881173d7d31478436dd351e95e07a165f5, complete True, {'artifactsPersisted': 1, 'definitionsCompiled': 0, 'rulesCompiled': 1, 'sharedCapacitiesCompiled': 0, 'unitsMissingIr': 0, 'unitsMissingVerification': 0, 'unitsVerified': 1}
- candidate certification REVIEW_REQUIRED: COMPILATION_NOT_COMPLETED (compilation REVIEW_REQUIRED: OPERATIVE_STATE_UNRESOLVED); OPEN_MATERIAL_OR_UNCERTAIN_FINDING (1 open MATERIAL/UNCERTAIN finding(s)); OPERATIVE_STATE_UNACCEPTABLE (the context bundle carries unresolved operative evidence (conflicted / ambiguous / partial amendment state)); VERIFICATION_NOT_CLEAN (verification MATERIAL_DISCREPANCY: 1 material finding(s)); warnings ['SEMANTIC_BINDING_PENDING_PACKAGE']
- blockers by layer: SEMANTIC_LAYER (verifier projection) → OPEN_MATERIAL_OR_UNCERTAIN_FINDING, VERIFICATION_NOT_CLEAN; UPSTREAM_OPERATIVE_STATE → COMPILATION_NOT_COMPLETED (OPERATIVE_STATE_UNRESOLVED), OPERATIVE_STATE_UNACCEPTABLE
- package dependencies: {"total": 3, "bound": 0, "executable": 0, "notInTargetSet": 3, "notCompiled": 0, "unitNotFound": 0, "unknown": 0}; all three bindings TARGET_CANDIDATE_NOT_IN_TARGET_SET with owners known (never DEPENDENCY_UNKNOWN)
- package certification PARTIAL (PARTIAL_TARGET_SET, DISCOVERY_POPULATION_UNSEALED, DEPENDENCY_TARGET_NOT_IN_TARGET_SET ×3, CANDIDATE_REVIEW_REQUIRED, REVIEW_UNRESOLVED_ITEM)
- Phase 4 adapter: not attempted (certification REVIEW_REQUIRED)

## Next bounded action

Project `sourceDependencies` (and `inheritedAttributes`, `unresolvedDependencies`) into the Layer-2 reviewer's proposedIr and the runner's IR renderer, add an offline regression that replays this run's compiled unit through the reviewer projection and asserts the Section 7.3(g) requirement is visible, then (on authorization) one further rerun of §7.2(c). No production code was changed during or after this run.

