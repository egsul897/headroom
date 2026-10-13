/**
 * Focused numerical tests for company-agnostic contractual computation.
 * Coherent (seed-aligned) and Matthews (authentic EDGAR-derived) share one code path.
 */

import { describe, expect, it } from "vitest";
import type { CovenantProvisionInput, FinancialSnapshotInput } from "@/lib/covenant-engine";
import {
  computeContractualCovenantMetrics,
  financialSnapshotForContractualComputation,
} from "@/lib/product/contractual-computation";
import {
  MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP,
} from "@/lib/financial-certificate-engine/fixtures";
import { COHERENT_DATA } from "../../prisma/seed-data";

function provision(
  over: Partial<CovenantProvisionInput> &
    Pick<CovenantProvisionInput, "code" | "formulaType" | "thresholdValue">,
): CovenantProvisionInput {
  return {
    id: over.id ?? `id-${over.code}`,
    documentId: over.documentId ?? "doc-1",
    code: over.code,
    basketName: over.basketName ?? over.code,
    sectionRef: over.sectionRef ?? "§Test",
    formulaType: over.formulaType,
    thresholdValue: over.thresholdValue,
    params: over.params ?? null,
  };
}

describe("contractual computation — fail-closed", () => {
  it("refuses leverage when contractual EBITDA is missing", () => {
    const result = computeContractualCovenantMetrics({
      financials: null,
      provisions: [
        provision({
          code: "tnl",
          formulaType: "LEVERAGE_RATIO_ROOM",
          thresholdValue: 4.25,
          params: { debtBasis: "total" },
        }),
      ],
    });
    expect(result.status).toBe("MISSING_FINANCIALS");
    expect(result.leverage.totalNetLeverage).toBeNull();
    expect(result.ratioTests).toHaveLength(0);
    expect(result.missingInputs).toContain("contractual_ebitda");
  });

  it("does not invent a snapshot when cash is absent", () => {
    const snap = financialSnapshotForContractualComputation({
      ebitda: 100,
      cash: null,
      interestExpense: 10,
      cumulativeNetIncome: 0,
      equityProceedsSinceIssue: 0,
      assumedNewDebtRatePct: 5,
      totalDebt: 200,
      securedDebt: 150,
    });
    expect(snap).toBeNull();
  });
});

describe("contractual computation — Coherent (seed-aligned operative docs)", () => {
  const fin = COHERENT_DATA.financials as FinancialSnapshotInput;
  const provisions = COHERENT_DATA.provisions as CovenantProvisionInput[];

  it("computes contractual EBITDA and net leverage from verified inputs", () => {
    const result = computeContractualCovenantMetrics({ financials: fin, provisions });
    expect(result.status).toBe("OK");
    expect(result.contractualEbitda).toBe(1700);
    // (3258 − 1162) / 1700
    expect(result.leverage.totalNetLeverage).toBeCloseTo(1.2329411765, 6);
    // (2221 − 1162) / 1700
    expect(result.leverage.seniorSecuredNetLeverage).toBeCloseTo(0.6229411765, 6);
    expect(result.leverage.interestCoverage).toBeCloseTo(1700 / 190, 6);
  });

  it("computes CA §6.11 TNL≤4.25x ratio debt capacity", () => {
    const result = computeContractualCovenantMetrics({ financials: fin, provisions });
    const tnlRoom = result.ratioTests.find((r) => r.provisionCode === "ca_leverage_cap");
    expect(tnlRoom).toBeTruthy();
    expect(tnlRoom!.formulaType).toBe("LEVERAGE_RATIO_ROOM");
    expect(tnlRoom!.threshold).toBe(4.25);
    expect(tnlRoom!.currentRatio).toBeCloseTo(1.2329411765, 6);
    // max(0, 4.25×1700 − (3258−1162)) = 7225 − 2096 = 5129
    expect(tnlRoom!.ratioDebtCapacityMillions).toBeCloseTo(5129, 6);
    expect(tnlRoom!.evaluationStatus).toBe("modeled");
    expect(tnlRoom!.headroom).toBeCloseTo(4.25 - 1.2329411765, 6);
  });

  it("computes MILA secured prong SSNL≤3.00x ratio debt capacity", () => {
    const result = computeContractualCovenantMetrics({ financials: fin, provisions });
    const mila = result.ratioTests.find((r) => r.provisionCode === "mila_secured");
    expect(mila).toBeTruthy();
    // max(0, 3.0×1700 − (2221−1162)) = 5100 − 1059 = 4041
    expect(mila!.ratioDebtCapacityMillions).toBeCloseTo(4041, 6);
  });
});

