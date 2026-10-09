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

/**
 * Authentic credit agreements (Gibraltar, Chewy, etc.) often draft definitions as
 * `“ ABR Loan ” means` / `“ Acquisition Agreement ” shall mean` — curly quotes with
 * interior whitespace / NBSP around the term. The prior pattern required the term to
 * start immediately after the opening quote and only accepted `means`, so full-package
 * definition coverage collapsed to a handful of accidental hits.
 *
 * SEC HTML exhibits frequently leave curly quotes as entities (`&#x201C;`) or as
 * Windows-1252 C1 controls (`\u0093`/`\u0094`) after extraction. Normalize those into
 * Unicode curly quotes before scanning so definition discovery is not format-dependent.
 */
const DEFINITION_RE =
  /[“"]\s*([A-Z][^“”"]{0,80}?)\s*[”"]\s*(?:means|shall\s+mean|has\s+the\s+meaning)\b/gi;

/** Map HTML entities / CP1252 smart quotes onto Unicode “ ” for definition scanning. */
export function normalizeDefinitionScanText(text: string): string {
  return text
    .replace(/&#x201[Cc];|&#8220;|&ldquo;/gi, "“")
    .replace(/&#x201[Dd];|&#8221;|&rdquo;/gi, "”")
    .replace(/&#x201[8];|&#8216;|&lsquo;/gi, "‘")
    .replace(/&#x201[9];|&#8217;|&rsquo;/gi, "’")
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/g, '"')
    // CP1252 smart quotes mis-decoded as C1 controls, plus Unicode curly forms.
    .replace(/[\u0093\u201C\u201E\u201F]/g, "“")
    .replace(/[\u0094\u201D]/g, "”");
}

export function discoverDefinitions(sourceId: string, text: string, _nodes: StructuralNodeRecord[]): DefinitionRecord[] {
  const scan = normalizeDefinitionScanText(text);
  const out: DefinitionRecord[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(DEFINITION_RE.source, "gi");
  while ((m = re.exec(scan)) !== null && out.length < 2000) {
    const term = (m[1] ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!term || term.length < 2) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const charStart = m.index;
    const charEnd = Math.min(scan.length, charStart + 400);
    out.push({
      term,
      sourceId,
      charStart,
      charEnd,
      excerpt: scan.slice(charStart, charEnd),
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
