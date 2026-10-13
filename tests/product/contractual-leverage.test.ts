/**
 * Focused contractual leverage tests — Coherent CA Total Net Leverage and
 * Matthews Indenture Secured Net Leverage, plus fail-closed missing inputs.
 *
 * Pure calculation path (no DB). Demonstrates issuer-agnostic reuse.
 */
import { describe, expect, it } from "vitest";
import {
  calculateContractualLeverage,
  coherentTotalNetLeverageRequest,
  compileLeverageExpressions,
  identifyLeverageComponents,
  matthewsSecuredNetLeverageRequest,
  COHERENT_CA_DEFINITIONS,
  COHERENT_FINANCIALS,
  MATTHEWS_FINANCIALS,
} from "@/lib/product/contractual-leverage";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { fixtureInputResolver, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { rationalFromNumber } from "@/lib/contract-model/runtime/decimal";
import { money } from "@/lib/contract-model/runtime/values";

describe("contractual leverage — identify + compile", () => {
  it("identifies Coherent CA Total Net Leverage components from definition text", () => {
    const id = identifyLeverageComponents({
      definitions: COHERENT_CA_DEFINITIONS,
      leverageTermCandidates: ["Total Net Leverage Ratio"],
      ebitdaTermCandidates: ["Consolidated EBITDA"],
    });
    expect("error" in id).toBe(false);
    if ("error" in id) return;
    expect(id.debtBasis).toBe("total");
    expect(id.netsCash).toBe(true);
    expect(id.ebitdaTerm.termName).toBe("Consolidated EBITDA");
    expect(id.formulaDisplay).toMatch(/Consolidated Total Debt/i);
    expect(id.formulaDisplay).toMatch(/Consolidated EBITDA/i);
  });

  it("identifies Matthews Secured Net Leverage components from definition text", () => {
    const id = identifyLeverageComponents({
      definitions: matthewsSecuredNetLeverageRequest().definitions,
      leverageTermCandidates: ["Secured Net Leverage Ratio"],
    });
    expect("error" in id).toBe(false);
    if ("error" in id) return;
    expect(id.debtBasis).toBe("secured");
    expect(id.netsCash).toBe(true);
  });

  it("compiles a reusable IR ratio expression (no company-specific nodes)", () => {
    const id = identifyLeverageComponents({
      definitions: COHERENT_CA_DEFINITIONS,
      leverageTermCandidates: ["Total Net Leverage Ratio"],
    });
    expect("error" in id).toBe(false);
    if ("error" in id) return;
    const compiled = compileLeverageExpressions({
      components: id,
      companyId: "any-issuer",
      instrumentKey: "any-instrument",
      threshold: 4.25,
    });
    expect(compiled.ratioExpression.kind).toBe("DIVIDE");
    expect(compiled.debtHeadroomExpression?.kind).toBe("MAX");
    expect(compiled.debtMetricKey).toBe("Total Debt");
    expect(compiled.cashMetricKey).toBe("Cash");
  });
});

describe("contractual leverage — Coherent end-to-end", () => {
  it("computes Total Net Leverage and debt headroom from verified seed financials", () => {
    const result = calculateContractualLeverage(coherentTotalNetLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    // (3258 − 1162) / 1700 = 2096 / 1700
    const expectedRatio = (COHERENT_FINANCIALS.totalDebt! - COHERENT_FINANCIALS.cash!) / COHERENT_FINANCIALS.ebitda!;
    expect(result.currentRatio).toBeCloseTo(expectedRatio, 6);
    expect(result.threshold).toBe(4.25);
    expect(result.ratioHeadroom).toBeCloseTo(4.25 - expectedRatio, 6);
    // 4.25 × 1700 − 2096 = 5129
    const expectedHeadroom = 4.25 * COHERENT_FINANCIALS.ebitda! - (COHERENT_FINANCIALS.totalDebt! - COHERENT_FINANCIALS.cash!);
    expect(result.debtHeadroomMillions).toBeCloseTo(expectedHeadroom, 4);
    expect(result.formulaDisplay).toBeTruthy();
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.inputs.every((i) => i.status === "RESOLVED")).toBe(true);
    expect(result.missingRequirements).toEqual([]);
  });
});

describe("contractual leverage — Matthews end-to-end (same implementation)", () => {
  it("computes Secured Net Leverage from authentic Q1 FY2025 financials without issuer-specific code", () => {
    const result = calculateContractualLeverage(matthewsSecuredNetLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    const expectedRatio =
      (MATTHEWS_FINANCIALS.securedDebt! - MATTHEWS_FINANCIALS.cash!) / MATTHEWS_FINANCIALS.ebitda!;
    expect(result.currentRatio).toBeCloseTo(expectedRatio, 6);
    expect(result.threshold).toBe(3.5);
    expect(result.debtBasis).toBe("secured");
    // Over threshold → dollar headroom floors at 0
    const rawRoom = 3.5 * MATTHEWS_FINANCIALS.ebitda! - (MATTHEWS_FINANCIALS.securedDebt! - MATTHEWS_FINANCIALS.cash!);
    expect(rawRoom).toBeLessThan(0);
    expect(result.debtHeadroomMillions).toBeCloseTo(0, 6);
    expect(result.ratioHeadroom).toBeCloseTo(3.5 - expectedRatio, 6);
    expect(result.citations.some((c) => /Secured Net Leverage Ratio/i.test(c))).toBe(true);
  });
});

describe("contractual leverage — fail closed", () => {
  it("reports missing EBITDA rather than inventing a ratio", () => {
    const result = calculateContractualLeverage(
      coherentTotalNetLeverageRequest({ ...COHERENT_FINANCIALS, ebitda: null }),
    );
    expect(result.status).toBe("MISSING_INPUTS");
    expect(result.currentRatio).toBeNull();
    expect(result.debtHeadroomMillions).toBeNull();
    expect(result.missingRequirements.some((m) => /EBITDA/i.test(m))).toBe(true);
  });

  it("reports missing leverage definition rather than guessing a formula", () => {
    const result = calculateContractualLeverage({
      ...coherentTotalNetLeverageRequest(),
      definitions: COHERENT_CA_DEFINITIONS.filter((d) => d.termName === "Consolidated EBITDA"),
    });
    expect(result.status).toBe("MISSING_DEFINITIONS");
    expect(result.currentRatio).toBeNull();
    expect(result.missingRequirements.length).toBeGreaterThan(0);
  });

  it("IR evaluation itself fails closed when Cash is absent from the resolver", () => {
    const id = identifyLeverageComponents({
      definitions: COHERENT_CA_DEFINITIONS,
      leverageTermCandidates: ["Total Net Leverage Ratio"],
    });
    expect("error" in id).toBe(false);
    if ("error" in id) return;
    const compiled = compileLeverageExpressions({
      components: id,
      companyId: "coherent",
      instrumentKey: "ca",
      threshold: 4.25,
    });
    const resolver = fixtureInputResolver({
      metrics: [
        metricInput("EBITDA", money(rationalFromNumber(1700), "USD", { exprId: null, inputKeys: ["EBITDA"] }), {
          source: "t",
          sourceVersion: "1",
        }),
        metricInput("Total Debt", money(rationalFromNumber(3258), "USD", { exprId: null, inputKeys: ["Total Debt"] }), {
          source: "t",
          sourceVersion: "1",
        }),
        // Cash deliberately omitted
      ],
    });
    const ev = evaluateExpression({ expression: compiled.ratioExpression, inputs: resolver });
    expect(ev.status).toBe("NEEDS_INPUT");
    expect(ev.missingInputKeys).toContain("Cash");
  });
});
