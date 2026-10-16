import { describe, expect, it } from "vitest";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (debt = 600 * M, lowerBound = false): IssuerFinancials => ({
  cik: "0000000001", entityName: "Test Borrower", missing: [], anchor: "2026-06-30",
  values: [
    ...Object.entries({
      NetIncomeLoss: 100 * M,
      IncomeTaxExpenseBenefit: 20 * M,
      InterestExpense: 30 * M,
      DepreciationDepletionAndAmortization: 50 * M,
    }).map(([concept, v]) => ({
      metric: "item" as const, concept, periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30",
      value: String(v), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test",
    })),
    {
      metric: "totalDebt", concept: "LongTermDebt", periodType: "instant", periodStart: null as unknown as string,
      periodEnd: "2026-06-30", value: String(debt), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01",
      derivation: lowerBound ? "lower bound from long-term debt" : "exact",
    },
  ],
});

const DOC = `
ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense.
"Consolidated Total Debt" means the consolidated Indebtedness of the Borrower.
"Consolidated Total Leverage Ratio" means the ratio of Consolidated Total Debt to Consolidated EBITDA.
"Default" means any event of default.

ARTICLE VI FINANCIAL COVENANTS
Section 6.01 Consolidated Total Leverage Ratio. The Borrower will not permit the Consolidated Total Leverage Ratio as of the last day of any fiscal quarter to exceed 4.50 to 1.00.

ARTICLE VII NEGATIVE COVENANTS
Section 7.01 Indebtedness. The Borrower will not incur Indebtedness except Indebtedness under this Agreement and other Indebtedness not exceeding $10,000,000.
`;

describe("pipeline: Consolidated EBITDA optimizer → leverage debt capacity", () => {
  it("with one total-leverage MAX and determinable debt: capacity = 4.5 × maximized EBITDA − debt", () => {
    const r = runAgreementPipeline({ sourceId: "t", text: DOC, financials: fin() });
    expect(r.xbrl?.ebitda?.status).toBe("MAXIMIZED");
    expect(r.xbrl?.ebitda?.maximum).toBe(String(200 * M));
    // 4.5 × 200M − 600M = 300M
    expect(r.xbrl?.leverageCapacity).toMatchObject({
      status: "COMPUTED",
      ebitdaBasis: "MAXIMUM",
      ebitda: String(200 * M),
      maxLeverage: "4.5",
      debt: String(600 * M),
      capacity: String(300 * M),
      bound: "EXACT",
    });
  });

  it("no financials → no capacity; ambiguous second total-leverage limit → no capacity call", () => {
    expect(runAgreementPipeline({ sourceId: "t", text: DOC }).xbrl).toBeUndefined();
    const two = DOC + `\nSection 6.02 Net Leverage. The Borrower will not permit the Net Leverage Ratio to exceed 5.00 to 1.00.\n`;
    const r = runAgreementPipeline({ sourceId: "t", text: two, financials: fin() });
    expect(r.xbrl?.ebitda?.maximum).toBe(String(200 * M));
    expect(r.xbrl?.leverageCapacity).toBeUndefined();
  });

  it("lower-bound debt keeps capacity NEEDS_INPUT (never overstates room)", () => {
    const r = runAgreementPipeline({ sourceId: "t", text: DOC, financials: fin(600 * M, true) });
    expect(r.xbrl?.leverageCapacity?.status).toBe("NEEDS_INPUT");
    expect(r.xbrl?.leverageCapacity?.capacity).toBeNull();
  });
});
