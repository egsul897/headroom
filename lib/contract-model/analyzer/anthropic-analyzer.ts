/**
 * Real ContractAnalyzerProvider implementation for Phase C0 (task's own
 * Task 4: "reuse the existing Anthropic/Gateway transport and the existing
 * Candidate* schemas - do not build a parallel extraction system"). Mirrors
 * lib/extraction/anthropic-provider.ts's own AnthropicMessagesProvider
 * pattern exactly: one shared base class doing the real
 * `client.messages.parse()` + `output_config.format` structured-output call,
 * two thin subclasses differing only in how `client` is constructed (direct
 * Anthropic API vs. Vercel AI Gateway).
 *
 * This is intentionally a SEPARATE class hierarchy from
 * AnthropicMessagesProvider in lib/extraction/anthropic-provider.ts, not a
 * reuse of it - that class implements the OLD Permission/PermissionRelationship-
 * shaped ContractExtractionProvider interface (six stages, PermissionProposal
 * etc.), which is a different, already-shipped and already-tested contract
 * this spike must not touch. The Phase-B/Phase-C0 analyzer targets the NEW
 * CandidateContractRule/CandidateDefinedTerm/CandidateContractReference/
 * CandidateRuleRelationship shapes from lib/contract-model/types.ts instead.
 * What IS reused, verbatim, is the transport convention: same SDK, same
 * `messages.parse()` + `zodOutputFormat()` call shape, same
 * direct-vs-Gateway base-URL/auth split, same env vars.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod";
import { ContractAnalysisResultSchema, type ContractAnalysisResult, type ContractAnalyzerInput } from "./schema";
import type { ContractAnalyzerProvider } from "./provider";
import { calculateCostUsd, withRetry, type AnalyzerCallTelemetry } from "./telemetry";

/** Claude Sonnet 5, per explicit user instruction to use the cheaper model for this spike ($2/$10 per M tokens vs. Opus 5's $5/$25). */
export const DEFAULT_ANALYZER_MODEL = "claude-sonnet-5";
export const DEFAULT_GATEWAY_ANALYZER_MODEL = "anthropic/claude-sonnet-5";
export const AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh";
export const ANALYZER_PROMPT_VERSION = "phase-c0.1";
export const ANALYZER_SCHEMA_VERSION = "phase-c0.1";
/** Streaming avoids the SDK's non-streaming long-request guard; 128K max_tokens is the real ceiling for these models, per "run the whole thing, no ceiling." */
export const DEFAULT_MAX_TOKENS = 128000;

const SYSTEM_PROMPT = [
  "You are a precise legal-document analyzer for a covenant-capacity analytics platform.",
  "You are given the Negative Covenants article of a real credit agreement and an excerpt of the Definitions article it depends on.",
  "Extract every material provision as a structured ContractRule candidate: the covenant family, rule type, evaluation class, action, entity scope, threshold value/unit, formula kind, conditions, exceptions, exact source section reference, and the defined terms it relies on.",
  "Extract every defined term you rely on or that the document text defines as a DefinedTerm candidate, with its exact section reference.",
  "Extract cross-references between rules/sections/terms as ContractReference candidates, and any relationship BETWEEN two rules you found (e.g. one basket's capacity reduces another's, or one basket feeds another) as a RuleRelationship candidate.",
  "Be exact about numbers: if a basket is 'the greater of a fixed dollar amount and a percentage of a defined metric,' both numbers and the metric name must appear - never collapse it to a single number.",
  "Be exact about conditions: if a permission is unconditional, say so; if it is gated by a ratio test, a no-default condition, an entity-type restriction, or a time period, include that condition explicitly rather than omitting it.",
  "Never invent a source section reference. If you are not confident a provision maps cleanly onto the ontology, still extract it as best you can and use evaluationClass JUDGMENT_REQUIRED or action OTHER rather than silently dropping it - a flagged, honest guess is required; a confident, wrong, unflagged extraction is the one outcome this system must never produce.",
].join(" ");

export abstract class AnthropicMessagesAnalyzer implements ContractAnalyzerProvider {
  /** The telemetry for the most recent `analyze()` call (task §26/§27) - real, never fabricated; null until a real call completes. */
  lastCallTelemetry: AnalyzerCallTelemetry | null = null;

  constructor(
    protected readonly client: Anthropic,
    readonly model: string,
    protected readonly providerName: string,
    protected readonly maxTokens: number = DEFAULT_MAX_TOKENS
  ) {}

