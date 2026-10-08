/**
 * Phase 2 ground-truth integrity build.
 */
import { mkdirSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { resolve } from "path";
import { EXAMPLE_CATALOG } from "./catalog";
import { buildRecord, buildDataset } from "./build";
import { applyNearDuplicateClusterIds, detectDuplicates } from "./dedup";
import { auditControllingContext } from "./context-audit";
import { decideDuplicates } from "./duplicate-decisions";
import { computeEvaluationEligibility, computeTrainingEligibility, isSftExportAllowed } from "./eligibility";
import { expandAuthenticCorpus } from "./expand-authentic";
import { buildEvaluationBenchmark } from "./eval-benchmark";
import { buildKnowledgeFactoryImportPackage } from "./kf-import";
import { buildProvenanceManifest } from "./provenance";
import { buildQualityReport } from "./quality";
import type { SourceToCovenantRecord } from "./types";
import type { Phase2IntegrityReport, SourceToCovenantRecordV2 } from "./types-v2";
import { DATASET_BUILDER_VERSION_V2, DATASET_SCHEMA_VERSION_V2 } from "./types-v2";
import { auditVerificationClaim } from "./verification-audit";
import { currentToolVersionPins } from "./versions";
import { toJsonl, toSftExportRows } from "./export";

const STARTING_SHA = "66f8164ac85eb6aec37f3a7cb60451d614079a4f";

function promoteToV2(
  record: SourceToCovenantRecord,
  duplicateMap: Map<string, ReturnType<typeof decideDuplicates>[number]>,
  benchmarkIds: Set<string>,
): SourceToCovenantRecordV2 {
  const vAudit = auditVerificationClaim(record);
  const patched: SourceToCovenantRecord = {
    ...record,
    output: { ...record.output, verificationStatus: vAudit.status },
    schemaVersion: record.schemaVersion,
  };
  const context = auditControllingContext(patched);
  const duplicate = duplicateMap.get(record.exampleId) ?? null;
  const delivery = vAudit.deliveryVerificationStatus;
  const trainingEligibility = computeTrainingEligibility({
    record: patched,
    deliveryVerificationStatus: delivery,
    context,
    duplicate,
  });
  const evaluationEligibility = computeEvaluationEligibility({
    record: patched,
    context,
    duplicate,
    isBenchmarkCase: benchmarkIds.has(record.exampleId),
  });

  const blockedReasons: string[] = [];
  if (delivery !== "VERIFIED") blockedReasons.push("not_independently_verified");
  if (!vAudit.verificationEvidence.verificationRecordId) blockedReasons.push("missing_verification_record_id");
  if (trainingEligibility !== "ELIGIBLE_PENDING_RIGHTS_AND_VERIFICATION") blockedReasons.push(`trainingEligibility=${trainingEligibility}`);
  blockedReasons.push("usage_rights_review_required");

  return {
    ...patched,
    schemaVersion: DATASET_SCHEMA_VERSION_V2,
    deliveryVerificationStatus: delivery,
    verificationEvidence: vAudit.verificationEvidence,
    verificationHistory: vAudit.verificationHistory,
    controllingContextAudit: context,
    trainingEligibility,
    evaluationEligibility,
    duplicateDecision: duplicate,
    datasetAuthorExpectation: patched.output.proposedFormulaOrCapacity.description,
    independentlyReviewedGroundTruth: null,
    knowledgeFactoryImport: {
      contractVersion: "corpus-dataset-delivery-contract.v1",
      contentIdentity: patched.input.windowSha256,
      importable: false,
      blockedReasons: [...new Set(blockedReasons)],
    },
  };
}

export function buildPhase2Dataset(repoRoot: string): {
  records: SourceToCovenantRecordV2[];
  integrityReport: Phase2IntegrityReport;
  artifacts: Record<string, string>;
} {
  // Seed from Phase-1 catalog
  const seed = EXAMPLE_CATALOG.map((spec) => buildRecord(repoRoot, spec));

  // Peer inputs: prefer checked-in copies under datasets/.../peer-inputs, else /tmp/peer-exports
  const peerDirs = [
    resolve(repoRoot, "datasets/source-to-covenant/peer-inputs"),
    "/tmp/peer-exports",
    resolve(repoRoot, "docs/negative-covenant-exception-database/catalogs"),
    resolve(repoRoot, "docs/covenant-basket-capacity-formula-library/export"),
  ].filter((d) => existsSync(d));

  const expansion = expandAuthenticCorpus(repoRoot, seed, peerDirs);
  const combined = [...seed, ...expansion.added];

  // Dedup cluster ids on combined
  const dupReport = detectDuplicates(combined);
  const withClusters = applyNearDuplicateClusterIds(combined, dupReport);
  const decisions = decideDuplicates(withClusters);
  const decisionMap = new Map(decisions.map((d) => [d.exampleId, d]));

  // Provisional v2 to know benchmark set
  const provisional = withClusters.map((r) => promoteToV2(r, decisionMap, new Set()));
  const benchmark = buildEvaluationBenchmark(provisional);
  const benchmarkIds = new Set(benchmark.cases.map((c) => c.exampleId));
  const records = withClusters.map((r) => promoteToV2(r, decisionMap, benchmarkIds));

  // Rebuild benchmark on final records
  const finalBenchmark = buildEvaluationBenchmark(records);
  const kfPackage = buildKnowledgeFactoryImportPackage(records);

  const demoted = records.filter((r) => r.verificationHistory.some((h) => h.fromStatus === "HUMAN_SOURCE_VERIFIED"));
  const independentlyVerified = records.filter((r) => r.deliveryVerificationStatus === "VERIFIED" && r.verificationEvidence.verificationRecordId);
  const lacking = records.filter((r) => r.deliveryVerificationStatus !== "VERIFIED");

  const integrityReport: Phase2IntegrityReport = {
    schemaVersion: DATASET_SCHEMA_VERSION_V2,
    startingSha: STARTING_SHA,
    auditedAt: new Date().toISOString(),
    verificationClaims: {
      previouslyClaimedHumanSourceVerified: demoted.length,
      independentlyVerifiedAfterAudit: independentlyVerified.length,
      lackingIndependentReview: lacking.length,
      demotedExampleIds: demoted.map((r) => r.exampleId),
    },
    controllingContext: {
      sourceWindowPresent: records.filter((r) => r.controllingContextAudit.sourceWindowPresent).length,
      controllingContextComplete: records.filter((r) => r.controllingContextAudit.status === "CONTROLLING_CONTEXT_COMPLETE").length,
      contextIncomplete: records.filter((r) => r.controllingContextAudit.status === "CONTEXT_INCOMPLETE").length,
    },
    duplicates: {
      exactDuplicatePairs: dupReport.exactDuplicatePairs.length,
      decisions,
    },
    eligibility: {
      trainingEligibleCount: records.filter((r) => r.trainingEligibility === "ELIGIBLE_PENDING_RIGHTS_AND_VERIFICATION").length,
      evaluationEligibleCount: records.filter((r) =>
        r.evaluationEligibility === "EVAL_ELIGIBLE_HELD_OUT" ||
        r.evaluationEligibility === "EVAL_ELIGIBLE_BENCHMARK_CASE" ||
        r.evaluationEligibility === "EVAL_ELIGIBLE_DEV_DIAGNOSTIC",
      ).length,
      sftExportBlocked: true,
      sftExportRecordCount: 0,
    },
    expansion: {
      priorRecordCount: seed.length,
      authenticExamplesAdded: expansion.added.length,
      totalRecords: records.length,
      distinctIssuers: expansion.issuerCount,
      issuerTarget: 50,
      issuerTargetMet: expansion.issuerCount >= 50,
      issuerGapReason: expansion.issuerGapReason,
    },
    evaluationBenchmark: {
      caseCount: finalBenchmark.cases.length,
      compilerOrModelExecuted: false,
      performanceMetricsReported: false,
      reason: finalBenchmark.reason,
    },
    importResults: {
      adapter: "corpus-dataset-delivery-contract.v1",
      recordsPrepared: kfPackage.actualRecordCounts.total,
      recordsAcceptedForImport: kfPackage.actualRecordCounts.importable,
      blocked: kfPackage.actualRecordCounts.blocked,
    },
  };

  // SFT: explicitly empty / blocked
  const sftRows = toSftExportRows(records).filter((row) => {
    const rec = records.find((r) => r.exampleId === row.example_id)!;
    return isSftExportAllowed(rec.trainingEligibility, rec.deliveryVerificationStatus);
  });

  const provenance = buildProvenanceManifest(
    records.map((r) => {
      // provenance builder expects v1-shaped records; pass through
      const { deliveryVerificationStatus: _d, verificationEvidence: _v, verificationHistory: _h, controllingContextAudit: _c, trainingEligibility: _t, evaluationEligibility: _e, duplicateDecision: _dup, datasetAuthorExpectation: _a, independentlyReviewedGroundTruth: _i, knowledgeFactoryImport: _k, ...rest } = r;
      return rest;
    }),
    currentToolVersionPins(),
  );
  // Annotate provenance safety for phase 2
  (provenance as unknown as { phase2?: unknown }).phase2 = {
    schemaVersion: DATASET_SCHEMA_VERSION_V2,
    builderVersion: DATASET_BUILDER_VERSION_V2,
    independentlyVerifiedLabels: independentlyVerified.length,
    sftExportBlocked: true,
  };

  const quality = buildQualityReport(
    records.map((r) => {
      const { deliveryVerificationStatus: _d, verificationEvidence: _v, verificationHistory: _h, controllingContextAudit: _c, trainingEligibility: _t, evaluationEligibility: _e, duplicateDecision: _dup, datasetAuthorExpectation: _a, independentlyReviewedGroundTruth: _i, knowledgeFactoryImport: _k, ...rest } = r;
      return rest;
    }),
    provenance,
  );

  const artifacts = {
    integrityReport: JSON.stringify(integrityReport, null, 2) + "\n",
    provenance: JSON.stringify(provenance, null, 2) + "\n",
    quality: JSON.stringify(quality, null, 2) + "\n",
    duplicates: JSON.stringify({ schemaVersion: DATASET_SCHEMA_VERSION_V2, exactDuplicatePairs: dupReport.exactDuplicatePairs, nearDuplicateClusters: dupReport.nearDuplicateClusters, heldOutContamination: dupReport.heldOutContamination, decisions }, null, 2) + "\n",
    benchmark: JSON.stringify(finalBenchmark, null, 2) + "\n",
    kfImport: JSON.stringify(kfPackage, null, 2) + "\n",
    sftJsonl: sftRows.length ? toJsonl(sftRows) : "",
    sftBlockNotice: JSON.stringify(
      {
        status: "SFT_EXPORT_BLOCKED",
        reason:
          "Phase 2 refuses to export unresolved, hypothetical, or unverified legal labels as supervised ground truth. usage-rights review also outstanding. sft-ready.jsonl is intentionally empty.",
        eligibleCount: 0,
        totalRecords: records.length,
      },
      null,
      2,
    ) + "\n",
    versionPins: JSON.stringify({ ...currentToolVersionPins(), datasetSchemaVersion: DATASET_SCHEMA_VERSION_V2, datasetBuilderVersion: DATASET_BUILDER_VERSION_V2 }, null, 2) + "\n",
  };

  return { records, integrityReport, artifacts };
}

export function writePhase2Artifacts(repoRoot: string): Phase2IntegrityReport {
  const { records, integrityReport, artifacts } = buildPhase2Dataset(repoRoot);
  const outRoot = resolve(repoRoot, "datasets/source-to-covenant");

  for (const split of ["train", "dev", "eval-heldout"] as const) {
    mkdirSync(resolve(outRoot, "records", split), { recursive: true });
  }
  mkdirSync(resolve(outRoot, "provenance"), { recursive: true });
  mkdirSync(resolve(outRoot, "exports"), { recursive: true });
  mkdirSync(resolve(outRoot, "reports"), { recursive: true });
  mkdirSync(resolve(outRoot, "benchmark"), { recursive: true });
  mkdirSync(resolve(outRoot, "peer-inputs"), { recursive: true });

  // Refresh peer inputs from /tmp if present (for reproducibility in-repo)
  for (const name of ["exceptions.json", "basket-candidates.jsonl"]) {
    const src = resolve("/tmp/peer-exports", name);
    if (existsSync(src)) copyFileSync(src, resolve(outRoot, "peer-inputs", name));
  }

  for (const r of records) {
    writeFileSync(resolve(outRoot, "records", r.split, `${r.exampleId}.json`), JSON.stringify(r, null, 2) + "\n");
  }

  writeFileSync(resolve(outRoot, "reports", "phase2-integrity-report.json"), artifacts.integrityReport);
  writeFileSync(resolve(outRoot, "provenance", "corpus-manifest.json"), artifacts.provenance);
  writeFileSync(resolve(outRoot, "provenance", "version-pins.json"), artifacts.versionPins);
  writeFileSync(resolve(outRoot, "reports", "quality-report.json"), artifacts.quality);
  writeFileSync(resolve(outRoot, "reports", "duplicate-report.json"), artifacts.duplicates);
  writeFileSync(
    resolve(outRoot, "reports", "split-manifest.json"),
    JSON.stringify(
      {
        train: records.filter((r) => r.split === "train").map((r) => r.exampleId),
        dev: records.filter((r) => r.split === "dev").map((r) => r.exampleId),
        "eval-heldout": records.filter((r) => r.split === "eval-heldout").map((r) => r.exampleId),
        heldOutIssuers: [...new Set(records.filter((r) => r.split === "eval-heldout").map((r) => r.document.issuerId))],
        distinctIssuers: [...new Set(records.map((r) => r.document.issuerId))].sort(),
      },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(resolve(outRoot, "benchmark", "evaluation-benchmark.json"), artifacts.benchmark);
  writeFileSync(resolve(outRoot, "exports", "knowledge-factory-import.json"), artifacts.kfImport);
  writeFileSync(resolve(outRoot, "exports", "sft-ready.jsonl"), artifacts.sftJsonl);
  writeFileSync(resolve(outRoot, "exports", "sft-export-block.json"), artifacts.sftBlockNotice);
  writeFileSync(
    resolve(outRoot, "exports", "importable-records.json"),
    JSON.stringify({ schemaVersion: DATASET_SCHEMA_VERSION_V2, provenance: JSON.parse(artifacts.provenance), records }, null, 2) + "\n",
  );
  writeFileSync(
    resolve(outRoot, "provenance", "usage-rights.json"),
    JSON.stringify(
      {
        status: "REVIEW_REQUIRED_BEFORE_SFT_OR_DISTILLATION",
        sftExportBlocked: true,
        independentlyVerifiedLabelCount: integrityReport.verificationClaims.independentlyVerifiedAfterAudit,
        notes: [
          "Phase 2: no independently reviewed verification_record_id exists for any label.",
          "SFT-ready export is intentionally empty.",
          "Do not fine-tune or download model weights without authorization.",
        ],
      },
      null,
      2,
    ) + "\n",
  );

  return integrityReport;
}

/** Keep buildDataset import used for smoke — avoid unused warning via re-export. */
export { buildDataset };
