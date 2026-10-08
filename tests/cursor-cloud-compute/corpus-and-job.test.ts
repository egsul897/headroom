/**
 * Cursor Cloud compute assessment — unit acceptance (soft gate).
 * IMPLEMENTED ≠ CERTIFIED. Zero paid API / GPU calls.
 */
import { describe, expect, it } from "vitest";
import {
  buildDeterministicCorpus,
  COMPUTE_ASSESSMENT_STATUS,
  getDefaultGpuWorkerClient,
  materializeVariant,
  processDocumentDeterministic,
  runDeterministicIngestCompileJob,
  UnprovisionedGpuWorkerClient,
} from "../../lib/cursor-cloud-compute";

describe("cursor-cloud-compute corpus", () => {
  it("builds exactly N documents with intentional duplicates every 10", () => {
    const corpus = buildDeterministicCorpus({ size: 20 });
    expect(corpus).toHaveLength(20);
    const dupes = corpus.filter((d) => d.intentionalDuplicateOf);
    expect(dupes.length).toBe(1); // indices 10 only for size 20 with duplicateEvery=10
    expect(dupes[0]!.intentionalDuplicateOf).toBe("bench-doc-000");
    expect(dupes[0]!.bytes.equals(corpus[0]!.bytes)).toBe(true);
  });

  it("materializeVariant is deterministic and preserves SECTION markers", () => {
    const seed = "ARTICLE VI\n\nSECTION 6.01 Indebtedness. The Borrower shall not incur Indebtedness.\n";
    const a = materializeVariant(seed, 3, "seed-x", "text/plain");
    const b = materializeVariant(seed, 3, "seed-x", "text/plain");
    expect(a).toBe(b);
    expect(a).toMatch(/SECTION 6\.01/);
    expect(a).toContain("HEADROOM_BENCH_BORROWER_003");
  });
});

describe("cursor-cloud-compute deterministic job", () => {
  it("processes a small corpus with content-hash dedup and structural compile", async () => {
    const { results, metrics } = await runDeterministicIngestCompileJob({ size: 12 });
    expect(results).toHaveLength(12);
    expect(metrics.failureCount).toBe(0);
    expect(metrics.duplicateDocuments).toBeGreaterThanOrEqual(1);
    expect(metrics.uniqueDocuments).toBe(results.length - metrics.duplicateDocuments);
    expect(metrics.totalNodes).toBeGreaterThan(0);
    expect(metrics.docsPerSecond).toBeGreaterThan(0);

    const uniqueOk = results.filter((r) => r.status === "OK" && !r.wasDuplicate);
    expect(uniqueOk.some((r) => r.nodeCount > 0)).toBe(true);
    expect(uniqueOk.some((r) => r.chunkCount > 0)).toBe(true);
  }, 120_000);

  it("marks byte-identical arrivals as duplicates without re-parsing", async () => {
    const corpus = buildDeterministicCorpus({ size: 2, duplicateEvery: 1 });
    // Force doc1 to be an exact copy of doc0
    corpus[1] = {
      ...corpus[1]!,
      bytes: Buffer.from(corpus[0]!.bytes),
      intentionalDuplicateOf: corpus[0]!.documentId,
      charCount: corpus[0]!.charCount,
    };
    const seen = new Map<string, string>();
    const first = await processDocumentDeterministic(corpus[0]!, seen);
    const second = await processDocumentDeterministic(corpus[1]!, seen);
    expect(first.wasDuplicate).toBe(false);
    expect(second.wasDuplicate).toBe(true);
    expect(second.nodeCount).toBe(0);
    expect(second.contentHash).toBe(first.contentHash);
  });
});

describe("cursor-cloud-compute gpu worker seam", () => {
  it("refuses inference without provisioning", async () => {
    const client = new UnprovisionedGpuWorkerClient();
    const cap = await client.capability();
    expect(cap.available).toBe(false);
    const result = await client.submit({
      jobId: "t1",
      modelHint: "test",
      promptChars: 10,
      maxOutputTokens: 1,
    });
    expect(result.status).toBe("UNAVAILABLE");
    expect(getDefaultGpuWorkerClient()).toBeInstanceOf(UnprovisionedGpuWorkerClient);
  });

  it("assessment status constant never claims certification", () => {
    expect(COMPUTE_ASSESSMENT_STATUS).toBe("COMPUTE_ASSESSMENT_NOT_CERTIFIED");
  });
});
