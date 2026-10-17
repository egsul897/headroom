/**
 * Rule 46 — the monitoring feed must surface stale analyses.
 *
 * The stale banner exists on each document page (rule 5), but
 * the monitoring feed — the surface a CFO checks for "what
 * needs attention" — was silent about stale analyses. A summary
 * predating the current analyzer build means the displayed
 * covenant interpretation may be outdated; it must surface here
 * too, alongside ANALYSIS_FAILED / AMENDMENT_UNRESOLVED.
 */
import { describe, expect, it } from "vitest";
import { staleAnalysisAlerts } from "../../lib/product/customer-intelligence/stale-analysis-alerts";

describe("staleAnalysisAlerts", () => {
  it("emits one attention alert per stale doc", () => {
    const alerts = staleAnalysisAlerts([
      { filename: "Indenture.pdf", sourceId: "s1", analysisStale: true },
      { filename: "Credit Agreement.pdf", sourceId: "s2", analysisStale: false },
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("STALE_ANALYSIS");
    expect(alerts[0]?.severity).toBe("attention");
    expect(alerts[0]?.title).toContain("Indenture.pdf");
    expect(alerts[0]?.sourceRefs).toEqual(["s1"]);
  });

  it("emits nothing when no doc is stale", () => {
    expect(
      staleAnalysisAlerts([{ filename: "A.pdf", sourceId: "s1", analysisStale: false }]),
    ).toEqual([]);
  });
});
