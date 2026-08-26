/**
 * Extraction-provider factory (docs/company-onboarding-v1-implementation.md,
 * fail-loud production selection per docs/autonomous-ingestion-production-readiness.md,
 * Vercel AI Gateway transport per docs/vercel-ai-gateway-extraction.md).
 *
 * Mirrors lib/document-storage/index.ts's `getDocumentStorageProvider()` -
 * the SAME "one factory, branch on environment once" pattern, so the
 * onboarding wizard's Extraction stage never has to decide for itself which
 * ContractExtractionProvider to use, AND the same fail-loud discipline that
 * factory already established for BLOB_READ_WRITE_TOKEN: on Vercel
 * (`process.env.VERCEL` - Vercel's own standard env var, set on every
 * Production/Preview/`vercel dev` invocation) without a usable LLM
 * credential, this THROWS instead of silently returning
 * SyntheticExtractionProvider. SyntheticExtractionProvider is a
 * deterministic, regex-based fixture never intended for production use (see
 * its own header comment) - a live user uploading a real credit agreement
 * must never have it silently substituted for the real LLM-based extraction
 * they think they are getting. Local dev/test (`VERCEL` unset) keeps the
 * existing synthetic fallback unchanged, exactly like the storage factory's
 * own local-fs fallback.
 *
 * Selection order, most-preferred first:
 *  1. AI_GATEWAY_API_KEY set -> VercelAIGatewayExtractionProvider (routes
 *     through Vercel AI Gateway - the recommended production path once
 *     configured, since it centralizes spend/observability across
 *     providers). Recorded on ExtractionRun as provider="VERCEL_AI_GATEWAY".
 *  2. ANTHROPIC_API_KEY set -> AnthropicExtractionProvider (direct Anthropic
 *     API - still fully supported, e.g. for a deployment that hasn't
 *     adopted the Gateway). Recorded as provider="anthropic".
 *  3. Neither set, but running on Vercel -> throws
 *     MissingExtractionCredentialError. NEVER a silent synthetic fallback.
 *  4. Neither set, not on Vercel (local dev/test) -> SyntheticExtractionProvider.
 */

import { AnthropicExtractionProvider, DEFAULT_EXTRACTION_MODEL, PROMPT_VERSION, SCHEMA_VERSION } from "./anthropic-provider";
import { VercelAIGatewayExtractionProvider, DEFAULT_GATEWAY_EXTRACTION_MODEL } from "./vercel-ai-gateway-provider";
import { SyntheticExtractionProvider } from "./synthetic-provider";
import type { ContractExtractionProvider } from "./provider";

export interface ExtractionProviderChoice {
  provider: ContractExtractionProvider;
  providerName: string;
  model: string;
  promptVersion: string;
  schemaVersion: string;
}

/**
 * Thrown by getExtractionProvider() when running on Vercel without any
 * usable LLM credential (neither AI_GATEWAY_API_KEY nor ANTHROPIC_API_KEY).
 * See this file's own header comment for why this fails loudly rather than
 * silently falling back to SyntheticExtractionProvider.
 */
export class MissingExtractionCredentialError extends Error {
  constructor() {
    super(
      "Neither AI_GATEWAY_API_KEY nor ANTHROPIC_API_KEY is set in this Vercel deployment, so live document extraction has no real LLM credential to use. This deployment would otherwise silently fall back to SyntheticExtractionProvider - a deterministic, regex-based fixture never intended for production use. Set AI_GATEWAY_API_KEY (recommended - routes through Vercel AI Gateway) or ANTHROPIC_API_KEY (direct Anthropic API) in the Vercel dashboard: Project -> Settings -> Environment Variables, then redeploy."
    );
  }
}

export function getExtractionProvider(): ExtractionProviderChoice {
  if (process.env.AI_GATEWAY_API_KEY) {
    const model = process.env.EXTRACTION_MODEL ?? DEFAULT_GATEWAY_EXTRACTION_MODEL;
    return { provider: new VercelAIGatewayExtractionProvider({ model }), providerName: "VERCEL_AI_GATEWAY", model, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const model = process.env.EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL;
    return { provider: new AnthropicExtractionProvider({ model }), providerName: "anthropic", model, promptVersion: PROMPT_VERSION, schemaVersion: SCHEMA_VERSION };
  }
  if (process.env.VERCEL) {
    throw new MissingExtractionCredentialError();
  }
  return { provider: new SyntheticExtractionProvider(), providerName: "synthetic", model: "synthetic-v1", promptVersion: "synthetic", schemaVersion: SCHEMA_VERSION };
}
