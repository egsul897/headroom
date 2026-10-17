import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (items: Record<string, number>): IssuerFinancials => ({
  cik: "0000000001", entityName: "t", missing: [], anchor: "2026-06-30",
  values: Object.entries(items).map(([concept, v]) => ({
    metric: "item", concept, periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30",
    value: String(v), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test",
  })),
});

/**
 * When the NI base is derivable, a two-sided / unknown add-back must not wipe the supported floor:
 * omit that line (NEEDS_INPUT, claim 0) and still report base + evidenced add-backs.
 * Invent-absence: we do not fill the ambiguous line; we also do not discard proven amounts.
 */
describe("optimizer supported floor survives ambiguous add-backs", () => {
  it("two-sided add-back blocks the maximum but not the supported floor", () => {
    const text =
      `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP. ` +
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) gains or losses on foreign currency translations. ` +
      `"Default" means any event.`;
    const f = fin({
      NetIncomeLoss: 100 * M,
      IncomeTaxExpenseBenefit: 20 * M,
      InterestExpense: 30 * M,
      DepreciationDepletionAndAmortization: 50 * M,
    });
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, f);
    expect(o.maximum).toBeNull();
    expect(o.status).toBe("NEEDS_INPUT");
    // Base 100 + tax 20 + interest 30 + D&A 50 = 200; FX line omitted (not invented).
    expect(o.supported).toBe(String(200 * M));
    expect(o.addBacks.find((a) => a.label === "(d)")?.status).toBe("NEEDS_INPUT");
    expect(o.addBacks.find((a) => a.label === "(d)")?.claimed).toBe("0");
  });

  it("unmapped deduction still blocks the floor (omitting it would overstate)", () => {
    const text =
      `"Consolidated Net Income" means the net income of the Borrower. ` +
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus (a) taxes; plus (b) interest expense; plus (c) depreciation and amortization; minus (d) cash income tax refunds not otherwise included. ` +
      `"Default" means any event.`;
    const o = optimizeConsolidatedEbitda(
      "Consolidated EBITDA",
      text,
      fin({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M }),
    );
    expect(o.supported).toBeNull();
    expect(o.maximum).toBeNull();
  });
});
