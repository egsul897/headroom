/**
 * Aggregate dashboard / report from package audit manifests.
 */

import {
  COVENANT_LEARNING_FACTORY_VERSION,
  type DashboardReport,
  type LearningErrorClass,
  type PackageAuditManifest,
} from "./types";
import { defaultHonestyClaims } from "./promotion-guards";

export function buildDashboardReport(args: {
  manifests: PackageAuditManifest[];
  neonLive: boolean;
}): DashboardReport {
  const manifests = args.manifests;
  const errorCounts = new Map<LearningErrorClass, number>();

  let totalCandidates = 0;
  let supportedStructureUnits = 0;
  let verifiedExecutableUnits = 0;
  let unsupportedUnits = 0;
  let refusedExecutableUnits = 0;
  let sourceFidelityPass = 0;
  let sourceFidelityFail = 0;
  let sourceFidelityUnknown = 0;
  let dangerousOmissions = 0;
  let abstentions = 0;
  let wallMs = 0;

  for (const m of manifests) {
    totalCandidates += m.compileSummary?.totalCandidates ?? 0;
    supportedStructureUnits += m.compileSummary?.supportedStructureUnits ?? 0;
    verifiedExecutableUnits += m.compileSummary?.verifiedExecutableUnits ?? 0;
    unsupportedUnits += m.compileSummary?.unsupportedUnits ?? 0;
    refusedExecutableUnits += m.compileSummary?.refusedExecutableUnits ?? 0;
    dangerousOmissions += m.evaluation?.dangerousOmissionCount ?? 0;
    abstentions += m.evaluation?.abstentionCount ?? 0;
    if (m.evaluation?.sourceFidelityPass === true) sourceFidelityPass += 1;
    else if (m.evaluation?.sourceFidelityPass === false) sourceFidelityFail += 1;
    else sourceFidelityUnknown += 1;
    for (const c of m.costs) {
      if (c.unit === "ms") wallMs += c.amount;
    }
    for (const e of m.errors) {
      errorCounts.set(e.class, (errorCounts.get(e.class) ?? 0) + 1);
    }
  }

  return {
    schemaVersion: "covenant-learning-factory.dashboard.v1",
    generatedAt: new Date().toISOString(),
    factoryVersion: COVENANT_LEARNING_FACTORY_VERSION,
    neonLive: args.neonLive,
    packages: {
      total: manifests.length,
      trainDev: manifests.filter((m) => m.cohort === "TRAIN_DEV").length,
      heldOut: manifests.filter((m) => m.cohort === "HELD_OUT").length,
      processedOk: manifests.filter((m) => m.status === "OK" || m.status === "SKIPPED_DUPLICATE").length,
      failed: manifests.filter((m) => m.status === "FAILED").length,
      unsupported: manifests.filter((m) => m.status === "UNSUPPORTED").length,
      abstained: manifests.filter((m) => m.status === "ABSTAINED").length,
    },
    coverage: {
      totalCandidates,
      supportedStructureUnits,
      verifiedExecutableUnits,
      unsupportedUnits,
      refusedExecutableUnits,
    },
    correctness: {
      sourceFidelityPass,
      sourceFidelityFail,
      sourceFidelityUnknown,
      dangerousOmissions,
      abstentions,
    },
    costs: { estimatedUsd: 0, wallMs },
    errorLedger: [...errorCounts.entries()]
      .map(([className, count]) => ({ class: className, count }))
      .sort((a, b) => b.count - a.count),
    recentPackages: manifests
      .slice()
      .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
      .slice(0, 20)
      .map((m) => ({
        packageKey: m.packageKey,
        cohort: m.cohort,
        status: m.status,
        verifiedExecutableUnits: m.compileSummary?.verifiedExecutableUnits ?? 0,
        unsupportedUnits: m.compileSummary?.unsupportedUnits ?? 0,
        dangerousOmissions: m.evaluation?.dangerousOmissionCount ?? 0,
      })),
    honesty: defaultHonestyClaims(),
  };
}
