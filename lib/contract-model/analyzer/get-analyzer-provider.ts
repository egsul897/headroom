/**
 * Factory for ContractAnalyzerProvider, mirroring
 * lib/extraction/get-provider.ts's own selection order and fail-loud
 * discipline exactly (Phase C0 task's own instruction to reuse the existing
 * provider-selection convention rather than inventing a new one):
 *  1. AI_GATEWAY_API_KEY set -> VercelAIGatewayContractAnalyzer.
 *  2. ANTHROPIC_API_KEY set -> AnthropicContractAnalyzer.
 *  3. Neither set, running on Vercel -> throws (never a silent synthetic
 *     substitution for what a caller expects to be a real analysis).
 *  4. Neither set, not on Vercel (local dev/test/this sandbox) ->
 *     SyntheticContractAnalyzer, clearly labeled as pattern-matching only.
 */
import { AnthropicContractAnalyzer, VercelAIGatewayContractAnalyzer, DEFAULT_ANALYZER_MODEL, DEFAULT_GATEWAY_ANALYZER_MODEL, ANALYZER_PROMPT_VERSION, ANALYZER_SCHEMA_VERSION } from "./anthropic-analyzer";
import { SyntheticContractAnalyzer } from "./synthetic-analyzer";
import type { ContractAnalyzerProvider } from "./provider";

export interface AnalyzerProviderChoice {
  provider: ContractAnalyzerProvider;
  providerName: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
}

export class MissingAnalyzerCredentialError extends Error {
  constructor() {
    super("Neither AI_GATEWAY_API_KEY nor ANTHROPIC_API_KEY is set in this Vercel deployment, so the Phase C0 analyzer has no real LLM credential to use. Set one in the Vercel dashboard and redeploy.");
  }
}

export function getAnalyzerProvider(): AnalyzerProviderChoice {
  if (process.env.AI_GATEWAY_API_KEY) {
    const model = process.env.ANALYZER_MODEL ?? DEFAULT_GATEWAY_ANALYZER_MODEL;
    return { provider: new VercelAIGatewayContractAnalyzer({ model }), providerName: "VERCEL_AI_GATEWAY", model, promptVersion: ANALYZER_PROMPT_VERSION, schemaVersion: ANALYZER_SCHEMA_VERSION };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const model = process.env.ANALYZER_MODEL ?? DEFAULT_ANALYZER_MODEL;
    return { provider: new AnthropicContractAnalyzer({ model }), providerName: "anthropic", model, promptVersion: ANALYZER_PROMPT_VERSION, schemaVersion: ANALYZER_SCHEMA_VERSION };
  }
  if (process.env.VERCEL) {
    throw new MissingAnalyzerCredentialError();
  }
  return { provider: new SyntheticContractAnalyzer(), providerName: "synthetic", model: "synthetic-v1", promptVersion: "synthetic", schemaVersion: ANALYZER_SCHEMA_VERSION };
}
