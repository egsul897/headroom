/**
 * Phase 2A - general deterministic cross-reference index (task §8/§9).
 *
 * Distinct from stage-dependency-resolution.ts's detectCrossReferences,
 * which only fires behind five specific relationship-connector phrases
 * ("subject to", "pursuant to", etc.) and never records which node a
 * reference came FROM (so it cannot support a reverse-reference lookup).
 * This module detects any EXPLICIT structural reference regardless of
 * surrounding phrase, and attributes every one to its enclosing source
 * node, which is what makes "what provisions reference this node?"
 * (task §9) answerable at all.
 *
 * Resolution is exact-structural-identity only (never fuzzy, never an LLM
 * guess) and scoped to the SAME document only, matching the way a real
 * agreement's own internal cross-references work: "Section 6.01" inside
 * Document A means Document A's own Section 6.01, never Document B's -
 * an unresolved reference is always preferred over a guessed one.
 */
import type { StructuralNode } from "./types";

export type ReferenceTargetKind = "ARTICLE" | "SECTION" | "CLAUSE" | "SCHEDULE" | "EXHIBIT";

export interface DetectedReference {
  documentId: string;
  /** The enclosing structural node's nodeKey this reference physically appears inside, or null if it appears before any structural node was found (e.g. in a preamble). */
  sourceNodeKey: string | null;
  referenceText: string;
  targetKind: ReferenceTargetKind;
  /** Normalized target ref exactly as it would appear in a StructuralNode.sectionRef, e.g. "6.01", "6.01(a)", "VI" - or the raw schedule/exhibit label when not a section/article/clause. */
  normalizedTarget: string;
  /** The resolved node's nodeKey, only when an EXACT match exists among this document's own structural nodes. */
  targetNodeKey: string | null;
  resolved: boolean;
  unresolvedReason: string | null;
  charStart: number;
  charEnd: number;
}

interface ReferencePattern {
  kind: ReferenceTargetKind;
  re: RegExp;
  /** Extracts the normalized target ref from a match, e.g. "6.01(a)" from "Section 6.01(a)". */
  normalize: (m: RegExpExecArray) => string;
}

const PATTERNS: ReferencePattern[] = [
  // "Section 6.01", "SECTION 6.01", "§ 6.01", optionally with trailing clause markers: "Section 6.01(a)(i)".
  { kind: "SECTION", re: /(?:Section|SECTION|§)\s?(\d+\.\d+(?:\([a-zA-Z0-9]{1,7}\))*)/g, normalize: (m) => m[1]!.replace(/\s+/g, "") },
  // "Article VI", "ARTICLE 6".
  { kind: "ARTICLE", re: /Article\s+([IVXLC]+|\d+)/gi, normalize: (m) => m[1]!.toUpperCase() },
  // A bare relative clause/subsection reference: "clause (iv)", "subsection (b)", "clause (a)(i)" - resolved relative to the enclosing section by the caller (resolveReferences), since the marker alone has no absolute meaning.
  { kind: "CLAUSE", re: /(?:clause|subsection|paragraph)\s+(\([a-zA-Z0-9]{1,7}\)(?:\([a-zA-Z0-9]{1,7}\))*)/gi, normalize: (m) => m[1]!.replace(/\s+/g, "") },
  // "Schedule 1.01", "Schedule I".
  { kind: "SCHEDULE", re: /Schedule\s+([A-Z0-9]+(?:\.\d+)?)/g, normalize: (m) => m[1]! },
  // "Exhibit A", "Exhibit 10.1".
  { kind: "EXHIBIT", re: /Exhibit\s+([A-Z0-9]+(?:\.\d+)?)/g, normalize: (m) => m[1]! },
];

/**
 * Phase 2D reuse (docs/phase-2d-covenant-context-retrieval.md §8/§12) -
 * absolute (never relative-clause, which needs an enclosing SECTION this
 * caller's text may not have one of) Section/Article/Schedule/Exhibit
 * mentions in arbitrary text, with no enclosing-node computation - for
 * detecting references INSIDE a definition's own full text (which is
 * prose, not itself a StructuralNode Phase 2A's clause tree covers), where
 * detectStructuralReferences's own enclosing-node/relative-clause logic
 * would need char offsets relative to the whole document this caller does
 * not have. Reuses the exact same SECTION/ARTICLE/SCHEDULE/EXHIBIT
 * patterns as detectStructuralReferences, never a second pattern set.
 */
