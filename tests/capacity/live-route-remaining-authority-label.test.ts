/**
 * Live Position/dashboard remaining must not be presented as production-
 * authoritative utilization-adjusted AVAILABLE. LEGACY gross − amount is
 * MODELED only until trusted completeness + issuer authority are wired.
 */
import { describe, expect, it } from "vitest";
import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  type CompanyCovenantData,
  type FinancialSnapshotInput,
} from "@/lib/covenant-engine";

const FIN: FinancialSnapshotInput = {
  ebitda: 500,
  cash: 10,
  interestExpense: 50,
  cumulativeNetIncome: 0,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 6,
  totalDebt: 700,
  securedDebt: 700,
};

describe("live Position/dashboard remaining authority label", () => {
  it("computeRemainingCapacityAfterDebtIncurrence is NEVER production-authoritative utilization remaining", () => {
    const data: CompanyCovenantData = {
      companyId: "co-live-auth",
      documents: [{ id: "doc-1", name: "CA", type: "OTHER", capacityFormulas: null }],
      provisions: [],
      financials: FIN,
      ledger: [],
    };
    const position = computeCovenantPosition(data);
    const post = computeRemainingCapacityAfterDebtIncurrence(data, position, 0, true);
    expect(post.utilizationRemainingAuthority).toBe("NOT_PRODUCTION_AUTHORITATIVE");
    expect(post.packageAuthoritative?.label).toMatch(/MODELED/);
    expect(post.utilizationRemainingAuthority).not.toBe("PRODUCTION_AUTHORITATIVE");
  });
});
