/**
 * PRE-UNSEEN OPERATIVE-STATE INTEGRATION CLOSURE - frozen Riot deterministic
 * replay (mission Sections 20-24). No AI/semantic call of any kind. Unlike
 * the prior pre-unseen-classifier-remediation session's own replay script
 * (which deliberately fed all three documents into ONE combined
 * runAmendmentPipeline call to demonstrate computeOperativeDocument's own
 * chain-closure property in isolation), THIS script mirrors the REAL
 * production orchestrator's own PER-INSTRUMENT scoping as faithfully as
 * possible: buildPackageGraph's own instrument-grouping (RESOLVED-only
 * merge - REVIEW_REQUIRED links never merge two documents into one
 * instrument) determines which documents' text is actually supplied to
 * each runAmendmentPipeline call, exactly like orchestrator.ts's own
 * analyzeInstrument. This is the honest test of whether this session's fix
 * closes the node/document trust inconsistency within REAL production
 * instrument boundaries, not merely within an idealized combined-graph test
 * harness - see docs/pre-unseen-operative-integration/01-inconsistency-
 * trace.json's own disclosed instrument-scoping-boundary finding.
 *
 * Uses REAL, frozen structural nodes (tests/fixtures/unseen-packages/
 * phase-3f2-riot-unseen-run/stage1-all-nodes.json) for the deleted
 * carve-out check - specifically doc-a::6.01(d), the EXCEPTION carve-out
 * both independent blind ground-truth reviewers flagged as present in
 * doc-a/doc-b and silently deleted in doc-c.
 *
 * Run via: npx tsx scripts/pre-unseen-operative-integration-riot-replay.ts
 */
import { writeFileSync, readFileSync } from "node:fs";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import { runAmendmentPipeline } from "../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeContractState, buildNodeSupersessionIndex, getNodeSupersessionStatus, resolveOperativeSectionEvidence } from "../lib/contract-model/compiler/amendment/operative-state";
import type { StageCaller } from "../lib/contract-model/compiler/llm-caller";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";

const NEVER_CALLED: StageCaller = {
  providerName: "never-called",
  model: "never-called",
  isSynthetic: true,
  async call(): Promise<never> {
    throw new Error("this deterministic replay should never need a semantic-interpretation call");
  },
  lastTelemetry() {
    return null;
  },
};

const SRC = "tests/fixtures/unseen-packages/riot-2025-2026-credit-facility/extracted-text";
const ALL_DOCS: PackageDocumentInput[] = [
  { documentId: "doc-a", label: "Riot Platforms Credit Agreement (2025-04-22)", text: readFileSync(`${SRC}/doc-a-2025-04-22-credit-agreement.txt`, "utf-8") },
  { documentId: "doc-b", label: "Riot Platforms Amended and Restated Credit Agreement (2025-05-19)", text: readFileSync(`${SRC}/doc-b-2025-05-19-amended-restated-credit-agreement.txt`, "utf-8") },
  { documentId: "doc-c", label: "Riot Platforms Second Amended and Restated Credit Agreement (2026-04-21)", text: readFileSync(`${SRC}/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt`, "utf-8") },
];

interface FrozenNode {
  documentId: string;
  nodeType: string;
  heading: string;
  sectionRef: string;
  nodeKey: string;
  nodeId: string;
  charStart: number;
  charEnd: number;
  ordinal: number;
  parentSectionRef: string | null;
  parentNodeId: string | null;
}

function loadFrozenNodes(): StructuralNode[] {
  const raw = JSON.parse(readFileSync("tests/fixtures/unseen-packages/phase-3f2-riot-unseen-run/stage1-all-nodes.json", "utf-8")) as FrozenNode[];
  return raw as unknown as StructuralNode[];
}

function buildRealIndexFromFrozenNodes(docs: PackageDocumentInput[], allNodes: StructuralNode[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  for (const doc of docs) {
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes: allNodes.filter((n) => n.documentId === doc.documentId) });
  }
  const allDefinitions = docs.flatMap((d) => detectStructuralDefinitions(d.documentId, d.text, nodesByDocument.get(d.documentId)!.nodes));
  const allReferences = docs.flatMap((d) => detectStructuralReferences(d.documentId, d.text, nodesByDocument.get(d.documentId)!.nodes));
  return buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
}

