import { describe, expect, it } from "vitest";
import { mapEbitdaItem, TWO_SIDED } from "@/lib/covenant-learning-factory/xbrl/definition-items";
import { categorize, optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (items: Record<string, number>): IssuerFinancials => ({
  cik: "0000000001", entityName: "t", missing: [], anchor: "2026-06-30",
  values: Object.entries(items).map(([concept, v]) => ({
    metric: "item", concept, periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30",
    value: String(v), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test",
  })),
});
const XBRL = { NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M };

describe("core INTEREST / D&A / TAXES add-backs map from filings", () => {
  it("'Consolidated Interest Expense' add-back uses XBRL interest when the defined term has hedge exclusions", () => {
    // Real indenture pattern: CIE ≈ GAAP interest expense, excluding MTM hedge movement (exclusion, not a two-sided add-back).
    const text =
      `"Consolidated Net Income" means the net income of the Issuer. ` +
      `"Consolidated Interest Expense" means, with respect to any Person for any period, consolidated interest expense of such Person for such period, whether paid or accrued, including amortization of original issue discount, non-cash interest payments (but excluding any non-cash interest expense attributable to the movement in mark-to-market valuation of any Hedging obligations or other derivative instruments pursuant to GAAP). ` +
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) Consolidated Interest Expense; plus (b) provision for taxes based on income; plus (c) depreciation and amortization expense. ` +
      `"Default" means any event.`;
    const m = mapEbitdaItem("Consolidated Interest Expense;", fin(XBRL), text, 0);
    expect(m).not.toBe("TWO_SIDED");
    expect(m && typeof m === "object" && m.concepts.some((c) => /InterestExpense/i.test(c.concept))).toBe(true);
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin(XBRL));
    const interest = o.addBacks.find((a) => a.label === "(a)")!;
    expect(interest.category).toBe("INTEREST");
    expect(interest.coverage).not.toBe("NONE");
    expect(Number(interest.evidenced)).toBe(30 * M);
  });

  it("D&A line that mentions Hedging Obligations fees is not wiped as two-sided", () => {
    // "Hedging Obligations" as a fee/charge category is one-sided; MTM hedge gains/losses remain two-sided.
    expect(TWO_SIDED.test("all depreciation and amortization expense, non-cash fees and charges with respect to Indebtedness and Hedging Obligations")).toBe(false);
    expect(TWO_SIDED.test("gains or losses on Hedging Obligations or other derivative instruments")).toBe(true);

    const text =
      `"Consolidated Net Income" means the net income of the Borrower. ` +
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted: (a) taxes; plus (b) interest expense; plus (c) all depreciation and amortization expense, including non-cash fees and charges with respect to Indebtedness and Hedging Obligations. ` +
      `"Default" means any event.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin(XBRL));
    const da = o.addBacks.find((a) => a.label === "(c)")!;
    expect(da.category).toBe("D&A");
    expect(da.coverage).not.toBe("NONE");
    expect(Number(da.evidenced)).toBe(50 * M);
  });

  it("total interest expense (inclusive of amortization of premiums) categorizes as INTEREST, not D&A", () => {
    expect(categorize("total interest expense (inclusive of amortization of premiums, deferred financing fees)")).toBe("INTEREST");
  });

  it("interest expense line that also mentions hedge losses still claims XBRL interest", () => {
    const text =
      `"Consolidated Net Income" means the net income of the Borrower. ` +
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted: (a) taxes; plus (b) total interest expense and, to the extent not reflected in such total interest expense, any losses on hedging obligations; plus (c) depreciation and amortization expense. ` +
      `"Default" means any event.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin(XBRL));
    const interest = o.addBacks.find((a) => a.label === "(b)")!;
    expect(interest.category).toBe("INTEREST");
    expect(interest.coverage).not.toBe("NONE");
    expect(Number(interest.evidenced)).toBe(30 * M);
    expect(interest.status).toBe("NEEDS_INPUT"); // hedge-loss residue still open
  });

  it("Fixed Charges add-back claims XBRL interest as a lower bound", () => {
    const text =
      `"Consolidated Net Income" means the net income of the Borrower. ` +
      `"Fixed Charges" means, for any period, the sum of Consolidated Interest Expense and cash dividends on preferred stock. ` +
      `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus (a) taxes; plus (b) Fixed Charges; plus (c) depreciation and amortization expense. ` +
      `"Default" means any event.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin(XBRL));
    const fc = o.addBacks.find((a) => a.label === "(b)")!;
    expect(fc.category).toBe("INTEREST");
    expect(fc.coverage).not.toBe("NONE");
    expect(Number(fc.evidenced)).toBe(30 * M);
  });
});
