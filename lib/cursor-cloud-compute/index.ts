/**
 * Cursor Cloud compute assessment — public entry points.
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED.
 */
export { buildDeterministicCorpus, DEFAULT_CORPUS_SIZE, listSeedSpecs, materializeVariant } from "./corpus";
export { persistAssessmentReport } from "./durable-store";
export {
  getDefaultGpuWorkerClient,
  UnprovisionedGpuWorkerClient,
  RunPodGpuWorkerClient,
  ModalGpuWorkerClient,
  GPU_REQUIRED_WORKLOADS,
  CPU_PRACTICAL_WORKLOADS,
} from "./gpu-worker";
export type { GpuWorkerClient } from "./gpu-worker";
export { runDeterministicIngestCompileJob, processDocumentDeterministic, summarizeBenchmark } from "./ingest-compile-job";
export { inspectEnvironment } from "./inspect-environment";
export { runLocalModelProbe } from "./local-model-probe";
export { runComputeAssessment } from "./run-assessment";
export { COMPUTE_ASSESSMENT_STATUS } from "./types";
export { loadEhbSourceDocuments } from "./phase2/ehb-manifest-loader";
export { createProcessingQueue, loadProcessingQueue, nextPendingItem } from "./phase2/processing-queue";
export { runPhase2ScaleBenchmark, proveResumeInvariants, writePortablePhase2Artifacts } from "./phase2/run-scale-benchmark";
export { PHASE2_STATUS } from "./phase2/types";
export {
  buildHandoffRecord,
  persistHandoffPackage,
  proveArtifactReconstruction,
  HANDOFF_CONTRACT_VERSION,
  PROCESSING_VERSION,
} from "./phase3/handoff-contract";
export { evaluateFleetSecGate, resolveAuthorizedUserAgent } from "./phase3/fleet-sec";
export { runIndependentQualitySample } from "./phase3/quality-sample";
export type {
  ComputeAssessmentReport,
  VmResourceSnapshot,
  BenchmarkMetrics,
  CorpusDocument,
  DocumentJobResult,
  LocalModelProbeResult,
  GpuWorkerCapability,
  GpuInferenceJob,
  GpuInferenceResult,
  CostReport,
  DurableStoreWriteResult,
} from "./types";
