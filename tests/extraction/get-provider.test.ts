/**
 * getExtractionProvider() - explicit production provider selection
 * (docs/vercel-ai-gateway-extraction.md, docs/autonomous-ingestion-production-readiness.md).
 * Mirrors tests/document-storage/factory.test.ts's own coverage of the
 * identical fail-loud pattern lib/document-storage/index.ts already
 * established for BLOB_READ_WRITE_TOKEN.
 */
import { afterEach, describe, expect, it } from "vitest";
import { getExtractionProvider, MissingExtractionCredentialError } from "../../lib/extraction/get-provider";
import { AnthropicExtractionProvider } from "../../lib/extraction/anthropic-provider";
import { VercelAIGatewayExtractionProvider } from "../../lib/extraction/vercel-ai-gateway-provider";
import { SyntheticExtractionProvider } from "../../lib/extraction/synthetic-provider";

const ORIGINAL_GATEWAY_KEY = process.env.AI_GATEWAY_API_KEY;
const ORIGINAL_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_VERCEL = process.env.VERCEL;
const ORIGINAL_MODEL = process.env.EXTRACTION_MODEL;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  restore("AI_GATEWAY_API_KEY", ORIGINAL_GATEWAY_KEY);
  restore("ANTHROPIC_API_KEY", ORIGINAL_ANTHROPIC_KEY);
  restore("VERCEL", ORIGINAL_VERCEL);
  restore("EXTRACTION_MODEL", ORIGINAL_MODEL);
});

describe("getExtractionProvider - synthetic fallback (local dev/test only)", () => {
  it("returns SyntheticExtractionProvider when no credential is set and not running on Vercel", () => {
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.VERCEL;
    const { provider, providerName, promptVersion } = getExtractionProvider();
    expect(provider).toBeInstanceOf(SyntheticExtractionProvider);
    expect(providerName).toBe("synthetic");
    expect(promptVersion).toBeDefined();
  });
});

describe("getExtractionProvider - Vercel AI Gateway provider selection", () => {
  it("returns VercelAIGatewayExtractionProvider when AI_GATEWAY_API_KEY is set", () => {
    delete process.env.VERCEL;
    delete process.env.ANTHROPIC_API_KEY;
    process.env.AI_GATEWAY_API_KEY = "gw-test-key";
    const { provider, providerName, model } = getExtractionProvider();
    expect(provider).toBeInstanceOf(VercelAIGatewayExtractionProvider);
    expect(providerName).toBe("VERCEL_AI_GATEWAY");
    expect(model).toBe("anthropic/claude-opus-5"); // sensible production default, provider-prefixed per Vercel's own model-id convention
  });

  it("returns VercelAIGatewayExtractionProvider when BOTH VERCEL and AI_GATEWAY_API_KEY are set (the real production case)", () => {
    process.env.VERCEL = "1";
    process.env.AI_GATEWAY_API_KEY = "gw-test-key";
    delete process.env.ANTHROPIC_API_KEY;
    const { provider, providerName } = getExtractionProvider();
    expect(provider).toBeInstanceOf(VercelAIGatewayExtractionProvider);
    expect(providerName).toBe("VERCEL_AI_GATEWAY");
  });

  it("prefers AI_GATEWAY_API_KEY over ANTHROPIC_API_KEY when both are set", () => {
    process.env.AI_GATEWAY_API_KEY = "gw-test-key";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { provider, providerName } = getExtractionProvider();
    expect(provider).toBeInstanceOf(VercelAIGatewayExtractionProvider);
    expect(providerName).toBe("VERCEL_AI_GATEWAY");
  });

  it("respects EXTRACTION_MODEL for the Gateway path", () => {
    delete process.env.VERCEL;
    process.env.AI_GATEWAY_API_KEY = "gw-test-key";
    process.env.EXTRACTION_MODEL = "anthropic/claude-sonnet-5";
    const { model } = getExtractionProvider();
    expect(model).toBe("anthropic/claude-sonnet-5");
  });

  it("records the ExtractionRun-facing provider/model/prompt/schema metadata for the Gateway path", () => {
    delete process.env.VERCEL;
    process.env.AI_GATEWAY_API_KEY = "gw-test-key";
    delete process.env.ANTHROPIC_API_KEY;
    const choice = getExtractionProvider();
    expect(choice).toMatchObject({ providerName: "VERCEL_AI_GATEWAY", model: "anthropic/claude-opus-5" });
    expect(choice.promptVersion).toBeTruthy();
    expect(choice.schemaVersion).toBeTruthy();
    // Never a credential in the metadata that would be persisted to ExtractionRun.
    expect(JSON.stringify({ providerName: choice.providerName, model: choice.model, promptVersion: choice.promptVersion, schemaVersion: choice.schemaVersion })).not.toContain("gw-test-key");
  });
});

describe("getExtractionProvider - direct Anthropic API remains an optional supported provider", () => {
  it("returns AnthropicExtractionProvider when ANTHROPIC_API_KEY is set and AI_GATEWAY_API_KEY is not", () => {
    delete process.env.VERCEL;
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    const { provider, providerName } = getExtractionProvider();
    expect(provider).toBeInstanceOf(AnthropicExtractionProvider);
    expect(providerName).toBe("anthropic");
  });
});

describe("getExtractionProvider - fail-loud production selection (never a silent synthetic fallback)", () => {
  it("throws MissingExtractionCredentialError when VERCEL is set but neither credential is - NEVER falls back to SyntheticExtractionProvider", () => {
    process.env.VERCEL = "1";
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => getExtractionProvider()).toThrow(MissingExtractionCredentialError);
    expect(() => getExtractionProvider()).toThrow(/AI_GATEWAY_API_KEY|ANTHROPIC_API_KEY/);
  });

  it("the thrown error never mentions a credential value (only env var names)", () => {
    process.env.VERCEL = "1";
    process.env.AI_GATEWAY_API_KEY = ""; // present but empty - falsy, same as unset
    delete process.env.ANTHROPIC_API_KEY;
    try {
      getExtractionProvider();
      throw new Error("expected getExtractionProvider() to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MissingExtractionCredentialError);
    }
  });
});
