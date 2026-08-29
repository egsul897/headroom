/**
 * Phase 2D §12/§13/§14/§15 - cross-reference retrieval, relative-reference
 * resolution (reuses Phase 2A's already-resolved DetectedReference graph
 * exactly - never re-resolves or fuzzy-matches), and bounded recursive
 * expansion gated by a deterministic calculation-provision signal (task
 * §14 - "administrative references... may be irrelevant... use relevance
 * gating").
 */
import type { StructuralIndex } from "../structural-index";
import type { PackageGraphResult } from "../package-graph/types";
import { detectAbsoluteReferenceMentions } from "../structural-references";
import { addEdge, addItem, makeItemInput, withinBudget, type RetrievalState } from "./state";
import { expandReferencedRegion } from "./region-expansion";
import { retrieveAmendmentLeadsForSection } from "./cross-document-context";

// Phase 2E.1 §8 audit: a covenant can depend on calculation mechanics
// through language that never uses the word "calculat" itself - "giving
// effect to", "deemed incurred", "on a consolidated basis", and "ratio
// calculation date" are the same real drafting pattern under different
// wording, added here after auditing whether the original gate was too
// narrow (it was not the dominant root cause behind this remediation's own
// five target findings, but is a real, generalized, low-risk gap-closer
// this task explicitly requires auditing for - task §8).
const CALCULATION_SIGNAL = /\b(calculat|pro forma|interpretation|accounting principles|Test Period|determination of|deemed to have occurred|deemed (?:to be )?incurred|giving effect to|methodology|consolidated basis|ratio calculation date)\b/i;

function classifyReferencedProvision(text: string): "CALCULATION_PROVISION" | "CROSS_REFERENCE" {
  return CALCULATION_SIGNAL.test(text) ? "CALCULATION_PROVISION" : "CROSS_REFERENCE";
}

function targetKindToUnresolvedType(targetKind: string): "AMBIGUOUS_RELATIVE_REFERENCE" | "MISSING_SCHEDULE" {
  return targetKind === "SCHEDULE" || targetKind === "EXHIBIT" ? "MISSING_SCHEDULE" : "AMBIGUOUS_RELATIVE_REFERENCE";
}

/**
 * Cross-references FROM an already-known StructuralNode (reuses Phase 2A's
 * own pre-resolved reference index - task §13's "use exact structural
 * ancestry," already done by Phase 2A, never redone here).
 *
 * Phase 3F.1.4 (CTX-01 remediation, root cause: retrieveAmendmentLeadsForSection
 * was previously called exactly once, from pipeline.ts, only for the
 * PRIMARY candidate's own sectionRef - never for a section reached only as
 * a CROSS_REFERENCE/CALCULATION_PROVISION target here). Generalized so the
 * amendment-lead check runs for EVERY materially-retrieved cross-reference
 * target, at every depth level this traversal already visits, up to the
 * SAME existing depth bound (maxCrossReferenceDepth) - no new unbounded
 * traversal is introduced; the check is purely additive at a node the
 * function already reached.
 *
 * BOUNDED RECURSION / CYCLE PROTECTION: `visitedNodeIds` tracks every node
 * this traversal chain has already expanded outgoing references FROM. A
 * reference cycle (A -> B -> ... -> A) re-reaches an already-expanded node;
 * rather than re-expanding it again (and again, forever), that second reach
 * still gets its own item/amendment-lead check (already happened on first
 * expansion, so nothing new is skipped) but is not traversed a second time.
 * This is independent of, and strictly tighter than, the pre-existing
 * `depth > maxCrossReferenceDepth` bound above, which remains as-is as the
 * absolute backstop.
 */
