import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { trackAddBacks } from "@/lib/covenant-learning-factory/xbrl/addback-tracker";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (concept: string, v: number, end: string) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: end, value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin = (extra: Record<string, number>, anchor: string | null = "2026-06-30"): IssuerFinancials => ({ cik: "1", entityName: "T", missing: [], anchor: anchor as string, values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, ...extra }).map(([c, v]) => row(c, v, anchor ?? "2026-06-30")) });
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n`;
const S = (tail: string) => `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense${tail}.`;
const run = (tail: string, f: IssuerFinancials) => optimizeConsolidatedEbitda("Consolidated EBITDA", S(tail), f);

const TIER = "; plus (d) other non-recurring expenses in an amount not to exceed (A) $1,000,000 for any period ending on or prior to June 30, 2026, (B) $900,000 for any period ending after June 30, 2026 but on or prior to January 31, 2027 and (C) $750,000 for any period thereafter";
describe("date-tiered caps follow the measured period end", () => {
  const cap = (anchor: string | null) => run(TIER, fin({}, anchor)).addBacks.find((l) => l.label === "(d)")!.cap?.amount;
  it("on or before the first date", () => expect(cap("2026-06-30")).toBe(String(1 * M)));
  it("middle tier", () => expect(cap("2026-12-31")).toBe(String(900_000)));
  it("thereafter", () => expect(cap("2027-03-31")).toBe(String(750_000)));
  it("unknown period end takes the lowest tier", () => expect(cap(null)).toBe(String(750_000)));
});

describe("lender-approval add-backs are CONDITIONAL", () => {
  const tail = "; plus (d) restructuring charges, in each case as approved and verified by the Administrative Agent";
  it("claims nothing and is flagged CONDITIONAL in the tracker", () => {
    const f = fin({ RestructuringCharges: 10 * M });
    const o = run(tail, f);
    const d = o.addBacks.find((l) => l.label === "(d)")!;
    expect(d.claimed).toBe("0");
    expect((d as { conditional?: string }).conditional).toBe("LENDER_APPROVAL");
    expect(o.supported).toBe(String(200 * M));
    const t = trackAddBacks(o, f, null);
    expect(t.find((x) => x.clause.label === "(d)")!.status).toBe("CONDITIONAL");
  });
});

describe("stock comp only from general stock-comp clauses", () => {
  it("equity-proceeds-funded costs do not take ShareBasedCompensation", () => {
    const o = run("; plus (d) any costs or expenses pursuant to any management equity plan or stock option plan, to the extent funded with cash proceeds contributed to the capital of the Borrower or net cash proceeds of an issuance of Equity Interests", fin({ ShareBasedCompensation: 7 * M }));
    expect(o.addBacks.find((l) => l.label === "(d)")!.concepts.map((c) => c.concept)).not.toContain("ShareBasedCompensation");
  });
  it("a general stock-comp clause still does", () => {
    const o = run("; plus (d) non-cash stock-based compensation expense", fin({ ShareBasedCompensation: 7 * M }));
    expect(o.addBacks.find((l) => l.label === "(d)")!.concepts.map((c) => c.concept)).toContain("ShareBasedCompensation");
  });
});
