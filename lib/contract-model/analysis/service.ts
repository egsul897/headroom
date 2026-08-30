/**
 * Phase 3F.1.6.R Workstream F (BLOCKER-10 remediation) - persistence
 * lifecycle for AnalysisRun, the live orchestrator's own minimal run-
 * tracking state (prisma/schema.prisma's own AnalysisRun model comment;
 * docs/phase-3f1-6-r-blocker-remediation/16-live-analysis-idempotency.json).
 *
 * Mirrors the dedup/lifecycle discipline this codebase already established
 * for ClaimReviewItem (safe-failure/service.ts) and ExtractionRun/
 * ExtractionStage (lib/extraction/run-stage.ts): at most one row per
 * (companyId, packageKey, analysisAlgorithmVersion) ever exists (the
 * Prisma `@@unique`), and a re-trigger for the SAME identity updates that
 * SAME row rather than creating a duplicate.
 */
import { prisma } from "../../prisma";
import { Prisma } from "@prisma/client";
import type { AnalysisRun } from "@prisma/client";

/**
 * A RUNNING row younger than this is treated as an active, in-flight run -
 * a concurrent duplicate trigger for the identical identity is skipped
 * rather than started a second time (task step 5's "duplicate triggers
 * don't duplicate semantic state" applied to two REQUESTS racing for the
 * same run, not just their eventual writes). A RUNNING row OLDER than this
 * is treated as abandoned (the process that owned it crashed/was killed
 * mid-run) and is safely re-entered - safe because every downstream write
 * this run's own body performs is independently idempotent (see this
 * model's own schema comment), so resuming/re-running from the top never
 * duplicates state, it only redoes deterministic/cheap work and re-upserts
 * already-upserted rows.
 */
const STALE_RUNNING_THRESHOLD_MS = 30 * 60 * 1000;

export type StartAnalysisRunOutcome = { kind: "STARTED"; run: AnalysisRun } | { kind: "ALREADY_RUNNING"; run: AnalysisRun };

/**
 * Upserts the one AnalysisRun row for this (companyId, packageKey,
 * analysisAlgorithmVersion) identity into RUNNING state, OR reports that an
 * unexpired RUNNING row for the identical identity already exists (the
 * caller must not start a second concurrent execution in that case).
 */
export async function startOrResumeAnalysisRun(input: { companyId: string; packageKey: string; documentIds: string[]; analysisAlgorithmVersion: string }): Promise<StartAnalysisRunOutcome> {
  const existing = await prisma.analysisRun.findUnique({
    where: { companyId_packageKey_analysisAlgorithmVersion: { companyId: input.companyId, packageKey: input.packageKey, analysisAlgorithmVersion: input.analysisAlgorithmVersion } },
  });

  if (existing && existing.status === "RUNNING" && Date.now() - existing.updatedAt.getTime() < STALE_RUNNING_THRESHOLD_MS) {
    return { kind: "ALREADY_RUNNING", run: existing };
  }

  const run = await prisma.analysisRun.upsert({
    where: { companyId_packageKey_analysisAlgorithmVersion: { companyId: input.companyId, packageKey: input.packageKey, analysisAlgorithmVersion: input.analysisAlgorithmVersion } },
    create: {
      companyId: input.companyId,
      packageKey: input.packageKey,
      documentIds: input.documentIds,
      analysisAlgorithmVersion: input.analysisAlgorithmVersion,
      status: "RUNNING",
      startedAt: new Date(),
      currentStage: "INGESTION",
    },
    update: {
      documentIds: input.documentIds,
      status: "RUNNING",
      startedAt: new Date(),
      currentStage: "INGESTION",
      completedAt: null,
      // Prisma's own documented idiom for explicitly clearing a nullable
      // Json column via `update` (a bare `null` is ambiguous with "leave
      // unset" for a Json field) - a re-entered run must not keep showing a
      // PRIOR attempt's fatalError once it starts running again.
      fatalError: Prisma.JsonNull,
    },
  });
  return { kind: "STARTED", run };
}

export async function setAnalysisRunStage(runId: string, currentStage: string): Promise<void> {
  await prisma.analysisRun.update({ where: { id: runId }, data: { currentStage } });
}

export async function completeAnalysisRun(runId: string, input: { openReviewItemCount: number }): Promise<AnalysisRun> {
  return prisma.analysisRun.update({
    where: { id: runId },
    data: {
      status: input.openReviewItemCount > 0 ? "COMPLETED_WITH_REVIEW" : "COMPLETED",
      completedAt: new Date(),
      currentStage: "COMPLETE",
      reviewItemCount: input.openReviewItemCount,
    },
  });
}

export async function failAnalysisRun(runId: string, fatalError: { stage: string; message: string; errorClass: string }): Promise<AnalysisRun> {
  return prisma.analysisRun.update({
    where: { id: runId },
    data: { status: "FAILED", completedAt: new Date(), fatalError: fatalError as object },
  });
}

export async function getLatestAnalysisRunForCompany(companyId: string): Promise<AnalysisRun | null> {
  return prisma.analysisRun.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" } });
}
