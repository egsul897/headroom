import { jaccardSimilarity, sha256Text } from "./hash";
import type { DuplicateReport, SourceToCovenantRecord } from "./types";
import { DATASET_SCHEMA_VERSION } from "./types";

const NEAR_DUPLICATE_THRESHOLD = 0.92;

export function detectDuplicates(records: readonly SourceToCovenantRecord[]): DuplicateReport {
  const exactDuplicatePairs: DuplicateReport["exactDuplicatePairs"] = [];
  const byWindow = new Map<string, string[]>();
  for (const r of records) {
    const h = r.input.windowSha256 || sha256Text(r.input.exactText);
    const list = byWindow.get(h) ?? [];
    list.push(r.exampleId);
    byWindow.set(h, list);
  }
  for (const [windowSha256, ids] of byWindow) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        exactDuplicatePairs.push({ a: ids[i]!, b: ids[j]!, windowSha256 });
      }
    }
  }

  const nearDuplicateClusters: DuplicateReport["nearDuplicateClusters"] = [];
  const assigned = new Set<string>();
  let clusterSeq = 0;
  for (let i = 0; i < records.length; i++) {
    const a = records[i]!;
    if (assigned.has(a.exampleId)) continue;
    const members: string[] = [a.exampleId];
    let maxSim = 0;
    for (let j = i + 1; j < records.length; j++) {
      const b = records[j]!;
      if (assigned.has(b.exampleId)) continue;
      if (a.input.windowSha256 === b.input.windowSha256) continue; // exact handled above
      const sim = jaccardSimilarity(a.input.exactText, b.input.exactText);
      if (sim >= NEAR_DUPLICATE_THRESHOLD) {
        members.push(b.exampleId);
        maxSim = Math.max(maxSim, sim);
      }
    }
    if (members.length > 1) {
      const clusterId = `near-dup-${String(++clusterSeq).padStart(3, "0")}`;
      for (const id of members) assigned.add(id);
      nearDuplicateClusters.push({
        clusterId,
        exampleIds: members,
        method: `token-jaccard>=${NEAR_DUPLICATE_THRESHOLD}`,
        similarity: Number(maxSim.toFixed(4)),
      });
    }
  }

  const heldOutContamination: DuplicateReport["heldOutContamination"] = [];
  const heldOut = records.filter((r) => r.split === "eval-heldout");
  const trainDev = records.filter((r) => r.split !== "eval-heldout");
  for (const h of heldOut) {
    for (const t of trainDev) {
      if (h.document.issuerId === t.document.issuerId) {
        heldOutContamination.push({
          trainOrDevExampleId: t.exampleId,
          heldOutExampleId: h.exampleId,
          reason: `same issuerId leaked across split boundary: ${h.document.issuerId}`,
        });
      } else if (h.input.windowSha256 === t.input.windowSha256) {
        heldOutContamination.push({
          trainOrDevExampleId: t.exampleId,
          heldOutExampleId: h.exampleId,
          reason: "identical windowSha256 across held-out boundary",
        });
      }
    }
  }

  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    exactDuplicatePairs,
    nearDuplicateClusters,
    heldOutContamination,
  };
}

/** Apply near-duplicate cluster ids onto records (pure; returns new array). */
export function applyNearDuplicateClusterIds(
  records: readonly SourceToCovenantRecord[],
  report: DuplicateReport,
): SourceToCovenantRecord[] {
  const map = new Map<string, string>();
  for (const c of report.nearDuplicateClusters) {
    for (const id of c.exampleIds) map.set(id, c.clusterId);
  }
  return records.map((r) => ({
    ...r,
    nearDuplicateClusterId: map.get(r.exampleId) ?? null,
  }));
}
