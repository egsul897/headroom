/**
 * Separated authentic-source-backed financial validation.
 *
 * Figures are taken from in-repo Matthews International Q1 FY2025 provenance
 * (EDGAR accession 0000063296-25-000006 / Indenture Consolidated EBITDA build-up),
 * matching Agent 2 PR #220 fixture constants. They are NOT synthetic placeholders.
 *
 * This test deliberately does NOT claim company-level remaining capacity:
 * attributed historical utilization is not established here.
 */
import { describe, expect, it } from "vitest";
import {
  computeLeverageMetrics,
  evaluateProvision,
  type CovenantProvisionInput,
  type FinancialSnapshotInput,
} from "@/lib/covenant-engine";
import { computeSharedConstraintCurrentUsage } from "@/lib/solver/shared-usage";

/** AUTHENTIC_SOURCE_BACKED — Matthews Indenture Consolidated EBITDA / 10-Q BS (USD millions). */
const MATTHEWS_AUTHENTIC_FINANCIALS: FinancialSnapshotInput & { _label: string } = {
  _label: "AUTHENTIC_SOURCE_BACKED (Matthews Q1 FY2025 Indenture/10-Q; not synthetic)",
  ebitda: 128.313,
  totalDebt: 809.211,
  securedDebt: 778.882,
  cash: 33.513,
  interestExpense: 54.64,
  cumulativeNetIncome: -3.472,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 8.625,
  totalAssets: 1791.719,
};

describe("authentic financial capacity (gross only; no remaining claim)", () => {
  it("labels authentic inputs and computes greater-of EBITDA grower independently", () => {
    expect(MATTHEWS_AUTHENTIC_FINANCIALS._label.startsWith("AUTHENTIC_SOURCE_BACKED")).toBe(true);
    expect(MATTHEWS_AUTHENTIC_FINANCIALS._label.startsWith("SYNTHETIC")).toBe(false);

    const provision: CovenantProvisionInput = {
      id: "auth-matthews-grower",
      documentId: "auth-doc",
      code: "auth_general_liens_demo",
      basketName: "General Liens (authentic financials demo)",
      sectionRef: "demo",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 50,
      params: { pctEbitda: 0.15 },
    };

    const independentExpected = Math.max(50, 0.15 * 128.313); // 50 vs 19.247 → 50
    const fin = { ...MATTHEWS_AUTHENTIC_FINANCIALS };
    delete (fin as { _label?: string })._label;
    const ev = evaluateProvision(provision, fin, computeLeverageMetrics(fin));

    expect(ev.status).toBe("modeled");
    expect(ev.capacity).toBeCloseTo(independentExpected, 6);
  });

  it("computes secured leverage room against authentic Matthews debt/cash", () => {
    const provision: CovenantProvisionInput = {
      id: "auth-matthews-ratio",
      documentId: "auth-doc",
      code: "auth_ratio_demo",
      basketName: "Ratio debt room (authentic financials demo)",
      sectionRef: "demo",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 6.5,
      params: { debtBasis: "secured" },
    };
    // Independent: 6.5×128.313 − (778.882 − 33.513) = 834.0345 − 745.369 = 88.6655
    const independentExpected = 6.5 * 128.313 - (778.882 - 33.513);
    const fin = { ...MATTHEWS_AUTHENTIC_FINANCIALS };
    delete (fin as { _label?: string })._label;
    const ev = evaluateProvision(provision, fin, computeLeverageMetrics(fin));
    expect(ev.status).toBe("modeled");
    expect(ev.capacity).toBeCloseTo(independentExpected, 4);
  });

  it("refuses to treat missing attribution as verified zero remaining capacity", () => {
    const util = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "auth_general_liens_demo" }],
      basketUsage: [],
    });
    expect(util.status).toBe("ZERO_NO_ATTRIBUTED_USAGE");
    expect(util.authoritative).toBe(false);
    // Gross capacity may be computed; remaining after usage is NOT claimable.
    expect(util.usage).toBe(0);
  });
});
