import { describe, expect, it } from "vitest";
import {
  DURABILITY_BLOCKED_CREDENTIALS,
  DurableCredentialsError,
  requireDurableCredentials,
  persistDurableKnowledgeSource,
  selectDurableByteStore,
} from "../../lib/knowledge-factory/preservation/durable-store";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

describe("durable-store credential gate (Cursor-first Postgres BYTEA)", () => {
  it("blocks when DATABASE_URL and blob token are absent", () => {
    const gate = requireDurableCredentials({});
    expect(gate.ok).toBe(false);
    expect(gate.status).toBe(DURABILITY_BLOCKED_CREDENTIALS);
    expect(gate.missing.join(" ")).toMatch(/DATABASE_URL/);
    expect(gate.probe.durable).toBe(false);
  });

  it("accepts DATABASE_URL alone via Postgres BYTEA byte store", () => {
    const gate = requireDurableCredentials({
      DATABASE_URL: "postgresql://example.invalid/headroom",
    });
    expect(gate.ok).toBe(true);
    expect(gate.status).toBe("DURABLE_CREDENTIALS_PRESENT");
    expect(gate.probe.mode).toBe("POSTGRES_BYTEA_DURABLE");
    expect(gate.probe.durable).toBe(true);
    expect(gate.byteStore).toBe("postgres-bytea");
    expect(selectDurableByteStore({ DATABASE_URL: "postgresql://x" })).toBe("postgres-bytea");
  });

  it("blocks when only blob token is present (registry DB required)", () => {
    const gate = requireDurableCredentials({
      BLOB_READ_WRITE_TOKEN: "vercel_blob_test_token",
    });
    expect(gate.ok).toBe(false);
    expect(gate.status).toBe(DURABILITY_BLOCKED_CREDENTIALS);
    expect(gate.probe.mode).toBe("OBJECT_STORAGE_AVAILABLE");
  });

  it("reports credentials present when DB + blob are set (Blob optional)", () => {
    const gate = requireDurableCredentials({
      DATABASE_URL: "postgresql://example.invalid/headroom",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_test_token",
    });
    expect(gate.ok).toBe(true);
    expect(gate.status).toBe("DURABLE_CREDENTIALS_PRESENT");
    expect(gate.probe.durable).toBe(true);
    // Cursor-first default still prefers Postgres unless KF_BYTE_STORE=vercel-blob
    expect(gate.byteStore).toBe("postgres-bytea");
  });

  it("honors KF_BYTE_STORE=vercel-blob when token present", () => {
    const gate = requireDurableCredentials({
      DATABASE_URL: "postgresql://example.invalid/headroom",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_test_token",
      KF_BYTE_STORE: "vercel-blob",
    });
    expect(gate.ok).toBe(true);
    expect(gate.byteStore).toBe("vercel-blob");
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
