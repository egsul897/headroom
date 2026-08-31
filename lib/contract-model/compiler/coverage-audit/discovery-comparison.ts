/**
 * Phase 2E - discovery-coverage comparison (task §9/§12/§13/§22/§30).
 * COMPARISON STAGE ONLY: reads Phase 2B's real DiscoveredCandidate[]
 * output solely to classify each independently-generated CoverageRegion's
 * relationship to it - primary output is a comparison target here, never
 * a discovery input (the regions themselves were already built by
 * source-inventory.ts with zero knowledge of this array).
 *
 * Attribution discipline (task §22/§30): a region whose own text shows an
 * unrepresented multi-item list (possibleUnstructuredMultiItem) is a
 * STRUCTURAL substrate limitation - no structural node exists for the
 * swallowed sub-item to be cited by ANY discovery algorithm, so this is
 * ALWAYS reported as its own STRUCTURAL_COVERAGE_GAP finding
 * (rootCauseSubsystem STRUCTURAL_SUBSTRATE), never charged to Phase 2B.
 * Separately, if the ONE candidate that DOES exist for that same node
 * never even flagged multipleRulesLikely despite having the node's own
 * full (unseparated) text available to read, that is an independent,
 * additional Phase 2B classification gap - reported as its own
 * PARTIAL_DISCOVERY finding (rootCauseSubsystem DISCOVERY_PHASE_2B). The
 * two are never collapsed into one finding, since fixing one does not fix
 * the other (task §22's own "do not charge the same root cause to
 * multiple downstream stages").
 */
import type { StructuralIndex } from "../structural-index";
import type { DiscoveredCandidate } from "../discovery/types";
import { regionMateriality } from "./source-inventory";
import { computeFindingId } from "./identity";
import type { AuditFinding, CoverageRegion, DiscoveryComparisonStatus, RootCauseSubsystem } from "./types";
import { COVERAGE_AUDIT_ALGORITHM_VERSION } from "./types";

function candidatesTouchingNode(candidates: DiscoveredCandidate[], nodeId: string): DiscoveredCandidate[] {
  return candidates.filter((c) => c.structuralNodeIds.includes(nodeId));
}

export interface DiscoveryComparisonResult {
  status: DiscoveryComparisonStatus;
  relatedCandidateIds: string[];
}

/**
 * Classifies one region against the real candidate list, purely on
 * structural-node relationship - never requires exact source-reference
 * string equality (task §9). The multi-item/structural-gap dimension is
 * handled separately in auditDiscoveryCoverage (see header).
 */
export function compareRegionToDiscovery(region: CoverageRegion, candidates: DiscoveredCandidate[], index: StructuralIndex): DiscoveryComparisonResult {
  const exact = candidatesTouchingNode(candidates, region.structuralNodeId);
  if (exact.length > 0) return { status: "DISCOVERED_EXACTLY", relatedCandidateIds: exact.map((c) => c.discoveryId) };

  const descendantIds = new Set(index.getDescendants(region.structuralNodeId).map((n) => n.nodeId));
  const byDescendant = candidates.filter((c) => c.structuralNodeIds.some((id) => descendantIds.has(id)));
  if (byDescendant.length > 0) return { status: "DISCOVERED_BY_DESCENDANT", relatedCandidateIds: byDescendant.map((c) => c.discoveryId) };

  const ancestorIds = new Set(index.getAncestors(region.structuralNodeId).map((n) => n.nodeId));
  const byAncestor = candidates.filter((c) => c.structuralNodeIds.some((id) => ancestorIds.has(id)));
  if (byAncestor.length > 0) {
    // Task §9's own warning: do not over-credit a coarse parent candidate
    // when this region is economically distinct from its siblings. A
    // region that HAS siblings under the same ancestor is, by definition,
    // one of several distinct items the ancestor's own text bundles
    // together - ancestor-only credit for THIS region is never sufficient
    // proof it was itself separately discovered, whether or not some OTHER
    // sibling happens to have its own exact/descendant candidate (that
    // fact says something about the sibling, not about this region).
    // DISCOVERED_BY_ANCESTOR is reserved for the genuinely single-child
    // case (no siblings at all), where the ancestor candidate legitimately
    // represents the one real item beneath it.
    const siblings = index.getSiblings(region.structuralNodeId);
    if (siblings.length > 0) return { status: "PARTIALLY_DISCOVERED", relatedCandidateIds: byAncestor.map((c) => c.discoveryId) };
    return { status: "DISCOVERED_BY_ANCESTOR", relatedCandidateIds: byAncestor.map((c) => c.discoveryId) };
  }

  return { status: "NOT_DISCOVERED", relatedCandidateIds: [] };
}

