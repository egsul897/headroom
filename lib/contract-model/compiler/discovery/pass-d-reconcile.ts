/**
 * Phase 2B Pass D - reconciliation (task §8 Pass D). Deduplicates
 * overlapping discoveries produced by multiple signals/passes WITHOUT
 * discarding genuinely distinct rules that happen to share a section -
 * two candidates are merged only when they resolve to the EXACT same
 * primary structural node AND the same role; anything else is kept
 * distinct, preserving provenance (discoveryMethods, evidenceSignals) for
 * every input that contributed to a merged result.
 */
import type { DeterministicCandidate, DiscoveredCandidate, DiscoveryMethod } from "./types";
import type { ExpandedCandidate } from "./pass-c-neighborhood";

export interface ReconciliationInput {
  documentId: string;
  discoveryRunVersion: string;
  expanded: ExpandedCandidate[];
  discoveryId: (c: ExpandedCandidate) => string;
  deterministicByNodeId: Map<string, DeterministicCandidate>;
}

/**
 * Phase 3F.1.2 - `mergeKey` is now built from `structuralNodeIds[0]` (real
 * physical occurrence identity), never the pre-3F.1.2 `structuralNodeKeys[0]`
 * label. This closes the highest-consequence Phase 2B finding from the
 * Structural Node Identity architecture proposal's consumer inventory: under
 * the label-keyed scheme, two candidates whose primary structural nodes were
 * physically DISTINCT but happened to share a duplicate-collided label would
 * merge here, silently folding two genuinely separate covenant provisions
 * into one DiscoveredCandidate - a direct violation of this module's own
 * documented "two candidates are merged only when they resolve to the EXACT
 * same primary structural node" invariant (which was previously enforced
 * only up to label collision, not truly exact).
 */
export function runPassDReconciliation(input: ReconciliationInput): { candidates: DiscoveredCandidate[]; duplicatesBeforeReconciliation: number } {
  const { documentId, discoveryRunVersion, expanded, discoveryId, deterministicByNodeId } = input;
  const byKey = new Map<string, DiscoveredCandidate>();
  let duplicatesBeforeReconciliation = 0;

  for (const item of expanded) {
    const primaryNodeId = item.structuralNodeIds[0]!;
    const mergeKey = `${primaryNodeId}::${item.role}`;
    const deterministic = deterministicByNodeId.get(primaryNodeId);
    const methods: DiscoveryMethod[] = ["SEMANTIC_CLASSIFICATION"];
    if (deterministic) methods.push("DETERMINISTIC_SIGNAL");
    if (item.structuralNodeIds.length > 1) methods.push("NEIGHBORHOOD_EXPANSION");

    const existing = byKey.get(mergeKey);
    if (existing) {
      duplicatesBeforeReconciliation++;
      // Merge: keep the higher-confidence description, union structural nodes/evidence, never lose provenance.
      const mergedNodeKeys = Array.from(new Set([...existing.structuralNodeKeys, ...item.structuralNodeKeys]));
      const mergedNodeIds = Array.from(new Set([...existing.structuralNodeIds, ...item.structuralNodeIds]));
      const mergedMethods = Array.from(new Set([...existing.discoveryMethods, ...methods]));
      const mergedSignals = Array.from(new Set([...existing.evidenceSignals, ...(deterministic?.signals ?? [])]));
      byKey.set(mergeKey, {
        ...existing,
        structuralNodeKeys: mergedNodeKeys,
        structuralNodeIds: mergedNodeIds,
        discoveryMethods: mergedMethods,
        evidenceSignals: mergedSignals,
        confidence: Math.max(existing.confidence ?? 0, item.confidence),
        multipleRulesLikely: existing.multipleRulesLikely || item.multipleRulesLikely,
      });
      continue;
    }

    const candidate: DiscoveredCandidate = {
      discoveryId: discoveryId(item),
      documentId,
      structuralNodeKeys: item.structuralNodeKeys,
      structuralNodeIds: item.structuralNodeIds,
      normalizedSourceRef: item.normalizedSourceRef,
      families: item.families,
      otherFamilyDescription: item.otherFamilyDescription,
      role: item.role,
      roleRaw: item.roleRaw,
      roleNormalizationStatus: item.roleNormalizationStatus,
      familiesRaw: item.familiesRaw,
      familiesNormalizationStatus: item.familiesNormalizationStatus,
      description: item.description,
      multipleRulesLikely: item.multipleRulesLikely,
      definedTermDependencyLikely: item.definedTermDependencyLikely,
      discoveryMethods: methods,
      evidenceSignals: deterministic?.signals ?? [],
      reviewStatus: item.needsReview || item.confidence < 0.5 ? "NEEDS_REVIEW" : item.confidence < 0.75 ? "UNCERTAIN" : "AUTO_ACCEPTED",
      confidence: item.confidence,
      sourceCitation: item.sourceCitation,
      discoveryRunVersion,
    };
    byKey.set(mergeKey, candidate);
  }

  return { candidates: [...byKey.values()], duplicatesBeforeReconciliation };
}
