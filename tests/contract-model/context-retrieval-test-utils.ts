/**
 * Phase 2D test helper - builds a real, multi-document StructuralIndex
 * exactly the way scripts/phase-2b-run-discovery.ts and
 * scripts/phase-2c-run-package-graph-like scripts do (parse -> detect
 * definitions/references -> buildStructuralIndex), so context-retrieval
 * tests exercise the real Phase 2A pipeline, never a hand-rolled fixture
 * index.
 */
import { parseDocumentStructure } from "../../lib/contract-model/compiler/stage-structure";
import { detectStructuralDefinitions } from "../../lib/contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../lib/contract-model/compiler/structural-references";
import { buildStructuralIndex, type StructuralIndex } from "../../lib/contract-model/compiler/structural-index";

export interface TestDocument {
  documentId: string;
  label: string;
  text: string;
}

export function buildTestIndex(documents: TestDocument[]): StructuralIndex {
  const nodesByDocument = new Map<string, { text: string; nodes: ReturnType<typeof parseDocumentStructure> }>();
  const allDefinitions = [];
  const allReferences = [];
  for (const doc of documents) {
    const nodes = parseDocumentStructure(doc);
    nodesByDocument.set(doc.documentId, { text: doc.text, nodes });
    allDefinitions.push(...detectStructuralDefinitions(doc.documentId, doc.text, nodes));
    allReferences.push(...detectStructuralReferences(doc.documentId, doc.text, nodes));
  }
  return buildStructuralIndex(nodesByDocument, allDefinitions, allReferences);
}

export function buildExactTermsByDocument(documents: TestDocument[]): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const doc of documents) {
    const nodes = parseDocumentStructure(doc);
    const defs = detectStructuralDefinitions(doc.documentId, doc.text, nodes);
    const terms = new Map<string, string>();
    for (const d of defs) terms.set(d.normalizedTerm, d.exactTerm);
    out.set(doc.documentId, terms);
  }
  return out;
}
