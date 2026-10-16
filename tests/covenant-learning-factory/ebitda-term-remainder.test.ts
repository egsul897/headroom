import { describe, expect, it } from "vitest";
import { findEbitdaMeasureTerm } from "@/lib/covenant-learning-factory/xbrl/definition-items";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (): IssuerFinancials => ({
  cik: "0000000001", entityName: "t", missing: [], anchor: "2026-06-30",
  values: Object.entries({
    NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M,
    DepreciationDepletionAndAmortization: 50 * M,
  }).map(([concept, v]) => ({
    metric: "item", concept, periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30",
    value: String(v), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test",
  })),
});

describe("EBITDA term recognition: remainder-corpus safe expansions", () => {
  it("indenture Non-Cash Charges stand in for D&A in the schedule gate", () => {
    // Verbatim pattern from common indenture drafting: taxes + interest + Consolidated Non-Cash Charges.
    const text =
      `"Consolidated Net Income" means the net income of the Issuer. ` +
      `"Consolidated EBITDA" means, with respect to any Person for any period, the Consolidated Net Income of such Person for such period plus, without duplication, to the extent deducted in calculating Consolidated Net Income: (1) Consolidated Taxes; plus (2) Consolidated Interest Expense; plus (3) Consolidated Non-Cash Charges; plus (4) business optimization expenses. ` +
      `"Default" means any event.`;
    expect(findEbitdaMeasureTerm(text)).toBe("Consolidated EBITDA");
  });

  it("'adding thereto' / 'adjusted by' count as add-back markers (not Pro Forma wrappers)", () => {
    const text =
      `"Consolidated Net Income" means the net income of the Borrower. ` +
      `"Consolidated EBITDA" means, with respect to any Person for any period, the Consolidated Net Income of such Person for such period: (1) adding thereto, only to the extent deducted in determining such Consolidated Net Income: (a) total interest expense; (b) Consolidated Depreciation and Amortization Expense; (c) taxes based on income; in each case on a Pro Forma Basis. ` +
      `"Default" means any event.`;
    expect(findEbitdaMeasureTerm(text)).toBe("Consolidated EBITDA");
  });

  it("Consolidated EBITDAR and Adjusted Cash EBITDA with full schedules are selected", () => {
    const ebitdar =
      `"Consolidated Net Income" means the net income of the Borrower. ` +
      `"Consolidated EBITDAR" means, for any period, for the Borrower and its Subsidiaries on a Consolidated basis, an amount equal to: (a) Consolidated Net Income for such period; plus (b) the following, to the extent deducted in calculating such Consolidated Net Income: (i) Consolidated Interest Expense; (ii) income taxes paid or payable; (iii) depreciation and amortization expense; (iv) Consolidated Rental Expense. ` +
      `"Default" means any event.`;
    expect(findEbitdaMeasureTerm(ebitdar)).toBe("Consolidated EBITDAR");

    const cash =
      `"Consolidated Net Income" means the net income of the Company. ` +
      `"Adjusted Cash EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense. ` +
      `"Default" means any event.`;
    expect(findEbitdaMeasureTerm(cash)).toBe("Adjusted Cash EBITDA");
    expect(optimizeConsolidatedEbitda("Adjusted Cash EBITDA", cash, fin()).maximum).toBe(String(200 * M));
  });

  it("still refuses Excess Cash Flow, Acquired EBITDA, and Pro Forma-only wrappers", () => {
    expect(findEbitdaMeasureTerm(
      `"Excess Cash Flow" means Consolidated Net Income minus capital expenditures. "Acquired EBITDA" means the EBITDA of any acquired Person. "Default" means x.`,
    )).toBeNull();
    expect(findEbitdaMeasureTerm(
      `"Adjusted EBITDA" means EBITDA of the Company for the most recently ended four full fiscal quarters on a Pro Forma Basis. "Default" means x.`,
    )).toBeNull();
  });
});
