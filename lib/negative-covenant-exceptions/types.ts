/**
 * Negative Covenant Exception Database — corpus types (WS-NED).
 *
 * RESEARCH / CORPUS ONLY. Not operative legal authority.
 * Do not import from lib/contract-model/** production paths.
 * Labels are never automatic production capacity approvals.
 */

export const NCEDB_DATASET_VERSION = "ncedb.phase2.v1";

export const PERMISSION_CLASSIFICATIONS = [
  "CONDITIONAL",
  "UNCONDITIONAL_SOURCE_VERIFIED",
  "UNKNOWN",
  "NOT_AN_AFFIRMATIVE_PERMISSION",
] as const;

export type PermissionClassification = (typeof PERMISSION_CLASSIFICATIONS)[number];

export const COVENANT_FAMILIES = [
  "DEBT_INCURRENCE",
  "LIENS",
  "RESTRICTED_PAYMENTS",
  "INVESTMENTS",
  "ASSET_SALES",
  "AFFILIATE_TRANSACTIONS",
  "FUNDAMENTAL_CHANGES",
  "JUNIOR_DEBT_PREPAYMENTS",
  "SUBSIDIARY_RESTRICTIONS",
  "NEGATIVE_PLEDGE",
  "OTHER_NEGATIVE_COVENANT",
  "NOT_AN_EXCEPTION",
] as const;

export type CovenantFamily = (typeof COVENANT_FAMILIES)[number];

export const CONDITION_LOCATIONS = [
  "IN_EXCEPTION_CLAUSE",
  "PARENT_CHAPEAU",
  "ARTICLE_LEVEL",
  "SECTION_WIDE_PROVISO",
  "HANGING_TRAILING_PROVISO",
  "CROSS_REFERENCED_SECTION",
  "DEFINED_TERM",
  "AMENDMENT",
  "EXTERNAL_DOCUMENT",
] as const;

export type ConditionLocation = (typeof CONDITION_LOCATIONS)[number];

export type VerificationStatus =
  | "SOURCE_ONLY"
  | "HYPOTHESIS"
  | "REVIEW_REQUIRED"
  | "SOURCE_VERIFIED"
  | "SOURCE_VERIFIED_PARTIAL_CONTEXT"
  | "UNVERIFIED"
  | "REJECTED";

export interface SourceSpan {
  sourcePath: string;
  sourceSha256: string;
  charStart: number;
  charEnd: number;
  /** Exact quotation from source; never an ellipsized paraphrase. */
  exactText: string;
  matchStatus: "EXACT" | "NORMALIZED_WHITESPACE" | "UNRESOLVED";
}

export interface ConditionAtom {
  conditionId: string;
  text: string;
  location: ConditionLocation;
  locationRef: string;
  computableHint: string;
  sourceSpan: SourceSpan | null;
}

export interface StableSourceIdentity {
  /** Logical corpus id — content-addressed where possible. */
  sourceIdentityKey: string;
  issuerKey: string;
  issuerName: string;
  issuerTicker?: string;
  issuerCik?: string;
  documentKind:
    | "CREDIT_AGREEMENT"
    | "INDENTURE"
    | "AMENDMENT"
    | "RESTATEMENT"
    | "OTHER";
  sourcePath: string;
  sourceSha256: string;
  filingAccession?: string;
  sourceUrl?: string;
}

export interface ExceptionRecordV2 {
  exceptionId: string;
  datasetVersion: typeof NCEDB_DATASET_VERSION;
  sourceIdentity: StableSourceIdentity;
  covenantFamily: CovenantFamily;

  /** Source-supported classification — NOT a production capacity approval. */
  permissionClassification: PermissionClassification;
  classificationRationale: string;

  parentProhibition: {
    sectionRef: string;
    paraphraseSummary: string;
    sourceSpan: SourceSpan;
  };
  articleOrSectionChapeau: {
    paraphraseSummary: string;
    sourceSpan: SourceSpan | null;
  };

  exceptionSectionRef: string;
  /** Exact quotation only. */
  exactExceptionText: string;
  exceptionSourceSpan: SourceSpan;
  paraphraseSummary: string;

  structuralHierarchy: string[];
  definedTerms: string[];

  localConditions: ConditionAtom[];
  remoteConditions: ConditionAtom[];

  provisoAttachment: Array<{
    text: string;
    attachment: "OWN_CLAUSE" | "TRAILING_LIST_WIDE" | "SECTION_WIDE" | "NOTWITHSTANDING" | "HANGING" | "NONE";
    scopeNote: string;
    sourceSpan: SourceSpan | null;
  }>;

  entityScope: {
    includes: string[];
    excludes: string[];
    notes?: string;
    sourceSpan: SourceSpan | null;
  };

  financialTests: Array<{
    testId: string;
    description: string;
    ratioOrAmount: string;
    sourceSpan: SourceSpan | null;
  }>;

  amountsAndRatios: Array<{ kind: string; value: string; measurementBasis?: string }>;

  sharedCapacityRestrictions: Array<{
    kind: string;
    description: string;
    relatedRefs: string[];
  }>;

  amendmentAuthority: Array<{
    documentRef: string;
    effect: string;
    status: "NONE_NOTED" | "NOTED" | "UNKNOWN" | "EXTERNAL_UNRESOLVED";
  }>;

  unresolvedControllingSources: Array<{
    ref: string;
    reason: string;
  }>;

  crossReferences: Array<{
    targetRef: string;
    role: string;
    existenceCheck: "PRESENT_IN_SOURCE" | "PRESENT_IN_DEFINITIONS_EXCERPT" | "EXTERNAL_OR_UNRESOLVED" | "NOT_CHECKED";
  }>;

  remoteConstraintFlags: Array<{ kind: string; description: string }>;

  verificationStatus: VerificationStatus;
  notes: string;

  /** Phase-1 compatibility — always false; never treat as capacity. */
  unconditionalCapacity: false;
  /** True only for negative-control / non-permission rows. */
  isNegativeControl?: boolean;
  negativeControlClass?:
    | "LOCAL_CONDITIONS"
    | "REMOTE_CONDITIONS"
    | "NO_ADDITIONAL_CONDITIONS"
    | "AMBIGUOUS_CONDITION_SCOPE"
    | "PROHIBITION_NO_EXCEPTION"
    | "NUMERIC_THRESHOLD_NOT_PERMISSION"
    | "CONSTRAINED_BY_OTHER_DOCUMENT";
}

export interface ImportableDatasetManifest {
  datasetId: string;
  datasetVersion: string;
  workstreamId: "WS-NED";
  status: "OFFLINE_RESEARCH_DATASET";
  representationLevelCeiling: "DETERMINISTICALLY_VALIDATED" | "REVIEW_REQUIRED" | "SOURCE_ONLY";
  exactSourceProvenance: boolean;
  stableContentIdentities: boolean;
  sourceTextHashes: boolean;
  compilerOrModelVersions: { ncedb: string; mode: "deterministic-offline" };
  confidenceAndUncertaintyLabels: boolean;
  verificationStatusField: boolean;
  duplicateDetection: { strategy: string };
  deterministicReplay: { regenerator: string };
  actualRecordCounts: Record<string, number>;
  independentQualityMetrics: { path: string; status: string };
  nonGoals: string[];
}
