/**
 * SEMANTIC ACCOUNTABILITY validation - the two FROZEN real validations
 * (mission §21-§22), shared by the validation harness, the stability
 * comparator and the zero-cost cost plan so every consumer sees ONE
 * definition of the regions.
 *
 * Validation A: the exact A1-A6/B1-B4 semantic holdout - REGIONS/DOCS/
 * SRC_DIR are byte-identical to scripts/final-semantic-decomposition-
 * holdout-replay.ts (itself byte-identical to the two earlier executions).
 * Validation B: the 12 pre-registered real regions of scripts/final-
 * semantic-decomposition-reality-check.ts (same files, offsets, windows).
 *
 * No GT modification, no new examples, no region/claim re-selection. The
 * only harness changes are the ones root cause 06 R-1 justified: the real
 * structuralNodeId is populated (as the real discovery pipeline always
 * does), the anchor interval is half-open, operativeCharStart is passed,
 * and the full compile result (shared caps, tool log, source context,
 * frozen inventory, accountability) is preserved.
 */
import { readFileSync } from "node:fs";
import { runStructureStage } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions, type DetectedDefinition } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences, type DetectedReference } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";
import { buildPackageGraph } from "../../lib/contract-model/compiler/package-graph/pipeline";
import type { PackageDocumentInput } from "../../lib/contract-model/compiler/package-graph/types";
import type { StructuralNode } from "../../lib/contract-model/compiler/types";

export type ValidationMode = "holdout" | "whole-agreement";

export interface ValidationRegion {
  id: string;
  /** Holdout: the GT claim ids this region serves. Whole-agreement: []. */
  claimIds: string[];
  /** Whole-agreement: provision family. Holdout: "DEFINITIONS"/"AMENDMENT". */
  family: string;
  documentId: string;
  label: string;
  sourceSectionRef: string;
  /** Resolved against the loaded document text. */
  locate: (text: string) => { start: number; end: number };
}

export interface ValidationSpec {
  mode: ValidationMode;
  companyId: string;
  packageKey: string;
  instrumentKey: string;
  outDirBase: string;
  documents: { documentId: string; label: string; file: string }[];
  regions: ValidationRegion[];
  /** Mission-4 observed per-region compile cost (USD) for the same region under the previous production code - the cost-plan baseline. */
  priorCompileCostUsd: Record<string, number>;
  priorTotalCostUsd: number;
}

const SUP_SRC = "tests/fixtures/unseen-packages/final-lightweight-unseen-sup/extracted-text";
const DSGR_A = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-a-2022-amended-restated-credit-agreement.txt";
const DSGR_D = "tests/fixtures/unseen-packages/dsgr-2022-2025-credit-facility/extracted-text/doc-d-2025-second-amended-restated-credit-agreement.txt";
const LSB_DEFS = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/definitions-excerpt.txt";
const LSB_ART6 = "tests/fixtures/unseen-packages/lsb-2023-abl-credit-agreement/article-6-negative-covenants.txt";

function markerLocator(startMarker: string, endMarker: string | null, fixedWindowChars?: number) {
  return (text: string) => {
    const start = text.indexOf(startMarker);
    if (start === -1) throw new Error(`startMarker not found: ${startMarker.slice(0, 40)}`);
    let end: number;
    if (endMarker) {
      const idx = text.indexOf(endMarker, start + startMarker.length);
      end = idx === -1 ? start + (fixedWindowChars ?? 3000) : idx;
    } else end = start + (fixedWindowChars ?? 3000);
    return { start, end };
  };
}
function offsetLocator(startOffset: number, windowChars: number) {
  return (text: string) => ({ start: startOffset, end: Math.min(text.length, startOffset + windowChars) });
}

