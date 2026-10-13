/**
 * Resumable learning-factory batch runner.
 *
 *   npx tsx scripts/covenant-learning-factory/batch-run.ts --max=3
 *   npx tsx scripts/covenant-learning-factory/batch-run.ts --packages=mhk-2026-credit-agreement,mtn-2026-tenth-ar-credit-agreement
 *   npx tsx scripts/covenant-learning-factory/batch-run.ts --force --persist-neon
 *   npx tsx scripts/covenant-learning-factory/batch-run.ts --re-persist --persist-neon --packages=chwy-2026-credit-agreement
 */
import { runLearningBatch } from "../../lib/covenant-learning-factory";

function argValue(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : undefined;
}

async function main() {
  const max = Number(argValue("--max") ?? "4");
  const packages = argValue("--packages")?.split(",").filter(Boolean);
  const cohort = argValue("--cohort") as "TRAIN_DEV" | "HELD_OUT" | undefined;
  const persistNeon = process.argv.includes("--persist-neon");
  const force = process.argv.includes("--force");
  const rePersistFlag = process.argv.includes("--re-persist");
  // --force --persist-neon (or --re-persist --persist-neon): write local manifests to Neon
  // without recompile. --force alone still forces a full recompile.
  const rePersist = rePersistFlag || (force && persistNeon);
  const authorizePaid = process.argv.includes("--authorize-paid");

  const result = await runLearningBatch({
    packageKeys: packages,
    cohort,
    persistNeon,
    force: force && !rePersist,
    rePersistNeon: rePersist,
    authorizePaidInference: authorizePaid,
    budget: {
      maxPackages: Number.isFinite(max) ? max : 4,
      maxWallMs: Number(argValue("--max-wall-ms") ?? String(20 * 60 * 1000)),
      maxEstimatedUsd: Number(argValue("--max-usd") ?? "0"),
      maxRetriesPerPackage: Number(argValue("--retries") ?? "1"),
    },
  });

  console.log(
    JSON.stringify(
      {
        batchId: result.checkpoint.batchId,
        spent: result.checkpoint.spent,
        completed: result.checkpoint.completedPackageKeys,
        failed: result.checkpoint.failedPackageKeys,
        skipped: result.checkpoint.skippedPackageKeys,
        pending: result.checkpoint.pendingPackageKeys,
        dashboardPath: result.dashboardPath,
        packageStatuses: result.manifests.map((m) => ({
          packageKey: m.packageKey,
          cohort: m.cohort,
          status: m.status,
          verifiedExecutableUnits: m.compileSummary?.verifiedExecutableUnits ?? 0,
          unsupportedUnits: m.compileSummary?.unsupportedUnits ?? 0,
          dangerousOmissions: m.evaluation?.dangerousOmissionCount ?? 0,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
