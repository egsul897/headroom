/**
 * Phase C provider-abstract LLM call primitive (task §61 - "compiler should
 * remain model/provider abstract... production logic should not depend on
 * Claude-specific response prose"). Mirrors
 * lib/contract-model/analyzer/get-analyzer-provider.ts's own selection order
 * exactly (Gateway key -> direct key -> throw on Vercel -> synthetic
 * fallback off Vercel) so every staged compiler call goes through the same
 * real transport C0 already proved out, never a second one.
 *
 * The synthetic fallback here is deliberately minimal - it returns each
 * stage schema's own Zod defaults (empty arrays), never fabricated content -
 * so orchestration/wiring/resumability logic is testable in this sandbox
 * (no AI_GATEWAY_API_KEY/ANTHROPIC_API_KEY) without a single new pattern-
 * matching heuristic to maintain per stage. It is not, and must never be
 * mistaken for, a competitive accuracy baseline (see
 * lib/contract-model/analyzer/synthetic-analyzer.ts's own comment on the
 * same point for the C0 single-call analyzer).
 */
import type { ZodType } from "zod";
import { AnthropicContractAnalyzer, VercelAIGatewayContractAnalyzer, DEFAULT_ANALYZER_MODEL, DEFAULT_GATEWAY_ANALYZER_MODEL } from "../analyzer/anthropic-analyzer";
import type { AnalyzerCallTelemetry } from "../analyzer/telemetry";

export interface StageCaller {
  providerName: string;
  model: string;
  isSynthetic: boolean;
  call<T>(schema: ZodType<T>, stage: string, systemPrompt: string, userContent: string): Promise<T>;
  lastTelemetry(): AnalyzerCallTelemetry | null;
}

class RealStageCaller implements StageCaller {
  isSynthetic = false;
  private analyzer: AnthropicContractAnalyzer | VercelAIGatewayContractAnalyzer;

  constructor(
    public providerName: string,
    public model: string,
    analyzer: AnthropicContractAnalyzer | VercelAIGatewayContractAnalyzer
  ) {
    this.analyzer = analyzer;
  }

  call<T>(schema: ZodType<T>, stage: string, systemPrompt: string, userContent: string): Promise<T> {
    return this.analyzer.runStructuredStage(schema, stage, systemPrompt, userContent);
  }

  lastTelemetry(): AnalyzerCallTelemetry | null {
    return this.analyzer.lastCallTelemetry;
  }
}

class SyntheticStageCaller implements StageCaller {
  providerName = "synthetic";
  model = "synthetic-v1";
  isSynthetic = true;

  async call<T>(schema: ZodType<T>): Promise<T> {
    return schema.parse({});
  }

  lastTelemetry(): AnalyzerCallTelemetry | null {
    return null;
  }
}

export class MissingCompilerCredentialError extends Error {
  constructor() {
    super("Neither AI_GATEWAY_API_KEY nor ANTHROPIC_API_KEY is set in this Vercel deployment, so the Phase C compiler has no real LLM credential for its staged LLM calls. Set one in the Vercel dashboard and redeploy.");
  }
}

export function getStageCaller(maxTokens?: number): StageCaller {
  if (process.env.AI_GATEWAY_API_KEY) {
    const model = process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
    return new RealStageCaller("VERCEL_AI_GATEWAY", model, new VercelAIGatewayContractAnalyzer({ model, maxTokens }));
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const model = process.env.ANALYZER_MODEL ?? DEFAULT_ANALYZER_MODEL;
    return new RealStageCaller("anthropic", model, new AnthropicContractAnalyzer({ model, maxTokens }));
  }
  if (process.env.VERCEL) {
    throw new MissingCompilerCredentialError();
  }
  return new SyntheticStageCaller();
}
