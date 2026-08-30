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

/**
 * Phase 3F.1.2: resolves the composed section reference via
 * `resolveUniqueNodeByRef` - cardinality-aware (UNIQUE/NOT_FOUND/AMBIGUOUS),
 * never a hand-constructed label string probed against a raw `.get()`
 * (the pre-3F.1.2 shape, which was itself a third independent
 * re-implementation of stage-structure.ts's own nodeKey-construction
 * template, and inherited the same collision risk: an AMBIGUOUS composed
 * reference would previously have silently resolved to whichever physical
 * occurrence the index's last-write-wins map happened to keep).
 */
function resolveRelativeRef(index: StructuralIndex, documentId: string, sectionRef: string, relativeRef: string): string | null {
  const composed = relativeRef ? `${sectionRef}${relativeRef.replace(/\s+/g, "")}` : sectionRef;
  const resolution = index.resolveUniqueNodeByRef(documentId, composed);
  return resolution.status === "UNIQUE" ? resolution.node.nodeId : null;
}

/**
 * Phase 3F.1.6.R BLOCKER-8 fix - a sibling-safety disambiguator layered on
 * top of (documentId, normalizedSourceRef, role, discoveryRunVersion).
 *
 * Root cause (13-claim-identity-certification.json's own F15-1): when two
 * SemanticRuleItems from the SAME Pass B section call resolve to the SAME
 * anchor node and role with no lettered/numbered sub-reference to split on
 * (an un-enumerated multi-claim sentence, e.g. "shall not create Liens ...
 * or incur Indebtedness ..."), the pre-fix discoveryId formula had nothing
 * left to distinguish them - both hashed identical, and Pass D's merge then
 * silently discarded one claim's own description.
 *
 * Deliberately uses `families` (a closed CovenantFamily enum Pass B already
 * assigns per item via normalization.ts, NOT a paraphrase) rather than the
 * free-text `description` field. Two items describing the SAME real clause
 * routinely carry different re-paraphrased description text across
 * independent detections (see the "genuine duplicate" test in
 * tests/contract-model/discovery-pipeline.test.ts, scenario 18) - hashing
 * raw description would have wrongly turned that legitimate merge into two
 * false-distinct siblings. `families` carries no such risk: it is a
 * normalized, bounded-vocabulary classification, stable across independent
 * detections of the same real clause, and it is exactly what differs
 * between two genuinely distinct economic claims in the common real-world
 * shape of this defect (a fused sentence bundling two different covenant
 * topics, e.g. Liens vs Indebtedness).
 *
 * Disclosed residual risk (documented in
 * docs/phase-3f1-6-r-blocker-remediation/11-claim-identity-remediation.json):
 * two DISTINCT claims fused in one un-enumerated sentence that ALSO share
 * the exact same family (e.g. two different Indebtedness baskets bundled
 * without lettering) remain merged - `families` alone cannot disambiguate
 * that narrower case, and no other field on SemanticRuleItem is both
 * source-grounded and free of paraphrase/ordinal instability. This is a
 * smaller, disclosed gap, not the confirmed BLOCKER-8 case (which always
 * had differing families - that is what made the two claims "economically
 * distinct" in the first place).
 */
export function computeCandidateContentFingerprint(c: Pick<ExpandedCandidate, "families">): string {
  return [...new Set(c.families)].sort().join(",");
}

export interface ExpandedCandidate {
  structuralNodeKeys: string[];
  structuralNodeIds: string[];
  normalizedSourceRef: string;
  role: DiscoveryRole;
  roleRaw: string;
  roleNormalizationStatus: DiscoveredCandidate["roleNormalizationStatus"];
  families: DiscoveredCandidate["families"];
  familiesRaw: string[];
  familiesNormalizationStatus: DiscoveredCandidate["familiesNormalizationStatus"];
  otherFamilyDescription?: string;
  description: string;
  multipleRulesLikely: boolean;
  definedTermDependencyLikely: boolean;
  confidence: number;
  needsReview: boolean;
  sourceCitation: string;
}