export const HOLDOUT_SPEC: ValidationSpec = {
  mode: "holdout",
  companyId: "final-phase3-closure-holdout-sup",
  packageKey: "sup-term-loan-2022-2025",
  instrumentKey: "sup-term-loan-instrument",
  outDirBase: "tests/fixtures/semantic-accountability-validation/holdout",
  documents: [
    { documentId: "doc-a", label: "Superior Industries International, Inc. Term Loan Credit Agreement (2022-12-15)", file: `${SUP_SRC}/doc-a-2022-12-15-term-loan-credit-agreement.txt` },
    { documentId: "doc-b", label: "Superior Industries International, Inc. Amended and Restated Term Loan Credit Agreement (2024-08-14)", file: `${SUP_SRC}/doc-b-2024-08-14-amended-restated-term-loan-credit-agreement.txt` },
    { documentId: "doc-c", label: "Superior Industries International, Inc. First Amendment to Amended and Restated Term Loan Credit Agreement (2025-03-31)", file: `${SUP_SRC}/doc-c-2025-03-31-first-amendment.txt` },
  ],
  regions: [
    { id: "ebitda", claimIds: ["A1", "B3"], family: "DEFINITIONS", documentId: "doc-a", label: "SECTION 1.01 - Consolidated EBITDA", sourceSectionRef: "1.01 (Consolidated EBITDA)", locate: markerLocator("“Consolidated EBITDA” means", null, 5200) },
    { id: "net-income", claimIds: ["A2"], family: "DEFINITIONS", documentId: "doc-a", label: "SECTION 1.01 - Consolidated Net Income", sourceSectionRef: "1.01 (Consolidated Net Income)", locate: markerLocator("“Consolidated Net Income” means", "“Consolidated") },
    { id: "interest-expense", claimIds: ["A3"], family: "DEFINITIONS", documentId: "doc-a", label: "SECTION 1.01 - Consolidated Interest Expense", sourceSectionRef: "1.01 (Consolidated Interest Expense)", locate: markerLocator("“Consolidated\nInterest Expense” means", null, 3600) },
    { id: "first-lien-debt", claimIds: ["A4"], family: "DEFINITIONS", documentId: "doc-a", label: "SECTION 1.01 - Consolidated First Lien Secured Debt", sourceSectionRef: "1.01 (Consolidated First Lien Secured Debt)", locate: markerLocator("“Consolidated First Lien Secured Debt” means", null, 950) },
    { id: "secured-net-leverage", claimIds: ["A5"], family: "DEFINITIONS", documentId: "doc-a", label: "SECTION 1.01 - Secured Net Leverage Ratio", sourceSectionRef: "1.01 (Secured Net Leverage Ratio)", locate: markerLocator("“Secured Net Leverage Ratio” means", null, 1100) },
    { id: "applicable-liquidity-rate", claimIds: ["B1", "B2"], family: "DEFINITIONS", documentId: "doc-a", label: "SECTION 1.01 - Applicable Liquidity Threshold / Applicable Rate", sourceSectionRef: "1.01 (Applicable Liquidity Threshold; Applicable Rate)", locate: markerLocator("“Applicable Liquidity Threshold” means", null, 5200) },
    { id: "new-definitions", claimIds: ["A6"], family: "AMENDMENT", documentId: "doc-c", label: "SECTION 2(a) - new sibling definitions", sourceSectionRef: "2(a)", locate: markerLocator("Section 1.01 of the Credit Agreement is\nhereby amended by adding the following definitions", "(b) Section 2.05(2)(c)") },
    { id: "cash-sweep-cure", claimIds: ["B4"], family: "AMENDMENT", documentId: "doc-c", label: "SECTION 2(b) - Section 2.05(2)(c) amendment", sourceSectionRef: "2(b)", locate: markerLocator("(b) Section 2.05(2)(c) of the Credit Agreement is hereby", null, 2900) },
  ],
  priorCompileCostUsd: { "ebitda": 0.316, "net-income": 0.262, "interest-expense": 0.182, "first-lien-debt": 0.229, "secured-net-leverage": 0.211, "applicable-liquidity-rate": 0.393, "new-definitions": 0.207, "cash-sweep-cure": 0.234 },
  priorTotalCostUsd: 3.0554,
};

