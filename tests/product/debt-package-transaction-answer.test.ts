/**
 * Debt-package → transaction-answer milestone — CONMED authentic package.
 * Fail-closed outcomes are success when evidence is insufficient.
 */
import { describe, expect, it } from "vitest";
import {
  CONMED_INDEPENDENT_SCENARIOS,
  runConmedDebtPackageTransactionAnswer,
} from "../../lib/product/debt-package-workflow/conmed-transaction-answer";
import { CONMED_DEMO_DOCUMENTS } from "../../lib/product/conmed-demo/package";

describe("debt package transaction answer — CONMED", () => {
  it("independent scenarios cover the six required transaction types", () => {
    expect(CONMED_INDEPENDENT_SCENARIOS).toHaveLength(6);
    expect(CONMED_INDEPENDENT_SCENARIOS.map((s) => s.id)).toEqual([
      "S1-unsecured-debt",
      "S2-secured-debt",
      "S3-restricted-payment",
      "S4-ratio-gated",
      "S5-amendment",
      "S6-insufficient-evidence",
    ]);
    // Independent expectations must not claim executable capacity without financials
    for (const s of CONMED_INDEPENDENT_SCENARIOS) {
      expect(s.independent.capacityClaimable).not.toBe(true);
      expect(s.independent.expectedStatus).not.toBe("PERMITTED");
    }
  });

  it("package manifest lists four authentic CONMED documents with roles", () => {
    expect(CONMED_DEMO_DOCUMENTS).toHaveLength(4);
    expect(CONMED_DEMO_DOCUMENTS.map((d) => d.role).sort()).toEqual(
      [
        "BASE_CREDIT_AGREEMENT",
        "GUARANTEE_AND_COLLATERAL",
        "IN_PACKAGE_OMNIBUS_AMENDMENT",
        "OUT_OF_PACKAGE_AMENDMENT",
      ].sort(),
    );
  });

  it(
    "runs end-to-end and produces zero INCORRECT assessments with fail-closed capacity",
    async () => {
      const report = await runConmedDebtPackageTransactionAnswer({ startingSha: "test" });
      expect(report.scenarios).toHaveLength(6);
      expect(report.correctnessSummary.INCORRECT).toBe(0);
      expect(report.pipeline.authenticatedVep.present).toBe(true);
      expect(report.pipeline.covenantIntelligence.summaryItems).toBeGreaterThan(0);
      expect(report.pipeline.legalIntelligence.survivingExecutable).toBe(0);
      expect(report.customerReportMarkdown).toMatch(/CONMED Corporation/);
      expect(report.customerReportMarkdown).toMatch(/promotedToLegalTruth/);
      expect(report.promotedToLegalTruth).toBe(0);
      expect(report.paidInferenceCalls).toBe(0);
      // At least the insufficient-evidence scenario must refuse
      const s6 = report.scenarios.find((s) => s.id === "S6-insufficient-evidence");
      expect(s6?.assessment).toBe("CORRECT_REFUSAL");
      expect(["INSUFFICIENT_EVIDENCE", "UNSUPPORTED", "NEEDS_INPUT", "REVIEW_REQUIRED"]).toContain(
        s6?.headroom.status,
      );
    },
    120_000,
  );
});
