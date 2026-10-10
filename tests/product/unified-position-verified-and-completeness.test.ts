import { describe, expect, it } from "vitest";
import { classifyCrossDocumentCompleteness } from "@/lib/product/unified-position/cross-document-completeness";
import { computeTransactionEffects } from "@/lib/product/unified-position/transaction-effects";
import { attemptVerifiedSimulate, summarizeVerifiedSimulate } from "@/lib/product/unified-position/certified-simulate-bridge";
import type { CompanyCovenantData } from "@/lib/covenant-engine";

describe("cross-document completeness", () => {
  it("does not overall-permit when other documents are untested", () => {
    const r = classifyCrossDocumentCompleteness({
      documentsOnFile: [
        { id: "ca", name: "Credit Agreement" },
        { id: "notes", name: "2029 Notes" },
      ],
      evaluated: [
        { documentId: "ca", documentName: "Credit Agreement", status: "clear", sectionRef: "§7.02" },
      ],
    });
    expect(r.verdict).toBe("NOT_FULLY_EVALUATED");
    expect(r.overallPermissionSupportable).toBe(false);
    expect(r.documentsNotTested).toBe(1);
  });

  it("reports prohibited by source when any document blocks", () => {
    const r = classifyCrossDocumentCompleteness({
      documentsOnFile: [
        { id: "ca", name: "Credit Agreement" },
        { id: "notes", name: "2029 Notes" },
      ],
      evaluated: [
        { documentId: "ca", documentName: "Credit Agreement", status: "clear" },
        {
          documentId: "notes",
          documentName: "2029 Notes",
          status: "blocked",
          sectionRef: "§4.09",
          binding: true,
        },
      ],
    });
    expect(r.verdict).toBe("PROHIBITED_BY_ONE_OR_MORE");
    expect(r.summary).toMatch(/2029 Notes/);
    expect(r.summary).toMatch(/§4\.09/);
  });

  it("permits only when every on-file document was evaluated clear", () => {
    const r = classifyCrossDocumentCompleteness({
      documentsOnFile: [{ id: "ca", name: "Credit Agreement" }],
      evaluated: [{ documentId: "ca", documentName: "Credit Agreement", status: "clear" }],
    });
    expect(r.verdict).toBe("PERMITTED_BY_ALL_APPLICABLE");
    expect(r.overallPermissionSupportable).toBe(true);
  });
});

describe("transaction effects (LEGACY pre/post)", () => {
  const data: CompanyCovenantData = {
    companyId: "fx",
    documents: [],
    provisions: [
      {
        id: "p1",
        documentId: "d1",
        code: "builder",
        basketName: "Builder Basket",
        sectionRef: "§7.06",
        formulaType: "BUILDER_BASKET",
        thresholdValue: 50,
        params: { cniSharePct: 0.5, includeEquityProceeds: true },
      },
    ],
    financials: {
      ebitda: 200,
      cash: 80,
      interestExpense: 20,
      cumulativeNetIncome: 100,
      equityProceedsSinceIssue: 40,
      assumedNewDebtRatePct: 5,
      totalDebt: 400,
      securedDebt: 300,
    },
    ledger: [],
  };

  it("shows debt incurrence raising leverage and equity contribution growing builder", () => {
    const debt = computeTransactionEffects({
      data,
      kind: "DEBT_INCURRENCE",
      amountMillions: 100,
      secured: true,
    });
    expect(debt).not.toHaveProperty("refused");
    if ("refused" in debt) return;
    expect(debt.postsToLedger).toBe(false);
    expect(debt.post.totalDebt).toBe(500);
    expect(debt.post.totalNetLeverage).toBeGreaterThan(debt.pre.totalNetLeverage!);

    const equity = computeTransactionEffects({
      data,
      kind: "ELIGIBLE_EQUITY_CONTRIBUTION",
      amountMillions: 25,
    });
    expect(equity).not.toHaveProperty("refused");
    if ("refused" in equity) return;
    expect(equity.post.equityProceedsSinceIssue).toBe(65);
    expect(equity.basketDeltas.some((b) => b.code === "builder")).toBe(true);
  });

  it("shows debt repayment reducing debt and cash", () => {
    const repay = computeTransactionEffects({
      data,
      kind: "DEBT_REPAYMENT",
      amountMillions: 50,
      secured: true,
    });
    expect(repay).not.toHaveProperty("refused");
    if ("refused" in repay) return;
    expect(repay.post.totalDebt).toBe(350);
    expect(repay.post.cash).toBe(30);
  });
});

describe("verified simulate bridge fail-closed", () => {
  it("refuses without VEP and lists precise blockers", async () => {
    const r = await attemptVerifiedSimulate({
      companyId: "no-vep-co",
      evaluationDate: "2026-06-30",
      amountMillions: 100,
      kind: "SECURED_DEBT",
      secured: true,
      verifiedPackage: null,
    });
    const s = summarizeVerifiedSimulate(r);
    expect(s.executable).toBe(false);
    expect(s.blockers).toContain("NO_VERIFIED_EXECUTION_PACKAGE");
    expect(r.certified.capacity).toBeNull();
  });
});
