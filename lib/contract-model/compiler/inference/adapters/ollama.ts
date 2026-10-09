import { OpenAICompatibleInferenceAdapter } from "./openai-compatible";

export const DEFAULT_OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "llama3.1";

/** Ollama exposes an OpenAI-compatible /v1/chat/completions endpoint when enabled. */
export function createOllamaAdapter(options?: {
  baseUrl?: string;
  defaultModel?: string;
  fetchImpl?: typeof fetch;
}): OpenAICompatibleInferenceAdapter {
  return new OpenAICompatibleInferenceAdapter({
    name: "ollama",
    mode: "OLLAMA_LOCAL",
    baseUrl: options?.baseUrl ?? DEFAULT_OLLAMA_BASE_URL,
    defaultModel: options?.defaultModel ?? DEFAULT_OLLAMA_MODEL,
    apiKey: null,
    fetchImpl: options?.fetchImpl,
  });
}
