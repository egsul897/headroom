/**
 * End-to-end Cursor Cloud compute assessment orchestrator.
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED. PINNED_OFFLINE ≠ CERTIFIED.
 */
import { createHash } from "node:crypto";
import { DEFAULT_CORPUS_SIZE } from "./corpus";
import { persistAssessmentReport } from "./durable-store";
import { getDefaultGpuWorkerClient, GPU_REQUIRED_WORKLOADS } from "./gpu-worker";
import { runDeterministicIngestCompileJob } from "./ingest-compile-job";
import { inspectEnvironment } from "./inspect-environment";
import { runLocalModelProbe } from "./local-model-probe";
import { COMPUTE_ASSESSMENT_STATUS, type ComputeAssessmentReport, type CostReport } from "./types";

function makeRunId(seed: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const short = createHash("sha256").update(seed).digest("hex").slice(0, 8);
  return `${stamp}-${short}`;
}

function buildCost(wallClockMs: number): CostReport {
  return {
    externalPaidUsd: 0,
    anthropicCalls: 0,
    gpuProvisioned: false,
    gpuInferences: 0,
    cursorAgentWallMinutes: wallClockMs / 60000,
    notes: [
      "No Anthropic / OpenAI / gateway calls were made by this assessment.",
      "No GPU was provisioned or billed (RunPod/Modal/custom).",
      "Cost is reported as Cursor Cloud agent wall-minutes for the measured job only; Cursor subscription pricing is outside this report.",
    ],
  };
}

export interface AssessmentOptions {
  size?: number;
  repoRoot?: string;
  persist?: boolean;
  skipNetwork?: boolean;
}

export async function runComputeAssessment(options?: AssessmentOptions): Promise<ComputeAssessmentReport> {
  const size = options?.size ?? DEFAULT_CORPUS_SIZE;
  const repoRoot = options?.repoRoot ?? process.cwd();
  const persist = options?.persist ?? true;

  const environment = await inspectEnvironment({ skipNetwork: options?.skipNetwork });
  const { results, metrics } = await runDeterministicIngestCompileJob({ size, repoRoot });
  const localModelProbe = await runLocalModelProbe({ gpuPresent: environment.gpu.present });
  const gpuClient = getDefaultGpuWorkerClient();
  const gpuWorker = await gpuClient.capability();
  // Prove the seam refuses work without provisioning.
  await gpuClient.submit({
    jobId: "assessment-refuse-probe",
    modelHint: "unprovisioned",
    promptChars: 0,
    maxOutputTokens: 0,
  });

  const fit =
    metrics.failureRate === 0 &&
    metrics.docsPerSecond > 0.05 &&
    environment.cpu.logicalCpus >= 2 &&
    environment.memory.totalBytes >= 4 * 1024 * 1024 * 1024 &&
    environment.disk.rootAvailableBytes >= 5 * 1024 * 1024 * 1024;

  const rationale: string[] = [
    `Processed ${metrics.documentCountProcessed} documents in ${(metrics.wallClockMs / 1000).toFixed(2)}s (${metrics.docsPerSecond.toFixed(3)} docs/s).`,
    `Failure rate ${(metrics.failureRate * 100).toFixed(2)}% (${metrics.failureCount} failures).`,
    `Peak RSS ${(metrics.peakRssBytes / (1024 * 1024)).toFixed(1)} MiB on a ${(environment.memory.totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GiB / ${environment.cpu.logicalCpus}-vCPU VM.`,
    `CPU time ${(metrics.cpuTotalMs / 1000).toFixed(2)}s (user ${(metrics.cpuUserMs / 1000).toFixed(2)}s / system ${(metrics.cpuSystemMs / 1000).toFixed(2)}s).`,
    environment.gpu.present
      ? "GPU devices were observed; this assessment still did not provision paid GPU inference."
      : "No GPU present — deterministic pipeline did not need one.",
    environment.network.secGovReachable
      ? "SEC.gov reachable from this VM (EDGAR network path viable)."
      : "SEC.gov reachability probe failed; corpus used in-repo fixtures only.",
    "Legal safety gates, independent acceptance fixtures, and certification boundaries were not modified; status is COMPUTE_ASSESSMENT_NOT_CERTIFIED.",
  ];

  const report: ComputeAssessmentReport = {
    status: COMPUTE_ASSESSMENT_STATUS,
    generatedAt: new Date().toISOString(),
    runId: makeRunId(`${size}:${metrics.wallClockMs}:${metrics.totalChars}`),
    northStarPreserved: true,
    certificationClaimed: false,
    environment,
    benchmark: metrics,
    documents: results,
    localModelProbe,
    gpuWorker,
    cost: buildCost(metrics.wallClockMs),
    durableWrites: [],
    fitnessVerdict: {
      edgarIngestAndStructuralCompileFitCursorCloud: fit,
      rationale,
      workloadsRequiringDedicatedGpu: [...GPU_REQUIRED_WORKLOADS],
      recommendedNextStep: fit
        ? "Keep deterministic EDGAR ingest + structural compilation on Cursor Cloud Agents; defer RunPod/Modal until Pass B / LLM extraction volume requires authorized GPU inference."
        : "Investigate measured failures or resource shortfalls before scaling ingest on Cursor Cloud; still do not provision GPUs without authorization.",
    },
  };

  if (persist) {
    // Probe backends once, attach URIs, then rewrite the git/artifact copies with durableWrites populated.
    const planned = await persistAssessmentReport(report, repoRoot, { appendIndex: true });
    report.durableWrites = planned;
    await persistAssessmentReport(report, repoRoot, { appendIndex: false });
  }

  return report;
}
