/**
 * Utilization knowledge for remaining-capacity claims.
 *
 * Missing historical usage is NEVER defaulted to zero. An empty ledger table
 * is UNKNOWN, not VERIFIED_ZERO.
 *
 * Approved individual ledger records establish known attributed usage only.
 * They do NOT establish completeness of historical usage. Remaining capacity
 * (gross − usage) requires a validated UtilizationCompletenessCertificate
 * that is independently defensible — not merely a review of recorded rows.
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
 * How completeness is proven.
 * REVIEWED_RECORDED_TRANSACTIONS_ONLY is explicitly insufficient for remaining claims.
 */
export type CompletenessMethod =
  | "EXHAUSTIVE_ATTRIBUTED_LEDGER_ENUMERATION"
  | "AFFIRMATIVE_EMPTY_PATH_ATTESTATION"
  | "REVIEWED_RECORDED_TRANSACTIONS_ONLY";

export type OpeningBalancePolicy =
  | "INCLUDED_IN_ATTRIBUTED_SET"
  | "EXPLICITLY_ATTESTED_ZERO"
  | "UNKNOWN";

export type ReclassificationPolicy =
  | "PAIR_CONSERVED_IN_ATTRIBUTED_SET"
  | "NONE_IN_COVERAGE_PERIOD"
  | "UNKNOWN";

export type SupersessionPolicy =
  | "SUCCESSORS_RESOLVED_IN_SET"
  | "NONE_IN_COVERAGE_PERIOD"
  | "UNKNOWN";

/** Identity + coverage the certificate must name. */
export interface CompletenessEvidenceScope {
  companyId: string;
  operativeAgreementId: string;
  /** Permission / provision / basket id — must match capacityRuleId under evaluation. */
  provisionOrBasketId: string;
  entityScopeKeys: string[];
  currency: string;
  effectiveAsOf: string;
  /** Inclusive historical coverage window the completeness attestation covers. */
  coveragePeriodStart: string;
  coveragePeriodEnd: string;
}

/**
 * Fingerprints that bind the certificate to a specific operative world.
 * Any mismatch with current context invalidates the certificate (staleness).
 */
export interface CompletenessBindingFingerprints {
  governingDocumentContentVersion: string;
  ledgerEpochId: string;
  financialSnapshotId: string;
  financialStateAsOf: string;
  operativeAmendmentSetId: string;
  sharedCapacityIdsInScope: string[];
}

/**
 * Affirmative ledger-completeness certificate for one capacity path.
 * Required for any remaining-capacity claim (including verified zero).
 *
 * Does not create new legal authority: it records an attestation by an
 * allowed issuer role with evidence scope and binding fingerprints that
 * must match the evaluation context.
 */
export interface UtilizationCompletenessCertificate {
  certificateId: string;
  kind: "VERIFIED_EMPTY" | "VERIFIED_COMPLETE";
  approvalState: "APPROVED";
  authenticity: "AUTHENTIC" | "SYNTHETIC_LABELED";
  issuer: {
    role: CompletenessIssuerRole;
    actorId: string;
    attestedAt: string;
  };
  scope: CompletenessEvidenceScope;
  bindings: CompletenessBindingFingerprints;
  completenessMethod: CompletenessMethod;
  openingBalancePolicy: OpeningBalancePolicy;
  reclassificationPolicy: ReclassificationPolicy;
  supersessionPolicy: SupersessionPolicy;
  /**
   * Required true when bindings.sharedCapacityIdsInScope is non-empty —
   * shared-pool draws cannot silently escape the completeness set.
   */
  sharedCapacityCompletenessAttested: boolean;
  sourceLabel: string;
}

export type UtilizationExecutionMode = "PRODUCTION" | "DEMO_SYNTHETIC";

export interface UtilizationResolution {
  knowledge: UtilizationKnowledgeKind;
  /**
   * Sum of approved attributed records when that sum is well-defined.
   * May be known even when remaining is not supported (no valid completeness certificate).
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
   * True only when a validated completeness certificate supports subtracting
   * from gross. Approved individual records alone never set this true.
   * Synthetic certificates never set this true under PRODUCTION execution.
   */
  supportsRemainingClaim: boolean;
  completenessCertified: boolean;
  /** True only when the certificate is AUTHENTIC and validated for production authority. */
  productionAuthoritative: boolean;
  certificateValidationBlockers: string[];
}
