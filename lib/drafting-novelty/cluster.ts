import type { ClusterSummary, DraftingUnit } from "./types";

export function clusterBySignature(units: DraftingUnit[]): Map<string, DraftingUnit[]> {
  const map = new Map<string, DraftingUnit[]>();
  for (const u of units) {
    const list = map.get(u.signature.key) ?? [];
    list.push(u);
    map.set(u.signature.key, list);
  }
  // Stable order inside clusters
  for (const [k, list] of map) {
    list.sort((a, b) => a.unitId.localeCompare(b.unitId));
    map.set(k, list);
  }
  return map;
}

export function summarizeClusters(units: DraftingUnit[]): ClusterSummary[] {
  const clustered = clusterBySignature(units);
  const summaries: ClusterSummary[] = [];
  for (const [key, members] of [...clustered.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const corpusCount = members.filter((m) => m.role === "CORPUS").length;
    const probeCount = members.filter((m) => m.role === "PROBE").length;
    const packages = [...new Set(members.map((m) => m.packageId))].sort();
    summaries.push({
      signatureKey: key,
      category: members[0]!.category,
      size: members.length,
      corpusCount,
      probeCount,
      packages,
      representativeUnitId: members[0]!.unitId,
    });
  }
  return summaries.sort((a, b) => a.signatureKey.localeCompare(b.signatureKey));
}
