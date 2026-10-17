import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { extractFinancials, reportDatesFromSubmissions, type IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

type Row = { start: string; end: string; fy: number; fp: string; form: string; filed: string; accn: string };
const cfOf = (...rows: Row[]) => ({ cik: 1, entityName: "T", facts: { "us-gaap": { NetIncomeLoss: { units: { USD: rows.map((r) => ({ val: 1, ...r })) } } } } });
const fy = (cf: unknown, reportDates: Map<string, string> | null) => extractFinancials(cf as never, "0000000001", { reportDates }).fiscalYear;

describe("XBRL fy only when the period is the filing's DocumentPeriodEndDate", () => {
  // January-FYE retailer: FY2023 ends 2024-02-03. The FY2025 10-K (period 2025-02-01) repeats 2024-02-03 as a comparative.
  const original: Row = { start: "2023-01-29", end: "2024-02-03", fy: 2023, fp: "FY", form: "10-K", filed: "2024-03-20", accn: "orig" };
  const comparative: Row = { start: "2023-01-29", end: "2024-02-03", fy: 2025, fp: "FY", form: "10-K", filed: "2025-03-20", accn: "later" };
  it("January-FYE 10-K: comparative row tagged 2025 is not used (only the comparative is in the data)", () => {
    expect(fy(cfOf(comparative), new Map([["later", "2025-02-01"]]))).toBeNull();
  });
  it("January-FYE 10-K: with the original filing, truth FY2023", () => {
    expect(fy(cfOf(original, comparative), new Map([["orig", "2024-02-03"], ["later", "2025-02-01"]]))).toBe(2023);
  });
  it("10-Q: row 2024-03-31 tagged 2026 from a later filing is not used", () => {
    const q: Row = { start: "2024-01-01", end: "2024-03-31", fy: 2026, fp: "Q1", form: "10-Q", filed: "2026-05-01", accn: "q26" };
    expect(fy(cfOf(q), new Map([["q26", "2026-03-31"]]))).toBeNull();
  });
  it("no report dates: no fy accepted", () => expect(fy(cfOf(original), null)).toBeNull());
  it("submissions index → report dates", () => {
    expect([...reportDatesFromSubmissions({ filings: { recent: { accessionNumber: ["a", "b"], reportDate: ["2024-02-03", ""] } } })]).toEqual([["a", "2024-02-03"]]);
  });
});

const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2024-07-01", periodEnd: "2025-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2025-08-01", derivation: "test" });
const fin: IssuerFinancials = { cik: "1", entityName: "T", missing: [], anchor: "2025-06-30", fiscalYear: 2025, values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M }).map(([c, v]) => row(c, v)) };
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n`;
const cond = (w: string) => (optimizeConsolidatedEbitda("Consolidated EBITDA", `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) other non-recurring costs ${w}.`, fin).addBacks.find((l) => l.label === "(d)") as { conditional?: string }).conditional;
describe("lender objection wording (e8fb)", () => {
  it("'unless the Agent objects within N days'", () => expect(cond("so long as notice is given to the Administrative Agent, unless the Administrative Agent objects within five Business Days")).toBe("LENDER_APPROVAL"));
  it("'not objected to by any Lender'", () => expect(cond("to the extent disclosed to and not objected to by any Lender")).toBe("LENDER_APPROVAL"));
  it("not over-broad: 'unless the Borrower objects'", () => expect(cond("unless the Borrower objects")).toBeUndefined());
});
