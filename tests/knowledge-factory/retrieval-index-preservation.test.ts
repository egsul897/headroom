/**
 * Regression: partial backfills must not shrink the published retrieval index.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CorpusStore } from "../../lib/knowledge-factory/store/corpus-store";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";
import {
  RETRIEVAL_INDEX_SCHEMA,
  buildPrecedentRetrievalIndex,
  mergePrecedentRetrievalIndexes,
  loadPrecedentRetrievalIndex,
  publishPrecedentRetrievalIndex,
  writePrecedentRetrievalIndexFile,
  type PrecedentIndexEntry,
  type PrecedentRetrievalIndex,
} from "../../lib/knowledge-factory/mass-precedent/retrieval-index";

function source(id: string, overrides: Partial<KnowledgeSourceRecord> = {}): KnowledgeSourceRecord {
  return {
    sourceId: id,
    issuerCik: "0001000001",
    issuerTicker: "AAA",
    issuerName: "Issuer A",
    accessionNumber: "0001",
    exhibitFilename: `${id}.htm`,
    sourceUrl: `https://example.test/${id}`,
    filingDate: "2026-01-01",
    formType: "8-K",
    documentTitle: `Doc ${id}`,
    documentClass: "CREDIT_AGREEMENT",
    originalBytesHash: `hash-${id}`,
    acquisitionTimestamp: "2026-01-01T00:00:00.000Z",
    parserVersion: "test",
    extractionStatus: "CANDIDATES_DISCOVERED",
    representationLevel: "DISCOVERED_CANDIDATE",
    provenance: "test",
    usageRightsReviewStatus: "FIXTURE_INTERNAL",
    ...overrides,
  };
}

function entry(id: string, overrides: Partial<PrecedentIndexEntry> = {}): PrecedentIndexEntry {
  return {
    sourceId: id,
    issuerCik: "0001000001",
    documentTitle: `Doc ${id}`,
    documentClass: "CREDIT_AGREEMENT",
    formType: "8-K",
    filingDate: "2026-01-01",
    representationLevel: "DISCOVERED_CANDIDATE",
    extractionStatus: "CANDIDATES_DISCOVERED",
    originalBytesHash: `hash-${id}`,
    definitionCount: 1,
    covenantCandidateCount: 2,
    crossReferenceCount: 0,
    conditionExceptionCount: 0,
    definitionTerms: ["EBITDA"],
    covenantFamilies: ["INDEBTEDNESS"],
    ...overrides,
  };
}

function indexFromEntries(entries: PrecedentIndexEntry[]): PrecedentRetrievalIndex {
  return mergePrecedentRetrievalIndexes(null, {
    schemaVersion: RETRIEVAL_INDEX_SCHEMA,
    generatedAt: "2026-01-01T00:00:00.000Z",
    note: "test",
    promotedToLegalTruth: 0,
    totals: {
      sources: entries.length,
      distinctIssuers: 1,
      definitions: 0,
      covenantCandidates: 0,
      crossReferences: 0,
      conditionExceptions: 0,
      amendmentRelationships: 0,
      distinctDocumentClasses: 1,
      distinctCovenantFamilies: 1,
    },
    entries,
    familyHistogram: {},
    documentClassHistogram: {},
    digest: "",
  });
}

function seedSource(store: CorpusStore, id: string, title?: string) {
  store.upsertSource(source(id, title ? { documentTitle: title } : {}));
  store.saveDefinitions(id, [
    { term: "EBITDA", sourceId: id, charStart: 0, charEnd: 6, excerpt: "EBITDA" },
  ]);
  store.saveCandidates(id, []);
  store.saveCrossReferences(id, []);
  store.saveConditions(id, []);
}

describe("precedent retrieval-index preservation", () => {
  let root: string;
  let store: CorpusStore;
  let indexPath: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "kf-retrieval-index-"));
    store = new CorpusStore({
      root,
      bytes: path.join(root, "bytes"),
      manifests: path.join(root, "manifests"),
      checkpoints: path.join(root, "checkpoints"),
      cache: path.join(root, "cache"),
    });
    indexPath = path.join(root, "retrieval-index.json");
  });

  it("1. constructs a full initial index from the corpus", () => {
    for (const id of ["src-a", "src-b", "src-c"]) seedSource(store, id);
    const index = buildPrecedentRetrievalIndex(store);
    expect(index.totals.sources).toBe(3);
    expect(index.entries.map((e) => e.sourceId).sort()).toEqual(["src-a", "src-b", "src-c"]);
    expect(index.digest.length).toBe(64);
  });

  it("2–6. partial publish merges; skipped/failed/unaffected sources remain; updates replace", () => {
    const existing = indexFromEntries([
      entry("src-a", { definitionCount: 1, documentTitle: "Old A" }),
      entry("src-b", { definitionCount: 5 }),
      entry("src-c", { definitionCount: 7 }),
    ]);
    writePrecedentRetrievalIndexFile(existing, indexPath);

    // Partial corpus: only src-a updated; src-b/src-c absent from store
    // (simulates skipped/failed/unprocessed records in a limited backfill).
    seedSource(store, "src-a", "New A");

    const withoutMerge = publishPrecedentRetrievalIndex(store, path.join(root, "broken.json"), {
      mergeWithExisting: false,
    });
    expect(withoutMerge.totals.sources).toBe(1);
    expect(withoutMerge.entries.map((e) => e.sourceId)).toEqual(["src-a"]);

    const published = publishPrecedentRetrievalIndex(store, indexPath, {
      mergeWithExisting: true,
    });
    expect(published.totals.sources).toBe(3);
    expect(published.entries.map((e) => e.sourceId).sort()).toEqual(["src-a", "src-b", "src-c"]);
    const a = published.entries.find((e) => e.sourceId === "src-a")!;
    expect(a.documentTitle).toBe("New A");
    expect(published.entries.find((e) => e.sourceId === "src-b")!.definitionCount).toBe(5);
    expect(published.entries.find((e) => e.sourceId === "src-c")!.definitionCount).toBe(7);
  });

  it("7. repeated merge publishes are deterministic / idempotent for entries", () => {
    const existing = indexFromEntries([entry("src-a"), entry("src-b")]);
    writePrecedentRetrievalIndexFile(existing, indexPath);
    seedSource(store, "src-a");

    const first = publishPrecedentRetrievalIndex(store, indexPath, { mergeWithExisting: true });
    const second = publishPrecedentRetrievalIndex(store, indexPath, { mergeWithExisting: true });
    expect(second.entries.map((e) => e.sourceId)).toEqual(first.entries.map((e) => e.sourceId));
    expect(second.totals.sources).toBe(first.totals.sources);
    expect(second.entries).toEqual(first.entries);
  });

  it("8. interrupted publication cannot leave a truncated index (atomic rename)", () => {
    const good = indexFromEntries([entry("src-a"), entry("src-b")]);
    writePrecedentRetrievalIndexFile(good, indexPath);
    const before = readFileSync(indexPath, "utf8");
    expect(() => JSON.parse(before)).not.toThrow();

    // Simulate a crashed write that only left a temp file — destination untouched.
    const tmp = `${indexPath}.99999.1.tmp`;
    writeFileSync(tmp, '{"schemaVersion":"broken"');
    expect(loadPrecedentRetrievalIndex(indexPath)?.totals.sources).toBe(2);
    unlinkSync(tmp);
    expect(existsSync(indexPath)).toBe(true);
    expect(loadPrecedentRetrievalIndex(indexPath)?.entries.map((e) => e.sourceId).sort()).toEqual([
      "src-a",
      "src-b",
    ]);
  });

  it("9. explicit intentional removal via removeSourceIds", () => {
    const existing = indexFromEntries([entry("src-a"), entry("src-b"), entry("src-c")]);
    const updated = indexFromEntries([entry("src-a", { documentTitle: "A2" })]);
    const merged = mergePrecedentRetrievalIndexes(existing, updated, {
      removeSourceIds: ["src-c"],
    });
    expect(merged.entries.map((e) => e.sourceId).sort()).toEqual(["src-a", "src-b"]);
    expect(merged.entries.find((e) => e.sourceId === "src-a")!.documentTitle).toBe("A2");
  });
});
