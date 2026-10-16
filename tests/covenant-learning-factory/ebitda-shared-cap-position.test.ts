import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin: IssuerFinancials = { cik: "1", entityName: "T", missing: [], anchor: "2026-06-30", values: [row("NetIncomeLoss", 100 * M), row("IncomeTaxExpenseBenefit", 20 * M), row("InterestExpense", 30 * M), row("DepreciationDepletionAndAmortization", 50 * M)] };
// Indenture pattern (cf. 821483): a cost-savings clause "(i)" capped by "(z) … pursuant to this clause (i) …", and a later
// casualty clause with its own nested "(i) covered by insurance".
const TEXT = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (i) the amount of net cost savings projected by the Company in good faith to be realized as a result of specified actions, provided that (x) such cost savings are reasonably identifiable and factually supportable and (z) the aggregate amount of cost savings added pursuant to this clause (i) shall not exceed $10,000,000 for any period; plus (l) the amount of expenses, charges or losses with respect to casualty events to the extent (i) covered by insurance and actually reimbursed.`;

describe("shared caps resolve clause references by position, not label", () => {
  it("the cap in (z) binds the cost-savings (i), not the later nested (i) under (l)", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", TEXT, fin);
    const is = o.addBacks.map((l, j) => ({ l, j })).filter((x) => x.l.label === "(i)");
    expect(is.length).toBe(2);
    const [first, second] = is;
    const z = o.addBacks.find((l) => l.label === "(z)")!;
    expect(z.capGroupAt).toContain(first!.j);
    expect(z.capGroupAt).not.toContain(second!.j);
    expect(second!.l.capGroup ?? null).toBeNull();
    expect(second!.l.cap).toBeNull();
  });
});
