/**
 * Phase C, second unseen package - independent human material-provision
 * inventory for the real LSB Industries 2023 ABL Credit Agreement (see
 * README.md). Written by direct reading of article-6-negative-covenants.txt,
 * definitions-excerpt.txt, and intercreditor-joinder.txt, BEFORE any
 * extractor (synthetic or real LLM) saw this package. Never imported by
 * lib/contract-model/analyzer/** or lib/contract-model/compiler/**.
 *
 * Classification is against the REAL Phase B ontology in
 * lib/contract-model/types.ts and prisma/schema.prisma, exactly as
 * fwrg-2021-credit-agreement's own human-ground-truth.ts does.
 */

export type Representability = "REPRESENTABLE_CLEANLY" | "REPRESENTABLE_WITH_STRETCH" | "NOT_REPRESENTABLE";

export interface HumanProvision {
  id: string;
  sourceSectionRef: string;
  summary: string;
  realFigures: string[];
  family: string; // CovenantFamily
  ruleType: string; // ContractRuleType
  evaluationClass: string; // RuleEvaluationClass
  posture: string; // ContractRulePosture
  action?: string; // ContractAction
  formulaRef?: string; // CalculationRuleKind
  conditionTypes: string[]; // ContractConditionType values actually present
  definedTermRefs: string[];
  expectedDefinedTermName?: string;
  classification: Representability;
  stretchNotes?: string;
}

