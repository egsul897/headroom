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

describe("Rule 190: legacy remaining capacity is capped by the maintenance-ratio ceiling", () => {
  function dataWith(extraProvisions: Array<Record<string, unknown>>) {
    const data: CompanyCovenantData = {
      companyId: "co-rule190",
      documents: [{
        id: "doc-1", name: "CA", type: "OTHER",
        capacityFormulas: {
          secured: { op: "REF", code: "BASKET" },
          unsecured: { op: "REF", code: "BASKET" },
        },
      }],
      provisions: [
        { id: "p-basket", documentId: "doc-1", code: "BASKET", basketName: "General debt", sectionRef: "6.16", formulaType: "FLAT_AMOUNT", thresholdValue: 1000, params: {} },
        ...extraProvisions,
      ] as never,
      financials: FIN,
      ledger: [],
    };
    return data;
  }
  const leverage = (threshold: number, debtBasis: "secured" | "total" = "total") => ({
    id: "p-ratio", documentId: "doc-1", code: "RATIO", basketName: "Leverage (maintenance)", sectionRef: "6.14",
    formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: threshold, params: { debtBasis },
  });
  const coverage = (threshold: number) => ({
    id: "p-cov", documentId: "doc-1", code: "RATIO", basketName: "Coverage (maintenance)", sectionRef: "6.14",
    formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: threshold, params: {},
  });

  it("a binding leverage test caps legacy remaining at the ratio ceiling", () => {
    // Ceiling: (700 + A - 10) / 500 <= 2.0  =>  A <= 310. Basket is 1000.
    const data = dataWith([leverage(2.0)]);
    const post = computeRemainingCapacityAfterDebtIncurrence(data, computeCovenantPosition(data), 0, false);
    expect(post.remainingCapacity).toBeCloseTo(310, 6);
    expect(post.perDocument[0]!.remainingCapacity).toBeCloseTo(310, 6);
  });

  it("a non-binding test leaves legacy remaining alone", () => {
    // Ceiling: 4.0 => A <= 1310 > 1000 basket.
    const data = dataWith([leverage(4.0)]);
    const post = computeRemainingCapacityAfterDebtIncurrence(data, computeCovenantPosition(data), 0, false);
    expect(post.remainingCapacity).toBeCloseTo(1000, 6);
  });

  it("an unevaluable coverage test (zero rate) voids the legacy figure", () => {
    const data = dataWith([coverage(2.5)]);
    const post = computeRemainingCapacityAfterDebtIncurrence(
      { ...data, financials: { ...FIN, assumedNewDebtRatePct: 0 } },
      computeCovenantPosition({ ...data, financials: { ...FIN, assumedNewDebtRatePct: 0 } }),
      0, false,
    );
    expect(post.remainingCapacity).toBeUndefined();
    expect(post.perDocument[0]!.method).toBe("NOT_DETERMINABLE");
  });

  it("an already-breached maintenance test caps legacy remaining at zero", () => {
    // Pre-ratio (700 - 10)/500 = 1.38 > 1.0: no new debt is ratio-safe.
    const data = dataWith([leverage(1.0)]);
    const post = computeRemainingCapacityAfterDebtIncurrence(data, computeCovenantPosition(data), 0, false);
    expect(post.remainingCapacity).toBeCloseTo(0, 6);
  });

  it("a secured-basis test does not cap an unsecured deal", () => {
    const data = dataWith([leverage(1.0, "secured")]);
    const post = computeRemainingCapacityAfterDebtIncurrence(data, computeCovenantPosition(data), 0, false);
    expect(post.remainingCapacity).toBeCloseTo(1000, 6);
  });

  it("remaining after a transaction respects the ceiling net of the tested amount", () => {
    // Ceiling 310; after incurring 100, remaining ratio room is 210.
    const data = dataWith([leverage(2.0)]);
    const post = computeRemainingCapacityAfterDebtIncurrence(data, computeCovenantPosition(data), 100, false);
    expect(post.remainingCapacity).toBeCloseTo(210, 6);
  });
});
