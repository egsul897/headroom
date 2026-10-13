/**
 * MATW-SECURED-01 — authentic operative debt + lien evidence package types.
 * Read-only evidence contract. Does not alter production permission semantics.
 */

export const MATW_SECURED_01_SCHEMA = "matw-secured-01.operative-package.v1" as const;

export type MatwReadinessVerdict =
  | "AUTHENTIC_OPERATIVE_PACKAGE_READY_FOR_PHASE3"
  | "BLOCKED_BY_SOURCE_EVIDENCE"
  | "BLOCKED_BY_OPERATIVE_AMBIGUITY"
  | "BLOCKED_BY_CROSS_DOCUMENT_AUTHORITY"
  | "REVIEW_REQUIRED";

export type AdversarialCheckResult = "PASS" | "FAIL" | "UNCERTAIN";

export type PathRole =
  | "DEBT_ALTERNATIVE"
  | "DEBT_ADDON"
  | "DEBT_GRANDFATHER"
  | "LIEN_COMPANION"
  | "NOT_A_SECURED_PATH";

export type CompanionStatus =
  | "INDENTURE_LIEN_LINKED"
  | "NO_INDENTURE_LIEN_COMPANION"
  | "CA_NOTES_ONLY"
  | "FALSE_OR_OVERSTATED_LIEN_LINK"
  | "N_A";
