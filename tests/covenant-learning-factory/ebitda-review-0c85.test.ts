import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda, agreementFiscalYear } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { extractFinancials, type IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (concept: string, v: number, end: string) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2024-01-01", periodEnd: end, value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2025-02-19", derivation: "test" });
const fin = (anchor: string, fiscalYear: number | null): IssuerFinancials => ({ cik: "1", entityName: "T", missing: [], anchor, fiscalYear, values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M }).map(([c, v]) => row(c, v, anchor)) });
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n`;
const S = (tail: string, pre = "") => `${pre}${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense${tail}.`;
const ESC = "; plus (d) non-cash compensation expenses arising from the grant of stock-based awards not to exceed $2.0 million during the 2024 Fiscal Year and increasing by $200,000 for each Fiscal Year thereafter";
const capOf = (f: IssuerFinancials, pre = "") => optimizeConsolidatedEbitda("Consolidated EBITDA", S(ESC, pre), f).addBacks.find((l) => l.label === "(d)")!.cap?.amount;

describe("escalating caps use the filer's fiscal year", () => {
  it("XBRL fiscal-year focus FY2025 for a period ending 2025-01-05 → $2.2M (1852633 shape)", () => expect(capOf(fin("2025-01-05", 2025))).toBe(String(2.2 * M)));
  it("XBRL FY2026 → $2.4M", () => expect(capOf(fin("2026-06-30", 2026))).toBe(String(2.4 * M)));
  it("agreement Fiscal Year ends December 31 → calendar year", () => expect(capOf(fin("2026-06-30", null), `"Fiscal Year" means the fiscal year of the Borrower ending on December 31 of each calendar year.\n`)).toBe(String(2.4 * M)));
  it("no source → lowest candidate year", () => expect(capOf(fin("2025-01-05", null))).toBe(String(2 * M)));
  it("52/53-week Fiscal Year definition is not used", () => expect(agreementFiscalYear(`"Fiscal Year" means the 52 or 53 week period ending on the Sunday closest to December 31.`, "2025-01-05")).toBeNull());
});

describe("XBRL fiscal year comes from the first filing reporting the period", () => {
  it("earliest 10-Q's fy wins over a later comparative", () => {
    const f = (fy: number, filed: string, accn: string) => ({ start: "2024-04-29", end: "2025-01-05", val: 1, accn, fy, fp: "Q3", form: "10-Q", filed });
    const cf = { cik: 1, entityName: "T", facts: { "us-gaap": { NetIncomeLoss: { units: { USD: [f(2026, "2026-02-18", "b"), f(2025, "2025-02-19", "a")] } } } } };
    expect(extractFinancials(cf as never, "0000000001").fiscalYear).toBe(2025);
  });
});

describe("lender approval: non-objection", () => {
  it("'to the extent the Lenders have not objected thereto'", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", S("; plus (d) other non-recurring costs to the extent the Lenders have not objected thereto"), fin("2025-06-30", 2025));
    expect((o.addBacks.find((l) => l.label === "(d)") as { conditional?: string }).conditional).toBe("LENDER_APPROVAL");
  });
});
