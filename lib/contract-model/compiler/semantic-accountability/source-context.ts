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
  /** Absolute char offset of operativeSourceText within the document, when known - required for truncation detection. */
  operativeCharStart: number | null;
  /** The full document text, when available - enables definition-span truncation detection for windows that are not node-anchored (definitions live in prose). */
  documentText?: string | null;
  /** Total character budget across all expansion regions (default 24,000 - bounded local context, never the whole agreement). */
  budgetChars?: number;
  /** Per-expansion-region cap (default 6,000). */
  maxExpansionRegionChars?: number;
}

const DEFAULT_BUDGET_CHARS = 24_000;
const DEFAULT_REGION_CHARS = 6_000;
/** Absolute references stated in prose ("Section 6.01(b)(iii)", "§ 7.2(a)"); relative ones ("clause (x)") are only resolvable through the anchoring node's own detected references. */
const ABSOLUTE_REFERENCE_RE = /\b(?:Sections?|§+)\s*(\d+\.\d+(?:\([a-zA-Z0-9]{1,6}\))*)/g;

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function resolveSourceContext(input: ResolveSourceContextInput): SourceContextResult {
  const { index, documentId, operativeSourceText } = input;
  const budgetChars = input.budgetChars ?? DEFAULT_BUDGET_CHARS;
  const regionCap = input.maxExpansionRegionChars ?? DEFAULT_REGION_CHARS;
  const reasons: string[] = [];
  const unresolved: UnresolvedSourceReference[] = [];

  const anchor: StructuralNode | undefined = input.anchorNodeId ? index.getNodeById(input.anchorNodeId) : undefined;
  if (input.anchorNodeId && !anchor) reasons.push(`anchor node "${input.anchorNodeId}" does not exist in the structural index`);

  const opStart = input.operativeCharStart ?? anchor?.charStart ?? -1;
  const opEnd = opStart >= 0 ? opStart + operativeSourceText.length : -1;

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
  };

  // --- (a) completeness of the operative unit ---
  let truncated = false;
  let structurallyIncomplete = false;
  let completenessKnown = false;

  if (anchor && input.operativeCharStart !== null) {
    completenessKnown = true;
    const anchorText = index.getNodeText(anchor.nodeId, "DESCENDANTS");
    if (anchorText.trim().length === 0) {
      structurallyIncomplete = true;
      reasons.push(`anchor node ${anchor.sectionRef} has no text in the structural index`);
    }
    if (opEnd < anchor.charEnd) {
      const omitted = (input.documentText ?? "").slice(opEnd, anchor.charEnd);
      const omittedNonWhitespace = input.documentText ? omitted.trim().length : anchor.charEnd - opEnd;
      if (omittedNonWhitespace > 0) {
        truncated = true;
        reasons.push(`operative window ends at char ${opEnd} but the anchoring unit ${anchor.sectionRef} ends at char ${anchor.charEnd} - ${anchor.charEnd - opEnd} chars of the unit's own text were never supplied`);
      }
    }
  } else if (input.operativeCharStart !== null && input.documentText) {
    // Definition-prose window: locate the definition span the window's tail sits in.
    const defs = index
      .allDefinitions()
      .filter((d) => d.documentId === documentId)
      .sort((a, b) => a.charStart - b.charStart);
    if (defs.length > 0) {
      completenessKnown = true;
      const lastInsideIdx = defs.reduce((acc, d, i) => (d.charStart >= opStart && d.charStart < opEnd ? i : acc), -1);
      const coveringIdx = lastInsideIdx >= 0 ? lastInsideIdx : defs.reduce((acc, d, i) => (d.charStart <= opStart ? i : acc), -1);
      if (coveringIdx >= 0) {
        const next = defs[coveringIdx + 1];
        // The unit ends at the next definition, else at the end of the deepest structural node enclosing the window (the definitions section itself), else at the end of the document - never assumed to be the window's own end.
        const enclosing = index
          .allNodes()
          .filter((n) => n.documentId === documentId && n.charStart <= opStart && opStart < n.charEnd)
          .sort((a, b) => a.charEnd - a.charStart - (b.charEnd - b.charStart))[0];
        const unitEnd = next ? next.charStart : Math.min(input.documentText.length, enclosing ? enclosing.charEnd : input.documentText.length);
        if (unitEnd > opEnd) {
          const omitted = input.documentText.slice(opEnd, unitEnd);
          if (omitted.trim().length > 0) {
            truncated = true;
            reasons.push(`operative window ends at char ${opEnd} inside the definition of "${defs[coveringIdx]!.exactTerm}" (which runs to char ${unitEnd}) - ${omitted.trim().length} chars of that definition were never supplied`);
          }
        }
      }
    }
  } else if (input.documentText !== undefined && input.documentText !== null && input.documentText === operativeSourceText) {
    completenessKnown = true; // the whole document is the unit
  }

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
