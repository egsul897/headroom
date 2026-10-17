import { describe, expect, it } from "vitest";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const M = 1_000_000;
const fin = (): IssuerFinancials => ({
  cik: "0000000001", entityName: "t", missing: [], anchor: "2026-06-30",
  values: Object.entries({ NetIncomeLoss: 100 * M, IncomeTaxExpenseBenefit: 20 * M, InterestExpense: 30 * M, DepreciationDepletionAndAmortization: 50 * M }).map(([concept, v]) => ({
    metric: "item" as const, concept, periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30", value: String(v), unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test",
  })),
});
const BASE = `CREDIT AGREEMENT dated as of May 1, 2024 among Acme Corp., as Borrower, the Lenders party hereto and Big Bank, N.A., as Administrative Agent.
ARTICLE I DEFINITIONS
"Consolidated Net Income" means the net income of the Borrower and its Subsidiaries determined on a consolidated basis in accordance with GAAP.
"Consolidated EBITDA" means, for any period, Consolidated Net Income for such period plus, without duplication and to the extent deducted in calculating Consolidated Net Income: (a) provision for taxes based on income; plus (b) interest expense; plus (c) depreciation and amortization expense.
"Default" means any event of default.`;
const AMEND = (date: string, body = `Section 7.01 of the Credit Agreement is hereby amended by replacing "$10,000,000" with "$20,000,000".`) =>
  `FIRST AMENDMENT TO CREDIT AGREEMENT\nThis FIRST AMENDMENT TO CREDIT AGREEMENT (this "Amendment"), dated as of June 3, 2025, is entered into among Acme Corp., the Lenders and Big Bank, N.A. and amends that certain Credit Agreement, dated as of ${date} (the "Credit Agreement").\nSection 1. Amendments. ${body}`;
const RECITAL = `FIRST AMENDMENT TO CREDIT AGREEMENT\nThis FIRST AMENDMENT dated as of June 3, 2025 among Acme Corp. and Big Bank.\nRECITALS\nWHEREAS, the parties entered into that certain Credit Agreement, dated as of May 1, 2024 (the "Credit Agreement");\nSection 1. Amendments. Section 7.01 of the Credit Agreement is hereby amended.`;
const run = (text: string) => runAgreementPipeline({ sourceId: "amend", text, financials: fin(), baseDocuments: [{ documentId: "base", text: BASE }] });

describe("amendment → base EBITDA binding tiers", () => {
  it("RESOLVED link → CONFIRMED tier, EBITDA from base", () => {
    const r = run(AMEND("May 1, 2024"));
    expect(r.xbrl?.ebitdaBinding?.tier).toBe("CONFIRMED");
    expect(r.xbrl?.ebitda?.maximum).toBe(String(200 * M));
    expect(r.xbrl?.ebitda?.bindingTier).toBe("CONFIRMED");
  });
  it("REVIEW_REQUIRED link (date mismatch) → LOWER_CONFIDENCE tier propagated to the optimizer result", () => {
    const r = run(AMEND("May 9, 2024"));
    expect(r.xbrl?.ebitdaBinding?.tier).toBe("LOWER_CONFIDENCE");
    expect(r.xbrl?.ebitda?.bindingTier).toBe("LOWER_CONFIDENCE");
    expect(r.xbrl?.ebitda?.maximum).toBe(String(200 * M));
  });
  it("recital-only (UNRESOLVED) link stays unbound", () => {
    const r = run(RECITAL);
    expect(r.xbrl?.ebitda).toBeUndefined();
    expect(r.xbrl?.ebitdaBinding).toBeUndefined();
    expect(r.xbrl?.ebitdaBaseHold?.reason).toBe("BASE_NOT_BOUND");
  });
  it("amendment rewriting the EBITDA definition stays HOLD", () => {
    const r = run(AMEND("May 1, 2024", `The definition of "Consolidated EBITDA" in Section 1.01 of the Credit Agreement is hereby amended and restated.`));
    expect(r.xbrl?.ebitda).toBeUndefined();
    expect(r.xbrl?.ebitdaBaseHold?.reason).toBe("AMENDED_DEFINITION");
  });
});
