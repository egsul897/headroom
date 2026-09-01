/**
 * PRE-UNSEEN classifier remediation - frozen Riot DETERMINISTIC replay
 * (mission Sections 11-14). No AI/semantic call of any kind - only the
 * real, unmodified (except for this session's own document-classifier.ts
 * fix) buildPackageGraph -> runAmendmentPipeline -> computeOperativeDocument
 * production functions, run against the real, frozen Riot source text.
 * Ground truth/source/thresholds are immutable; this is regression
 * evidence only, never re-adjudicated, never tuned after observing the
 * result.
 *
 * Run via: npx tsx scripts/pre-unseen-riot-deterministic-replay.ts
 */
import { writeFileSync, readFileSync } from "node:fs";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../lib/contract-model/compiler/structural-references";
import type { StructuralNode } from "../lib/contract-model/compiler/types";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import { runAmendmentPipeline } from "../lib/contract-model/compiler/amendment/pipeline";
import { computeOperativeDocument } from "../lib/contract-model/compiler/amendment/chain";
import { computeOperativeContractState } from "../lib/contract-model/compiler/amendment/operative-state";
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
const DOCS: PackageDocumentInput[] = [
  { documentId: "doc-a", label: "Riot Platforms Credit Agreement (2025-04-22)", text: readFileSync(`${SRC}/doc-a-2025-04-22-credit-agreement.txt`, "utf-8") },
  { documentId: "doc-b", label: "Riot Platforms Amended and Restated Credit Agreement (2025-05-19)", text: readFileSync(`${SRC}/doc-b-2025-05-19-amended-restated-credit-agreement.txt`, "utf-8") },
  { documentId: "doc-c", label: "Riot Platforms Second Amended and Restated Credit Agreement (2026-04-21)", text: readFileSync(`${SRC}/doc-c-2026-04-21-second-amended-restated-credit-agreement.txt`, "utf-8") },
];

// mirrors tests/contract-model/post-3f2-package-graph-restatement.test.ts's own helper
function buildRealIndex(docs: PackageDocumentInput[]) {
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  for (const doc of docs) {
    const node: StructuralNode = { documentId: doc.documentId, nodeType: "SECTION", heading: doc.label, sectionRef: "1", nodeKey: `${doc.documentId}::1`, nodeId: `n-${doc.documentId}-1`, charStart: 0, charEnd: doc.text.length, ordinal: 0, parentSectionRef: null, parentNodeId: null };
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes: [node] });
  }
  const allDefinitions = docs.flatMap((d) => detectStructuralDefinitions(d.documentId, d.text, [nodesByDocument.get(d.documentId)!.nodes[0]!]));
  const allReferences = docs.flatMap((d) => detectStructuralReferences(d.documentId, d.text, [nodesByDocument.get(d.documentId)!.nodes[0]!]));
  return buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
}

async function main() {
  const packageGraph = buildPackageGraph("riot-phase-3f2-unseen", "riot-2025-2026-coinbase-credit-facility", DOCS);
  const index = buildRealIndex(DOCS);
  const amendmentResult = await runAmendmentPipeline(NEVER_CALLED, { documents: DOCS, packageGraph, index });

  const classifications = Object.fromEntries(packageGraph.classifications.map((c) => [c.documentId, c]));
  const restatesEdges = packageGraph.relationshipCandidates.filter((r) => r.relationshipType === "RESTATES");

  const operativeDocumentResults: Record<string, unknown> = {};
  for (const base of ["doc-a", "doc-b", "doc-c"]) {
    operativeDocumentResults[base] = computeOperativeDocument(base, amendmentResult.effects);
  }

  // Deleted-carve-out safety check: the doc-a Section 6.01(d) EXCEPTION
  // carve-out present in doc-a/doc-b is silently deleted in doc-c (per
  // Phase 3F.2's own ground truth). computeOperativeContractState for the
  // instrument keyed off doc-a's own base document must never present
  // doc-a's own (potentially superseded) provisions as the CURRENT
  // operative state if a later document in the chain would in fact govern -
  // and, per the operative-document result above, no document is ever
  // confidently designated operative for this package (a genuine, disclosed,
  // out-of-scope-for-this-session document-classifier limitation upstream of
  // this specific check - see docs/pre-unseen-classifier-remediation/07-riot-deterministic-replay.json).
  const stateForDocA = computeOperativeContractState({ instrumentKey: "instrument:doc-a", baseDocumentId: "doc-a", asOfDate: "2026-01-01", index, allEffects: amendmentResult.effects });

  const result = {
    generatedAt: new Date().toISOString(),
    classifications: {
      "doc-a": classifications["doc-a"],
      "doc-b": classifications["doc-b"],
      "doc-c": classifications["doc-c"],
    },
    restatesEdges,
    operativeDocumentResults,
    operativeStateForDocA: { status: stateForDocA.status, operativeDocument: stateForDocA.operativeDocument, provisionCount: stateForDocA.provisions.length, unattachedEffectsCount: stateForDocA.unattachedEffects.length },
  };
  writeFileSync("docs/pre-unseen-classifier-remediation/07-riot-deterministic-replay-raw.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
