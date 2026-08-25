/**
 * Extraction-provider factory (docs/company-onboarding-v1-implementation.md).
 *
 * Mirrors lib/document-storage/index.ts's `getDocumentStorageProvider()` -
 * the SAME "one factory, branch on environment once" pattern, so the
 * onboarding wizard's Extraction stage never has to decide for itself which
 * ContractExtractionProvider to use. `AnthropicExtractionProvider` remains
 * unverified end-to-end from this sandbox (no ANTHROPIC_API_KEY available -
 * see docs/document-onboarding-pipeline-foundation.md §F); this factory
 * still wires it in for a real deployment with real credentials, exactly
 * like the storage factory does for BLOB_READ_WRITE_TOKEN.
 */

import { AnthropicExtractionProvider } from "./anthropic-provider";
import { SyntheticExtractionProvider } from "./synthetic-provider";
import type { ContractExtractionProvider } from "./provider";

export interface ExtractionProviderChoice {
  provider: ContractExtractionProvider;
  providerName: string;
  model: string;
}

export function getExtractionProvider(): ExtractionProviderChoice {
  if (process.env.ANTHROPIC_API_KEY) {
    const model = process.env.EXTRACTION_MODEL ?? "claude-opus-5";
    return { provider: new AnthropicExtractionProvider({ model }), providerName: "anthropic", model };
  }
  return { provider: new SyntheticExtractionProvider(), providerName: "synthetic", model: "synthetic-v1" };
}
