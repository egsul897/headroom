/**
 * Phase 3 legal-role taxonomy for basket/formula candidates.
 *
 * Distinguishes permission, exception, threshold, condition, ratio test,
 * formula component, shared/cross restrictions, definition-only formulas,
 * and non-permissive numerical references.
 *
 * Does not evaluate capacity or bind the production capacity engine.
 */

export const LEGAL_ROLES = [
  "AFFIRMATIVE_PERMISSION",
  "EXCEPTION_TO_PROHIBITION",
  "PROHIBITION_THRESHOLD",
  "CONDITION_PRECEDENT",
  "RATIO_TEST",
  "FORMULA_COMPONENT",
  "SHARED_CAPACITY_RESTRICTION",
  "CROSS_COVENANT_RESTRICTION",
  "DEFINITION_ONLY_FORMULA",
  "NON_PERMISSIVE_NUMERICAL_REFERENCE",
] as const;

export type LegalRole = (typeof LEGAL_ROLES)[number];

export const CONTEXT_CLOSURE_STATUSES = [
  "CLOSED_LOCAL",
  "PARTIAL",
  "REVIEW_REQUIRED",
  "UNSUPPORTED",
] as const;

export type ContextClosureStatus = (typeof CONTEXT_CLOSURE_STATUSES)[number];

export interface ControllingContextClosure {
  candidateId: string;
  parentCovenant: string | null;
  definedTerms: string[];
  localProvisos: string[];
  remoteProvisos: string[];
  entityScope: string | null;
  crossReferences: string[];
  sharedCapacityConstraints: string[];
  amendmentAuthority: string | null;
  measurementDate: string | null;
  financialInputs: string[];
  unresolvedDependencies: Array<{ cause: string; detail: string }>;
  closureStatus: ContextClosureStatus;
  /** Never true in Phase 3 — legal authority + deps + inputs must be independently verified. */
  executable: false;
}
