/**
 * #324-port: contractual EBITDA derivation kinds — company-agnostic evidence resolver.
 */
import { describe, expect, it } from "vitest";
import {
  resolveContractualEbitdaDerivation,
  type ContractualEbitdaEvidencePackage,
} from "@/lib/financial-certificate-engine/contractual-ebitda-buildup";

function base(overrides: Partial<ContractualEbitdaEvidencePackage> = {}): ContractualEbitdaEvidencePackage {
  return {
    bindingContractualEbitdaMillions: 100,
    asOfDate: "2026-03-31",
    measurementPeriod: "LTM",
    definitionTerm: "Consolidated EBITDA",
    definitionExcerpt: "CNI + Interest + D&A",
    definitionCitation: "CA §1.01",
    bindingApprovalStatus: "TEST",
    methodologyIndependent: true,
    components: [
      {
        label: "CNI",
        amountMillions: 40,
        amountMissing: false,
        sign: "plus",
        documentCitation: "test",
        measurementPeriod: "LTM",
        approvalStatus: "RECONSTRUCTED",
      },
      {
        label: "Interest",
        amountMillions: 25,
        amountMissing: false,
        sign: "plus",
        documentCitation: "test",
        measurementPeriod: "LTM",
        approvalStatus: "RECONSTRUCTED",
      },
      {
        label: "D&A",
        amountMillions: 35,
        amountMissing: false,
        sign: "plus",
        documentCitation: "test",
        measurementPeriod: "LTM",
        approvalStatus: "RECONSTRUCTED",
      },
    ],
    unresolvedAdjustments: [],
    methodologyDisclosure: null,
    ...overrides,
  };
}

describe("resolveContractualEbitdaDerivation", () => {
  it("INDEPENDENTLY_DERIVED when components sum to binding and methodologyIndependent", () => {
    const d = resolveContractualEbitdaDerivation(base());
    expect(d.kind).toBe("INDEPENDENTLY_DERIVED");
    expect(d.componentSumMillions).toBe(100);
    expect(d.bindingContractualEbitdaMillions).toBe(100);
  });

  it("REPORTED_ONLY when methodologyIndependent is false and no components", () => {
    const d = resolveContractualEbitdaDerivation(
      base({ methodologyIndependent: false, components: [] }),
    );
    expect(d.kind).toBe("REPORTED_ONLY");
  });

  it("SUPPORTING_RECONSTRUCTION when reported binding differs from component sum", () => {
    const d = resolveContractualEbitdaDerivation(
      base({
        methodologyIndependent: false,
        bindingContractualEbitdaMillions: 1700,
        components: [
          {
            label: "partial",
            amountMillions: 500,
            amountMissing: false,
            sign: "plus",
            documentCitation: "test",
            measurementPeriod: "LTM",
            approvalStatus: "RECONSTRUCTED",
          },
        ],
      }),
    );
    expect(d.kind).toBe("SUPPORTING_RECONSTRUCTION");
    expect(d.unresolvedAdjustments.some((u) => /differs from supporting/.test(u))).toBe(true);
  });
});
