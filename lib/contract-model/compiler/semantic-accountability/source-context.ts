/**
 * SEMANTIC ACCOUNTABILITY - deterministic source-context sufficiency
 * (mission §12/§13). Runs BEFORE Pass A. Answers two questions no model can
 * answer for itself:
 *
 *  (a) Is the operative text I am about to inventory the COMPLETE semantic
 *      compilation unit, or a window cut inside it? (A1/B3's own source-
 *      truncation lesson: inventory cannot inventory source it never
 *      receives.) Decided against real structural boundaries - the anchoring
 *      node's own span, or the definition span the window sits in - never by
 *      raising a token/window limit globally.
 *  (b) Which OTHER provisions does the operative text EXPLICITLY reference,
 *      and can each be retrieved as a bounded, provenance-carrying region?
 *      (Phase 2D's own budget is spent on definition chains before explicit
 *      cross-references are reached - root cause 06 BF-5 - so the compilation
 *      unit Section 13 asks for is assembled here directly.)
 *
 * Every expansion carries documentId/nodeId/sectionRef/charStart/charEnd.
 * Source-only (independence contract in types.ts).
 */
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";
import { resolveReferenceTarget } from "./reference-resolver";
import type { ReferenceResolutionStatus, SourceContextRegion, SourceContextResult, SourceContextState, UnresolvedSourceReference } from "./types";

export interface ResolveSourceContextInput {
  index: StructuralIndex;
  documentId: string;
  operativeSourceText: string;
  /** The real physical node the operative text is anchored to, when known. */
  anchorNodeId: string | null;
  /** Absolute char offset of operativeSourceText within the document, when known - required for truncation detection and unit extension. */
  operativeCharStart: number | null;
  /** The full document text, when available - enables definition-span unit boundaries (definitions live in prose) and unit extension. */
  documentText?: string | null;
  /** Total character budget across all expansion regions (default 24,000 - bounded local context, never the whole agreement). */
  budgetChars?: number;
  /** Per-expansion-region cap (default 6,000). */
  maxExpansionRegionChars?: number;
  /** Largest unit the OPERATIVE window may be extended to (default 40,000). A unit larger than this is reported TRUNCATED_SOURCE - never silently cut, never handled by raising a global window limit. */
  maxOperativeUnitChars?: number;
}

const DEFAULT_BUDGET_CHARS = 24_000;
const DEFAULT_REGION_CHARS = 6_000;
const DEFAULT_OPERATIVE_UNIT_CHARS = 40_000;
/** Absolute references stated in prose ("Section 6.01(b)(iii)", "§ 7.2(a)"); relative ones ("clause (x)") are only resolvable through the anchoring node's own detected references. */
const ABSOLUTE_REFERENCE_RE = /\b(?:Sections?|§+)\s*(\d+\.\d+(?:\([a-zA-Z0-9]{1,6}\))*)/g;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

interface UnitBoundary {
  start: number;
  end: number;
  kind: "ANCHOR_NODE" | "DEFINITION_SPAN";
  label: string;
}

/** The SECTION-level structural unit the anchor belongs to (the anchor itself when it is a section, else its nearest SECTION ancestor, else the anchor) - the outer bound no definition span may leave. */
function sectionUnitOf(index: StructuralIndex, anchor: StructuralNode): StructuralNode {
  if (anchor.nodeType === "SECTION") return anchor;
  const ancestors = index.getAncestors(anchor.nodeId).filter((a) => a.nodeType === "SECTION").sort((a, b) => a.charEnd - a.charStart - (b.charEnd - b.charStart));
  return ancestors[0] ?? anchor;
}

/**
 * Decides the REAL unit boundary the supplied window belongs to (mission
 * §12/§13). Definition prose takes precedence over the anchoring node: a
 * window that starts inside (or at the head of) detected definitions
 * belongs to the definition span - from the covering definition (or the
 * window start when the first definition begins inside the window) through
 * the last definition that starts inside the window - never to the
 * enclosing definitions section as a whole (which may be hundreds of
 * thousands of characters). The definition span is used only when it lives
 * inside the anchor's own SECTION-level unit (an inline definition detected
 * far earlier in the agreement never captures a covenant window) and is
 * clamped to that unit. Otherwise the anchoring node's own span is the unit.
 * Null when no boundary can be established.
 */
