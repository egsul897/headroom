/**
 * Cursor Cloud compute assessment types.
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. PINNED_OFFLINE ≠ CERTIFIED.
 * This module measures whether deterministic SEC EDGAR ingestion + structural
 * compilation can run efficiently inside Cursor Cloud Agents. It does not
 * mint discoveryIds, approve financial snapshots, or claim certification.
 */

export const COMPUTE_ASSESSMENT_STATUS = "COMPUTE_ASSESSMENT_NOT_CERTIFIED" as const;

export interface VmResourceSnapshot {
  capturedAt: string;
  hostname: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  pythonVersion: string | null;
  cpu: {
    logicalCpus: number;
    model: string | null;
    mhz: number | null;
    flagsSample: string[];
  };
  memory: {
    totalBytes: number;
    freeBytes: number;
    availableBytes: number;
    usedBytes: number;
    swapTotalBytes: number;
  };
  disk: {
    rootTotalBytes: number;
    rootUsedBytes: number;
    rootAvailableBytes: number;
    workspaceUsedBytes: number;
  };
  gpu: {
    present: boolean;
    devices: string[];
    nvidiaSmiAvailable: boolean;
  };
  network: {
    egressRestricted: boolean | null;
    secGovReachable: boolean;
    dataSecGovStatus: number | null;
    npmRegistryReachable: boolean;
  };
  persistence: {
    workspaceWritable: boolean;
    artifactsDirWritable: boolean;
    agentStoreMounted: boolean;
    localBlobFallbackAvailable: boolean;
    postgresConfigured: boolean;
    vercelBlobConfigured: boolean;
  };
  limits: {
    openFiles: number | null;
    maxUserProcesses: number | null;
    cpuTimeSeconds: number | null;
    virtualMemoryBytes: number | null;
    noHardCpuTimeLimitObserved: boolean;
  };
  runtimeNotes: string[];
}

export interface CorpusDocument {
  documentId: string;
  label: string;
  sourceSeed: string;
  contentType: "text/plain" | "text/html";
  bytes: Buffer;
  /** True when this document is an intentional byte-identical duplicate of an earlier corpus member. */
  intentionalDuplicateOf: string | null;
  charCount: number;
}

export interface DocumentStageTimingsMs {
  parseMs: number;
  chunkMs: number;
  hashDedupMs: number;
  structureMs: number;
  definitionsMs: number;
  referencesMs: number;
  indexMs: number;
  passAMs: number;
  totalMs: number;
}

export interface DocumentJobResult {
  documentId: string;
  label: string;
  sourceSeed: string;
  contentType: string;
  charCount: number;
  byteLength: number;
  contentHash: string;
  wasDuplicate: boolean;
  intentionalDuplicateOf: string | null;
  status: "OK" | "FAILED";
  error: string | null;
  chunkCount: number;
  nodeCount: number;
  definitionCount: number;
  referenceCount: number;
  passACandidateCount: number;
  timingsMs: DocumentStageTimingsMs;
  peakRssBytes: number;
}

export interface BenchmarkMetrics {
  documentCountRequested: number;
  documentCountProcessed: number;
  uniqueDocuments: number;
  duplicateDocuments: number;
  okCount: number;
  failureCount: number;
  failureRate: number;
  wallClockMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  cpuTotalMs: number;
  peakRssBytes: number;
  totalChars: number;
  totalBytes: number;
  totalNodes: number;
  totalPassACandidates: number;
  docsPerSecond: number;
  charsPerSecond: number;
  meanDocMs: number;
  p50DocMs: number;
  p95DocMs: number;
  p99DocMs: number;
  stageTotalsMs: Omit<DocumentStageTimingsMs, "totalMs"> & { totalMs: number };
}

export interface CostReport {
  /** External paid API / GPU spend initiated by this job. Always $0 under current policy. */
  externalPaidUsd: number;
  anthropicCalls: number;
  gpuProvisioned: boolean;
  gpuInferences: number;
  /** Wall minutes of Cursor Cloud agent compute consumed by the measured job. */
  cursorAgentWallMinutes: number;
  notes: string[];
}

export interface LocalModelProbeResult {
  status: "CPU_PROBE_ONLY" | "FAILED";
  gpuAvailable: boolean;
  numpyAvailable: boolean;
  probes: Array<{
    name: string;
    description: string;
    wallMs: number;
    estimatedTokensPerSecond: number | null;
    peakRssBytes: number;
    practicalOnThisVm: boolean;
    notes: string;
  }>;
  gpuRequiredWorkloads: string[];
  cpuPracticalWorkloads: string[];
}

export interface GpuWorkerCapability {
  provider: "unprovisioned" | "runpod" | "modal" | "custom";
  available: boolean;
  reason: string;
}

export interface GpuInferenceJob {
  jobId: string;
  modelHint: string;
  promptChars: number;
  maxOutputTokens: number;
  /** Opaque payload — never sent when the worker is unprovisioned. */
  payload?: unknown;
}

export interface GpuInferenceResult {
  status: "UNAVAILABLE" | "SUBMITTED" | "COMPLETED" | "FAILED";
  jobId: string;
  provider: string;
  reason: string;
  latencyMs: number | null;
  outputChars: number | null;
}

export interface DurableStoreWriteResult {
  backend: string;
  uri: string;
  bytesWritten: number;
  durableOutsideAgentVm: boolean;
}

export interface ComputeAssessmentReport {
  status: typeof COMPUTE_ASSESSMENT_STATUS;
  generatedAt: string;
  runId: string;
  northStarPreserved: true;
  certificationClaimed: false;
  environment: VmResourceSnapshot;
  benchmark: BenchmarkMetrics;
  documents: DocumentJobResult[];
  localModelProbe: LocalModelProbeResult;
  gpuWorker: GpuWorkerCapability;
  cost: CostReport;
  durableWrites: DurableStoreWriteResult[];
  fitnessVerdict: {
    edgarIngestAndStructuralCompileFitCursorCloud: boolean;
    rationale: string[];
    workloadsRequiringDedicatedGpu: string[];
    recommendedNextStep: string;
  };
}
