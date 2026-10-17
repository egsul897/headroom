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

const sbc = (tail: string) => run(tail, fin({ ShareBasedCompensation: 7 * M })).addBacks.find((l) => l.label === "(d)")!.concepts.map((c) => c.concept);

describe("stock comp is judged per sub-clause", () => {
  it("(i) equity-funded + (ii) general equity-based compensation: stock comp maps", () => {
    expect(sbc("; plus (d) (i) any costs or expenses incurred pursuant to any management equity plan or stock option plan, to the extent that such costs or expenses are funded with cash proceeds contributed to the capital of such Person or net cash proceeds of an issuance of Equity Interests of such Person, (ii) any equity based or non-cash compensation charge or expense, including grants of stock options, and (iii) any income (loss) attributable to deferred compensation plans")).toContain("ShareBasedCompensation");
  });
  it("only an equity-funded sub-clause: no stock comp", () => {
    expect(sbc("; plus (d) (i) any costs or expenses incurred pursuant to any stock option plan, to the extent funded with net cash proceeds of an issuance of Equity Interests, and (ii) any income (loss) attributable to deferred compensation plans")).not.toContain("ShareBasedCompensation");
  });
  it("general stock comp with an 'including distribution payments' aside still maps", () => {
    expect(sbc("; plus (d) stock compensation (including any distribution made to a shareholder, including any payments made to compensate option holders as though they were shareholders at the time of such distribution)")).toContain("ShareBasedCompensation");
  });
  it("payments to option holders on a distribution are not stock comp", () => {
    expect(sbc("; plus (d) the amount of any costs or expenses relating to payments made to stock appreciation or similar rights, stock option, restricted stock, phantom equity or other interests or rights holders of Holdings in connection with, or as a result of, any distribution being made to equityholders of such Person, which payments are being made to compensate such holders as though they were equityholders at the time of such distribution")).not.toContain("ShareBasedCompensation");
  });
});

const capOf = (tail: string, anchor: string | null) => run(tail, fin({}, anchor)).addBacks.find((l) => l.label === "(d)")!.cap?.amount;
describe("fiscal-year and reverse-order cap tiers", () => {
  const REV = "; plus (d) other non-recurring expenses in an amount not to exceed (A) $750,000 for any period ending after January 31, 2027, (B) $900,000 for any period ending after June 30, 2026 but on or prior to January 31, 2027 and (C) $1,000,000 for any period ending on or prior to June 30, 2026";
  it("reverse order: early period", () => expect(capOf(REV, "2026-06-30")).toBe(String(1 * M)));
  it("reverse order: middle period", () => expect(capOf(REV, "2026-12-31")).toBe(String(900_000)));
  it("reverse order: late period", () => expect(capOf(REV, "2027-06-30")).toBe(String(750_000)));
  const FY = "; plus (d) other non-recurring expenses not to exceed $2,000,000 for the fiscal year ending December 31, 2026 and $1,500,000 for the fiscal year ending December 31, 2027";
  it("fiscal year ending date: FY2026", () => expect(capOf(FY, "2026-09-30")).toBe(String(2 * M)));
  it("fiscal year ending date: FY2027", () => expect(capOf(FY, "2027-12-31")).toBe(String(1.5 * M)));
  it("fiscal year without a stated end: lowest", () => expect(capOf("; plus (d) other non-recurring expenses not to exceed $2,000,000 for fiscal year 2026 and $1,500,000 for fiscal year 2027", "2026-09-30")).toBe(String(1.5 * M)));
  it("unpairable dated tiers: lowest", () => expect(capOf("; plus (d) other non-recurring expenses not to exceed $2,000,000, or after December 31, 2026, $1,500,000 or $1,250,000 as applicable", "2026-09-30")).toBe(String(1.25 * M)));
});

describe("lender approval wordings", () => {
  const cond = (w: string) => (run(`; plus (d) other non-recurring costs ${w}`, fin({})).addBacks.find((l) => l.label === "(d)") as { conditional?: string }).conditional;
  for (const w of ["approved by the Lenders", "approved by Required Lenders", "approved in advance by Lender in writing", "with the consent of the Required Lenders", "approved in writing by the Agent in its sole discretion", "to the extent mutually acceptable to the Borrower and the Administrative Agent"])
    it(w, () => expect(cond(w)).toBe("LENDER_APPROVAL"));
  it("an alternative route is not a requirement", () => expect(cond("reflected in the Sponsor Model or approved by the Lenders")).toBeUndefined());
});
