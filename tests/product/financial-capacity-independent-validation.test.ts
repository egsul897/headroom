/**
 * Independent validation — Coherent $5,129M is unsecured binding only;
 * secured package-wide is $4,041M (mila_secured). Sequential overlays.
 */
import { describe, expect, it } from "vitest";
import {
  COHERENT_INDEPENDENT,
  expectedMilaSecuredRoom,
  expectedTnlRoom,
  runIndependentValidation,
} from "../../lib/product/financial-capacity-workflow";

describe("financial capacity independent validation", () => {
  it("hand-calculates TNL room $5,129M and MILA secured $4,041M", () => {
    expect(expectedTnlRoom(COHERENT_INDEPENDENT.financials)).toBe(5129);
    expect(expectedMilaSecuredRoom(COHERENT_INDEPENDENT.financials)).toBe(4041);
    expect(COHERENT_INDEPENDENT.builderHeadline).toBe(2835);
  });

  it(
    "validates secured≠unsecured, sequential economics, and flags solver false favorable",
    async () => {
      const report = await runIndependentValidation({ startingSha: "test" });

      expect(report.paidInferenceCalls).toBe(0);
      expect(report.promotedToLegalTruth).toBe(0);
      expect(report.fiveOneTwoNineBillion.amountMillions).toBe(5129);
      expect(report.fiveOneTwoNineBillion.isUniversalCapacity).toBe(false);
      expect(report.fiveOneTwoNineBillion.matchesIndependent).toBe(true);

      expect(report.capacityBreakdown.packageWideSecuredCapacity.amount).toBe(4041);
      expect(report.capacityBreakdown.packageWideSecuredCapacity.bindingProvision).toBe(
        "mila_secured",
      );
      expect(report.capacityBreakdown.packageWideUnsecuredCapacity.amount).toBe(5129);
      expect(report.capacityBreakdown.packageWideUnsecuredCapacity.bindingProvision).toBe(
        "ca_leverage_cap",
      );

      expect(report.capacityBreakdown.dashboardSolverDivergence.securedIsFalseFavorable).toBe(
        false,
      );
      expect(report.capacityBreakdown.dashboardSolverDivergence.solverAuthority).toBe(
        "NON_AUTHORITATIVE_DIAGNOSTIC",
      );
      expect(report.capacityBreakdown.dashboardSolverDivergence.packageAuthoritativeSecured).toBe(
        4041,
      );
      expect(report.outcomeSummary.falseFavorable).toBe(0);
      expect(report.borrowingProceedsTreatment.immediatelySpent.ssnlRoom).toBe(3991);
      expect(report.borrowingProceedsTreatment.cashRetained.ssnlRoom).toBe(4041);
      expect(report.borrowingProceedsTreatment.label).toBe(
        "MODELED / EVALUATION_SEED_NOT_NS4_APPROVED",
      );

      expect(report.sequentialTransactions).toHaveLength(5);
      expect(report.sequentialIntegrity.eachUsesPriorPostState).toBe(true);
      expect(report.sequentialIntegrity.ledgerMutated).toBe(false);

      for (const s of report.sequentialTransactions) {
        expect(s.outcome).toBe("CORRECT_EXECUTABLE");
        if (s.sequentialIndex > 1) expect(s.usesPriorPostState).toBe(true);
      }

      // S2 repayment: cash-funded after no-proceeds incur → cash $50M below day-0
      const repay = report.sequentialTransactions.find((s) => s.id === "SEQ-S2-debt-repay-50");
      expect(repay?.independent.cashTreatment).toMatch(/Cash/);
      expect(repay?.independent.post.cash).toBe(COHERENT_INDEPENDENT.financials.cash - 50);
      expect(repay?.independent.expectedPackageSecured).toBe(3991);
      expect(repay?.independent.expectedPackageUnsecured).toBe(5079);

      // Equity builder authority
      expect(report.builderAuthority.includeEquityProceedsParam).toBe(true);
      expect(report.builderAuthority.headline).toBe(2835);
      expect(report.builderAuthority.equityLegalAuthority).toMatch(/§3\.4\(a\)\(C\)/);

      expect(report.financialAuthority.classification).toBe(
        "EVALUATION_SEED_NOT_NS4_APPROVED",
      );
      expect(report.financialAuthority.phase4RequireExecutable).toBe(false);
      expect(report.financialAuthority.ns4ApprovedSnapshots).toBe(0);

      expect(report.matthews.outcome).toBe("CORRECT_REFUSAL");
      expect(report.matthews.provisionCount).toBe(0);

      expect(report.outcomeSummary.incorrect).toBe(0);
      expect(report.outcomeSummary.correctExecutable).toBe(5);
    },
    120_000,
  );
});
