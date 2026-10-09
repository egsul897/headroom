/**
 * Phase 2 queue / resume / EHB loader acceptance (soft gate).
 * IMPLEMENTED ≠ CERTIFIED. Zero paid calls.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadEhbSourceDocuments } from "../../lib/cursor-cloud-compute/phase2/ehb-manifest-loader";
import {
  createProcessingQueue,
  detectContentChangeAndInvalidate,
  loadProcessingQueue,
  nextPendingItem,
  saveProcessingQueue,
} from "../../lib/cursor-cloud-compute/phase2/processing-queue";
import type { SourceDocumentRef } from "../../lib/cursor-cloud-compute/phase2/types";

function sampleDoc(id: string): SourceDocumentRef {
  return {
    sourceDocumentId: id,
    cik: "0000000001",
    accessionNumber: "0000000001-26-000001",
    filingDate: "2026-01-01",
    form: "8-K",
    exhibitType: "EX-10.1",
    filename: "ex10-1.htm",
    description: "Credit Agreement",
    documentKind: "CREDIT_AGREEMENT",
    sourceUri: "https://www.sec.gov/Archives/edgar/data/1/000000000126000001/ex10-1.htm",
    agreementIdentityKey: `key-${id}`,
    relevanceScore: 80,
    ehbRunDir: "/tmp/fake-ehb",
  };
}

describe("phase2 processing queue resume", () => {
  it("persists queue state and resumes without duplicating completed identities", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cca-phase2-q-"));
    const q = createProcessingQueue({
      jobId: "test-job",
      ehbRunDir: "/tmp/fake-ehb",
      corpusRoot: root,
      documents: [sampleDoc("a"), sampleDoc("b")],
      discoveryMs: 12,
    });
    expect(q.items).toHaveLength(2);
    expect(nextPendingItem(q)?.source.sourceDocumentId).toBe("a");

    q.items[0]!.stages.download = "DONE";
    q.items[0]!.stages.parse = "DONE";
    q.items[0]!.stages.dedupe = "DONE";
    q.items[0]!.stages.structure = "DONE";
    q.items[0]!.stages.definitions = "DONE";
    q.items[0]!.stages.references = "DONE";
    q.items[0]!.stages.passA = "DONE";
    q.items[0]!.stages.storage = "DONE";
    q.items[0]!.contentHash = "abc";
    q.items[0]!.result = {
      sourceDocumentId: "a",
      status: "OK",
      error: null,
      errorClass: null,
      contentHash: "abc",
      byteLength: 10,
      charCount: 10,
      contentType: "text/html",
      fromCache: false,
      wasDuplicate: false,
      duplicateOf: null,
      chunkCount: 1,
      nodeCount: 1,
      definitionCount: 0,
      referenceCount: 0,
      resolvedReferenceCount: 0,
      passACandidateCount: 0,
      hierarchyDepthMax: 1,
      timingsMs: {
        downloadMs: 1,
        parseMs: 1,
        dedupeMs: 0,
        structureMs: 1,
        definitionsMs: 0,
        referencesMs: 0,
        passAMs: 0,
        storageMs: 0,
        totalProcessingMs: 2,
      },
      peakRssBytes: 1,
      stages: q.items[0]!.stages,
      artifactPath: null,
    };
    saveProcessingQueue(q);

    const reloaded = loadProcessingQueue(root);
    expect(nextPendingItem(reloaded)?.source.sourceDocumentId).toBe("b");
    expect(reloaded.items[0]!.contentHash).toBe("abc");
  });

  it("content-hash change invalidates downstream stages only", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "cca-phase2-inv-"));
    const q = createProcessingQueue({
      jobId: "test-job-2",
      ehbRunDir: "/tmp/fake-ehb",
      corpusRoot: root,
      documents: [sampleDoc("x")],
      discoveryMs: 0,
    });
    const item = q.items[0]!;
    item.contentHash = "old";
    for (const s of Object.keys(item.stages) as Array<keyof typeof item.stages>) item.stages[s] = "DONE";
    const changed = detectContentChangeAndInvalidate(item, "new");
    expect(changed).toBe(true);
    expect(item.stages.download).toBe("DONE");
    expect(item.stages.structure).toBe("INVALIDATED");
    expect(item.stages.passA).toBe("INVALIDATED");
  });
});

describe("phase2 EHB manifest loader", () => {
  it("loads financing docs from the seed EHB run when present", () => {
    const seed = path.join(process.cwd(), "data", "edgar-historical-backfill", "cca-phase2-seed");
    if (!fs.existsSync(seed)) return;
    const { documents, stats } = loadEhbSourceDocuments(seed, { limit: 50 });
    expect(stats.selected).toBeGreaterThan(0);
    expect(documents.every((d) => d.sourceUri.includes("/Archives/edgar/"))).toBe(true);
    expect(documents.every((d) => d.cik && d.accessionNumber && d.agreementIdentityKey)).toBe(true);
    const ids = new Set(documents.map((d) => `${d.agreementIdentityKey}::${d.sourceUri}`));
    expect(ids.size).toBe(documents.length);
  });
});