function resolveUnitBoundary(index: StructuralIndex, documentId: string, anchor: StructuralNode | undefined, opStart: number, opEnd: number, documentText: string | null): UnitBoundary | null {
  if (opStart < 0) return null;
  if (documentText) {
    const defs = index
      .allDefinitions()
      .filter((d) => d.documentId === documentId)
      .sort((a, b) => a.charStart - b.charStart);
    const sectionUnit = anchor ? sectionUnitOf(index, anchor) : null;
    const coveringIdx = defs.reduce((acc, d, i) => (d.charStart <= opStart ? i : acc), -1);
    const firstInsideIdx = defs.findIndex((d) => d.charStart >= opStart && d.charStart < opEnd);
    const lastInsideIdx = defs.reduce((acc, d, i) => (d.charStart >= opStart && d.charStart < opEnd ? i : acc), -1);
    const covering = coveringIdx >= 0 && (!sectionUnit || (sectionUnit.charStart <= defs[coveringIdx]!.charStart && defs[coveringIdx]!.charStart < sectionUnit.charEnd)) ? defs[coveringIdx]! : null;
    const lead = covering ?? (firstInsideIdx >= 0 && (!sectionUnit || (sectionUnit.charStart <= defs[firstInsideIdx]!.charStart && defs[firstInsideIdx]!.charStart < sectionUnit.charEnd)) ? defs[firstInsideIdx]! : null);
    if (lead) {
      const lastIdx = Math.max(lastInsideIdx, covering ? coveringIdx : firstInsideIdx);
      const last = defs[lastIdx]!;
      const next = defs[lastIdx + 1];
      const enclosing = index
        .allNodes()
        .filter((n) => n.documentId === documentId && n.charStart <= last.charStart && last.charStart < n.charEnd)
        .sort((a, b) => a.charEnd - a.charStart - (b.charEnd - b.charStart))[0];
      let spanEnd = next ? next.charStart : Math.min(documentText.length, enclosing ? enclosing.charEnd : documentText.length);
      if (sectionUnit) spanEnd = Math.min(spanEnd, sectionUnit.charEnd);
      const spanStart = covering ? covering.charStart : opStart;
      if (spanEnd > spanStart && spanEnd > opStart) {
        return { start: spanStart, end: spanEnd, kind: "DEFINITION_SPAN", label: `definition span of "${lead.exactTerm}"${lastIdx > defs.indexOf(lead) ? ` through "${last.exactTerm}"` : ""}` };
      }
    }
  }
  if (anchor) return { start: anchor.charStart, end: anchor.charEnd, kind: "ANCHOR_NODE", label: `anchoring unit ${anchor.sectionRef ?? anchor.nodeId}` };
  return null;
}

