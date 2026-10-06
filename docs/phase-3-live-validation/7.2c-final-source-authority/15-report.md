# CONMED §7.2(c) — final live certification run (source authority / target selector / shard parity architecture) — one attempt

Run `live-7.2c-rerun-operative-state-2026-10-06T14:25:38.951Z` (the committed runner was executed unmodified at the starting
SHA, so the runId carries its default name; this attempt's directory is `7.2c-final-source-authority/`) at starting SHA
`e74c2d091e1fd5d0b31cfb4bb92d22925b828ddd`; model deepseek/deepseek-v4-flash requested = reported on all 5 responses (HTTP 200
each); hard ceiling $0.25; exact spend $0.010963806; retained $0; paid requests 5; candidate attempts 1; transport retries 0;
wall clock 250 s; no timeout. This candidate is retired as a Phase-3 debugging fixture regardless of the result below.

## Verdict

**PHASE3_7_2_C_FINAL_VALIDATION_SEMANTIC_FAILURE** — the authoritative semantic artifact is correct on every axis the
architecture was built to settle, every historical defect class H1–H11 is RESOLVED, and the real independent reviewer
returned **zero** findings. The one MATERIAL finding is deterministic: the qualitative-grounding layer (fail-closed by design)
rejects the condition's model-authored provenance excerpt because the model elided about 60 source characters with "...",
so the excerpt is not a verbatim substring of the admissible source even though both halves of it are. Gate A requires zero
Phase-3 MATERIAL findings, so A is not met; the failure is not a reviewer assertion (D), not an execution failure (E) and
not an architecture breach (F).

## Target, state, as-of

- conmed-doc-a-eighth-ar-credit-agreement §7.2(c), 529 chars, sha256 d1d9ba7d8d98729d30df82d6b5e3ac4016a7e9155917786247592d57d3477472; all seven identity assertions passed before dispatch; no hand-built candidate (sealed population, production rehydration)
- Phase-2 state tests/fixtures/unseen-packages/phase-2f-freeze/phase-2g/conmed-amendment-regression.json (runId PHASE_2G_CONMED_AMENDMENT_REGRESSION, sha256 e036ebac…, as-of 2026-08-27); instrument OPERATIVE_STATE_REVIEW_REQUIRED; `Indebtedness` HISTORICAL-only (amendment effective date CONDITIONAL_UNRESOLVED), not suppressed, not repaired; no Phase-2 provision governs the target
- run as-of 2026-10-06; as-of consistency PROVEN (all 4 package documents represented; 4 == 4 processed; latest package document 2026-05-27 <= 2026-08-27)
- full sealed population (163) supplied; executed 1; scope PARTIAL_TARGET_SET; §7.1 owners a2697012…/e3735236… and §7.3(g) owner 082c8083… are known without being compiled

## Pass A / source authority (semantic-accountability.v6 + ensemble v2)

- 2 calls, max_tokens 6218 each (derived bound; legacy 128k never used), thinking disabled, output 939 / 928 tokens, 5/5 items accepted each; ensemble 5 canonical, 5 corroborated, 0 single-run, 0 conflicts, supportReviewRequired false
- inventory: permission secured by §7.3(g) Liens · pro forma compliance proviso · §7.1 financial-covenant compliance · last-ended-fiscal-quarter selector · deemed first-day timing
- deterministic scan of the operative text: `Section 7.3(g)` at [47,61) WHOLE_PROVISION; `Section 7.1` at [244,255) QUALIFIED_RULE_SET "financial covenants contained in"
- per item: declared vs source-grounded references agree (7.3(g) on the permission; 7.1 on the two §7.1 items; none elsewhere); every claim CORROBORATED; no invented inventory reference; the REFERENCE function derives from the source-grounded set only

## Governing scope / action / entity scope

- governing-scope-context.v1 hash 0581a3b1…: PARENT_SCOPE §7.2 lead-in "Create, incur, assume or suffer to exist any Indebtedness, except:" (distance 1) + GOVERNING_SCOPE article-group:7 preamble "…the Parent Borrower hereby agrees… shall not, and shall not permit any of its Subsidiaries to…" (distance 2); context only — neither region entered the operative source, the inventory or unit ownership; sibling economics absent
- action INCUR_DEBT; inherited action evidence "Create, incur, assume or suffer to exist any Indebtedness" (PARENT_SCOPE 7.2, canonical INCUR_DEBT, COMPATIBLE, four verbs covered)
- entity scope: model emitted ["BORROWER"]; authoritative [BORROWER, ANY_SUBSIDIARY] derived from the Article preamble (SOURCE_SCOPE_DERIVED, precedence GOVERNING_SCOPE_SOURCE, safeToRely true, discrepancy MODEL_NARROWER recorded); measurement mentions of "Parent Borrower and its Subsidiaries" did not redefine applicability

## Composition (MONOLITHIC, SINGLE_BOUNDED_SHARD)

- status REVIEW_REQUIRED (UPSTREAM_PHASE2: OPERATIVE_STATE_UNRESOLVED; PHASE3_SEMANTIC: none); 1 owned rule 7.2(c), 0 definitions, 0 shared caps; contextOnlyEmissions []; invalidWireKinds []; normalizationDiagnostics []; Pass C 5/5 represented, semantically complete
- §7.3(g): REQUIRES → 7.3(g) SOURCE_REFERENCE_RESOLVED, owner 082c8083…, boundSemanticTargetIds [], selector WHOLE_PROVISION, description "requires that the terms of Section 7.3(g) are satisfied; the semantics of Section 7.3(g) are separately owned and resolved at package level"; model prose carried no figure (dependencyProseDiagnostics: targetEconomicsExcluded [])
- §7.1: condition OTHER_RULE_SATISFIED, referencesRuleTargets exactly `Section 7.1` (resolved, two owners, unbound), ALL_SATISFIED, expression null, selector QUALIFIED_RULE_SET "financial covenants contained in"; the model emitted `Section 7.1` itself this time — no 7.1(a)–(d) expansion to exclude
- evaluationBasis: proForma true; transactionEffect "the incurrence of such Indebtedness - deemed to have been incurred on the first day of each relevant period for testing such compliance"; asOfSelector "last day of the most recently ended fiscal quarter of the Parent Borrower and its Subsidiaries for which financial statements are available"; deemedEffectiveAt null; testingPeriod "each relevant period for testing such compliance" — field placement differs from the previous run (the deemed timing sits inside transactionEffect), the source meaning is preserved verbatim, nothing invented
- target economics (80% / 3.75 / 5.50 / 2.75) in authoritative IR: 0; in the verified units: 0; in the map: 0 (they occur only in the raw model notes, the cross-reference source text and the compilation's unresolvedIssues echo of those notes)
- sourceReferenceAudit (fidelity v2): both emitted references EXACT_SOURCE_REFERENCE, authoritative; nothing excluded; unit sufficiency COMPLETE (the only sufficiency reason is the informational ENTITY_SCOPE_SOURCE_DERIVED note)
- monolithic path carried normalizationDiagnostics, dependencyProseDiagnostics, contextOnlyEmissions, invalidWireKinds, governingScope, sourceReferenceAudit and entityScopeAudit on the result

## Verification (phase-3c-semantic-verifier.v4, prompt v4, projection v3)

- projection hash e42dc0b5ae7c8e4f25db38434ae900b189fbc41f109493c3f1abfde425099307 == snapshot == verified package == recorded on the result; shownToReviewer true; the projection carries the canonical action, the literal action evidence, the governing entity scope, both source dependencies, the §7.1 selector, the cross-rule condition, the evaluation basis, the inherited attributes and the labelled reference audit; no certification-status claim about external targets ("certified unit" absent; "correct" appears only in the independence statement)
- real reviewer: invoked, 18,982 output tokens, 0 findings (the merged findings list holds only the deterministic one; reviewer overallNotes are not persisted by the verifier — a runner limitation noted below)
- deterministic layers: reference reconciliation 0 material unresolved (SECTION_REFERENCE 7.3(g) and 7.1 both accounted for); numeric grounding none (no numeric assertions); finding-owner normalization clean; wire kinds valid; unit ownership clean; qualitative grounding v3 **1 material ungrounded**: conditions[0] "the provenance excerpt is not a substring of any admissible source text (inventory lineage does not rescue a quoted excerpt the source lacks)" — the excerpt reads "…recomputed as at the last day of the most recently ended fiscal quarter**...** as if such Indebtedness…"; the two halves are verbatim in the source
- status MATERIAL_DISCREPANCY; 1 finding: MATERIAL QUALITATIVE_ASSERTION_UNGROUNDED @ rules[ir-rule:11f0445de25e714a1a3cfe31].conditions[0] — origin PHASE3_SEMANTIC (deterministic, not reviewer; not REVIEWER_INCONSISTENCY)

## Historical findings

H1 §7.3(g) missing — RESOLVED · H2 invalid REQUIRES — RESOLVED · H3 as-of / MONEY compliance — RESOLVED · H4 80% — RESOLVED · H5 3.75 — RESOLVED · H6 5.50 — RESOLVED · H7 2.75 — RESOLVED · H8 foreign §7.2 parent — RESOLVED · H9 action narrowed — RESOLVED · H10 entity scope empty — RESOLVED · H11 §7.1 child expansion — RESOLVED. No historical finding recurred; the one new finding is a different class (provenance-excerpt elision).

## Certification

- snapshot c1f650ffe162381a15710237a3956755c7abfdbf6462217ff3d2ffda04d2475f, 1 unit (ir-rule:11f0445de25e714a1a3cfe31); verified package p3-verified-unit-package.v2 5c3f1ac6fda32db74b9956064a9460b92494213773c7f8576cfad654d069ac7d, complete, 0 unpaired, 0 identity mismatches, no mutation between snapshot and artifact
- candidate REVIEW_REQUIRED: UPSTREAM_PHASE2 → COMPILATION_NOT_COMPLETED (OPERATIVE_STATE_UNRESOLVED), OPERATIVE_STATE_UNACCEPTABLE; PHASE3_SEMANTIC → OPEN_MATERIAL_OR_UNCERTAIN_FINDING, VERIFICATION_NOT_CLEAN, SUPPORT_UNACCEPTABLE (all three driven by the single grounding finding); warning SEMANTIC_BINDING_PENDING_PACKAGE
- counterfactual (diagnostic only): with the upstream operative-state condition resolved, Phase-3 blockers remain → YES
- package PARTIAL (PARTIAL_TARGET_SET, DISCOVERY_POPULATION_UNSEALED, 2 bindings TARGET_CANDIDATE_NOT_IN_TARGET_SET with their owners known, CANDIDATE_REVIEW_REQUIRED); resolver v3; the candidate carries the §7.1 selector a later full-package resolution needs; no candidate mutation; Phase 4 adapter not attempted

## Limitations observed (preserved, not patched)

1. The verifier result does not persist the reviewer's overallNotes; zero reviewer findings is proven by the merge path (any reviewer finding would appear in the list with its reasoning), not by a stored transcript.
2. The runId string is the runner's default; the evidence directory name is authoritative.
3. The model distributed the evaluation basis across transactionEffect / testingPeriod rather than deemedEffectiveAt; faithful but not canonical.

## Next bounded action

Retire §7.2(c). Offline only: generalize the provenance-excerpt contract on synthetic fixtures — normalization should resolve a model excerpt that elides source text ("...") to the exact spanned source substring when both ends locate uniquely, or reject it as a quotation defect before verification — then prove it on a different live validation target in the small stratified live validation set. No further §7.2(c) run.
