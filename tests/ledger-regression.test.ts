import { describe, expect, it } from "vitest";
import {
  computeCovenantPosition,
  simulateRestrictedPayment,
  type CompanyCovenantData,
  type LedgerEntryInput,
} from "../lib/covenant-engine";

/**
 * Ledger-state regression tests, none of them all-zero-usage fixtures: these
 * prove the engine is genuinely STATEFUL with respect to ledger history, not
 * just a pure function of the current financial snapshot.
 *
 *  - capacity before vs. after a DEBIT reduces a shared basket pool,
 *  - a CREDIT entry in that same pool does NOT restore capacity (the RP pool
 *    is monotonically consumed - restrictedPaymentPoolUsed only sums DEBITs),
 *  - a basket type that DOES "replenish" - FLAT_NET_OF_DEBT recomputes fresh
 *    from the financial snapshot's gross debt outstanding every time, so a
 *    debt repayment reflected in a later snapshot increases capacity again,
 *  - a simulation drawing against a pool that already has usage only
 *    allocates what's actually left, never the pristine basket size.
 */

const DOC_ID = "ledger-regress-notes";

const BASE_FIN = {
  ebitda: 200,
  cash: 0,
  interestExpense: 20,
  cumulativeNetIncome: 0,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 5,
  totalDebt: 500,
  securedDebt: 300,
};

function makeData(ledger: LedgerEntryInput[], securedDebtOverride?: number): CompanyCovenantData {
  return {
    companyId: "ledger-regress-test",
    documents: [
      {
        id: DOC_ID,
        name: "Test Notes Indenture",
        type: "INDENTURE",
        capacityFormulas: { secured: { op: "REF", code: "flat_secured_basket" } },
        rpWaterfall: {
          steps: [{ code: "builder" }, { code: "general" }],
          ratioGateCodeByKind: { dividend: "gate_dividend", investment: "gate_investment" },
        },
      },
    ],
    provisions: [
      { id: "p1", documentId: DOC_ID, code: "flat_secured_basket", basketName: "Credit facilities basket", sectionRef: "§2.1", formulaType: "FLAT_NET_OF_DEBT", thresholdValue: 400, params: { netOfBasis: "secured" } },
      { id: "p2", documentId: DOC_ID, code: "builder", basketName: "Builder basket", sectionRef: "§3.1(a)", formulaType: "BUILDER_BASKET", thresholdValue: 50, params: { pctEbitda: 0.1 } },
      { id: "p3", documentId: DOC_ID, code: "general", basketName: "General RP basket", sectionRef: "§3.1(b)", formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", thresholdValue: 80, params: { pctEbitda: 0.2 } },
      { id: "p4", documentId: DOC_ID, code: "gate_dividend", basketName: "Ratio RP (unlimited)", sectionRef: "§3.1(c)(i)", formulaType: "RATIO_GATE", thresholdValue: 2.0, params: { debtBasis: "total" } },
      { id: "p5", documentId: DOC_ID, code: "gate_investment", basketName: "Ratio Investments (unlimited)", sectionRef: "§3.1(c)(ii)", formulaType: "RATIO_GATE", thresholdValue: 1.8, params: { debtBasis: "total" } },
    ],
    financials: { ...BASE_FIN, securedDebt: securedDebtOverride ?? BASE_FIN.securedDebt },
    ledger,
  };
}

describe("ledger state changes the engine's output, not just the current snapshot", () => {
  it("capacity before vs. after a DEBIT reduces the shared restricted-payment pool", () => {
    const before = makeData([]);
    const beforePosition = computeCovenantPosition(before);
    const beforeHeadroom = simulateRestrictedPayment(before, beforePosition, DOC_ID, 0, "dividend");
    expect(beforeHeadroom.poolUsed).toBe(0);
    expect(beforeHeadroom.stepCapacitiesRemaining["builder"]).toBeCloseTo(50, 6);
    expect(beforeHeadroom.stepCapacitiesRemaining["general"]).toBeCloseTo(80, 6);

    const after = makeData([{ basket: "DIVIDEND", amount: 30, direction: "DEBIT" }]);
    const afterPosition = computeCovenantPosition(after);
    const afterHeadroom = simulateRestrictedPayment(after, afterPosition, DOC_ID, 0, "dividend");
    expect(afterHeadroom.poolUsed).toBe(30);
    expect(afterHeadroom.stepCapacitiesRemaining["builder"]).toBeCloseTo(20, 6); // 50 - 30
    expect(afterHeadroom.stepCapacitiesRemaining["general"]).toBeCloseTo(80, 6); // untouched - builder alone covered the debit
  });

  it("a CREDIT entry in the restricted-payment pool does NOT restore capacity", () => {
    const debitOnly = makeData([{ basket: "DIVIDEND", amount: 30, direction: "DEBIT" }]);
    const debitThenCredit = makeData([
      { basket: "DIVIDEND", amount: 30, direction: "DEBIT" },
      { basket: "DIVIDEND", amount: 30, direction: "CREDIT" },
    ]);

    const posDebitOnly = computeCovenantPosition(debitOnly);
    const posDebitThenCredit = computeCovenantPosition(debitThenCredit);
    const resultDebitOnly = simulateRestrictedPayment(debitOnly, posDebitOnly, DOC_ID, 0, "dividend");
    const resultDebitThenCredit = simulateRestrictedPayment(debitThenCredit, posDebitThenCredit, DOC_ID, 0, "dividend");

    // The CREDIT changes nothing: same pool usage, same remaining capacity as DEBIT alone.
    expect(resultDebitThenCredit.poolUsed).toBe(resultDebitOnly.poolUsed);
    expect(resultDebitThenCredit.stepCapacitiesRemaining).toEqual(resultDebitOnly.stepCapacitiesRemaining);
  });

  it("a basket type that DOES permit replenishment: FLAT_NET_OF_DEBT recomputes from the latest gross debt outstanding", () => {
    const beforeRepayment = makeData([], 300);
    const afterRepayment = makeData([], 150); // a later financial snapshot reflecting a $150M paydown

    const capBefore = computeCovenantPosition(beforeRepayment).provisionCapacities.get(`${DOC_ID}:flat_secured_basket`)!;
    const capAfter = computeCovenantPosition(afterRepayment).provisionCapacities.get(`${DOC_ID}:flat_secured_basket`)!;

    expect(capBefore.capacity).toBeCloseTo(100, 6); // 400 - 300
    expect(capAfter.capacity).toBeCloseTo(250, 6); // 400 - 150 - capacity replenished as debt was repaid
    expect(capAfter.capacity!).toBeGreaterThan(capBefore.capacity!);
  });

  it("a simulation against an already-partially-used pool only allocates what's actually left", () => {
    const data = makeData([{ basket: "DIVIDEND", amount: 30, direction: "DEBIT" }]);
    const position = computeCovenantPosition(data);

    // Builder is pristine 50 but already has 30 consumed, leaving only 20 - a
    // $60M draw must NOT allocate the full pristine 50 to builder.
    const draw = simulateRestrictedPayment(data, position, DOC_ID, 60, "dividend");
    expect(draw.status).toBe("clear");
    expect(draw.steps).toEqual([
      { code: "builder", basketName: "Builder basket", sectionRef: "§3.1(a)", allocated: 20 },
      { code: "general", basketName: "General RP basket", sectionRef: "§3.1(b)", allocated: 40 },
    ]);
  });
});
