import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { trackAddBacks } from "@/lib/covenant-learning-factory/xbrl/addback-tracker";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (concept: string, v: number, end: string) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: end, value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin = (extra: Record<string, number>, anchor: string | null = "2026-06-30"): IssuerFinancials => ({ cik: "1", entityName: "T", missing: [], anchor: anchor as string, values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, ...extra }).map(([c, v]) => row(c, v, anchor ?? "2026-06-30")) });
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n`;
const S = (tail: string) => `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense${tail}.`;
const run = (tail: string, f: IssuerFinancials) => optimizeConsolidatedEbitda("Consolidated EBITDA", S(tail), f);

const capOf = (tail: string, anchor: string | null) => run(tail, fin({}, anchor)).addBacks.find((l) => l.label === "(d)")!.cap?.amount;
const ESC = "; plus (d) non-cash compensation expenses arising from the grant of stock-based awards not to exceed $2.0 million during the 2024 Fiscal Year and increasing by $200,000 for each Fiscal Year thereafter";
describe("escalating caps", () => {
  it("base year", () => expect(capOf(ESC, "2024-12-31")).toBe(String(2 * M)));
  it("no fiscal-year source: lowest candidate year (2026-06-30 → FY2025)", () => expect(capOf(ESC, "2026-06-30")).toBe(String(2.2 * M)));
  it("no fiscal-year source, period ending 2025-01-05: lowest candidate year (FY2024) → base", () => expect(capOf(ESC, "2025-01-05")).toBe(String(2 * M)));
  it("before the base year: base amount", () => expect(capOf(ESC, "2023-12-31")).toBe(String(2 * M)));
  it("unknown period end: base amount", () => expect(capOf(ESC, null)).toBe(String(2 * M)));
});

describe("lender approval wordings (b813)", () => {
  const cond = (w: string) => (run(`; plus (d) other non-recurring costs ${w}`, fin({})).addBacks.find((l) => l.label === "(d)") as { conditional?: string }).conditional;
  it("approved by the Lenders after a verification clause", () => expect(cond("to the extent verified by the Borrower's independent accountants and approved by the Lenders")).toBe("LENDER_APPROVAL"));
  it("to the extent the Agent has consented thereto", () => expect(cond("to the extent the Agent has consented thereto")).toBe("LENDER_APPROVAL"));
  it("accounting firm acceptable to the Agent is still not an approval", () => expect(cond("reflected in a report of any other accounting firm reasonably acceptable to the Administrative Agent")).toBeUndefined());
});

describe("a clause the segmenter skipped is split out", () => {
  it("'(i) … , (ii) Interest Expense … (iii)': (ii) becomes its own line", () => {
    const text = `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (i) Taxes based on income paid and any provision for such Taxes, and the amount of any distributions made pursuant to Section 6.06(b)(iii) or Section 6.06(b)(v) , (ii) Interest Expense of the Borrower for such period, plus (iii) depreciation and amortization expense, plus (iv) restructuring charges.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin({}));
    expect(o.addBacks.map((l) => l.label)).toEqual(["(i)", "(ii)", "(iii)", "(iv)"]);
    expect(o.addBacks[0]!.text).not.toMatch(/Interest Expense/);
  });
  it("a cross-reference '(ii)' is not split", () => {
    const text = `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication: (i) Taxes based on income paid, including distributions pursuant to Section 6.06(b)(ii) Taxes, plus (iii) depreciation and amortization expense, plus (iv) restructuring charges.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin({}));
    expect(o.addBacks.map((l) => l.label)).not.toContain("(ii)");
  });
});
