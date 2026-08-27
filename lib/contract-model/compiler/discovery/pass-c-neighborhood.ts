/**
 * Phase 2B Pass C - neighborhood expansion (task §8 Pass C). Resolves each
 * semantic rule item's relative sub-reference to a real structural
 * nodeKey using EXACT structural composition (never fuzzy - the same
 * discipline Phase 1A/2A established), and guarantees the core risk this
 * pass exists to close: a discovered exception/basket is never presented
 * without the general prohibition it modifies also being represented
 * somewhere in the final inventory, and vice versa - by always including
 * the section's own top-level node as a discovered item alongside whatever
 * specific sub-rules Pass B found, rather than only trusting the model's
 * own completeness.
 */
import type { StructuralIndex } from "../structural-index";
import type { SemanticRuleItem } from "./pass-b-semantic";
import type { DiscoveredCandidate, DiscoveryRole } from "./types";
import { computeStableKey } from "../../stable-keys";

function resolveRelativeRef(index: StructuralIndex, documentId: string, sectionRef: string, relativeRef: string): string {
  if (!relativeRef) return `${documentId}::${sectionRef.replace(/\s+/g, "")}`;
  const composed = `${sectionRef}${relativeRef.replace(/\s+/g, "")}`;
  return `${documentId}::${composed}`;
}

/** True when a candidate node exists in this document's own real structural index - exact lookup, never a guess. */
function nodeExists(index: StructuralIndex, nodeKey: string): boolean {
  return !!index.getNode(nodeKey);
}

export interface ExpandedCandidate {
  structuralNodeKeys: string[];
  normalizedSourceRef: string;
  role: DiscoveryRole;
  families: DiscoveredCandidate["families"];
  otherFamilyDescription?: string;
  description: string;
  multipleRulesLikely: boolean;
  definedTermDependencyLikely: boolean;
  confidence: number;
  needsReview: boolean;
  sourceCitation: string;
}

export function runPassCNeighborhoodExpansion(index: StructuralIndex, documentId: string, sectionNodeKey: string, sectionRef: string, semanticItems: SemanticRuleItem[], discoveryRunVersion: string): { candidates: ExpandedCandidate[]; discoveryId: (c: ExpandedCandidate) => string } {
  const candidates: ExpandedCandidate[] = [];

  for (const item of semanticItems) {
    const resolvedKey = resolveRelativeRef(index, documentId, sectionRef, item.relativeRef);
    // Exact-resolution-only, matching Phase 1A's own safety discipline: if
    // the model's relativeRef does not correspond to a real structural
    // node, fall back to the section itself as the evidence anchor rather
    // than fabricating a node reference that does not exist.
    const anchorKey = nodeExists(index, resolvedKey) ? resolvedKey : sectionNodeKey;
    const anchorNode = index.getNode(anchorKey);
    const structuralNodeKeys = [anchorKey];
    // Neighborhood guarantee: an EXCEPTION/BASKET/PROVISO is always linked
    // back to its containing section node too, so a downstream consumer
    // asking "what does this exception modify" never has to guess.
    if (anchorKey !== sectionNodeKey && (item.role === "EXCEPTION" || item.role === "BASKET" || item.role === "PROVISO" || item.role === "CONDITION")) {
      structuralNodeKeys.push(sectionNodeKey);
    }
    candidates.push({
      structuralNodeKeys,
      normalizedSourceRef: anchorNode?.sectionRef ?? sectionRef,
      role: item.role,
      families: item.families as DiscoveredCandidate["families"],
      otherFamilyDescription: item.otherFamilyDescription,
      description: item.description,
      multipleRulesLikely: item.multipleRulesLikely,
      definedTermDependencyLikely: item.definedTermDependencyLikely,
      confidence: item.confidence,
      needsReview: item.needsReview,
      sourceCitation: anchorNode ? index.getNodeText(anchorNode.nodeKey, "OWN").slice(0, 300) : "",
    });
  }

  // Structural guarantee: the section's own top-level node is always
  // represented in the final inventory (task §12's core risk), even if
  // every semantic item Pass B returned resolved to a deeper sub-node -
  // never silently missing because Pass B happened to only describe
  // children.
  const sectionAlreadyRepresented = candidates.some((c) => c.structuralNodeKeys.includes(sectionNodeKey) && c.normalizedSourceRef === sectionRef);
  if (!sectionAlreadyRepresented) {
    const sectionNode = index.getNode(sectionNodeKey);
    candidates.push({
      structuralNodeKeys: [sectionNodeKey],
      normalizedSourceRef: sectionRef,
      role: "GENERAL_PROHIBITION",
      families: [],
      description: `Section-level container for ${sectionRef} (${sectionNode?.heading ?? ""}) - synthesized to guarantee the section's own general/chapeau language is represented alongside its discovered sub-rules.`,
      multipleRulesLikely: candidates.length > 1,
      definedTermDependencyLikely: false,
      confidence: 0.5,
      needsReview: true,
      sourceCitation: sectionNode ? index.getNodeText(sectionNode.nodeKey, "OWN").slice(0, 300) : "",
    });
  }

  return {
    candidates,
    discoveryId: (c: ExpandedCandidate) => computeStableKey("discovery-candidate", documentId, c.normalizedSourceRef, c.role, discoveryRunVersion),
  };
}
