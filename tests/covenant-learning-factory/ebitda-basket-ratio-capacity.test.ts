import { describe, expect, it } from "vitest";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";
import { decide } from "@/lib/covenant-learning-factory/xbrl/bind";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (extra: Record<string, number> = {}): IssuerFinancials => ({
  cik: "0000000001", entityName: "Test Borrower", missing: [], anchor: "2026-06-30",
  values: [
    ...Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M, ...extra }).map(([concept, v]) => ({
      metric: "item" as const, concept, periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30",
      value: String(v), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test",
    })),
    { metric: "interestExpense", concept: "InterestExpense", periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(30 * M), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" },
  ],
});

// Schedule with a capped add-back: the strict line-item evaluator cannot size it, the optimizer can (cap applied).
const SCHED_CAPPED = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) restructuring charges in an aggregate amount not to exceed $5,000,000 for any period.`;
// Schedule with an unevidenced one-sided add-back: optimizer supported floor (lower bound).
const SCHED_OPEN = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) transaction costs and expenses incurred in connection with any acquisition.`;
// Schedule with a two-sided line: no bound (a lower bound would not be safe).
const SCHED_TWO = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) gains or losses on foreign currency translation.`;

const doc = (sched: string, covenants: string) => `
ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
${sched}
"Consolidated Interest Expense" means consolidated interest expense of the Borrower and its Subsidiaries determined in accordance with GAAP.
"Consolidated Interest Coverage Ratio" means the ratio of Consolidated EBITDA to Consolidated Interest Expense.
"Default" means any event of default.

