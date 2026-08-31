/**
 * Phase 2D - shared mutable accumulator every retrieval pass writes into.
 * One RetrievalState per buildCovenantContextBundle call - never shared
 * across candidates, so one covenant's retrieval can never leak an item
 * into another's bundle by accident.
 */
import type { OperativeContractState, NodeSupersessionIndex } from "../amendment/types";
import { EMPTY_SUPERSESSION_INDEX, resolveOperativeDefinitionEvidence, resolveOperativeSectionEvidence, type DefinitionEvidenceResolution } from "../amendment/operative-state";
import type { StructuralIndex } from "../structural-index";
import type { ContextItem, ContextItemEvidenceState, ContextItemType, DependencyEdge, DependencyEdgeType, RetrievalBudget, RetrievalMethod, UnresolvedDependency } from "./types";
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
  /**
   * Phase 3F.1 FIX-2 - this instrument's own already-computed
   * OperativeContractState (Phase 2G), threaded through PackageAccess so
   * every retrieval pass in this module can route its own DEFINITION/
   * SECTION excerptText through the SAME amendment-aware resolution
   * discipline the semantic compiler's own evidence tools already apply
   * (semantic/tools.ts), rather than reading raw base-document text
   * unconditionally and trusting it implicitly. Undefined for a package
   * with no computed operative state at all (never amended is a legitimate
   * state, matching every other consumer's own convention).
   */
  operativeState: OperativeContractState | null | undefined;
  /** The matching NodeSupersessionIndex for `operativeState` above - EMPTY_SUPERSESSION_INDEX (fail-closed: every lookup resolves UNKNOWN) when the caller supplied none. */
  supersessionIndex: NodeSupersessionIndex;
}

export function createRetrievalState(budget: RetrievalBudget, operativeState?: OperativeContractState | null, supersessionIndex?: NodeSupersessionIndex): RetrievalState {
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
    operativeState: operativeState ?? null,
    supersessionIndex: supersessionIndex ?? EMPTY_SUPERSESSION_INDEX,
  };
}

/** Adapts amendment/operative-state.ts's own DefinitionEvidenceResolution (shared verbatim, never a second vocabulary) down to the leaner ContextItemEvidenceState a context-bundle item actually carries. */
function evidenceStateFromResolution(resolution: DefinitionEvidenceResolution): ContextItemEvidenceState {
  if (resolution.outcome === "NOT_FOUND") return { status: "OPERATIVE_STATE_UNRESOLVED", isCurrentTruth: false, reason: resolution.reason };
  if (resolution.outcome === "AMBIGUOUS") return { status: "AMBIGUOUS_TARGET", isCurrentTruth: false, reason: resolution.reason };
  const reason = resolution.unresolvedIssues.length > 0 ? resolution.unresolvedIssues.join("; ") : resolution.isCurrentTruth ? "Confirmed current operative text - no unresolved amendment/supersession issue." : `Evidence status: ${resolution.status}.`;
  return { status: resolution.status, isCurrentTruth: resolution.isCurrentTruth, reason };
}

/**
 * Phase 3F.1 FIX-2 - resolves a SECTION-kind context item's own operative
 * trust state via amendment/operative-state.ts's resolveOperativeSectionEvidence,
 * given the already-resolved real physical node every SECTION-shaped
 * retrieval pass in this module already holds (never re-resolved from a bare
 * ref string - see resolveOperativeSectionEvidence's own header comment).
 */
export function resolveSectionEvidenceState(state: RetrievalState, documentId: string, node: { nodeId: string; sectionRef: string }): ContextItemEvidenceState {
  return evidenceStateFromResolution(resolveOperativeSectionEvidence({ operativeState: state.operativeState, documentId, node, supersessionIndex: state.supersessionIndex }));
}

/** Phase 3F.1 FIX-2 - resolves a DEFINITION-kind context item's own operative trust state via amendment/operative-state.ts's own canonical resolveOperativeDefinitionEvidence (the SAME primitive semantic/tools.ts's getDefinition already relies on) - never a second, parallel definition-access discipline. */
export function resolveDefinitionEvidenceState(state: RetrievalState, index: StructuralIndex, documentId: string, term: string): ContextItemEvidenceState {
  return evidenceStateFromResolution(resolveOperativeDefinitionEvidence({ index, operativeState: state.operativeState, term, searchDocumentIds: [documentId], supersessionIndex: state.supersessionIndex }));
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

export function makeItemInput(
  type: ContextItemType,
  documentId: string,
  structuralNodeKey: string | null,
  structuralNodeId: string | null,
  normalizedRef: string,
  sourceCitation: string,
  excerptText: string,
  reason: string,
  retrievalDepth: number,
  retrievalPath: string[],
  retrievalMethod: RetrievalMethod,
  confidence: number | null,
  /** Phase 3F.1 FIX-2 - null ONLY for an item type with no independently-interpretable operative-truth claim at all (see ContextItem's own doc comment); every other call site must pass a real value computed via resolveSectionEvidenceState/resolveDefinitionEvidenceState BEFORE the item is constructed. */
  evidenceState: ContextItemEvidenceState | null
): Omit<ContextItem, "itemId"> {
  return { type, documentId, structuralNodeKey, structuralNodeId, normalizedRef, sourceCitation, excerptText, reason, retrievalDepth, retrievalPath, retrievalMethod, confidence, evidenceState };
}
