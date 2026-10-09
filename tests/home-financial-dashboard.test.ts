/**
 * Home financial dashboard — end-to-end against real uploaded company data.
 *
 * Verifies app/[companyId]/page.tsx's load path (loadCovenantOverviewInputs →
 * buildCovenantOverview) produces contractual ratios, limits, and headroom from
 * the covenant engine — never hardcoded demo figures.
 */
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { computeLeverageMetrics } from "../lib/covenant-engine";
import { buildCovenantOverview } from "../lib/covenant-overview-builder";
import { getCovenantOverview, loadCovenantOverviewInputs } from "../lib/covenant-overview-service";

const ROOT = path.resolve(__dirname, "..");

describe("company home page wires the covenant dashboard", () => {
  it("page.tsx loads via loadCovenantOverviewInputs + DashboardClient (no demo hardcodes)", () => {
    const page = readFileSync(path.join(ROOT, "app/[companyId]/page.tsx"), "utf8");
    expect(page).toContain("loadCovenantOverviewInputs");
    expect(page).toContain("DashboardClient");
    expect(page).not.toContain("loadCompanyOverview");
    expect(page).not.toMatch(/1\.23x|4\.50x|\$100M|demo.*leverage/i);
  });
});

describe.each(["coherent", "matthews"] as const)("financial dashboard calc — %s", (companyId) => {
  it("uses the latest FinancialState period and covenant-definition arithmetic", async () => {
    const inputs = await loadCovenantOverviewInputs(companyId);
    const overview = buildCovenantOverview(inputs);
    const fin = inputs.covenantData.financials;
    const metrics = computeLeverageMetrics(fin);

    expect(overview.asOfDate).toEqual(inputs.asOfDate);
    expect(fin.ebitda).toBeGreaterThan(0);

    const expectedTnl = (fin.totalDebt - fin.cash) / fin.ebitda;
    expect(metrics.totalNetLeverage).toBeCloseTo(expectedTnl, 6);

    const tnl = overview.headlineMetrics.find((m) => m.key === "totalNetLeverage");
    expect(tnl?.state).toBe("AVAILABLE");
    expect(tnl?.value).toBe(`${metrics.totalNetLeverage.toFixed(2)}x`);

    const ebitda = overview.headlineMetrics.find((m) => m.key === "ebitda");
    expect(ebitda?.state).toBe("AVAILABLE");
    expect(ebitda?.value).toMatch(/^\$[\d,]+M$/);

    const debt = overview.headlineMetrics.find((m) => m.key === "totalDebt");
    expect(debt?.state).toBe("AVAILABLE");
    expect(debt?.value).not.toBeNull();

    const cash = overview.headlineMetrics.find((m) => m.key === "cash");
    expect(cash?.state).toBe("AVAILABLE");
    expect(cash?.value).not.toBeNull();
  });

  it("exposes only applicable covenant families with section provenance", async () => {
    const overview = await getCovenantOverview(companyId);
    expect(overview.covenantFamilies.length).toBeGreaterThan(0);
    for (const fam of overview.covenantFamilies) {
      for (const row of fam.rows) {
        expect(row.sectionRef.length).toBeGreaterThan(0);
        expect(row.documentName.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("financial dashboard calc — coherent contractual limits", () => {
  it("surfaces TNL maintenance limit 4.25x and accurate headroom", async () => {
    const overview = await getCovenantOverview("coherent");
    const finFamily = overview.covenantFamilies.find((f) => f.family === "FINANCIAL_COVENANTS");
    expect(finFamily).toBeDefined();

    const tnlMaint = finFamily!.rows.find(
      (r) => r.kind === "RATIO" && r.name.includes("Total Net Leverage") && r.name.includes("Financial Covenants"),
    );
    expect(tnlMaint).toBeDefined();
    if (!tnlMaint || tnlMaint.kind !== "RATIO") throw new Error("expected TNL ratio row");

    expect(tnlMaint.ratioLimit).toBeCloseTo(4.25, 2);
    expect(tnlMaint.currentRatio).toBeCloseTo(1.23, 2);
    expect(tnlMaint.ratioHeadroom).toBeCloseTo(4.25 - (tnlMaint.currentRatio ?? 0), 2);

    const limitHeadline = overview.headlineMetrics.find((m) => m.key === "total_net_leverage_limit");
    const headroomHeadline = overview.headlineMetrics.find((m) => m.key === "total_net_leverage_headroom");
    expect(limitHeadline?.value).toBe("4.25x");
    expect(headroomHeadline?.value).toBe(`${tnlMaint.ratioHeadroom!.toFixed(2)}x`);

    // Debt capacity is modeled from the credit agreement, not invented.
    expect(overview.securedCapacity.status).toBe("MODELED");
    expect(overview.securedCapacity.remainingCapacity).toBeGreaterThan(0);
    expect(overview.securedCapacity.bindingSections.length).toBeGreaterThan(0);
  });

  it("does not invent FCCR when interest expense is absent", async () => {
    const inputs = await loadCovenantOverviewInputs("coherent");
    const zeroInterest = {
      ...inputs,
      covenantData: {
        ...inputs.covenantData,
        financials: { ...inputs.covenantData.financials, interestExpense: 0 },
      },
    };
    const overview = buildCovenantOverview(zeroInterest);
    const interest = overview.headlineMetrics.find((m) => m.key === "interestExpense");
    expect(interest?.state).toBe("NOT_AVAILABLE");
    expect(interest?.value).toBeNull();
    // Covenant FCCR is omitted when interest is absent — never invent 0.00x.
    const fccr = overview.headlineMetrics.find((m) => m.key === "fixedChargeCoverage");
    expect(fccr).toBeUndefined();
    const coverage = overview.headlineMetrics.find((m) => m.key === "interestCoverage" || m.key === "fixedChargeCoverage");
    if (coverage?.value !== null && coverage?.value !== undefined) {
      expect(coverage.value).not.toBe("0.00x");
    }
  });
});
