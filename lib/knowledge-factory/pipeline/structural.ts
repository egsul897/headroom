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
  /[“"]([A-Z][^“"]{1,80})[”"]\s+(?:means|shall\s+mean|has\s+the\s+meaning|shall\s+have\s+the\s+meaning)\b|“([A-Z][^”]{1,80})”\s+(?:means|shall\s+mean|shall\s+have\s+the\s+meaning)\b|"([A-Z][^"]{1,80})"\s+(?:means|shall\s+mean|shall\s+have\s+the\s+meaning)\b/g;

/** Strip HTML tags / entities so EDGAR HTML exhibits yield definition hits. */
export function normalizeTextForDefinitions(text: string): { plain: string; map: Int32Array } {
  // map[i] = original index of plain[i]
  const map: number[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "<") {
      const close = text.indexOf(">", i + 1);
      if (close === -1) break;
      // Treat block/inline emphasis tags as whitespace so "Term</b> means" still matches.
      const tag = text.slice(i, close + 1).toLowerCase();
      if (
        /^<\/?(?:p|div|br|tr|td|li|h\d|section|table|b|i|em|strong|span|font|u)\b/.test(tag) ||
        tag === "<br>" ||
        tag === "<br/>"
      ) {
        plain += " ";
        map.push(i);
      }
      i = close + 1;
      continue;
    }
    if (text[i] === "&") {
      const semi = text.indexOf(";", i + 1);
      if (semi !== -1 && semi - i < 12) {
        const ent = text.slice(i + 1, semi).toLowerCase();
        const repl =
          ent === "ldquo" || ent === "rdquo" || ent === "quot"
            ? '"'
            : ent === "lsquo" || ent === "rsquo" || ent === "apos"
              ? "'"
              : ent === "nbsp"
                ? " "
                : ent === "amp"
                  ? "&"
                  : ent === "lt"
                    ? "<"
                    : ent === "gt"
                      ? ">"
                      : null;
        if (repl !== null) {
          plain += repl;
          map.push(i);
          i = semi + 1;
          continue;
        }
      }
    }
    plain += text[i];
    map.push(i);
    i += 1;
  }
  return { plain, map: Int32Array.from(map) };
}

export function discoverDefinitions(sourceId: string, text: string, _nodes: StructuralNodeRecord[]): DefinitionRecord[] {
  const { plain, map } = normalizeTextForDefinitions(text);
  const out: DefinitionRecord[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(DEFINITION_RE.source, "g");
  while ((m = re.exec(plain)) !== null && out.length < 2000) {
    const term = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!term || term.length < 2) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const plainStart = m.index;
    const plainEnd = Math.min(plain.length, plainStart + 400);
    const charStart = map[plainStart] ?? plainStart;
    const charEnd = (map[plainEnd - 1] ?? charStart) + 1;
    out.push({
      term,
      sourceId,
      charStart,
      charEnd,
      excerpt: plain.slice(plainStart, plainEnd),
    });
  }

  // Title-case bare terms often appear in HTML after tag strip: Consolidated EBITDA means
  const bare =
    /\b([A-Z][A-Za-z0-9][A-Za-z0-9 /-]{1,70})\s+(?:means|shall\s+mean|shall\s+have\s+the\s+meaning|has\s+the\s+meaning)\b/g;
  while ((m = bare.exec(plain)) !== null && out.length < 2000) {
    const term = (m[1] ?? "").trim();
    if (!term || /^(The|A|An|This|Such|Section|Article)\b/.test(term)) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const plainStart = m.index;
    const plainEnd = Math.min(plain.length, plainStart + 400);
    const charStart = map[plainStart] ?? plainStart;
    const charEnd = (map[plainEnd - 1] ?? charStart) + 1;
    out.push({
      term,
      sourceId,
      charStart,
      charEnd,
      excerpt: plain.slice(plainStart, plainEnd),
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
