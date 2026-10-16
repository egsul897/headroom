import { describe, expect, it } from "vitest";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";
import { borrowerInputKeysFromText } from "@/lib/covenant-learning-factory/xbrl/ebitda-optimizer";

const fin = (): IssuerFinancials => ({
  cik: "0001026655", entityName: "t", missing: [], anchor: "2026-06-30",
  values: [
    { metric: "item", concept: "NetIncomeLoss", periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30", value: "100", unit: "USD", accession: "x", form: "10-Q", filed: "2026-08-01", derivation: "test" },
  ],
});

describe("amendment→base HOLD when EBITDA schedule is not in-text", () => {
  it("surfaces named dated base; never invents a definition", () => {
    const text =
      `FIRST AMENDMENT TO CREDIT AGREEMENT\n` +
      `THIS FIRST AMENDMENT TO CREDIT AGREEMENT (this "Amendment"), dated as of March 7, 2024, ` +
      `to the Credit Agreement dated as of July 22, 2022 (the "Credit Agreement"), ` +
      `by and among CORE MOLDING TECHNOLOGIES, INC., as Borrower.\n` +
      `Section 1. Defined Terms. Capitalized terms used herein have the meanings assigned in the Credit Agreement.\n` +
      `Section 2. Amendment. Section 6.01 of the Credit Agreement is hereby amended to replace "3.50" with "3.75".\n`;
    const r = runAgreementPipeline({ sourceId: "test:amend", text, issuerCik: "1026655", financials: fin() });
    expect(r.xbrl?.ebitda).toBeUndefined();
    expect(r.xbrl?.ebitdaBaseHold?.reason).toBe("AMENDMENT_NEEDS_BASE_TEXT");
    expect(r.xbrl?.ebitdaBaseHold?.namedBase).toMatch(/Credit Agreement.*July 22, 2022/i);
    expect(r.xbrl?.ebitdaBaseHold?.missing).toMatch(/not in package/i);
  });

  it("borrowerInputKeysFromText extracts CNI keys fail-closed", () => {
    expect(borrowerInputKeysFromText('excludes X (borrower input CNI:NON_RECURRING or CNI:(a) accepted)')).toEqual(
      expect.arrayContaining(["CNI:NON_RECURRING", "CNI:(a)"]),
    );
    expect(borrowerInputKeysFromText("no keys here")).toEqual([]);
  });
});
