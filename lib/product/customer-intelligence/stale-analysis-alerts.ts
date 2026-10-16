/**
 * Pure stale-analysis alerts for the monitoring feed. Kept free
 * of prisma imports so it is unit-testable in isolation.
 */

export interface StaleAnalysisAlert {
  kind: "STALE_ANALYSIS";
  severity: "attention";
  title: string;
  detail: string;
  sourceRefs: string[];
}

/**
 * The stale banner exists on each document page (rule 5), but
 * the monitoring feed — the surface a CFO checks for "what
 * needs attention" — was silent about stale analyses. A summary
 * predating the current analyzer build means the displayed
 * covenant interpretation may be outdated; it must surface in
 * the feed too.
 */
export function staleAnalysisAlerts(
  docs: Array<{ filename: string; sourceId: string; analysisStale: boolean }>,
): StaleAnalysisAlert[] {
  return docs
    .filter((d) => d.analysisStale)
    .map((d) => ({
      kind: "STALE_ANALYSIS" as const,
      severity: "attention" as const,
      title: `Analysis predates current analyzer: ${d.filename}`,
      detail:
        "Re-analyze to apply the current analyzer build; the displayed covenant interpretation may be outdated.",
      sourceRefs: [d.sourceId],
    }));
}
