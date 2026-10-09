/**
 * Mass precedent acquisition — batch plans and pipeline run records.
 * DISCOVERED ≠ VERIFIED. SOURCE_BACKED ≠ LEGALLY_EXECUTABLE.
 */

export const MASS_PRECEDENT_PLAN_SCHEMA = "knowledge-factory.mass-precedent-plan.v1" as const;
export const MASS_PRECEDENT_INVENTORY_SCHEMA = "knowledge-factory.mass-precedent-inventory.v1" as const;

export type AcquisitionChannel =
  | "COMMITTED_BYTES"
  | "MANIFEST_URL_ONLY"
  | "NETWORK_EDGAR"
  | "UNAVAILABLE";

export type EvidenceStatus =
  | "BYTES_ON_DISK"
  | "BYTES_IN_NEON"
  | "HASH_AND_URL_ONLY"
  | "MISSING";

export type AnalysisStage =
  | "STRUCTURAL_INDEX"
  | "DEFINITIONS"
  | "COVENANT_DISCOVERY"
  | "BASKET_FORMULA"
  | "DEPENDENCY_MAP"
  | "AMENDMENT_RELATION"
  | "COVENANT_IR"
  | "CONSUMER_EXPORT";

export interface CorpusInventoryItem {
  sourceId: string;
  channel: AcquisitionChannel;
  evidenceStatus: EvidenceStatus;
  originalBytesHash?: string;
  byteSize?: number;
  localPath?: string;
  archivesUrl?: string;
  issuerCik?: string;
  documentClass?: string;
  formType?: string;
  corpusRole?: string;
  priorityScore: number;
}

export interface BatchPlanItem {
  sourceId: string;
  action:
    | "PERSIST_COMMITTED_BYTES"
    | "FETCH_THEN_PERSIST"
    | "ANALYZE_ONLY"
    | "SKIP_NO_BYTES"
    | "SKIP_FALSE_POSITIVE"
    | "SKIP_ALREADY_PERSISTED";
  reason: string;
  byteSize?: number;
  originalBytesHash?: string;
  archivesUrl?: string;
}

export interface MassPrecedentBatchPlan {
  schemaVersion: typeof MASS_PRECEDENT_PLAN_SCHEMA;
  generatedAt: string;
  batchSize: number;
  milestone: "batch-100" | "batch-500" | "batch-1000" | "custom";
  liveWriteAuthorized: false;
  neon: {
    migrationsApplied: number;
    documentByteObjectsTablePresent: boolean;
    knowledgeSources: number;
    companies: number;
    financialSnapshots: number;
  };
  inventorySummary: {
    committedBytesAvailable: number;
    committedBytesTotal: number;
    manifestUrlOnly: number;
    financingLocators: number;
    distinctIssuersInManifest: number;
  };
  proposed: {
    persistCommittedBytes: number;
    fetchThenPersist: number;
    analyzeOnly: number;
    skipNoBytes: number;
    skipFalsePositive: number;
    skipAlreadyPersisted: number;
  };
  estimatedStorageBytes: number;
  estimatedSecRequests: number;
  rateLimitNotes: string[];
  items: BatchPlanItem[];
  analysisStages: AnalysisStage[];
  approvalCheckpoint: string;
  blockers: string[];
}

export interface AnalysisRunRecord {
  sourceId: string;
  stage: AnalysisStage;
  status: "OK" | "FAILED" | "SKIPPED" | "UNSUPPORTED";
  codeSha: string;
  inputHash?: string;
  startedAt: string;
  finishedAt: string;
  diagnostics?: string;
  representationLevel?: string;
  promotedToLegalTruth: 0;
}
