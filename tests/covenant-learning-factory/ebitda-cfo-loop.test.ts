import { describe, expect, it } from "vitest";
import { cfoRecompute } from "@/lib/covenant-learning-factory/pipeline/cfo-loop";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin: IssuerFinancials = {
  cik: "0000000001", entityName: "Test Borrower", missing: [], anchor: "2026-06-30",
  values: [row("NetIncomeLoss", 100 * M), row("IncomeTaxExpenseBenefit", 20 * M), row("InterestExpense", 30 * M), row("DepreciationDepletionAndAmortization", 50 * M),
    { metric: "totalDebt", concept: "LongTermDebt", periodType: "INSTANT" as const, periodStart: null as unknown as string, periodEnd: "2026-06-30", value: String(600 * M), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "exact" }],
};
const DOC = `
ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) restructuring charges in an aggregate amount not to exceed $5,000,000 for any period; plus (e) transaction costs and expenses incurred in connection with any acquisition.
"Consolidated Total Debt" means the consolidated Indebtedness of the Borrower.
"Consolidated Total Leverage Ratio" means the ratio of Consolidated Total Debt to Consolidated EBITDA.
"Default" means any event of default.

ARTICLE VI FINANCIAL COVENANTS
Section 6.01 Consolidated Total Leverage Ratio. The Borrower will not permit the Consolidated Total Leverage Ratio as of the last day of any fiscal quarter to exceed 4.50 to 1.00.

ARTICLE VII NEGATIVE COVENANTS
Section 7.01 Indebtedness. The Borrower will not incur Indebtedness except (a) Indebtedness under this Agreement and (b) other Indebtedness in an aggregate principal amount not to exceed the greater of $20,000,000 and 10% of Consolidated EBITDA.
`;
const args = { sourceId: "cfo-test", text: DOC, issuerCik: "0000000001", financials: fin };

describe("CFO loop: input keys, ranking, recompute", () => {
  it("each flag names its exact input key; ranking puts known cap headroom first, unknowns after without amounts", () => {
    const { flags } = cfoRecompute(args, []);
    const d = flags.find((f) => f.clause.label === "(d)")!, e = flags.find((f) => f.clause.label === "(e)")!;
    expect(d.inputKey).toBe("ADDBACK:(d)");
    expect(e.inputKey).toBe("ADDBACK:(e)");
    expect(d.potential.basis).toBe("CAP_HEADROOM");
    expect(d.potential.ebitda).toBe(String(5 * M));
    expect(d.potential.debt).toBe(String(22.5 * M));
    expect(e.potential).toEqual({ basis: "UNCAPPED_NEEDS_INPUT", ebitda: null, debt: null });
    expect(d.rank).toBeLessThan(e.rank);
  });
  it("a CFO-confirmed sourced figure recomputes EBITDA, leverage capacity and grower baskets", () => {
    const { results } = cfoRecompute(args, [{ key: "ADDBACK:(d)", value: String(4 * M), source: "Q2 2026 compliance certificate, schedule 1" }]);
    const r = results[0]!;
    expect(r.accepted).toBe(true);
    expect(r.gain?.ebitda).toBe(String(4 * M));
    expect(r.gain?.leverageCapacity).toBe(String(18 * M));
    expect(Object.values(r.gain?.growerByBasket ?? {}).some((g) => g != null && Number(g) === 0.4 * M)).toBe(true);
  });
  it("refuses unsourced inputs, non-integer values and keys no flag names (nothing invented)", () => {
    const { results } = cfoRecompute(args, [
      { key: "ADDBACK:(d)", value: String(4 * M), source: " " },
      { key: "ADDBACK:(d)", value: "4.5", source: "cert" },
      { key: "ADDBACK:(zz)", value: "1", source: "cert" },
    ]);
    expect(results.map((r) => r.accepted)).toEqual([false, false, false]);
    expect(results.every((r) => r.gain == null)).toBe(true);
  });
});

describe("CFO loop: shared caps counted once", () => {
  const SHARED = DOC.replace(
    "plus (d) restructuring charges in an aggregate amount not to exceed $5,000,000 for any period; plus (e) transaction costs and expenses incurred in connection with any acquisition.",
    "plus (d) restructuring charges; plus (e) integration costs; provided that the aggregate amount added back pursuant to clauses (d) and (e) shall not exceed $5,000,000 for any period.");
  const sargs = { ...args, text: SHARED };
  it("groups clauses under one cap and shows the combined room once", () => {
    const { flags } = cfoRecompute(sargs, []);
    const d = flags.find((f) => f.clause.label === "(d)")!, e = flags.find((f) => f.clause.label === "(e)")!;
    expect(d.capGroup?.labels).toEqual(["(d)", "(e)"]);
    expect(e.capGroup?.id).toBe(d.capGroup?.id);
    expect(d.potential).toMatchObject({ basis: "CAP_HEADROOM", ebitda: String(5 * M) });
    expect(e.potential).toEqual({ basis: "SHARED_CAP", ebitda: null, debt: null });
    const total = flags.reduce((a, f) => a + BigInt(f.potential.ebitda ?? "0"), 0n);
    expect(total).toBe(BigInt(5 * M));
    expect(Math.abs(d.rank - e.rank)).toBe(1);
  });
  it("cfoRecompute enforces the shared cap across clauses", () => {
    const src = "Q2 2026 compliance certificate";
    const { results, combined } = cfoRecompute(sargs, [{ key: "ADDBACK:(d)", value: String(4 * M), source: src }, { key: "ADDBACK:(e)", value: String(4 * M), source: src }]);
    expect(results.map((r) => r.gain?.ebitda)).toEqual([String(4 * M), String(4 * M)]);
    expect(combined?.gain?.ebitda).toBe(String(5 * M));
    expect(combined?.gain?.leverageCapacity).toBe(String(22.5 * M));
  });
});
