/**
 * Sequential financial effects — debt/cash propagate; next txn uses updated state.
 * Coordinates with Agent 4 TE-D3 (financial-core chain; no stale metric reuse).
 */

import { describe, expect, it } from "vitest";
import {
  buildFinancialStateFromEngineRun,
  runFinancialCertificateEngine,
  runSequentialFinancialEffects,
  netDebtIncreasingBorrowActions,
  cashOutflowActions,
  computeContractualRatios,
  deriveContractualMetrics,
} from "@/lib/financial-certificate-engine";
import {
  COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
  COHERENT_FINANCIAL_STATEMENT_FY2026,
  MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
  MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
} from "@/lib/financial-certificate-engine/fixtures";

describe("sequential financial effects (FCE ↔ financial-core)", () => {
  const asOf = new Date("2026-06-30T12:00:00Z");

  function coherentBase() {
    const run = runFinancialCertificateEngine({
      companyId: "coherent-seq",
      statement: {
        documentId: "coh-stmt",
        text: COHERENT_FINANCIAL_STATEMENT_FY2026,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "coh-cert",
        text: COHERENT_COMPLIANCE_CERTIFICATE_FY2026,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2026-08-20T00:00:00Z"),
    });
    const built = buildFinancialStateFromEngineRun(run, {
      stateId: "coh-seq-state",
      companyId: "coherent-seq",
    });
    expect(built.status).toBe("OK");
    if (built.status !== "OK") throw new Error(built.reason);
    const fixed = deriveContractualMetrics({
      statement: run.statement,
      certificate: run.certificate,
    }).find((m) => m.key === "fixed_charges");
    return {
      state: built.state,
      fixedCharges: fixed?.status === "DERIVED" ? fixed.value! : undefined,
      baseNetDebt: 3258 - 1162,
      baseEbitda: 1700,
    };
  }

  it("refuses non-authoritative base (no silent capacity chain)", () => {
    const { state } = coherentBase();
    const run = runSequentialFinancialEffects({
      baseState: state,
      baseAuthoritative: false,
      steps: [{ label: "borrow", actions: netDebtIncreasingBorrowActions({ amountMillions: 100, secured: true }) }],
      asOfDate: asOf,
    });
    expect(run.steps).toHaveLength(0);
    expect(run.finalRatios.uncertainties).toContain("NON_AUTHORITATIVE_BASE");
    expect(run.reusedStaleMetrics).toBe(false);
  });

  it("propagates debt/cash into pro forma ratios and chains the next transaction", () => {
    const { state, fixedCharges, baseNetDebt, baseEbitda } = coherentBase();
    const borrow = 200;

    const run = runSequentialFinancialEffects({
      baseState: state,
      baseAuthoritative: true,
      fixedChargesMillions: fixedCharges,
      steps: [
        {
          label: "Step1: secured borrow + dividend (net debt up)",
          actions: netDebtIncreasingBorrowActions({ amountMillions: borrow, secured: true }),
        },
        {
          label: "Step2: cash dividend on updated state",
          actions: cashOutflowActions({ amountMillions: 50 }),
        },
      ],
      asOfDate: asOf,
    });

    expect(run.reusedStaleMetrics).toBe(false);
    expect(run.steps).toHaveLength(2);

    const step1 = run.steps[0]!;
    expect(step1.debtDelta).toBeCloseTo(borrow, 6);
    // Issuance + equal dividend → cash flat after step1.
    expect(step1.cashDelta).toBeCloseTo(0, 6);
    expect(step1.ratios.netDebt).toBeCloseTo(baseNetDebt + borrow, 4);
    expect(step1.ratios.totalNetLeverage).toBeCloseTo((baseNetDebt + borrow) / baseEbitda, 4);

    const step2 = run.steps[1]!;
    // Step2 must see step1's elevated debt — not stale base.
    expect(step2.proFormaState.balanceSheetFacts.totalDebtPrincipal.value).toBeCloseTo(3258 + borrow, 4);
    expect(step2.cashDelta).toBeCloseTo(-50, 6);
    expect(step2.ratios.netDebt).toBeCloseTo(baseNetDebt + borrow + 50, 4);
    expect(step2.ratios.totalNetLeverage).toBeCloseTo((baseNetDebt + borrow + 50) / baseEbitda, 4);

    // Stale-metric guard: leverage after step2 ≠ base leverage.
    const baseRatios = computeContractualRatios(state, { fixedChargesMillions: fixedCharges });
    expect(run.finalRatios.totalNetLeverage).not.toBeCloseTo(baseRatios.totalNetLeverage!, 4);
  });

  it("surfaces explicit uncertainty when fixed charges are missing (Matthews FCCR)", () => {
    const runEngine = runFinancialCertificateEngine({
      companyId: "matw-seq",
      statement: {
        documentId: "matw-stmt",
        text: MATTHEWS_FINANCIAL_STATEMENT_Q1_FY2025,
        declaredType: "FINANCIAL_STATEMENT",
      },
      certificate: {
        documentId: "matw-cert",
        text: MATTHEWS_COMPLIANCE_CERTIFICATE_Q1_FY2025,
        declaredType: "COMPLIANCE_CERTIFICATE",
      },
      now: new Date("2025-02-15T00:00:00Z"),
    });
    const built = buildFinancialStateFromEngineRun(runEngine, {
      stateId: "matw-seq",
      companyId: "matw-seq",
    });
    expect(built.status).toBe("OK");
    if (built.status !== "OK") return;

    const withoutFc = runSequentialFinancialEffects({
      baseState: built.state,
      baseAuthoritative: true,
      steps: [{ label: "dividend", actions: cashOutflowActions({ amountMillions: 10 }) }],
      asOfDate: new Date("2024-12-31T12:00:00Z"),
      // omit fixedChargesMillions
    });
    expect(withoutFc.finalRatios.uncertainties).toContain("MISSING_FIXED_CHARGES");
    expect(withoutFc.finalRatios.fixedChargeCoverage).toBeNull();

    const withFc = runSequentialFinancialEffects({
      baseState: built.state,
      baseAuthoritative: true,
      fixedChargesMillions: 54.64,
      steps: [{ label: "dividend", actions: cashOutflowActions({ amountMillions: 10 }) }],
      asOfDate: new Date("2024-12-31T12:00:00Z"),
    });
    expect(withFc.finalRatios.fixedChargeCoverage).toBeCloseTo(128.313 / 54.64, 3);
    expect(withFc.finalRatios.uncertainties).not.toContain("MISSING_FIXED_CHARGES");
  });
});
