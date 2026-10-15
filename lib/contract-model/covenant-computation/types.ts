/**
 * Covenant computation records.
 *
 * Computed values are never CERTIFIED. Missing evidence is NEEDS_INPUT or
 * UNKNOWN. Persistence of mistakes belongs to the covenant learning factory
 * (`learning_artifacts` / `learning_error_ledger_entries` on #356). This
 * module only emits records that factory can insert.
 */

import type { IRExpression } from "../ir/types";

export const COVENANT_COMPUTATION_VERSION = "covenant-computation.v1";

export const CERTIFICATION = "COMPUTED_NOT_CERTIFIED" as const;

export type ComputationStatus = "COMPUTED" | "NEEDS_INPUT" | "UNKNOWN";

export type RatioKey =
  | "TOTAL_NET_LEVERAGE"
  | "TOTAL_GROSS_LEVERAGE"
  | "SECURED_NET_LEVERAGE"
  | "SECURED_GROSS_LEVERAGE"
  | "FIRST_LIEN_NET_LEVERAGE"
  | "FIRST_LIEN_GROSS_LEVERAGE"
  | "FIXED_CHARGE_COVERAGE"
  | "INTEREST_COVERAGE"
  | "LEVERAGE"
  | "SENIOR_LEVERAGE"
  | "NET_LEVERAGE"
  /** A ratio defined in the agreement itself ("“X Ratio” means the ratio of …"), keyed by its own name. */
  | `DEFINED:${string}`;

export type RatioDirection = "MAX" | "MIN";

export type BasketCategory =
  | "FIXED_DOLLAR"
  | "GROWER_GREATER_OF"
  /** "the lesser of $X and Y% of M": the cap is at most the smallest known limb. */
  | "LESSER_OF"
  | "PCT_OF_METRIC"
  | "RATIO_BASED"
  | "BUILDER_AVAILABLE_AMOUNT"
  | "UNLIMITED"
  | "UNLIMITED_BY_PURPOSE"
  /** No cap stated and no explicit unlimited language: NEEDS_INPUT, never unlimited by default. */
  | "CONDITIONS_LIMITED"
  /** Dollar figure is an operand of stated arithmetic ("$550,000,000 divided by …"): NEEDS_INPUT for the other operands. */
  | "FORMULA_AMOUNT"
  | "RECLASS"
  /** A maintenance limit on a stated measure ("will not permit … Subsidiaries to have over 25% of Total Assets"): a
   * test, not capacity to incur, pay or invest. No basket cap is computed from it. */
  | "MAINTENANCE_LIMIT"
  | "UNKNOWN";

export type BasketScope = "GENERAL" | "PURPOSE_SPECIFIC";

export interface PackageDocument {
  documentId: string;
  role: "CREDIT_AGREEMENT" | "INDENTURE" | "FINANCIAL_STATEMENT" | "COMPLIANCE_CERTIFICATE" | "OTHER";
  text: string;
}

export interface BasketClause {
  stableKey: string;
  sectionRef: string;
  covenantFamily: string;
  documentId: string;
  /** Exact slice of `documentId` text. Not a paraphrase. */
  operativeText: string;
  /**
   * PERMISSION: an affirmative exception (intercompany, a numbered basket).
   * CONDITION: a negative-covenant proviso with no capacity of its own.
   */
  role?: "PERMISSION" | "CONDITION";
}

/** A covenant the inventory names, whose operative text is not in the bound package. */
export interface CovenantOmission {
  stableKey: string;
  sectionRef: string;
  covenantFamily: string;
  reason: string;
}

export interface ComputationPackage {
  packageKey: string;
  companyId: string;
  instrumentKey: string;
  asOf: string;
  documents: PackageDocument[];
  baskets: BasketClause[];
  /** Named in research; no operative excerpt in `documents`. Never given a number. */
  omissions?: CovenantOmission[];
}

export interface CitedAmount {
  metricName: string;
  /** Phase-4A canonical decimal or exact fraction. Never a display float. */
  canonical: string;
  currency: string;
  citationExcerpt: string;
  sourceDocumentId: string;
}

export interface RatioThreshold {
  sectionRef: string;
  sourceDocumentId: string;
  citationExcerpt: string;
  raw: string;
  canonical: string;
  direction: RatioDirection;
  comparator: "AT_LEAST" | "NO_GREATER_THAN" | "GREATER_THAN" | "LESS_THAN";
  headroomStatus: ComputationStatus;
  /** actual−threshold (MIN) or threshold−actual (MAX). Null when the ratio itself is not computed. */
  headroomCanonical: string | null;
}

export interface ComputedRatio {
  stableKey: string;
  ratioKey: RatioKey;
  displayName: string;
  status: ComputationStatus;
  certification: typeof CERTIFICATION;
  canonical: string | null;
  numerator: CitedAmount[];
  denominator: CitedAmount[];
  definitionExcerpt: string | null;
  definitionDocumentId: string | null;
  expression: IRExpression | null;
  missingInputs: string[];
  thresholds: RatioThreshold[];
  /** Certificate-reported figure deliberately not used as the calculation. */
  refusedReported: { canonical: string; citationExcerpt: string; sourceDocumentId: string; reason: string } | null;
  note: string;
}

export interface ComputedBasket {
  stableKey: string;
  sectionRef: string;
  covenantFamily: string;
  sourceDocumentId: string;
  citationExcerpt: string;
  category: BasketCategory;
  /** GENERAL basket versus a purpose-limited permission. */
  scope: BasketScope;
  /** Cap as written. Null when the clause states no formula. */
  capFormula: string | null;
  formulaKind: string | null;
  capStatus: ComputationStatus;
  /** Gross cap in contract units. Null for ratio tests, unlimited, and unknowns. */
  capCanonical: string | null;
  capCurrency: string | null;
  /** Set when capCanonical is a bound, not the cap: AT_LEAST (greater-of with an unknown limb) or AT_MOST (lesser-of). */
  capBound?: "AT_LEAST" | "AT_MOST";
  capKind: "AMOUNT" | "UNLIMITED" | "RATIO_TEST" | "NONE";
  /** Dollar room under a ratio test is separate and stays NEEDS_INPUT unless the clause states a conversion. */
  dollarRoomStatus: ComputationStatus;
  remainingStatus: ComputationStatus;
  missingInputs: string[];
  gateOpen: boolean | null;
  reasons: string[];
  certification: typeof CERTIFICATION;
  note: string;
}

export interface ComputationCorrection {
  stableKey: string;
  field: "basket.category";
  corrected: BasketCategory;
  rationale: string;
  /** Must still be a substring of the clause. Otherwise the correction is refused. */
  citationExcerpt: string;
}

export interface AppliedCorrection {
  stableKey: string;
  field: string;
  corrected: string;
  rationale: string;
}

export interface RefusedCorrection {
  stableKey: string;
  field: string;
  reason: string;
}

export interface ComputationResult {
  packageKey: string;
  companyId: string;
  instrumentKey: string;
  asOf: string;
  version: typeof COVENANT_COMPUTATION_VERSION;
  certification: typeof CERTIFICATION;
  ratios: ComputedRatio[];
  baskets: ComputedBasket[];
  correctionsApplied: AppliedCorrection[];
  correctionsRefused: RefusedCorrection[];
  mistakes: ComputationMistake[];
  omissions: Array<CovenantOmission & { status: "NEEDS_INPUT"; capCanonical: null }>;
}

export interface ComputationMistake {
  stableKey: string;
  message: string;
  evidence: Record<string, unknown>;
}
