import { describe, expect, it } from "vitest";
import { debtFromFinancials, leverageDebtCapacity, maxLeverageLimit, optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import type { BorrowerInput, IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000n;
const fin = (items: Record<string, bigint>, borrowerInputs?: BorrowerInput[]): IssuerFinancials => ({
  cik: "0000000001", entityName: "Test Borrower", missing: [], anchor: "2026-06-30", borrowerInputs,
  values: Object.entries(items).map(([concept, v]) => ({ metric: concept === "totalDebt" ? "totalDebt" : "item", concept, periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" })),
});
// Net-income exclusions in the common form of real credit agreements; clause (d) is AZEK's (TUNABLE 1782754) cap language.
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Restricted Subsidiaries determined on a consolidated basis in accordance with GAAP; provided that there shall be excluded: (a) extraordinary, non-recurring or unusual gains or losses; (b) the Net Income of any Person that is an Unrestricted Subsidiary. `;
const EBITDA = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) (i) business optimization expenses, relocation or integration; (ii) restructuring, redundancy and severance; provided that the aggregate amount added back pursuant to this clause (d) in any four-fiscal quarter period shall not exceed the greater of (i) $35.0 million and (ii) 25.0% of Consolidated EBITDA for such period (calculated prior to giving effect to any increase pursuant to this clause (d)); plus (e) the amount of net cost savings and synergies projected by the Borrower in good faith to be realized as a result of specified actions, net of the amount of actual benefits realized; provided that the aggregate amount added back pursuant to this clause (e) may not exceed 25% of Consolidated EBITDA for such period (before giving effect to such add backs). "Default" means any event.`;
const TEXT = CNI + EBITDA;
const XBRL = { NetIncomeLoss: 100n * M, IncomeTaxExpenseBenefit: 20n * M, InterestExpense: 30n * M, DepreciationDepletionAndAmortization: 50n * M, RestructuringCharges: 60n * M, totalDebt: 600n * M };
const CERT = "SAMPLE Q2-2026 compliance certificate (test input)";
const SAMPLE: BorrowerInput[] = [
  { key: "CNI:NON_RECURRING", value: String(5n * M), source: CERT }, // a $5M non-recurring gain was in net income
  { key: "CNI:UNRESTRICTED_SUBSIDIARY", value: "0", source: CERT },
  { key: "ADDBACK:RUN_RATE_SYNERGIES", value: String(30n * M), source: CERT },
];

describe("borrower-supplied inputs (with source) for items filings do not carry", () => {
  it("without inputs: NEEDS_INPUT, names the input it would accept, never zero-filled", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", TEXT, fin(XBRL));
    expect(o.maximum).toBeNull();
    expect(o.supported).toBeNull();
    expect(o.reason).toMatch(/borrower input CNI:NON_RECURRING/);
    expect(o.needsBorrowerInput.some((k) => /^CNI:NON_RECURRING$/i.test(k))).toBe(true);
  });

  it("with sourced inputs: a real maximum; inputs are recorded with their source", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", TEXT, fin(XBRL, SAMPLE));
    // base 100 − 5 gain = 95; + 20 + 30 + 50 = 195 = E0; (d) cap max(35, 25% × 195 = 48.75) → 48.75; (e) 30 ≤ 48.75
    expect(o.base?.concept).toContain(CERT);
    expect(o.status).toBe("MAXIMIZED");
    expect(o.addBacks.find((a) => a.label === "(d)")!.claimed).toBe(String(48_750_000n));
    expect(o.addBacks.find((a) => a.label === "(e)")!.concepts[0]!.concept).toContain(CERT);
    expect(o.maximum).toBe(String(273_750_000n));
  });

  it("an input without a source is ignored", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", TEXT, fin(XBRL, SAMPLE.map((s) => ({ ...s, source: " " }))));
    expect(o.maximum).toBeNull();
  });

  it("one category input answers one clause only", () => {
    const two = TEXT.replace("(b) the Net Income of any Person that is an Unrestricted Subsidiary", "(b) any unusual or non-recurring income");
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", two, fin(XBRL, SAMPLE));
    expect(o.maximum).toBeNull();
    expect(optimizeConsolidatedEbitda("Consolidated EBITDA", two, fin(XBRL, [...SAMPLE, { key: "CNI:(b)", value: "0", source: CERT }])).maximum).not.toBeNull();
  });
});

describe("maximum Consolidated EBITDA → leverage debt capacity", () => {
  it("no EBITDA → capacity NEEDS_INPUT; with inputs → capacity, and more evidenced EBITDA raises it", () => {
    const f0 = fin(XBRL);
    expect(leverageDebtCapacity(optimizeConsolidatedEbitda("Consolidated EBITDA", TEXT, f0), "4.50", debtFromFinancials(f0)).status).toBe("NEEDS_INPUT");
    const noSyn = SAMPLE.slice(0, 2);
    const fA = fin(XBRL, noSyn), fB = fin(XBRL, SAMPLE);
    const a = leverageDebtCapacity(optimizeConsolidatedEbitda("Consolidated EBITDA", TEXT, fA), "4.50", debtFromFinancials(fA));
    const b = leverageDebtCapacity(optimizeConsolidatedEbitda("Consolidated EBITDA", TEXT, fB), "4.50", debtFromFinancials(fB));
    // A: synergies not supplied → supported 243.75M (floor) → 4.5 × 243.75 − 600 = 496.875M AT_LEAST
    expect(a).toMatchObject({ status: "COMPUTED", ebitdaBasis: "SUPPORTED", ebitda: "243750000", capacity: "496875000", bound: "AT_LEAST" });
    // B: maximum 273.75M → 4.5 × 273.75 − 600 = 631.875M EXACT (+135M)
    expect(b).toMatchObject({ status: "COMPUTED", ebitdaBasis: "MAXIMUM", ebitda: "273750000", capacity: "631875000", bound: "EXACT" });
  });

  it("lower-bound debt refuses; leverage limit taken only when unambiguous", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", TEXT, fin(XBRL, SAMPLE));
    expect(leverageDebtCapacity(o, "4.50", { value: "1", source: "x", lowerBound: true }).status).toBe("NEEDS_INPUT");
    const rows = [{ kind: "RATIO", name: "Consolidated Total Leverage Ratio", direction: "MAX", limit: "4.50" }, { kind: "RATIO", name: "Consolidated Secured Leverage Ratio", direction: "MAX", limit: "3.00" }, { kind: "RATIO", name: "Interest Coverage Ratio", direction: "MIN", limit: "2.00" }];
    expect(maxLeverageLimit(rows)).toBe("4.50");
    expect(maxLeverageLimit([...rows, { kind: "RATIO", name: "Total Net Leverage Ratio", direction: "MAX", limit: "5.00" }])).toBeNull();
  });
});
