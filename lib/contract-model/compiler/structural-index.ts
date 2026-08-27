/**
 * Phase 2A - internal navigation API over a parsed structural tree (task
 * §10). Pure, in-memory, built once from a document's own StructuralNode[]
 * plus its detected definitions/references, then queried in O(1)/O(log n)
 * via prebuilt maps - never a full-document rescan per lookup. This is
 * deliberately NOT a customer-facing API; it is the internal substrate a
 * future covenant-discovery/retrieval system calls into.
 */
import type { StructuralNode } from "./types";
import type { DetectedDefinition } from "./structural-definitions";
import type { DetectedReference } from "./structural-references";

export type TextMode = "OWN" | "DESCENDANTS";

export interface StructuralIndex {
  /** Exact lookup by document-scoped nodeKey - never fuzzy, never a partial match. */
  getNode(nodeKey: string): StructuralNode | undefined;
  /** Exact lookup by (documentId, sectionRef) - the natural key callers citing a rule's own sourceSectionRef already have. */
  getNodeByRef(documentId: string, sectionRef: string): StructuralNode | undefined;
  getChildren(nodeKey: string): StructuralNode[];
  getParent(nodeKey: string): StructuralNode | undefined;
  /** Root-to-parent order (closest ancestor last), never including the node itself. */
  getAncestors(nodeKey: string): StructuralNode[];
  /** Every other node sharing the same direct parent, in document order - never including the node itself. */
  getSiblings(nodeKey: string): StructuralNode[];
  /** Every node structurally beneath this one, at any depth, in document order. */
  getDescendants(nodeKey: string): StructuralNode[];
  /**
   * `documentId`, when supplied, disambiguates a term declared in more
   * than one document of the SAME multi-document index (task §21's own
   * cross-instrument-isolation requirement, discovered as a real,
   * previously-dormant gap by Phase 2D: a flat term->definition map is
   * only safe when the index covers exactly one document at a time, which
   * was true for every caller before Phase 2D's own multi-document
   * package index). Omitting it preserves the original single-document
   * behavior (first/only match) for every existing caller.
   */
  getDefinition(term: string, documentId?: string): DetectedDefinition | undefined;
  /**
   * Phase 2D extension (docs/phase-2d-covenant-context-retrieval.md §8) -
   * `getDefinition`'s own DetectedDefinition only carries a bounded
   * 200-char excerpt (structural-definitions.ts's own EXCERPT_LENGTH); a
   * downstream analyzer needs the FULL definition body, which real
   * drafting never marks with an explicit end boundary. Computed
   * structurally, never by content heuristics: a definition's own span
   * runs from its declaration's charStart to the NEXT definition
   * declaration's charStart in the same document (or that document's own
   * text end for the last definition) - the same "use structural
   * boundaries, not arbitrary chunks" discipline this codebase already
   * applies everywhere else (Phase 2B's own batching rule, task §23).
   */
  getDefinitionFullText(term: string, documentId?: string): string | undefined;
  /** Every definition detected in the whole package, in document order - lets a caller scan for known-term mentions without re-deriving the definitions list Phase 2A already built this index from. */
  allDefinitions(): DetectedDefinition[];
  /** Every reference whose source is this node (or a descendant of it, when includeDescendants is true). */
  findReferencesFrom(nodeKey: string, includeDescendants?: boolean): DetectedReference[];
  /** Reverse lookup (task §9): every reference that resolves TO this node. */
  findReferencesTo(nodeKey: string): DetectedReference[];
  /** "OWN" = this node's own text only (excludes children); "DESCENDANTS" = own text plus every nested descendant. */
  getNodeText(nodeKey: string, mode: TextMode): string;
  searchStructuralNodes(predicate: (node: StructuralNode) => boolean): StructuralNode[];
  /** Every node, in document order - the same evidence a coverage/audit pass needs without a second parse. */
  allNodes(): StructuralNode[];
}

function normalizeRef(ref: string): string {
  return ref.replace(/\s+/g, "");
}

