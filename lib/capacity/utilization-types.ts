/**
 * Utilization knowledge for remaining-capacity claims.
 *
 * Missing historical usage is NEVER defaulted to zero. An empty ledger table
 * is UNKNOWN, not VERIFIED_ZERO.
 *
 * Approved individual ledger records establish known attributed usage only.
 * They do NOT establish completeness of historical usage. Remaining capacity
 * (gross − usage) requires an affirmative completeness certificate in addition
 * to attributed records (or a verified-empty certificate when there is no usage).
 */
export type UtilizationKnowledgeKind =
  | "KNOWN_ATTRIBUTED"
  | "VERIFIED_ZERO"
  | "UNKNOWN"
  | "PARTIALLY_KNOWN"
  | "SUPERSEDED_EXCLUDED"
  | "RECLASSIFIED"
  | "SHARED_POOL"
  | "UNATTRIBUTED_LEGACY_BASKET";

export type UtilizationRecordKind =
  | "ATTRIBUTED_RULE"
  | "ATTRIBUTED_SHARED_POOL"
  | "LEGACY_BASKET_FAMILY"
  | "RECLASSIFICATION_SOURCE"
  | "RECLASSIFICATION_DESTINATION"
  | "SUPERSEDED";

export interface UtilizationEvidenceRecord {
  usageId: string;
  kind: UtilizationRecordKind;
  amount: number;
  currency: string;
  effectiveAsOf: string;
  /** Permission / provision / rule id when attributed; null when only a legacy basket family is known. */
  capacityRuleId: string | null;
  sharedCapacityId: string | null;
  legacyBasketFamily: string | null;
  entityKey: string | null;
  status: "RECORDED" | "ACTIVE" | "SUPERSEDED" | "REVERSED" | "RECLASSIFICATION_ELECTION";
  approvalState: "APPROVED" | "UNAPPROVED" | "UNKNOWN";
  sourceLabel: string;
  /** SYNTHETIC labeled fixtures vs AUTHENTIC historical / approved ledger. */
  authenticity: "AUTHENTIC" | "SYNTHETIC_LABELED";
}

/** Who may issue a completeness certificate. SYSTEM_FIXTURE is never production-authoritative. */
export type CompletenessIssuerRole =
  | "COUNSEL_REVIEWER"
  | "LEDGER_CUSTODIAN"
  | "SYSTEM_FIXTURE";

/**
 * Affirmative ledger-completeness certificate for one capacity path.
 * Required for any remaining-capacity claim (including verified zero).
 *
 * Solver production-authoritative remaining additionally requires:
 * - authenticity: "AUTHENTIC" (missing authenticity refuses production authority)
 * - issuer verified via TrustedIssuerAuthorizationContext (role string alone is insufficient)
 * See `lib/capacity/utilization-authority.ts` and `completeness-issuer-auth.ts`.
 * Production identity-provider → TrustedIssuerAuthorizationContext wiring remains an
 * activation requirement until real attestations are enabled.
 */
export interface UtilizationCompletenessCertificate {
  capacityRuleId: string;
  asOf: string;
  approvalState: "APPROVED";
  sourceLabel: string;
  /**
   * VERIFIED_EMPTY — path has no active usage (and ledger is complete).
   * VERIFIED_COMPLETE — attributed records on the path are the full usage set.
   */
  kind: "VERIFIED_EMPTY" | "VERIFIED_COMPLETE";
  /** Required for production-authoritative remaining; omit/missing refuses that path. */
  authenticity?: "AUTHENTIC" | "SYNTHETIC_LABELED";
  /**
   * Claimed issuer on the certificate blob. Never trusted alone —
   * must be authorized via TrustedIssuerAuthorizationContext for production remaining.
   */
  issuer?: {
    role: CompletenessIssuerRole;
    actorId: string;
    attestedAt?: string;
  };
}

export interface UtilizationResolution {
  knowledge: UtilizationKnowledgeKind;
  /**
   * Sum of approved attributed records when that sum is well-defined.
   * May be known even when remaining is not supported (no completeness certificate).
   */
  attributedAmount: number | null;
  currency: string | null;
  asOf: string;
  capacityRuleId: string;
  recordsConsidered: UtilizationEvidenceRecord[];
  recordsApplied: UtilizationEvidenceRecord[];
  recordsExcluded: UtilizationEvidenceRecord[];
  blockers: string[];
  note: string;
  /**
   * True only when utilization knowledge supports subtracting from gross:
   * VERIFIED_ZERO, or attributed knowledge plus VERIFIED_COMPLETE certificate.
   * Approved individual records alone never set this true.
   */
  supportsRemainingClaim: boolean;
  completenessCertified: boolean;
}
