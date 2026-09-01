/**
 * FINAL PHASE 3 CLOSURE - Sections 8-10 Superior classifier/relationship/
 * operative-supersession regression. Zero LLM calls (buildPackageGraph is
 * entirely deterministic) - read-only regression evidence against the
 * frozen Superior fixture, using the just-fixed production classifier.
 */
import { readFileSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions, type DetectedDefinition } from "../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences, type DetectedReference } from "../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { buildPackageGraph } from "../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../lib/contract-model/compiler/package-graph/types";
import type { StructuralNode } from "../lib/contract-model/compiler/types";

const COMPANY_ID = "final-lightweight-unseen-sup-968ccc2b";
const PACKAGE_KEY = "sup-term-loan-2022-2025";
const SRC_DIR = "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text";

const DOCS = [
  { documentId: "doc-a", label: "Superior Industries International, Inc. Term Loan Credit Agreement (2022-12-15)", file: "doc-a-2022-12-15-term-loan-credit-agreement.txt" },
  { documentId: "doc-b", label: "Superior Industries International, Inc. Amended and Restated Term Loan Credit Agreement (2024-08-14)", file: "doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt" },
  { documentId: "doc-c", label: "Superior Industries International, Inc. First Amendment to Amended and Restated Term Loan Credit Agreement (2025-03-31)", file: "doc-c-2025-03-31-first-amendment.txt" },
];

function main() {
  const documents = DOCS.map((d) => ({ documentId: d.documentId, label: d.label, text: readFileSync(`${SRC_DIR}/${d.file}`, "utf-8") }));
  const structureResult = runStructureStage(documents);
  const allNodes: StructuralNode[] = structureResult.output;
  const nodesByDocument = new Map<string, { text: string; nodes: StructuralNode[] }>();
  const allDefinitions: DetectedDefinition[] = [];
  const allReferences: DetectedReference[] = [];
  for (const doc of documents) {
    const nodes = allNodes.filter((n) => n.documentId === doc.documentId);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);

  const packageDocs: PackageDocumentInput[] = documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text }));
  const packageGraph = buildPackageGraph(COMPANY_ID, PACKAGE_KEY, packageDocs);

  console.log(JSON.stringify(packageGraph, null, 2));
}
main();
