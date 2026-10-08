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
