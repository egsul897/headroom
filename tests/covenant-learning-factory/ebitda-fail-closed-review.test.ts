import { describe, expect, it } from "vitest";
import { decide } from "@/lib/covenant-learning-factory/xbrl/bind";
import { namesGainOrIncome } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (metric: "item" | "interestExpense", concept: string, v: number) => ({ metric, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin = (extra: Record<string, number> = {}): IssuerFinancials => ({
  cik: "0000000001", entityName: "Test Borrower", missing: [], anchor: "2026-06-30",
  values: [...Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, ...extra }).map(([c, v]) => row("item", c, v)), row("interestExpense", "InterestExpense", 30 * M)],
});
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n`;
const S = (line: string) => `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) ${line}.`;

describe("reviewer FAIL at 16dc459d: fail closed", () => {
  it("losses-only extinguishment line is a floor, never EXACT", () => {
    const d = decide("Consolidated EBITDA", S("losses on extinguishment of debt"), fin({ GainsLossesOnExtinguishmentOfDebt: -7 * M }));
    expect(d.status).not.toBe("BOUND");
  });
  it("losses-only FX line is never EXACT", () => {
    expect(decide("Consolidated EBITDA", S("losses from foreign currency transactions"), fin({ ForeignCurrencyTransactionGainLossBeforeTax: -3 * M })).status).not.toBe("BOUND");
  });
  for (const line of ["charges and income relating to tax receivable agreements", "taxes paid, net of any income therefrom", "withholding taxes and other income items"]) {
    it(`decide honours the optimizer open-line block: ${line}`, () => {
      expect(decide("Consolidated EBITDA", S(line), fin()).status).toBe("NEEDS_INPUT");
    });
  }
  const NET = `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) Consolidated Interest Expense; plus (c) depreciation and amortization expense. "Consolidated Interest Expense" means interest expense, net of interest income, of the Borrower and its Subsidiaries.`;
  it("net-of-interest-income definition with only gross interest filed → NEEDS_INPUT", () => {
    expect(decide("Consolidated EBITDA", NET, fin()).status).toBe("NEEDS_INPUT");
  });
  it("net-of-interest-income definition with gross and interest income filed → exact net", () => {
    const d = decide("Consolidated EBITDA", NET, fin({ InvestmentIncomeInterest: 5 * M }));
    expect(d.status).toBe("BOUND");
    expect(d.input?.value).toBe(String(195 * M));
  });
  it("one-sided add-backs mentioning gains/income only as a condition are not income-like", () => {
    expect(namesGainOrIncome("cash receipts (or any netting arrangements resulting in reduced cash expenditures) not included in the calculation of Consolidated Net Income in any period to the extent non-cash gains relating to such income were deducted in the calculation of Consolidated EBITDA pursuant to clause (2) below for any previous period and not added back")).toBe(false);
    // Same-instrument netting without interest income stays one-sided.
    expect(namesGainOrIncome("any losses on Hedging Obligations or other derivative instruments, net of gains on such Hedging Obligations")).toBe(false);
  });
  it("lines that actually net income stay income-like", () => {
    expect(namesGainOrIncome("any other non-cash charges less other non-cash items of income increasing Consolidated Net Income")).toBe(true);
    expect(namesGainOrIncome("taxes paid, net of any income therefrom")).toBe(true);
    expect(namesGainOrIncome("income from tax equity investments")).toBe(true);
  });
  it("same-instrument netting stops at interest income (stays two-sided)", () => {
    expect(namesGainOrIncome("any losses on Hedging Obligations, net of interest income and gains on such Hedging Obligations")).toBe(true);
  });
  const IDEF = (tail: string) => `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) Consolidated Interest Expense; plus (c) depreciation and amortization expense. "Consolidated Interest Expense" means total interest expense (other than amortization of deferred financing fees) of the Borrower and its Subsidiaries${tail}.`;
  it("interest definition: gains outside the interest measure do not make the line two-sided", () => {
    expect(decide("Consolidated EBITDA", IDEF("; provided that gains on asset sales shall not be included in Consolidated Net Income for this purpose"), fin()).status).toBe("LOWER_BOUND");
  });
  it("interest definition: gains netted in the interest measure keep it two-sided", () => {
    expect(decide("Consolidated EBITDA", IDEF(", net of interest income and gains on interest rate hedges"), fin()).status).toBe("NEEDS_INPUT");
  });
  it("pure income-tax list maps exactly; franchise taxes (not in income tax expense) stay a floor", () => {
    const T = (a: string) => `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, to the extent deducted in calculating Consolidated Net Income: (a) ${a}; plus (b) interest expense; plus (c) depreciation and amortization expense.`;
    const d = decide("Consolidated EBITDA", T("federal, state, local and foreign income taxes"), fin());
    expect(d.status).toBe("BOUND"); expect(d.input?.value).toBe(String(200 * M));
    expect(decide("Consolidated EBITDA", T("foreign income and franchise taxes"), fin()).status).toBe("LOWER_BOUND");
  });
});
