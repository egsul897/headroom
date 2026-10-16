import { describe, expect, it } from "vitest";
import { optimizeConsolidatedEbitda, parseCap } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import { evaluateDefinition } from "@/lib/covenant-learning-factory/xbrl/definition-items";
import { ttmAt, type IssuerFinancials, type XbrlFact } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (items: Record<string, number>): IssuerFinancials => ({
  cik: "0000000001", entityName: "Test Borrower", missing: [], anchor: "2026-06-30",
  values: Object.entries(items).map(([concept, v]) => ({ metric: "item", concept, periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" })),
});
const CNI = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP. `;
const def = (addBacks: string) => `${CNI}"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; ${addBacks}. "Default" means any event.`;
const BASE = { NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M }; // EBITDA before capped add-backs = 200M

// Clause (e) is verbatim from a real credit agreement in the TUNABLE corpus (AZEK, CIK 1782754).
const AZEK_E = `plus (d) (i) business optimization expenses (including consolidation initiatives), relocation or integration; (ii) expenses, costs and charges related to consolidation or closing of distribution centers or other facilities or exiting lines of business; acquisitions and mergers after the Closing Date; initiatives aimed at profitability improvement; strategic initiatives; personnel relocation, restructuring, redundancy, severance, termination, settlement or judgment; (iii) one-time compensation charges and (iv) the amount of any signing, retention and completion bonuses; provided that the aggregate amount added back pursuant to this clause (d) in any four-fiscal quarter period shall not exceed the greater of (i) $35.0 million and (ii) 25.0% of Consolidated EBITDA for such period (calculated prior to giving effect to any increase pursuant to this clause (d))`;
// Clause (vii) language is verbatim from a real credit agreement in the TUNABLE corpus (CIK 1756655).
const PRIOR_PERIOD = `plus (d) expenses and charges related to prior periods in an aggregate amount not to exceed $15.0 million for any such period during the term of this Agreement`;
const SYNERGIES = `plus (d) the amount of net cost savings, synergies and operating expense reductions projected by the Borrower in good faith to be realized as a result of specified actions taken or to be taken, net of the amount of actual benefits realized during such period from such actions; provided that the aggregate amount added back pursuant to this clause (d) may not exceed 25% of Consolidated EBITDA for such period (before giving effect to such add backs)`;

describe("Consolidated EBITDA optimizer (general rules, agreement's own add-backs)", () => {
  it("real greater-of cap: evidenced restructuring above the cap is claimed only up to max($35.0M, 25% × pre-add-back EBITDA)", () => {
    const text = def(AZEK_E);
    const f = fin({ ...BASE, RestructuringCharges: 60 * M });
    // Before: the line-item evaluator reads the cap's limbs ("(i) $35.0 million", "(ii) 25.0% …") as items and refuses.
    expect(evaluateDefinition("EBITDA", "Consolidated EBITDA", text, f).status).toBe("NEEDS_INPUT");
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, f);
    const d = o.addBacks.find((a) => a.label === "(d)")!;
    expect(d.cap?.amount).toBe(String(50 * M)); // greater of 35M and 25% × 200M
    expect(d.claimed).toBe(String(50 * M));
    expect(d.status).toBe("CAPPED");
    expect(o.status).toBe("MAXIMIZED");
    expect(o.maximum).toBe(String(250 * M));
  });

  it("greater-of: fixed limb wins when 25% of EBITDA is smaller", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", def(AZEK_E), fin({ NetIncomeLoss: 10 * M, IncomeTaxExpenseBenefit: 5 * M, InterestExpense: 5 * M, DepreciationDepletionAndAmortization: 20 * M, RestructuringCharges: 60 * M }));
    expect(o.addBacks.find((a) => a.label === "(d)")!.claimed).toBe(String(35 * M));
    expect(o.maximum).toBe(String(75 * M));
  });

  it("capped add-back under the cap is claimed in full", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", def(AZEK_E), fin({ ...BASE, RestructuringCharges: 12 * M }));
    // Restructuring is evidenced, but (d) also covers integration, bonuses, etc. not in filings: remainder needs input.
    expect(o.addBacks.find((a) => a.label === "(d)")!.claimed).toBe(String(12 * M));
    expect(o.status).toBe("NEEDS_INPUT");
    expect(o.maximum).toBeNull();
    expect(o.supported).toBe(String(212 * M));
    expect(o.addBacks.find((a) => a.label === "(d)")!.headroomToCap).toBe(String(38 * M));
  });

  it("add-back not in filings → NEEDS_INPUT, never defaulted (real fixed-cap clause)", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", def(PRIOR_PERIOD), fin(BASE));
    const d = o.addBacks.find((a) => a.label === "(d)")!;
    expect(d.status).toBe("NEEDS_INPUT");
    expect(d.claimed).toBe("0");
    expect(d.cap?.amount).toBe(String(15 * M));
    expect(d.headroomToCap).toBe(String(15 * M));
    expect(o.maximum).toBeNull();
    expect(o.supported).toBe(String(200 * M));
  });

  it("run-rate synergies are never filled in; the cap bounds what input could add", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", def(SYNERGIES), fin(BASE));
    const d = o.addBacks.find((a) => a.label === "(d)")!;
    expect(d.category).toBe("RUN_RATE_SYNERGIES");
    expect(d.status).toBe("NEEDS_INPUT");
    expect(d.headroomToCap).toBe(String(50 * M));
    expect(o.status).toBe("NEEDS_INPUT");
  });

  it("'after giving effect' % cap solves x ≤ p(E0 + x)", () => {
    const text = def(`plus (d) restructuring charges; provided that the aggregate amount added back pursuant to this clause (d) shall not exceed 20% of Consolidated EBITDA for such period (calculated after giving effect to such add-backs)`);
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin({ ...BASE, RestructuringCharges: 90 * M }));
    expect(o.addBacks.find((a) => a.label === "(d)")!.claimed).toBe(String(50 * M)); // 0.2 × 200 / 0.8
    expect(o.maximum).toBe(String(250 * M));
  });

  it("shared cap across named clauses is applied once to the group", () => {
    const text = def(`plus (d) restructuring charges, not to exceed, together with amounts added pursuant to clause (e) below, 10% of Consolidated EBITDA (calculated before giving effect to such add-backs); plus (e) share-based compensation expense`);
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, fin({ ...BASE, RestructuringCharges: 15 * M, ShareBasedCompensation: 15 * M }));
    const claimed = o.addBacks.filter((a) => a.label === "(d)" || a.label === "(e)").reduce((s, a) => s + Number(a.claimed), 0);
    expect(claimed).toBe(20 * M);
    expect(o.maximum).toBe(String(220 * M));
  });

  it("uncapped evidenced add-back is claimed in full", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", def(`plus (d) share-based compensation expense`), fin({ ...BASE, ShareBasedCompensation: 7 * M }));
    expect(o.status).toBe("MAXIMIZED");
    expect(o.maximum).toBe(String(207 * M));
  });

  it("deduction not in filings keeps the whole figure NEEDS_INPUT", () => {
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", def(`plus (d) share-based compensation expense; minus (e) non-cash gains for such period`), fin({ ...BASE, ShareBasedCompensation: 7 * M }));
    expect(o.status).toBe("NEEDS_INPUT");
    expect(o.supported).toBeNull();
    expect(o.maximum).toBeNull();
  });

  it("undeterminable cap ([***]) → NEEDS_INPUT, nothing claimed", () => {
    expect(parseCap("expenses not to exceed $[***] for the applicable Test Period")?.kind).toBe("UNKNOWN");
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", def(`plus (d) restructuring charges not to exceed $[***] for the applicable Test Period`), fin({ ...BASE, RestructuringCharges: 5 * M }));
    expect(o.addBacks.find((a) => a.label === "(d)")!.claimed).toBe("0");
    expect(o.status).toBe("NEEDS_INPUT");
  });

  it("a single 10-Q is never annualized into a TTM flow", () => {
    const q: XbrlFact = { start: "2026-04-01", end: "2026-06-30", val: 5 * M, accn: "q", form: "10-Q", filed: "2026-08-01" };
    expect(ttmAt([q], "2026-06-30")).toBeNull();
  });
});