async function main() {
  const frozenNodes = loadFrozenNodes();
  const index = buildRealIndexFromFrozenNodes(ALL_DOCS, frozenNodes);
  const packageGraph = buildPackageGraph("riot-pre-unseen-operative-integration", "riot-2025-2026-coinbase-credit-facility", ALL_DOCS);

  // Mirrors orchestrator.ts's own resolveInstrumentUnits: documents grouped
  // into an instrument by package-graph's own RESOLVED-only merge policy,
  // plus one standalone unit per otherwise-ungrouped document.
  const grouped = new Set<string>();
  const units: { instrumentKey: string; baseDocumentId: string; documentIds: string[] }[] = [];
  for (const inst of packageGraph.instruments) {
    for (const id of inst.documentIds) grouped.add(id);
    units.push({ instrumentKey: inst.instrumentKey, baseDocumentId: inst.baseDocumentId ?? inst.documentIds[0]!, documentIds: inst.documentIds });
  }
  for (const doc of ALL_DOCS) {
    if (!grouped.has(doc.documentId)) units.push({ instrumentKey: `standalone:${doc.documentId}`, baseDocumentId: doc.documentId, documentIds: [doc.documentId] });
  }

  const perInstrumentResults: Record<string, unknown> = {};
  const supersessionEntries: { baseDocumentId: string; state: Awaited<ReturnType<typeof computeOperativeContractState>> }[] = [];

  for (const unit of units) {
    const unitDocs = ALL_DOCS.filter((d) => unit.documentIds.includes(d.documentId));
    // REAL production scoping: runAmendmentPipeline only ever receives THIS
    // instrument's own document subset - exactly like orchestrator.ts's
    // analyzeInstrument (never the whole package at once).
    const amendmentResult = await runAmendmentPipeline(NEVER_CALLED, { documents: unitDocs, packageGraph, index });
    const unresolvedTargetEffectsForThisInstrument = amendmentResult.effects.filter((e) => e.target.targetInstrumentKey === null);
    const state = computeOperativeContractState({ instrumentKey: unit.instrumentKey, baseDocumentId: unit.baseDocumentId, asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects, unresolvedTargetEffectsForThisInstrument });
    supersessionEntries.push({ baseDocumentId: unit.baseDocumentId, state });
    perInstrumentResults[unit.instrumentKey] = {
      documentIds: unit.documentIds,
      baseDocumentId: unit.baseDocumentId,
      operativeDocument: state.operativeDocument,
      provisionCount: state.provisions.length,
      status: state.status,
    };
  }

  // The REAL, combined supersession index a real analysis run building
  // trust for every document in this package would use - exactly the shape
  // buildNodeSupersessionIndex's own doc comment describes ("a real package
  // can involve several instruments/base documents").
  const supersessionIndex = buildNodeSupersessionIndex(supersessionEntries);

  const docA601d = frozenNodes.find((n) => n.documentId === "doc-a" && n.sectionRef === "6.01(d)");
  const carveOutResult = docA601d ? getNodeSupersessionStatus(supersessionIndex, "doc-a", docA601d.nodeId) : null;

  // Mission Section 24 - exercise the highest practical REAL production
  // trust path (not merely getNodeSupersessionStatus in isolation): the same
  // resolveOperativeSectionEvidence primitive semantic/tools.ts's own
  // resolveNodeWithSupersessionAwareness/CASE-D path (and getReferencedProvision/
  // getSiblingClauses/getParentClause) ultimately calls to decide whether a
  // section's evidence is CURRENT trusted truth - using doc-a's own real
  // OperativeContractState (instrument:doc-a) computed above.
  const docAState = supersessionEntries.find((e) => e.baseDocumentId === "doc-a")!.state;
  const trustedTruthCheck = docA601d
    ? resolveOperativeSectionEvidence({ operativeState: docAState, documentId: "doc-a", node: { nodeId: docA601d.nodeId, sectionRef: docA601d.sectionRef }, supersessionIndex })
    : null;

  const result = {
    generatedAt: new Date().toISOString(),
    instrumentGrouping: packageGraph.instruments.map((i) => ({ instrumentKey: i.instrumentKey, baseDocumentId: i.baseDocumentId, documentIds: i.documentIds, reviewStatus: i.reviewStatus })),
    classifications: Object.fromEntries(packageGraph.classifications.map((c) => [c.documentId, { type: c.type, confidence: c.confidence, resolutionMethod: c.resolutionMethod }])),
    restatesEdges: packageGraph.relationshipCandidates.filter((r) => r.relationshipType === "RESTATES").map((r) => ({ sourceDocumentId: r.sourceDocumentId, targetDocumentId: r.targetDocumentId, status: r.status, confidence: r.confidence, resolutionMethod: r.resolutionMethod })),
    perInstrumentOperativeDocumentResults: perInstrumentResults,
    docA601dCarveOutCheck: docA601d
      ? {
          nodeKey: docA601d.nodeKey,
          nodeId: docA601d.nodeId,
          supersessionResult: carveOutResult,
          physicalTextStillRetrievable: index.getNodeText(docA601d.nodeId, "DESCENDANTS")?.slice(0, 300) ?? null,
          trustedTruthCheck,
        }
      : { error: "doc-a::6.01(d) not found in frozen node set" },
  };

  writeFileSync("docs/pre-unseen-operative-integration/08-riot-deterministic-replay-raw.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
