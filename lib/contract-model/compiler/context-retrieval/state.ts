/**
 * Phase 2D - shared mutable accumulator every retrieval pass writes into.
 * One RetrievalState per buildCovenantContextBundle call - never shared
 * across candidates, so one covenant's retrieval can never leak an item
 * into another's bundle by accident.
 */
import type { ContextItem, ContextItemType, DependencyEdge, DependencyEdgeType, RetrievalBudget, RetrievalMethod, UnresolvedDependency } from "./types";
import { computeItemId } from "./identity";

export interface RetrievalState {
  budget: RetrievalBudget;
  items: Map<string, ContextItem>;
  edges: DependencyEdge[];
  edgeKeySet: Set<string>;
  unresolved: UnresolvedDependency[];
  readSpans: { documentId: string; text: string }[];
  stopReasons: Set<string>;
  textBudgetUsed: number;
  itemsConsidered: number;
  maxDefinitionDepthReached: number;
  maxCrossReferenceDepthReached: number;
  crossReferenceTraversals: number;
  crossDocumentLeads: number;
  duplicatePathsDeduplicated: number;
  /** documentId::normalizedPhrase already recorded as an UNRESOLVED_DEFINED_TERM - the fallback pass runs once per retrieved item's own text (operative node, every structural sibling/parent/child, every definition), so the same real undeclared term can legitimately surface from more than one item's text; this prevents the same term being reported as a separate unresolved dependency more than once. */
  seenUnresolvedTermPhrases: Set<string>;
}

export function createRetrievalState(budget: RetrievalBudget): RetrievalState {
  return {
    budget,
    items: new Map(),
    edges: [],
    edgeKeySet: new Set(),
    unresolved: [],
    readSpans: [],
    stopReasons: new Set(),
    textBudgetUsed: 0,
    itemsConsidered: 0,
    maxDefinitionDepthReached: 0,
    maxCrossReferenceDepthReached: 0,
    crossReferenceTraversals: 0,
    crossDocumentLeads: 0,
    duplicatePathsDeduplicated: 0,
    seenUnresolvedTermPhrases: new Set(),
  };
}

/** True if this add would land within budget; records the BUDGET_EXCEEDED stop reason and returns false otherwise - callers must check before adding, never truncate silently (task §24). */
export function withinBudget(state: RetrievalState, additionalChars: number): boolean {
  if (state.items.size >= state.budget.maxItems) {
    state.stopReasons.add("CONTEXT_BUDGET_EXCEEDED: maxItems reached");
    return false;
  }
  if (state.textBudgetUsed + additionalChars > state.budget.maxTextBudgetChars) {
    state.stopReasons.add("CONTEXT_BUDGET_EXCEEDED: maxTextBudgetChars reached");
    return false;
  }
  return true;
}

/**
 * Adds (or, if the same itemId already exists, no-ops on the item itself
 * but still records the new path via a fresh edge) an item - dedup is by
 * itemId (task §10/§30 - "deduplicate the context node but preserve all
 * material dependency paths"). Returns the item actually stored (existing
 * or new) so callers can chain further traversal from it.
 */
export function addItem(state: RetrievalState, item: Omit<ContextItem, "itemId">): ContextItem {
  const itemId = computeItemId(item.documentId, item.normalizedRef, item.type);
  state.itemsConsidered++;
  const existing = state.items.get(itemId);
  if (existing) {
    state.duplicatePathsDeduplicated++;
    return existing;
  }
  const full: ContextItem = { itemId, ...item };
  state.items.set(itemId, full);
  state.textBudgetUsed += full.excerptText.length;
  state.readSpans.push({ documentId: full.documentId, text: full.excerptText });
  return full;
}

export function addEdge(state: RetrievalState, fromItemId: string, toItemId: string, edgeType: DependencyEdgeType, reason: string): void {
  const key = `${fromItemId}::${toItemId}::${edgeType}`;
  if (state.edgeKeySet.has(key)) return;
  state.edgeKeySet.add(key);
  state.edges.push({ fromItemId, toItemId, edgeType, reason });
}

export function makeItemInput(type: ContextItemType, documentId: string, structuralNodeKey: string | null, normalizedRef: string, sourceCitation: string, excerptText: string, reason: string, retrievalDepth: number, retrievalPath: string[], retrievalMethod: RetrievalMethod, confidence: number | null): Omit<ContextItem, "itemId"> {
  return { type, documentId, structuralNodeKey, normalizedRef, sourceCitation, excerptText, reason, retrievalDepth, retrievalPath, retrievalMethod, confidence };
}
