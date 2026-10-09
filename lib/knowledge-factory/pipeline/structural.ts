/**
 * Structural extraction reusing Headroom's Phase 2 structural compiler.
 * Definitions and cross-references prefer Phase 2 detectors with target resolution;
 * HTML-normalized KF regex remains a supplement for EDGAR markup.
 * Persists exact source spans; records ambiguity when identity is not unique.
 */

import { parseDocumentStructureWithTriage } from "../../contract-model/compiler/stage-structure";
import { buildStructuralIndex } from "../../contract-model/compiler/structural-index";
import { detectStructuralDefinitions } from "../../contract-model/compiler/structural-definitions";
import { detectStructuralReferences } from "../../contract-model/compiler/structural-references";
import type { CompilerDocumentInput } from "../../contract-model/compiler/types";
import type { StructuralNode } from "../../contract-model/compiler/types";
import type { CrossReferenceRecord, DefinitionRecord, StructuralNodeRecord } from "../types";

export interface StructuralExtractionResult {
  nodes: StructuralNodeRecord[];
  ambiguousCount: number;
  definitions: DefinitionRecord[];
  crossReferences: CrossReferenceRecord[];
  /** Count of cross-refs with UNIQUE target resolution. */
  resolvedCrossReferenceCount: number;
  /** Phase 2 structural-index health ERROR count (corruption), never INFO ambiguity. */
  structuralHealthErrors: number;
}

export function extractStructure(sourceId: string, text: string): StructuralExtractionResult {
  const doc: CompilerDocumentInput = {
    documentId: sourceId,
    label: sourceId,
    text,
  };
  const triage = parseDocumentStructureWithTriage(doc);
  const compilerNodes: StructuralNode[] = triage.nodes;

  const nodes: StructuralNodeRecord[] = compilerNodes.map((n) => ({
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

  // Phase 2 detectors (occurrence-safe, enclosing-node attributed).
  const structuralDefs = detectStructuralDefinitions(sourceId, text, compilerNodes);
  const structuralRefs = detectStructuralReferences(sourceId, text, compilerNodes);
  const index = buildStructuralIndex(
    new Map([[sourceId, { text, nodes: compilerNodes }]]),
    structuralDefs,
    structuralRefs,
  );
  const healthErrors = index.healthDiagnostics().filter((h) => h.severity === "ERROR").length;

  const definitions = mergeDefinitions(
    sourceId,
    structuralDefs.map((d) => ({
      term: d.exactTerm,
      sourceId,
      nodeId: d.sourceNodeId ?? undefined,
      charStart: d.charStart,
      charEnd: d.charEnd,
      excerpt: d.definitionExcerpt,
    })),
    discoverDefinitionsHtmlFallback(sourceId, text),
  );

  const crossReferences: CrossReferenceRecord[] = structuralRefs.map((r) => ({
    sourceId,
    fromNodeId: r.sourceNodeId ?? undefined,
    rawReference: r.referenceText,
    charStart: r.charStart,
    charEnd: r.charEnd,
    targetSectionRef: r.normalizedTarget,
    targetNodeId: r.targetNodeId,
    resolved: r.resolved,
    targetAmbiguous: r.targetAmbiguous,
    unresolvedReason: r.unresolvedReason,
  }));

  // Supplement unresolved raw xrefs only when Phase 2 found none (e.g. empty structure).
  if (crossReferences.length === 0) {
    for (const raw of discoverCrossReferencesLegacy(sourceId, text)) {
      const targetSectionRef = normalizeRefFromRaw(raw.rawReference);
      const resolution = targetSectionRef
        ? index.resolveUniqueNodeByRef(sourceId, targetSectionRef)
        : null;
      crossReferences.push({
        ...raw,
        targetSectionRef,
        targetNodeId: resolution?.status === "UNIQUE" ? resolution.node.nodeId : null,
        resolved: resolution?.status === "UNIQUE",
        targetAmbiguous: resolution?.status === "AMBIGUOUS",
        unresolvedReason:
          resolution?.status === "UNIQUE"
            ? null
            : resolution?.status === "AMBIGUOUS"
              ? "AMBIGUOUS_TARGET"
              : targetSectionRef
                ? "TARGET_NOT_FOUND"
                : "UNPARSEABLE_REFERENCE",
      });
    }
  }

  const resolvedCrossReferenceCount = crossReferences.filter((c) => c.resolved).length;

  return {
    nodes,
    ambiguousCount: triage.ambiguousCandidates.length,
    definitions,
    crossReferences,
    resolvedCrossReferenceCount,
    structuralHealthErrors: healthErrors,
  };
}

function mergeDefinitions(
  sourceId: string,
  primary: DefinitionRecord[],
  fallback: DefinitionRecord[],
): DefinitionRecord[] {
  const seen = new Set(primary.map((d) => d.term.toLowerCase()));
  const out = primary.slice();
  for (const d of fallback) {
    const key = d.term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...d, sourceId });
    if (out.length >= 2000) break;
  }
  return out;
}

function normalizeRefFromRaw(raw: string): string | null {
  const m = raw.match(/\b(?:Section|Article|clause)\s+(\d+(?:\.\d+)*(?:\([a-z0-9]+\))*)/i);
  return m?.[1] ?? null;
}

const DEFINITION_RE =
  /[“"]([A-Z][^“"]{1,80})[”"]\s+(?:means|shall\s+mean|has\s+the\s+meaning|shall\s+have\s+the\s+meaning)\b|“([A-Z][^”]{1,80})”\s+(?:means|shall\s+mean|shall\s+have\s+the\s+meaning)\b|"([A-Z][^"]{1,80})"\s+(?:means|shall\s+mean|shall\s+have\s+the\s+meaning)\b/g;

/** Strip HTML tags / entities so EDGAR HTML exhibits yield definition hits. */
export function normalizeTextForDefinitions(text: string): { plain: string; map: Int32Array } {
  const map: number[] = [];
  let plain = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "<") {
      const close = text.indexOf(">", i + 1);
      if (close === -1) break;
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

/** @deprecated Prefer Phase 2 detectStructuralDefinitions via extractStructure. Kept for tests/callers. */
export function discoverDefinitions(
  sourceId: string,
  text: string,
  _nodes: StructuralNodeRecord[],
): DefinitionRecord[] {
  return discoverDefinitionsHtmlFallback(sourceId, text);
}

function discoverDefinitionsHtmlFallback(sourceId: string, text: string): DefinitionRecord[] {
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

/** Legacy unresolved xref scanner — used only when Phase 2 returns zero refs. */
export function discoverCrossReferences(sourceId: string, text: string): CrossReferenceRecord[] {
  return discoverCrossReferencesLegacy(sourceId, text);
}

function discoverCrossReferencesLegacy(sourceId: string, text: string): CrossReferenceRecord[] {
  const out: CrossReferenceRecord[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(XREF_RE.source, "gi");
  while ((m = re.exec(text)) !== null && out.length < 5000) {
    out.push({
      sourceId,
      rawReference: m[0]!,
      charStart: m.index,
      charEnd: m.index + m[0]!.length,
      resolved: false,
      targetAmbiguous: false,
      unresolvedReason: "LEGACY_UNRESOLVED_SCAN",
    });
  }
  return out;
}
