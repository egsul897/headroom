import {
  PaidInferenceUnauthorizedError,
  type InferenceExecutionMode,
  type InferenceExecutionPolicy,
  InferenceExecutionPolicySchema,
} from "./types";

const FREE_MODES: ReadonlySet<InferenceExecutionMode> = new Set([
  "DETERMINISTIC_ONLY",
  "OLLAMA_LOCAL",
  "VLLM_LOCAL",
  "OFFLINE_REPLAY",
]);

/**
 * Paid direct-provider calls are blocked unless the founder explicitly authorizes
 * them on the request policy. Env HEADROOM_FOUNDER_PAID_INFERENCE_AUTH may supply
 * a matching authorizationRef for automation, but never silently enables paid mode.
 */
export function assertPaidAuthorization(policy: InferenceExecutionPolicy): void {
  if (FREE_MODES.has(policy.mode)) return;
  if (policy.mode !== "DIRECT_PROVIDER") return;
  const envRef = process.env.HEADROOM_FOUNDER_PAID_INFERENCE_AUTH?.trim() || null;
  const authorized =
    policy.founderPaidAuthorization === true &&
    typeof policy.authorizationRef === "string" &&
    policy.authorizationRef.length > 0 &&
    (envRef === null || envRef === policy.authorizationRef);
  if (!authorized) {
    throw new PaidInferenceUnauthorizedError(
      "DIRECT_PROVIDER inference blocked: set policy.founderPaidAuthorization=true with a non-empty authorizationRef, and optionally HEADROOM_FOUNDER_PAID_INFERENCE_AUTH to the same ref. No paid calls without explicit founder authorization."
    );
  }
}

export function resolveExecutionPolicy(
  partial: Partial<InferenceExecutionPolicy> & { mode: InferenceExecutionMode }
): InferenceExecutionPolicy {
  return InferenceExecutionPolicySchema.parse({
    founderPaidAuthorization: false,
    authorizationRef: null,
    allowNetwork: partial.mode === "OLLAMA_LOCAL" || partial.mode === "VLLM_LOCAL" || partial.mode === "DIRECT_PROVIDER",
    maxTokens: 8192,
    temperature: 0,
    ...partial,
  });
}

/** Default mode when no provider credentials and no local endpoints are configured. */
export function defaultOfflinePolicy(): InferenceExecutionPolicy {
  return resolveExecutionPolicy({ mode: "DETERMINISTIC_ONLY", allowNetwork: false });
}
