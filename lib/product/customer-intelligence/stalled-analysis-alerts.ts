/**
 * Pure stalled-analysis alerts for the monitoring feed. Kept
 * free of prisma imports so it is unit-testable in isolation.
 */

export interface StalledAnalysisAlert {
  kind: "STALLED_ANALYSIS";
  severity: "attention";
  title: string;
  detail: string;
  sourceRefs: string[];
}

/** A PENDING analysis older than this is stalled, not "in progress". */
export const STALLED_ANALYSIS_AFTER_MS = 3_600_000; // 1 hour

/**
 * PENDING docs are excluded from ANALYSIS_FAILED (they have
 * not failed — yet), so a doc whose analysis never ran stayed
 * invisible in the monitoring feed forever: "in progress"
 * with no clock. A PENDING doc whose row has not been
 * touched in over an hour is stalled and must surface.
 */
export function stalledAnalysisAlerts(
  docs: Array<{ filename: string; sourceId: string; extractionStatus: string; updatedAt: string }>,
  nowMs: number = Date.now(),
): StalledAnalysisAlert[] {
  return docs
    .filter((d) => d.extractionStatus === "PENDING")
    .filter((d) => {
      const updated = Date.parse(d.updatedAt);
      return Number.isFinite(updated) && nowMs - updated > STALLED_ANALYSIS_AFTER_MS;
    })
    .map((d) => ({
      kind: "STALLED_ANALYSIS" as const,
      severity: "attention" as const,
      title: `Analysis stalled: ${d.filename}`,
      detail:
        "Analysis has been pending for over an hour with no progress. Re-upload or re-analyze; the document is not contributing covenant intelligence.",
      sourceRefs: [d.sourceId],
    }));
}
