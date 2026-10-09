/**
 * Optional GPU-worker interface for Headroom workloads that truly need GPU
 * inference (Pass B semantic classification, large LLM extraction, embedding
 * indexes at scale).
 *
 * CRITICAL POLICY: this module must NOT provision, bill, or call a GPU
 * provider. The default client always reports UNAVAILABLE. Concrete RunPod /
 * Modal adapters may be wired later behind explicit authorization.
 *
 * Soft gate only. IMPLEMENTED ≠ CERTIFIED.
 */
import type { GpuInferenceJob, GpuInferenceResult, GpuWorkerCapability } from "./types";

export interface GpuWorkerClient {
  capability(): Promise<GpuWorkerCapability>;
  submit(job: GpuInferenceJob): Promise<GpuInferenceResult>;
}

/**
 * Default client — present so the rest of the pipeline can depend on a GPU
 * seam without paying for GPUs. Refuses every job.
 */
export class UnprovisionedGpuWorkerClient implements GpuWorkerClient {
  constructor(
    private readonly provider: GpuWorkerCapability["provider"] = "unprovisioned",
    private readonly reason = "GPU worker interface is implemented but intentionally unprovisioned. No RunPod/Modal/custom GPU endpoint configured; no paid GPU call authorized.",
  ) {}

  async capability(): Promise<GpuWorkerCapability> {
    return { provider: this.provider, available: false, reason: this.reason };
  }

  async submit(job: GpuInferenceJob): Promise<GpuInferenceResult> {
    return {
      status: "UNAVAILABLE",
      jobId: job.jobId,
      provider: this.provider,
      reason: this.reason,
      latencyMs: null,
      outputChars: null,
    };
  }
}

/**
 * Adapter stubs for future authorized providers. Construction is allowed;
 * `submit` still refuses unless an endpoint URL is supplied AND
 * HEADROOM_GPU_WORKER_AUTHORIZED=1 is set. Even then, this file does not
 * open a network connection in the current implementation — it only
 * documents the contract.
 */
export class RunPodGpuWorkerClient extends UnprovisionedGpuWorkerClient {
  constructor(endpointUrl?: string) {
    super(
      "runpod",
      endpointUrl && process.env.HEADROOM_GPU_WORKER_AUTHORIZED === "1"
        ? "Authorized flag set but live RunPod transport is not enabled in this assessment build (no paid calls)."
        : "RunPod adapter present; endpoint unset or HEADROOM_GPU_WORKER_AUTHORIZED≠1. No provisioning performed.",
    );
  }
}

export class ModalGpuWorkerClient extends UnprovisionedGpuWorkerClient {
  constructor(endpointUrl?: string) {
    super(
      "modal",
      endpointUrl && process.env.HEADROOM_GPU_WORKER_AUTHORIZED === "1"
        ? "Authorized flag set but live Modal transport is not enabled in this assessment build (no paid calls)."
        : "Modal adapter present; endpoint unset or HEADROOM_GPU_WORKER_AUTHORIZED≠1. No provisioning performed.",
    );
  }
}

export function getDefaultGpuWorkerClient(): GpuWorkerClient {
  const provider = (process.env.HEADROOM_GPU_WORKER_PROVIDER ?? "unprovisioned").toLowerCase();
  const endpoint = process.env.HEADROOM_GPU_WORKER_ENDPOINT;
  if (provider === "runpod") return new RunPodGpuWorkerClient(endpoint);
  if (provider === "modal") return new ModalGpuWorkerClient(endpoint);
  return new UnprovisionedGpuWorkerClient();
}

/** Workloads that, by measured architecture and prior phase evidence, need GPU-class inference. */
export const GPU_REQUIRED_WORKLOADS = [
  "Pass B semantic covenant classification (LLM)",
  "LLM extraction stages (STRUCTURE-via-provider, DEFINITIONS, PERMISSIONS, RELATIONSHIPS, COVERAGE, FINANCIAL_INPUTS)",
  "Semantic verification / ensemble certification passes that call frontier models",
  "Large-context document Q&A that exceeds CPU small-model practicality",
  "Dense embedding index builds at multi-million-chunk scale when latency matters",
] as const;

/** Workloads measured as practical on this Cursor Cloud CPU VM. */
export const CPU_PRACTICAL_WORKLOADS = [
  "SEC EDGAR discovery/fetch (network + light JSON/HTML)",
  "Document parse (TXT/HTML/PDF/DOCX) and section-aware chunking",
  "Content-hash deduplication",
  "Deterministic STRUCTURE compilation (parseDocumentStructure)",
  "Structural definitions + cross-reference indexing",
  "StructuralIndex navigation",
  "Pass A deterministic covenant signal indexing",
  "Package-graph / covenant-map assembly (deterministic)",
] as const;
