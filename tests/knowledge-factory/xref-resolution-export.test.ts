import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CorpusStore } from "../../lib/knowledge-factory/store/corpus-store";
import { ingestFixtureDocument } from "../../lib/knowledge-factory/pipeline/run";
import { buildCanonicalConsumerExport } from "../../lib/knowledge-factory/export/build-canonical-export";
import {
  CONSUMER_EXPORT_SAFETY,
  CONSUMER_EXPORT_SCHEMA_VERSION,
  consumerContractIdentity,
} from "../../lib/knowledge-factory/export/consumer-contract";
import {
  DEPENDENCY_ATLAS_ADAPTER_VERSION,
  DependencyAtlasImportStore,
  runDependencyAtlasImport,
} from "../../lib/knowledge-factory/consumers/dependency-atlas-import";
import type { KnowledgeSourceRecord } from "../../lib/knowledge-factory/types";

const SOURCE_ID = "fixture:xref-v2-doc";

function makeStore(): CorpusStore {
  const root = mkdtempSync(path.join(tmpdir(), "kf-xref-v2-"));
  return new CorpusStore({
    root,
    bytes: path.join(root, "bytes"),
    manifests: path.join(root, "manifests"),
    checkpoints: path.join(root, "checkpoints"),
    cache: path.join(root, "cache"),
  });
}

function seedSource(store: CorpusStore): void {
  const source: KnowledgeSourceRecord = {
    sourceId: SOURCE_ID,
    issuerCik: "0001000001",
    issuerTicker: "XREF",
    issuerName: "Xref Test Co",
    accessionNumber: "0001",
    exhibitFilename: "xref-v2-doc.htm",
    sourceUrl: "https://example.test/xref-v2-doc",
    filingDate: "2026-01-01",
    formType: "8-K",
    documentTitle: "Credit Agreement",
    documentClass: "CREDIT_AGREEMENT",
    originalBytesHash: "hash-xref-v2-doc",
    acquisitionTimestamp: "2026-01-01T00:00:00.000Z",
    parserVersion: "test",
    extractionStatus: "CANDIDATES_DISCOVERED",
    representationLevel: "DISCOVERED_CANDIDATE",
    provenance: "fixture:xref-v2",
    usageRightsReviewStatus: "FIXTURE_INTERNAL",
  };
  store.upsertSource(source);
  store.saveStructuralNodes(SOURCE_ID, [
    {
      nodeId: "node-sec-101",
      sourceId: SOURCE_ID,
      nodeType: "SECTION",
      sectionRef: "1.01",
      heading: "Defined Terms",
      charStart: 0,
      charEnd: 100,
    },
    {
      nodeId: "node-sec-701",
      sourceId: SOURCE_ID,
      nodeType: "SECTION",
      sectionRef: "7.01",
      heading: "Indebtedness",
      charStart: 200,
      charEnd: 400,
    },
  ]);
  store.saveDefinitions(SOURCE_ID, []);
  store.saveCandidates(SOURCE_ID, []);
  store.saveConditions(SOURCE_ID, []);
  // Records exactly as pipeline/structural.ts stores them.
  store.saveCrossReferences(SOURCE_ID, [
    {
      sourceId: SOURCE_ID,
      fromNodeId: "node-sec-701",
      rawReference: "Section 1.01",
      charStart: 210,
      charEnd: 222,
      targetSectionRef: "1.01",
      targetNodeId: "node-sec-101",
      resolved: true,
      targetAmbiguous: false,
      unresolvedReason: null,
    },
    {
      sourceId: SOURCE_ID,
      fromNodeId: "node-sec-701",
      rawReference: "Section 5.01",
      charStart: 230,
      charEnd: 242,
      targetSectionRef: "5.01",
      targetNodeId: null,
      resolved: false,
      targetAmbiguous: true,
      unresolvedReason:
        "SECTION ref \"5.01\" matches more than one physical occurrence in this document - ambiguous, not resolved",
    },
    {
      sourceId: SOURCE_ID,
      fromNodeId: "node-sec-701",
      rawReference: "Schedule 2.01",
      charStart: 250,
      charEnd: 263,
      targetSectionRef: "2.01",
      targetNodeId: null,
      resolved: false,
      targetAmbiguous: false,
      unresolvedReason:
        "no SCHEDULE node with ref \"2.01\" exists among this document's own structural nodes",
    },
  ]);
}

