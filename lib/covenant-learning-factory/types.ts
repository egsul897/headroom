/**
 * Covenant Learning Factory — shared types.
 *
 * Orchestrates existing Phase 1–4 / knowledge-factory pipelines into a
 * resumable, issuer-agnostic precedent learning loop.
 *
 * Knowledge states are explicit. Automated paths never invent VERIFIED
 * legal authority or production capacity.
 */

export const COVENANT_LEARNING_FACTORY_VERSION = "covenant-learning-factory.v1";

/** Lifecycle for extracted / compiled knowledge artifacts. */
export type LearningKnowledgeState =
  | "PROPOSED"
  | "REVIEW_REQUIRED"
  | "VERIFIED"
  | "REJECTED"
  | "SUPERSEDED";

/** Issuer-disjoint cohort assignment. */
export type LearningCohort = "TRAIN_DEV" | "HELD_OUT";

export type LearningRunStage =
  | "INGEST"
  | "STRUCTURE"
  | "PACKAGE_GRAPH"
  | "DISCOVERY"
  | "COMPILE"
  | "INDEPENDENT_EVAL"
  | "PERSIST"
  | "IMPROVEMENT_PROPOSAL";

export type LearningRunStatus =
  | "PENDING"
  | "RUNNING"
  | "OK"
  | "FAILED"
  | "UNSUPPORTED"
  | "SKIPPED_DUPLICATE"
  | "BUDGET_EXCEEDED"
  | "ABSTAINED";

export type LearningErrorClass =
  | "INGEST_FAILURE"
  | "UNSUPPORTED_DOCUMENT_TYPE"
  | "STRUCTURE_PARSE_FAILURE"
  | "PACKAGE_GRAPH_INCOMPLETE"
  | "OPERATIVE_IDENTITY_UNRESOLVED"
  | "DISCOVERY_GAP"
  | "UNSUPPORTED_SEMANTICS"
  | "COMPILATION_REFUSAL"
  | "FIDELITY_FAILURE"
  | "COVERAGE_GAP"
  | "DANGEROUS_OMISSION"
  | "CALCULATION_MISMATCH"
  | "HELD_OUT_CONTAMINATION"
  | "BUDGET"
  | "UNKNOWN";

export interface LearningPackageDocumentRef {
  documentId: string;
  label: string;
  /** Relative path from repo root to extracted text or raw HTML. */
  localPath: string;
  contentType: "text/plain" | "text/html";
  sourceUrl?: string;
  accessionNumber?: string;
  originalBytesHash?: string;
  role?: string;
}

export interface LearningPackageSpec {
  packageKey: string;
  companyId: string;
  issuerCik: string;
  issuerTicker?: string;
  issuerName?: string;
  instrumentKey?: string;
  cohort: LearningCohort;
  documents: LearningPackageDocumentRef[];
  provenance: string;
  usageRights: "PUBLIC_SEC_EDGAR" | "FIXTURE_INTERNAL" | "RESEARCH_ACQUISITION";
  /** True when package was selected as a held-out evaluation subject. */
  evaluationOnly: boolean;
}

export interface StageCheckpoint {
  stage: LearningRunStage;
  status: LearningRunStatus;
  startedAt: string;
  finishedAt: string;
  diagnostics: string;
  metrics?: Record<string, number | string | boolean | null>;
}