export function retrieveCrossReferencesFromNode(state: RetrievalState, index: StructuralIndex, documentId: string, nodeId: string, parentItemId: string, depth: number, includeDescendants: boolean, packageGraph: PackageGraphResult | null = null, visitedNodeIds: Set<string> = new Set()): void {
  if (depth > state.budget.maxCrossReferenceDepth) {
    state.stopReasons.add(`CONTEXT_BUDGET_EXCEEDED: maxCrossReferenceDepth (${state.budget.maxCrossReferenceDepth}) reached`);
    return;
  }
  if (visitedNodeIds.has(nodeId)) {
    // Reference cycle detected - this node's own outgoing references were
    // already expanded earlier in this same traversal chain. Stop here
    // rather than re-expanding forever; the item/amendment-lead check for
    // this node already ran on first expansion.
    return;
  }
  const expandedFromHere = new Set(visitedNodeIds);
  expandedFromHere.add(nodeId);
  state.maxCrossReferenceDepthReached = Math.max(state.maxCrossReferenceDepthReached, depth);
  state.crossReferenceTraversals++;

  const references = index.findReferencesFrom(nodeId, includeDescendants);
  for (const ref of references) {
    if (ref.targetAmbiguous) {
      // Phase 3F.1.2 (task §11): a reference that matched more than one
      // physical occurrence is reported as its own explicit unresolved
      // category, never silently resolved to an arbitrary candidate.
      state.unresolved.push({
        originatingNodeKey: nodeId,
        dependencyType: "AMBIGUOUS_RELATIVE_REFERENCE",
        sourceText: ref.referenceText,
        attemptedResolution: `Reference "${ref.referenceText}" matched more than one physical structural occurrence with ref "${ref.normalizedTarget}" in this document.`,
        reason: "Ambiguous target - more than one physical location shares this reference's normalized target; never guessed.",
        candidateTargets: [ref.normalizedTarget],
        citation: `${ref.referenceText} [${ref.normalizedTarget}]`,
        severity: "HIGH",
      });
      continue;
    }
    if (!ref.resolved || !ref.targetNodeId) {
      state.unresolved.push({
        originatingNodeKey: nodeId,
        dependencyType: targetKindToUnresolvedType(ref.targetKind),
        sourceText: ref.referenceText,
        attemptedResolution: `Looked for a ${ref.targetKind} node with ref "${ref.normalizedTarget}" in this document's own structural index.`,
        reason: ref.unresolvedReason ?? "Reference could not be resolved to a real structural node.",
        candidateTargets: [ref.normalizedTarget],
        // Includes the disambiguated best-attempt target ref (never a bare,
        // ambiguous marker like "clause (D)" alone) - task's own "ambiguous
        // resolution must become explicit unresolved context": a human or
        // downstream consumer reviewing this unresolved dependency can see
        // exactly which scope was attempted, not just the literal quote.
        citation: `${ref.referenceText} [${ref.normalizedTarget}]`,
        severity: ref.targetKind === "SCHEDULE" || ref.targetKind === "EXHIBIT" ? "MEDIUM" : "HIGH",
      });
      continue;
    }
    const targetNode = index.getNodeById(ref.targetNodeId);
    if (!targetNode) continue;

    // Referenced-region expansion (Phase 2E.1 §5/§7): a reference's own
    // target node identity is not the same as complete target context -
    // the node's real operative content may continue into a single
    // "swallowing" descendant the structural parser never separated, or
    // spread across several real child clauses. Bounded, signal-driven
    // expansion (never blind full-document/full-article retrieval).
    const expansion = expandReferencedRegion(index, ref.targetNodeId);
    const targetText = expansion.text;
    if (targetText.trim().length === 0) continue;
    if (!withinBudget(state, targetText.length)) return;

    const itemType = classifyReferencedProvision(targetText);
    const item = addItem(state, makeItemInput(itemType, documentId, ref.targetNodeKey, ref.targetNodeId, targetNode.sectionRef, `Section ${targetNode.sectionRef}`, targetText, `Explicitly cross-referenced by "${ref.referenceText}".${expansion.includedNodeIds.length > 0 ? ` Expanded to include ${expansion.includedNodeIds.length} descendant clause(s) whose own text carried real operative content.` : ""}`, depth, [parentItemId], "CROSS_REFERENCE_INDEX", 1));
    addEdge(state, parentItemId, item.itemId, "REFERENCES", `"${ref.referenceText}"`);

    // CTX-01 fix: this cross-referenced target's own retrieved text is
    // honestly pre-amendment (never silently presented as falsely current -
    // Architecture Invariant #13), but a downstream reader must be able to
    // see that a real, resolved (or review-required) package-graph
    // modification candidate targets THIS section elsewhere in the package -
    // exactly the same disclosure the primary candidate's own section
    // already gets in pipeline.ts, now generalized to every cross-reference
    // target reached at every depth level.
    if (packageGraph) {
      retrieveAmendmentLeadsForSection(state, packageGraph, targetNode.documentId, targetNode.sectionRef, item.itemId);
    }

    // Descendants excluded from expansion (no operative signal in their own
    // text) are disclosed, never silently dropped without a trace (task
    // §7/§10 - a downstream reader must be able to see that a bounded
    // selection happened, not assume nothing else exists).
    if (expansion.excludedNodeIds.length > 0) {
      for (const excludedId of expansion.excludedNodeIds) {
        const excludedNode = index.getNodeById(excludedId);
        if (!excludedNode) continue;
        state.unresolved.push({
          originatingNodeKey: ref.targetNodeId,
          dependencyType: "OTHER",
          sourceText: excludedNode.sectionRef,
          attemptedResolution: `${targetNode.sectionRef} has multiple child clauses; ${excludedNode.sectionRef}'s own text showed no operative/economic signal and was excluded from the retrieved region.`,
          reason: "Bounded descendant selection excluded this clause - disclosed rather than silently retrieved or silently dropped.",
          candidateTargets: [excludedNode.sectionRef],
          citation: excludedNode.sectionRef,
          severity: "LOW",
        });
      }
    }

    // Relevance gating (task §14): only recurse into a referenced provision that itself looks like a calculation/methodology provision - never blindly traverse every reference (administrative cross-references like notice mechanics stop here).
    // includeDescendants stays false here even after region expansion -
    // recursing into every reference newly exposed by an EXPANDED
    // descendant would compound expansion-of-expansion across the
    // recursion depth budget and risk exactly the "context dump" behavior
    // this remediation must avoid (Phase 2E.1 §9/§15, measured directly:
    // an earlier draft that flipped this to `expansion.includedNodeIds.length > 0`
    // caused real budget exhaustion and reintroduced material findings
    // elsewhere in the same bundle - reverted before this fix was accepted).
    if (itemType === "CALCULATION_PROVISION") {
      retrieveCrossReferencesFromNode(state, index, documentId, ref.targetNodeId, item.itemId, depth + 1, false, packageGraph, expandedFromHere);
    }
  }
}

