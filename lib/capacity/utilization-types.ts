/**
 * Utilization knowledge for remaining-capacity claims.
 *
 * Missing historical usage is NEVER defaulted to zero. An empty ledger table
 * is UNKNOWN, not VERIFIED_ZERO. VERIFIED_ZERO requires affirmative evidence
 * (approved empty attribution for the capacity path, or an explicit certificate
 * stating no usage).
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

export interface UtilizationResolution {
  knowledge: UtilizationKnowledgeKind;
  /** Sum applicable only when knowledge supports a numerical claim. */
  attributedAmount: number | null;
  currency: string | null;
  asOf: string;
  capacityRuleId: string;
  recordsConsidered: UtilizationEvidenceRecord[];
  recordsApplied: UtilizationEvidenceRecord[];
  recordsExcluded: UtilizationEvidenceRecord[];
  blockers: string[];
  note: string;
  /** True only for KNOWN_ATTRIBUTED or VERIFIED_ZERO — safe to subtract from gross. */
  supportsRemainingClaim: boolean;
}
