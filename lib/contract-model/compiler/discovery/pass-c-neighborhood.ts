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
import { extractGroundedValueAnchors, extractValueAnchors, verifyDistinguishingQuote } from "../value-anchors";

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
 * Phase 3F.1.6.RX Workstream D (BLOCKER-8 + AUDIT-F4) - CLAIM IDENTITY V2.
 * The prior fix's own disclosed residual gap
 * (docs/phase-3f1-6-r-blocker-remediation/11-claim-identity-remediation.json,
 * part4_disclosedResidualRisk RESIDUAL-1): two DISTINCT claims fused in one
 * un-enumerated sentence that ALSO share the exact same family (e.g. a
 * "$50m acquisition debt basket" and a "$25m working-capital debt basket"
 * bundled together - same family INDEBTEDNESS, same role BASKET, same
 * source node) still collapsed to one identity, because `families` alone
 * has nothing left to disambiguate them. AUDIT-F4 froze this as a mandatory
 * defect class: "SAME FAMILY + SAME ROLE + SAME SOURCE NODE DOES NOT IMPLY
 * SAME CLAIM."
 *
 * V2 adds TWO further, source-GROUNDED dimensions on top of `families`
 * (see lib/contract-model/compiler/value-anchors.ts for the full rationale
 * and the grounding discipline both rely on):
 *
 *  1. `valueAnchors` - canonicalized numeric/currency/percentage/ratio
 *     values extracted from this candidate's own `description`, but kept
 *     ONLY when independently verified present in the REAL source text of
 *     this candidate's resolved anchor node (extractGroundedValueAnchors).
 *     This is what distinguishes the $50m/$25m example: both candidates
 *     resolve to the identical anchor node/section, but their own
 *     descriptions name different, source-verified dollar amounts.
 *     Requires ZERO Pass B schema/prompt change - `description` already
 *     always exists.
 *
 *  2. `verifiedQuoteFingerprint` - when Pass B additionally supplies the
 *     OPTIONAL `distinguishingQuote` field (see pass-b-semantic.ts), and
 *     that quote independently verifies as a genuine whitespace-normalized
 *     VERBATIM substring of the real anchor-node source text
 *     (verifyDistinguishingQuote - never trusted unverified), the
 *     normalized quote text itself becomes part of the fingerprint, and any
 *     value anchors found WITHIN that verified quote are folded into
 *     `valueAnchors` too. This generalizes disambiguation beyond numbers to
 *     any source-text difference (e.g. "Revolving Facility" vs "Term
 *     Facility") - but is honestly a live-model-cooperation-dependent
 *     dimension: when Pass B does not supply a quote (or supplies one that
 *     does not verify), this dimension contributes nothing, and identity
 *     gracefully degrades to exactly the pre-existing (disclosed) V1
 *     behavior for that pair - never a crash, never a silently wrong
 *     identity, never worse than before.
 *
 * Neither addition ever hashes raw, unverified AI paraphrase text (this
 * task's own explicit prohibition) - both are GROUNDED: cross-checked
 * against real source text before being trusted for anything. Two
 * independently-worded re-detections of the SAME real clause (the
 * "genuine duplicate" case tests/contract-model/discovery-pipeline.test.ts
 * scenario 18 requires to still merge) normalize to the SAME grounded
 * value-anchor set regardless of paraphrase wording, so this can never turn
 * a real duplicate into two false-distinct siblings.
 *
 * See docs/phase-3f1-6-rx-final-blocker-closure/06-claim-identity-v2.json
 * for the full design rationale and the required 9-case adversarial matrix.
 */
export function computeCandidateContentFingerprint(c: Pick<ExpandedCandidate, "families" | "valueAnchors" | "verifiedQuoteFingerprint">): string {
  const familyPart = [...new Set(c.families)].sort().join(",");
  const valuePart = [...new Set(c.valueAnchors ?? [])].sort().join(",");
  const quotePart = c.verifiedQuoteFingerprint ?? "";
  return [familyPart, valuePart, quotePart].join("|");
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
  /** Phase 3F.1.6.RX Workstream D (AUDIT-F4) - see computeCandidateContentFingerprint's own doc comment above. Always populated by runPassCNeighborhoodExpansion itself (possibly empty array); optional only so a pre-existing test fixture literal constructed before this field existed still type-checks (treated as empty when absent - see computeCandidateContentFingerprint's own `?? []`). */
  valueAnchors?: string[];
  /** Phase 3F.1.6.RX Workstream D (AUDIT-F4) - the normalized, SOURCE-VERIFIED distinguishing quote text (see verifyDistinguishingQuote), or undefined when Pass B supplied none or it failed verification. */
  verifiedQuoteFingerprint?: string;
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

    // Phase 3F.1.6.RX Workstream D (AUDIT-F4) - CLAIM IDENTITY V2's two
    // source-grounded disambiguators. Both are computed against the anchor
    // node's REAL, FULL own text (never the 300-char sourceCitation slice
    // below, which exists only for human-facing display) - see
    // computeCandidateContentFingerprint's own doc comment for the full
    // rationale and value-anchors.ts for the grounding discipline.
    const anchorFullText = anchorNode ? index.getNodeText(anchorNode.nodeId, "OWN") : "";
    const groundedDescriptionAnchors = anchorFullText ? extractGroundedValueAnchors(item.description, anchorFullText) : [];
    const verifiedQuote = anchorFullText ? verifyDistinguishingQuote(item.distinguishingQuote, anchorFullText) : null;
    const quoteAnchors = verifiedQuote ? extractValueAnchors(verifiedQuote) : [];
    const valueAnchors = [...new Set([...groundedDescriptionAnchors, ...quoteAnchors])].sort();

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
      sourceCitation: anchorNode ? anchorFullText.slice(0, 300) : "",
      valueAnchors,
      verifiedQuoteFingerprint: verifiedQuote ?? undefined,
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
      valueAnchors: [],
    });
  }

  return {
    candidates,
    discoveryId: (c: ExpandedCandidate) => computeStableKey("discovery-candidate", documentId, c.normalizedSourceRef, c.role, discoveryRunVersion, computeCandidateContentFingerprint(c)),
  };
}