/**
 * Cross-references found INSIDE a definition's own full text (definitions
 * are prose, not part of Phase 2A's pre-indexed reference graph - task
 * §8's own header explains why). Absolute Section/Article/Schedule/Exhibit
 * mentions only. Phase 3F.1.4 (CTX-01): also a "materially-retrieved
 * cross-reference target" - gets the same amendment-lead disclosure as
 * every other cross-reference target, not just the primary candidate.
 */
export function retrieveCrossReferencesFromDefinitionText(state: RetrievalState, index: StructuralIndex, documentId: string, definitionText: string, parentItemId: string, depth: number, packageGraph: PackageGraphResult | null = null): void {
  if (depth > state.budget.maxCrossReferenceDepth) {
    state.stopReasons.add(`CONTEXT_BUDGET_EXCEEDED: maxCrossReferenceDepth (${state.budget.maxCrossReferenceDepth}) reached`);
    return;
  }
  const mentions = detectAbsoluteReferenceMentions(definitionText);
  for (const mention of mentions) {
    // Phase 3F.1.2: cardinality-aware resolution - a mention matching more
    // than one physical occurrence is reported as ambiguous, never guessed.
    const resolution = mention.targetKind === "SECTION" || mention.targetKind === "ARTICLE" ? index.resolveUniqueNodeByRef(documentId, mention.normalizedTarget) : { status: "NOT_FOUND" as const };
    if (resolution.status !== "UNIQUE") {
      if (mention.targetKind === "SECTION" || mention.targetKind === "ARTICLE") {
        state.unresolved.push({
          originatingNodeKey: null,
          dependencyType: targetKindToUnresolvedType(mention.targetKind),
          sourceText: mention.referenceText,
          attemptedResolution: `Looked for a ${mention.targetKind} node with ref "${mention.normalizedTarget}" in this document's own structural index.`,
          reason: resolution.status === "AMBIGUOUS" ? `Ambiguous - ${resolution.candidates.length} physical occurrences share this reference; never guessed.` : "Reference inside a definition's own text could not be resolved to a real structural node.",
          candidateTargets: [],
          citation: mention.referenceText,
          severity: "MEDIUM",
        });
      }
      continue;
    }
    const targetNode = resolution.node;
    const targetText = index.getNodeText(targetNode.nodeId, "OWN");
    if (targetText.trim().length === 0) continue;
    if (!withinBudget(state, targetText.length)) return;
    const itemType = classifyReferencedProvision(targetText);
    const item = addItem(state, makeItemInput(itemType, documentId, targetNode.nodeKey, targetNode.nodeId, targetNode.sectionRef, `Section ${targetNode.sectionRef}`, targetText, `Referenced within a definition's own text ("${mention.referenceText}").`, depth, [parentItemId], "CROSS_REFERENCE_INDEX", 1));
    addEdge(state, parentItemId, item.itemId, "REFERENCES", `"${mention.referenceText}" inside a definition.`);
    if (packageGraph) {
      retrieveAmendmentLeadsForSection(state, packageGraph, targetNode.documentId, targetNode.sectionRef, item.itemId);
    }
  }
}
