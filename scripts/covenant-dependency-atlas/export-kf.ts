/**
 * Knowledge-factory compatible dataset export (Phase 2).
 *
 * Flat nodes/edges + motifs + completeness + unresolved relationships +
 * deterministic node-identity reconciliation. No silent data loss.
 */

import type { AtlasDataset, KnowledgeFactoryExport } from "./schema";
import { ATLAS_SCHEMA_VERSION, DEPENDENCY_EDGE_KINDS, KF_EXPORT_SCHEMA_VERSION } from "./schema";
import { assertNoSilentNodeLoss, reconcileNodeIdentity } from "./node-identity";

export function toKnowledgeFactoryExport(dataset: AtlasDataset): KnowledgeFactoryExport {
  const nodeIdentity = dataset.nodeIdentity ?? reconcileNodeIdentity(dataset);
  assertNoSilentNodeLoss(nodeIdentity);

  const nodes = dataset.packages.flatMap((p) => p.documents.flatMap((d) => d.nodes));
  const edges = dataset.packages.flatMap((p) => p.documents.flatMap((d) => d.edges));
  const motifs = dataset.packages.flatMap((p) => p.documents.flatMap((d) => d.motifs));
  const completenessReports = dataset.packages.flatMap((p) => p.documents.map((d) => d.completeness));

  const byKind: Record<string, number> = {};
  for (const k of DEPENDENCY_EDGE_KINDS) byKind[k] = 0;
  const byResolution: Record<string, number> = { RESOLVED: 0, UNRESOLVED: 0, AMBIGUOUS: 0 };
  for (const e of edges) {
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    byResolution[e.resolution] = (byResolution[e.resolution] ?? 0) + 1;
  }

  const unresolvedRelationships = edges
    .filter((e) => e.resolution === "UNRESOLVED" || e.resolution === "AMBIGUOUS")
    .map((e) => ({
      edgeId: e.edgeId,
      kind: e.kind,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      resolution: e.resolution as "UNRESOLVED" | "AMBIGUOUS",
      unresolvedReason: e.unresolvedReason,
      rationale: e.rationale,
      rootCause: e.rootCause ?? null,
      controllingRestrictionRisk: e.controllingRestrictionRisk ?? false,
    }));

  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));
  const edgeMap = new Map(edges.map((e) => [e.edgeId, e]));
  const motifMap = new Map(motifs.map((m) => [m.motifId, m]));

  if (nodeMap.size !== nodeIdentity.kfExportNodeCount) {
    throw new Error(
      `KF node map size ${nodeMap.size} != reconciliation kfExportNodeCount ${nodeIdentity.kfExportNodeCount}`,
    );
  }

  return {
    schemaVersion: KF_EXPORT_SCHEMA_VERSION,
    atlasSchemaVersion: ATLAS_SCHEMA_VERSION,
    generatedAt: dataset.generatedAt,
    paidInference: false,
    merges: false,
    certificationChanges: false,
    productionResolverTouched: false,
    nodes: [...nodeMap.values()].sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    edges: [...edgeMap.values()].sort((a, b) => a.edgeId.localeCompare(b.edgeId)),
    motifs: [...motifMap.values()].sort((a, b) => a.motifId.localeCompare(b.motifId)),
    completenessReports,
    unresolvedRelationships,
    nodeIdentity,
    counts: {
      nodes: nodeMap.size,
      edges: edgeMap.size,
      byKind,
      byResolution,
      diamonds: [...motifMap.values()].filter((m) => m.motifType === "DIAMOND_SHARED_DEPENDENCY").length,
      cycles: [...motifMap.values()].filter((m) => m.motifType === "GENUINE_CYCLE").length,
      unresolved: byResolution.UNRESOLVED ?? 0,
      ambiguous: byResolution.AMBIGUOUS ?? 0,
    },
  };
}