export function resolveSourceContext(input: ResolveSourceContextInput): SourceContextResult {
  const { index, documentId } = input;
  const budgetChars = input.budgetChars ?? DEFAULT_BUDGET_CHARS;
  const regionCap = input.maxExpansionRegionChars ?? DEFAULT_REGION_CHARS;
  const unitCap = input.maxOperativeUnitChars ?? DEFAULT_OPERATIVE_UNIT_CHARS;
  const reasons: string[] = [];
  const unresolved: UnresolvedSourceReference[] = [];

  const anchor: StructuralNode | undefined = input.anchorNodeId ? index.getNodeById(input.anchorNodeId) : undefined;
  if (input.anchorNodeId && !anchor) reasons.push(`anchor node "${input.anchorNodeId}" does not exist in the structural index`);

  const windowStart = input.operativeCharStart ?? anchor?.charStart ?? -1;
  const windowEnd = windowStart >= 0 ? windowStart + input.operativeSourceText.length : -1;
  const documentText = input.documentText ?? null;
  // Text the unit can be extended from: the document itself, else the anchoring node's own text (offset by its charStart).
  const sliceDoc = (from: number, to: number): string | null => {
    if (documentText) return documentText.slice(from, to);
    if (anchor && from >= anchor.charStart && to <= anchor.charEnd) return index.getNodeText(anchor.nodeId, "DESCENDANTS").slice(from - anchor.charStart, to - anchor.charStart);
    return null;
  };

  // --- (a) completeness of the operative unit (mission §12) + compilation-unit extension (mission §13) ---
  let operativeSourceText = input.operativeSourceText;
  let opStart = windowStart;
  let opEnd = windowEnd;
  let truncated = false;
  let structurallyIncomplete = false;
  let completenessKnown = false;
  let unitExtension: SourceContextRegion["unitExtension"] = null;

  const boundary = input.operativeCharStart !== null ? resolveUnitBoundary(index, documentId, anchor, windowStart, windowEnd, documentText) : null;
  if (anchor && input.operativeCharStart !== null && index.getNodeText(anchor.nodeId, "DESCENDANTS").trim().length === 0) {
    structurallyIncomplete = true;
    completenessKnown = true;
    reasons.push(`anchor node ${anchor.sectionRef} has no text in the structural index`);
  } else if (boundary) {
    completenessKnown = true;
    // The resolved unit always CONTAINS the supplied window - extension only ever grows it (a window that reaches past its unit's boundary is over-inclusive, never cut).
    boundary.start = Math.min(boundary.start, windowStart);
    boundary.end = Math.max(boundary.end, windowEnd);
    const windowIsUnit = windowStart === boundary.start && windowEnd === boundary.end;
    if (!windowIsUnit) {
      const omittedBefore = boundary.start < windowStart ? (sliceDoc(boundary.start, windowStart) ?? "").trim().length : 0;
      const omittedAfter = boundary.end > windowEnd ? (sliceDoc(windowEnd, boundary.end) ?? "").trim().length : 0;
      const unitLength = boundary.end - boundary.start;
      if (omittedBefore + omittedAfter === 0) {
        // Only whitespace separates the window from its unit boundary - the window IS the unit.
      } else if (unitLength <= unitCap) {
        const unitText = sliceDoc(boundary.start, boundary.end);
        if (unitText !== null) {
          unitExtension = { originalCharStart: windowStart, originalCharEnd: windowEnd, unitBoundary: boundary.kind, note: `supplied window [${windowStart}, ${windowEnd}) extended to the ${boundary.label} [${boundary.start}, ${boundary.end}) - ${omittedBefore + omittedAfter} non-whitespace chars of the unit's own text were outside the window` };
          operativeSourceText = unitText;
          opStart = boundary.start;
          opEnd = boundary.end;
        } else {
          truncated = true;
          reasons.push(`operative window [${windowStart}, ${windowEnd}) sits inside the ${boundary.label} [${boundary.start}, ${boundary.end}) but the unit text is not retrievable (no document text) - ${omittedBefore + omittedAfter} chars of the unit's own text were never supplied`);
        }
      } else {
        truncated = true;
        reasons.push(`operative window [${windowStart}, ${windowEnd}) sits inside the ${boundary.label} [${boundary.start}, ${boundary.end}) whose ${unitLength} chars exceed the ${unitCap}-char operative-unit budget - ${omittedBefore + omittedAfter} chars of the unit's own text were never supplied (the window was NOT silently extended and the budget was NOT raised)`);
      }
    }
  } else if (documentText !== null && documentText === input.operativeSourceText) {
    completenessKnown = true; // the whole document is the unit
  }

  const operativeRegion: SourceContextRegion = {
    regionId: "operative",
    kind: "OPERATIVE",
    documentId,
    sourceNodeId: anchor?.nodeId ?? null,
    sectionRef: anchor?.sectionRef ?? null,
    charStart: opStart,
    charEnd: opEnd,
    text: operativeSourceText,
    expandedFor: null,
    truncatedAtBudget: false,
    unitExtension,
  };

  // --- (b) explicit cross-reference expansion ---
  const regions: SourceContextRegion[] = [operativeRegion];
  const seen = new Set<string>();
  const targets: { referenceText: string; resolvedNodeId: string | null; status: ReferenceResolutionStatus; note: string; candidateNodeIds: string[]; normalizedRef: string }[] = [];

  if (anchor) {
    for (const ref of index.findReferencesFrom(anchor.nodeId, true)) {
      if (ref.targetKind === "SCHEDULE" || ref.targetKind === "EXHIBIT") continue;
      const key = ref.normalizedTarget.replace(/\s+/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      if (ref.resolved && ref.targetNodeId && !ref.targetAmbiguous) {
        targets.push({ referenceText: ref.referenceText, resolvedNodeId: ref.targetNodeId, status: "UNIQUE", note: "resolved by structural reference detection", candidateNodeIds: [ref.targetNodeId], normalizedRef: key });
      } else {
        const r = resolveReferenceTarget(index, documentId, ref.normalizedTarget);
        targets.push({ referenceText: ref.referenceText, resolvedNodeId: r.node?.nodeId ?? null, status: r.status, note: r.note, candidateNodeIds: r.candidateNodeIds, normalizedRef: r.normalizedRef });
      }
    }
  }
  for (const m of operativeSourceText.matchAll(ABSOLUTE_REFERENCE_RE)) {
    const key = m[1]!.replace(/\s+/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const r = resolveReferenceTarget(index, documentId, m[1]!);
    targets.push({ referenceText: m[0], resolvedNodeId: r.node?.nodeId ?? null, status: r.status, note: r.note, candidateNodeIds: r.candidateNodeIds, normalizedRef: r.normalizedRef });
  }

  let totalChars = operativeSourceText.length;
  let expansionIndex = 0;
  for (const t of targets) {
    if (!t.resolvedNodeId) {
      unresolved.push({ referenceText: t.referenceText, normalizedRef: t.normalizedRef, status: t.status, reason: t.note, candidateNodeIds: t.candidateNodeIds });
      continue;
    }
    const node = index.getNodeById(t.resolvedNodeId);
    if (!node) {
      unresolved.push({ referenceText: t.referenceText, normalizedRef: t.normalizedRef, status: "NOT_FOUND", reason: "resolved nodeId missing from index", candidateNodeIds: t.candidateNodeIds });
      continue;
    }
    // Already inside the operative window (or the anchor itself / its ancestors) - nothing to expand.
    if (opStart >= 0 && overlaps(node.charStart, node.charEnd, opStart, opEnd)) continue;
    if (anchor && index.getAncestors(anchor.nodeId).some((a) => a.nodeId === node.nodeId)) continue;
    if (regions.some((r) => r.sourceNodeId === node.nodeId)) continue;
    // Already covered by a previously expanded region's own span (e.g. "Section 6.04(b)" when "Section 6.04" was already expanded) - never duplicate text into the unit.
    if (regions.some((r) => r.kind === "CROSS_REFERENCE_EXPANSION" && r.charStart <= node.charStart && node.charEnd <= r.charEnd && !r.truncatedAtBudget)) continue;
    if (totalChars >= budgetChars) {
      unresolved.push({ referenceText: t.referenceText, normalizedRef: t.normalizedRef, status: "OUT_OF_SCOPE", reason: `source-context budget (${budgetChars} chars) exhausted before this reference could be expanded`, candidateNodeIds: [node.nodeId] });
      continue;
    }
    const full = index.getNodeText(node.nodeId, "DESCENDANTS");
    const allowed = Math.min(regionCap, budgetChars - totalChars);
    const text = full.length > allowed ? full.slice(0, allowed) : full;
    totalChars += text.length;
    expansionIndex++;
    regions.push({
      regionId: `xref-${expansionIndex}`,
      kind: "CROSS_REFERENCE_EXPANSION",
      documentId: node.documentId,
      sourceNodeId: node.nodeId,
      sectionRef: node.sectionRef,
      charStart: node.charStart,
      charEnd: node.charStart + text.length,
      text,
      expandedFor: { referenceText: t.referenceText, resolution: t.status, note: t.note },
      truncatedAtBudget: text.length < full.length,
      unitExtension: null,
    });
  }

  let state: SourceContextState;
  if (truncated) state = "TRUNCATED_SOURCE";
  else if (structurallyIncomplete) state = "STRUCTURALLY_INCOMPLETE_SOURCE";
  else if (!completenessKnown) {
    state = "UNKNOWN_SOURCE_COMPLETENESS";
    reasons.push("no anchoring structural node and no document text were supplied, so the operative window's completeness against its own unit boundary cannot be established");
  } else state = regions.length > 1 ? "DEPENDENCY_EXPANDED_SOURCE" : "COMPLETE_LOCAL_SOURCE";

  return { state, regions, unresolvedReferences: unresolved, reasons, totalChars, budgetChars };
}