export function buildStructuralIndex(nodesByDocument: Map<string, { text: string; nodes: StructuralNode[] }>, definitions: DetectedDefinition[], references: DetectedReference[]): StructuralIndex {
  const allNodesSorted: StructuralNode[] = [];
  const byKey = new Map<string, StructuralNode>();
  const childrenByParentKey = new Map<string, StructuralNode[]>();

  for (const [documentId, { nodes }] of nodesByDocument) {
    const sorted = [...nodes].sort((a, b) => a.charStart - b.charStart);
    for (const n of sorted) {
      byKey.set(n.nodeKey, n);
      allNodesSorted.push(n);
      const parentKey = n.parentSectionRef ? `${documentId}::${normalizeRef(n.parentSectionRef)}` : null;
      if (parentKey) {
        const list = childrenByParentKey.get(parentKey) ?? [];
        list.push(n);
        childrenByParentKey.set(parentKey, list);
      }
    }
  }
  allNodesSorted.sort((a, b) => a.charStart - b.charStart);

  const definitionsByNormalizedTerm = new Map(definitions.map((d) => [d.normalizedTerm, d] as const));
  const definitionsByDocumentSorted = new Map<string, DetectedDefinition[]>();
  for (const d of definitions) {
    const list = definitionsByDocumentSorted.get(d.documentId) ?? [];
    list.push(d);
    definitionsByDocumentSorted.set(d.documentId, list);
  }
  for (const list of definitionsByDocumentSorted.values()) list.sort((a, b) => a.charStart - b.charStart);

  const referencesBySourceKey = new Map<string, DetectedReference[]>();
  const referencesByTargetKey = new Map<string, DetectedReference[]>();
  for (const r of references) {
    if (r.sourceNodeKey) {
      const list = referencesBySourceKey.get(r.sourceNodeKey) ?? [];
      list.push(r);
      referencesBySourceKey.set(r.sourceNodeKey, list);
    }
    if (r.targetNodeKey) {
      const list = referencesByTargetKey.get(r.targetNodeKey) ?? [];
      list.push(r);
      referencesByTargetKey.set(r.targetNodeKey, list);
    }
  }

  function getChildren(nodeKey: string): StructuralNode[] {
    return [...(childrenByParentKey.get(nodeKey) ?? [])];
  }

  function getDescendants(nodeKey: string): StructuralNode[] {
    const out: StructuralNode[] = [];
    const stack = [...getChildren(nodeKey)];
    while (stack.length > 0) {
      const n = stack.shift()!;
      out.push(n);
      stack.push(...getChildren(n.nodeKey));
    }
    return out.sort((a, b) => a.charStart - b.charStart);
  }

  return {
    getNode: (nodeKey) => byKey.get(nodeKey),
    getNodeByRef: (documentId, sectionRef) => byKey.get(`${documentId}::${normalizeRef(sectionRef)}`),
    getChildren,
    getParent: (nodeKey) => {
      const node = byKey.get(nodeKey);
      if (!node?.parentSectionRef) return undefined;
      return byKey.get(`${node.documentId}::${normalizeRef(node.parentSectionRef)}`);
    },
    getAncestors: (nodeKey) => {
      const out: StructuralNode[] = [];
      let current = byKey.get(nodeKey);
      const guard = new Set<string>();
      while (current?.parentSectionRef) {
        const parentKey = `${current.documentId}::${normalizeRef(current.parentSectionRef)}`;
        if (guard.has(parentKey)) break; // malformed-input safety: never infinite-loop on a cyclic parent chain.
        guard.add(parentKey);
        const parent = byKey.get(parentKey);
        if (!parent) break;
        out.unshift(parent);
        current = parent;
      }
      return out;
    },
    getSiblings: (nodeKey) => {
      const node = byKey.get(nodeKey);
      if (!node) return [];
      const parentKey = node.parentSectionRef ? `${node.documentId}::${normalizeRef(node.parentSectionRef)}` : null;
      const siblingPool = parentKey ? getChildren(parentKey) : allNodesSorted.filter((n) => n.documentId === node.documentId && n.parentSectionRef === null);
      return siblingPool.filter((n) => n.nodeKey !== nodeKey);
    },
    getDescendants,
    getDefinition: (term, documentId) => {
      const normalized = term.toLowerCase().replace(/\s+/g, " ").trim();
      if (documentId) return (definitionsByDocumentSorted.get(documentId) ?? []).find((d) => d.normalizedTerm === normalized);
      return definitionsByNormalizedTerm.get(normalized);
    },
    getDefinitionFullText: (term, documentId) => {
      const normalized = term.toLowerCase().replace(/\s+/g, " ").trim();
      const def = documentId ? (definitionsByDocumentSorted.get(documentId) ?? []).find((d) => d.normalizedTerm === normalized) : definitionsByNormalizedTerm.get(normalized);
      if (!def) return undefined;
      const doc = nodesByDocument.get(def.documentId);
      if (!doc) return undefined;
      const sameDocumentDefs = definitionsByDocumentSorted.get(def.documentId) ?? [];
      const ownIndex = sameDocumentDefs.findIndex((d) => d.charStart === def.charStart && d.normalizedTerm === def.normalizedTerm);
      const next = ownIndex >= 0 ? sameDocumentDefs[ownIndex + 1] : undefined;
      const spanEnd = next ? next.charStart : doc.text.length;
      return doc.text.slice(def.charStart, spanEnd);
    },
    allDefinitions: () => [...definitions],
    findReferencesFrom: (nodeKey, includeDescendants = false) => {
      const direct = referencesBySourceKey.get(nodeKey) ?? [];
      if (!includeDescendants) return [...direct];
      const descendantKeys = new Set(getDescendants(nodeKey).map((n) => n.nodeKey));
      const nested = [...descendantKeys].flatMap((k) => referencesBySourceKey.get(k) ?? []);
      return [...direct, ...nested].sort((a, b) => a.charStart - b.charStart);
    },
    findReferencesTo: (nodeKey) => [...(referencesByTargetKey.get(nodeKey) ?? [])],
    getNodeText: (nodeKey, mode) => {
      const node = byKey.get(nodeKey);
      if (!node) return "";
      const doc = nodesByDocument.get(node.documentId);
      if (!doc) return "";
      if (mode === "DESCENDANTS") return doc.text.slice(node.charStart, node.charEnd);
      const children = getChildren(nodeKey);
      const ownEnd = children.length > 0 ? Math.min(...children.map((c) => c.charStart)) : node.charEnd;
      return doc.text.slice(node.charStart, ownEnd);
    },
    searchStructuralNodes: (predicate) => allNodesSorted.filter(predicate),
    allNodes: () => [...allNodesSorted],
  };
}