describe("contractual computation — Matthews (authentic EDGAR-derived)", () => {
  const b = MATTHEWS_CONTRACTUAL_EBITDA_BUILDUP;
  const fin: FinancialSnapshotInput = {
    ebitda: b.consolidatedEbitdaMillions,
    cash: b.cashMillions,
    interestExpense: b.interestExpenseMillions,
    cumulativeNetIncome: -3.472,
    equityProceedsSinceIssue: 0,
    assumedNewDebtRatePct: 8.625,
    totalDebt: b.totalDebtMillions,
    securedDebt: b.securedDebtMillions,
  };

  const provisions: CovenantProvisionInput[] = [
    provision({
      code: "ind_ratio_debt_secured",
      basketName: "Permitted Debt — Secured Net Leverage",
      sectionRef: "Permitted Debt cl. (1)(b)(x) — SSNL ≤ 3.50x",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 3.5,
      params: { debtBasis: "secured" },
    }),
    provision({
      code: "ind_ratio_debt_fccr",
      basketName: "Ratio Debt — FCCR",
      sectionRef: "Permitted Debt — FCCR ≥ 2.00x",
      formulaType: "COVERAGE_RATIO_ROOM",
      thresholdValue: 2.0,
    }),
  ];

  it("binds authentic Indenture Consolidated EBITDA, not GAAP", () => {
    const result = computeContractualCovenantMetrics({ financials: fin, provisions });
    expect(result.status).toBe("OK");
    expect(result.contractualEbitda).toBeCloseTo(128.313, 3);
    expect(result.contractualEbitda).not.toBeCloseTo(b.gaapEbitdaMillions, 1);
    // (809.211 − 33.513) / 128.313 ≈ 6.045
    expect(result.leverage.totalNetLeverage).toBeCloseTo(
      (b.totalDebtMillions - b.cashMillions) / b.consolidatedEbitdaMillions,
      6,
    );
    expect(result.leverage.seniorSecuredNetLeverage).toBeCloseTo(
      (b.securedDebtMillions - b.cashMillions) / b.consolidatedEbitdaMillions,
      6,
    );
  });

  it("computes secured ratio debt capacity as $0 when already above 3.50x", () => {
    const result = computeContractualCovenantMetrics({ financials: fin, provisions });
    const securedRoom = result.ratioTests.find((r) => r.provisionCode === "ind_ratio_debt_secured");
    expect(securedRoom).toBeTruthy();
    expect(securedRoom!.currentRatio).toBeGreaterThan(3.5);
    expect(securedRoom!.ratioDebtCapacityMillions).toBe(0);
    expect(securedRoom!.headroom).toBeLessThan(0);
    expect(securedRoom!.evaluationStatus).toBe("modeled");
  });

  it("uses the same computeContractualCovenantMetrics path as Coherent (no company branch)", () => {
    const coherent = computeContractualCovenantMetrics({
      financials: COHERENT_DATA.financials as FinancialSnapshotInput,
      provisions: COHERENT_DATA.provisions as CovenantProvisionInput[],
    });
    const matthews = computeContractualCovenantMetrics({ financials: fin, provisions });
    expect(coherent.status).toBe("OK");
    expect(matthews.status).toBe("OK");
    expect(coherent.contractualEbitda).not.toEqual(matthews.contractualEbitda);
    expect(coherent.ratioTests.some((r) => r.formulaType === "LEVERAGE_RATIO_ROOM")).toBe(true);
    expect(matthews.ratioTests.some((r) => r.formulaType === "LEVERAGE_RATIO_ROOM")).toBe(true);
  });
});
