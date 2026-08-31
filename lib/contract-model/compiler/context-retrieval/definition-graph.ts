/**
 * Phase 2D §8/§9/§10/§11 - definition retrieval, recursive definition
 * dependencies, dependency-path preservation, and cycle detection.
 *
 * Reuses Phase 2A's structural-index definition index exactly as task §8
 * requires ("do not perform fuzzy matching when an exact defined-term
 * relationship exists") - term detection is always an exact, case-
 * sensitive substring match of a term this document's own
 * structural-definitions.ts already declared, never a fuzzy guess.
 */
import type { StructuralIndex } from "../structural-index";
import { addEdge, addItem, makeItemInput, resolveDefinitionEvidenceState, withinBudget, type RetrievalState } from "./state";
import { computeItemId } from "./identity";
import type { ContextItem } from "./types";

/**
 * Task §9's own "administrative/legal terms that do not materially affect
 * covenant analysis" - a small, generic, disclosed denylist of boilerplate
 * defined terms found in virtually every credit agreement/indenture,
 * never a package-specific term. Deterministic materiality gating (task
 * §9's own "use deterministic signals where possible"); anything not on
 * this list is treated as potentially material and retrieved.
 */
const ADMINISTRATIVE_TERM_DENYLIST = new Set(["person", "business day", "governmental authority", "requirements of law", "us", "united states", "dollars", "administrative agent", "collateral agent", "lender", "agent", "closing date", "code", "gaap"]);

function isAdministrativeTerm(normalizedTerm: string): boolean {
  return ADMINISTRATIVE_TERM_DENYLIST.has(normalizedTerm);
}

interface KnownTermMention {
  exactTerm: string;
  normalizedTerm: string;
}

/** Every term THIS document declared (structural-definitions.ts's own detection) that appears verbatim in `text` - exact match only, word-boundary-safe. */
function findKnownTermMentions(text: string, index: StructuralIndex, documentId: string, excludeNormalizedTerm: string): KnownTermMention[] {
  const out: KnownTermMention[] = [];
  const seen = new Set<string>();
  for (const def of index.allDefinitions()) {
    if (def.documentId !== documentId) continue;
    if (def.normalizedTerm === excludeNormalizedTerm) continue;
    if (seen.has(def.normalizedTerm)) continue;
    if (isAdministrativeTerm(def.normalizedTerm)) continue;
    // Word-boundary-safe exact match of the term's own exact text (never fuzzy).
    const escaped = def.exactTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`);
    if (re.test(text)) {
      out.push({ exactTerm: def.exactTerm, normalizedTerm: def.normalizedTerm });
      seen.add(def.normalizedTerm);
    }
  }
  return out;
}

/** Returns the existing item for this term under EITHER possible type (a term first classified DEFINITION at depth 1 must never be duplicated as a second DEFINITION_DEPENDENCY item when later reached transitively, and vice versa - task §10's "deduplicate the context node"), or undefined if this term has not been retrieved yet under any type. */
function findExistingDefinitionItem(state: RetrievalState, documentId: string, normalizedTerm: string): ContextItem | undefined {
  const definitionId = computeItemId(documentId, normalizedTerm, "DEFINITION");
  const existingAsDefinition = state.items.get(definitionId);
  if (existingAsDefinition) return existingAsDefinition;
  const dependencyId = computeItemId(documentId, normalizedTerm, "DEFINITION_DEPENDENCY");
  return state.items.get(dependencyId);
}

export function retrieveDefinitionsRecursive(state: RetrievalState, index: StructuralIndex, documentId: string, sourceText: string, parentItemId: string, depth: number, pathTermsStack: readonly string[]): void {
  if (depth > state.budget.maxDefinitionDepth) {
    state.stopReasons.add(`CONTEXT_BUDGET_EXCEEDED: maxDefinitionDepth (${state.budget.maxDefinitionDepth}) reached`);
    return;
  }
  state.maxDefinitionDepthReached = Math.max(state.maxDefinitionDepthReached, depth);

  const currentTerm = pathTermsStack[pathTermsStack.length - 1] ?? "";
  const mentions = findKnownTermMentions(sourceText, index, documentId, currentTerm);

  for (const mention of mentions) {
    const isCycle = pathTermsStack.includes(mention.normalizedTerm);
    const existing = findExistingDefinitionItem(state, documentId, mention.normalizedTerm);

    if (isCycle) {
      const cyclePath = [...pathTermsStack, mention.normalizedTerm].join(" -> ");
      state.unresolved.push({
        originatingNodeKey: null,
        dependencyType: "DEFINITION_CYCLE",
        sourceText: mention.exactTerm,
        attemptedResolution: `Definition cycle detected: ${cyclePath}`,
        reason: "Following this definition dependency further would re-enter a definition already open in the current traversal path - stopped safely rather than looping.",
        candidateTargets: [mention.exactTerm],
        citation: `${documentId}::${mention.exactTerm}`,
        severity: "MEDIUM",
      });
      if (existing) addEdge(state, parentItemId, existing.itemId, "DEPENDS_ON_DEFINITION", `Cyclic dependency (${cyclePath}) - not re-expanded.`);
      continue;
    }

    if (existing) {
      addEdge(state, parentItemId, existing.itemId, "DEPENDS_ON_DEFINITION", "Additional dependency path to an already-retrieved definition.");
      state.duplicatePathsDeduplicated++;
      continue;
    }

    const fullText = index.getDefinitionFullText(mention.exactTerm, documentId) ?? index.getDefinition(mention.exactTerm, documentId)?.definitionExcerpt ?? "";
    if (!withinBudget(state, fullText.length)) return;

    // Phase 3F.1 FIX-2 - this is the exact defect class the reproduced
    // exploit targeted: fullText above is raw base-document text with NO
    // amendment/operative-state check of any kind. evidenceState is
    // computed here, BEFORE this item is ever placed in the bundle, so a
    // CONFLICTED/AMBIGUOUS/superseded definition is never silently
    // presented as current truth regardless of whether the model ever
    // calls getDefinition itself.
    const evidenceState = resolveDefinitionEvidenceState(state, index, documentId, mention.exactTerm);
    const type = depth === 1 ? "DEFINITION" : "DEFINITION_DEPENDENCY";
    const item = addItem(
      state,
      makeItemInput(type, documentId, null, null, mention.exactTerm, `Definition of "${mention.exactTerm}"`, fullText, depth === 1 ? `Defined term used directly in the discovered covenant's own text.` : `Defined term used within the definition of "${pathTermsStack[pathTermsStack.length - 1]}", ${depth - 1} level(s) removed from the covenant's own text.`, depth, [parentItemId], "DEFINITION_INDEX", 1, evidenceState)
    );
    addEdge(state, parentItemId, item.itemId, "DEPENDS_ON_DEFINITION", depth === 1 ? "Directly used defined term." : "Transitive definition dependency.");

    retrieveDefinitionsRecursive(state, index, documentId, fullText, item.itemId, depth + 1, [...pathTermsStack, mention.normalizedTerm]);
  }
}

/** Entry point: scan the operative source's own text for its direct defined-term dependencies. */
export function retrieveDirectDefinitions(state: RetrievalState, index: StructuralIndex, documentId: string, operativeText: string, operativeItemId: string): void {
  retrieveDefinitionsRecursive(state, index, documentId, operativeText, operativeItemId, 1, []);
}
