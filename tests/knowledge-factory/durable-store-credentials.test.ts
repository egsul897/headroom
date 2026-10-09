import { describe, expect, it } from "vitest";
import {
  DURABILITY_BLOCKED_CREDENTIALS,
  DurableCredentialsError,
  requireDurableCredentials,
  persistDurableKnowledgeSource,
} from "../../lib/knowledge-factory/preservation/durable-store";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

describe("durable-store credential gate", () => {
  it("blocks when DATABASE_URL and blob token are absent", () => {
    const gate = requireDurableCredentials({});
    expect(gate.ok).toBe(false);
    expect(gate.status).toBe(DURABILITY_BLOCKED_CREDENTIALS);
    expect(gate.missing.join(" ")).toMatch(/DATABASE_URL/);
    expect(gate.missing.join(" ")).toMatch(/BLOB_READ_WRITE_TOKEN/);
    expect(gate.probe.durable).toBe(false);
  });

  it("blocks when only DATABASE_URL is present", () => {
    const gate = requireDurableCredentials({
      DATABASE_URL: "postgresql://example.invalid/headroom",
    });
    expect(gate.ok).toBe(false);
    expect(gate.status).toBe(DURABILITY_BLOCKED_CREDENTIALS);
    expect(gate.probe.mode).toBe("POSTGRES_AVAILABLE");
  });

  it("blocks when only blob token is present", () => {
    const gate = requireDurableCredentials({
      BLOB_READ_WRITE_TOKEN: "vercel_blob_test_token",
    });
    expect(gate.ok).toBe(false);
    expect(gate.status).toBe(DURABILITY_BLOCKED_CREDENTIALS);
    expect(gate.probe.mode).toBe("OBJECT_STORAGE_AVAILABLE");
  });

  it("reports credentials present only when both are set", () => {
    const gate = requireDurableCredentials({
      DATABASE_URL: "postgresql://example.invalid/headroom",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_test_token",
    });
    expect(gate.ok).toBe(true);
    expect(gate.status).toBe("DURABLE_CREDENTIALS_PRESENT");
    expect(gate.probe.durable).toBe(true);
  });

  it("persistDurableKnowledgeSource refuses empty credentials without touching local disk", async () => {
    const source = {
      sourceId: "edgar:test:ex.htm",
      issuerCik: "0000000000",
      accessionNumber: "0000000000-00-000000",
      exhibitFilename: "ex.htm",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/0/000/ex.htm",
      filingDate: "2026-01-01",
      formType: "8-K",
      documentTitle: "Test",
      documentClass: "CREDIT_AGREEMENT",
      originalBytesHash: "a".repeat(64),
      acquisitionTimestamp: new Date().toISOString(),
      parserVersion: "test",
      extractionStatus: "ACQUIRED",
      representationLevel: "SOURCE_ONLY",
      provenance: "sec-edgar",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    } satisfies KnowledgeSourceRecord;

    await expect(
      persistDurableKnowledgeSource({
        source,
        bytes: Buffer.from("not-durable"),
        env: {},
      }),
    ).rejects.toBeInstanceOf(DurableCredentialsError);
  });
});
