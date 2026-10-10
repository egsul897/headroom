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
import type { StructuralNode } from "../types";
import { detectAbsoluteReferenceMentions } from "../structural-references";
import { addEdge, addItem, makeItemInput, resolveSectionEvidenceState, withinBudget, type RetrievalState } from "./state";
import { expandReferencedRegion } from "./region-expansion";
import { retrieveAmendmentLeadsForSection } from "./cross-document-context";
import { resolveCanonicalBodyAnchor } from "./body-anchor";

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

function normalizeSectionLabel(ref: string): string {
  return ref.replace(/\s+/g, "").replace(/^§/, "").replace(/^Sections?/i, "");
}

/** True when an ambiguous reference names the current node or one of its ancestors — already covered by OPERATIVE_SOURCE / PARENT_SCOPE. */
function ambiguousTargetIsSelfOrAncestor(index: StructuralIndex, nodeId: string, normalizedTarget: string): boolean {
  const want = normalizeSectionLabel(normalizedTarget);
  const self = index.getNodeById(nodeId);
  if (self && normalizeSectionLabel(self.sectionRef) === want) return true;
  return index.getAncestors(nodeId).some((a) => normalizeSectionLabel(a.sectionRef) === want);
}

/**
 * HEADROOM-6: when Phase 2A reports targetAmbiguous (TOC stub + body), try
 * canonical body-anchor selection. Preserve every candidate as ambiguity
 * evidence. Never first-match. Returns the selected body node, or null when
 * still genuinely ambiguous.
 */
function resolveAmbiguousSectionTarget(
  state: RetrievalState,
  index: StructuralIndex,
  documentId: string,
  fromNodeId: string | null,
  referenceText: string,
  normalizedTarget: string,
  severityIfUnresolved: "HIGH" | "MEDIUM",
): StructuralNode | null {
  if (fromNodeId && ambiguousTargetIsSelfOrAncestor(index, fromNodeId, normalizedTarget)) {
    // Self / ancestor citation via a colliding TOC stub — not a missing dependency.
    state.unresolved.push({
      originatingNodeKey: fromNodeId,
      dependencyType: "AMBIGUOUS_RELATIVE_REFERENCE",
      sourceText: referenceText,
      attemptedResolution: `Reference "${referenceText}" matched multiple physical occurrences of "${normalizedTarget}", including the current provision / an ancestor already retrieved as operative or parent scope.`,
      reason: "Duplicate sectionRef (likely TOC stub vs body) names this provision itself or its enclosing scope — already covered; disclosed as LOW ambiguity evidence, not incompleteness.",
      candidateTargets: index.findNodesByRef(documentId, normalizedTarget).map((n) => n.nodeId),
      citation: `${referenceText} [${normalizedTarget}]`,
      severity: "LOW",
    });
    return null;
  }

  const resolution = resolveCanonicalBodyAnchor(index, documentId, normalizedTarget);
  if ((resolution.status === "SELECTED_BODY" || resolution.status === "UNIQUE") && resolution.selected) {
    state.unresolved.push({
      originatingNodeKey: fromNodeId,
      dependencyType: "AMBIGUOUS_RELATIVE_REFERENCE",
      sourceText: referenceText,
      attemptedResolution: resolution.reason,
      reason: `Canonical body-anchor selected operative occurrence ${resolution.selected.nodeId} (confidence ${resolution.confidence}); ${resolution.candidates.length} physical candidate(s) preserved as evidence — never emission-order first-match.`,
      candidateTargets: resolution.candidates.map((c) => c.nodeId),
      citation: `${referenceText} [${normalizedTarget}]`,
      severity: resolution.confidence === "HIGH" ? "LOW" : "MEDIUM",
    });
    return resolution.selected;
  }

  state.unresolved.push({
    originatingNodeKey: fromNodeId,
    dependencyType: "AMBIGUOUS_RELATIVE_REFERENCE",
    sourceText: referenceText,
    attemptedResolution: resolution.reason,
    reason: "Ambiguous target - more than one physical location shares this reference's normalized target; body-anchor ranking could not distinguish TOC stub from operative body with sufficient confidence; never guessed.",
    candidateTargets: resolution.candidates.map((c) => c.nodeId),
    citation: `${referenceText} [${normalizedTarget}]`,
    severity: severityIfUnresolved,
  });
  return null;
}

