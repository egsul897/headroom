import { describe, expect, it } from "vitest";
import { addBackInputKey, optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { trackAddBacks } from "@/lib/covenant-learning-factory/xbrl/addback-tracker";
import { decide } from "@/lib/covenant-learning-factory/xbrl/bind";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const row = (concept: string, v: number) => ({ metric: "item" as const, concept, periodType: "TTM" as const, periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD" as const, accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const fin = (extra: Record<string, number> = {}): IssuerFinancials => ({ cik: "1", entityName: "T", missing: [], anchor: "2026-06-30", values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, ...extra }).map(([c, v]) => row(c, v)) });
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.\n`;
const S = (tail: string) => `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense${tail}.`;

describe("reviewer FAIL at f4428260", () => {
  it("a clause with its own cap also joins the shared cap (own caps first, then the shared limit)", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", S("; plus (d) acquisition costs in an aggregate amount not to exceed $10,000,000 for any period; plus (e) restructuring charges; provided that the aggregate amount added back pursuant to clauses (d) and (e) shall not exceed $100,000,000 for any period"), fin({ RestructuringCharges: 95 * M, BusinessCombinationAcquisitionRelatedCosts: 40 * M }));
    expect(o.status).toBe("MAXIMIZED");
    expect(o.maximum).toBe(String(300 * M));
  });
  it("labels that differ only in case are one label for keys (plain key would be ambiguous)", () => {
    const lines = [{ label: "(b)" }, { label: "(B)" }, { label: "(c)" }];
    expect(addBackInputKey(lines, 0)).toBe("ADDBACK:(b)@0");
    expect(addBackInputKey(lines, 1)).toBe("ADDBACK:(B)@1");
    expect(addBackInputKey(lines, 2)).toBe("ADDBACK:(c)");
  });
  it("a conditional exemption ('limitation in subclause (ii) above shall not apply … not exceed $X') is not cap room", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", S("; plus (d) the amount of cost savings and synergies projected in good faith; provided that (i) such cost savings are reasonably identifiable and factually supportable and (ii) the amount of cost savings added back pursuant to this clause (d) shall not exceed, for any four fiscal quarter period, (x) 25.0% of Consolidated EBITDA; provided, further, that the limitation in subclause (ii) above shall not apply to such adjustments with respect to any fiscal quarter ending after December 31, 2025 if (x) such adjustments are calculated in good faith and (y) the aggregate amount of adjustments excluded from the limitation in subclause (ii) above does not exceed, for any Interim Fiscal Quarter, $19.5 million (it being understood that any adjustments excluded from the limitation in subclause (ii) above pursuant to this proviso shall be disregarded for purposes of the application of subclause (ii) above with respect to all other adjustments pursuant to this clause (d)); plus (e) non-cash stock-based compensation expense"), fin());
    expect(o.addBacks.some((l) => l.headroomToCap === String(19.5 * M))).toBe(false);
    expect(o.addBacks.some((l) => l.cap?.amount === String(19.5 * M))).toBe(false);
  });
  it("'taxes based on income, profits or capital' is a floor, not EXACT", () => {
    expect(decide("Consolidated EBITDA", S("").replace("provision for taxes based on income", "provision for taxes based on income, profits or capital"), fin()).status).not.toBe("BOUND");
  });
  it("tracker never attributes total interest expense to a fees line '(including any interest expense)'", () => {
    const opt = { term: "Consolidated EBITDA", periodEnd: "2026-06-30", status: "NEEDS_INPUT", maximum: null, supported: null, base: null, deductions: null, needsInput: [], reason: "", needsBorrowerInput: [],
      addBacks: [{ label: "(z)", text: "commissions, discounts, yield and other fees and charges (including any interest expense) related to any Permitted Receivables Financing", category: "OTHER", evidenced: "30000000", concepts: [{ concept: "InterestExpense", value: "30000000" }], coverage: "PARTIAL", cap: null, claimed: "30000000", status: "NEEDS_INPUT", headroomToCap: null, note: "" }] };
    const [f] = trackAddBacks(opt as never, fin(), null, null);
    expect(f!.status).toBe("NEEDS_INPUT");
    expect(f!.sources.length).toBe(0);
  });
});