describe("consumer export v2 — cross-reference resolution", () => {
  let store: CorpusStore;

  beforeEach(() => {
    store = makeStore();
    seedSource(store);
  });

  it("maps stored records to RESOLVED / AMBIGUOUS / UNRESOLVED with targets and reasons", () => {
    const exportDoc = buildCanonicalConsumerExport(store, { compact: true, durabilityClaim: "NONE" });
    expect(exportDoc.schemaVersion).toBe("knowledge-factory.consumer-export.v2");
    expect(CONSUMER_EXPORT_SCHEMA_VERSION).toBe("knowledge-factory.consumer-export.v2");
    expect(consumerContractIdentity().schemaVersion).toBe("knowledge-factory.consumer-export.v2");
    expect(exportDoc.counts.dependencyEdges).toBe(3);
    expect(exportDoc.dependencyEdges).toHaveLength(3);

    const byRaw = new Map(exportDoc.dependencyEdges.map((e) => [e.rawReference, e]));

    const resolved = byRaw.get("Section 1.01")!;
    expect(resolved.resolution).toBe("RESOLVED");
    expect(resolved.targetNodeId).toBe("node-sec-101");
    expect(resolved.targetSectionRef).toBe("1.01");
    expect(resolved.unresolvedReason).toBeUndefined();
    expect(resolved.legalTruth).toBe(false);

    const ambiguous = byRaw.get("Section 5.01")!;
    expect(ambiguous.resolution).toBe("AMBIGUOUS");
    // Never upgraded: an ambiguous edge carries no target node.
    expect(ambiguous.targetNodeId).toBeUndefined();
    expect(ambiguous.targetSectionRef).toBe("5.01");
    expect(ambiguous.unresolvedReason).toContain("more than one physical occurrence");
    expect(ambiguous.legalTruth).toBe(false);

    const notFound = byRaw.get("Schedule 2.01")!;
    expect(notFound.resolution).toBe("UNRESOLVED");
    expect(notFound.targetNodeId).toBeUndefined();
    expect(notFound.targetSectionRef).toBe("2.01");
    expect(notFound.unresolvedReason).toContain("no SCHEDULE node");
    expect(notFound.legalTruth).toBe(false);
  });

  it("mints no authority or validation fields on any edge; safety block unchanged", () => {
    const exportDoc = buildCanonicalConsumerExport(store, { compact: true, durabilityClaim: "NONE" });
    expect(exportDoc.safety).toEqual(CONSUMER_EXPORT_SAFETY);
    expect(exportDoc.safety.automaticLegalVerification).toBe(false);
    expect(exportDoc.safety.automaticCapacityPromotion).toBe(false);
    expect(exportDoc.safety.certificationChanges).toBe(false);
    for (const e of exportDoc.dependencyEdges) {
      expect(e.legalTruth).toBe(false);
      const keys = Object.keys(e);
      expect(keys).not.toContain("authorityStatus");
      expect(keys).not.toContain("confidence");
      expect(keys).not.toContain("validationStatus");
      expect(keys).not.toContain("verified");
    }
    // Edge slice digest still hashes edge ids (mechanism unchanged).
    expect(exportDoc.sliceDigests.dependencyEdges).toMatch(/^[0-9a-f]{64}$/);
  });

  it("atlas import links RESOLVED edges to real nodes and keeps labels for the rest", () => {
    const exportDoc = buildCanonicalConsumerExport(store, { compact: true, durabilityClaim: "NONE" });
    const atlasStore = new DependencyAtlasImportStore();
    const pass1 = atlasStore.importFromCanonical(exportDoc, 1);
    expect(pass1.ok).toBe(true);
    expect(pass1.adapterVersion).toBe("covenant-dependency-atlas-ckf-import.v2");
    expect(DEPENDENCY_ATLAS_ADAPTER_VERSION).toBe("covenant-dependency-atlas-ckf-import.v2");
    expect(pass1.promotedToLegalTruth).toBe(0);

    const byRaw = new Map(exportDoc.dependencyEdges.map((e) => [e.rawReference, e]));
    const resolvedAtlas = atlasStore.edges.get(byRaw.get("Section 1.01")!.edgeId)!;
    expect(resolvedAtlas.toNodeId).toBe("node-sec-101");
    expect(resolvedAtlas.resolution).toBe("RESOLVED");
    expect(resolvedAtlas.legalTruth).toBe(false);
    // The target is the real exported structural node, not a label.
    expect(atlasStore.nodes.get("node-sec-101")!.kind).toBe("SECTION");
    expect([...atlasStore.nodes.keys()].some((k) => k === `ref:${SOURCE_ID}:Section 1.01`)).toBe(false);

    const ambiguousAtlas = atlasStore.edges.get(byRaw.get("Section 5.01")!.edgeId)!;
    expect(ambiguousAtlas.resolution).toBe("AMBIGUOUS");
    expect(ambiguousAtlas.toNodeId).toBe(`ref:${SOURCE_ID}:Section 5.01`);

    const notFoundAtlas = atlasStore.edges.get(byRaw.get("Schedule 2.01")!.edgeId)!;
    expect(notFoundAtlas.resolution).toBe("UNRESOLVED");
    expect(notFoundAtlas.toNodeId).toBe(`ref:${SOURCE_ID}:Schedule 2.01`);

    // Pass 2 remains idempotent through the shared runner.
    const { pass2 } = runDependencyAtlasImport(exportDoc);
    expect(pass2.idempotent).toBe(true);
    expect(pass2.ok).toBe(true);
  });

  it("adversarial: duplicate sections stay AMBIGUOUS and schedule refs stay UNRESOLVED end-to-end", async () => {
    const e2e = makeStore();
    await ingestFixtureDocument(e2e, {
      sourceId: "fixture:dup",
      issuerCik: "0001000002",
      title: "Duplicate Sections",
      text: `
ARTICLE V COVENANTS
Section 5.01 Reporting.
The Borrower shall deliver reports under Section 5.01.
Section 5.01 Reporting.
This is a second physical occurrence of the same section number.
The covenant in Section 5.01 applies.
`,
    });
    await ingestFixtureDocument(e2e, {
      sourceId: "fixture:sched",
      issuerCik: "0001000003",
      title: "Schedule References",
      text: `
ARTICLE I DEFINITIONS
Section 1.01 Defined Terms.
"Loan" means the loan described in Schedule 2.01 and Exhibit A.
Section 1.02 Other.
Amounts are set forth in Schedule 1.01(a) hereto.
`,
    });
    const exportDoc = buildCanonicalConsumerExport(e2e, { compact: true, durabilityClaim: "NONE" });

    const dupEdges = exportDoc.dependencyEdges.filter((e) => e.rawReference === "Section 5.01");
    expect(dupEdges.length).toBeGreaterThan(0);
    for (const e of dupEdges) {
      expect(e.resolution).toBe("AMBIGUOUS");
      expect(e.targetNodeId).toBeUndefined();
      expect(e.unresolvedReason).toContain("more than one physical occurrence");
      expect(e.legalTruth).toBe(false);
    }

    const schedEdges = exportDoc.dependencyEdges.filter((e) => e.rawReference === "Schedule 2.01");
    expect(schedEdges).toHaveLength(1);
    expect(schedEdges[0]!.resolution).toBe("UNRESOLVED");
    expect(schedEdges[0]!.targetNodeId).toBeUndefined();
    expect(schedEdges[0]!.unresolvedReason).toContain("no SCHEDULE node");
    expect(schedEdges[0]!.legalTruth).toBe(false);

    // Schedule 1.01 must NOT resolve against Section 1.01 (kind guard).
    const sched101 = exportDoc.dependencyEdges.filter((e) => e.rawReference.startsWith("Schedule 1.01"));
    expect(sched101.length).toBeGreaterThan(0);
    for (const e of sched101) {
      expect(e.resolution).toBe("UNRESOLVED");
      expect(e.targetNodeId).toBeUndefined();
    }
  });
});