/** True when a definition-text section mention is laundry-list / non-material for recursive expansion. */
function isLaundryListDefinitionMention(definitionText: string, mentionOffset: number): boolean {
  const windowStart = Math.max(0, mentionOffset - 80);
  const windowEnd = Math.min(definitionText.length, mentionOffset + 80);
  const window = definitionText.slice(windowStart, windowEnd);
  // Enumerated permitted-lien / basket style: "pursuant to Section 6.01(iii)" inside a list.
  if (/\b(?:pursuant\s+to|under|of)\s+(?:Sections?\s+)?\d+\.\d+/i.test(window) && !CALCULATION_SIGNAL.test(window)) return true;
  return false;
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
/** Candidate(s) of the sealed population owning a node: the nearest anchor on the node's ancestor chain (the node itself first). */
function ownersOf(state: RetrievalState, index: StructuralIndex, nodeId: string): string[] {
  if (!state.semanticUnitOwnership) return [];
  for (const id of [nodeId, ...index.getAncestors(nodeId).map((a) => a.nodeId)]) { const o = state.semanticUnitOwnership.get(id); if (o && o.length > 0) return o; }
  return [];
}

export function retrieveCrossReferencesFromNode(state: RetrievalState, index: StructuralIndex, documentId: string, nodeId: string, parentItemId: string, depth: number, includeDescendants: boolean, packageGraph: PackageGraphResult | null = null, visitedNodeIds: Set<string> = new Set()): void {
  if (depth > state.budget.maxCrossReferenceDepth) {
    // SEMANTIC FIDELITY (v4) - a depth bound only "exceeds the budget" when it actually withholds something. Look at what this
    // node would have contributed: resolved, non-self references. None -> nothing was withheld, no stop, no sufficiency effect.
    const withheld = index.findReferencesFrom(nodeId, includeDescendants).filter((r) => r.resolved && r.targetNodeId && !r.targetAmbiguous && r.targetNodeId !== nodeId && !visitedNodeIds.has(r.targetNodeId));
    if (withheld.length > 0) {
      state.stopReasons.add(`CONTEXT_BUDGET_EXCEEDED: maxCrossReferenceDepth (${state.budget.maxCrossReferenceDepth}) reached`);
      const n = index.getNodeById(nodeId);
      state.retrievalStops.push({ reason: "DEPTH_LIMIT_WITH_UNRETRIEVED_DEPENDENCIES", fromNodeId: parentItemId, targetNodeId: nodeId, targetSectionRef: n?.sectionRef ?? null, owningCandidateRefs: [], depth, detail: `depth ${depth} > maxCrossReferenceDepth ${state.budget.maxCrossReferenceDepth}: ${withheld.length} resolved reference(s) from ${n?.sectionRef ?? nodeId} not retrieved (${withheld.map((r) => r.normalizedTarget).join(", ")})` });
    }
    return;
  }
  if (visitedNodeIds.has(nodeId)) {
    // Reference cycle detected - this node's own outgoing references were
    // already expanded earlier in this same traversal chain. Stop here
    // rather than re-expanding forever; the item/amendment-lead check for
    // this node already ran on first expansion. The cycle is RECORDED (graph data), never re-traversed.
    const n = index.getNodeById(nodeId);
    state.retrievalStops.push({ reason: "REFERENCE_CYCLE", fromNodeId: parentItemId, targetNodeId: nodeId, targetSectionRef: n?.sectionRef ?? null, owningCandidateRefs: [], depth, detail: `reference cycle: ${n?.sectionRef ?? nodeId} was already expanded earlier in this traversal chain` });
    return;
  }
  const expandedFromHere = new Set(visitedNodeIds);
  expandedFromHere.add(nodeId);
  state.maxCrossReferenceDepthReached = Math.max(state.maxCrossReferenceDepthReached, depth);
  state.crossReferenceTraversals++;

  const references = index.findReferencesFrom(nodeId, includeDescendants);
  for (const ref of references) {
    let targetNode: StructuralNode | undefined;
    if (ref.targetAmbiguous) {
      // HEADROOM-6: preserve ambiguity evidence, but prefer canonical body over TOC stub.
      const selected = resolveAmbiguousSectionTarget(state, index, documentId, nodeId, ref.referenceText, ref.normalizedTarget, "HIGH");
      if (!selected) continue;
      targetNode = selected;
    } else if (!ref.resolved || !ref.targetNodeId) {
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
    } else {
      targetNode = index.getNodeById(ref.targetNodeId);
    }
    if (!targetNode) continue;

    // Referenced-region expansion (Phase 2E.1 §5/§7): a reference's own
    // target node identity is not the same as complete target context -
    // the node's real operative content may continue into a single
    // "swallowing" descendant the structural parser never separated, or
    // spread across several real child clauses. Bounded, signal-driven
    // expansion (never blind full-document/full-article retrieval).
    // Canonical-map remediation: a node's own section label ("SECTION 7.01 ...") or a reference to one of its own
    // ancestors ("this Article VII") is not a dependency - that text is already the operative source / its parent
    // scope. Expanding it duplicated the operative text as a CROSS_REFERENCE region (14 of 104 preserved CONMED
    // bundles carried a self cross-reference) and made every such candidate look multi-region to the shard planner.
    const targetNodeId = targetNode.nodeId;
    if (targetNodeId === nodeId || index.getAncestors(nodeId).some((a) => a.nodeId === targetNodeId)) continue;

    const expansion = expandReferencedRegion(index, targetNodeId);
    const targetText = expansion.text;
    if (targetText.trim().length === 0) continue;
    if (!withinBudget(state, targetText.length)) return;

    const itemType = classifyReferencedProvision(targetText);
    const targetEvidenceState = resolveSectionEvidenceState(state, targetNode.documentId, { nodeId: targetNode.nodeId, sectionRef: targetNode.sectionRef });
    const item = addItem(state, makeItemInput(itemType, documentId, targetNode.nodeKey, targetNodeId, targetNode.sectionRef, `Section ${targetNode.sectionRef}`, targetText, `Explicitly cross-referenced by "${ref.referenceText}".${expansion.includedNodeIds.length > 0 ? ` Expanded to include ${expansion.includedNodeIds.length} descendant clause(s) whose own text carried real operative content.` : ""}`, depth, [parentItemId], "CROSS_REFERENCE_INDEX", 1, targetEvidenceState));
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
          originatingNodeKey: targetNodeId,
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
    // SEMANTIC FIDELITY (v4) - OWNERSHIP BOUNDARY: when the referenced provision is owned by another candidate of the
    // sealed population (its anchor is this node or an ancestor of it), the target has been identified and retrieved as
    // context - enough to identify it, establish the relationship and verify the child's reference. Its own dependency
    // tree is that candidate's job. Stop here, deterministically, without touching the budget or sufficiency: this is
    // delegation to a separately-owned certified semantic unit, not missing context. Recorded for every owned target,
    // whatever its classification, so the package graph can see the boundary.
    const owners = ownersOf(state, index, targetNodeId);
    if (owners.length > 0) {
      state.retrievalStops.push({ reason: "STOP_AT_SEPARATELY_OWNED_SEMANTIC_UNIT", fromNodeId: nodeId, targetNodeId, targetSectionRef: targetNode.sectionRef, owningCandidateRefs: owners, depth, detail: `${targetNode.sectionRef} is owned by candidate(s) ${owners.join(", ")}; its dependency tree is delegated to that unit` });
      continue;
    }
    if (itemType === "CALCULATION_PROVISION") {
      retrieveCrossReferencesFromNode(state, index, documentId, targetNodeId, item.itemId, depth + 1, false, packageGraph, expandedFromHere);
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
  const mentions = detectAbsoluteReferenceMentions(definitionText);
  if (depth > state.budget.maxCrossReferenceDepth) {
    // HEADROOM-6: at a definition-text depth bound the definition prose itself
    // is already in the bundle. Remaining Section/Article mentions are
    // secondary (LOW). Schedule/Exhibit mentions are disclosed as
    // MISSING_SCHEDULE (MEDIUM → REVIEW_REQUIRED) — the same outcome as an
    // in-budget lookup that found no structural node — never a hard
    // BUDGET_EXCEEDED stopReasons flip.
    for (const m of mentions) {
      if (m.targetKind === "SCHEDULE" || m.targetKind === "EXHIBIT") {
        state.unresolved.push({
          originatingNodeKey: null,
          dependencyType: "MISSING_SCHEDULE",
          sourceText: m.referenceText,
          attemptedResolution: `Depth ${depth} > maxCrossReferenceDepth ${state.budget.maxCrossReferenceDepth}; schedule/exhibit mention inside a definition was not retrieved as a structural node.`,
          reason: "Schedule/exhibit referenced inside a definition's own text is not present as a structural node in this package (surfaced at depth bound; definition text itself was already retrieved).",
          candidateTargets: [m.normalizedTarget],
          citation: m.referenceText,
          severity: "MEDIUM",
        });
      }
    }
    const sectionMentions = mentions.filter((m) => m.targetKind === "SECTION" || m.targetKind === "ARTICLE");
    if (sectionMentions.length > 0) {
      state.unresolved.push({
        originatingNodeKey: null,
        dependencyType: "BUDGET_EXCEEDED_DEPENDENCY",
        sourceText: sectionMentions.map((m) => m.referenceText).slice(0, 5).join("; "),
        attemptedResolution: `Depth ${depth} > maxCrossReferenceDepth ${state.budget.maxCrossReferenceDepth}; remaining Section/Article mentions inside a definition are secondary to the already-retrieved definition text.`,
        reason: "Secondary definition-text cross-references withheld at depth bound — disclosed without marking the bundle BUDGET_EXCEEDED.",
        candidateTargets: sectionMentions.map((m) => m.normalizedTarget),
        citation: parentItemId,
        severity: "LOW",
      });
    }
    return;
  }
  for (const mention of mentions) {
    if (mention.targetKind !== "SECTION" && mention.targetKind !== "ARTICLE") {
      if (mention.targetKind === "SCHEDULE" || mention.targetKind === "EXHIBIT") {
        state.unresolved.push({
          originatingNodeKey: null,
          dependencyType: "MISSING_SCHEDULE",
          sourceText: mention.referenceText,
          attemptedResolution: `Looked for a ${mention.targetKind} node with ref "${mention.normalizedTarget}" in this document's own structural index.`,
          reason: "Schedule/exhibit referenced inside a definition's own text is not present as a structural node in this package.",
          candidateTargets: [mention.normalizedTarget],
          citation: mention.referenceText,
          severity: "MEDIUM",
        });
      }
      continue;
    }

    // Skip non-material laundry-list citations inside definitions (still
    // retrieve calculation / methodology targets).
    if (isLaundryListDefinitionMention(definitionText, mention.charStart)) {
      continue;
    }

    let targetNode: StructuralNode | null = null;
    const unique = index.resolveUniqueNodeByRef(documentId, mention.normalizedTarget);
    if (unique.status === "UNIQUE") {
      targetNode = unique.node;
    } else if (unique.status === "AMBIGUOUS") {
      targetNode = resolveAmbiguousSectionTarget(state, index, documentId, null, mention.referenceText, mention.normalizedTarget, "MEDIUM");
    } else {
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
      continue;
    }
    if (!targetNode) continue;
    const targetText = index.getNodeText(targetNode.nodeId, "OWN");
    if (targetText.trim().length === 0) continue;
    if (!withinBudget(state, targetText.length)) return;
    const itemType = classifyReferencedProvision(targetText);
    const targetEvidenceState = resolveSectionEvidenceState(state, targetNode.documentId, { nodeId: targetNode.nodeId, sectionRef: targetNode.sectionRef });
    const item = addItem(state, makeItemInput(itemType, documentId, targetNode.nodeKey, targetNode.nodeId, targetNode.sectionRef, `Section ${targetNode.sectionRef}`, targetText, `Referenced within a definition's own text ("${mention.referenceText}").`, depth, [parentItemId], "CROSS_REFERENCE_INDEX", 1, targetEvidenceState));
    addEdge(state, parentItemId, item.itemId, "REFERENCES", `"${mention.referenceText}" inside a definition.`);
    if (packageGraph) {
      retrieveAmendmentLeadsForSection(state, packageGraph, targetNode.documentId, targetNode.sectionRef, item.itemId);
    }
  }
}

/**
 * INV-04: reverse-reference lookup for override provisions that name this
 * candidate's section or enclosing Article ("Notwithstanding anything to the
 * contrary in Article VII…"). Outbound traversal never sees them; the index
 * already records inbound edges via findReferencesTo.
 */
const INBOUND_OVERRIDE_SIGNAL = /\bnotwithstanding\b/i;

export function retrieveInboundOverrideReferences(
  state: RetrievalState,
  index: StructuralIndex,
  documentId: string,
  nodeId: string,
  parentItemId: string,
): void {
  const candidate = index.getNodeById(nodeId);
  if (!candidate) return;
  const targets = [candidate, ...index.getAncestors(nodeId)].filter((n) => n.nodeType === "SECTION" || n.nodeType === "ARTICLE" || n.nodeId === nodeId);
  const seenSourceSections = new Set<string>();
  for (const target of targets) {
    for (const ref of index.findReferencesTo(target.nodeId)) {
      if (!ref.sourceNodeId) continue;
      if (ref.sourceNodeId === nodeId) continue;
      if (index.getAncestors(ref.sourceNodeId).some((a) => a.nodeId === nodeId)) continue;
      const sourceSection =
        index.getNodeById(ref.sourceNodeId)?.nodeType === "SECTION"
          ? index.getNodeById(ref.sourceNodeId)!
          : index.getAncestors(ref.sourceNodeId).find((n) => n.nodeType === "SECTION") ?? index.getNodeById(ref.sourceNodeId);
      if (!sourceSection || sourceSection.documentId !== documentId) continue;
      if (seenSourceSections.has(sourceSection.nodeId)) continue;
      // Same-section siblings are already handled by retrieveSiblingContext.
      if (sourceSection.nodeId === candidate.nodeId) continue;
      if (candidate.nodeType !== "SECTION" && index.getAncestors(nodeId).some((a) => a.nodeId === sourceSection.nodeId && a.nodeType === "SECTION")) continue;

      const text = index.getNodeText(sourceSection.nodeId, "DESCENDANTS");
      if (text.trim().length === 0 || !INBOUND_OVERRIDE_SIGNAL.test(text)) continue;
      if (!withinBudget(state, text.length)) return;

      seenSourceSections.add(sourceSection.nodeId);
      const evidenceState = resolveSectionEvidenceState(state, documentId, { nodeId: sourceSection.nodeId, sectionRef: sourceSection.sectionRef });
      const item = addItem(
        state,
        makeItemInput(
          "RELATED_COVENANT",
          documentId,
          sourceSection.nodeKey,
          sourceSection.nodeId,
          sourceSection.sectionRef,
          `Section ${sourceSection.sectionRef}`,
          text,
          `Inbound override: Section ${sourceSection.sectionRef} references ${ref.referenceText} with notwithstanding language that governs this candidate's ${target.nodeType === "ARTICLE" ? "article" : "section"}.`,
          1,
          [parentItemId],
          "CROSS_REFERENCE_INDEX",
          0.9,
          evidenceState,
        ),
      );
      addEdge(state, parentItemId, item.itemId, "REFERENCES", `inbound "${ref.referenceText}" from Section ${sourceSection.sectionRef}`);
    }
  }
}
