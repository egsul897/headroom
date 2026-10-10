/**
 * Agent #7 × Agent #6 — context retrieval must read from governingDocumentId
 * when restatement authority authorizes it, and must NOT silently consolidate
 * when provisional identity blocks governing designation.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocumentStructure } from "@/lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "@/lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "@/lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "@/lib/contract-model/compiler/structural-references";
import { buildPackageGraph } from "@/lib/contract-model/compiler/package-graph/pipeline";
import { buildCovenantContextBundle } from "@/lib/contract-model/compiler/context-retrieval/pipeline";
import {
  bindCandidateToOperativeRetrievalSource,
  buildOperativeAuthorityHandoffBundle,
} from "@/lib/contract-model/compiler/operative-authority";
import type { DiscoveredCandidate } from "@/lib/contract-model/compiler/discovery/types";

const FIXTURE_DIR = path.join(
  process.cwd(),
  "tests/fixtures/unseen-packages/wor-2023-2026-credit-facility",
);

function loadWorDocs() {
  return [
    {
      documentId: "doc-a",
      label: "WOR Fourth AR",
      text: readFileSync(
        path.join(FIXTURE_DIR, "extracted-text", "doc-a-2023-09-27-fourth-ar-credit-agreement.txt"),
        "utf8",
      ),
    },
    {
      documentId: "doc-b",
      label: "WOR Fifth AR",
      text: readFileSync(
        path.join(FIXTURE_DIR, "extracted-text", "doc-b-2026-08-31-fifth-ar-credit-agreement.txt"),
        "utf8",
      ),
    },
  ];
}

function buildIndex(docs: ReturnType<typeof loadWorDocs>) {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions = [];
  const allReferences = [];
  for (const d of docs) {
    const nodes = parseDocumentStructure({ documentId: d.documentId, label: d.label, text: d.text });
    nodesByDocument.set(d.documentId, { text: d.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(d.documentId, d.text, nodes));
    allReferences.push(...detectStructuralReferences(d.documentId, d.text, nodes));
  }
  return buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
}

function syntheticSectionCandidate(documentId: string, sectionRef: string, nodeId: string, nodeKey: string): DiscoveredCandidate {
  return {
    discoveryId: `synthetic:${documentId}:${sectionRef}`,
    documentId,
    structuralNodeKeys: [nodeKey],
    structuralNodeIds: [nodeId],
    normalizedSourceRef: sectionRef,
    families: ["INDEBTEDNESS"],
    role: "BASKET",
    roleRaw: "BASKET",
    roleNormalizationStatus: "VALID_CANONICAL",
    familiesRaw: ["INDEBTEDNESS"],
    familiesNormalizationStatus: "VALID_CANONICAL",
    description: `Synthetic §${sectionRef} candidate on ${documentId}`,
    multipleRulesLikely: false,
    definedTermDependencyLikely: false,
    discoveryMethods: ["DETERMINISTIC_SIGNAL"],
    evidenceSignals: [],
    reviewStatus: "AUTO_ACCEPTED",
    confidence: 0.9,
    sourceCitation: `${documentId}::${sectionRef}`,
    discoveryRunVersion: "test",
    supersessionStatus: "UNKNOWN_SUPERSESSION_STATUS",
    supersessionReason: "synthetic fixture",
  };
}

describe("operative retrieval source binding (Agent #7 → #6)", () => {
  it("remaps Fourth-AR discovery onto Fifth AR when identity may consolidate (caveated, not production)", () => {
    const docs = loadWorDocs();
    const index = buildIndex(docs);
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);
    const authority = buildOperativeAuthorityHandoffBundle({
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      asOfDate: "2026-08-31",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }],
      confirmedInstrumentIdentity: {
        instrumentKey: "instrument:wor-facility",
        confirmedDocumentIds: ["doc-a", "doc-b"],
        provisionalDocumentIds: [],
        mayConsolidateOperative: true,
        associationKind: "CONFIRMED",
      },
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    expect(authority.provisions[0]!.authorityClassification).toBe("CONFIRMED_OPERATIVE_WITH_CAVEATS");
    expect(authority.provisions[0]!.governingDocumentId).toBe("doc-b");

    const fourthNodes = index.findNodesByRef("doc-a", "6.01");
    expect(fourthNodes.length).toBeGreaterThan(0);
    const candidate = syntheticSectionCandidate(
      "doc-a",
      "6.01",
      fourthNodes[0]!.nodeId,
      fourthNodes[0]!.nodeKey,
    );

    const binding = bindCandidateToOperativeRetrievalSource({ candidate, authority, index });
    expect(binding.retrievalAuthorized).toBe(true);
    expect(binding.remapped).toBe(true);
    expect(binding.governingDocumentId).toBe("doc-b");
    expect(binding.retrievalCandidate.documentId).toBe("doc-b");
    expect(binding.retrievalCandidate.structuralNodeIds[0]).not.toBe(candidate.structuralNodeIds[0]);
    expect(binding.refusalReason).toBeNull();

    const exactTermsByDocument = new Map<string, Map<string, string>>();
    for (const def of index.allDefinitions()) {
      if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
      exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
    }
    const bundle = buildCovenantContextBundle(
      {
        candidate: binding.retrievalCandidate,
        packageKey: "wor-2023-2026-credit-facility",
        companyId: "wor-holdout",
        instrumentKey: "instrument:wor-facility",
      },
      { index, packageGraph: graph, exactTermsByDocument },
    );
    expect(bundle.originatingDocumentId).toBe("doc-b");
    const operative = bundle.items.find((i) => i.type === "OPERATIVE_SOURCE");
    expect(operative?.documentId).toBe("doc-b");
    expect(operative?.excerptText.length ?? 0).toBeGreaterThan(40);
  });

  it("refuses remapping when provisional identity blocks governing designation", () => {
    const docs = loadWorDocs();
    const index = buildIndex(docs);
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);
    const authority = buildOperativeAuthorityHandoffBundle({
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      asOfDate: "2026-08-31",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }],
      confirmedInstrumentIdentity: {
        instrumentKey: "instrument:wor-facility",
        confirmedDocumentIds: ["doc-a"],
        provisionalDocumentIds: ["doc-b"],
        mayConsolidateOperative: false,
        associationKind: "PROVISIONAL",
        bridgeBlockers: [
          {
            sourceDocumentId: "doc-b",
            targetDocumentId: "doc-a",
            reason: "RESTATES edge is SUPPORTING_TARGET_EVIDENCE only",
          },
        ],
      },
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    expect(authority.provisions[0]!.authorityClassification).toBe("PROVISIONAL_IDENTITY_BLOCKED");
    expect(authority.provisions[0]!.governingDocumentId).toBeNull();

    const fourthNodes = index.findNodesByRef("doc-a", "6.01");
    const candidate = syntheticSectionCandidate(
      "doc-a",
      "6.01",
      fourthNodes[0]!.nodeId,
      fourthNodes[0]!.nodeKey,
    );
    const binding = bindCandidateToOperativeRetrievalSource({ candidate, authority, index });
    expect(binding.remapped).toBe(false);
    expect(binding.retrievalAuthorized).toBe(false);
    expect(binding.retrievalCandidate.documentId).toBe("doc-a");
    expect(binding.refusalReason).toMatch(/null governingDocumentId|refuse silent/i);
  });

  it("keeps Fourth AR as retrieval source before Fifth AR effectiveness", () => {
    const docs = loadWorDocs();
    const index = buildIndex(docs);
    const graph = buildPackageGraph("wor-holdout", "wor-2023-2026-credit-facility", docs);
    const authority = buildOperativeAuthorityHandoffBundle({
      companyId: "wor-holdout",
      packageKey: "wor-2023-2026-credit-facility",
      asOfDate: "2026-08-30",
      documents: docs,
      packageGraph: graph,
      provisions: [{ sectionRef: "6.01" }],
      confirmedInstrumentIdentity: {
        instrumentKey: "instrument:wor-facility",
        confirmedDocumentIds: ["doc-a", "doc-b"],
        provisionalDocumentIds: [],
        mayConsolidateOperative: true,
        associationKind: "CONFIRMED",
      },
      instrumentDocumentIds: ["doc-a", "doc-b"],
      baseDocumentId: "doc-a",
    });
    expect(authority.provisions[0]!.governingDocumentId).toBe("doc-a");

    const fourthNodes = index.findNodesByRef("doc-a", "6.01");
    const candidate = syntheticSectionCandidate(
      "doc-a",
      "6.01",
      fourthNodes[0]!.nodeId,
      fourthNodes[0]!.nodeKey,
    );
    const binding = bindCandidateToOperativeRetrievalSource({ candidate, authority, index });
    expect(binding.remapped).toBe(false);
    expect(binding.retrievalAuthorized).toBe(true);
    expect(binding.retrievalCandidate.documentId).toBe("doc-a");
    expect(binding.governingDocumentId).toBe("doc-a");
  });
});
