/**
 * Shared contracts for the three customer surfaces (Position / Simulate / Ask).
 * All numerical results flow through the verified engine facade — never UI arithmetic.
 */

/** Customer-facing outcome taxonomy — never collapse these into a single boolean. */
export type CustomerOutcomeKind =
  | "SUPPORTED_PERMISSION"
  | "SUPPORTED_PROHIBITION"
  | "CONDITIONAL_OR_REVIEW_REQUIRED"
  | "MISSING_EVIDENCE"
  | "UNSUPPORTED_CALCULATION";

/** Document + section provenance attached to every result row. */
export interface ControllingCitation {
  documentId: string;
  documentName: string;
  sectionRef: string;
  provisionCode?: string;
  basketName?: string;
  note?: string;
}

export type StructuredTransactionKind =
  | "SECURED_DEBT"
  | "UNSECURED_DEBT"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "ACQUISITION"
  | "ASSET_SALE"
  | "REFINANCING"
  | "REVOLVER_DRAW"
  | "HYBRID_SECURITY"
  | "SECURED_NOTE"
  | "UNKNOWN";

/**
 * Structured contemplated transaction — the Ask→Simulate handoff payload.
 * Missing fields stay null; never invent defaults.
 */
export interface StructuredTransaction {
  kind: StructuredTransactionKind;
  amountMillions: number | null;
  secured: boolean | null;
  evaluationDate: string | null;
  currency: string;
  entityLabel: string | null;
  rawQuestion: string | null;
  /** Opaque handoff id so Simulate can detect stale Ask evidence. */
  handoffId: string;
  /** Fingerprint of verified state at Ask time (optional). */
  stateFingerprint?: string;
}

export interface OutcomeClassification {
  kind: CustomerOutcomeKind;
  label: string;
  /** Why this kind was chosen — especially when a green ratio alone is insufficient. */
  rationale: string;
  /** True only for SUPPORTED_PERMISSION after all tested constraints clear. */
  isAffirmativePermission: boolean;
}

export interface EngineAuthorityLabel {
  capacityAuthority: "LEGACY_ENGINE" | "NOT_CERTIFIED_4E" | "DISCOVERY_ONLY" | "NONE" | "CERTIFIED_4E";
  note: string;
}