export const HUMAN_PROVISIONS: HumanProvision[] = [
  {
    id: "lsb-6.01-general-ratio-gated",
    sourceSectionRef: "6.01",
    summary: "General (uncapped, no dollar ceiling) Indebtedness permission for the Loan Parties, unlocked ONLY if, as of the incurrence date, (i) Fixed Charge Coverage Ratio > 2.0:1.0 for the trailing four fiscal quarters AND (ii) Payment Conditions are satisfied - distinct from the enumerated (a)-(t) exceptions that follow it.",
    realFigures: ["2.0:1.00 Fixed Charge Coverage Ratio"],
    family: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    conditionTypes: ["RATIO_SATISFIED", "MINIMUM_LIQUIDITY", "OTHER_RULE_SATISFIED"],
    definedTermRefs: ["Fixed Charge Coverage Ratio", "Payment Conditions"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "This basket has NO dollar cap - the only gates are the ratio and Payment Conditions. thresholdValue/thresholdUnit are honestly null/unlimited-shaped for this rule (the ontology's own capacityUnlimited-style representation, not a missing field), and Payment Conditions itself is a compound MINIMUM_LIQUIDITY+NO_DEFAULT+certificate condition folded into one named defined term rather than being spelled out per-basket - representable as a single condition citing the defined term, but only if the extractor resists the temptation to inline the underlying sub-conditions redundantly on every basket that references it.",
  },
  {
    id: "lsb-6.01-i-flat-or-pct-assets",
    sourceSectionRef: "6.01(i)",
    summary: "Additional unconditional Indebtedness basket capped at the greater of a fixed dollar amount and a percentage of the Loan Parties' total consolidated assets (per GAAP balance sheet) - NOT a percentage of EBITDA.",
    realFigures: ["$70,000,000", "5.5% of total consolidated assets"],
    family: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    conditionTypes: [],
    definedTermRefs: [],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "GREATER_OF_FLAT_OR_PCT_EBITDA is the closest existing CalculationRuleKind, but its own name says EBITDA and this basket's percentage component is of TOTAL CONSOLIDATED ASSETS, not EBITDA - the same real, previously-documented ontology-fit gap Matthews' own onboarding found for a percent-of-Total-Assets sub-cap (docs/matthews-international-onboarding.md), now independently re-confirmed by a second, unrelated real company via a completely different unseen-package methodology. lib/contract-model/types.ts's INPUT_REQUIREMENT_KEYS also has no TOTAL_ASSETS member (only COVENANT_EBITDA, NET_DEBT, SECURED_DEBT, etc.) - OTHER is the honest fallback, not a blocking gap, but a real, recurring, worth-fixing generalization candidate for Phase C+1.",
  },
  {
    id: "lsb-6.01-m-secured-notes",
    sourceSectionRef: "6.01(m)",
    summary: "Unconditional carve-out for the Loan Parties' existing Indebtedness under the Secured Notes and guarantees thereof.",
    realFigures: [],
    family: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    conditionTypes: [],
    definedTermRefs: ["Secured Notes"],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "lsb-6.02-liens",
    sourceSectionRef: "6.02",
    summary: "General Lien prohibition on all Loan Party assets, subject only to Permitted Liens (including replacement liens for refinanced Section 6.01(d) debt).",
    realFigures: [],
    family: "LIENS",
    ruleType: "PROHIBITION",
    evaluationClass: "EXECUTABLE",
    posture: "PROHIBITION",
    action: "CREATE_LIEN",
    conditionTypes: [],
    definedTermRefs: ["Permitted Liens"],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "lsb-6.03-fundamental-changes",
    sourceSectionRef: "6.03",
    summary: "Prohibition on merger/consolidation/reclassification of stock (a), liquidation/dissolution (b), and sale of all-or-substantially-all assets (c), with several intercompany/ordinary-course/good-faith carve-outs.",
    realFigures: [],
    family: "FUNDAMENTAL_CHANGES",
    ruleType: "PROHIBITION",
    evaluationClass: "EXECUTABLE",
    posture: "PROHIBITION",
    action: "MERGE",
    conditionTypes: [],
    definedTermRefs: [],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "lsb-6.04-a-abl-collateral-disposal",
    sourceSectionRef: "6.04(a)",
    summary: "Disposal of ABL Priority Collateral permitted only if (i) a new Borrowing Base Certificate is delivered demonstrating continued compliance, (ii) sold at Fair Market Value, and (iii) aggregate annual dispositions under this clause do not exceed the greater of $10,000,000 and 1.0% of total consolidated assets.",
    realFigures: ["$10,000,000", "1.0% of total consolidated assets"],
    family: "ASSET_SALES",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "SELL_ASSET",
    formulaRef: "GREATER_OF_FLAT_OR_PCT_EBITDA",
    conditionTypes: ["SECURITY_SCOPE", "OTHER_RULE_SATISFIED"],
    definedTermRefs: ["ABL Priority Collateral", "Borrowing Base"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "Same TOTAL_ASSETS-percentage gap as lsb-6.01-i. Additionally, this basket's own eligibility is scoped by SECURITY_SCOPE (only ABL Priority Collateral) - a real, correctly-representable use of the ContractConditionType SECURITY_SCOPE, but the security-scope VALUE itself (ABL Priority Collateral) is defined only by reference to a document (the Intercreditor Agreement) not in this filing - see lsb-def-abl-notes-priority-collateral below.",
  },
  {
    id: "lsb-6.04-b-notes-collateral-disposal",
    sourceSectionRef: "6.04(b)",
    summary: "Disposal of Notes Priority Collateral is permitted so long as permitted under the Secured Notes Documents or consented to by the requisite Secured Notes holders - a permission whose actual gating condition lives entirely OUTSIDE this Credit Agreement, in documents this package does not contain.",
    realFigures: [],
    family: "ASSET_SALES",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "JUDGMENT_REQUIRED",
    posture: "PERMISSION",
    action: "SELL_ASSET",
    conditionTypes: ["SECURITY_SCOPE", "UNSUPPORTED"],
    definedTermRefs: ["Notes Priority Collateral", "Secured Notes Documents"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "The correct, honest extraction is a rule with evaluationClass JUDGMENT_REQUIRED and an UNSUPPORTED/cross-document condition explicitly naming 'Secured Notes Documents' (not filed in this package) as an unresolved dependency - a genuinely UNRESOLVABLE-from-this-document-alone reference (task §23), not a extractor failure if flagged honestly. A confident EXECUTABLE extraction here (inventing a dollar figure or ratio that does not exist in this text) would be exactly the DANGEROUS_UNFLAGGED failure mode this whole exercise measures.",
  },
  {
    id: "lsb-6.08-subordinated-debt-payments",
    sourceSectionRef: "6.08",
    summary: "Prohibition on payments of Indebtedness generally (other than the Secured Notes/Secured Obligations), with carve-outs for scheduled payments of permitted debt, refinancing payments, payments of Subordinated Indebtedness only as its own subordination terms allow, Payment-Conditions-gated payments, and a $500,000/year fixed basket; separately, no amendment of Subordinated Indebtedness terms materially adverse to the Lenders.",
    realFigures: ["$500,000"],
    family: "INDEBTEDNESS",
    ruleType: "PRIORITY_RULE",
    evaluationClass: "EXECUTABLE",
    posture: "PROHIBITION",
    action: "PREPAY_DEBT",
    formulaRef: "FIXED_AMOUNT",
    conditionTypes: ["MINIMUM_LIQUIDITY", "OTHER_RULE_SATISFIED"],
    definedTermRefs: ["Subordinated Indebtedness", "Payment Conditions"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "PRIORITY_RULE is the correct ContractRuleType (this gates payment priority among debt tiers, mirroring FWRG's own fwrg-def-restricted-debt finding), but this section actually bundles at least 3 independently-gated payment baskets (scheduled-payment carve-out, Payment-Conditions-gated, $500k fixed) into one Section 6.08(a) - the same decomposition-discipline risk FWRG's Available Amount provision raised: a single flattened rule here would either over- or under-permit depending which sub-clause's condition got dropped.",
  },
  {
    id: "lsb-6.11-restricted-payments",
    sourceSectionRef: "6.11",
    summary: "Prohibition on dividends/distributions/stock repurchases (Restricted Payments), except intercompany, Section 6.03-permitted transactions, Payment-Conditions-gated Restricted Payments (uncapped), and a $500,000/fiscal-year fixed basket.",
    realFigures: ["$500,000"],
    family: "RESTRICTED_PAYMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "PAY_DIVIDEND",
    formulaRef: "FIXED_AMOUNT",
    conditionTypes: ["MINIMUM_LIQUIDITY", "OTHER_RULE_SATISFIED"],
    definedTermRefs: ["Payment Conditions"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "The Payment-Conditions-gated clause (c) has NO dollar cap at all (unlike FWRG's ratio-gated baskets, which are typically still capped) - representable as a RATIO/liquidity-gated permission with capacityUnlimited=true rather than a missing threshold, but only if the extractor does not default to treating 'no explicit cap in this clause' as a missing/uncertain value.",
  },
  {
    id: "lsb-6.13-investments",
    sourceSectionRef: "6.13",
    summary: "Prohibition on Investments generally, except intercompany, ordinary-course/collection-related carve-outs, a $35,000,000 joint-venture cap, Payment-Conditions-gated Investments (uncapped), and a $5,000,000 general basket.",
    realFigures: ["$35,000,000", "$5,000,000"],
    family: "INVESTMENTS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "MAKE_INVESTMENT",
    formulaRef: "FIXED_AMOUNT",
    conditionTypes: ["MINIMUM_LIQUIDITY", "OTHER_RULE_SATISFIED"],
    definedTermRefs: ["Payment Conditions", "Special Permitted Investments"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "THREE independently-capped/gated Investment baskets in one section (the same multi-basket-in-one-section pattern as 6.08/6.11) - a real, generalizable extraction-completeness risk (does the extractor find all three, or stop at the first plausible match?), directly testable by grading whether all three real figures appear across the extracted rule set for this section, not just one.",
  },
  {
    id: "lsb-6.14-affiliate-transactions",
    sourceSectionRef: "6.14",
    summary: "Prohibition on Affiliate transactions except a $5,000,000 aggregate threshold, ordinary-course/arm's-length transactions, and other Agreement-permitted transactions.",
    realFigures: ["$5,000,000"],
    family: "AFFILIATE_TRANSACTIONS",
    ruleType: "QUANTITATIVE_PERMISSION",
    evaluationClass: "EXECUTABLE",
    posture: "PERMISSION",
    action: "ENTER_AFFILIATE_TRANSACTION",
    formulaRef: "FIXED_AMOUNT",
    conditionTypes: [],
    definedTermRefs: [],
    classification: "REPRESENTABLE_CLEANLY",
  },
  {
    id: "lsb-6.15-springing-financial-covenant",
    sourceSectionRef: "6.15",
    summary: "Minimum Fixed Charge Coverage Ratio of 1.00:1.00 (trailing-twelve-month, tested monthly) - but ONLY during an 'Availability Block Removal Period,' a real event-triggered springing covenant distinct from FWRG's always-on ratio maintenance test.",
    realFigures: ["1.00:1.00 Fixed Charge Coverage Ratio"],
    family: "FINANCIAL_COVENANTS",
    ruleType: "RATIO_TEST",
    evaluationClass: "EXECUTABLE",
    posture: "OBLIGATION",
    action: "SATISFY_RATIO",
    conditionTypes: ["OTHER_RULE_SATISFIED", "TIME_PERIOD"],
    definedTermRefs: ["Fixed Charge Coverage Ratio", "Availability Block Removal Period"],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "SPRINGING_COVENANTS exists as its own CovenantFamily in the ontology and is arguably a MORE precise family fit than FINANCIAL_COVENANTS for this specific springing-trigger shape - a real, minor family-choice ambiguity (not a missing value) worth noting, mirroring FWRG's own fwrg-def-restricted-debt family-fit note.",
  },
  {
    id: "lsb-def-payment-conditions",
    sourceSectionRef: "Article 1 (Payment Conditions)",
    summary: "Payment Conditions: a compound, reused defined condition requiring (a) no continuing Default, (b) pro forma 'Specified Availability' of not less than the greater of 20% of the Revolving Commitment and $13,000,000 (measured at the time of, and throughout the 30 days preceding, the transaction), and (c) an officer's certificate (with a carve-out for certain stock-repurchase Restricted Payments).",
    realFigures: ["20% of Revolving Commitment", "$13,000,000", "30 consecutive days"],
    family: "DEFINITIONS_CALCULATION_RULES",
    ruleType: "DEFINITION",
    evaluationClass: "EXECUTABLE",
    posture: "N_A",
    formulaRef: "OTHER",
    conditionTypes: ["MINIMUM_LIQUIDITY", "NO_DEFAULT"],
    definedTermRefs: ["Specified Availability", "Revolving Commitment"],
    expectedDefinedTermName: "Payment Conditions",
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "Representable as a DEFINITION node whose own conditions[] array carries both a MINIMUM_LIQUIDITY and a NO_DEFAULT condition - but this is a NAMED, REUSED compound condition referenced by citation (not restated) in 6.01, 6.08, 6.11, and 6.13. A correct extraction should model it ONCE and have each citing rule reference it by name/definedTermRef, not restate or re-derive its sub-conditions independently four times (a real, generalizable risk for any document with a reused named condition, not unique to this one).",
  },
  {
    id: "lsb-def-abl-notes-priority-collateral",
    sourceSectionRef: "Article 1 (ABL Priority Collateral / Notes Priority Collateral)",
    summary: "Both 'ABL Priority Collateral' and 'Notes Priority Collateral' are defined ONLY by cross-reference to the Intercreditor Agreement ('shall have the meaning set forth in the Intercreditor Agreement') - this Credit Agreement's own text never states which specific assets fall into each category.",
    realFigures: [],
    family: "COLLATERAL_SECURITY",
    ruleType: "ENTITY_SCOPE_RULE",
    evaluationClass: "UNSUPPORTED",
    posture: "N_A",
    conditionTypes: ["UNSUPPORTED"],
    definedTermRefs: [],
    classification: "REPRESENTABLE_WITH_STRETCH",
    stretchNotes: "The CORRECT extraction from THIS document alone is an UnresolvedContractItem (itemType UNRESOLVED_CROSS_REFERENCE, blocking=true, pointing at 'the Intercreditor Agreement' as a document this package does not contain) for both terms - not a guessed definition. This is the single clearest test in this package of whether a real extractor invents plausible-sounding collateral-scope content when the actual source is silent, which would be a textbook DANGEROUS_UNFLAGGED failure.",
  },
];

export const TOTAL_MATERIAL_PROVISIONS = HUMAN_PROVISIONS.length; // 14

export const REPRESENTABLE_CLEANLY_COUNT = HUMAN_PROVISIONS.filter((p) => p.classification === "REPRESENTABLE_CLEANLY").length;
export const REPRESENTABLE_WITH_STRETCH_COUNT = HUMAN_PROVISIONS.filter((p) => p.classification === "REPRESENTABLE_WITH_STRETCH").length;
export const NOT_REPRESENTABLE_COUNT = HUMAN_PROVISIONS.filter((p) => p.classification === "NOT_REPRESENTABLE").length;

/**
 * Ontology verdict for this second unseen package. Every one of the 14 real
 * material provisions maps onto an EXISTING CovenantFamily/ContractRuleType/
 * RuleEvaluationClass/ContractRulePosture/ContractAction/CalculationRuleKind
 * value with zero schema changes required - the "stretch" cases are
 * decomposition-discipline risks (a reused named compound condition; several
 * independently-gated baskets packed into one section) and one real,
 * RECURRING (not new) minor ontology-fit rough edge (percentage-of-Total-
 * Assets formulas have no dedicated CalculationRuleKind/InputRequirementKey,
 * the same gap Matthews' own onboarding and this package's own 6.01(i)/
 * 6.04(a) both independently surface) - never a blocking gap. Verdict:
 * ONTOLOGY_SUFFICIENT, consistent with both prior unseen-package findings.
 */
export const ONTOLOGY_VERDICT = "ONTOLOGY_SUFFICIENT" as const;
