import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { extractFinancials, type IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (concept: string, v: number, end: string) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2024-01-01", periodEnd: end, value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2025-02-19", derivation: "test" });
const fin = (anchor: string, fiscalYear: number | null): IssuerFinancials => ({ cik: "1", entityName: "T", missing: [], anchor, fiscalYear, values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M }).map(([c, v]) => row(c, v, anchor)) });
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n`;
const S = (tail: string, pre = "") => `${pre}${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense${tail}.`;
const ESC = "; plus (d) non-cash compensation expenses arising from the grant of stock-based awards not to exceed $2.0 million during the 2024 Fiscal Year and increasing by $200,000 for each Fiscal Year thereafter";
const capOf = (f: IssuerFinancials, pre = "") => optimizeConsolidatedEbitda("Consolidated EBITDA", S(ESC, pre), f).addBacks.find((l) => l.label === "(d)")!.cap?.amount;
const cfOf = (...rows: Array<{ end: string; fy: number; form: string; filed: string; accn: string; start?: string }>) => ({ cik: 1, entityName: "T", facts: { "us-gaap": { NetIncomeLoss: { units: { USD: rows.map((r) => ({ start: r.start ?? "2024-01-01", val: 1, fp: "FY", ...r })) } } } } });
const fyOf = (cf: unknown) => extractFinancials(cf as never, "0000000001").fiscalYear;

describe("XBRL fiscal year: only the filing whose own current period is the measured period", () => {
  it("a later comparative's fy is ignored even if filed first in the data", () => {
    // accn b's own period ends 2025-12-31; its 2024-12-31 comparative must not supply the fy for a 2024-12-31 anchor.
    const cf = cfOf({ end: "2024-12-31", fy: 2024, form: "10-K", filed: "2025-02-20", accn: "a" }, { end: "2024-12-31", fy: 2025, form: "10-K", filed: "2026-02-20", accn: "b" });
    expect(extractFinancials(cf as never, "0000000001", { asOf: "2025-06-30" }).fiscalYear).toBe(2024);
  });
  it("only a comparative reports the period: no XBRL fy", () => {
    const cf = cfOf({ end: "2024-12-31", fy: 2025, form: "10-K", filed: "2026-02-20", accn: "b", start: "2024-01-01" }, { end: "2025-12-31", fy: 2025, form: "10-K", filed: "2026-02-20", accn: "b", start: "2025-01-01" }, { end: "2024-12-31", fy: 2025, form: "10-K", filed: "2026-02-20", accn: "c", start: "2024-01-01" }, { end: "2025-06-30", fy: 2025, form: "10-K", filed: "2026-02-20", accn: "c", start: "2025-01-01" });
    // anchor is the latest end (2025-12-31) whose own filing is b → 2025
    expect(fyOf(cf)).toBe(2025);
  });
  it("mis-tagged 10-K (period 2022-12-31 tagged fy 2023, 0001236275 shape) → 2022", () => {
    expect(fyOf(cfOf({ end: "2022-12-31", fy: 2023, form: "10-K", filed: "2023-02-20", accn: "a", start: "2022-01-01" }))).toBe(2022);
  });
});

describe("XBRL fy vs agreement Fiscal Year: the lower wins", () => {
  it("XBRL 2026 vs agreement (December 31) 2025 → 2025", () => {
    const pre = `"Fiscal Year" means the fiscal year of the Borrower ending on December 31 of each calendar year.\n`;
    expect(capOf(fin("2025-06-30", 2026), pre)).toBe(String(2.2 * M));
  });
});

describe("lender non-objection wording", () => {
  const cond = (w: string) => (optimizeConsolidatedEbitda("Consolidated EBITDA", S(`; plus (d) other non-recurring costs ${w}`), fin("2025-06-30", 2025)).addBacks.find((l) => l.label === "(d)") as { conditional?: string }).conditional;
  it("'not objected to by the Agent'", () => expect(cond("so long as such costs have been disclosed to and not objected to by the Administrative Agent")).toBe("LENDER_APPROVAL"));
  it("'unless the Agent has objected'", () => expect(cond("unless the Administrative Agent has objected within ten Business Days")).toBe("LENDER_APPROVAL"));
  it("not over-broad: an objection by someone else", () => expect(cond("unless the Borrower has objected thereto")).toBeUndefined());
  it("not over-broad: 'not objected to by the Borrower'", () => expect(cond("to the extent not objected to by the Borrower")).toBeUndefined());
});
