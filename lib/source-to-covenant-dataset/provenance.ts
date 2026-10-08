import type { ProvenanceManifest, SourceToCovenantRecord, SplitBucket, ExamplePolarity, LabelVerificationStatus } from "./types";
import { DATASET_BUILDER_VERSION, DATASET_SCHEMA_VERSION } from "./types";
import type { ToolVersionPins } from "./types";

export function buildProvenanceManifest(
  records: readonly SourceToCovenantRecord[],
  toolVersions: ToolVersionPins,
  builtAt: string = new Date().toISOString(),
): ProvenanceManifest {
  const bySplit: Record<SplitBucket, number> = { train: 0, dev: 0, "eval-heldout": 0 };
  const byPolarity: Record<ExamplePolarity, number> = { POSITIVE: 0, NEGATIVE: 0 };
  const byVerificationStatus: Partial<Record<LabelVerificationStatus, number>> = {};

  const issuerMap = new Map<string, ProvenanceManifest["issuers"][number]>();

  for (const r of records) {
    bySplit[r.split] += 1;
    byPolarity[r.polarity] += 1;
    byVerificationStatus[r.output.verificationStatus] = (byVerificationStatus[r.output.verificationStatus] ?? 0) + 1;

    const existing = issuerMap.get(r.document.issuerId);
    const splitRole = r.split === "eval-heldout" ? "eval_heldout" as const : "train_or_dev" as const;
    const root = r.document.sourceFixturePath.split("/").slice(0, 4).join("/");
    if (!existing) {
      issuerMap.set(r.document.issuerId, {
        issuerId: r.document.issuerId,
        issuerName: r.document.issuerName,
        splitRole,
        instruments: [r.document.instrumentKey],
        sourceFixtureRoots: [root],
      });
    } else {
      if (!existing.instruments.includes(r.document.instrumentKey)) existing.instruments.push(r.document.instrumentKey);
      if (!existing.sourceFixtureRoots.includes(root)) existing.sourceFixtureRoots.push(root);
      if (existing.splitRole !== splitRole && splitRole === "eval_heldout") existing.splitRole = "eval_heldout";
    }
  }

  return {
    schemaVersion: DATASET_SCHEMA_VERSION,
    datasetBuilderVersion: DATASET_BUILDER_VERSION,
    builtAt,
    toolVersions,
    safety: {
      compilerOutputNotUsedAsGroundTruth: true,
      noAutomaticSemanticApproval: true,
      claudeAcceptanceCorpusNotContaminated: true,
      noPaidInferenceUsed: true,
      usageRightsReviewRequiredBeforeSftOrDistillation: true,
    },
    issuers: [...issuerMap.values()].sort((a, b) => a.issuerId.localeCompare(b.issuerId)),
    recordCounts: {
      total: records.length,
      bySplit,
      byPolarity,
      byVerificationStatus,
    },
    sourceTextHashes: records.map((r) => ({
      exampleId: r.exampleId,
      sourceFixturePath: r.document.sourceFixturePath,
      sourceTextSha256: r.input.sourceTextSha256,
      windowSha256: r.input.windowSha256,
      amendmentIdentity: r.operativeVersion.amendmentIdentity,
    })),
  };
}
