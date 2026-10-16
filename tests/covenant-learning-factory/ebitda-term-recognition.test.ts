import { describe, expect, it } from "vitest";
import { findEbitdaMeasureTerm, findDefinitionText } from "@/lib/covenant-learning-factory/xbrl/definition-items";
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

const schedule = (term: string, next = "Default") =>
  `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP. ` +
  `"${term}" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense. ` +
  `"${next}" means any event.`;

describe("findEbitdaMeasureTerm: primary earnings measure under alternate labels", () => {
  it.each([
    "EBITDA",
    "Consolidated Adjusted EBITDA",
    "Adjusted Consolidated EBITDA",
    "Consolidated EBITDAX",
    "Consolidated Cash Flow",
  ])("finds a defined %s schedule when Consolidated EBITDA is absent", (term) => {
    const text = schedule(term);
    expect(findDefinitionText(text, "Consolidated EBITDA")).toBeNull();
    expect(findEbitdaMeasureTerm(text)).toBe(term);
    const o = optimizeConsolidatedEbitda(findEbitdaMeasureTerm(text)!, text, fin());
    expect(o.status).toBe("MAXIMIZED");
    expect(o.maximum).toBe(String(200 * M));
    expect(o.term).toBe(term);
  });

  it("prefers Consolidated EBITDA over bare EBITDA when both are defined", () => {
    const text =
      schedule("EBITDA", "Consolidated EBITDA") +
      // second definition: Consolidated EBITDA (full schedule). The prior next-term cut leaves bare EBITDA short;
      // append a proper Consolidated EBITDA definition as its own opener.
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus (a) taxes; plus (b) interest expense; plus (c) depreciation and amortization. "Zzz" means x.`;
    // Rebuild cleanly: both full schedules
    const both =
      `"Consolidated Net Income" means the net income of the Borrower. ` +
      `"EBITDA" means, for any period, Consolidated Net Income for such period plus (a) taxes; plus (b) interest expense; plus (c) depreciation and amortization expense. ` +
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense. ` +
      `"Default" means any event.`;
    expect(findEbitdaMeasureTerm(both)).toBe("Consolidated EBITDA");
  });

  it("ignores Excess Cash Flow and Acquired EBITDA (not the primary measure)", () => {
    const text =
      `"Excess Cash Flow" means Consolidated Net Income minus capital expenditures and mandatory prepayments. ` +
      `"Acquired EBITDA" means the EBITDA of any acquired Person for the period. ` +
      `"Default" means any event.`;
    expect(findEbitdaMeasureTerm(text)).toBeNull();
  });

  it("ignores Adjusted EBITDA that is only a Pro Forma wrapper of EBITDA (no schedule)", () => {
    const text =
      `"Adjusted EBITDA" means, as of any date of determination, EBITDA of the Company for the most recently ended four full fiscal quarters on a Pro Forma Basis. ` +
      `"Default" means any event.`;
    expect(findEbitdaMeasureTerm(text)).toBeNull();
  });
});
