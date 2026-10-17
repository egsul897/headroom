import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { capRoomTotal, trackAddBacks } from "@/lib/covenant-learning-factory/xbrl/addback-tracker";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin = (extra: Record<string, number>): IssuerFinancials => ({ cik: "1", entityName: "T", missing: [], anchor: "2026-06-30", values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, ...extra }).map(([c, v]) => row(c, v)) });
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n`;
const S = (tail: string) => `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense${tail}.`;
const room = (tail: string, f = fin({})) => capRoomTotal(trackAddBacks(optimizeConsolidatedEbitda("Consolidated EBITDA", S(tail), f), f, null));

describe("canonical cap-room total", () => {
  it("shared cap room counted once, not per member", () => {
    expect(room("; plus (d) restructuring charges; plus (e) acquisition costs; provided that the aggregate amount added back pursuant to clauses (d) and (e) shall not exceed $10,000,000 for any period")).toBe(BigInt(10 * M));
  });
  it("own caps add; unknown-room caps contribute nothing", () => {
    expect(room("; plus (d) restructuring charges not to exceed $3,000,000 for any period; plus (e) acquisition costs not to exceed $2,000,000 for any period; plus (f) other costs not to exceed an amount to be agreed")).toBe(BigInt(5 * M));
  });
  it("CONDITIONAL (lender-approval) rows are excluded", () => {
    expect(room("; plus (d) restructuring charges not to exceed $3,000,000 for any period; plus (e) non-recurring costs approved and verified by Lender in an amount not to exceed $1,000,000 for any period")).toBe(BigInt(3 * M));
  });
});
