import { describe, expect, it } from "vitest";
import { reflowContractualLeverageResult } from "@/lib/product/contractual-leverage/client-reflow";
import type { ContractualLeverageResult } from "@/lib/product/contractual-leverage/types";

function baseResult(over: Partial<ContractualLeverageResult> = {}): ContractualLeverageResult {
  return {
    status: "COMPUTED",
    name: "Total Net Leverage",
    sectionRef: "§1.01",
    documentName: "CA",
    debtBasis: "total",
    formulaDisplay: "(Total Debt − Cash) / Consolidated EBITDA",
    citations: ["§1.01"],
    limitations: [],
    inputs: [
      { key: "EBITDA", label: "EBITDA", valueMillions: 100, required: true, status: "RESOLVED" },
      { key: "Total Debt", label: "Total Debt", valueMillions: 400, required: true, status: "RESOLVED" },
      { key: "Cash", label: "Cash", valueMillions: 50, required: true, status: "RESOLVED" },
    ],
    missingRequirements: [],
    currentRatio: 3.5,
    threshold: 4.25,
    ratioHeadroom: 0.75,
    debtHeadroomMillions: 75,
    debtHeadroomIsVerifiedCapacity: false,
    runtimeStatus: "EXECUTABLE",
    derivedEbitdaMillions: null,
    ebitdaBuildupKind: null,
    informationRequest: null,
    ...over,
  };
}

describe("reflowContractualLeverageResult", () => {
  it("recomputes net leverage from edited LTM financials", () => {
    const out = reflowContractualLeverageResult(baseResult(), {
      ebitda: 200,
      totalDebt: 500,
      securedDebt: null,
      cash: 100,
    });
    expect(out.status).toBe("COMPUTED");
    expect(out.currentRatio).toBeCloseTo(2.0, 8);
    expect(out.ratioHeadroom).toBeCloseTo(2.25, 8);
    expect(out.debtHeadroomMillions).toBeCloseTo(450, 8);
    expect(out.debtHeadroomIsVerifiedCapacity).toBe(false);
  });

  it("holds derived EBITDA fixed when build-up was used", () => {
    const out = reflowContractualLeverageResult(
      baseResult({ derivedEbitdaMillions: 150, ebitdaBuildupKind: "COHERENT_CAPPED_ADDBACK" }),
      { ebitda: 999, totalDebt: 450, securedDebt: null, cash: 0 },
    );
    expect(out.derivedEbitdaMillions).toBe(150);
    expect(out.currentRatio).toBeCloseTo(3.0, 8);
  });

  it("refuses non-positive EBITDA without inventing values", () => {
    const out = reflowContractualLeverageResult(baseResult(), {
      ebitda: 0,
      totalDebt: 400,
      securedDebt: null,
      cash: 50,
    });
    expect(out.status).toBe("MISSING_INPUTS");
    expect(out.currentRatio).toBeNull();
    expect(out.missingRequirements.length).toBeGreaterThan(0);
  });
});
