/**
 * Phase C Stage 1 - STRUCTURE (task §8/§9). Deterministic, not an LLM call:
 * real evidence from Phase C0 (docs/phase-c0-analyzer-validation.md §V) shows
 * a single-call LLM design does not scale past ~117 pages at real extraction
 * density, and structural boundaries (article/section headers) are exactly
 * the kind of information a plain regex scan finds reliably and for free -
 * spending real model tokens on it would be a pure cost/latency regression
 * with no accuracy upside. Generalized across documents with different
 * numbering conventions by trying several candidate header patterns and
 * keeping whichever finds the most real matches, rather than hardcoding one
 * document's own style (the same "give the mechanism the pattern as a
 * parameter" generalization lib/contract-model/analyzer/coverage.ts already
 * established for its own marker-detection mechanism).
 */
import { hashParts } from "./hashing";
import type { CompilerDocumentInput, StageRunResult, StructuralNode } from "./types";

const ARTICLE_PATTERNS = [/^ARTICLE\s+([IVXLC]+|\d+)\.?\s*([^\n]*)$/gim];

const SECTION_PATTERNS = [/^Section\s+(\d+\.\d+)\.?\s*([^\n]*)$/gim, /^§\s?(\d+\.\d+)\.?\s*([^\n]*)$/gim, /^(\d+\.\d+)\s+([A-Z][^\n]*)$/gm];

function bestMatches(text: string, patterns: RegExp[]): RegExpExecArray[] {
  let best: RegExpExecArray[] = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    const matches: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push(m);
      if (m.index === re.lastIndex) re.lastIndex++;
    }
    if (matches.length > best.length) best = matches;
  }
  return best;
}

export function parseDocumentStructure(doc: CompilerDocumentInput): StructuralNode[] {
  const nodes: StructuralNode[] = [];
  const articleMatches = bestMatches(doc.text, ARTICLE_PATTERNS);
  const sectionMatches = bestMatches(doc.text, SECTION_PATTERNS);

  let ordinal = 0;
  for (const m of articleMatches) {
    nodes.push({ documentId: doc.documentId, nodeType: "ARTICLE", heading: (m[2] ?? "").trim(), sectionRef: (m[1] ?? "").trim(), charStart: m.index, charEnd: m.index + m[0].length, ordinal: ordinal++, parentSectionRef: null });
  }
  ordinal = 0;
  for (const m of sectionMatches) {
    const sectionRef = (m[1] ?? "").trim();
    const parentArticle = [...articleMatches].reverse().find((a) => a.index < m.index);
    nodes.push({ documentId: doc.documentId, nodeType: "SECTION", heading: (m[2] ?? "").trim(), sectionRef, charStart: m.index, charEnd: m.index + m[0].length, ordinal: ordinal++, parentSectionRef: parentArticle ? (parentArticle[1] ?? "").trim() : null });
  }
  return nodes.sort((a, b) => a.charStart - b.charStart);
}

export function runStructureStage(documents: CompilerDocumentInput[]): StageRunResult<StructuralNode[]> {
  const allNodes = documents.flatMap(parseDocumentStructure);
  if (allNodes.length === 0) {
    return { status: "REVIEW_REQUIRED", output: [], notes: ["No article/section headers matched any known structural pattern - structural inventory could not be built; every downstream stage's coverage claims are unreliable for this package until this is resolved."] };
  }
  return { status: "COMPLETED", output: allNodes };
}

export function structureOutputHash(nodes: StructuralNode[]): string {
  return hashParts(nodes.map((n) => `${n.documentId}|${n.nodeType}|${n.sectionRef}|${n.charStart}`));
}
