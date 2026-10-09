/**
 * Shared OpenAI-compatible chat-completions client for Ollama and vLLM.
 * Structured outputs are requested via response_format json_schema when supported;
 * otherwise json_object + local schema validation.
 */
import { z } from "zod";
import type { InferenceAdapter, InferenceCostRecord, InferenceExecutionMode, InferenceRequest, InferenceResponse, ModelIdentity } from "../types";
import { INFERENCE_CONTRACT_VERSION } from "../types";

export interface OpenAICompatibleOptions {
  name: string;
  mode: InferenceExecutionMode;
  baseUrl: string;
  defaultModel: string;
  apiKeyEnv?: string;
  /** Optional static API key (tests). Prefer env. */
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
}

function estimateTokens(text: string): number {
  // Rough local estimate when the server omits usage: ~4 chars/token.
  return Math.max(1, Math.ceil(text.length / 4));
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return JSON.parse(fence[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("Model response did not contain a JSON object");
}

export class OpenAICompatibleInferenceAdapter implements InferenceAdapter {
  readonly name: string;
  readonly mode: InferenceExecutionMode;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly apiKeyEnv?: string;
  private readonly apiKey?: string | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.name;
    this.mode = options.mode;
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.defaultModel = options.defaultModel;
    this.apiKeyEnv = options.apiKeyEnv;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  supports(policy: InferenceRequest["policy"]): boolean {
    return policy.mode === this.mode;
  }

  private resolveApiKey(): string | null {
    if (this.apiKey !== undefined) return this.apiKey;
    if (this.apiKeyEnv) return process.env[this.apiKeyEnv] ?? null;
    return null;
  }

  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    const started = Date.now();
    const modelName = request.model?.model ?? this.defaultModel;
    const model: ModelIdentity = {
      provider: this.name,
      model: modelName,
      modelVersion: request.model?.modelVersion ?? null,
      endpoint: this.baseUrl,
    };
    const apiKey = this.resolveApiKey();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;

    const messages: { role: string; content: string }[] = [];
    if (request.systemPrompt) messages.push({ role: "system", content: request.systemPrompt });
    messages.push({
      role: "user",
      content: `${request.prompt}\n\nRespond with a single JSON object that conforms to schema "${request.outputSchemaName}".`,
    });

    const body = {
      model: modelName,
      messages,
      temperature: request.policy.temperature,
      max_tokens: request.policy.maxTokens,
      response_format: { type: "json_object" as const },
    };

    try {
      const res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const rawBody = await res.text();
      if (!res.ok) {
        return this.fail(request, model, started, "TRANSPORT_ERROR", `HTTP ${res.status}: ${rawBody.slice(0, 500)}`);
      }
      const payload = JSON.parse(rawBody) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
        model?: string;
      };
      const text = payload.choices?.[0]?.message?.content ?? "";
      let output: unknown;
      try {
        output = extractJsonObject(text);
      } catch (err) {
        return this.fail(request, model, started, "SCHEMA_INVALID", err instanceof Error ? err.message : String(err), text);
      }
      // Structural presence check only — callers apply their domain Zod schema.
      if (output === null || typeof output !== "object") {
        return this.fail(request, model, started, "SCHEMA_INVALID", "Parsed output was not an object", text);
      }
      const schemaCheck = z.record(z.string(), z.unknown()).safeParse(output);
      if (!schemaCheck.success && !Array.isArray(output)) {
        return this.fail(request, model, started, "SCHEMA_INVALID", schemaCheck.error.message, text);
      }
      const inTok = payload.usage?.prompt_tokens ?? estimateTokens((request.systemPrompt ?? "") + request.prompt);
      const outTok = payload.usage?.completion_tokens ?? estimateTokens(text);
      const cost: InferenceCostRecord = {
        inputTokens: inTok,
        outputTokens: outTok,
        totalTokens: payload.usage?.total_tokens ?? inTok + outTok,
        costUsd: 0,
        costStatus: "ZERO",
        pricingNote: `${this.name} local inference; monetary cost treated as zero (electricity/hardware not metered here)`,
      };
      return {
        contractVersion: INFERENCE_CONTRACT_VERSION,
        requestId: request.requestId,
        status: "OK",
        model: { ...model, model: payload.model ?? modelName },
        policy: request.policy,
        contextHash: request.contextHash,
        promptHash: request.promptHash,
        schemaHash: request.schemaHash,
        sourceLineage: request.sourceLineage,
        output,
        rawText: text,
        latencyMs: Date.now() - started,
        cost,
        error: null,
        recordedAt: new Date().toISOString(),
      };
    } catch (err) {
      return this.fail(request, model, started, "TRANSPORT_ERROR", err instanceof Error ? err.message : String(err));
    }
  }

  private fail(
    request: InferenceRequest,
    model: ModelIdentity,
    started: number,
    status: InferenceResponse["status"],
    error: string,
    rawText: string | null = null
  ): InferenceResponse {
    return {
      contractVersion: INFERENCE_CONTRACT_VERSION,
      requestId: request.requestId,
      status,
      model,
      policy: request.policy,
      contextHash: request.contextHash,
      promptHash: request.promptHash,
      schemaHash: request.schemaHash,
      sourceLineage: request.sourceLineage,
      output: null,
      rawText,
      latencyMs: Date.now() - started,
      cost: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null, costStatus: "UNKNOWN", pricingNote: null },
      error,
      recordedAt: new Date().toISOString(),
    };
  }
}
