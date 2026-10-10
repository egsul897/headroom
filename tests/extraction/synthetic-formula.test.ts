import { describe, expect, it } from "vitest";
import {
  detectGrantType,
  parseDollarAmount,
  recognizePermissionFormula,
} from "../../lib/extraction/synthetic-formula";

describe("parseDollarAmount", () => {
  it("scales million/billion shorthand", () => {
    expect(parseDollarAmount("greater of $50 million")).toBe(50);
    expect(parseDollarAmount("$1.5 billion of Indebtedness")).toBe(1500);
  });

  it("converts full-precision SEC dollars to millions", () => {
    expect(parseDollarAmount("greater of $786,000,000 and 55.0%")).toBe(786);
    expect(parseDollarAmount("$1,428,000,000")).toBe(1428);
    expect(parseDollarAmount("$344,000,000")).toBe(344);
    expect(parseDollarAmount("$70,000,000")).toBe(70);
  });

  it("returns null when no dollar figure is present", () => {
    expect(parseDollarAmount("shall not permit Total Net Leverage Ratio to exceed 4.25 to 1.00")).toBeNull();
  });
});

describe("recognizePermissionFormula", () => {
  it("recognizes greater-of flat / % EBITDA", () => {
    const text =
      "Indebtedness in an aggregate principal amount not to exceed the greater of $786,000,000 and 55.0% of Consolidated EBITDA";
    expect(recognizePermissionFormula(text)).toEqual({
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 786,
      params: { pctEbitda: 0.55 },
      amountKind: "FIXED",
    });
  });

  it("recognizes greater-of with romanette limbs and LTM EBITDA", () => {
    const text =
      "Liens securing Indebtedness in an aggregate amount not to exceed the greater of (i) $344,000,000 and (ii) 100.0% of LTM EBITDA";
    expect(recognizePermissionFormula(text)).toEqual({
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 344,
      params: { pctEbitda: 1.0 },
      amountKind: "FIXED",
    });
  });

  it("recognizes greater-of flat / % total assets", () => {
    const text =
      "Indebtedness not to exceed the greater of $70,000,000 and 5.5% of total consolidated assets";
    expect(recognizePermissionFormula(text)).toEqual({
      formulaType: "GREATER_OF_FLAT_OR_PCT_TOTAL_ASSETS",
      thresholdValue: 70,
      params: { pctTotalAssets: 0.055 },
      amountKind: "FIXED",
    });
  });

  it("keeps FLAT_AMOUNT when only a flat figure is present", () => {
    expect(recognizePermissionFormula("The Borrower may incur Indebtedness of up to $50 million.")).toEqual({
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 50,
      amountKind: "FIXED",
    });
  });
});

describe("detectGrantType", () => {
  it("prefers LIEN when plural Liens and Indebtedness both appear", () => {
    expect(
      detectGrantType(
        "Liens securing Indebtedness permitted by Section 6.01(k) in an aggregate amount not to exceed the greater of $786,000,000 and 55.0% of Consolidated EBITDA",
      ),
    ).toBe("LIEN");
  });

  it("detects singular Lien and Indebtedness-only debt", () => {
    expect(detectGrantType("Lien on Collateral securing the Obligations")).toBe("LIEN");
    expect(detectGrantType("The Borrower may incur Indebtedness under this Section.")).toBe(
      "DEBT_INCURRENCE",
    );
  });
});
