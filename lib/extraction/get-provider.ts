/**
 * Extraction-provider factory (docs/company-onboarding-v1-implementation.md,
 * fail-loud production selection per docs/autonomous-ingestion-production-readiness.md).
 *
 * Mirrors lib/document-storage/index.ts's `getDocumentStorageProvider()` -
 * the SAME "one factory, branch on environment once" pattern, so the
 * onboarding wizard's Extraction stage never has to decide for itself which
 * ContractExtractionProvider to use, AND the same fail-loud discipline that
 * factory already established for BLOB_READ_WRITE_TOKEN: on Vercel
 * (`process.env.VERCEL` - Vercel's own standard env var, set on every
 * Production/Preview/`vercel dev` invocation) without ANTHROPIC_API_KEY,
 * this now THROWS instead of silently returning SyntheticExtractionProvider.
 * SyntheticExtractionProvider is a deterministic, regex-based fixture never
 * intended for production use (see its own header comment) - a live user
 * uploading a real credit agreement must never have it silently substituted
 * for the real LLM-based extraction they think they are getting. Local
 * dev/test (`VERCEL` unset) keeps the existing synthetic fallback unchanged,
 * exactly like the storage factory's own local-fs fallback.
 */

import { AnthropicExtractionProvider, DEFAULT_EXTRACTION_MODEL } from "./anthropic-provider";
import { SyntheticExtractionProvider } from "./synthetic-provider";
import type { ContractExtractionProvider } from "./provider";

export interface ExtractionProviderChoice {
  provider: ContractExtractionProvider;
  providerName: string;
  model: string;
}

/**
 * Thrown by getExtractionProvider() when running on Vercel without
 * ANTHROPIC_API_KEY configured. See this file's own header comment for why
 * this fails loudly rather than silently falling back to
 * SyntheticExtractionProvider.
 */
export class MissingAnthropicApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set in this Vercel deployment, so live document extraction cannot use the real AnthropicExtractionProvider. This deployment would otherwise silently fall back to SyntheticExtractionProvider - a deterministic, regex-based fixture never intended for production use. Set ANTHROPIC_API_KEY (and optionally EXTRACTION_MODEL) in the Vercel dashboard: Project -> Settings -> Environment Variables, then redeploy.");
  }
}

export function getExtractionProvider(): ExtractionProviderChoice {
  if (process.env.ANTHROPIC_API_KEY) {
    const model = process.env.EXTRACTION_MODEL ?? DEFAULT_EXTRACTION_MODEL;
    return { provider: new AnthropicExtractionProvider({ model }), providerName: "anthropic", model };
  }
  if (process.env.VERCEL) {
    throw new MissingAnthropicApiKeyError();
  }
  return { provider: new SyntheticExtractionProvider(), providerName: "synthetic", model: "synthetic-v1" };
}
