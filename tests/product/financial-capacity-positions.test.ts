/**
 * Multi-company financial capacity positions — Coherent executable + Matthews refusal.
 * Independent expectations from contractual formulas; fail-closed when evidence missing.
 */
import { describe, expect, it } from "vitest";
import {
  COHERENT_INDEPENDENT,
  expectedTnlRoom,
  runFinancialCapacityPositions,
} from "../../lib/product/financial-capacity-workflow";

describe("financial capacity positions — multi-company", () => {
  it("independent TNL room matches hand calculation for Coherent seed financials", () => {
    expect(expectedTnlRoom(COHERENT_INDEPENDENT.financials)).toBe(5129);
    expect(COHERENT_INDEPENDENT.tnlRoom).toBe(5129);
    expect(COHERENT_INDEPENDENT.milaSecuredRoom).toBe(4041);
  });

  it(
    "builds positions for Coherent and Matthews and validates state-change scenarios",
    async () => {
      const report = await runFinancialCapacityPositions({
        startingSha: "test",
        persistNeon: true,
      });

      expect(report.paidInferenceCalls).toBe(0);
      expect(report.promotedToLegalTruth).toBe(0);
      expect(report.metrics.incorrectOutcomes).toBe(0);
      expect(report.metrics.authenticCompaniesProcessed).toBe(2);

      const coherent = report.companies.find((c) => c.companyId === "coherent");
      const matthews = report.companies.find((c) => c.companyId === "matthews");
      expect(coherent?.eligibility.executableCapacity).toBe(true);
      expect(matthews?.eligibility.executableCapacity).toBe(false);
      expect(coherent?.baskets.length).toBeGreaterThanOrEqual(10);
      // Package-wide: secured = Indenture mila_secured $4,041M; unsecured = CA TNL $5,129M
      expect(coherent?.remainingCapacity.secured).toBe(4041);
      expect(coherent?.remainingCapacity.unsecured).toBe(5129);
      expect(coherent?.remainingCapacity.securedMethod).toBe("MODELED_CROSS_DOCUMENT");
      expect(coherent?.contractualMetrics?.ebitda).toBe(1700);

      const kinds = new Set(report.scenarios.map((s) => s.kind));
      expect(kinds.has("DEBT_INCURRENCE")).toBe(true);
      expect(kinds.has("DEBT_REPAYMENT")).toBe(true);
      expect(kinds.has("DIVIDEND")).toBe(true);
      expect(kinds.has("EQUITY_CONTRIBUTION")).toBe(true);
      expect(kinds.has("RESTRICTED_INVESTMENT")).toBe(true);

      expect(report.metrics.independentlyCorrectExecutableCalculations).toBeGreaterThanOrEqual(5);
      expect(report.metrics.correctRefusals).toBeGreaterThanOrEqual(1);
      expect(report.metrics.transactionsWithValidatedStateChanges).toBeGreaterThanOrEqual(4);

      for (const s of report.scenarios) {
        expect(["CORRECT_EXECUTABLE", "CORRECT_REFUSAL"]).toContain(s.assessment);
      }

      expect(report.neonIntelligence.length).toBeGreaterThanOrEqual(1);
      for (const n of report.neonIntelligence) {
        expect(n.verificationStatus).toBe("DISCOVERED_NOT_LEGAL_TRUTH");
        expect(n.promotedToLegalTruth).toBe(0);
      }

      expect(report.customerReportMarkdown).toMatch(/Financial capacity positions/);
      expect(report.conmedRefusalRegressionsPreserved.scenarioIds).toHaveLength(6);
    },
    120_000,
  );
});
