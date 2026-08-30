/**
 * Phase 2E - coverage map (task §35). Per-region audit state, never
 * equating "audited" with "correct" - AUDITED_NO_GAP_FOUND means the
 * region was checked and nothing was found, not that it is guaranteed
 * defect-free.
 */
import type { AuditFinding, CoverageMapEntry, CoverageRegion, RegionAuditState } from "./types";
import { regionMateriality } from "./source-inventory";

export function buildCoverageMap(regions: CoverageRegion[], findings: AuditFinding[], discoveredNodeIds: ReadonlySet<string>): CoverageMapEntry[] {
  // Phase 3F.1.2: keyed by nodeId (real physical occurrence identity), never the label-shaped structuralNodeKey.
  const findingsByNode = new Map<string, AuditFinding[]>();
  for (const f of findings) {
    if (!f.structuralNodeId) continue;
    const list = findingsByNode.get(f.structuralNodeId) ?? [];
    list.push(f);
    findingsByNode.set(f.structuralNodeId, list);
  }

  return regions.map((region): CoverageMapEntry => {
    const nodeFindings = findingsByNode.get(region.structuralNodeId) ?? [];
    const materiality = regionMateriality(region);
    const materialFindingCount = nodeFindings.filter((f) => f.materiality === "MATERIAL").length;
    const unresolvedFindingCount = nodeFindings.filter((f) => f.findingType === "SILENT_UNRESOLVED_DEPENDENCY").length;

    let state: RegionAuditState;
    if (materialFindingCount > 0) state = "AUDITED_GAP_FOUND";
    else if (nodeFindings.some((f) => f.materiality === "UNCERTAIN")) state = "AUDIT_UNCERTAIN";
    else if (materiality === "UNCERTAIN" && nodeFindings.length === 0) state = "AUDIT_UNCERTAIN";
    else state = "AUDITED_NO_GAP_FOUND";

    return {
      regionId: region.regionId,
      documentId: region.documentId,
      sectionRef: region.sectionRef,
      state,
      primaryDiscovered: discoveredNodeIds.has(region.structuralNodeId),
      auditorCandidate: true,
      materialFindingCount,
      unresolvedFindingCount,
      // Phase 3F.1.6.R BLOCKER-3 fix - carried from the region (itself
      // already re-tagged by runIndependentCoverageAudit before this is
      // called, when a real supersessionIndex was supplied).
      supersessionStatus: region.supersessionStatus,
      supersessionReason: region.supersessionReason,
    };
  });
}
