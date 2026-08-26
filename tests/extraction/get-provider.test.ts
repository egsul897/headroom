/**
 * getExtractionProvider() - fail-loud production selection
 * (docs/autonomous-ingestion-production-readiness.md). Mirrors
 * tests/document-storage/factory.test.ts's own coverage of the identical
 * fail-loud pattern lib/document-storage/index.ts already established for
 * BLOB_READ_WRITE_TOKEN.
 */
import { afterEach, describe, expect, it } from "vitest";
import { getExtractionProvider, MissingAnthropicApiKeyError } from "../../lib/extraction/get-provider";
import { AnthropicExtractionProvider } from "../../lib/extraction/anthropic-provider";
import { SyntheticExtractionProvider } from "../../lib/extraction/synthetic-provider";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_VERCEL = process.env.VERCEL;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
});

describe("getExtractionProvider", () => {
  it("returns SyntheticExtractionProvider when ANTHROPIC_API_KEY is unset and not running on Vercel", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VERCEL;
    const { provider, providerName } = getExtractionProvider();
    expect(provider).toBeInstanceOf(SyntheticExtractionProvider);
    expect(providerName).toBe("synthetic");
  });

  it("returns AnthropicExtractionProvider when ANTHROPIC_API_KEY is set", () => {
    delete process.env.VERCEL;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { provider, providerName } = getExtractionProvider();
    expect(provider).toBeInstanceOf(AnthropicExtractionProvider);
    expect(providerName).toBe("anthropic");
  });

  it("returns AnthropicExtractionProvider when BOTH VERCEL and ANTHROPIC_API_KEY are set (the real production case)", () => {
    process.env.VERCEL = "1";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { provider, providerName } = getExtractionProvider();
    expect(provider).toBeInstanceOf(AnthropicExtractionProvider);
    expect(providerName).toBe("anthropic");
  });

  it("throws MissingAnthropicApiKeyError - NEVER falls back to SyntheticExtractionProvider - when VERCEL is set but ANTHROPIC_API_KEY is not", () => {
    process.env.VERCEL = "1";
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getExtractionProvider()).toThrow(MissingAnthropicApiKeyError);
    expect(() => getExtractionProvider()).toThrow(/ANTHROPIC_API_KEY is not set/);
  });

  it("respects EXTRACTION_MODEL when set", () => {
    delete process.env.VERCEL;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    process.env.EXTRACTION_MODEL = "claude-sonnet-5";
    try {
      const { model } = getExtractionProvider();
      expect(model).toBe("claude-sonnet-5");
    } finally {
      delete process.env.EXTRACTION_MODEL;
    }
  });
});
