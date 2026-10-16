import { describe, expect, it } from "vitest";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { priorAsOf } from "@/lib/covenant-learning-factory/xbrl/addback-tracker";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (items: Record<string, number>, end = "2026-06-30"): IssuerFinancials => ({
  cik: "0000000001", entityName: "t", missing: [], anchor: end,
  values: [
    ...Object.entries(items).map(([concept, v]) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: null as unknown as string, periodEnd: end, value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: end, derivation: "test" })),
    { metric: "totalDebt" as const, concept: "LongTermDebt", periodType: "INSTANT" as const, periodStart: null as unknown as string, periodEnd: end, value: String(600 * M), unit: "USD" as const, accession: "x", form: "10-Q", filed: end, derivation: "exact" },
  ],
});
const CORE = { NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M };
const DOC = `
ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) restructuring charges in an aggregate amount not to exceed $5,000,000 for any period; plus (e) non-cash stock-based compensation expense; plus (f) transaction costs incurred in connection with any acquisition.
"Consolidated Total Debt" means the consolidated Indebtedness of the Borrower.
"Consolidated Total Leverage Ratio" means the ratio of Consolidated Total Debt to Consolidated EBITDA.
"Default" means any event of default.

ARTICLE VI FINANCIAL COVENANTS
Section 6.01 Consolidated Total Leverage Ratio. The Borrower will not permit the Consolidated Total Leverage Ratio as of the last day of any fiscal quarter to exceed 4.00 to 1.00.
`;

describe("add-back tracker (per agreement, period over period)", () => {
  const r = runAgreementPipeline({ sourceId: "t", text: DOC,
    financials: fin({ ...CORE, RestructuringCharges: 8 * M, ShareBasedCompensation: 12 * M }),
    priorFinancials: fin({ ...CORE, RestructuringCharges: 2 * M, ShareBasedCompensation: 9 * M }, "2025-06-30") });
  const flags = r.xbrl?.addBackTracker ?? [];
  it("restructuring: filed movement, cap applied, EBITDA and debt-capacity delta", () => {
    const f = flags.find((x) => x.category === "RESTRUCTURING")!;
    expect(f).toMatchObject({ status: "DETECTED", amount: String(8 * M), movement: String(6 * M), ebitdaDelta: String(5 * M), debtCapacityDelta: String(20 * M), confidence: "HIGH" });
    expect(f.clause.label).toBe("(d)");
    expect(f.cap?.amount).toBe(String(5 * M));
    expect(f.sources[0]).toMatchObject({ concept: "RestructuringCharges", prior: String(2 * M) });
  });
  it("stock comp detected with movement", () => {
    expect(flags.find((x) => x.category === "STOCK_COMP")).toMatchObject({ status: "DETECTED", movement: String(3 * M), ebitdaDelta: String(12 * M) });
  });
  it("permitted category with no filed figure → NEEDS_INPUT, available / check with CFO, no amount", () => {
    const f = flags.find((x) => x.clause.label === "(f)")!;
    expect(f).toMatchObject({ status: "NEEDS_INPUT", amount: null, ebitdaDelta: null, confidence: "LOW" });
    expect(f.note).toMatch(/check with CFO/);
  });
  it("core interest / tax / D&A are not tracked as add-backs", () => {
    expect(flags.some((x) => ["INTEREST", "TAXES", "D&A"].includes(x.category))).toBe(false);
  });
  it("prior snapshot date includes the prior-year filing window", () => {
    expect(priorAsOf("2026-06-30")).toBe("2025-09-13");
  });
});
