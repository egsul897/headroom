import { describe, expect, it } from "vitest";
import { categorize, isMaintenanceLimit } from "@/lib/contract-model/covenant-computation/baskets";
import { catalogWith, parseDefinitions } from "@/lib/contract-model/covenant-computation/ratios";
import { headroomBound } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { decide } from "@/lib/covenant-learning-factory/xbrl/bind";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const fv = (metric: any, value: string, concept = "C") => ({ metric, concept, periodType: "INSTANT" as const, periodStart: null, periodEnd: "2026-06-30", value, unit: "USD" as const, accession: "0000000000-26-000001", form: "10-Q", filed: "2026-07-30", derivation: `${concept} at 2026-06-30` });
const fin: IssuerFinancials = { cik: "0000000001", entityName: "X", values: [fv("totalDebt", "1000", "LongTermDebt"), fv("cash", "300", "CashAndCashEquivalentsAtCarryingValue")], missing: [], anchor: "2026-06-30" };

describe("round 4: maintenance limits, defined ratios, debt bounds", () => {
  it("a limit on what subsidiaries may hold is a maintenance test, not a basket", () => {
    const t = "The Company will not permit, as of the end of any fiscal quarter, Non-Material Subsidiaries to have an aggregate of over twenty-five percent (25%) of Consolidated Total Assets.";
    expect(isMaintenanceLimit(t)).toBe(true);
    expect(categorize(t)).toBe("MAINTENANCE_LIMIT");
    expect(isMaintenanceLimit("The Borrower will not permit any Subsidiary to have outstanding Indebtedness in excess of 10% of Consolidated Total Assets.")).toBe(false);
  });
  it("a ratio the agreement defines under its own name gets its own catalog entry and operands", () => {
    const text = '"Total Secured Leverage Ratio" means, as of any date, the ratio of (a) Consolidated Secured Debt as of such date to (b) Consolidated EBITDA for the most recent four fiscal quarters.';
    const defs = parseDefinitions({ documentId: "d", role: "CREDIT_AGREEMENT", text });
    expect(defs[0]).toMatchObject({ ratioName: "Total Secured Leverage Ratio", numeratorMetrics: ["Consolidated Secured Debt"], denominatorMetrics: ["Consolidated EBITDA"] });
    expect(catalogWith(defs).some((e) => e.ratioKey === "DEFINED:Total Secured Leverage Ratio")).toBe(true);
  });
  it("a qualified subset ('Indebtedness that is secured by a Lien') is not one plain operand", () => {
    const text = '"Senior Ratio" means the ratio of (a) Net Indebtedness that is secured by a Lien on any asset to (b) Consolidated EBITDA.';
    expect(parseDefinitions({ documentId: "d", role: "CREDIT_AGREEMENT", text })[0]!.numeratorMetrics.length).not.toBe(1);
  });
  it("debt with no carve-out is at least XBRL debt; net of unrestricted cash subtracts total cash; carve-outs stay NEEDS_INPUT", () => {
    const plain = '"Consolidated Total Debt" means all Indebtedness for borrowed money of the Borrower and its Subsidiaries determined on a consolidated basis. "Other" means x.';
    expect(decide("Consolidated Total Debt", plain, fin)).toMatchObject({ status: "LOWER_BOUND", input: { value: "1000" } });
    const net = plain + ' "Consolidated Net Debt" means Consolidated Total Debt minus unrestricted cash of the Borrower and its Subsidiaries. "Z" means y.';
    expect(decide("Consolidated Net Debt", net, fin)).toMatchObject({ status: "LOWER_BOUND", input: { value: "700" } });
    const carve = '"Consolidated Total Debt" means all Indebtedness of the Borrower and its Subsidiaries on a consolidated basis, excluding Indebtedness of Unrestricted Subsidiaries. "Other" means x.';
    expect(decide("Consolidated Total Debt", carve, fin).status).toBe("NEEDS_INPUT");
    const broad = plain + ' "Consolidated Net Debt" means Consolidated Total Debt minus unrestricted cash and Cash Equivalents. "Z" means y.';
    expect(decide("Consolidated Net Debt", broad, fin).status).toBe("NEEDS_INPUT");
  });
  it("headroom labels follow the ratio bound and the test direction", () => {
    expect(headroomBound(undefined, "MAX")).toBe("EXACT");
    expect(headroomBound("AT_LEAST", "MIN")).toBe("AT_LEAST");
    expect(headroomBound("AT_LEAST", "MAX")).toBe("AT_MOST");
    expect(headroomBound("AT_MOST", "MAX")).toBe("AT_LEAST");
  });
});

describe("round 5: debt to capitalization", () => {
  const f2: IssuerFinancials = { ...fin, values: [...fin.values, fv("equity", "3000", "StockholdersEquity")] };
  const text = '"Consolidated Indebtedness" shall mean consolidated Indebtedness for the Borrower and its Subsidiaries. "Consolidated Capitalization" shall mean the sum of (a) Consolidated Indebtedness and (b) the consolidated stockholders\' equity (determined in accordance with GAAP) of the Borrower. "Z" means y.';
  it("capitalization is the debt lower bound plus exact equity and grows with that debt term", () => {
    expect(decide("Consolidated Capitalization", text, f2)).toMatchObject({ status: "LOWER_BOUND", growsWith: "Consolidated Indebtedness", input: { value: "4000" } });
  });
  it("a debt definition that excludes some notes is not a bound", () => {
    const t = '"Total Debt" means the principal amount of Indebtedness of the Borrower and its Subsidiaries on a consolidated basis; provided that there shall be excluded from Total Debt the amount of any Indebtedness incurred under any offering of notes. "Z" means y.';
    expect(decide("Total Debt", t, f2).status).toBe("NEEDS_INPUT");
  });
});
