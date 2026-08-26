/**
 * Phase C0, Task 2 - independent human material-provision inventory for the
 * unseen FWRG 2021 Credit Agreement fixture (see README.md in this
 * directory). Written by direct reading of the real source text in
 * article-6-negative-covenants.txt and definitions-excerpt.txt, BEFORE any
 * extraction system saw the document. This file is the ground truth that
 * tests/contract-model/analyzer-unseen-package.test.ts compares extractor
 * output against - it must never be passed into any provider prompt, and no
 * file under lib/contract-model/analyzer*.ts may import it.
 *
 * Classification is against the REAL Phase B ontology in
 * lib/contract-model/types.ts and prisma/schema.prisma, not an idealized
 * one - every `family`/`ruleType`/`evaluationClass`/`posture`/`action`/
 * `formulaRef` value below is a real enum member that exists today. Where a
 * provision only fits with some loss or extra work, that is recorded
 * honestly in `classification`/`stretchNotes` rather than rounded up.
 */

export type Representability = "REPRESENTABLE_CLEANLY" | "REPRESENTABLE_WITH_STRETCH" | "NOT_REPRESENTABLE";

export interface HumanProvision {
  id: string;
  sourceSectionRef: string;
  /** Short, faithful paraphrase of the real provision - not a verbatim dump of the ~104KB source. */
  summary: string;
  /** Real dollar/percentage/ratio figures actually in the source, for later exact-match grading. */
  realFigures: string[];
  family: string; // CovenantFamily
  ruleType: string; // ContractRuleType
  evaluationClass: string; // RuleEvaluationClass
  posture: string; // ContractRulePosture
  action?: string; // ContractAction
  formulaRef?: string; // CalculationRuleKind
  conditionTypes: string[]; // ContractConditionType values actually present
  definedTermRefs: string[];
  /** See evaluator.ts's GroundTruthProvisionLike - Phase C fix (POST-ERROR-ANALYSIS field, see individual entries' own comments) so a definition-shaped item correctly extracted into definedTerms[] with no rules[] entry is not scored MISSING. */
  expectedDefinedTermName?: string;
  classification: Representability;
  stretchNotes?: string;
}

