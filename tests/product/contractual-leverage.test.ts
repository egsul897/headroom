/**
 * Focused contractual leverage tests — authority labeling, fail-closed
 * unsupported mechanics, Coherent/Matthews E2E, EBITDA build-up.
 */
import { describe, expect, it } from "vitest";
import {
  CAPACITY_DISCLAIMER,
  calculateContractualLeverage,
  calculateEbitdaBuildup,
  coherentTotalNetLeverageRequest,
  compileLeverageExpressions,
  detectUnsupportedCashCap,
  identifyLeverageComponents,
  matthewsSecuredNetLeverageRequest,
  COHERENT_CA_DEFINITIONS,
  COHERENT_FINANCIALS,
  MATTHEWS_EBITDA_LINE_ITEMS,
  MATTHEWS_EBITDA_LINE_ITEMS_APPROVED,
  MATTHEWS_FINANCIALS,
  MATTHEWS_INDENTURE_DEFINITIONS,
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
    expect(id.hasUnsupportedCashCap).toBe(false);
  });

  it("flags capped cash netting as unsupported (no silent authoritative answer)", () => {
    const text =
      `"Total Net Leverage Ratio" means the ratio of (a) Consolidated Total Debt less the lesser of unrestricted cash and 5% of Consolidated Total Assets, to (b) Consolidated EBITDA.`;
    expect(detectUnsupportedCashCap(text)).toBe(true);
    const id = identifyLeverageComponents({
      definitions: [
        COHERENT_CA_DEFINITIONS[0]!,
        { ...COHERENT_CA_DEFINITIONS[1]!, fullText: text },
      ],
      leverageTermCandidates: ["Total Net Leverage Ratio"],
    });
    expect("error" in id).toBe(false);
    if ("error" in id) return;
    expect(id.hasUnsupportedCashCap).toBe(true);
  });
});

