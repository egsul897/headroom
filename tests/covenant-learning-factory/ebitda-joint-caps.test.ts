import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

// Joint cap allocation: every clause's own cap and every shared cap bind together, independent of clause order.
const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin = (extra: Record<string, number>): IssuerFinancials => ({ cik: "1", entityName: "T", missing: [], anchor: "2026-06-30", values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, ...extra }).map(([c, v]) => row(c, v)) });
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n`;
const S = (tail: string) => `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense${tail}.`;
const F = fin({ RestructuringCharges: 95 * M, BusinessCombinationAcquisitionRelatedCosts: 40 * M });
const run = (tail: string, f = F) => optimizeConsolidatedEbitda("Consolidated EBITDA", S(tail), f);
const claimed = (o: ReturnType<typeof run>, ...labels: string[]) => o.addBacks.filter((l) => labels.includes(l.label)).reduce((a, l) => a + Number(l.claimed), 0);

describe("joint cap allocation (own + shared caps together)", () => {
  it("own cap on the later clause, shared cap stated in the same clause", () => {
    const o = run("; plus (d) restructuring charges; plus (e) acquisition costs in an aggregate amount not to exceed $10,000,000 for any period; provided that the aggregate amount added back pursuant to clauses (d) and (e) shall not exceed $100,000,000 for any period");
    expect(claimed(o, "(e)")).toBeLessThanOrEqual(10 * M);
    expect(claimed(o, "(d)", "(e)")).toBe(100 * M);
    expect(o.status).toBe("MAXIMIZED");
    expect(o.maximum).toBe(String(300 * M));
  });
  it("own cap first, shared cap on the later clause", () => {
    const o = run("; plus (d) acquisition costs in an aggregate amount not to exceed $10,000,000 for any period; plus (e) restructuring charges; provided that the aggregate amount added back pursuant to clauses (d) and (e) shall not exceed $100,000,000 for any period");
    expect(o.status).toBe("MAXIMIZED");
    expect(o.maximum).toBe(String(300 * M));
  });
  it("shared cap listed first", () => {
    const o = run("; plus (d) restructuring charges; provided that the aggregate amount added back pursuant to clauses (d) and (e) shall not exceed $100,000,000 for any period; plus (e) acquisition costs");
    expect(o.status).toBe("MAXIMIZED");
    expect(o.maximum).toBe(String(300 * M));
  });
  it("three clauses under one shared cap", () => {
    const o = run("; plus (d) restructuring charges; plus (e) acquisition costs; plus (f) share-based compensation expense; provided that the aggregate amount added back pursuant to clauses (d), (e) and (f) shall not exceed $100,000,000 for any period", fin({ RestructuringCharges: 95 * M, BusinessCombinationAcquisitionRelatedCosts: 40 * M, ShareBasedCompensation: 30 * M }));
    expect(o.status).toBe("MAXIMIZED");
    expect(o.maximum).toBe(String(300 * M));
  });
  it("overlapping shared caps bind jointly: (e)+(f) never exceeds its cap; maximum is the joint optimum", () => {
    const o = run("; plus (d) restructuring charges; plus (e) acquisition costs; provided that the aggregate amount added back pursuant to clauses (d) and (e) shall not exceed $100,000,000 for any period; plus (f) share-based compensation expense; provided that the aggregate amount added back pursuant to clauses (e) and (f) shall not exceed $50,000,000 for any period", fin({ RestructuringCharges: 95 * M, BusinessCombinationAcquisitionRelatedCosts: 40 * M, ShareBasedCompensation: 30 * M }));
    expect(claimed(o, "(e)", "(f)")).toBeLessThanOrEqual(50 * M);
    expect(claimed(o, "(d)", "(e)")).toBeLessThanOrEqual(100 * M);
    expect(o.supported).toBe(String(330 * M)); // joint optimum: d=95, f=30, e=5 (sequential application gave 310M)
  });
  it("nested shared % cap still 220M", () => {
    const o = run("; plus (d) restructuring charges, not to exceed, together with amounts added pursuant to clause (e) below, 10% of Consolidated EBITDA (calculated before giving effect to such add-backs); plus (e) share-based compensation expense", fin({ RestructuringCharges: 15 * M, ShareBasedCompensation: 15 * M }));
    expect(o.maximum).toBe(String(220 * M));
  });
});

describe("caps resolve to the right clauses", () => {
  it("'this clause (x)' is the clause itself, never an earlier proviso fragment labelled (x)", () => {
    const o = run("; plus (d) charges to the extent reimbursed by a third party; provided that (x) if such amount is not received within one fiscal quarter, such charges shall be subtracted in the subsequent period; plus (x) acquisition costs; provided that the aggregate amount added back pursuant to this clause (x) shall not exceed $2,500,000 for any period");
    const capped = o.addBacks.filter((l) => l.cap?.amount === String(2.5 * M));
    expect(capped.map((l) => l.text.slice(0, 20))).toEqual(capped.map(() => "acquisition costs; p".slice(0, 20)));
  });
  it("sub-clause caps bound only their parts and add up", () => {
    const o = run("; plus (d) (x) public company costs; provided that all such amounts pursuant to this clause (x) shall not exceed $2,500,000 for any period, and (y) litigation expenses; provided that all such amounts pursuant to this clause (y) shall not exceed $1,000,000 for any period", fin({}));
    const d = o.addBacks.find((l) => l.label === "(d)")!;
    expect(d.headroomToCap).toBe(String(3.5 * M)); // sub-clause caps add: (x) ≤ 2.5M + (y) ≤ 1M
  });
});
