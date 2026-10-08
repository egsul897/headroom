/**
 * Documented decisions for exact-duplicate / leakage pairs.
 * Do not silently drop useful shared-context examples.
 */
import type { SourceToCovenantRecord } from "./types";
import type { DuplicateDecision } from "./types-v2";
import { detectDuplicates } from "./dedup";

export function decideDuplicates(records: readonly SourceToCovenantRecord[]): DuplicateDecision[] {
  const report = detectDuplicates(records);
  const byId = new Map(records.map((r) => [r.exampleId, r]));
  const decisions: DuplicateDecision[] = [];
  const seenPair = new Set<string>();

  for (const pair of report.exactDuplicatePairs) {
    const key = [pair.a, pair.b].sort().join("|");
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    const a = byId.get(pair.a)!;
    const b = byId.get(pair.b)!;

    // Intentional dedup probe
    if (
      [a.exampleId, b.exampleId].some((id) => id.includes("near-dup-probe")) ||
      [a.exampleId, b.exampleId].some((id) => id.includes("dup-probe"))
    ) {
      for (const id of [a.exampleId, b.exampleId]) {
        if (decisions.some((d) => d.exampleId === id)) continue;
        decisions.push({
          exampleId: id,
          pairedExampleIds: [a.exampleId, b.exampleId].filter((x) => x !== id),
          classification: "INTENTIONAL_DEDUP_PROBE",
          keepInCorpus: true,
          trainingEligible: false,
          rationale:
            "Exact shared window retained to exercise duplicate detection. Excluded from training observations.",
        });
      }
      continue;
    }

    // Same section, one MODEL_HYPOTHESIS contrast
    if (
      a.structural.sectionRef === b.structural.sectionRef &&
      (a.output.verificationStatus === "MODEL_HYPOTHESIS" || b.output.verificationStatus === "MODEL_HYPOTHESIS")
    ) {
      for (const rec of [a, b]) {
        if (decisions.some((d) => d.exampleId === rec.exampleId)) continue;
        decisions.push({
          exampleId: rec.exampleId,
          pairedExampleIds: [a.exampleId, b.exampleId].filter((x) => x !== rec.exampleId),
          classification: "LEGITIMATE_SHARED_CONTEXT",
          keepInCorpus: true,
          trainingEligible: false,
          rationale:
            "Same controlling § window used for contrastive hypothesis vs source-checked proposal. Shared context is legitimate; only one observation may train, and neither is training-eligible until independently verified.",
        });
      }
      continue;
    }

    // Same window, chapeau vs exception limb (shared controlling context)
    if (a.structural.sectionRef !== b.structural.sectionRef || a.role !== b.role) {
      for (const rec of [a, b]) {
        if (decisions.some((d) => d.exampleId === rec.exampleId)) continue;
        decisions.push({
          exampleId: rec.exampleId,
          pairedExampleIds: [a.exampleId, b.exampleId].filter((x) => x !== rec.exampleId),
          classification: "LEGITIMATE_SHARED_CONTEXT",
          keepInCorpus: true,
          trainingEligible: false,
          rationale:
            "Multiple catalog examples share one extracted controlling window (e.g. full §6.01 for chapeau and limb). Keep both for evaluation of scope labeling; treat as duplicate training observations until span-narrowed.",
        });
      }
      continue;
    }

    // Default: duplicate training observation
    for (const rec of [a, b]) {
      if (decisions.some((d) => d.exampleId === rec.exampleId)) continue;
      decisions.push({
        exampleId: rec.exampleId,
        pairedExampleIds: [a.exampleId, b.exampleId].filter((x) => x !== rec.exampleId),
        classification: "DUPLICATE_TRAINING_OBSERVATION",
        keepInCorpus: true,
        trainingEligible: false,
        rationale: "Exact windowSha256 collision — document and exclude from training until spans are differentiated.",
      });
    }
  }

  // Issuer leakage already gated by held-out split; record amendment lineage overlaps as notes.
  const byInstrument = new Map<string, SourceToCovenantRecord[]>();
  for (const r of records) {
    const k = `${r.document.issuerId}::${r.document.instrumentKey}`;
    const list = byInstrument.get(k) ?? [];
    list.push(r);
    byInstrument.set(k, list);
  }
  for (const group of byInstrument.values()) {
    const amd = group.filter((r) => r.operativeVersion.amendmentIdentity);
    const base = group.filter((r) => !r.operativeVersion.amendmentIdentity);
    if (amd.length && base.length) {
      for (const r of amd) {
        if (decisions.some((d) => d.exampleId === r.exampleId)) continue;
        // Not a duplicate — lineage overlap disclosure only when same sectionRef
        const overlap = base.filter((b) => b.structural.sectionRef.split("(")[0] === r.structural.sectionRef.split("(")[0]);
        if (!overlap.length) continue;
        decisions.push({
          exampleId: r.exampleId,
          pairedExampleIds: overlap.map((o) => o.exampleId),
          classification: "AMENDMENT_LINEAGE_OVERLAP",
          keepInCorpus: true,
          trainingEligible: false,
          rationale: "Amendment-related example overlaps section family with base-agreement examples; retain with lineage tags, block SFT until review.",
        });
      }
    }
  }

  // Quarantine near-duplicate clusters: keep in corpus, never count as independent training observations.
  for (const cluster of report.nearDuplicateClusters) {
    const ids = cluster.exampleIds;
    if (ids.length < 2) continue;
    for (const id of ids) {
      if (decisions.some((d) => d.exampleId === id)) continue;
      decisions.push({
        exampleId: id,
        pairedExampleIds: ids.filter((x) => x !== id),
        classification: "NEAR_DUPLICATE_QUARANTINED",
        keepInCorpus: true,
        trainingEligible: false,
        rationale: `Near-duplicate cluster ${cluster.clusterId} (similarity=${cluster.similarity}, ${cluster.method}). Quarantined from independent-example counts and training until spans are differentiated.`,
      });
    }
  }

  return decisions;
}
