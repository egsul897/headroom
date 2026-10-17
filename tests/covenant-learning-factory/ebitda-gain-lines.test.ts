import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda, optimizerMetricBound } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (extra: Record<string, number> = {}): IssuerFinancials => ({
  cik: "0000000001", entityName: "Test Borrower", missing: [], anchor: "2026-06-30",
  values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, ...extra }).map(([concept, v]) => ({
    metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30",
    value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test",
  })),
});
const BASE = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense`;
const run = (tail: string, f: IssuerFinancials) => optimizerMetricBound(optimizeConsolidatedEbitda("Consolidated EBITDA", `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n${BASE}${tail}.`, f));

describe("two-sided gain lines evidenced from exact filed facts", () => {
  it("'gains only' deduction is not closed from a filed net gain (gross gains may be larger)", () => {
    expect(run(`; minus (d) gains on sales of assets`, fin({ GainLossOnDispositionOfAssets: 7 * M }))?.status ?? "NONE").not.toMatch(/BOUND/);
  });
  it("'gains only' deduction with a filed net loss is not EXACT 0", () => {
    expect(run(`; minus (d) gains on sales of assets`, fin({ GainLossOnDispositionOfAssets: -4 * M }))?.status ?? "NONE").not.toMatch(/BOUND/);
  });
  it("'losses only' add-back is not closed from a filed net figure", () => {
    expect(run(`; plus (d) losses on sales of assets`, fin({ GainLossOnDispositionOfAssets: -4 * M }))?.status).not.toBe("BOUND");
  });
  it("no filed fact stays unbound (no invention)", () => {
    expect(run(`; minus (d) gains on sales of assets`, fin())?.status ?? "NONE").not.toMatch(/BOUND/);
  });
  it("add-back of gains or losses on extinguishment of debt is signed from filings", () => {
    const b = run(`; plus (d) gains or losses on extinguishment of debt`, fin({ GainsLossesOnExtinguishmentOfDebt: 3 * M }));
    expect(b && "value" in b ? b.value : null).toBe(String(197 * M));
  });
  it("compound lines are not treated as exact", () => {
    expect(run(`; minus (d) extraordinary gains and gains on sales of assets`, fin({ GainLossOnDispositionOfAssets: 7 * M }))?.status ?? "NONE").not.toMatch(/BOUND/);
  });
  for (const line of ["charges and income relating to tax receivable agreements", "taxes paid, net of any income therefrom", "withholding taxes and other income items", "income from tax equity investments"]) {
    it(`non-pure tax line stays open: ${line}`, () => {
      expect(run(`; plus (d) ${line}`, fin())?.status ?? "NONE").not.toMatch(/BOUND/);
    });
  }
});
