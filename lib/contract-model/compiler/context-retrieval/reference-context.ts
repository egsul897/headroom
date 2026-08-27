/**
 * Phase 2D §12/§13/§14/§15 - cross-reference retrieval, relative-reference
 * resolution (reuses Phase 2A's already-resolved DetectedReference graph
 * exactly - never re-resolves or fuzzy-matches), and bounded recursive
 * expansion gated by a deterministic calculation-provision signal (task
 * §14 - "administrative references... may be irrelevant... use relevance
 * gating").
 */
import type { StructuralIndex } from "../structural-index";
import { detectAbsoluteReferenceMentions } from "../structural-references";
import { addEdge, addItem, makeItemInput, withinBudget, type RetrievalState } from "./state";

const CALCULATION_SIGNAL = /\b(calculat|pro forma|interpretation|accounting principles|Test Period|determination of|deemed to have occurred|methodology)\b/i;

function classifyReferencedProvision(text: string): "CALCULATION_PROVISION" | "CROSS_REFERENCE" {
  return CALCULATION_SIGNAL.test(text) ? "CALCULATION_PROVISION" : "CROSS_REFERENCE";
}

function targetKindToUnresolvedType(targetKind: string): "AMBIGUOUS_RELATIVE_REFERENCE" | "MISSING_SCHEDULE" {
  return targetKind === "SCHEDULE" || targetKind === "EXHIBIT" ? "MISSING_SCHEDULE" : "AMBIGUOUS_RELATIVE_REFERENCE";
}

/** Cross-references FROM an already-known StructuralNode (reuses Phase 2A's own pre-resolved reference index - task §13's "use exact structural ancestry," already done by Phase 2A, never redone here). */
export function retrieveCrossReferencesFromNode(state: RetrievalState, index: StructuralIndex, documentId: string, nodeKey: string, parentItemId: string, depth: number, includeDescendants: boolean): void {
  if (depth > state.budget.maxCrossReferenceDepth) {
    state.stopReasons.add(`CONTEXT_BUDGET_EXCEEDED: maxCrossReferenceDepth (${state.budget.maxCrossReferenceDepth}) reached`);
    return;
  }
  state.maxCrossReferenceDepthReached = Math.max(state.maxCrossReferenceDepthReached, depth);
  state.crossReferenceTraversals++;

  const references = index.findReferencesFrom(nodeKey, includeDescendants);
  for (const ref of references) {
    if (!ref.resolved || !ref.targetNodeKey) {
      state.unresolved.push({
        originatingNodeKey: nodeKey,
        dependencyType: targetKindToUnresolvedType(ref.targetKind),
        sourceText: ref.referenceText,
        attemptedResolution: `Looked for a ${ref.targetKind} node with ref "${ref.normalizedTarget}" in this document's own structural index.`,
        reason: ref.unresolvedReason ?? "Reference could not be resolved to a real structural node.",
        candidateTargets: [],
        citation: ref.referenceText,
        severity: ref.targetKind === "SCHEDULE" || ref.targetKind === "EXHIBIT" ? "MEDIUM" : "HIGH",
      });
      continue;
    }
    const targetNode = index.getNode(ref.targetNodeKey);
    if (!targetNode) continue;
    const targetText = index.getNodeText(ref.targetNodeKey, "OWN");
    if (targetText.trim().length === 0) continue;
    if (!withinBudget(state, targetText.length)) return;

    const itemType = classifyReferencedProvision(targetText);
    const item = addItem(state, makeItemInput(itemType, documentId, ref.targetNodeKey, targetNode.sectionRef, `Section ${targetNode.sectionRef}`, targetText, `Explicitly cross-referenced by "${ref.referenceText}".`, depth, [parentItemId], "CROSS_REFERENCE_INDEX", 1));
    addEdge(state, parentItemId, item.itemId, "REFERENCES", `"${ref.referenceText}"`);

    // Relevance gating (task §14): only recurse into a referenced provision that itself looks like a calculation/methodology provision - never blindly traverse every reference (administrative cross-references like notice mechanics stop here).
    if (itemType === "CALCULATION_PROVISION") {
      retrieveCrossReferencesFromNode(state, index, documentId, ref.targetNodeKey, item.itemId, depth + 1, false);
    }
  }
}

/** Cross-references found INSIDE a definition's own full text (definitions are prose, not part of Phase 2A's pre-indexed reference graph - task §8's own header explains why). Absolute Section/Article/Schedule/Exhibit mentions only. */
export function retrieveCrossReferencesFromDefinitionText(state: RetrievalState, index: StructuralIndex, documentId: string, definitionText: string, parentItemId: string, depth: number): void {
  if (depth > state.budget.maxCrossReferenceDepth) {
    state.stopReasons.add(`CONTEXT_BUDGET_EXCEEDED: maxCrossReferenceDepth (${state.budget.maxCrossReferenceDepth}) reached`);
    return;
  }
  const mentions = detectAbsoluteReferenceMentions(definitionText);
  for (const mention of mentions) {
    const targetNode = mention.targetKind === "SECTION" || mention.targetKind === "ARTICLE" ? index.getNodeByRef(documentId, mention.normalizedTarget) : undefined;
    if (!targetNode) {
      if (mention.targetKind === "SECTION" || mention.targetKind === "ARTICLE") {
        state.unresolved.push({
          originatingNodeKey: null,
          dependencyType: targetKindToUnresolvedType(mention.targetKind),
          sourceText: mention.referenceText,
          attemptedResolution: `Looked for a ${mention.targetKind} node with ref "${mention.normalizedTarget}" in this document's own structural index.`,
          reason: "Reference inside a definition's own text could not be resolved to a real structural node.",
          candidateTargets: [],
          citation: mention.referenceText,
          severity: "MEDIUM",
        });
      }
      continue;
    }
    const targetText = index.getNodeText(targetNode.nodeKey, "OWN");
    if (targetText.trim().length === 0) continue;
    if (!withinBudget(state, targetText.length)) return;
    const itemType = classifyReferencedProvision(targetText);
    const item = addItem(state, makeItemInput(itemType, documentId, targetNode.nodeKey, targetNode.sectionRef, `Section ${targetNode.sectionRef}`, targetText, `Referenced within a definition's own text ("${mention.referenceText}").`, depth, [parentItemId], "CROSS_REFERENCE_INDEX", 1));
    addEdge(state, parentItemId, item.itemId, "REFERENCES", `"${mention.referenceText}" inside a definition.`);
  }
}
