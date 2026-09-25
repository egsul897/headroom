/**
 * Certified provider callers: every client is built here with maxRetries: 0 (transport-retry.ts is the ONE retry
 * owner), the credential is an explicit argument (never read from the environment inside the compiler), and the
 * model ids come from the CertifiedCompilerConfig.
 */
import Anthropic from "@anthropic-ai/sdk";
import { AI_GATEWAY_BASE_URL, VercelAIGatewayContractAnalyzer } from "../analyzer/anthropic-analyzer";
import { createRealStageCaller, type StageCaller } from "../compiler/llm-caller";
import { BoundedSemanticCaller } from "../compiler/semantic/bounded-caller";
import type { SemanticCaller } from "../compiler/semantic/caller";
import type { CertifiedCompilerConfig } from "../compiler/certified-config";

export interface CertifiedCallerOptions { apiKey: string; baseURL?: string; fetch?: typeof globalThis.fetch; providerName?: string }
export interface CertifiedCallers { semanticCaller: SemanticCaller; inventoryPassCallers: [StageCaller, StageCaller]; inventoryCaller: StageCaller; reviewCaller: StageCaller; conditionSuspicionCaller: StageCaller }

export function createCertifiedCallers(config: CertifiedCompilerConfig, options: CertifiedCallerOptions): CertifiedCallers {
  if (!options.apiKey) throw new Error("createCertifiedCallers: apiKey is required (the compiler never reads credentials from the environment)");
  const providerName = options.providerName ?? "vercel-ai-gateway";
  const baseURL = options.baseURL ?? AI_GATEWAY_BASE_URL;
  const client = new Anthropic({ apiKey: options.apiKey, baseURL, maxRetries: 0, ...(options.fetch ? { fetch: options.fetch } : {}) });
  const stage = (model: string): StageCaller => createRealStageCaller(providerName, model, new VercelAIGatewayContractAnalyzer({ apiKey: options.apiKey, baseURL, model, maxTokens: config.maxOutputTokens }));
  const semanticCaller = new BoundedSemanticCaller(providerName, config.semanticModel, client, { maxOutputTokens: config.maxOutputTokens, transportPolicy: config.transportRetry });
  const inventory = stage(config.inventoryModel);
  return { semanticCaller, inventoryPassCallers: [inventory, stage(config.inventoryModel)], inventoryCaller: inventory, reviewCaller: stage(config.verifierModel), conditionSuspicionCaller: stage(config.verifierModel) };
}
