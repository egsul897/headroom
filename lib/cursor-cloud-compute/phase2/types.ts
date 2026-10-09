/**
 * Phase 2 — real EDGAR scale test types.
 * Soft gate. IMPLEMENTED ≠ CERTIFIED. PINNED_OFFLINE ≠ CERTIFIED.
 *
 * Consumes WS-EHB source manifests / acquisition queues and WS-CKF SEC transport.
 * Does not invent a second source registry or competing downloader.
 */

export const PHASE2_STATUS = "COMPUTE_ASSESSMENT_PHASE2_NOT_CERTIFIED" as const;

export type DocumentKind =
  | "CREDIT_AGREEMENT"
  | "INDENTURE"
  | "AMENDMENT"
  | "RESTATEMENT"
  | "SUPPLEMENTAL_INDENTURE"
  | "WAIVER"
  | "CONSENT"
  | "INTERCREDITOR"
  | "GUARANTEE"
  | "SECURITY_AGREEMENT"
  | "OTHER_DEBT_AGREEMENT"
  | "UNKNOWN";

export type StageName =
  | "download"
  | "parse"
  | "dedupe"
  | "structure"
  | "definitions"
  | "references"
  | "passA"
  | "storage";

export type StageStatus = "PENDING" | "DONE" | "FAILED" | "SKIPPED_DUPLICATE" | "INVALIDATED";

export interface SourceDocumentRef {
  /** EHB queueId or synthesized stable id. */
  sourceDocumentId: string;
  queueId?: string;
  cik: string;
  ticker?: string;
  issuerName?: string;
  accessionNumber: string;
  filingDate: string;
  form: string;
  exhibitType: string;
  filename: string;
  description: string;
  documentKind: DocumentKind;
  sourceUri: string;
  agreementIdentityKey: string;
  relevanceScore: number;
  ehbRunDir: string;
}

export interface StageTimingMs {
  downloadMs: number;
  parseMs: number;
  dedupeMs: number;
  structureMs: number;
  definitionsMs: number;
  referencesMs: number;
  passAMs: number;
  storageMs: number;
  totalProcessingMs: number; // excludes discovery; download counted separately when labeled
}

export interface DocumentProcessResult {
  sourceDocumentId: string;
  status: "OK" | "FAILED" | "SKIPPED_DUPLICATE" | "UNSUPPORTED" | "OVERSIZED";
  error: string | null;
  errorClass:
    | null
    | "PARSE_FAILURE"
    | "DOWNLOAD_FAILURE"
    | "UNSUPPORTED_FORMAT"
    | "OVERSIZED"
    | "STRUCTURE_EMPTY"
    | "STRUCTURE_BROKEN_HIERARCHY"
    | "MISSING_DEFINITIONS"
    | "CROSS_REF_FAILURE"
    | "DUPLICATE_IDENTITY"
    | "OTHER";
  contentHash: string | null;
  byteLength: number;
  charCount: number;
  contentType: string | null;
  fromCache: boolean;
  wasDuplicate: boolean;
  duplicateOf: string | null;
  chunkCount: number;
  nodeCount: number;
  definitionCount: number;
  referenceCount: number;
  resolvedReferenceCount: number;
  passACandidateCount: number;
  hierarchyDepthMax: number;
  timingsMs: StageTimingMs;
  peakRssBytes: number;
  stages: Record<StageName, StageStatus>;
  artifactPath: string | null;
}

export interface QueueItemState {
  source: SourceDocumentRef;
  stages: Record<StageName, StageStatus>;
  contentHash: string | null;
  lastError: string | null;
  result: DocumentProcessResult | null;
  updatedAt: string;
}

export interface ProcessingQueueState {
  version: 1;
  status: typeof PHASE2_STATUS;
  jobId: string;
  createdAt: string;
  updatedAt: string;
  ehbRunDir: string;
  corpusRoot: string; // VM-local working store — NOT claimed as durable infra
  durableNote: string;
  items: QueueItemState[];
  discoveryMs: number;
  secRequestCount: number;
}

export interface ThroughputBucket {
  label: string;
  documentCount: number;
  processingOnlyMs: number;
  docsPerSecondProcessingOnly: number;
  meanBytes: number;
}

export interface Phase2BenchmarkMetrics {
  mode: "cold" | "warm";
  documentCountTarget: number;
  uniqueDocumentsProcessed: number;
  uniqueIssuers: number;
  uniqueInstruments: number;
  uniqueAgreementKeys: number;
  uniqueAccessions: number;
  documentKindCounts: Record<string, number>;
  filingDateMin: string | null;
  filingDateMax: string | null;
  discoveryMs: number;
  downloadMs: number;
  parseMs: number;
  structureMs: number;
  definitionsMs: number;
  referencesMs: number;
  passAMs: number;
  dedupeMs: number;
  storageMs: number;
  /** End-to-end wall including download; not labeled processing-only. */
  endToEndWallMs: number;
  /** Sum of per-doc processing stages excluding download. */
  processingOnlyMs: number;
  processingOnlyDocsPerSecond: number;
  endToEndDocsPerSecond: number;
  peakRssBytes: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  cpuUtilizationApprox: number;
  storageBytes: number;
  secRequestCount: number;
  cacheHitCount: number;
  cacheMissCount: number;
  okCount: number;
  failureCount: number;
  duplicateCount: number;
  unsupportedCount: number;
  oversizedCount: number;
  failureRate: number;
  errorClassCounts: Record<string, number>;
  throughputByKind: ThroughputBucket[];
  throughputBySize: ThroughputBucket[];
  retryCount: number;
}

export interface Phase2Report {
  status: typeof PHASE2_STATUS;
  generatedAt: string;
  jobId: string;
  northStarPreserved: true;
  certificationClaimed: false;
  coordination: {
    workstreamId: "WS-CCA";
    consumedContracts: string[];
    ehbRunDir: string;
    ckfRoot: string | null;
    ownershipExclusive: string[];
  };
  cold: Phase2BenchmarkMetrics;
  warm: Phase2BenchmarkMetrics;
  resumeProof: {
    proved: boolean;
    notes: string[];
    duplicateRecordsOnRestart: number;
    completedWorkPreserved: number;
    contentChangeInvalidations: number;
    reprocessedStagesOnly: boolean;
  };
  quality: {
    parseFailures: number;
    brokenHierarchies: number;
    missingDefinitions: number;
    crossReferenceIssues: number;
    duplicateIdentities: number;
    unsupportedFormats: number;
    oversizedDocuments: number;
    exampleFailures: Array<{ sourceDocumentId: string; errorClass: string; error: string; sourceUri: string }>;
  };
  cost: {
    externalPaidUsd: number;
    anthropicCalls: number;
    gpuProvisioned: boolean;
  };
  cursorUsage: {
    observable: boolean;
    notes: string[];
    agentWallMinutesColdWarm: number;
  };
  durability: {
    corpusRootIsVmLocal: boolean;
    portableManifestPath: string;
    claimedPersistentInfrastructure: boolean;
  };
  blocker: string | null;
}
