/** Source order: the ONE ordering of the map. Document ordinal, character offset, structural depth, structural ordinal. */
import type { StructuralNode } from "../compiler/types";
import type { SourceOrder } from "./types";

export const STRUCTURAL_DEPTH: Record<StructuralNode["nodeType"], number> = { ARTICLE: 0, SECTION: 1, SUBSECTION: 2, CLAUSE: 3, SUBCLAUSE: 4 };

export function documentOrdinals(documents: readonly { documentId: string }[]): Map<string, number> {
  const m = new Map<string, number>();
  documents.forEach((d, i) => { if (!m.has(d.documentId)) m.set(d.documentId, i); });
  return m;
}

export function sourceOrderOf(node: Pick<StructuralNode, "nodeType" | "charStart" | "ordinal">, documentOrdinal: number, extraDepth = 0): SourceOrder {
  return { documentOrdinal, charStart: node.charStart, structuralDepth: STRUCTURAL_DEPTH[node.nodeType] + extraDepth, localOrdinal: node.ordinal };
}

export function compareSourceOrder(a: SourceOrder, b: SourceOrder): number {
  return a.documentOrdinal - b.documentOrdinal || a.charStart - b.charStart || a.structuralDepth - b.structuralDepth || a.localOrdinal - b.localOrdinal;
}

/** Stable: ties (same position) break on the tiebreak key so the order is a pure function of content. */
export function sortBySourceOrder<T>(items: readonly T[], order: (t: T) => SourceOrder | null, tiebreak: (t: T) => string): T[] {
  return [...items].sort((x, y) => {
    const a = order(x), b = order(y);
    if (a && b) { const c = compareSourceOrder(a, b); if (c !== 0) return c; }
    else if (a && !b) return -1;
    else if (!a && b) return 1;
    return tiebreak(x) < tiebreak(y) ? -1 : tiebreak(x) > tiebreak(y) ? 1 : 0;
  });
}
