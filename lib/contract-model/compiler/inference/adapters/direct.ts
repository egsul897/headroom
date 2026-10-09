/**
 * Direct paid-provider adapter. Blocked unless founder authorization is present.
 * Uses Anthropic Messages API directly (NOT Vercel AI Gateway).
 * Prefer Ollama/vLLM/replay/deterministic for routine work.
 */
import Anthropic from "@anthropic-ai/sdk";
import { assertPaidAuthorization } from "../policy";
import type { InferenceAdapter, InferenceRequest, InferenceResponse, ModelIdentity } from "../types";
import { INFERENCE_CONTRACT_VERSION, PaidInferenceUnauthorizedError } from "../types";

export interface DirectProviderOptions {
  apiKey?: string | null;
  defaultModel?: string;
  baseURL?: string | null;
  client?: { messages: { create: (params: Record<string, unknown>) => Promise<{ content: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number }; model?: string }> } };
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return JSON.parse(fence[1].trim());
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("Direct provider response did not contain JSON");
}

export class DirectProviderInferenceAdapter implements InferenceAdapter {
  readonly name = "direct-provider";
  readonly mode = "DIRECT_PROVIDER" as const;
  private readonly options: DirectProviderOptions;

  constructor(options: DirectProviderOptions = {}) {
    this.options = options;
  }

  supports(policy: InferenceRequest["policy"]): boolean {
    return policy.mode === "DIRECT_PROVIDER";
  }

  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    const started = Date.now();
    try {
      assertPaidAuthorization(request.policy);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        contractVersion: INFERENCE_CONTRACT_VERSION,
        requestId: request.requestId,
        status: "UNAUTHORIZED_PAID",
        model: request.model ?? { provider: "direct", model: "blocked", modelVersion: null, endpoint: null },
        policy: request.policy,
        contextHash: request.contextHash,
        promptHash: request.promptHash,
        schemaHash: request.schemaHash,
        sourceLineage: request.sourceLineage,
        output: null,
        rawText: null,
        latencyMs: Date.now() - started,
        cost: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null, costStatus: "BLOCKED", pricingNote: "paid call refused" },
        error: message,
        recordedAt: new Date().toISOString(),
      };
    }

    const apiKey = this.options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? null;
    if (!apiKey && !this.options.client) {
      throw new PaidInferenceUnauthorizedError("DIRECT_PROVIDER authorized but ANTHROPIC_API_KEY is not set (and no injected client).");
    }

    const modelName = request.model?.model ?? this.options.defaultModel ?? process.env.SEMANTIC_COMPILER_MODEL ?? "claude-sonnet-4-20250514";
    const model: ModelIdentity = {
      provider: "anthropic-direct",
      model: modelName,
      modelVersion: request.model?.modelVersion ?? null,
      endpoint: this.options.baseURL ?? "https://api.anthropic.com",
    };

    const client =
      this.options.client ??
      new Anthropic({
        apiKey: apiKey!,
        ...(this.options.baseURL ? { baseURL: this.options.baseURL } : {}),
      });

    try {
      const message = await client.messages.create({
        model: modelName,
        max_tokens: request.policy.maxTokens,
        temperature: request.policy.temperature,
        system: request.systemPrompt ?? "Return a single JSON object only.",
        messages: [{ role: "user", content: request.prompt }],
      });
      const text = (message.content ?? [])
        .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
        .map((b) => b.text)
        .join("\n");
      const output = extractJson(text);
      const inTok = message.usage?.input_tokens ?? null;
      const outTok = message.usage?.output_tokens ?? null;
      return {
        contractVersion: INFERENCE_CONTRACT_VERSION,
        requestId: request.requestId,
        status: "OK",
        model: { ...model, model: message.model ?? modelName },
        policy: request.policy,
        contextHash: request.contextHash,
        promptHash: request.promptHash,
        schemaHash: request.schemaHash,
        sourceLineage: request.sourceLineage,
        output,
        rawText: text,
        latencyMs: Date.now() - started,
        cost: {
          inputTokens: inTok,
          outputTokens: outTok,
          totalTokens: inTok != null && outTok != null ? inTok + outTok : null,
          costUsd: null,
          costStatus: "UNKNOWN",
          pricingNote: "direct Anthropic; cost not priced in this adapter (record usage only)",
        },
        error: null,
        recordedAt: new Date().toISOString(),
      };
    } catch (err) {
      return {
        contractVersion: INFERENCE_CONTRACT_VERSION,
        requestId: request.requestId,
        status: "TRANSPORT_ERROR",
        model,
        policy: request.policy,
        contextHash: request.contextHash,
        promptHash: request.promptHash,
        schemaHash: request.schemaHash,
        sourceLineage: request.sourceLineage,
        output: null,
        rawText: null,
        latencyMs: Date.now() - started,
        cost: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null, costStatus: "UNKNOWN", pricingNote: null },
        error: err instanceof Error ? err.message : String(err),
        recordedAt: new Date().toISOString(),
      };
    }
  }
}
