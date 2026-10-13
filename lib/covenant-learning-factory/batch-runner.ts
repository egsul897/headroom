/**
 * Idempotent, resumable batch runner with checkpoints, bounded retries,
 * failure queues, cost reporting, and per-package audit manifests.
 */

import { randomBytes } from "node:crypto";
import { processLearningPackage } from "./process-package";
import { listLearningPackages } from "./package-registry";
import { buildDashboardReport } from "./dashboard";
import { LearningFileStore } from "./store/file-store";
import { assertNoHeldOutContamination } from "./cohorts";
import type {
  BatchBudget,
  BatchCheckpoint,
  LearningCohort,
  LearningPackageSpec,
  PackageAuditManifest,
} from "./types";

export const DEFAULT_BATCH_BUDGET: BatchBudget = {
  maxPackages: 8,
  maxWallMs: 15 * 60 * 1000,
  maxEstimatedUsd: 0,
  maxRetriesPerPackage: 1,
};

export interface BatchRunOptions {
  batchId?: string;
  repoRoot?: string;
  store?: LearningFileStore;
  budget?: Partial<BatchBudget>;
  /** Restrict to these package keys (after registry discovery). */
  packageKeys?: string[];
  /** Process only one cohort (default: both, held-out last). */
  cohort?: LearningCohort;
  persistNeon?: boolean;
  authorizePaidInference?: boolean;
  /** Force reprocessing even when hashes unchanged. */
  force?: boolean;
  docsDashboardPath?: string;
}

export interface BatchRunResult {
  checkpoint: BatchCheckpoint;
  manifests: PackageAuditManifest[];
  dashboardPath?: string;
}

function newBatchId(): string {
  return `clb_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomBytes(3).toString("hex")}`;
}

export async function runLearningBatch(options: BatchRunOptions = {}): Promise<BatchRunResult> {
  const repoRoot = options.repoRoot ?? process.cwd();
  const store = options.store ?? new LearningFileStore();
  const budget: BatchBudget = { ...DEFAULT_BATCH_BUDGET, ...options.budget };
  const batchId = options.batchId ?? newBatchId();

  let checkpoint = store.readCheckpoint(batchId);
  const all = listLearningPackages(repoRoot).filter((p) => {
    if (options.packageKeys && !options.packageKeys.includes(p.packageKey)) return false;
    if (options.cohort && p.cohort !== options.cohort) return false;
    return true;
  });

  // Held-out after train/dev so development failures don't starve evaluation.
  all.sort((a, b) => {
    if (a.cohort !== b.cohort) return a.cohort === "TRAIN_DEV" ? -1 : 1;
    return a.packageKey.localeCompare(b.packageKey);
  });

  const trainCiks = all.filter((p) => p.cohort === "TRAIN_DEV").map((p) => p.issuerCik);
  const contamination = assertNoHeldOutContamination(trainCiks);
  if (!contamination.ok) {
    throw new Error(
      `HELD_OUT_CONTAMINATION: train/dev packages include held-out CIKs: ${contamination.contaminated.join(",")}`,
    );
  }

  if (!checkpoint) {
    checkpoint = {
      schemaVersion: "covenant-learning-factory.batch-checkpoint.v1",
      batchId,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      budget,
      spent: { packages: 0, wallMs: 0, estimatedUsd: 0 },
      completedPackageKeys: [],
      failedPackageKeys: [],
      skippedPackageKeys: [],
      pendingPackageKeys: all.map((p) => p.packageKey),
    };
    store.writeCheckpoint(checkpoint);
  }

  const done = new Set([
    ...checkpoint.completedPackageKeys,
    ...checkpoint.failedPackageKeys,
    ...checkpoint.skippedPackageKeys,
  ]);
  const queue: LearningPackageSpec[] = all.filter((p) => !done.has(p.packageKey));
  const manifests: PackageAuditManifest[] = store.listPackageManifests();
  const batchStart = Date.now();

  for (const spec of queue) {
    if (checkpoint.spent.packages >= budget.maxPackages) break;
    if (Date.now() - batchStart >= budget.maxWallMs) break;
    if (checkpoint.spent.estimatedUsd > budget.maxEstimatedUsd) break;

    let attempts = 0;
    let lastManifest: PackageAuditManifest | null = null;
    while (attempts <= budget.maxRetriesPerPackage) {
      attempts += 1;
      const t0 = Date.now();
      const result = await processLearningPackage({
        spec,
        repoRoot,
        store,
        persistNeon: options.persistNeon,
        authorizePaidInference: options.authorizePaidInference,
        skipIfUnchanged: !options.force,
      });
      lastManifest = result.manifest;
      checkpoint.spent.wallMs += Date.now() - t0;
      if (result.manifest.status === "OK" || result.manifest.status === "ABSTAINED") break;
      if (result.manifest.status === "SKIPPED_DUPLICATE") break;
      if (attempts > budget.maxRetriesPerPackage) break;
    }

    if (!lastManifest) continue;
    // Replace prior manifest entry for this package
    const idx = manifests.findIndex((m) => m.packageKey === lastManifest!.packageKey);
    if (idx >= 0) manifests[idx] = lastManifest;
    else manifests.push(lastManifest);

    checkpoint.pendingPackageKeys = checkpoint.pendingPackageKeys.filter(
      (k) => k !== spec.packageKey,
    );
    if (lastManifest.status === "SKIPPED_DUPLICATE") {
      checkpoint.skippedPackageKeys.push(spec.packageKey);
    } else if (lastManifest.status === "FAILED" || lastManifest.status === "UNSUPPORTED") {
      checkpoint.failedPackageKeys.push(spec.packageKey);
    } else {
      checkpoint.completedPackageKeys.push(spec.packageKey);
    }
    checkpoint.spent.packages += 1;
    checkpoint.updatedAt = new Date().toISOString();
    store.writeCheckpoint(checkpoint);
  }

  const dashboard = buildDashboardReport({
    manifests: store.listPackageManifests(),
    neonLive: Boolean(options.persistNeon),
  });
  const docsPath =
    options.docsDashboardPath ??
    pathJoin(repoRoot, "docs/covenant-learning-factory/dashboard.json");
  store.writeDashboard(dashboard, docsPath);

  return { checkpoint, manifests: store.listPackageManifests(), dashboardPath: docsPath };
}

function pathJoin(a: string, b: string): string {
  return `${a.replace(/\/$/, "")}/${b.replace(/^\//, "")}`;
}
