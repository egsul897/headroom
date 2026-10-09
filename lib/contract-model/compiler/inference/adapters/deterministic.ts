import type { InferenceAdapter, InferenceRequest, InferenceResponse } from "../types";
import { INFERENCE_CONTRACT_VERSION } from "../types";

/**
 * Zero-model adapter. Never invents semantic permission/prohibition.
 * Returns a structured envelope that marks all semantic fields as unresolved
 * so callers can attach deterministic facts separately.
 */
export class DeterministicInferenceAdapter implements InferenceAdapter {
  readonly name = "deterministic";
  readonly mode = "DETERMINISTIC_ONLY" as const;

  supports(policy: InferenceRequest["policy"]): boolean {
    return policy.mode === "DETERMINISTIC_ONLY";
  }

  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    const started = Date.now();
    const model = request.model ?? {
      provider: "deterministic",
      model: "none",
      modelVersion: null,
      endpoint: null,
    };
    const output = {
      mode: "DETERMINISTIC_ONLY",
      semanticStatus: "UNRESOLVED",
      note: "Deterministic-only mode does not infer operative authority, permission, or prohibition. Attach deterministic facts from structural extraction; leave semantic hypotheses unresolved.",
      rules: [],
      definitions: [],
      sharedCapacities: [],
      missingInputs: ["SEMANTIC_INTERPRETATION_REQUIRES_MODEL"],
      unsupportedSemantics: [],
    };
    return {
      contractVersion: INFERENCE_CONTRACT_VERSION,
      requestId: request.requestId,
      status: "DETERMINISTIC",
      model,
      policy: request.policy,
      contextHash: request.contextHash,
      promptHash: request.promptHash,
      schemaHash: request.schemaHash,
      sourceLineage: request.sourceLineage,
      output,
      rawText: JSON.stringify(output),
      latencyMs: Date.now() - started,
      cost: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costUsd: 0,
        costStatus: "ZERO",
        pricingNote: "deterministic-only; no model invoked",
      },
      error: null,
      recordedAt: new Date().toISOString(),
    };
  }
}