describe("authority — never verify merely because resolver received inputs", () => {
  it("labels seeded/caller inputs INDICATIVE and shows mathematical headroom disclaimer", () => {
    const result = calculateContractualLeverage(coherentTotalNetLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    expect(result.inputAuthority).toBe("SEEDED_SNAPSHOT");
    expect(result.computationAuthority).toBe("INDICATIVE");
    expect(result.capacityDisclaimer).toBe(CAPACITY_DISCLAIMER);
    expect(result.limitations.some((l) => /indicative/i.test(l))).toBe(true);
    expect(result.limitations.some((l) => /not legally available debt-incurrence capacity/i.test(l))).toBe(true);
    expect(result.inputs.every((i) => i.authority !== "APPROVED_PERIOD_MATCHED" || i.key === "EBITDA")).toBe(true);
  });

  it("reaches CONTRACTUAL_EXECUTABLE only with approved period-matched inputs and supported mechanics", () => {
    const result = calculateContractualLeverage({
      ...matthewsSecuredNetLeverageRequest(),
      financialAuthority: "APPROVED_PERIOD_MATCHED",
      ebitdaLineItems: MATTHEWS_EBITDA_LINE_ITEMS_APPROVED,
      // Definition without pro forma language for this gate
      definitions: [
        MATTHEWS_INDENTURE_DEFINITIONS[0]!,
        {
          ...MATTHEWS_INDENTURE_DEFINITIONS[1]!,
          fullText:
            `"Secured Net Leverage Ratio" means, as of any date of determination, the ratio of (a) Consolidated Total Indebtedness that is secured by a Lien as of such date, less unrestricted cash and Cash Equivalents of the Issuer and its Restricted Subsidiaries as of such date, to (b) Consolidated EBITDA for the most recently ended four fiscal quarters.`,
        },
      ],
    });
    expect(result.status).toBe("COMPUTED");
    expect(result.computationAuthority).toBe("CONTRACTUAL_EXECUTABLE");
    // Still never claims legal capacity
    expect(result.capacityDisclaimer).toMatch(/not legally available debt-incurrence capacity/i);
  });

  it("keeps INDICATIVE when cash-cap mechanics are unsupported even with approved inputs", () => {
    const result = calculateContractualLeverage({
      ...coherentTotalNetLeverageRequest(),
      financialAuthority: "APPROVED_PERIOD_MATCHED",
      definitions: [
        COHERENT_CA_DEFINITIONS[0]!,
        {
          ...COHERENT_CA_DEFINITIONS[1]!,
          fullText:
            `"Total Net Leverage Ratio" means the ratio of (a) Consolidated Total Debt as of such date, less the lesser of unrestricted cash and Cash Equivalents and $100 million, to (b) Consolidated EBITDA.`,
        },
      ],
    });
    expect(result.status).toBe("COMPUTED");
    expect(result.computationAuthority).toBe("INDICATIVE");
    expect(result.debtHeadroomMillions).toBeNull();
  });
});

describe("contractual leverage — Coherent end-to-end", () => {
  it("computes Total Net Leverage and mathematical dollar room from seeded financials", () => {
    const result = calculateContractualLeverage(coherentTotalNetLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    const expectedRatio = (COHERENT_FINANCIALS.totalDebt! - COHERENT_FINANCIALS.cash!) / COHERENT_FINANCIALS.ebitda!;
    expect(result.currentRatio).toBeCloseTo(expectedRatio, 6);
    expect(result.threshold).toBe(4.25);
    expect(result.ratioHeadroom).toBeCloseTo(4.25 - expectedRatio, 6);
    const expectedHeadroom = 4.25 * COHERENT_FINANCIALS.ebitda! - (COHERENT_FINANCIALS.totalDebt! - COHERENT_FINANCIALS.cash!);
    expect(result.debtHeadroomMillions).toBeCloseTo(expectedHeadroom, 4);
    expect(result.headroomPresentation).toBe("MATHEMATICAL_RATIO_HEADROOM");
  });
});

describe("EBITDA build-up + Matthews leverage", () => {
  it("calculates Consolidated EBITDA from line items under the Indenture definition", () => {
    const buildup = calculateEbitdaBuildup({
      companyId: "matthews",
      instrumentKey: "matthews-indenture-2027-notes",
      ebitdaDefinition: MATTHEWS_INDENTURE_DEFINITIONS[0]!,
      lineItems: MATTHEWS_EBITDA_LINE_ITEMS,
      expectedPeriod: "TTM-2024-12-31",
    });
    expect(buildup.status).toBe("COMPUTED");
    expect(buildup.valueMillions).toBeCloseTo(128.313, 3);
    expect(buildup.authority).toBe("SEEDED_SNAPSHOT");
    expect(buildup.lineItems.some((l) => l.role === "BASE")).toBe(true);
  });

  it("uses build-up EBITDA in the same leverage panel path for Matthews", () => {
    const result = calculateContractualLeverage(matthewsSecuredNetLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    expect(result.ebitdaBuildup?.status).toBe("COMPUTED");
    expect(result.ebitdaBuildup?.valueMillions).toBeCloseTo(128.313, 3);
    const expectedRatio =
      (MATTHEWS_FINANCIALS.securedDebt! - MATTHEWS_FINANCIALS.cash!) / 128.313;
    expect(result.currentRatio).toBeCloseTo(expectedRatio, 5);
    expect(result.computationAuthority).toBe("INDICATIVE");
    expect(result.debtHeadroomMillions).toBeCloseTo(0, 6);
  });

  it("fails closed when CNI base line item is missing", () => {
    const buildup = calculateEbitdaBuildup({
      companyId: "matthews",
      instrumentKey: "ind",
      ebitdaDefinition: MATTHEWS_INDENTURE_DEFINITIONS[0]!,
      lineItems: MATTHEWS_EBITDA_LINE_ITEMS.filter((i) => i.key !== "cni"),
      expectedPeriod: "TTM-2024-12-31",
    });
    expect(buildup.status).toBe("MISSING_INPUTS");
    expect(buildup.valueMillions).toBeNull();
    expect(buildup.missingRequirements.some((m) => /Net Income/i.test(m))).toBe(true);
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
  });

  it("IR evaluation fails closed when Cash is absent from the resolver", () => {
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
      ],
    });
    const ev = evaluateExpression({ expression: compiled.ratioExpression, inputs: resolver });
    expect(ev.status).toBe("NEEDS_INPUT");
    expect(ev.missingInputKeys).toContain("Cash");
  });
});
