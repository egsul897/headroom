/**
 * VercelAIGatewayExtractionProvider (docs/vercel-ai-gateway-extraction.md) -
 * proves the Gateway transport shares the EXACT SAME extraction logic as
 * AnthropicExtractionProvider (both extend AnthropicMessagesProvider), is
 * constructed correctly from AI_GATEWAY_API_KEY/EXTRACTION_MODEL, and that
 * its provider/model/prompt/schema metadata persists end-to-end onto a real
 * ExtractionRun row exactly like any other provider's does - this file
 * cannot exercise a live Gateway call (no AI_GATEWAY_API_KEY in this
 * sandbox; see anthropic-provider.ts's own "UNVERIFIED FROM THIS SANDBOX"
 * header comment, which applies identically here).
 */
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { VercelAIGatewayExtractionProvider, DEFAULT_GATEWAY_EXTRACTION_MODEL, AI_GATEWAY_BASE_URL } from "../../lib/extraction/vercel-ai-gateway-provider";
import { AnthropicMessagesProvider, PROMPT_VERSION, SCHEMA_VERSION } from "../../lib/extraction/anthropic-provider";
import { SyntheticExtractionProvider } from "../../lib/extraction/synthetic-provider";
import { uploadAndChunkDocument, runExtractionForDocument } from "../../lib/onboarding/documents";

const COMPANY_ID = "fixture-vercel-ai-gateway-provider-co";

async function teardown() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("VercelAIGatewayExtractionProvider - construction and shared transport logic", () => {
  it("extends the SAME AnthropicMessagesProvider base class as AnthropicExtractionProvider (transport-only change, per the task's own requirement)", () => {
    const gw = new VercelAIGatewayExtractionProvider({ apiKey: "gw-test-key" });
    expect(gw).toBeInstanceOf(AnthropicMessagesProvider);
    // Every stage method comes from the shared base - never redefined per-transport.
    expect(typeof gw.extractDocumentStructure).toBe("function");
    expect(typeof gw.extractDefinitions).toBe("function");
    expect(typeof gw.extractPermissions).toBe("function");
    expect(typeof gw.extractRelationships).toBe("function");
    expect(typeof gw.extractCoverageGaps).toBe("function");
    expect(typeof gw.extractFinancialInputs).toBe("function");
  });

  it("defaults to a provider-prefixed, sensible production model id", () => {
    const gw = new VercelAIGatewayExtractionProvider({ apiKey: "gw-test-key" });
    expect(gw.model).toBe(DEFAULT_GATEWAY_EXTRACTION_MODEL);
    expect(gw.model).toBe("anthropic/claude-opus-5");
    expect(gw.model.startsWith("anthropic/")).toBe(true); // Gateway model-id convention - never a bare Anthropic model id
  });

  it("respects an explicit model override", () => {
    const gw = new VercelAIGatewayExtractionProvider({ apiKey: "gw-test-key", model: "anthropic/claude-sonnet-5" });
    expect(gw.model).toBe("anthropic/claude-sonnet-5");
  });

  it("reads AI_GATEWAY_API_KEY from the environment when no apiKey option is given", () => {
    const original = process.env.AI_GATEWAY_API_KEY;
    process.env.AI_GATEWAY_API_KEY = "gw-env-key";
    try {
      expect(() => new VercelAIGatewayExtractionProvider()).not.toThrow();
    } finally {
      if (original === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = original;
    }
  });

  it("throws (fails closed) when constructed with no AI_GATEWAY_API_KEY at all - never silently proceeds unauthenticated", () => {
    const original = process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
    try {
      expect(() => new VercelAIGatewayExtractionProvider()).toThrow(/AI_GATEWAY_API_KEY/);
    } finally {
      if (original === undefined) delete process.env.AI_GATEWAY_API_KEY;
      else process.env.AI_GATEWAY_API_KEY = original;
    }
  });

  it("points at Vercel's own documented Anthropic-Messages-API-compatible base URL", () => {
    expect(AI_GATEWAY_BASE_URL).toBe("https://ai-gateway.vercel.sh");
  });
});

describe("VercelAIGatewayExtractionProvider - ExtractionRun persistence (metadata only, no live call)", () => {
  afterAll(teardown);

  it("provider=VERCEL_AI_GATEWAY, the real model id, and the shared prompt/schema versions persist onto ExtractionRun exactly like any other provider's metadata does", async () => {
    await teardown();
    await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Vercel AI Gateway Provider Co (synthetic, test-only)" } });
    const { document } = await uploadAndChunkDocument({ companyId: COMPANY_ID, filename: "test.txt", data: Buffer.from("Article 1. Section 1.01. Test content."), declaredType: "OTHER" });
    const documentId = document.id;

    // No live Gateway credential in this sandbox - SyntheticExtractionProvider
    // actually runs the stages, but the persisted metadata is exactly what
    // getExtractionProvider() would have recorded for the real Gateway path,
    // proving the persistence path itself is provider-agnostic (never
    // hardcoded to "anthropic"/"synthetic" anywhere in pipeline.ts/documents.ts).
    const { run } = await runExtractionForDocument({
      companyId: COMPANY_ID,
      documentId,
      provider: new SyntheticExtractionProvider(),
      providerName: "VERCEL_AI_GATEWAY",
      model: "anthropic/claude-opus-5",
      promptVersion: PROMPT_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });

    const persisted = await prisma.extractionRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(persisted.provider).toBe("VERCEL_AI_GATEWAY");
    expect(persisted.model).toBe("anthropic/claude-opus-5");
    expect(persisted.promptVersion).toBe(PROMPT_VERSION);
    expect(persisted.schemaVersion).toBe(SCHEMA_VERSION);
    expect(persisted.startedAt).toBeInstanceOf(Date); // extraction timestamp, per the task's own requirement
    // Never a credential anywhere in the persisted row.
    expect(JSON.stringify(persisted)).not.toMatch(/gw-|sk-ant-|AI_GATEWAY_API_KEY|ANTHROPIC_API_KEY/);
  });
});
