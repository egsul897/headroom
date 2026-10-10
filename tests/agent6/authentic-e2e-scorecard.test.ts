/**
 * Pins Agent 6 fail-closed invariants from the committed authentic-package
 * scorecard / position reports. Does not require LLM credentials.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const OUT = "docs/agent-6-authentic-company-e2e";
const RUNS = join(OUT, "03-runs");
const SCORECARDS = join(OUT, "04-scorecards");

describe("Agent 6 — authentic E2E scorecard pins", () => {
  it("aggregate scorecard has zero critical false permissions and $0 cost without credentials", () => {
    const agg = JSON.parse(readFileSync(join(SCORECARDS, "aggregate.json"), "utf8")) as {
      totals: {
        criticalFalsePermissions: number;
        incorrectOutcomes: number;
        correctRefusals: number;
        costUsd: number;
        documentsIngested: number;
      };
      credentialGate: string;
    };
    expect(agg.totals.documentsIngested).toBeGreaterThanOrEqual(9);
    expect(agg.totals.criticalFalsePermissions).toBe(0);
    expect(agg.totals.incorrectOutcomes).toBe(0);
    expect(agg.totals.correctRefusals).toBeGreaterThanOrEqual(6);
    expect(agg.totals.costUsd).toBe(0);
    expect(agg.credentialGate).toBe("BLOCKED_BY_MISSING_CREDENTIAL");
  });

  it("every company Position report refuses favorable capacity", () => {
    const companies = readdirSync(RUNS).filter((d) => existsSync(join(RUNS, d, "06-position-report.json")));
    expect(companies.length).toBeGreaterThanOrEqual(3);
    for (const c of companies) {
      const pos = JSON.parse(readFileSync(join(RUNS, c, "06-position-report.json"), "utf8")) as {
        capacityConclusion: string;
        favorableCapacityClaimed: boolean;
        missingEvidence: string[];
        utilization: { policy: string; established: boolean };
      };
      expect(pos.capacityConclusion).toBe("MISSING_EVIDENCE");
      expect(pos.favorableCapacityClaimed).toBe(false);
      expect(pos.utilization.policy).toBe("DO_NOT_INVENT");
      expect(pos.utilization.established).toBe(false);
      expect(pos.missingEvidence).toContain("COMPLETED_OFFICER_COMPLIANCE_CERTIFICATE_WITH_UTILIZATION");
      expect(pos.missingEvidence).toContain("VerifiedExecutionPackage_CERTIFIED");
    }
  });

  it("expectation pins exist for each selected package", () => {
    const pins = JSON.parse(readFileSync(join(OUT, "00-expectation-pins.json"), "utf8")) as {
      expectationPins: Record<string, string>;
    };
    for (const key of ["knife-river-2023-2026", "insulet-2021-2026", "benchmark-2025"]) {
      expect(pins.expectationPins[key]).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
