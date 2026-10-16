import { describe, expect, it } from "vitest";
import { findDefinitionText, definitionSegments } from "@/lib/covenant-learning-factory/xbrl/definition-items";
import { optimizeConsolidatedEbitda } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (items: Record<string, number>): IssuerFinancials => ({
  cik: "0000000001", entityName: "Test Borrower", missing: [], anchor: "2026-06-30",
  values: Object.entries(items).map(([concept, v]) => ({
    metric: "item", concept, periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30",
    value: String(v), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test",
  })),
});

/**
 * Real Consolidated EBITDA schedules routinely run 8k–25k characters before the next defined term.
 * findDefinitionText used to look only 8k ahead and, when the next term was past that window, fall
 * back to a hard 3000-character cut — dropping later add-backs and making maxima untrustworthy.
 */
function longEbitdaDefinition(bodyChars: number): string {
  const cni = `"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP. `;
  const head =
    `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: ` +
    `(a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus `;
  const mid =
    `(d) restructuring charges, business optimization expenses, relocation costs, integration costs, severance, one-time compensation charges, and similar items; provided that the aggregate amount added back pursuant to this clause (d) shall not exceed the greater of (i) $35.0 million and (ii) 25.0% of Consolidated EBITDA for such period (calculated prior to giving effect to any increase pursuant to this clause (d)); plus `;
  // Pad with repeating legalistic filler that is not a new defined-term opener, so length is controlled.
  const padUnit =
    "including without limitation costs and expenses related to facility consolidations, line-of-business exits, strategic initiatives, and personnel relocation in the ordinary course of evaluating the Borrower's operating performance, ";
  let pad = "";
  while (head.length + mid.length + pad.length < bodyChars) pad += padUnit;
  const late =
    `(e) non-cash share-based compensation expense. `;
  const next = `"Consolidated Interest Expense" means, for any period, the interest expense of the Borrower. `;
  return cni + head + mid + pad + late + next;
}

describe("findDefinitionText: long Consolidated EBITDA definitions are not truncated", () => {
  it("keeps the full definition through a late add-back when the next term is past 8k / 3k", () => {
    // Target body ~12k so both the old 3000 fallback and the old 8000 look-ahead miss the end.
    const text = longEbitdaDefinition(12_000);
    const def = findDefinitionText(text, "Consolidated EBITDA");
    expect(def).not.toBeNull();
    expect(def!.length).toBeGreaterThan(8_000);
    expect(def!).toContain("non-cash share-based compensation expense");
    expect(def!).not.toContain("Consolidated Interest Expense");
    const segs = definitionSegments("EBITDA", "Consolidated EBITDA", text)!;
    expect(segs.some((s) => s.label === "(e)" && /share-based compensation/i.test(s.text))).toBe(true);
  });

  it("optimizer claims the late evidenced add-back that a 3000-char cut would drop", () => {
    const text = longEbitdaDefinition(12_000);
    const f = fin({
      NetIncomeLoss: 100 * M,
      IncomeTaxExpenseBenefit: 20 * M,
      InterestExpense: 30 * M,
      DepreciationDepletionAndAmortization: 50 * M,
      RestructuringCharges: 10 * M,
      ShareBasedCompensation: 7 * M,
    });
    const o = optimizeConsolidatedEbitda("Consolidated EBITDA", text, f);
    const e = o.addBacks.find((a) => a.label === "(e)");
    expect(e).toBeDefined();
    expect(e!.claimed).toBe(String(7 * M));
    // Without inventing the remainder of (d)'s unevidenced categories, status may be NEEDS_INPUT,
    // but the late SBC line must still be present and claimed — proving the definition was whole.
    expect(Number(o.supported ?? o.maximum ?? 0)).toBeGreaterThanOrEqual(200 * M + 7 * M);
  });
});

import { findDefinition } from "@/lib/covenant-learning-factory/xbrl/bind";

describe("bind.findDefinition: long definitions are not truncated at 2.5k/6k", () => {
  it("keeps the full definition through a late clause when the next term is past 6k", () => {
    const padUnit =
      "including without limitation costs related to facility consolidations, strategic initiatives, and personnel relocation in evaluating operating performance, ";
    let pad = "";
    while (pad.length < 7_000) pad += padUnit;
    const text =
      `"Consolidated Total Assets" means the total assets of the Borrower and its Restricted Subsidiaries on a consolidated basis: (a) cash and cash equivalents; plus (b) accounts receivable; plus ` +
      pad +
      `(c) property plant and equipment net of accumulated depreciation. ` +
      `"Default" means any event.`;
    const def = findDefinition(text, "Consolidated Total Assets");
    expect(def).not.toBeNull();
    expect(def!.length).toBeGreaterThan(6_000);
    expect(def!).toContain("property plant and equipment");
    expect(def!).not.toContain('"Default"');
  });
});
