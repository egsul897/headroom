/**
 * Covenant basket & capacity-formula corpus — library types.
 *
 * This module is intentionally isolated from `lib/contract-model/runtime/capacity`.
 * It does not evaluate capacity, patch the production engine, or change certification.
 */

export const BASKET_FAMILIES = [
  "FIXED_DOLLAR",
  "GREATER_OF_FIXED_AND_PERCENTAGE",
  "GROWER",
  "RATIO_BASED",
  "AVAILABLE_AMOUNT_BUILDER",
  "CUMULATIVE_CREDIT",
  "EQUITY_CONTRIBUTION",
  "INCREMENTAL_DEBT",
  "REFINANCING",
  "PURCHASE_MONEY",
  "GENERAL_DEBT",
  "GENERAL_LIEN",
  "RESTRICTED_PAYMENT",
  "INVESTMENT",
  "ASSET_SALE_REINVESTMENT",
  "SHARED",
  "RECLASSIFICATION",
  "BASKET_REPLENISHMENT",
  "ANTI_DOUBLE_COUNTING",
  "CROSS_COVENANT_CAPACITY_RESTRICTION",
] as const;

export type BasketFamily = (typeof BASKET_FAMILIES)[number];

/**
 * Reusable formula taxonomy — structural shapes observed in public financing agreements.
 * Distinct from production `CalculationRuleKind` / `FormulaType` enums (those are engine bindings).
 */
export const FORMULA_KINDS = [
  "FIXED_DOLLAR_CEILING",
  "GREATER_OF_FIXED_OR_PCT_METRIC",
  "PCT_OF_METRIC_ONLY",
  "RATIO_INCURRENCE_ROOM",
  "BUILDER_SUM_COMPONENTS",
  "BUILDER_STARTER_PLUS_CUMULATIVE",
  "EQUITY_PROCEEDS_CREDIT",
  "INCREMENTAL_CAP_SUM",
  "REFINANCE_PRINCIPAL_PLUS_COSTS",
  "PURCHASE_MONEY_COST_LINKED",
  "SHARED_AGGREGATE_CEILING",
  "REALLOCATION_TRANSFER",
  "RETURN_OF_CAPITAL_REPLENISHMENT",
  "WITHOUT_DUPLICATION_NETTING",
  "CROSS_BASKET_USAGE_REDUCTION",
  "UNLIMITED_SUBJECT_TO_GATE",
  "CARRY_FORWARD_UNUSED",
  "NON_CAPACITY_COMPARATOR",
  "NON_CAPACITY_MAINTENANCE_TEST",
  "NON_CAPACITY_APPROVAL_OR_DEFAULT_TRIGGER",
  "OTHER_SOURCE_STATED",
] as const;

export type FormulaKind = (typeof FORMULA_KINDS)[number];

export const VERIFICATION_STATUSES = [
  "SPAN_GROUNDED",
  "SPAN_GROUNDED_NEEDS_INPUTS",
  "SPAN_GROUNDED_NOT_CAPACITY",
  "NEEDS_REVIEW",
] as const;

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const CAPACITY_SEMANTICS = [
  /** Affirmative permission amount / builder that can create usable capacity when inputs/conditions are known. */
  "AFFIRMATIVE_CAPACITY",
  /** Numeric threshold used only as a comparator, default trigger, approval gate, or maintenance test. */
  "NOT_CAPACITY",
  /** Source states a number/formula but semantics are incomplete without further operative text. */
  "INCOMPLETE_SEMANTICS",
] as const;

export type CapacitySemantics = (typeof CAPACITY_SEMANTICS)[number];

export interface SourceVersion {
  instrumentId: string;
  documentPath: string;
  sourceLabel: string;
  versionNote: string;
}

export interface AmountOrFormulaCandidate {
  formulaKind: FormulaKind;
  /** Compact human-readable formula candidate drawn from the span (not an evaluated amount). */
  expressionText: string;
  /** Optional structured legs when the source states them explicitly. */
  structured?: {
    fixedDollar?: string;
    percentage?: string;
    metric?: string;
    ratioTest?: string;
    components?: string[];
  };
}

export interface BasketCandidate {
  id: string;
  exactSourceSpan: string;
  governingCovenant: string;
  basketFamily: BasketFamily;
  /** Secondary families when one span encodes multiple mechanics (e.g. grower + general debt). */
  secondaryFamilies?: BasketFamily[];
  amountOrFormulaCandidate: AmountOrFormulaCandidate;
  measurementDate: string | null;
  financialInputs: string[];
  entityScope: string;
  conditions: string[];
  sharedCapacityDependencies: string[];
  reclassificationRights: string | null;
  sourceVersion: SourceVersion;
  verificationStatus: VerificationStatus;
  capacitySemantics: CapacitySemantics;
  /** True only when the record asserts affirmative capacity AND all required inputs/conditions are present in-corpus. */
  capacityComputable: boolean;
  capacityComputationBlockers: string[];
  notes: string;
}

export const ADVERSARIAL_ROLES = [
  "COMPARATOR_THRESHOLD",
  "APPROVAL_OR_CONSENT_TRIGGER",
  "FINANCIAL_MAINTENANCE_TEST",
  "DEFAULT_OR_EVENT_THRESHOLD",
  "INTEREST_RATE_FORMULA",
  "DEFINITION_DE_MINIMIS_EXCLUSION",
  "AFFIRMATIVE_CAPACITY_CONTROL",
] as const;

export type AdversarialRole = (typeof ADVERSARIAL_ROLES)[number];

export interface AdversarialExample {
  id: string;
  role: AdversarialRole;
  exactSourceSpan: string;
  governingProvision: string;
  whyNotAffirmativeCapacity: string;
  lookalikeTrap: string;
  pairedCapacityControlId: string | null;
  sourceVersion: SourceVersion;
  verificationStatus: VerificationStatus;
}

export interface FormulaTaxonomyEntry {
  formulaKind: FormulaKind;
  label: string;
  description: string;
  typicalBasketFamilies: BasketFamily[];
  requiredInputs: string[];
  commonFailureModes: string[];
}

export interface CorpusManifest {
  schemaVersion: string;
  generatedAt: string;
  corpusId: string;
  productionEngineUntouched: true;
  paidCalls: false;
  merges: false;
  certificationChanges: false;
  counts: {
    basketCandidates: number;
    affirmativeCapacity: number;
    notCapacity: number;
    incompleteSemantics: number;
    capacityComputable: number;
    capacityBlockedMissingInputs: number;
    adversarialExamples: number;
    familiesCovered: number;
    formulaKindsCovered: number;
    sourceInstruments: number;
    spanGrounded: number;
  };
  familyCoverage: Record<BasketFamily, number>;
  formulaKindCoverage: Partial<Record<FormulaKind, number>>;
  sourceInstruments: string[];
}
