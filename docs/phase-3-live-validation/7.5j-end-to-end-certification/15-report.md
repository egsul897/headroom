# CONMED §7.5(j) — end-to-end live certification attempt (one paid run)

Run `live-7.5j-end-to-end-certification-2026-10-06T20:21:54.599Z` at production SHA `5599cc41255b5c8c533a98859090eb198816e8a7`
(the PROVENANCE_SOURCE_BINDING_STRICT_READY baseline; `git diff 5599cc4 -- lib/contract-model` empty before dispatch and after the
run). Model deepseek/deepseek-v4-flash requested = reported on all 6 responses (HTTP 200 each); hard ceiling $0.25, maxCalls 40;
exact spend $0.091061822, retained $0.00137579 (two failed gap re-inventory reservations), outstanding $0, no refusal; paid
requests 6; candidate attempts 1; transport retries 0; wall clock 86 s; no timeout. Production frozen after request 1; nothing
patched, nothing rerun.

## Verdict

**PHASE3_7_5_J_SEMANTIC_FAILURE.** Execution was valid, the schema path held, the reviewer returned zero findings, every
model-derived excerpt is source-bound with a full span, and the authoritative economics are exactly the source's
($25,000,000 and 1.5% of Consolidated Total Assets under a strict `LT` against `MAX`). The candidate is nevertheless
REVIEW_REQUIRED, and the blockers are not only honest support asymmetry: four deterministic Phase-3 layers produced
defects that remain in the frozen evidence (a coverage gap on text a CRITICAL item anchors; Pass C false negatives on both
source figures; a false INCOMPATIBLE action attribution written onto the authoritative IR; silent loss of the
"measured on the date of such Disposition" qualifier). First unresolved blocker in pipeline order:
`SEMANTIC_INVENTORY_COVERAGE_GAP`, owned by Pass A (semantic-accountability source coverage + gap re-inventory).

## Pre-dispatch gates (all offline)

- identity: all seven assertions passed; anchor `structural-node:8599a1bc2045c7ecda17f201` (`…::7.5(j)`, SUBSECTION), document
  span [72710, 73218), origin STRUCTURAL_NODE, 508 chars, sha256 8d1c2932…; families DISPOSITIONS/ASSET_SALES, role BASKET,
  discovery `phase-2b-discovery-pipeline.v1+phase-2b-discovery.v1`; exactly one 7.5(j) in the document
- Phase-2 state: `tests/fixtures/unseen-packages/phase-2f-freeze/phase-2g/conmed-amendment-regression.json`
  (PHASE_2G_CONMED_AMENDMENT_REGRESSION, sha256 e036ebac…, as-of 2026-08-27); instrument OPERATIVE_STATE_REVIEW_REQUIRED;
  REVIEW_REQUIRED provisions: Consolidated Senior Secured Leverage Ratio, Consolidated Total Leverage Ratio, Indebtedness, §1.1
  (the list is exactly the historical four); no provision governs 7.5(j)
- as-of: run 2026-10-06 > 2026-08-27, proven (4/4 documents represented, 4 == 4 processed, latest document 2026-05-27)
- eligibility (new offline gate, `01c-target-eligibility.json`): the production compiler-input builder yields a bundle with
  `hasUnresolvedOperativeEvidence` false, 9 items all CURRENT (7.5(j), §7.5 lead-in, siblings 7.5(f)/7.5(n) as context,
  Consolidated Total Assets, Disposition, Parent Borrower, Division, Property); no REVIEW_REQUIRED term is mentioned in the
  operative text and no REVIEW_REQUIRED section is referenced → eligible

## Pass A (semantic-accountability.v6, ensemble v2, policy phase3-inventory-execution.v1, reasoning DISABLED)

- 4 slots, 1 batch, derived maxItems 12, parse ceiling 32, max_tokens 6397 per pass; thinking `{type: disabled}` on all four
  Pass-A requests (the current certified policy; nothing hardcoded)
