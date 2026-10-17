/**
 * D12 — structural health must survive the run boundary.
 *
 * extractStructure computes structuralHealthErrors (structural-index
 * ERROR diagnostics) and attaches structuralViolations to nodes, but
 * processAcquiredDocument used to drop the health count: neither
 * ProcessDocumentResult nor the corpus manifest (CorpusManifestStats,
 * written to corpus-stats.json) carried it, so a run report could
 * not disclose that a document's structure failed validation. The
 * only reader was a unit test calling extractStructure directly.
 *
 * These tests pin the wiring: per-document results, the duplicate
 * path, the persisted source record, and the corpus-level manifest
 * all carry the computed values.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CorpusStore } from "../../lib/knowledge-factory/store/corpus-store";
import { finalizeCorpusIndex, processAcquiredDocument } from "../../lib/knowledge-factory/pipeline/run";
import { extractStructure } from "../../lib/knowledge-factory/pipeline/structural";
import { extractTextAsync, hashBytes } from "../../lib/knowledge-factory/pipeline/text";
import type {
  CorpusManifestStats,
  DiscoveredFilingDocument,
  KnowledgeSourceRecord,
  StructuralNodeRecord,
} from "../../lib/knowledge-factory/types";

function discovered(sourceId: string, title: string): DiscoveredFilingDocument {
  return {
    sourceId,
    filing: {
      accessionNumber: "0000000000-00-000001",
      formType: "8-K",
      filingDate: "2024-01-01",
      issuer: { cik: "0000123456", ticker: "TEST" },
    },
    exhibit: {
      filename: "ex101.htm",
      description: title,
      exhibitType: "EX-10.1",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/123456/000/ex101.htm",
    },
    discoverySignals: ["test"],
  };
}

const SAMPLE = `
  ARTICLE VI NEGATIVE COVENANTS
  Section 6.01 Indebtedness. The Borrower shall not incur Indebtedness except as permitted.
  Section 6.02 Liens. provided that no Default has occurred.
  "EBITDA" means Consolidated Net Income plus interest.
`;

function violationNodeCount(nodes: StructuralNodeRecord[]): number {
  return nodes.filter((n) => (n.structuralViolations?.length ?? 0) > 0).length;
}

describe("D12 structural-health wiring", () => {
  let store: CorpusStore;

  beforeEach(() => {
    const root = mkdtempSync(path.join(tmpdir(), "kf-health-"));
    store = new CorpusStore({
      root,
      bytes: path.join(root, "bytes"),
      manifests: path.join(root, "manifests"),
      checkpoints: path.join(root, "checkpoints"),
      cache: path.join(root, "cache"),
    });
  });

  it("processAcquiredDocument surfaces the health extractStructure computed, and persists it", async () => {
    const bytes = Buffer.from(SAMPLE, "utf8");
    const contentHash = hashBytes(bytes);
    // The pipeline parses the extracted text — compute the
    // expectation on exactly that text.
    const { text } = await extractTextAsync(bytes, "ex101.htm");
    const expected = extractStructure("edgar:acc:ex101.htm", text);

    const result = await processAcquiredDocument(store, {
      discovered: discovered("edgar:acc:ex101.htm", "Credit Agreement"),
      bytes,
      contentHash,
      provenance: "sec-edgar",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });

    // Pass-through of the computed values, not constants.
    expect(result.structuralHealthErrors).toBe(expected.structuralHealthErrors);
    expect(result.structuralViolationNodes).toBe(violationNodeCount(expected.nodes));
    // Persisted on the source record so the manifest and the
    // duplicate path can surface it later.
    expect(result.source.structuralHealthErrors).toBe(expected.structuralHealthErrors);
    expect(store.getSource("edgar:acc:ex101.htm")?.structuralHealthErrors).toBe(expected.structuralHealthErrors);
  });

  it("duplicate processing reports the persisted health values", async () => {
    const bytes = Buffer.from(SAMPLE, "utf8");
    const contentHash = hashBytes(bytes);

    const first = await processAcquiredDocument(store, {
      discovered: discovered("edgar:acc:ex101.htm", "Credit Agreement"),
      bytes,
      contentHash,
      provenance: "sec-edgar",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });
    const second = await processAcquiredDocument(store, {
      discovered: discovered("edgar:acc2:ex101.htm", "Credit Agreement (duplicate)"),
      bytes,
      contentHash,
      provenance: "sec-edgar",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
    });

    expect(second.wasDuplicate).toBe(true);
    expect(second.structuralHealthErrors).toBe(first.structuralHealthErrors);
    expect(second.structuralViolationNodes).toBe(first.structuralViolationNodes);
  });

  it("finalizeCorpusIndex aggregates structural health into the corpus manifest", () => {
    const base: KnowledgeSourceRecord = {
      sourceId: "seed:a",
      issuerCik: "0000123456",
      accessionNumber: "0000000000-00-000001",
      exhibitFilename: "ex101.htm",
      sourceUrl: "https://www.sec.gov/Archives/edgar/data/123456/000/ex101.htm",
      filingDate: "2024-01-01",
      formType: "8-K",
      documentTitle: "Credit Agreement",
      documentClass: "CREDIT_AGREEMENT",
      originalBytesHash: "hash-a",
      acquisitionTimestamp: "2024-01-01T00:00:00.000Z",
      parserVersion: "test",
      extractionStatus: "CANDIDATES_DISCOVERED",
      representationLevel: "DISCOVERED_CANDIDATE",
      provenance: "sec-edgar",
      usageRightsReviewStatus: "PUBLIC_SEC_EDGAR",
      structuralHealthErrors: 3,
    };
    store.upsertSource(base);
    store.upsertSource({ ...base, sourceId: "seed:b", accessionNumber: "0000000000-00-000002", originalBytesHash: "hash-b", structuralHealthErrors: 2 });

    const node = (sourceId: string, nodeId: string, violations?: string[]): StructuralNodeRecord => ({
      nodeId,
      sourceId,
      nodeType: "SECTION",
      sectionRef: "6.01",
      heading: "Section 6.01",
      charStart: 0,
      charEnd: 10,
      ...(violations ? { structuralViolations: violations } : {}),
    });
    store.saveStructuralNodes("seed:a", [
      node("seed:a", "a-1", ["PARENT_CONTAINMENT"]),
      node("seed:a", "a-2", ["REF_CONSISTENCY", "ACYCLIC"]),
      node("seed:a", "a-3"),
    ]);
    store.saveStructuralNodes("seed:b", [node("seed:b", "b-1", ["PARENT_EXISTS"]), node("seed:b", "b-2")]);

    const stats = finalizeCorpusIndex(store);
    expect(stats.structuralHealthErrors).toBe(5);
    expect(stats.structuralViolationNodes).toBe(3);

    // The manifest is also the on-disk run report.
    const onDisk = store.readJson<CorpusManifestStats>("corpus-stats.json");
    expect(onDisk?.structuralHealthErrors).toBe(5);
    expect(onDisk?.structuralViolationNodes).toBe(3);
  });

  it("an empty corpus reports zero structural health", () => {
    const stats = finalizeCorpusIndex(store);
    expect(stats.structuralHealthErrors).toBe(0);
    expect(stats.structuralViolationNodes).toBe(0);
  });
});