ARTICLE VII NEGATIVE COVENANTS
${covenants}
`;

const GROWER = `Section 7.01 Indebtedness. The Borrower will not incur Indebtedness except (a) Indebtedness under this Agreement; and (b) other Indebtedness in an aggregate principal amount not to exceed the greater of $10,000,000 and 50% of Consolidated EBITDA for the most recently ended four fiscal quarters.`;

describe("EBITDA optimizer → metric decision (exact / at-least / needs input)", () => {
  it("capped schedule: optimizer MAXIMUM binds EBITDA exactly", () => {
    const d = decide("Consolidated EBITDA", doc(SCHED_CAPPED, ""), fin({ RestructuringCharges: 8 * M }));
    expect(d.status).toBe("BOUND");
    expect(d.input?.value).toBe(String(205 * M)); // 200 + min(8, cap 5)
  });
  it("open one-sided add-back: supported floor binds as LOWER_BOUND", () => {
    const d = decide("Consolidated EBITDA", doc(SCHED_OPEN, ""), fin());
    expect(d.status).toBe("LOWER_BOUND");
    expect(d.input?.value).toBe(String(200 * M));
  });
  it("two-sided omitted line: no bound (NEEDS_INPUT)", () => {
    const d = decide("Consolidated EBITDA", doc(SCHED_TWO, ""), fin());
    expect(d.status).toBe("NEEDS_INPUT");
  });
});

describe("grower basket sized from optimizer EBITDA", () => {
  const grower = (sched: string, f: IssuerFinancials) => {
    const r = runAgreementPipeline({ sourceId: "t", text: doc(sched, GROWER), financials: f });
    const b = r.computedBaskets.find((x) => /greater\s+of/i.test(x.citationExcerpt))!;
    const bound = r.xbrl?.bounds.find((x) => x.stableKey === b.stableKey)?.kind ?? (b.capStatus === "COMPUTED" ? "EXACT" : null);
    return { b, bound };
  };
  it("MAXIMUM EBITDA → EXACT cap = greater of $10M and 50% × 205M", () => {
    const { b, bound } = grower(SCHED_CAPPED, fin({ RestructuringCharges: 8 * M }));
    expect(b.capStatus).toBe("COMPUTED");
    expect(Number(b.capCanonical)).toBe(102.5 * M);
    expect(bound).toBe("EXACT");
  });
  it("SUPPORTED EBITDA → AT_LEAST cap", () => {
    const { b, bound } = grower(SCHED_OPEN, fin());
    expect(b.capStatus).toBe("COMPUTED");
    expect(Number(b.capCanonical)).toBe(100 * M);
    expect(bound).toBe("AT_LEAST");
  });
  it("two-sided schedule → EBITDA limb stays NEEDS_INPUT (only the fixed $10M floor, AT_LEAST)", () => {
    const { b } = grower(SCHED_TWO, fin());
    expect(b.capCanonical).toBe(String(10 * M));
    expect(b.capBound).toBe("AT_LEAST");
    expect(b.missingInputs).toContain("Consolidated EBITDA");
  });
});

describe("incurrence-ratio capacity", () => {
  const COV = `Section 7.02 Restricted Payments. The Borrower will not make any Restricted Payment unless, after giving pro forma effect thereto, the Consolidated Interest Coverage Ratio would be at least 2.00 to 1.00.`;
  it("coverage: EBITDA / 2.0 − interest, EXACT with MAXIMUM EBITDA", () => {
    const r = runAgreementPipeline({ sourceId: "t", text: doc(SCHED_CAPPED, COV), financials: fin({ RestructuringCharges: 8 * M }) });
    const c = r.xbrl?.ratioCapacity?.find((x) => x.kind === "COVERAGE");
    expect(c).toMatchObject({ status: "COMPUTED", limit: "2", capacityOf: "INTEREST_EXPENSE", bound: "EXACT", capacity: String(205 * M / 2 - 30 * M) });
  });
  it("coverage with supported EBITDA → AT_LEAST", () => {
    const r = runAgreementPipeline({ sourceId: "t", text: doc(SCHED_OPEN, COV), financials: fin() });
    expect(r.xbrl?.ratioCapacity?.find((x) => x.kind === "COVERAGE")).toMatchObject({ status: "COMPUTED", bound: "AT_LEAST", capacity: String(70 * M) });
  });
  it("two different coverage limits → refused", () => {
    const two = COV + `\nSection 7.03 Investments. The Borrower will not make any Investment unless the Consolidated Interest Coverage Ratio would be at least 2.50 to 1.00.`;
    const r = runAgreementPipeline({ sourceId: "t", text: doc(SCHED_CAPPED, two), financials: fin({ RestructuringCharges: 8 * M }) });
    const c = r.xbrl?.ratioCapacity?.find((x) => x.kind === "COVERAGE");
    expect(c?.status).toBe("NEEDS_INPUT");
    expect(c?.capacity).toBeNull();
  });
});

describe("gross interest add-back with no XBRL interest is one-sided (safe lower bound)", () => {
  const text = `"Consolidated Net Income" means the net income of the Borrower. ` +
    `"Consolidated Interest Expense" means, for any period, the gross interest expense of the Borrower and its Subsidiaries deducted in the calculation of Consolidated Net Income, determined in accordance with GAAP. ` +
    `"Consolidated EBITDA" means, for any period, Consolidated Net Income plus, to the extent deducted: (i) Consolidated Interest Expense for such period; (ii) income tax expense for such period; plus (iii) depreciation and amortization. "Default" means any event.`;
  const noIe = (): IssuerFinancials => ({ ...fin(), values: fin().values.filter((v) => !/Interest/i.test(v.concept)) });
  it("decide binds the supported floor as LOWER_BOUND", () => {
    const d = decide("Consolidated EBITDA", text, noIe());
    expect(d.status).toBe("LOWER_BOUND");
    expect(d.input?.value).toBe(String(170 * M));
  });
  it("net-of-interest-income definition stays two-sided (NEEDS_INPUT)", () => {
    const net = text.replace("the gross interest expense", "interest expense net of interest income");
    expect(decide("Consolidated EBITDA", net, noIe()).status).toBe("NEEDS_INPUT");
  });
});

describe("ratio operands parsed from the ratio's own definition", () => {
  const SCHED = `"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) restructuring charges in an aggregate amount not to exceed $5,000,000 for any period.`;
  const text = `
ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
${SCHED}
"Consolidated Cash Interest Charges" means consolidated interest expense of the Borrower and its Subsidiaries determined in accordance with GAAP.
"Consolidated Fixed Coverage Ratio" means, as of any date, the ratio of (a) Consolidated EBITDA to (b) Consolidated Cash Interest Charges, in each case for the most recent four fiscal quarters.
"Default" means any event of default.

ARTICLE VII NEGATIVE COVENANTS
Section 7.02 Restricted Payments. The Borrower will not make any Restricted Payment unless the Consolidated Fixed Coverage Ratio would be at least 3.00 to 1.00.
`;
  it("non-catalog coverage ratio gets operands from its definition and a capacity", () => {
    const r = runAgreementPipeline({ sourceId: "t", text, financials: fin({ RestructuringCharges: 8 * M }) });
    const c = r.xbrl?.ratioCapacity?.find((x) => x.name === "Consolidated Fixed Coverage Ratio");
    expect(c).toBeDefined();
    expect(c?.limit).toBe("3");
  });
});