- pass-1: 9 returned / 9 accepted (1756 output tokens); pass-2: 8 returned / 8 accepted (1538); after union 12 canonical,
  4 rejected duplicates; 4 corroborated, 6 coverage-corroborated, 2 single-run CRITICAL/MATERIAL (the "series of related
  Dispositions" alternative; the (x)/(y) composite threshold), 0 conflicts; 6 support groups; supportReviewRequired true
- gap re-inventory: attempted on 3 segments, both gap calls (max_tokens 2226 / 2023) rejected by the wire schema because the
  model returned `localRef`/`parentRef` longer than 6 chars; 0 items added; 2 stretches remain UNACCOUNTED_SOURCE:
  operative [4,43) "any Disposition of Property or business" and [104,132) "which yields net proceeds to". Both sit inside
  item 1's CRITICAL span [0,132); the coverage layer clips an item's credit to the independent segment its span starts in
  (the "(j)" line), so the remainder was never credited. uninventoriedValues []
- the inventory is exact on economics: $25,000,000 (MONEY) and 1.5% (PERCENT), each ALSO carried as a model-declared
  OTHER-kind duplicate (see Pass C)

## Governing scope / action / entity scope

- governing-scope-context.v1 (hash 16caeb74…): PARENT_SCOPE §7.5 lead-in "Dispose of any of its Property or business … or, in
  the case of any Subsidiary, issue or sell any shares of such Subsidiary's Capital Stock to any Person, except:" (distance 1)
  + GOVERNING_SCOPE article-group:7 preamble "the Parent Borrower shall not, and shall not permit any of its Subsidiaries to"
  (distance 2); posture evidence PROHIBITION at the article level; neither region entered the unit
- action: model and IR `SELL_ASSET`. Deterministic defect: `canonical-action-ontology.v1` compiles its object-family regexes
  without the case-insensitive flag, so "Property" (as drafted) is not an ASSET object; the scan skipped "Dispose of any of its
  Property" and classified the next cluster "issue or sell any shares" → ONTOLOGY_GAP → inherited action not established →
  `ACTION_INCONSISTENT_WITH_SOURCE_ACT` on the rule, compatibility INCOMPATIBLE, sufficiency PARTIAL. Offline replay with a
  lowercase "property" yields SELL_ASSET COVERED (`16-semantic-assessment.json` → action.ontologyReplayOffline)
- entity scope: model [BORROWER, ANY_SUBSIDIARY] == authoritative; guard v3 SOURCE_MATCH_CONFIRMED, decidedBy OWN_EXCERPT,
  precedence OWN_OPERATIVE_LANGUAGE, safeToRely true; the "net proceeds to the Parent Borrower or any of its Subsidiaries"
  phrase did not redefine applicability

## Composition (MONOLITHIC, SINGLE_BOUNDED_SHARD; compiler v9, prompt v8)

- schema: `submit_compilation` validated on the first attempt; definitions is an array (length 0) — the historical
  MODEL_SCHEMA_FAILURE (definitions returned as a string) is RESOLVED, not merely NOT REACHED
- 1 owned rule `ir-rule:813a03f3488f210788389510` (Section 7.5(j)), 0 definitions, 0 shared capacities, 0 foreign units,
  invalidWireKinds [], contextOnlyEmissions [], dependencyProseDiagnostics [], sourceDependencies [], dependsOn []
- rule: posture PERMISSION, ruleType QUANTITATIVE_PERMISSION, covenantFamily defaulted (model emitted
  LIMITATIONS_ON_SALE_OF_ASSETS, not an enum value), capacity `UNLIMITED_CAPACITY` gated by
  `METRIC_REFERENCE("Net Proceeds of such Disposition") LT MAX(MONEY 25,000,000 USD, PERCENT 0.015 × METRIC_REFERENCE("Consolidated Total Assets"))`;
  one condition OTHER_RULE_SATISFIED with no targets and no expression (a restatement of the §7.5 posture)
- timing: the model placed `asOfDate: "date of such Disposition"` on the Consolidated Total Assets METRIC_REFERENCE (accepted
  by the generic wire schema) rather than wrapping it in AS_OF; `normalize.ts` builds METRIC_REFERENCE without asOfDate and
  emits no diagnostic → the qualifier survives only in the bound excerpts and inventory item d137a073…
- valuation mechanics (notes/debt securities at initial principal amount; other non-cash at fair market value): present in
  the gate's SOURCE_BOUND_ELIDED excerpt [104,405) and in three inventory items, not as structure; the model dispositioned
  those items "CONSUMED_IN_EXPRESSION" (outside the stated vocabulary) instead of UNSUPPORTED nodes
- normalizationDiagnostics: 2 × PROVENANCE_EXCERPT_SOURCE_BOUND (gate [104,405); condition[0] [4,405)); sufficiency PARTIAL
  (action inconsistency; family default; limit-driven downgrade)

## Provenance contract (binding v2)

8 provenance objects under the rule; 7 model-derived excerpts: 5 SOURCE_BOUND_EXACT, 2 SOURCE_BOUND_ELIDED, 0 UNRESOLVED,
0 ambiguous exact, 0 ambiguous elided, 4 rawModelExcerpt retained (whitespace / elision differences), **0 authoritative
excerpts without a complete span**; the capacity wrapper carries a null excerpt with no model excerpt (nothing to bind).

## Pass C accountability

12 material items: 6 REPRESENTED, 6 MISSING_FROM_COMPOSITION (5 CRITICAL); "3 material quantitative values absent" —
false: both figures are literal nodes in the IR and the verifier's own reconciliation classifies them ACCOUNTED_FOR. Cause:
each THRESHOLD item carries a second value of kind OTHER (the model's declared kind was defaulted) with the same rawText, and
`reconciliation.ts` matches OTHER-kind values only against TEXT nodes. The three FORMULA_COMPONENT (valuation) items are
genuinely unrepresented structurally. supportReviewRequired true.

## Verification (verifier v5, prompt v4, projection v4)

- projection hash 88c138aa282f3943f756d1e3759563e1a7113b71900456fa079eebf1388bfb70 == snapshot == verified package ==
  recorded on the verification (shownToReviewer true); reviewer invoked, 4,111 output tokens, 0 reviewer findings
- status VERIFIED_WITH_NON_MATERIAL_FINDINGS; 1 finding: NON_MATERIAL MISSING_RULE (deterministic enumeration signal "(j), (x),
  (y)" downgraded because the independent review did not confirm it); 0 MATERIAL, 0 UNCERTAIN, 0 REVIEWER_INCONSISTENCY
- numeric grounding: $25,000,000 and 1.5% ACCOUNTED_FOR, Consolidated Total Assets ACCOUNTED_FOR, "Parent Borrower"
  POSSIBLY_ACCOUNTED_FOR (heuristic), 1 AMBIGUOUS structural signal; qualitative grounding v4: rule GROUNDED on posture,
  action, ruleType, covenantFamily, entityScope, conditions[0]; 0 material ungrounded

## Certification

- candidate REVIEW_REQUIRED: COMPILATION_NOT_COMPLETED (SEMANTIC_INVENTORY_COVERAGE_GAP, INVENTORY_ITEM_MISSING_FROM_COMPOSITION,
  SEMANTIC_SUPPORT_REVIEW_REQUIRED), UNACCOUNTED_MATERIAL_SOURCE, UNIT_SUFFICIENCY_INCOMPLETE (PARTIAL); no UPSTREAM_PHASE2
  blocker, no verifier blocker; snapshot fb0a8192…, verified package 1 unit, complete
- package PARTIAL: CANDIDATE_REVIEW_REQUIRED, DISCOVERY_POPULATION_UNSEALED, PARTIAL_TARGET_SET, REVIEW_UNRESOLVED_ITEM (2 map
  items); dependency resolution v3 with 0 bindings (the clause references no other provision); map validation ok
- Phase 4 adapter not attempted (certification REVIEW_REQUIRED)

## Pre-registered hypotheses

H1 PASS · H2 PASS · H3 PASS with a deterministic false INCOMPATIBLE · H4 PASS · H5 PARTIAL (series only in provenance) ·
H6 PASS (LT) · H7 PASS · H8 FAIL (asOfDate dropped) · H9 PASS · H10 PARTIAL · H11 PARTIAL · H12 PASS · H13 PASS · H14 PASS ·
H15 PASS · H16 PASS · H17 PASS · H18 PASS · H19 PARTIAL as recorded · H20 PASS.

## Limitations observed (preserved, not patched)

1. Pass A coverage credit clipping + failed gap re-inventory (model localRef formatting) → coverage gap on anchored text.
2. Pass C OTHER-kind duplicate values → false MISSING on both threshold items.
3. Action-ontology object regexes case-sensitive → false INCOMPATIBLE inherited action → PARTIAL.
4. METRIC_REFERENCE asOfDate dropped silently by normalization.
5. Model: non-vocabulary disposition, non-enum covenantFamily, vacuous OTHER_RULE_SATISFIED condition.
6. Provider reported 669,566 input tokens for the 62k-char Pass B request; priced as reported.
7. Reviewer overallNotes are not persisted by the verifier (carried over).

## Next bounded action

Offline, on synthetic fixtures, with the frozen §7.5(j) artifacts as the replay: (a) source-coverage credit for an item whose
span starts on an enumerator line; (b) Pass C value correspondence for OTHER-kind duplicates of a deterministically typed
figure; (c) case-insensitive object matching in the action ontology; (d) a normalization diagnostic (or AS_OF lift) when a
METRIC_REFERENCE carries asOfDate. No second §7.5(j) paid run until those four replay green.
