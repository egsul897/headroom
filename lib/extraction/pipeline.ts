/**
 * Extraction-run setup and full-pipeline orchestration
 * (docs/document-onboarding-pipeline-foundation.md). Thin composition over
 * lib/extraction/run-stage.ts's own per-stage unit of work - this file adds
 * nothing to the partial-failure contract runExtractionStage already
 * guarantees; it just creates the six PENDING ExtractionStage rows a run
 * needs and drives them in the required order.
 */

import type { ExtractionRun, ExtractionStage, ExtractionStageKind } from "@prisma/client";
import { prisma } from "../prisma";
import type { ContractExtractionProvider } from "./provider";
import { runExtractionStage, type RunExtractionStageResult } from "./run-stage";

/**
 * Stage execution order. Later stages depend on earlier ones' persisted
 * output (DEFINITIONS needs STRUCTURE, PERMISSIONS needs DEFINITIONS,
 * RELATIONSHIPS/COVERAGE need PERMISSIONS) - see lib/extraction/run-stage.ts's
 * buildStageRunners for exactly what each stage reads.
 */
export const STAGE_ORDER: ExtractionStageKind[] = ["STRUCTURE", "DEFINITIONS", "PERMISSIONS", "RELATIONSHIPS", "COVERAGE", "FINANCIAL_INPUTS"];

export async function createExtractionRun(params: { companyId: string; documentId: string; provider: string; model: string; promptVersion: string; schemaVersion: string }): Promise<ExtractionRun & { stages: ExtractionStage[] }> {
  return prisma.extractionRun.create({
    data: {
      companyId: params.companyId,
      documentId: params.documentId,
      provider: params.provider,
      model: params.model,
      promptVersion: params.promptVersion,
      schemaVersion: params.schemaVersion,
      stages: { create: STAGE_ORDER.map((stage) => ({ stage })) },
    },
    include: { stages: true },
  });
}

/**
 * Runs every PENDING/FAILED stage of a run, in STAGE_ORDER, stopping at the
 * first stage that ends FAILED - a later stage's input depends on an
 * earlier stage's persisted output, so continuing past a failure would only
 * produce low-value, context-starved results. This does NOT retry a FAILED
 * stage itself (call runExtractionStage directly for that once whatever
 * caused the failure is fixed) - it only advances stages that haven't
 * completed yet, and a stage already COMPLETE (e.g. from a prior partial
 * run of this same function) is skipped without being touched.
 */
export async function runAllPendingStages(extractionRunId: string, provider: ContractExtractionProvider): Promise<RunExtractionStageResult[]> {
  const results: RunExtractionStageResult[] = [];
  for (const stage of STAGE_ORDER) {
    const stageRow = await prisma.extractionStage.findUnique({ where: { extractionRunId_stage: { extractionRunId, stage } } });
    if (stageRow?.status === "COMPLETE") continue;
    const result = await runExtractionStage(extractionRunId, stage, provider);
    results.push(result);
    if (result.status === "FAILED") break;
  }
  return results;
}
