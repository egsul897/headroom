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
import type { NodeSupersessionStatus } from "../amendment/types";
import type { ExpandedCandidate } from "./pass-c-neighborhood";
import { computeCandidateContentFingerprint } from "./pass-c-neighborhood";

export interface ReconciliationInput {
  documentId: string;
  discoveryRunVersion: string;
  expanded: ExpandedCandidate[];
  discoveryId: (c: ExpandedCandidate) => string;
  deterministicByNodeId: Map<string, DeterministicCandidate>;
}

/** Worst-first ordering for combining supersessionStatus across every structural node one discovery spans - KNOWN_SUPERSEDED is more severe than UNKNOWN, which is more severe than CURRENT_OPERATIVE. Never averaged, never picked arbitrarily. */
const SEVERITY_RANK: Record<NodeSupersessionStatus, number> = { KNOWN_SUPERSEDED: 2, UNKNOWN_SUPERSESSION_STATUS: 1, CURRENT_OPERATIVE: 0 };

/**
 * Phase 3F.1.6.R BLOCKER-2 fix - the sole place `DiscoveredCandidate.
 * supersessionStatus`/`supersessionReason` are ever computed. Reads
 * `deterministicByNodeId` (previously read ONLY for discoveryMethods/
 * evidenceSignals - see the module header) for EVERY one of a discovery's
 * `structuralNodeIds`, never merely its primary node, and combines them
 * worst-first so a merged/expanded candidate can never report a safe
 * status merely because one of several spanned nodes happens to be
 * current. A node with no deterministic record at all (e.g. a Pass C
 * neighborhood node that never itself fired a Pass A signal) is treated as
 * UNKNOWN_SUPERSESSION_STATUS, never silently skipped - the same
 * fail-closed default `getNodeSupersessionStatus` itself uses.
 */
function combineSupersessionForNodes(nodeIds: string[], deterministicByNodeId: Map<string, DeterministicCandidate>): { status: NodeSupersessionStatus; reason: string } {
  if (nodeIds.length === 0) {
    return { status: "UNKNOWN_SUPERSESSION_STATUS", reason: "This discovery carries no structural node identity at all - supersession status cannot be determined." };
  }
  let worst: { status: NodeSupersessionStatus; reason: string } | null = null;
  for (const nodeId of nodeIds) {
    const det = deterministicByNodeId.get(nodeId);
    const current: { status: NodeSupersessionStatus; reason: string } = det
      ? { status: det.supersessionStatus, reason: det.supersessionReason }
      : { status: "UNKNOWN_SUPERSESSION_STATUS", reason: `No Pass A deterministic-signal record exists for structural node "${nodeId}" (likely added via Pass C neighborhood expansion) - its own supersession status was never independently checked.` };
    if (!worst || SEVERITY_RANK[current.status] > SEVERITY_RANK[worst.status]) worst = current;
  }
  const base = worst!;
  if (nodeIds.length > 1) {
    return { status: base.status, reason: `${nodeIds.length} structural nodes span this discovery; worst-case supersession status reported. ${base.reason}` };
  }
  return base;
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
 *
 * Phase 3F.1.6.R BLOCKER-8 fix - `mergeKey` also folds in
 * computeCandidateContentFingerprint (pass-c-neighborhood.ts's own
 * families-derived disambiguator), kept as the SAME dimension discoveryId
 * itself now hashes, so "these two items merge" and "these two items got
 * the same discoveryId" never diverge. Two items sharing a node+role but
 * carrying DIFFERENT families (the confirmed real-production collision -
 * see 13-claim-identity-certification.json's F15-1 and
 * docs/phase-3f1-6-r-blocker-remediation/11-claim-identity-remediation.json)
 * are no longer merged into one candidate that silently discards one
 * claim's own description; two items that are genuine re-detections of the
 * SAME real clause (same node, role, AND families - the only shape the
 * pre-fix code ever actually needed to dedup, per
 * tests/contract-model/discovery-pipeline.test.ts scenario 18) still merge
 * exactly as before.
 */
export function runPassDReconciliation(input: ReconciliationInput): { candidates: DiscoveredCandidate[]; duplicatesBeforeReconciliation: number } {
  const { documentId, discoveryRunVersion, expanded, discoveryId, deterministicByNodeId } = input;
  const byKey = new Map<string, DiscoveredCandidate>();
  let duplicatesBeforeReconciliation = 0;

  for (const item of expanded) {
    const primaryNodeId = item.structuralNodeIds[0]!;
    const mergeKey = `${primaryNodeId}::${item.role}::${computeCandidateContentFingerprint(item)}`;
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
      const mergedSupersession = combineSupersessionForNodes(mergedNodeIds, deterministicByNodeId);
      byKey.set(mergeKey, {
        ...existing,
        structuralNodeKeys: mergedNodeKeys,
        structuralNodeIds: mergedNodeIds,
        discoveryMethods: mergedMethods,
        evidenceSignals: mergedSignals,
        confidence: Math.max(existing.confidence ?? 0, item.confidence),
        multipleRulesLikely: existing.multipleRulesLikely || item.multipleRulesLikely,
        supersessionStatus: mergedSupersession.status,
        supersessionReason: mergedSupersession.reason,
      });
      continue;
    }

    const supersession = combineSupersessionForNodes(item.structuralNodeIds, deterministicByNodeId);
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
      supersessionStatus: supersession.status,
      supersessionReason: supersession.reason,
    };
    byKey.set(mergeKey, candidate);
  }

  return { candidates: [...byKey.values()], duplicatesBeforeReconciliation };
}