export interface LearningArtifactRecord {
  artifactId: string;
  packageKey: string;
  kind:
    | "COVENANT_CANDIDATE"
    | "SEMANTIC_IR"
    | "EXECUTABLE_RULE"
    | "CALCULATION"
    | "CROSS_PRECEDENT_LINK"
    | "UNSUPPORTED_STRUCTURE";
  state: LearningKnowledgeState;
  family?: string;
  sourceRefs: string[];
  payload: Record<string, unknown>;
  compilerVersion: string;
  modelOrPromptVersion?: string;
  createdAt: string;
  supersedesArtifactId?: string;
  /** Never set by automated promotion — reviewer attribution only. */
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface LearningErrorRecord {
  errorId: string;
  packageKey: string;
  runId: string;
  class: LearningErrorClass;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  stage: LearningRunStage;
  evidence?: Record<string, unknown>;
  createdAt: string;
  correctiveHistory: { at: string; note: string; actor: string }[];
}

export interface LearningEvaluationRecord {
  evaluationId: string;
  packageKey: string;
  runId: string;
  cohort: LearningCohort;
  sourceFidelityPass: boolean | null;
  coverageScore: number | null;
  calculationCorrectness: boolean | null;
  /**
   * Completeness dangerous-omissions are NOT_MEASURED unless an independently
   * adjudicated completeness oracle exists for the package. Measured zero ≠ unknown.
   */
  dangerousOmissionsStatus: "NOT_MEASURED" | "MEASURED";
  dangerousOmissionCount: number | null;
  abstentionCount: number;
  supportedStructureUnits: number;
  /**
   * Distinct from verifiedExecutableUnits: catalog supportStatus===SUPPORTED_STRUCTURE
   * with no unresolved context. Vertical-slice VE can be >0 while this is 0 (PARTIAL support).
   */
  verifiedExecutableUnits: number;
  unsupportedUnits: number;
  refusedExecutableUnits: number;
  metricDefinitions: {
    supportedStructureUnits: string;
    verifiedExecutableUnits: string;
    dangerousOmissions: string;
  };
  independent: true;
  notes: string[];
  createdAt: string;
}

export interface ImprovementProposal {
  proposalId: string;
  packageKey: string;
  runId: string;
  lever: "RETRIEVAL" | "INTERPRETATION" | "COMPILATION" | "STRUCTURE" | "COVERAGE";
  summary: string;
  bounded: true;
  autoApply: false;
  evidenceRefs: string[];
  createdAt: string;
  state: "PROPOSED" | "REJECTED" | "SUPERSEDED";
}

export interface PackageAuditManifest {
  schemaVersion: "covenant-learning-factory.package-audit.v1";
  packageKey: string;
  companyId: string;
  issuerCik: string;
  issuerTicker?: string;
  cohort: LearningCohort;
  runId: string;
  codeSha: string;
  factoryVersion: string;
  compilerVersion: string;
  startedAt: string;
  finishedAt: string;
  status: LearningRunStatus;
  documentHashes: { documentId: string; path: string; sha256: string; byteSize: number }[];
  stages: StageCheckpoint[];
  compileSummary?: {
    nodeCount: number;
    definitionCount: number;
    passACount: number;
    totalCandidates: number;
    exceptionCatalogCount: number;
    supportedStructureUnits: number;
    verifiedExecutableUnits: number;
    unsupportedUnits: number;
    refusedExecutableUnits: number;
    authorityGate: string;
    paidInferenceUsed: boolean;
  };
  artifacts: LearningArtifactRecord[];
  errors: LearningErrorRecord[];
  evaluation?: LearningEvaluationRecord;
  improvementProposals: ImprovementProposal[];
  costs: { category: string; amount: number; unit: string; estimated: boolean; note?: string }[];
  /** Explicit honesty flags — never claim certification from storage alone. */
  claims: {
    trained: false;
    certified: false;
    generalized: false;
    productionReady: false;
    autoPromotedLegalAuthority: false;
  };
}

export interface BatchCheckpoint {
  schemaVersion: "covenant-learning-factory.batch-checkpoint.v1";
  batchId: string;
  startedAt: string;
  updatedAt: string;
  budget: BatchBudget;
  spent: { packages: number; wallMs: number; estimatedUsd: number };
  completedPackageKeys: string[];
  failedPackageKeys: string[];
  skippedPackageKeys: string[];
  pendingPackageKeys: string[];
}

export interface BatchBudget {
  maxPackages: number;
  maxWallMs: number;
  maxEstimatedUsd: number;
  maxRetriesPerPackage: number;
}

export interface DashboardReport {
  schemaVersion: "covenant-learning-factory.dashboard.v1";
  generatedAt: string;
  factoryVersion: string;
  neonLive: boolean;
  packages: {
    total: number;
    trainDev: number;
    heldOut: number;
    processedOk: number;
    failed: number;
    unsupported: number;
    abstained: number;
  };
  coverage: {
    totalCandidates: number;
    supportedStructureUnits: number;
    verifiedExecutableUnits: number;
    unsupportedUnits: number;
    refusedExecutableUnits: number;
  };
  correctness: {
    sourceFidelityPass: number;
    sourceFidelityFail: number;
    sourceFidelityUnknown: number;
    /** Aggregated only over packages with MEASURED status; else NOT_MEASURED. */
    dangerousOmissions: number | "NOT_MEASURED";
    dangerousOmissionsStatus: "NOT_MEASURED" | "MEASURED";
    abstentions: number;
  };
  metricDefinitions: {
    supportedStructureUnits: string;
    verifiedExecutableUnits: string;
    dangerousOmissions: string;
  };
  costs: { estimatedUsd: number; wallMs: number };
  errorLedger: { class: LearningErrorClass; count: number }[];
  recentPackages: {
    packageKey: string;
    cohort: LearningCohort;
    status: LearningRunStatus;
    verifiedExecutableUnits: number;
    supportedStructureUnits: number;
    unsupportedUnits: number;
    dangerousOmissions: number | "NOT_MEASURED";
  }[];
  honesty: PackageAuditManifest["claims"];
}