export const HUMAN_PROVISIONS: HumanProvision[] = [
  {
    id: "fwrg-6.01-g-i",
    sourceSectionRef: "6.01(g)(i)",
    summary: "Guaranties of supplier/customer/franchisee/licensee obligations in the ordinary course, capped at the greater of a fixed dollar amount and a % of Consolidated Adjusted EBITDA.",
    realFigures: ["$2,500,000", "5% of Consolidated Adjusted EBITDA"],
    family: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "GUARANTEE_DEBT",
    formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    conditionTypes: [],
    definedTermRefs: ["Consolidated Adjusted EBITDA"],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "fwrg-6.01-j",
    sourceSectionRef: "6.01(j)",
    summary: "Debt of Restricted Subsidiaries that are not Loan Parties, capped at the greater of a fixed dollar amount and a % of Consolidated Adjusted EBITDA.",
    realFigures: ["$30,000,000", "50% of Consolidated Adjusted EBITDA"],
    family: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    conditionTypes: ["ENTITY_TYPE"],
    definedTermRefs: ["Restricted Subsidiary", "Loan Party", "Consolidated Adjusted EBITDA"],
    classification: "REPRESENTABLE_CLEANLY",
    stretchNotes:
      "Entity-scope gate ('by a Restricted Subsidiary that is not a Loan Party') is representable via entityScope/entityScopeExcluded plus an ENTITY_TYPE condition; no gap, but two entity-scope fields must both be populated correctly for the rule not to silently overstate who the basket is available to.",
  },
  {
    id: "fwrg-6.01-m",
    sourceSectionRef: "6.01(m)",
    summary: "Capital Leases and purchase money Indebtedness, capped at the greater of a fixed dollar amount and a % of Consolidated Adjusted EBITDA.",
    realFigures: ["$30,000,000", "50% of Consolidated Adjusted EBITDA"],
    family: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    conditionTypes: [],
    definedTermRefs: ["Consolidated Adjusted EBITDA"],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "fwrg-6.02-a",
    sourceSectionRef: "6.02(a)",
    summary: "Liens securing the Secured Obligations are permitted without a dollar cap - an unconditional, non-quantitative permission scoped to a defined obligation pool rather than a basket amount.",
    realFigures: [],
    family: "LIENS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "CREATE_LIEN",
    conditionTypes: [],
    definedTermRefs: ["Secured Obligations"],
    classification: "REPRESENTABLE_CLEANLY",
    stretchNotes:
      "thresholdValue/thresholdUnit are optional on CandidateContractRuleSchema, so an uncapped permission scoped by definedTermRefs rather than a number is not blocked. Noted only because ContractRuleType's name ('QUANTITATIVE_PERMISSION') reads as if every instance must carry a number - it does not, but a naive extractor could wrongly infer a missing/zero threshold means 'not representable' rather than 'uncapped by definition'. Nomenclature risk, not a schema gap.",
  },
  {
    id: "fwrg-6.04-a-iii",
    sourceSectionRef: "6.04(a)(iii)(A)-(B)",
    summary:
      "Restricted Payments up to the Available Amount plus the Available Excluded Contribution Amount - a builder-basket permission whose capacity is itself a separately defined, cumulative, multi-component, conditionally-gated amount (see fwrg-def-available-amount below).",
    realFigures: [],
    family: "RESTRICTED_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "PAY_DIVIDEND",
    formulaRef: "BUILDER_BASKET",
    conditionTypes: [],
    definedTermRefs: ["Available Amount", "Available Excluded Contribution Amount"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes:
      "The permission rule itself is clean (a QUANTITATIVE_PERMISSION whose formulaRef points at a separate builder-basket definition via definedTermRefs, exactly how the ontology's dependency graph is meant to be used). The stretch is entirely inside the referenced Available Amount definition - see fwrg-def-available-amount.",
  },
  {
    id: "fwrg-6.04-a-x",
    sourceSectionRef: "6.04(a)(x)",
    summary: "Restricted Payments up to the greater of a fixed dollar amount and a % of Consolidated Adjusted EBITDA, conditioned on no continuing Event of Default.",
    realFigures: ["$21,000,000", "35% of Consolidated Adjusted EBITDA"],
    family: "RESTRICTED_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "PAY_DIVIDEND",
    formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    conditionTypes: ["NO_DEFAULT"],
    definedTermRefs: ["Consolidated Adjusted EBITDA"],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "fwrg-6.04-a-xi",
    sourceSectionRef: "6.04(a)(xi)",
    summary: "Unlimited (uncapped-dollar) Restricted Payments so long as the Total Rent Adjusted Net Leverage Ratio, calculated Pro Forma, would not exceed a fixed ratio - a ratio-gated unlimited basket with no default condition attached.",
    realFigures: ["3.50:1.00 Total Rent Adjusted Net Leverage Ratio, Pro Forma Basis"],
    family: "RESTRICTED_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "PAY_DIVIDEND",
    formulaRef: "RATIO_DERIVED_AMOUNT",
    conditionTypes: ["RATIO_SATISFIED"],
    definedTermRefs: ["Total Rent Adjusted Net Leverage Ratio"],
    classification: "REPRESENTABLE_CLEANLY",
    stretchNotes:
      "The single most dangerous plausible extraction error in this whole package: an extractor that reports a dollar threshold (or omits the ratio gate) for this clause instead of 'uncapped subject to a leverage-ratio test' would be confidently wrong and, unless conditions[] is checked, unflagged. This is a designed adversarial probe for Task 12, not a schema issue.",
  },
  {
    id: "fwrg-6.04-b",
    sourceSectionRef: "6.04(b)(iv)",
    summary: "Restricted Debt Payments (early/voluntary paydown of subordinated/junior/unsecured debt above a size threshold) permitted up to the greater of a fixed dollar amount and a % of EBITDA, with an explicit cross-basket offset against the 6.04(a)(x) Restricted Payments basket.",
    realFigures: ["$21,000,000", "35% of Consolidated Adjusted EBITDA"],
    family: "RESTRICTED_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "PAY_JUNIOR_DEBT",
    formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    conditionTypes: ["NO_DEFAULT"],
    definedTermRefs: ["Restricted Debt", "Consolidated Adjusted EBITDA"],
    classification: "REPRESENTABLE_CLEANLY",
    stretchNotes:
      "The cross-basket offset ('any amount utilized ... shall result in a reduction in the amount available under Section 6.04(a)(x)') is exactly what ContractRuleRelationshipType.SHARES_CAPACITY_WITH exists for - representable, but only if the extractor actually emits that relationship edge rather than treating the two baskets as independent.",
  },
  {
    id: "fwrg-6.06-b-ii",
    sourceSectionRef: "6.06(b)(ii)",
    summary: "Investments by a Loan Party in a non-Loan-Party Restricted Subsidiary, capped at the greater of a fixed dollar amount and a % of Consolidated Adjusted EBITDA.",
    realFigures: ["$15,000,000", "25% of Consolidated Adjusted EBITDA"],
    family: "INVESTMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "MAKE_INVESTMENT",
    formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    conditionTypes: ["ENTITY_TYPE"],
    definedTermRefs: ["Loan Party", "Restricted Subsidiary", "Consolidated Adjusted EBITDA"],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "fwrg-6.07-threshold",
    sourceSectionRef: "6.07 (chapeau)",
    summary: "Mergers/consolidations/dissolutions and voluntary asset dispositions outside the ordinary course are restricted above a fair-market-value threshold expressed as the greater of a fixed dollar amount and a % of Consolidated Adjusted EBITDA, per transaction or series of related transactions.",
    realFigures: ["$6,000,000", "10% of Consolidated Adjusted EBITDA"],
    family: "FUNDAMENTAL_CHANGES",
    ruleType: "QUANTITATIVE_RESTRICTION",
    evaluationClass: "EXECUTABLE",
    posture: "PROHIBITION",
    action: "SELL_ASSET",
    formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    conditionTypes: [],
    definedTermRefs: ["Consolidated Adjusted EBITDA"],
    classification: "REPRESENTABLE_CLEANLY",
    stretchNotes:
      "'in any single transaction or series of related transactions' is an aggregation-window qualifier the schema does not have a dedicated structured field for; it is representable in the free-text ContractCondition.description/parameter bag (type OTHER_RULE_SATISFIED or a plain note), not as a first-class typed field. Loses a little structure, not blocked.",
  },
  {
    id: "fwrg-6.10-a",
    sourceSectionRef: "6.10(a)",
    summary:
      "Maintenance covenant: Total Rent Adjusted Net Leverage Ratio must not exceed a maximum that steps down over three date ranges, with a temporary 0.50x step-UP for four fiscal quarters following a Material Acquisition, and an anti-stacking rule limiting how close together step-up periods may occur.",
    realFigures: ["5.50:1.00 (through Q4 2022)", "5.25:1.00 (through Q4 2023)", "5.00:1.00 (thereafter)", "+0.50:1.00 step-up for 4 quarters after a Material Acquisition"],
    family: "FINANCIAL_COVENANTS",
    ruleType: "RATIO_TEST",
    evaluationClass: "EXECUTABLE",
    posture: "OBLIGATION",
    action: "SATISFY_RATIO",
    // GROUND-TRUTH ADJUDICATION (Phase 1B, docs/phase-1b-executability-semantics.md §8):
    // originally authored as formulaRef: "RATIO_DERIVED_AMOUNT" (see git
    // history for the exact prior line). Adjudicated GROUND_TRUTH_INCORRECT
    // and corrected to omit formulaRef: this is a pure maintenance ratio
    // test (the covenant never derives a permitted dollar amount - it is a
    // pass/fail comparison of an actual ratio against a threshold), and
    // CalculationRuleKind/RATIO_DERIVED_AMOUNT is documented (types.ts) as
    // "representability first" for rules that DERIVE a capacity amount.
    // lsb-6.15-springing-financial-covenant below - the directly analogous
    // maintenance/springing ratio covenant in the OTHER unseen package's own
    // ground truth - already omits formulaRef entirely, confirming this was
    // an authoring inconsistency, not a considered choice. Removing it loses
    // no real economic information (the ratio, threshold, and step schedule
    // are fully captured by realFigures/thresholdValue/conditionTypes) and
    // no evaluator reads formulaRef for any CalculationRuleKind value today
    // (lib/contract-model/compiler/evaluator-registry.ts), so adding it back
    // would not enable any new calculation either.
    conditionTypes: ["TIME_PERIOD", "MATERIAL_ACQUISITION"],
    definedTermRefs: ["Total Rent Adjusted Net Leverage Ratio", "Material Acquisition", "Test Period"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes:
      "The step-down schedule is representable as three separate ContractRule rows with effectiveFrom/effectiveTo windows (the same versioning mechanism amendments already use), and the acquisition step-up as an AmendmentEffect-shaped or ContractRuleRelationship (PARAMETER_ADJUSTMENT_TRIGGER) modification keyed to a Material-Acquisition event rather than an amendment - PARAMETER_ADJUSTMENT_TRIGGER exists in ContractRuleRelationshipType for exactly this. The stretch: nothing in the ontology distinguishes a *contractually scheduled* threshold change (this covenant) from a *document-amendment-driven* one (AmendmentEffect/effectiveFrom-effectiveTo) at the type level - both would use the same mechanical fields, so a naive extractor could conflate 'this rule's threshold changes because the calendar moved' with 'this rule's threshold changed because the parties amended it,' which have different provenance and audit implications.",
  },
  {
    id: "fwrg-6.10-b",
    sourceSectionRef: "6.10(b)",
    summary: "Maintenance covenant: Fixed Charge Coverage Ratio must not be less than a fixed minimum, tested on the same Test Period basis as 6.10(a).",
    realFigures: ["1.25:1.00"],
    family: "FINANCIAL_COVENANTS",
    ruleType: "RATIO_TEST",
    evaluationClass: "EXECUTABLE",
    posture: "OBLIGATION",
    action: "SATISFY_RATIO",
    // GROUND-TRUTH ADJUDICATION (Phase 1B, docs/phase-1b-executability-semantics.md §8):
    // same adjudication as fwrg-6.10-a above - originally
    // formulaRef: "RATIO_DERIVED_AMOUNT" (see git history), corrected to
    // omit it for the same rationale (pure maintenance ratio test, derives
    // no amount, inconsistent with the LSB unseen package's own
    // lsb-6.15-springing-financial-covenant ground-truth precedent, no
    // evaluator reads formulaRef today, no economic information lost).
    conditionTypes: [],
    definedTermRefs: ["Fixed Charge Coverage Ratio", "Test Period"],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "fwrg-6.10-c",
    sourceSectionRef: "6.10(c)",
    summary:
      "Equity cure right for a 6.10(a)/(b) breach: Borrower may receive a cash equity contribution (Cure Amount) added pro forma to Consolidated Adjusted EBITDA solely for covenant-compliance recalculation, capped at exactly the amount needed to cure, usable at most 5 times over the life of the facility, and not exercisable in more than 2 of any 4 consecutive fiscal quarters (equivalently: at least 2-of-4 quarters must be cure-free).",
    realFigures: ["Cure Amount capped at shortfall (no separate dollar cap)", "5 total exercises", "cannot exercise in more than 2 of 4 consecutive Fiscal Quarters"],
    family: "FINANCIAL_COVENANTS",
    ruleType: "CONDITIONAL_ACTIVATION",
    evaluationClass: "JUDGMENT_REQUIRED",
    posture: "PERMISSION",
    action: "OTHER",
    conditionTypes: ["TIME_PERIOD", "AMOUNT_THRESHOLD"],
    definedTermRefs: ["Cure Amount", "Cure Right", "Fiscal Quarter"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes:
      "No ContractAction value names an equity cure precisely (OTHER is the honest fallback, which is exactly what OTHER exists for - flagged for review, not silently dropped). The two usage caps (lifetime count, and a 2-of-4-quarter rolling limit) are a rolling-window cardinality constraint that ContractCondition's flat type+description+parameter shape can hold as free-form data but has no first-class 'rolling N-of-M window' primitive - representable, but only as unstructured parameter data an evaluator would need bespoke code to interpret, unlike a plain numeric threshold.",
  },
  {
    id: "fwrg-def-available-amount",
    sourceSectionRef: "Article 1 (Available Amount)",
    summary:
      "Available Amount: a cumulative, multi-clause builder-basket definition whose components include (i) a reserved/unused sub-clause, (ii) the CNI Growth Amount - itself only available if the Total Rent Adjusted Net Leverage Ratio is at or below a threshold on a Pro Forma Basis, AND unavailable for a specific Restricted Payment use (6.04(a)(iii)(A)) if specific, named Events of Default (7.01(a), (f), or (g) only - not any Event of Default) exist, (iii)-(iv) further sub-clauses for equity issuance/contribution proceeds and converted-debt proceeds, each carved out from double-counting against Cure Amounts and Available Excluded Contribution Amount.",
    realFigures: ["Total Rent Adjusted Net Leverage Ratio <= 4.50:1.00, Pro Forma Basis, gates clause (ii) only"],
    family: "DEFINITIONS_CALCULATION_RULES",
    ruleType: "CALCULATION_RULE",
    evaluationClass: "JUDGMENT_REQUIRED",
    posture: "N_A",
    formulaRef: "CUMULATIVE_AMOUNT",
    conditionTypes: ["RATIO_SATISFIED", "OTHER_RULE_SATISFIED"],
    definedTermRefs: ["CNI Growth Amount", "Total Rent Adjusted Net Leverage Ratio", "Available Excluded Contribution Amount", "Cure Amount"],
    // Phase C evaluator fix (task §38/§48/§56 - POST-ERROR-ANALYSIS, not a
    // blind-run field: added after the real C0 run showed "Available Amount"
    // present in the model's own definedTerms[] with zero rules[] entry -
    // see docs/phase-c0-analyzer-validation.md §M). Any FWRG re-score using
    // this field must be reported as POST-ERROR-ANALYSIS / NOT BLIND, never
    // silently presented as a fresh blind result.
    expectedDefinedTermName: "Available Amount",
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes:
      "This is the hardest single provision in the package and the ontology's real stress test. The primitives all exist (CALCULATION_RULE + CUMULATIVE_AMOUNT/BUILDER_BASKET formulaRef; ContractRuleRelationshipType.BASKET_FEEDING for CNI Growth Amount feeding Available Amount; per-component conditions). But faithfully representing it requires DECOMPOSING one dense definitional paragraph into several linked atomic rows - a top-level Available Amount CALCULATION_RULE plus a separate row per lettered sub-clause, each carrying its own conditions - rather than one row with a single conditions[] array, because clause (ii)'s ratio gate and narrow-EOD carve-out do not apply to clauses (iii)/(iv). A single-call extractor that emits one ContractRule for 'Available Amount' with all conditions flattened together would be REPRESENTABLE_CLEANLY-looking but semantically wrong: it would either apply the ratio gate to the whole basket (too restrictive) or drop it entirely (too permissive, and the dangerous direction). This is a decomposition-discipline risk, not a missing taxonomy value - recorded here as the primary predicted source of a dangerous, plausibly-unflagged error and used as the main adversarial probe in Task 12.",
  },
  {
    id: "fwrg-def-cadj-ebitda",
    sourceSectionRef: "Article 1 (Consolidated Adjusted EBITDA)",
    summary: "Consolidated Adjusted EBITDA: Consolidated Net Income plus a long, itemized stack of addbacks (interest expense, taxes, D&A, non-cash/impairment items, business-interruption insurance proceeds, and more).",
    realFigures: [],
    family: "DEFINITIONS_CALCULATION_RULES",
    ruleType: "DEFINITION",
    evaluationClass: "JUDGMENT_REQUIRED",
    posture: "N_A",
    formulaRef: "OTHER",
    conditionTypes: [],
    definedTermRefs: ["Consolidated Net Income", "Consolidated Interest Expense"],
    expectedDefinedTermName: "Consolidated Adjusted EBITDA", // Phase C evaluator fix, POST-ERROR-ANALYSIS - see fwrg-def-available-amount's own comment above.
    classification: "REPRESENTABLE_CLEANLY",
    stretchNotes:
      "Clean for REPRESENTATION (a DEFINITION node with definitionExcerpt plus USES_TERM/USES_FINANCIAL_INPUT dependency edges to each addback concept it references) - not a claim of full line-item EXECUTABILITY, which Phase B never promised for any covenant-defined-EBITDA metric and which RuleEvaluationClass=JUDGMENT_REQUIRED already signals honestly. CALCULATION_RULE_KINDS has no dedicated 'itemized-addback-stack' kind; OTHER is the correct, non-misleading fallback for this specific shape.",
  },
  {
    id: "fwrg-def-cadj-ebitdar",
    sourceSectionRef: "Article 1 (Consolidated Adjusted EBITDAR)",
    summary: "Consolidated Adjusted EBITDAR: Consolidated Adjusted EBITDA plus Consolidated Cash Rental Expense - the restaurant-industry rent-adjusted metric that Coherent and Matthews' plain-EBITDA leverage covenants never required.",
    realFigures: [],
    family: "DEFINITIONS_CALCULATION_RULES",
    ruleType: "DEFINITION",
    evaluationClass: "JUDGMENT_REQUIRED",
    posture: "N_A",
    formulaRef: "OTHER",
    conditionTypes: [],
    definedTermRefs: ["Consolidated Adjusted EBITDA", "Consolidated Cash Rental Expense"],
    expectedDefinedTermName: "Consolidated Adjusted EBITDAR", // Phase C evaluator fix, POST-ERROR-ANALYSIS - see fwrg-def-available-amount's own comment above.
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "fwrg-def-restricted-subsidiary-loan-party",
    sourceSectionRef: "Article 1 (Restricted Subsidiary / Loan Party)",
    summary: "Entity-classification defined terms that gate which subsidiaries a given basket, guaranty, or covenant applies to or excludes (Restricted vs. Unrestricted Subsidiary; Loan Party vs. non-Loan-Party Restricted Subsidiary).",
    realFigures: [],
    family: "ENTITY_SCOPE_RESTRICTIONS",
    ruleType: "ENTITY_SCOPE_RULE",
    evaluationClass: "MONITORABLE",
    posture: "N_A",
    conditionTypes: ["ENTITY_TYPE"],
    definedTermRefs: [],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "fwrg-def-restricted-debt",
    sourceSectionRef: "Article 1 (Restricted Debt) / 6.04(b)",
    summary: "Restricted Debt: debt of a Loan Party that is contractually subordinated, or constitutes Junior Lien Debt, or is unsecured, and exceeds a size threshold - a subordination/priority concept gating the 6.04(b) Restricted Debt Payments restriction.",
    realFigures: [],
    family: "AMENDMENT_WAIVER_CONSENT",
    ruleType: "PRIORITY_RULE",
    evaluationClass: "MONITORABLE",
    posture: "N_A",
    conditionTypes: ["ENTITY_TYPE", "AMOUNT_THRESHOLD"],
    definedTermRefs: ["Loan Party", "Junior Lien Debt", "Threshold Amount"],
    expectedDefinedTermName: "Restricted Debt", // Phase C evaluator fix, POST-ERROR-ANALYSIS - see fwrg-def-available-amount's own comment above.
    classification: "REPRESENTABLE_CLEANLY",
    stretchNotes:
      "CovenantFamily has no dedicated 'subordination/payment-priority' member; PRIORITY_RULE (ContractRuleType) and SOURCE_PRECEDENCE_RULE/SOURCE_PRECEDENCE (ContractRuleType/ContractRuleRelationshipType) exist for exactly this concept, so it is representable, but the human modeler had to actively choose AMENDMENT_WAIVER_CONSENT as the least-wrong existing family label - a real, if minor, ontology-fit gap worth flagging for Phase C rather than silently working around.",
  },
];

export const TOTAL_MATERIAL_PROVISIONS = HUMAN_PROVISIONS.length; // 18

export const REPRESENTABLE_CLEANLY_COUNT = HUMAN_PROVISIONS.filter((p) => p.classification === "REPRESENTABLE_CLEANLY").length; // 12
export const REPRESENTABLE_WITH_STRETCH_COUNT = HUMAN_PROVISIONS.filter((p) => p.classification === "REPRESENTABLE_WITH_STRETCH").length; // 6
export const NOT_REPRESENTABLE_COUNT = HUMAN_PROVISIONS.filter((p) => p.classification === "NOT_REPRESENTABLE").length; // 0

export const REPRESENTABLE_CLEANLY_PCT = Math.round((REPRESENTABLE_CLEANLY_COUNT / TOTAL_MATERIAL_PROVISIONS) * 1000) / 10; // 66.7
export const REPRESENTABLE_WITH_STRETCH_PCT = Math.round((REPRESENTABLE_WITH_STRETCH_COUNT / TOTAL_MATERIAL_PROVISIONS) * 1000) / 10; // 33.3
export const NOT_REPRESENTABLE_PCT = Math.round((NOT_REPRESENTABLE_COUNT / TOTAL_MATERIAL_PROVISIONS) * 1000) / 10; // 0

/**
 * Ontology verdict (task's own required output). Every one of the 18 real
 * material provisions read from this unseen package maps onto an EXISTING
 * CovenantFamily/ContractRuleType/RuleEvaluationClass/ContractRulePosture/
 * ContractAction/CalculationRuleKind value with zero schema changes - the
 * "stretch" cases above are decomposition-discipline and free-text-fallback
 * risks for an extractor to get right, not missing enum members or missing
 * table/edge types. That is exactly ONTOLOGY_SUFFICIENT's bar: no schema
 * change is required to proceed; Task 3 therefore makes no ontology
 * corrections. The two named nomenclature/family-fit rough edges
 * (fwrg-6.02-a's naming, fwrg-def-restricted-debt's family choice) are
 * recorded as non-blocking documentation notes for a future Phase C
 * iteration, not treated as gaps that block this verdict.
 */
export const ONTOLOGY_VERDICT: "ONTOLOGY_SUFFICIENT" | "ONTOLOGY_NEEDS_EXTENSION" | "ONTOLOGY_STRUCTURALLY_WRONG" = "ONTOLOGY_SUFFICIENT";