export interface RawReferenceMention {
  targetKind: ReferenceTargetKind;
  normalizedTarget: string;
  referenceText: string;
  charStart: number;
}

export function detectAbsoluteReferenceMentions(text: string): RawReferenceMention[] {
  const results: RawReferenceMention[] = [];
  for (const pattern of PATTERNS) {
    if (pattern.kind === "CLAUSE") continue; // relative-only, needs an enclosing SECTION this caller doesn't have.
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      results.push({ targetKind: pattern.kind, normalizedTarget: pattern.normalize(m), referenceText: m[0], charStart: m.index });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return results.sort((a, b) => a.charStart - b.charStart);
}

/** Deepest structural node whose owned span contains a given offset - shared with structural-definitions.ts so both use the identical "which node is this text physically inside" rule. */
export function findEnclosingNode(charStart: number, nodesSortedByStart: StructuralNode[]): StructuralNode | null {
  // Deepest (most specific) node whose owned span contains this offset - nodes are pre-sorted by charStart, so the LAST node starting at-or-before charStart whose charEnd covers it is the tightest containing node found by scanning candidates in reverse start order.
  let best: StructuralNode | null = null;
  for (const n of nodesSortedByStart) {
    if (n.charStart > charStart) break;
    if (n.charEnd > charStart) {
      if (!best || n.charStart >= best.charStart) best = n;
    }
  }
  return best;
}

/**
 * Detects every explicit structural reference in one document's text and
 * attributes each to its enclosing node. `nodes` must be this document's
 * own structural nodes only (never mixed across documents), matching the
 * document-scoped identity discipline the rest of this module relies on.
 */
export function detectStructuralReferences(documentId: string, text: string, nodes: StructuralNode[]): DetectedReference[] {
  const sorted = [...nodes].sort((a, b) => a.charStart - b.charStart);
  const byKey = new Map(sorted.map((n) => [n.nodeKey, n] as const));
  const results: DetectedReference[] = [];

  for (const pattern of PATTERNS) {
    const re = new RegExp(pattern.re.source, pattern.re.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const charStart = m.index;
      const charEnd = m.index + m[0].length;
      const enclosing = findEnclosingNode(charStart, sorted);
      let normalizedTarget = pattern.normalize(m);
      let targetKind = pattern.kind;

      // A bare clause/subsection reference ("clause (iv)") is relative to
      // its enclosing SECTION - resolve it to a fully-qualified ref before
      // lookup, exactly the same exact-structural-composition discipline
      // Phase 1A's evaluator work established (never fuzzy).
      if (pattern.kind === "CLAUSE" && enclosing) {
        const enclosingSectionRef = enclosing.nodeType === "SECTION" ? enclosing.sectionRef : enclosing.parentSectionRef;
        if (enclosingSectionRef) {
          normalizedTarget = `${enclosingSectionRef}${normalizedTarget}`;
          targetKind = "SECTION";
        }
      }

      // SCHEDULE/EXHIBIT references can never resolve against this tree:
      // Phase 2A does not parse schedules/exhibits as structural nodes at
      // all (task §13 - deferred), so a "Schedule 6.01" reference must
      // never be matched against a SECTION node that coincidentally shares
      // the same number - a real false-resolution risk this guard closes.
      const targetNodeKey = `${documentId}::${normalizedTarget}`;
      const resolvedNode = targetKind === "SCHEDULE" || targetKind === "EXHIBIT" ? undefined : byKey.get(targetNodeKey);
      const resolved = !!resolvedNode;

      results.push({
        documentId,
        sourceNodeKey: enclosing?.nodeKey ?? null,
        referenceText: m[0],
        targetKind,
        normalizedTarget,
        targetNodeKey: resolved ? targetNodeKey : null,
        resolved,
        unresolvedReason: resolved ? null : `no ${targetKind} node with ref "${normalizedTarget}" exists among this document's own structural nodes`,
        charStart,
        charEnd,
      });
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  return results.sort((a, b) => a.charStart - b.charStart);
}
