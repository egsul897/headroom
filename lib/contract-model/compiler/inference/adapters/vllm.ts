import { OpenAICompatibleInferenceAdapter } from "./openai-compatible";

export const DEFAULT_VLLM_BASE_URL = process.env.VLLM_BASE_URL ?? "http://127.0.0.1:8000";
export const DEFAULT_VLLM_MODEL = process.env.VLLM_MODEL ?? "local-model";

/** vLLM OpenAI-compatible server. */
export function createVllmAdapter(options?: {
  baseUrl?: string;
  defaultModel?: string;
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
}): OpenAICompatibleInferenceAdapter {
  return new OpenAICompatibleInferenceAdapter({
    name: "vllm",
    mode: "VLLM_LOCAL",
    baseUrl: options?.baseUrl ?? DEFAULT_VLLM_BASE_URL,
    defaultModel: options?.defaultModel ?? DEFAULT_VLLM_MODEL,
    apiKeyEnv: "VLLM_API_KEY",
    apiKey: options?.apiKey,
    fetchImpl: options?.fetchImpl,
  });
}