  /**
   * Phase C generalization (docs/phase-c-contract-compiler-v1.md) - the one
   * real, provider-abstract structured-output call primitive every staged
   * compiler stage (definitions/inventory/rule-extraction/relationships/
   * adversarial-verification) shares, so staging real LLM calls never means
   * re-deriving the streaming/retry/telemetry plumbing per stage. `analyze()`
   * below (C0's original single-combined-call baseline, kept for the
   * synthetic-vs-real-LLM and single-call-vs-staged comparisons the C0/C
   * reports both rely on) is now implemented in terms of this method, not the
   * other way around.
   */
  async runStructuredStage<T>(schema: ZodType<T>, stage: string, systemPrompt: string, userContent: string): Promise<T> {
    const startedAt = Date.now();
    const timestamp = new Date().toISOString();
    try {
      const { value: message, attemptCount, retryCount, rateLimitFailures } = await withRetry(async () => {
        const stream = this.client.messages.stream({
          model: this.model,
          max_tokens: this.maxTokens,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
          output_config: { format: zodOutputFormat(schema) },
        });
        return stream.finalMessage();
      });

      const usage = message.usage;
      const inputTokens = usage?.input_tokens ?? null;
      const outputTokens = usage?.output_tokens ?? null;
      this.lastCallTelemetry = {
        provider: this.providerName,
        model: this.model,
        promptVersion: ANALYZER_PROMPT_VERSION,
        schemaVersion: ANALYZER_SCHEMA_VERSION,
        stage,
        timestamp,
        inputTokens,
        outputTokens,
        cachedInputTokens: usage?.cache_read_input_tokens ?? null,
        cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? null,
        attemptCount,
        retryCount,
        rateLimitFailures,
        latencyMs: Date.now() - startedAt,
        providerCost: undefined,
        calculatedCostUsd: calculateCostUsd(inputTokens, outputTokens, this.model),
      };

      if (!message.parsed_output) {
        throw new Error(`${this.constructor.name}: model response for stage "${stage}" did not parse against its schema (stop_reason=${message.stop_reason})`);
      }
      return message.parsed_output;
    } catch (err) {
      this.lastCallTelemetry = {
        provider: this.providerName,
        model: this.model,
        promptVersion: ANALYZER_PROMPT_VERSION,
        schemaVersion: ANALYZER_SCHEMA_VERSION,
        stage,
        timestamp,
        inputTokens: null,
        outputTokens: null,
        cachedInputTokens: null,
        cacheCreationInputTokens: null,
        attemptCount: 1,
        retryCount: 0,
        rateLimitFailures: 0,
        latencyMs: Date.now() - startedAt,
        providerCost: undefined,
        calculatedCostUsd: null,
        error: err instanceof Error ? err.message : String(err),
      };
      throw err;
    }
  }

  async analyze(input: ContractAnalyzerInput): Promise<ContractAnalysisResult> {
    return this.runStructuredStage(ContractAnalysisResultSchema, "combined_analysis", SYSTEM_PROMPT, `Defined terms excerpt:\n${input.definitionsText}\n\nNegative covenants article:\n${input.documentText}`);
  }
}

export class AnthropicContractAnalyzer extends AnthropicMessagesAnalyzer {
  constructor(options?: { apiKey?: string; model?: string; maxTokens?: number }) {
    const client = new Anthropic(options?.apiKey ? { apiKey: options.apiKey } : {});
    const model = options?.model ?? process.env.ANALYZER_MODEL ?? DEFAULT_ANALYZER_MODEL;
    super(client, model, "anthropic-direct", options?.maxTokens ?? DEFAULT_MAX_TOKENS);
  }
}

export class VercelAIGatewayContractAnalyzer extends AnthropicMessagesAnalyzer {
  constructor(options?: { apiKey?: string; model?: string; baseURL?: string; maxTokens?: number }) {
    const apiKey = options?.apiKey ?? process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      throw new Error("VercelAIGatewayContractAnalyzer requires AI_GATEWAY_API_KEY (or an explicit apiKey option) - none was provided.");
    }
    const client = new Anthropic({ apiKey, baseURL: options?.baseURL ?? AI_GATEWAY_BASE_URL });
    const model = options?.model ?? process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
    super(client, model, "vercel-ai-gateway", options?.maxTokens ?? DEFAULT_MAX_TOKENS);
  }
}
