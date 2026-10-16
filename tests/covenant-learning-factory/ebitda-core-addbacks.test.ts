import { describe, expect, it } from "vitest";
import { mapEbitdaItem, TWO_SIDED } from "@/lib/covenant-learning-factory/xbrl/definition-items";
import { categorize, hardAddBackCarveOut, optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
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

  it("tax provision mentioning penalties and interest categorizes as TAXES and does not consume InterestExpense", () => {
    const taxLine =
      "provision for taxes based on income or profits, including penalties and interest relating to such taxes or arising from any tax examinations";
    expect(categorize(taxLine)).toBe("TAXES");
    const m = mapEbitdaItem(taxLine, fin(XBRL), "", 0);
    expect(m && typeof m === "object" && !m.concepts.some((c) => /InterestExpense/i.test(c.concept))).toBe(true);
    expect(m && typeof m === "object" && m.concepts.some((c) => /IncomeTax/i.test(c.concept))).toBe(true);

    const text =
      `"Consolidated Net Income" means the net income of the Issuer. ` +
      `"Consolidated EBITDA" means Consolidated Net Income plus (a) provision for taxes based on income, including penalties and interest relating to such taxes; plus (b) Consolidated Interest Expense; plus (c) depreciation and amortization. ` +
      `"Consolidated Interest Expense" means interest expense. ` +
      `"Default" means any event.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin(XBRL));
    const tax = o.addBacks.find((a) => a.label === "(a)")!;
    const interest = o.addBacks.find((a) => a.label === "(b)")!;
    expect(tax.category).toBe("TAXES");
    expect(interest.category).toBe("INTEREST");
    expect(interest.coverage).not.toBe("NONE");
    expect(Number(interest.evidenced)).toBe(30 * M);
  });

  it("interest expense inclusive of amortization of premiums does not claim D&A", () => {
    const line = "total interest expense (inclusive of amortization of premiums, deferred financing fees and other original issue discount)";
    const m = mapEbitdaItem(line, fin(XBRL), "", 0);
    expect(m && typeof m === "object").toBe(true);
    if (m && typeof m === "object") {
      expect(m.concepts.some((c) => /InterestExpense/i.test(c.concept))).toBe(true);
      expect(m.concepts.some((c) => /Depreciation|Amortization/i.test(c.concept) && !/Interest/i.test(c.concept))).toBe(false);
    }

    const text =
      `"Consolidated Net Income" means the net income of the Issuer. ` +
      `"Consolidated EBITDA" means Consolidated Net Income plus (1) total interest expense (inclusive of amortization of premiums, deferred financing fees); plus (2) all depreciation and amortization expense. ` +
      `"Default" means any event.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin({ ...XBRL, InterestAndDebtExpense: 30 * M }));
    const interest = o.addBacks.find((a) => a.label === "(1)")!;
    const da = o.addBacks.find((a) => a.label === "(2)")!;
    expect(interest.category).toBe("INTEREST");
    expect(interest.coverage).not.toBe("NONE");
    expect(da.category).toBe("D&A");
    expect(da.coverage).not.toBe("NONE");
    expect(Number(da.evidenced)).toBe(50 * M);
  });
});

describe("categorize edge cases", () => {
  it("minority / non-controlling interest is not INTEREST", () => {
    expect(categorize("the amount of any minority interest expense consisting of Subsidiary income attributable to minority equity interests")).toBe("OTHER");
    expect(categorize("non-controlling interest expense")).toBe("OTHER");
    expect(categorize("Consolidated Interest Expense")).toBe("INTEREST");
  });
});

describe("hard QUALIFIED carve-outs and D&A dedupe", () => {
  it("definitional excluding prepaid amort still maps D&A; head carve-outs stay blocked", () => {
    const definitional =
      "depreciation, amortization (including amortization of intangibles but excluding amortization of prepaid cash expenses that were paid in a prior period)";
    expect(hardAddBackCarveOut(definitional)).toBe(false);
    expect(hardAddBackCarveOut("interest expense (other than interest expense attributable to securities lending)")).toBe(true);
    expect(hardAddBackCarveOut("Consolidated Depreciation and Amortization Expense of such Person for such period (other than amortization related to MSRs)")).toBe(true);

    const text =
      `"Consolidated Net Income" means the net income of the Issuer. ` +
      `"Consolidated EBITDA" means Consolidated Net Income plus (1) interest expense; plus (2) ` + definitional + `; plus (3) taxes. ` +
      `"Default" means any event.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin(XBRL));
    const da = o.addBacks.find((a) => a.label === "(2)")!;
    expect(da.category).toBe("D&A");
    expect(da.coverage).not.toBe("NONE");
    expect(Number(da.evidenced)).toBe(50 * M);
  });

  it("transaction costs other than D&A are not categorized as D&A", () => {
    expect(categorize("any expenses or charges (other than depreciation or amortization expense) related to any Equity Offering")).toBe("TRANSACTION_COSTS");
    expect(categorize("any fees (other than Consolidated Depreciation and Amortization Expense) related to any acquisition")).toBe("TRANSACTION_COSTS");
    expect(categorize("any fees (other than Consolidated Depreciation and Amortization Expense) related to any Investment")).not.toBe("D&A");
  });

  it("interest expense other than securities lending stays NEEDS_INPUT (would overstate)", () => {
    const text =
      `"Consolidated Net Income" means the net income of the Issuer. ` +
      `"Consolidated EBITDA" means Consolidated Net Income plus (a) taxes; plus (b) interest expense (other than interest expense attributable to securities lending); plus (c) depreciation and amortization. ` +
      `"Default" means any event.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin(XBRL));
    const interest = o.addBacks.find((a) => a.label === "(b)")!;
    expect(interest.category).toBe("INTEREST");
    expect(interest.coverage).toBe("NONE");
    expect(interest.status).toBe("NEEDS_INPUT");
  });

  it("trailing amortization after full D&A claim is covered, not a NONE gap", () => {
    const text =
      `"Consolidated Net Income" means the net income of the Issuer. ` +
      `"Consolidated EBITDA" means Consolidated Net Income plus (i) taxes; plus (ii) interest expense; plus (iii) depreciation and amortization expense; plus (iv) amortization expense. ` +
      `"Default" means any event.`;
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin(XBRL));
    const da = o.addBacks.find((a) => a.label === "(iii)")!;
    const amort = o.addBacks.find((a) => a.label === "(iv)")!;
    expect(da.coverage).not.toBe("NONE");
    expect(Number(da.evidenced)).toBe(50 * M);
    expect(amort.category).toBe("D&A");
    expect(amort.coverage).toBe("FULL");
    expect(amort.status).toBe("CLAIMED");
    expect(Number(amort.claimed)).toBe(0);
    expect(amort.note).toMatch(/already included/i);
  });
});
