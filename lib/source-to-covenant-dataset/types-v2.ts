/**
 * Phase 2 schema extensions — ground-truth integrity.
 * Verification status remains distinct from training / evaluation eligibility.
 */
import type {
  LabelVerificationStatus,
  SourceToCovenantRecord,
  SplitBucket,
  UncertaintyLevel,
} from "./types";

export const DATASET_SCHEMA_VERSION_V2 = "source-to-covenant-dataset.v2" as const;
export const DATASET_BUILDER_VERSION_V2 = "source-to-covenant-builder.v2" as const;

/** Delivery-contract aligned verification enum (WS-PAR 06-dataset-delivery-contract). */
export type DeliveryVerificationStatus =
  | "SOURCE_ONLY"
  | "HYPOTHESIS"
  | "REVIEW_REQUIRED"
  | "VERIFIED"
  | "REJECTED";

export type ControllingContextStatus =
  | "SOURCE_WINDOW_PRESENT"
  | "CONTROLLING_CONTEXT_COMPLETE"
  | "CONTEXT_INCOMPLETE";

export type DependencyKind =
  | "GOVERNING_PROHIBITION"
  | "EXCEPTION_OR_PROVISO"
  | "DEFINED_TERM"
  | "REMOTE_CONDITION"
  | "ENTITY_RESTRICTION"
  | "SHARED_BASKET"
  | "RECLASSIFICATION_RULE"
  | "AMENDMENT_MODIFICATION"
  | "CROSS_DOCUMENT_CONSTRAINT"
  | "FINANCIAL_INPUT";

export interface DependencyReference {
  kind: DependencyKind;
  ref: string;
  presentInRecord: boolean;
  availableInFixtureCorpus: boolean | null;
  notes: string;
}

export interface ControllingContextAudit {
  sourceWindowPresent: true;
  status: ControllingContextStatus;
  dependencyReferences: DependencyReference[];
  missingRequiredDependencies: string[];
  auditNotes: string;
  auditedAt: string;
  /** Completeness is never certified merely because a window extracted. */
  completenessNotInferredFromExtractionAlone: true;
}

export interface VerificationEvidence {
  /** Null when no independent reviewer exists — never invent. */
  reviewerId: string | null;
  reviewerDisplayName: string | null;
  reviewDate: string | null;
  sourcePackage: string;
  operativeVersion: string;
  exactScopeOfReview: string | null;
  evidenceSupportingInterpretation: string[];
  reviewerIndependentOfLabelGeneration: boolean | null;
  verificationRecordId: string | null;
  /** Why independent VERIFIED status is or is not warranted. */
  independenceGap: string | null;
}

export interface VerificationHistoryEntry {
  at: string;
  fromStatus: LabelVerificationStatus | string;
  toStatus: LabelVerificationStatus | string;
  reason: string;
  actor: "PHASE2_INTEGRITY_AUDIT" | "HUMAN_REVIEWER" | "SYSTEM";
}

export type TrainingEligibility =
  | "ELIGIBLE_PENDING_RIGHTS_AND_VERIFICATION"
  | "BLOCKED_UNVERIFIED_LABEL"
  | "BLOCKED_HYPOTHESIS_OR_UNRESOLVED"
  | "BLOCKED_DUPLICATE_OBSERVATION"
  | "BLOCKED_HELDOUT_ISSUER"
  | "BLOCKED_USAGE_RIGHTS"
  | "BLOCKED_CONTEXT_INCOMPLETE"
  | "NOT_FOR_SFT";

export type EvaluationEligibility =
  | "EVAL_ELIGIBLE_HELD_OUT"
  | "EVAL_ELIGIBLE_BENCHMARK_CASE"
  | "EVAL_ELIGIBLE_DEV_DIAGNOSTIC"
  | "EVAL_INELIGIBLE_DUPLICATE_PROBE"
  | "EVAL_INELIGIBLE_INCOMPLETE";

export interface DuplicateDecision {
  exampleId: string;
  pairedExampleIds: string[];
  classification:
    | "LEGITIMATE_SHARED_CONTEXT"
    | "DUPLICATE_TRAINING_OBSERVATION"
    | "INTENTIONAL_DEDUP_PROBE"
    | "AMENDMENT_LINEAGE_OVERLAP"
    | "REPEATED_LEGAL_MECHANIC"
    | "NEAR_DUPLICATE_QUARANTINED";
  keepInCorpus: boolean;
  trainingEligible: boolean;
  rationale: string;
}

export interface Phase2RecordExtensions {
  schemaVersion: typeof DATASET_SCHEMA_VERSION_V2;
  deliveryVerificationStatus: DeliveryVerificationStatus;
  verificationEvidence: VerificationEvidence;
  verificationHistory: VerificationHistoryEntry[];
  controllingContextAudit: ControllingContextAudit;
  trainingEligibility: TrainingEligibility;
  evaluationEligibility: EvaluationEligibility;
  duplicateDecision: DuplicateDecision | null;
  /** Author-proposed expectations for eval cases — not independently reviewed GT. */
  datasetAuthorExpectation: string | null;
  independentlyReviewedGroundTruth: null | {
    verificationRecordId: string;
    summary: string;
  };
  knowledgeFactoryImport: {
    contractVersion: "corpus-dataset-delivery-contract.v1";
    contentIdentity: string;
    importable: boolean;
    blockedReasons: string[];
  };
}

export type SourceToCovenantRecordV2 = SourceToCovenantRecord & Phase2RecordExtensions;

export interface Phase2IntegrityReport {
  schemaVersion: typeof DATASET_SCHEMA_VERSION_V2;
  startingSha: string;
  auditedAt: string;
  verificationClaims: {
    previouslyClaimedHumanSourceVerified: number;
    independentlyVerifiedAfterAudit: number;
    lackingIndependentReview: number;
    demotedExampleIds: string[];
  };
  controllingContext: {
    sourceWindowPresent: number;
    controllingContextComplete: number;
    contextIncomplete: number;
  };
  duplicates: {
    exactDuplicatePairs: number;
    nearDuplicateClusters: number;
    quarantinedRecordCount: number;
    /** Records not in an exact-dup pair or near-dup cluster — do not treat quarantined dups as independent examples. */
    independentObservationCount: number;
    decisions: DuplicateDecision[];
  };
  eligibility: {
    trainingEligibleCount: number;
    evaluationEligibleCount: number;
    sftExportBlocked: true;
    sftExportRecordCount: number;
  };
  expansion: {
    priorRecordCount: number;
    authenticExamplesAdded: number;
    totalRecords: number;
    distinctIssuers: number;
    issuerTarget: number;
    issuerTargetMet: boolean;
    issuerGapReason: string;
  };
  evaluationBenchmark: {
    caseCount: number;
    compilerOrModelExecuted: false;
    performanceMetricsReported: false;
    reason: string;
  };
  importResults: {
    adapter: string;
    recordsPrepared: number;
    recordsAcceptedForImport: number;
    blocked: number;
  };
}
