import { DeterministicInferenceAdapter } from "./adapters/deterministic";
import { DirectProviderInferenceAdapter } from "./adapters/direct";
import { createOllamaAdapter } from "./adapters/ollama";
import { OfflineReplayAdapter } from "./adapters/replay";
import { createVllmAdapter } from "./adapters/vllm";
import { defaultOfflinePolicy, resolveExecutionPolicy } from "./policy";
import type { InferenceAdapter, InferenceExecutionMode, InferenceExecutionPolicy, InferenceRequest, InferenceResponse } from "./types";
import { InferenceModeUnsupportedError } from "./types";

export interface InferenceRegistryOptions {
  replayDirectory?: string;
  ollamaBaseUrl?: string;
  vllmBaseUrl?: string;
  fetchImpl?: typeof fetch;
  adapters?: InferenceAdapter[];
}

export class InferenceRegistry {
  private readonly adapters: Map<InferenceExecutionMode, InferenceAdapter>;

  constructor(options: InferenceRegistryOptions = {}) {
    const list =
      options.adapters ??
      [
        new DeterministicInferenceAdapter(),
        createOllamaAdapter({ baseUrl: options.ollamaBaseUrl, fetchImpl: options.fetchImpl }),
        createVllmAdapter({ baseUrl: options.vllmBaseUrl, fetchImpl: options.fetchImpl }),
        new DirectProviderInferenceAdapter(),
        new OfflineReplayAdapter({ directory: options.replayDirectory ?? "covenant-knowledge-data/replay" }),
      ];
    this.adapters = new Map();
    for (const a of list) this.adapters.set(a.mode, a);
  }

  get(mode: InferenceExecutionMode): InferenceAdapter {
    const a = this.adapters.get(mode);
    if (!a) throw new InferenceModeUnsupportedError(mode);
    return a;
  }

  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    const adapter = this.get(request.policy.mode);
    if (!adapter.supports(request.policy)) {
      throw new InferenceModeUnsupportedError(request.policy.mode, `Adapter ${adapter.name} rejected policy`);
    }
    return adapter.infer(request);
  }
}

/**
 * Resolve execution mode from env without enabling paid calls.
 * HEADROOM_INFERENCE_MODE = DETERMINISTIC_ONLY | OLLAMA_LOCAL | VLLM_LOCAL | OFFLINE_REPLAY | DIRECT_PROVIDER
 */
export function resolveModeFromEnv(): InferenceExecutionPolicy {
  const raw = (process.env.HEADROOM_INFERENCE_MODE ?? "").trim().toUpperCase();
  const mode = (["DETERMINISTIC_ONLY", "OLLAMA_LOCAL", "VLLM_LOCAL", "DIRECT_PROVIDER", "OFFLINE_REPLAY"] as const).includes(
    raw as InferenceExecutionMode
  )
    ? (raw as InferenceExecutionMode)
    : "DETERMINISTIC_ONLY";
  if (mode === "DIRECT_PROVIDER") {
    return resolveExecutionPolicy({
      mode,
      founderPaidAuthorization: process.env.HEADROOM_FOUNDER_PAID_INFERENCE_AUTH ? true : false,
      authorizationRef: process.env.HEADROOM_FOUNDER_PAID_INFERENCE_AUTH ?? null,
      allowNetwork: true,
    });
  }
  if (mode === "DETERMINISTIC_ONLY" && !raw) return defaultOfflinePolicy();
  return resolveExecutionPolicy({
    mode,
    allowNetwork: mode === "OLLAMA_LOCAL" || mode === "VLLM_LOCAL",
  });
}