function makeFinding(region: CoverageRegion, findingType: AuditFinding["findingType"], materiality: AuditFinding["materiality"], comparisonResult: AuditFinding["comparisonResult"], rootCause: RootCauseSubsystem, evidence: string, reasoning: string, affectedDiscoveryId: string | null): AuditFinding {
  return {
    findingId: computeFindingId(region.documentId, region.structuralNodeId, findingType, evidence),
    companyId: region.companyId,
    packageKey: region.packageKey,
    instrumentKey: region.instrumentKey,
    documentId: region.documentId,
    structuralNodeKey: region.structuralNodeKey,
    structuralNodeId: region.structuralNodeId,
    sourceCitation: region.sourceCitation,
    findingType,
    materiality,
    sourceEvidence: evidence,
    auditorReasoning: reasoning,
    comparisonResult,
    rootCauseSubsystem: rootCause,
    affectedDiscoveryId,
    affectedBundleId: null,
    resolutionStatus: "OPEN",
    auditAlgorithmVersion: COVERAGE_AUDIT_ALGORITHM_VERSION,
    semanticPromptVersion: null,
    providerIdentity: null,
    provenance: "discovery-comparison.ts - comparison stage (real Phase 2B output read here only, never during independent inventory generation)",
    // Phase 3F.1.6.R BLOCKER-3 fix - inherits its own region's disposition
    // (UNKNOWN_SUPERSESSION_STATUS unless/until runIndependentCoverageAudit
    // re-tags every finding post-hoc against a real supersessionIndex).
    supersessionStatus: region.supersessionStatus,
    supersessionReason: region.supersessionReason,
  };
}

/** DISCOVERED_SEMANTICALLY_EQUIVALENT is reserved and never produced in this deterministic-only V1 (no semantic layer was needed - see the final report). */
export function auditDiscoveryCoverage(regions: CoverageRegion[], candidates: DiscoveredCandidate[], index: StructuralIndex): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const region of regions) {
    const materiality = regionMateriality(region);
    if (materiality === "NON_MATERIAL") continue; // never fabricate a finding over administrative/boilerplate text (task §10).

    const comparison = compareRegionToDiscovery(region, candidates, index);

    // (1) Structural-substrate gap - always reported when present, entirely
    // independent of what the primary discovery output says (task §22/§30).
    if (region.possibleUnstructuredMultiItem) {
      const evidence = `${region.sectionRef}'s own text contains ${region.inlineEnumeratedItemCount} independently-enumerated item(s) that the structural parser did not separate into their own citable nodes.`;
      findings.push(makeFinding(region, "STRUCTURAL_COVERAGE_GAP", materiality, comparison.status, "STRUCTURAL_SUBSTRATE", evidence, "Independent scan found enumerated sub-items inside this node's own text with no corresponding child StructuralNode - no discovery or context-retrieval algorithm can cite what the structural substrate never separated (same class as the known LSB 6.14(b)/(c)/(d) comma-list limitation).", comparison.relatedCandidateIds[0] ?? null));

      // A separate, additional Phase 2B-attributable gap: the ONE candidate
      // that DOES touch this exact node never flagged multipleRulesLikely,
      // despite the node's own (unseparated) text being fully available to
      // read - a real classification miss independent of the structural gap.
      if (comparison.status === "DISCOVERED_EXACTLY" && !candidatesTouchingNode(candidates, region.structuralNodeId).some((c) => c.multipleRulesLikely)) {
        findings.push(makeFinding(region, "PARTIAL_DISCOVERY", materiality, comparison.status, "DISCOVERY_PHASE_2B", `The discovered candidate for ${region.sectionRef} does not flag multipleRulesLikely despite this node's own full text independently showing multiple enumerated items.`, "Independent scan found a real, additional classification gap distinct from the structural gap above: the candidate had the node's own full text available and could have flagged the ambiguity even without a separate child node for each item.", comparison.relatedCandidateIds[0] ?? null));
      }
      continue;
    }

    if (comparison.status === "DISCOVERED_EXACTLY" || comparison.status === "DISCOVERED_BY_DESCENDANT" || comparison.status === "DISCOVERED_BY_ANCESTOR") continue;

    const findingType = comparison.status === "PARTIALLY_DISCOVERED" ? "PARTIAL_DISCOVERY" : "MATERIAL_DISCOVERY_MISS";
    const evidence = `${region.sectionRef} carries independent signal(s) [${region.detectedSignals.join(", ")}] with probable role ${region.probableRole}, but no discovered candidate touches this node, a descendant, or a sibling-aware ancestor.`;
    findings.push(makeFinding(region, findingType, materiality, comparison.status, "DISCOVERY_PHASE_2B", evidence, `Independent source-side scan classified this region as probable role ${region.probableRole} with materiality ${materiality}; comparison against the real Phase 2B DiscoveredCandidate[] found status ${comparison.status}.`, comparison.relatedCandidateIds[0] ?? null));
  }

  return findings;
}
