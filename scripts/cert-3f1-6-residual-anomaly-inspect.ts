/**
 * Phase 3F.1.6 Final Foundation Certification - Section 5.
 * AUDIT-ONLY, READ-ONLY script. Independently reproduces the residual
 * SECTION_NUMBER_SEQUENCE_ANOMALY findings for CONMED and DSGR after the
 * P1-10 plausibility-gate fix, and prints the REAL source text surrounding
 * each anomalous node (both the flagged node and its immediately preceding
 * sibling) so each can be independently classified as
 * TRUE_DOCUMENT_IRREGULARITY / BENIGN_PARSER_LIMITATION /
 * MATERIAL_STRUCTURAL_ERROR by reading the actual document text - never by
 * trusting the health-code's own message string.
 *
 * Reuses the exact same fixture-loading glue as
 * scripts/foundation-audit-known-package-replay.ts (not duplicated logic -
 * copied verbatim because that script does not export its loaders) and the
 * exact same production parseDocument/runStructureStage/buildStructuralIndex
 * functions. Zero cost, no new document acquisition, no production files
 * touched.
 *
 * Run via: npx tsx scripts/cert-3f1-6-residual-anomaly-inspect.ts
 */
import { readFileSync } from "node:fs";
import { runStructureStage } from "../lib/contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../lib/contract-model/compiler/structural-index";
import { parseDocument } from "../lib/extraction/parse";
import type { CompilerDocumentInput, StructuralNode } from "../lib/contract-model/compiler/types";

async function loadConmed(): Promise<CompilerDocumentInput[]> {
  const files = [
    { documentId: "conmed-doc-a", label: "CONMED Eighth A&R Credit Agreement", file: "ex10-1-eighth-ar-credit-agreement-2025-06-16.htm" },
    { documentId: "conmed-doc-b", label: "CONMED A&R Guarantee and Collateral Agreement", file: "ex10-2-ar-guarantee-and-collateral-agreement-2025-06-16.htm" },
    { documentId: "conmed-doc-c", label: "CONMED Second Amendment 2022", file: "ex10-2-second-amendment-2022-08-02.htm" },
    { documentId: "conmed-doc-d", label: "CONMED First Omnibus Amendment 2026", file: "ex10-1-first-omnibus-amendment-2026-06-01.htm" },
  ];
  const documents: CompilerDocumentInput[] = [];
  for (const f of files) {
    const raw = readFileSync(`tests/fixtures/unseen-packages/conmed-2025-credit-facility/raw-source/${f.file}`);
    const parsed = await parseDocument(raw, "text/html");
    documents.push({ documentId: f.documentId, label: f.label, text: parsed.fullText });
  }
  return documents;
}

async function loadDsgr(): Promise<CompilerDocumentInput[]> {
  const files = [
    { documentId: "doc-a", label: "DSGR 2022 A&R Credit Agreement", file: "doc-a-2022-amended-restated-credit-agreement.txt" },
    { documentId: "doc-b", label: "DSGR 2024 Third Amendment", file: "doc-b-2024-third-amendment.txt" },
    { documentId: "doc-c", label: "DSGR 2025 Fourth Amendment", file: "doc-c-2025-fourth-amendment.txt" },
    { documentId: "doc-d", label: "DSGR 2025 Second A&R Credit Agreement", file: "doc-d-2025-second-amended-restated-credit-agreement.txt" },
  ];
  return files.map((f) => ({ documentId: f.documentId, label: f.label, text: readFileSync(`tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/${f.file}`, "utf-8") }));
}

async function inspect(packageKey: string, loader: () => Promise<CompilerDocumentInput[]>) {
  const documents = await loader();
  const textByDoc = new Map(documents.map((d) => [d.documentId, d.text]));
  const nodes = runStructureStage(documents).output;
  const nodesByDocument = new Map(documents.map((d) => [d.documentId, { text: d.text, nodes: nodes.filter((n) => n.documentId === d.documentId) }]));
  const index = buildStructuralIndex(nodesByDocument, [], []);
  const health = index.healthDiagnostics();
  const anomalies = health.filter((h) => h.code === "SECTION_NUMBER_SEQUENCE_ANOMALY");

  console.log(`\n========== ${packageKey}: ${anomalies.length} SECTION_NUMBER_SEQUENCE_ANOMALY finding(s) ==========`);
  const byNodeId = new Map<string, StructuralNode>(nodes.map((n) => [n.nodeId, n]));
  for (const finding of anomalies) {
    const node = byNodeId.get(finding.nodeId!);
    if (!node) {
      console.log(`\n-- MISSING NODE for finding ${JSON.stringify(finding)} --`);
      continue;
    }
    const text = textByDoc.get(node.documentId) ?? "";
    // Find the previous sibling by parentNodeId + charStart ordering.
    const siblings = nodes
      .filter((n) => n.documentId === node.documentId && n.parentNodeId === node.parentNodeId && n.nodeType === "SECTION")
      .sort((a, b) => a.charStart - b.charStart);
    const idx = siblings.findIndex((s) => s.nodeId === node.nodeId);
    const prev = idx > 0 ? siblings[idx - 1] : null;

    console.log(`\n---- documentId=${node.documentId} nodeId=${node.nodeId} sectionRef="${node.sectionRef}" heading="${node.heading}" charStart=${node.charStart} charEnd=${node.charEnd}`);
    console.log(`message: ${finding.message}`);
    if (prev) {
      console.log(`prevSibling: sectionRef="${prev.sectionRef}" heading="${prev.heading}" charStart=${prev.charStart} charEnd=${prev.charEnd}`);
      const prevWindowStart = Math.max(0, prev.charStart - 120);
      console.log(`prevSibling preceding-context (120 chars before its match):\n  ${JSON.stringify(text.slice(prevWindowStart, prev.charStart))}`);
      console.log(`prevSibling own match text (first 200 chars of its region):\n  ${JSON.stringify(text.slice(prev.charStart, Math.min(prev.charStart + 200, prev.charEnd)))}`);
    }
    const windowStart = Math.max(0, node.charStart - 150);
    console.log(`flagged-node preceding-context (150 chars before its match):\n  ${JSON.stringify(text.slice(windowStart, node.charStart))}`);
    console.log(`flagged-node own match text (first 250 chars of its region):\n  ${JSON.stringify(text.slice(node.charStart, Math.min(node.charStart + 250, node.charEnd)))}`);
  }
}

async function main() {
  await inspect("CONMED", loadConmed);
  await inspect("DSGR", loadDsgr);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
