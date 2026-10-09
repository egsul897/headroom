/**
 * Structural extraction reusing Headroom's structural compiler.
 * Persists exact source spans; records ambiguity when identity is not unique.
 */

import { parseDocumentStructureWithTriage } from "../../contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../contract-model/compiler/structural-index";
import type { CompilerDocumentInput } from "../../contract-model/compiler/types";
import type { CrossReferenceRecord, DefinitionRecord, StructuralNodeRecord } from "../types";

export interface StructuralExtractionResult {
  nodes: StructuralNodeRecord[];
  ambiguousCount: number;
  definitions: DefinitionRecord[];
  crossReferences: CrossReferenceRecord[];
}

export function extractStructure(sourceId: string, text: string): StructuralExtractionResult {
  const doc: CompilerDocumentInput = {
    documentId: sourceId,
    label: sourceId,
    text,
  };
  const triage = parseDocumentStructureWithTriage(doc);
  const nodes: StructuralNodeRecord[] = triage.nodes.map((n) => ({
    nodeId: n.nodeId,
    sourceId,
    nodeType: n.nodeType,
    sectionRef: n.sectionRef,
    heading: n.heading,
    charStart: n.charStart,
    charEnd: n.charEnd,
    parentNodeId: n.parentNodeId ?? undefined,
    ambiguous: false,
  }));

  // Retain ambiguous candidates as source-backed ambiguous structural records.
  for (const amb of triage.ambiguousCandidates) {
    nodes.push({
      nodeId: `ambiguous:${sourceId}:${amb.charStart}`,
      sourceId,
      nodeType: amb.candidateType,
      sectionRef: amb.candidateNumber || "AMBIGUOUS",
      heading: amb.candidateText?.slice(0, 160) || "(ambiguous structural candidate)",
      charStart: amb.charStart,
      charEnd: amb.charEnd,
      ambiguous: true,
    });
  }

  const index = buildStructuralIndex(new Map([[sourceId, { text, nodes: triage.nodes }]]), [], []);
  const definitions = discoverDefinitions(sourceId, text, nodes);
  const crossReferences = discoverCrossReferences(sourceId, text);

  // Touch index health so empty/corrupt docs surface honestly.
  void index;

  return {
    nodes,
    ambiguousCount: triage.ambiguousCandidates.length,
    definitions,
    crossReferences,
  };
}

const DEFINITION_RE =
  /[“"]([A-Z][^“"]{1,80})[”"]\s+means\b|“([A-Z][^”]{1,80})”\s+means\b|"([A-Z][^"]{1,80})"\s+means\b/g;

export function discoverDefinitions(sourceId: string, text: string, _nodes: StructuralNodeRecord[]): DefinitionRecord[] {
  const out: DefinitionRecord[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(DEFINITION_RE.source, "g");
  while ((m = re.exec(text)) !== null && out.length < 2000) {
    const term = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!term) continue;
    const charStart = m.index;
    const charEnd = Math.min(text.length, charStart + 400);
    out.push({
      term,
      sourceId,
      charStart,
      charEnd,
      excerpt: text.slice(charStart, charEnd),
    });
  }
  return out;
}

const XREF_RE = /\b(?:Section|Article|clause)\s+(\d+(?:\.\d+)*(?:\([a-z0-9]+\))*)\b/gi;

export function discoverCrossReferences(sourceId: string, text: string): CrossReferenceRecord[] {
  const out: CrossReferenceRecord[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(XREF_RE.source, "gi");
  while ((m = re.exec(text)) !== null && out.length < 5000) {
    out.push({
      sourceId,
      rawReference: m[0]!,
      charStart: m.index,
      charEnd: m.index + m[0]!.length,
    });
  }
  return out;
}