export const WHOLE_AGREEMENT_SPEC: ValidationSpec = {
  mode: "whole-agreement",
  companyId: "final-semantic-decomposition-reality-check",
  packageKey: "whole-agreement-reality-check",
  instrumentKey: "reality-check-instrument",
  outDirBase: "tests/fixtures/semantic-accountability-validation/whole-agreement",
  documents: [
    { documentId: "lsb-defs", label: "lsb-defs", file: LSB_DEFS },
    { documentId: "dsgr-a", label: "dsgr-a", file: DSGR_A },
    { documentId: "lsb-art6", label: "lsb-art6", file: LSB_ART6 },
    { documentId: "dsgr-d", label: "dsgr-d", file: DSGR_D },
  ],
  regions: [
    { id: "definitions-lsb", claimIds: [], family: "DEFINITIONS", documentId: "lsb-defs", label: "LSB ABL Credit Agreement - definitions excerpt", sourceSectionRef: "1.01 (LSB excerpt)", locate: offsetLocator(0, 999999) },
    { id: "definitions-dsgr", claimIds: [], family: "DEFINITIONS", documentId: "dsgr-a", label: "DSGR 2022 A&R Credit Agreement - SECTION 1.01 Defined Terms", sourceSectionRef: "1.01", locate: offsetLocator(12620, 4000) },
    { id: "debt-dsgr", claimIds: [], family: "DEBT", documentId: "dsgr-a", label: "DSGR 2022 A&R Credit Agreement - SECTION 6.01 Indebtedness", sourceSectionRef: "6.01", locate: offsetLocator(436142, 4500) },
    { id: "debt-lsb", claimIds: [], family: "DEBT", documentId: "lsb-art6", label: "LSB ABL Credit Agreement - Article 6 negative covenants excerpt", sourceSectionRef: "6.xx (LSB excerpt)", locate: offsetLocator(0, 999999) },
    { id: "liens-dsgr-a", claimIds: [], family: "LIENS", documentId: "dsgr-a", label: "DSGR 2022 A&R Credit Agreement - SECTION 6.02 Liens", sourceSectionRef: "6.02", locate: offsetLocator(444932, 3500) },
    { id: "liens-dsgr-d", claimIds: [], family: "LIENS", documentId: "dsgr-d", label: "DSGR 2025 Second A&R Credit Agreement - SECTION 6.02 Liens", sourceSectionRef: "6.02", locate: offsetLocator(464193, 3500) },
    { id: "investments-dsgr", claimIds: [], family: "RESTRICTED_PAYMENTS_INVESTMENTS", documentId: "dsgr-a", label: "DSGR 2022 A&R Credit Agreement - SECTION 6.04 Investments", sourceSectionRef: "6.04", locate: offsetLocator(455225, 4000) },
    { id: "restricted-payments-dsgr", claimIds: [], family: "RESTRICTED_PAYMENTS_INVESTMENTS", documentId: "dsgr-a", label: "DSGR 2022 A&R Credit Agreement - SECTION 6.08 Restricted Payments", sourceSectionRef: "6.08", locate: offsetLocator(468878, 4000) },
    { id: "asset-sales-dsgr", claimIds: [], family: "ASSET_SALES_PREPAYMENT", documentId: "dsgr-a", label: "DSGR 2022 A&R Credit Agreement - SECTION 6.05 Asset Sales", sourceSectionRef: "6.05", locate: offsetLocator(463076, 3500) },
    { id: "financial-covenant-dsgr", claimIds: [], family: "FINANCIAL_COVENANT", documentId: "dsgr-a", label: "DSGR 2022 A&R Credit Agreement - SECTION 6.12 Financial Covenants", sourceSectionRef: "6.12", locate: offsetLocator(476724, 3500) },
    { id: "reporting-dsgr", claimIds: [], family: "REPORTING_AFFIRMATIVE", documentId: "dsgr-a", label: "DSGR 2022 A&R Credit Agreement - SECTION 5.01 Financial Statements and Other Information", sourceSectionRef: "5.01", locate: offsetLocator(404706, 3500) },
    { id: "cross-reference-dsgr", claimIds: [], family: "CROSS_REFERENCE_SHARED_CAP_CONDITION", documentId: "dsgr-a", label: "DSGR 2022 A&R Credit Agreement - SECTION 6.10 Restrictive Agreements", sourceSectionRef: "6.10", locate: offsetLocator(474298, 2800) },
  ],
  priorCompileCostUsd: { "definitions-lsb": 0.343, "definitions-dsgr": 0.479, "debt-dsgr": 0.477, "debt-lsb": 0.635, "liens-dsgr-a": 0.551, "liens-dsgr-d": 0.519, "investments-dsgr": 0.46, "restricted-payments-dsgr": 0.564, "asset-sales-dsgr": 0.306, "financial-covenant-dsgr": 0.184, "reporting-dsgr": 0.438, "cross-reference-dsgr": 0.177 },
  priorTotalCostUsd: 7.122662,
};

export function specFor(mode: ValidationMode): ValidationSpec {
  return mode === "holdout" ? HOLDOUT_SPEC : WHOLE_AGREEMENT_SPEC;
}

export interface LoadedPackage {
  documents: { documentId: string; label: string; text: string }[];
  textByDoc: Map<string, string>;
  allNodes: StructuralNode[];
  index: StructuralIndex;
  packageGraph: ReturnType<typeof buildPackageGraph>;
  exactTermsByDocument: Map<string, Map<string, string>>;
}

/** Real Phase 2A parse -> definitions/references -> index -> package graph, exactly as the prior harnesses did. */
export function loadPackage(spec: ValidationSpec): LoadedPackage {
  const documents = spec.documents.map((d) => ({ documentId: d.documentId, label: d.label, text: readFileSync(d.file, "utf-8") }));
  const textByDoc = new Map(documents.map((d) => [d.documentId, d.text]));
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
  const index = buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
  const packageDocs: PackageDocumentInput[] = documents.map((d) => ({ documentId: d.documentId, label: d.label, text: d.text }));
  const packageGraph = buildPackageGraph(spec.companyId, spec.packageKey, packageDocs);
  const exactTermsByDocument = new Map<string, Map<string, string>>();
  for (const def of allDefinitions) {
    if (!exactTermsByDocument.has(def.documentId)) exactTermsByDocument.set(def.documentId, new Map());
    exactTermsByDocument.get(def.documentId)!.set(def.normalizedTerm, def.exactTerm);
  }
  return { documents, textByDoc, allNodes, index, packageGraph, exactTermsByDocument };
}

/** R-1: the real physical anchor - the smallest node whose HALF-OPEN span [charStart, charEnd) contains the region start. Returns both identities (nodeId is the real one; nodeKey is the deprecated label kept for the record). */
export function findAnchor(allNodes: StructuralNode[], documentId: string, idx: number): { nodeId: string; nodeKey: string; sectionRef: string | null; charStart: number; charEnd: number } | null {
  const cands = allNodes.filter((n) => n.documentId === documentId && n.charStart <= idx && idx < n.charEnd);
  cands.sort((a, b) => a.charEnd - a.charStart - (b.charEnd - b.charStart));
  const n = cands[0];
  return n ? { nodeId: n.nodeId, nodeKey: n.nodeKey, sectionRef: n.sectionRef, charStart: n.charStart, charEnd: n.charEnd } : null;
}