describe("two-sided lines signed from exact filed figures", () => {
  const S = (line: string) => `"Consolidated Net Income" means the net income of the Borrower. "Consolidated EBITDA" means, for any period, Consolidated Net Income plus, to the extent deducted: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense; plus (d) ${line}. "Default" means any event.`;
  it("REIT excluding-list: equity in net income (loss) of Joint Ventures = −equity-method income (exact)", () => {
    const text = `"Consolidated EBITDA" means, with respect to a Person for any period and without duplication, the sum of: (1) net income (loss) of such Person for such period determined on a consolidated basis excluding the following (but only to the extent included in determining net income (loss) for such period): (A) depreciation and amortization; (B) interest expense; (C) income tax expense; and (F) equity in net income (loss) of its Joint Ventures. "Default" means any event.`;
    const d = decide("Consolidated EBITDA", text, fin({ IncomeLossFromEquityMethodInvestments: 15 * M }));
    expect(d.status).toBe("BOUND");
    expect(d.input?.value).toBe(String(185 * M));
  });
  it("same line with no filed equity-method figure stays NEEDS_INPUT", () => {
    const text = `"Consolidated EBITDA" means, with respect to a Person for any period and without duplication, the sum of: (1) net income (loss) of such Person for such period determined on a consolidated basis excluding the following (but only to the extent included in determining net income (loss) for such period): (A) depreciation and amortization; (B) interest expense; (C) income tax expense; and (F) equity in net income (loss) of its Joint Ventures. "Default" means any event.`;
    expect(decide("Consolidated EBITDA", text, fin()).status).toBe("NEEDS_INPUT");
  });
  it("FX losses-only line: a net filed gain adds 0; a net loss adds the loss", () => {
    const line = "losses arising from fluctuations in foreign currency exchange rates for such period";
    expect(decide("Consolidated EBITDA", S(line), fin({ ForeignCurrencyTransactionGainLossBeforeTax: 4 * M })).input?.value).toBe(String(200 * M));
    expect(decide("Consolidated EBITDA", S(line), fin({ ForeignCurrencyTransactionGainLossBeforeTax: -4 * M })).input?.value).toBe(String(204 * M));
  });
  it("FX gains-or-losses line signed exactly; absent fact → NEEDS_INPUT", () => {
    const line = "gains or losses on foreign currency transactions";
    expect(decide("Consolidated EBITDA", S(line), fin({ ForeignCurrencyTransactionGainLossBeforeTax: 4 * M })).input?.value).toBe(String(196 * M));
    expect(decide("Consolidated EBITDA", S(line), fin()).status).toBe("NEEDS_INPUT");
  });
});