export function runPassCNeighborhoodExpansion(index: StructuralIndex, documentId: string, sectionNodeId: string, sectionRef: string, semanticItems: SemanticRuleItem[], discoveryRunVersion: string): { candidates: ExpandedCandidate[]; discoveryId: (c: ExpandedCandidate) => string } {
  const candidates: ExpandedCandidate[] = [];

  for (const item of semanticItems) {
    const resolvedId = resolveRelativeRef(index, documentId, sectionRef, item.relativeRef);
    // Exact-resolution-only, matching Phase 1A's own safety discipline: if
    // the model's relativeRef does not correspond to a real, UNIQUELY
    // resolved structural node (not found, or ambiguous among more than
    // one physical occurrence), fall back to the section itself as the
    // evidence anchor rather than fabricating a node reference that does
    // not exist or guessing among colliding candidates.
    const anchorId = resolvedId ?? sectionNodeId;
    const anchorNode = index.getNodeById(anchorId);
    const structuralNodeIds = [anchorId];
    const structuralNodeKeys = [anchorNode?.nodeKey ?? ""];
    // Neighborhood guarantee: an EXCEPTION/BASKET/PROVISO is always linked
    // back to its containing section node too, so a downstream consumer
    // asking "what does this exception modify" never has to guess.
    if (anchorId !== sectionNodeId && (item.role === "EXCEPTION" || item.role === "BASKET" || item.role === "PROVISO" || item.role === "CONDITION")) {
      structuralNodeIds.push(sectionNodeId);
      structuralNodeKeys.push(index.getNodeById(sectionNodeId)?.nodeKey ?? "");
    }
    candidates.push({
      structuralNodeKeys,
      structuralNodeIds,
      normalizedSourceRef: anchorNode?.sectionRef ?? sectionRef,
      role: item.role,
      roleRaw: item.roleRaw,
      roleNormalizationStatus: item.roleNormalizationStatus,
      families: item.families as DiscoveredCandidate["families"],
      familiesRaw: item.familiesRaw,
      familiesNormalizationStatus: item.familiesNormalizationStatus,
      otherFamilyDescription: item.otherFamilyDescription,
      description: item.description,
      multipleRulesLikely: item.multipleRulesLikely,
      definedTermDependencyLikely: item.definedTermDependencyLikely,
      confidence: item.confidence,
      needsReview: item.needsReview,
      sourceCitation: anchorNode ? index.getNodeText(anchorNode.nodeId, "OWN").slice(0, 300) : "",
    });
  }

  // Structural guarantee: the section's own top-level node is always
  // represented in the final inventory (task §12's core risk), even if
  // every semantic item Pass B returned resolved to a deeper sub-node -
  // never silently missing because Pass B happened to only describe
  // children.
  const sectionAlreadyRepresented = candidates.some((c) => c.structuralNodeIds.includes(sectionNodeId) && c.normalizedSourceRef === sectionRef);
  if (!sectionAlreadyRepresented) {
    const sectionNode = index.getNodeById(sectionNodeId);
    candidates.push({
      structuralNodeKeys: [sectionNode?.nodeKey ?? ""],
      structuralNodeIds: [sectionNodeId],
      normalizedSourceRef: sectionRef,
      role: "GENERAL_PROHIBITION",
      roleRaw: "",
      roleNormalizationStatus: "VALID_CANONICAL",
      families: [],
      familiesRaw: [],
      familiesNormalizationStatus: "VALID_CANONICAL",
      description: `Section-level container for ${sectionRef} (${sectionNode?.heading ?? ""}) - synthesized to guarantee the section's own general/chapeau language is represented alongside its discovered sub-rules.`,
      multipleRulesLikely: candidates.length > 1,
      definedTermDependencyLikely: false,
      confidence: 0.5,
      needsReview: true,
      sourceCitation: sectionNode ? index.getNodeText(sectionNode.nodeId, "OWN").slice(0, 300) : "",
    });
  }

  return {
    candidates,
    discoveryId: (c: ExpandedCandidate) => computeStableKey("discovery-candidate", documentId, c.normalizedSourceRef, c.role, discoveryRunVersion, computeCandidateContentFingerprint(c)),
  };
}
