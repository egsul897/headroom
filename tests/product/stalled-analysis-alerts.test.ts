/**
 * Rule 64 — monitoring must surface PENDING analyses stalled
 * beyond an hour.
 *
 * PENDING docs are excluded from ANALYSIS_FAILED (they have
 * not failed — yet), so a doc whose analysis never ran stayed
 * invisible in the monitoring feed forever: "in progress"
 * with no clock. A PENDING doc untouched for over an hour is
 * stalled and now alerts.
 */
import { describe, expect, it } from "vitest";
import { stalledAnalysisAlerts } from "../../lib/product/customer-intelligence/stalled-analysis-alerts";

const NOW = Date.parse("2026-10-16T12:00:00.000Z");
const doc = (over: Record<string, unknown> = {}) => ({
  filename: "Indenture.pdf",
  sourceId: "s1",
  extractionStatus: "PENDING",
  updatedAt: "2026-10-16T10:00:00.000Z",
  ...over,
});

describe("stalledAnalysisAlerts", () => {
  it("alerts on a PENDING doc untouched for over an hour", () => {
    const alerts = stalledAnalysisAlerts([doc()], NOW);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.kind).toBe("STALLED_ANALYSIS");
    expect(alerts[0]?.title).toContain("Indenture.pdf");
  });

  it("stays silent for a freshly PENDING doc", () => {
    expect(stalledAnalysisAlerts([doc({ updatedAt: "2026-10-16T11:30:00.000Z" })], NOW)).toEqual([]);
  });

  it("stays silent for non-PENDING docs even when old", () => {
    expect(
      stalledAnalysisAlerts([doc({ extractionStatus: "COMPLETED", updatedAt: "2026-10-01T00:00:00.000Z" })], NOW),
    ).toEqual([]);
  });

  it("stays silent for an unparseable updatedAt (never invent a stall)", () => {
    expect(stalledAnalysisAlerts([doc({ updatedAt: "not-a-date" })], NOW)).toEqual([]);
  });
});
