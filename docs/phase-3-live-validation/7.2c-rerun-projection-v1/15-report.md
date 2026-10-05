# CONMED §7.2(c) — final certified live validation (projection v1 / verifier v3 / prompt v2) — one attempt

Run `live-7.2c-rerun-operative-state-2026-10-05T13:53:29.872Z` at starting SHA 6b9f81aed55a2b19a7cd09c735a46dbd7ff6d2ba; model deepseek/deepseek-v4-flash requested = reported on all 5 responses (HTTP 200 each); hard ceiling $0.25; exact spend $0.010315182; paid requests 5; candidate attempts 1; transport retries 0.

## Verdict

**PHASE3_FINAL_LIVE_VALIDATION_SEMANTIC_FAILURE** — the targeted projection defect is closed (the reviewer saw and acknowledged the §7.3(g) REQUIRES dependency), every earlier defect class is RESOLVED, but the independent reviewer returned 1 MATERIAL + 2 UNCERTAIN findings of Phase-3 origin that are genuine representation/vocabulary questions, not projection blindness (see Verification).

## Target, state, as-of

- conmed-doc-a-eighth-ar-credit-agreement §7.2(c), 529 chars, sha256 d1d9ba7d8d98729d30df82d6b5e3ac4016a7e9155917786247592d57d3477472; all identity assertions passed before dispatch
- Phase-2 state tests/fixtures/unseen-packages/phase-2f-freeze/phase-2g/conmed-amendment-regression.json (runId PHASE_2G_CONMED_AMENDMENT_REGRESSION, sha256 e036ebac936d7120b2bcd298f380b95b4257910653f94e8fe5496d374126d4d6, as-of 2026-08-27); instrument OPERATIVE_STATE_REVIEW_REQUIRED; no governing provision for the target; run as-of 2026-10-05; as-of consistency PROVEN (all 4 package documents represented; 4 == 4 processed; latest package document 2026-05-27 <= 2026-08-27)
- relied-upon `Indebtedness`: HISTORICAL_ONLY (amendment effect effective date CONDITIONAL_UNRESOLVED) → OPERATIVE_STATE_UNRESOLVED / OPERATIVE_STATE_UNACCEPTABLE, fail-closed as designed
- full sealed population (163) supplied; executed 1; scope PARTIAL_TARGET_SET

## Pass A / ensemble v2 / context

- 2 calls, max_tokens 6218, thinking disabled, output 925, 936, 5/5 items each; ensemble {"canonicalItems": 5, "corroborated": 5, "coverageCorroborated": 0, "singleRun": 0, "singleRunByPass": {"pass-1": 0, "pass-2": 0}, "conflicted": 0, "materialSingleRun": 0, "informationalSingleRun": 0, "materialConflicted": 0, "rejectedUnverifiable": 0, "supportGroups": 5}; supportReviewRequired false
- inventory: permission (secured by §7.3(g) Liens) · pro forma compliance proviso · §7.1 compliance after giving effect · last-ended-fiscal-quarter selector · deemed first-day timing; no quantitative values invented
- context SUFFICIENT, stopReasons [], 19 items, cross-reference depth 1, definition depth 5, ownership stops 7.3(g) → 082c8083…, 7.1 → a2697012…/e3735236…

## Composition

