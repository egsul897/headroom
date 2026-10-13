/**
 * Focused contractual leverage tests — Coherent EBITDA build-up, authority,
 * fail-closed unsupported mechanics, Matthews reuse of the same path.
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
  resolveEbitdaLineApproval,
  COHERENT_CA_DEFINITIONS,
  COHERENT_FINANCIALS,
  COHERENT_FY2026_EBITDA_BUILDUP_SUM,
  COHERENT_FY2026_EBITDA_LINE_ITEMS,
  MATTHEWS_EBITDA_LINE_ITEMS,
  MATTHEWS_EBITDA_LINE_ITEMS_APPROVED,
  MATTHEWS_FINANCIALS,
  MATTHEWS_INDENTURE_DEFINITIONS,
} from "@/lib/product/contractual-leverage";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { fixtureInputResolver, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { rationalFromNumber } from "@/lib/contract-model/runtime/decimal";
import { money } from "@/lib/contract-model/runtime/values";

describe("Coherent Consolidated EBITDA build-up (source-backed line items)", () => {
  it("calculates ~1694.14 from FY2026 10-K lines — not the collapsed 1700 leaf", () => {
    const buildup = calculateEbitdaBuildup({
      companyId: "coherent",
      instrumentKey: "coherent-credit-agreement",
      ebitdaDefinition: COHERENT_CA_DEFINITIONS[0]!,
      lineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS,
      expectedPeriod: "FY2026-2026-06-30",
      evidenceSnapshotStatus: "REVIEW_REQUIRED",
    });
    expect(buildup.status).toBe("COMPUTED");
    expect(buildup.valueMillions).toBeCloseTo(COHERENT_FY2026_EBITDA_BUILDUP_SUM, 2);
    expect(buildup.valueMillions).not.toBe(1700);
    expect(buildup.lineItems.length).toBeGreaterThanOrEqual(8);
    expect(buildup.numericalTrace.some((t) => t.sign === "=")).toBe(true);
    expect(buildup.authority).toBe("SEEDED_SNAPSHOT");
    expect(buildup.approvalResolution.every((a) => a.resolveState === "NOT_APPROVED")).toBe(true);
    expect(buildup.unresolvedComponents.some((u) => /NOT_APPROVED/i.test(u))).toBe(true);
    expect(buildup.definitionIdentity).toContain("Consolidated EBITDA");
  });

  it("feeds build-up EBITDA into Coherent leverage (same panel path)", () => {
    const result = calculateContractualLeverage(coherentTotalNetLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    expect(result.ebitdaBuildup?.status).toBe("COMPUTED");
    expect(result.ebitdaBuildup?.valueMillions).toBeCloseTo(COHERENT_FY2026_EBITDA_BUILDUP_SUM, 2);
    const ebitda = result.ebitdaBuildup!.valueMillions!;
    const expectedRatio = (COHERENT_FINANCIALS.totalDebt! - COHERENT_FINANCIALS.cash!) / ebitda;
    expect(result.currentRatio).toBeCloseTo(expectedRatio, 5);
    expect(result.computationAuthority).toBe("INDICATIVE");
    expect(result.capacityDisclaimer).toBe(CAPACITY_DISCLAIMER);
    expect(result.inputs.find((i) => i.key === "EBITDA")?.authority).toBe("SEEDED_SNAPSHOT");
    // Mathematical headroom — not legal capacity
    expect(result.ratioHeadroom).toBeCloseTo(4.25 - expectedRatio, 5);
    expect(result.limitations.some((l) => /not legally available debt-incurrence capacity/i.test(l))).toBe(true);
  });

  it("Phase 4B resolve refuses APPROVED when evidence is REVIEW_REQUIRED", () => {
    const { anyApproved, approvals } = resolveEbitdaLineApproval({
      companyId: "coherent",
      instrumentKey: "coherent-credit-agreement",
      lineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS,
      snapshotStatus: "REVIEW_REQUIRED",
    });
    expect(anyApproved).toBe(false);
    expect(approvals[0]?.resolveState).toBe("NOT_APPROVED");
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
  });

  it("approved financials alone never reach CONTRACTUAL_EXECUTABLE without contractual eligibility", () => {
    const result = calculateContractualLeverage({
      ...matthewsSecuredNetLeverageRequest(),
      financialAuthority: "APPROVED_PERIOD_MATCHED",
      ebitdaLineItems: MATTHEWS_EBITDA_LINE_ITEMS_APPROVED,
      contractualEligibilityBound: true,
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
    // Financial approval ≠ contractual eligibility: NOT_APPROVED resolve / heuristics block EXECUTABLE.
    expect(result.computationAuthority).toBe("INDICATIVE");
    expect(result.capacityDisclaimer).toMatch(/not legally available debt-incurrence capacity/i);
  });

  it("keeps INDICATIVE when cash-cap mechanics are unsupported even with approved inputs", () => {
    const result = calculateContractualLeverage({
      ...coherentTotalNetLeverageRequest(),
      financialAuthority: "APPROVED_PERIOD_MATCHED",
      ebitdaLineItems: COHERENT_FY2026_EBITDA_LINE_ITEMS.map((i) => ({
        ...i,
        authority: "APPROVED_PERIOD_MATCHED" as const,
      })),
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

describe("Matthews reuses the same EBITDA + leverage implementation", () => {
  it("calculates Indenture Consolidated EBITDA from line items", () => {
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
  });

  it("uses build-up EBITDA in the same leverage panel path", () => {
    const result = calculateContractualLeverage(matthewsSecuredNetLeverageRequest());
    expect(result.status).toBe("COMPUTED");
    expect(result.ebitdaBuildup?.status).toBe("COMPUTED");
    expect(result.ebitdaBuildup?.valueMillions).toBeCloseTo(128.313, 3);
    const expectedRatio =
      (MATTHEWS_FINANCIALS.securedDebt! - MATTHEWS_FINANCIALS.cash!) / 128.313;
    expect(result.currentRatio).toBeCloseTo(expectedRatio, 5);
    expect(result.computationAuthority).toBe("INDICATIVE");
  });
});

describe("contractual leverage — identify + fail closed", () => {
  it("flags capped cash netting as unsupported", () => {
    const text =
      `"Total Net Leverage Ratio" means the ratio of (a) Consolidated Total Debt less the lesser of unrestricted cash and 5% of Consolidated Total Assets, to (b) Consolidated EBITDA.`;
    expect(detectUnsupportedCashCap(text)).toBe(true);
  });

  it("reports missing EBITDA rather than inventing a ratio when build-up absent and leaf null", () => {
    const result = calculateContractualLeverage(
      coherentTotalNetLeverageRequest({ ...COHERENT_FINANCIALS, ebitda: null }),
    );
    // Build-up still supplies EBITDA from line items
    expect(result.status).toBe("COMPUTED");
    expect(result.ebitdaBuildup?.status).toBe("COMPUTED");
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