- status REVIEW_REQUIRED (UPSTREAM_PHASE2: OPERATIVE_STATE_UNRESOLVED; SEMANTIC_LAYER: none); 1 owned rule 7.2(c), 0 definitions, 0 shared caps; contextOnlyEmissions []; invalidWireKinds []; Pass C 5/5 represented
- rule: PERMISSION / INCUR_DEBT / capacity UNLIMITED_CAPACITY (no local cap); entityScope [] after the provider emitted ['Parent Borrower','Restricted Subsidiary'] — 'Restricted Subsidiary' has no EntityClassTag mapping (enum splits GUARANTOR_RS / NON_GUARANTOR_RS) so the guard reset the scope (UNRECOGNIZED_TAG, not guessed) and sufficiency became PARTIAL
- §7.3(g): sourceDependencies[0] REQUIRES → 7.3(g) SOURCE_REFERENCE_RESOLVED, owner discovery-candidate:082c80836268c7277cc39c18, boundSemanticTargetIds [] (the provider's '80% FMV cap' prose was excluded deterministically and kept in diagnostics)
- §7.1: sourceDependencies[1] REQUIRES → 7.1 (owners a2697012…, e3735236…); condition OTHER_RULE_SATISFIED, referencesRuleTargets Section 7.1(a)/(b)/(c)/(d) (each resolved with its own owner), ALL_SATISFIED; evaluationBasis proForma true, transactionEffect 'after giving effect to the incurrence of such Indebtedness', asOfSelector 'last day of the most recently ended fiscal quarter of the Parent Borrower and its Subsidiaries for which financial statements are available', deemedEffectiveAt 'first day of each relevant period for testing such compliance', testingPeriod null
- target economics in authoritative IR: none (80% / 3.75 / 5.50 / 2.75 absent)

## Verification (phase-3c-semantic-verifier.v3, prompt v2, projection v1)

- projection hash ea9738555c9ff41f4b13da93c0cb6ec82bea2734391333ca366e2c7e87d896b4 == snapshot == verified package == recorded on the result; shownToReviewer true; projection contains §7.3(g) REQUIRES RESOLVED + owner, §7.1 dependency and OTHER_RULE_SATISFIED/ALL_SATISFIED condition, full evaluation basis
- status MATERIAL_DISCREPANCY; 3 findings, ids unique; deterministic layers clean (reconciliation 0, numeric none, qualitative GROUNDED)
  - MATERIAL OTHER_MATERIAL_SEMANTIC_DISCREPANCY @ rules[0].action [PHASE3_SEMANTIC]: Section 7.2 prohibits four distinct activities: creating, incurring, assuming, and suffering to exist Indebtedness. Section 7.2(c) is an exception to that entire prohibition for Indebtedness secured by Liens permitted by Section 7.3(g), subject to the pro form… — action-vocabulary granularity: the IR's ContractAction maps the debt-covenant verb cluster (create, incur, assume, suffer to exist) to INCUR_DEBT by convention; the reviewer, not told that convention, read INCUR_DEBT as narrower than the parent prohibition's four verbs. The premise ('encodes only INCUR_DEBT') is factually true, so this is a genuine Phase-3 finding (representation/verifier-calibration), not a projection-blindness false positive
  - UNCERTAIN OTHER_MATERIAL_SEMANTIC_DISCREPANCY @ rules[0].entityScope [PHASE3_SEMANTIC]: The proposed IR leaves the entity scope empty, so it does not state which entities may take the §7.2(c) permission. The source's own condition links the financial-covenant test to the Parent Borrower and its Subsidiaries, and the incorporated §7.3(g) refers to… — the model emitted entityScope ['Parent Borrower','Restricted Subsidiary']; 'Restricted Subsidiary' has no deterministic EntityClassTag mapping (the enum splits restricted subsidiaries into GUARANTOR_RS / NON_GUARANTOR_RS), so the guard reset the scope to [] (non-authoritative, tag preserved in the audit) and sufficiency became PARTIAL; the reviewer correctly observed the empty scope
  - UNCERTAIN OTHER_MATERIAL_SEMANTIC_DISCREPANCY @ rules[0].conditions[0].referencesRuleTargets [PHASE3_SEMANTIC]: The operative source cites only "Section 7.1" as a whole; it does not cite clauses (a) through (d). The proposed IR expands the reference into four specific subsection references without providing source text showing that those subsections exhaustively contain… — the model expanded the source's whole-section reference 'Section 7.1' into referencesRuleTargets 7.1(a)-(d) (each structurally resolved with an owner) while also keeping the whole-section REQUIRES source dependency; the reviewer flagged the sub-clause expansion as unverifiable from the child's own source (UNCERTAIN)

## Old defect classes

- OLD_7_3_G_MISSING_FINDING: **RESOLVED** — no finding asserts the Section 7.3(g) requirement is absent; the reviewer's own reasoning cites it as present ('an exception ... for Indebtedness secured by Liens permitted by Section 7.3(g)'); the projection shown (hash ea973855...) contains sourceDependencies[0] REQUIRES Section 7.3(g) SOURCE_REFERENCE_RESOLVED owner discovery-candidate:082c80836268c7277cc39c18. Three different findings appeared (see findings)
- OLD_INVALID_REQUIRES: **RESOLVED** — invalidWireKinds []; no UNSUPPORTED node; REQUIRES appears only as a source-dependency relationshipType
- OLD_COPIED_80: **RESOLVED** — the provider restated '80% FMV cap' in dependsOn[0] prose; the deterministic guard excluded it (TARGET_ECONOMICS_IN_DEPENDENCY_PROSE, targetEconomicsExcluded ['80%']); '80%' absent from authoritative rules and verified-unit IR, present only in dependencyProseDiagnostics
- OLD_COPIED_3_75: **RESOLVED** — absent from authoritative IR (the provider's overallNotes mention it only to say it was stripped)
- OLD_COPIED_5_50: **RESOLVED** — absent from authoritative IR
- OLD_COPIED_2_75: **RESOLVED** — absent from authoritative IR
- OLD_AS_OF_MONEY: **RESOLVED** — no AS_OF node, no '(unspecified)', no METRIC_REFERENCE; evaluationBasis carries the selectors verbatim
- OLD_FOREIGN_PARENT: **RESOLVED** — one owned 7.2(c) rule; contextOnlyEmissions []; snapshot / verified package / map hold exactly that unit
- OLD_PASS_A_SUPPORT_ASYMMETRY: **RESOLVED** — 5/5 EXACT corroborated, 0 single-run, 0 conflicts, supportReviewRequired false
- OLD_CONTEXT_BUDGET: **RESOLVED** — SUFFICIENT, stopReasons [], max cross-reference depth 1, ownership stops at 7.3(g) and 7.1

## Certification

- candidate REVIEW_REQUIRED: COMPILATION_NOT_COMPLETED (compilation REVIEW_REQUIRED: OPERATIVE_STATE_UNRESOLVED); OPEN_MATERIAL_OR_UNCERTAIN_FINDING (3 open MATERIAL/UNCERTAIN finding(s)); OPERATIVE_STATE_UNACCEPTABLE (the context bundle carries unresolved operative evidence (conflicted / ambiguous / partial amendment state)); UNIT_SUFFICIENCY_INCOMPLETE (executable unit(s) are not COMPLETE); VERIFICATION_NOT_CLEAN (verification MATERIAL_DISCREPANCY: 1 material finding(s)); warnings ['SEMANTIC_BINDING_PENDING_PACKAGE', 'TARGET_ECONOMICS_EXCLUDED']
- by layer: PHASE3_SEMANTIC → OPEN_MATERIAL_OR_UNCERTAIN_FINDING, VERIFICATION_NOT_CLEAN, UNIT_SUFFICIENCY_INCOMPLETE; UPSTREAM_PHASE2 → COMPILATION_NOT_COMPLETED, OPERATIVE_STATE_UNACCEPTABLE
- counterfactual (diagnostic only): removing the upstream blockers leaves Phase-3 blockers → YES
- snapshot 254457720a95e109cd1fe92d6dc5ab606105a34e81e363fd816b1c98dda65e3f; verified package p3-verified-unit-package.v2 8ec39557d3537ca0d99b45aa2c71f40a1ab24b55942441c299054959c4cc4314 complete; package PARTIAL (6 bindings TARGET_CANDIDATE_NOT_IN_TARGET_SET, 0 unknown); Phase 4 not attempted

## Next bounded action

Offline, zero paid calls: (1) decide the debt-covenant verb cluster representation (either document in the verifier prompt that INCUR_DEBT is the canonical action for 'create, incur, assume or suffer to exist' Indebtedness, or add transactionScope/action vocabulary for the cluster) and freeze this run's finding as a regression; (2) decide, explicitly, how an unsplit 'Restricted Subsidiary' tag is represented — the guard refuses it by design (the enum splits restricted subsidiaries into guarantor / non-guarantor / foreign and never guesses), so the honest options are a compiler prompt rule to emit the split tags the source supports, or a first-class 'either restricted-subsidiary class' scope value — and freeze this run's empty-scope outcome as a regression; (3) instruct the compiler to keep whole-section references as emitted by the source (package binding expands one-to-many) and freeze the 7.1(a)-(d) expansion as a regression; then one further live rerun only on authorization.

