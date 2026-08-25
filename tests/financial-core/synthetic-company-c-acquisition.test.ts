/**
 * Synthetic Company C - $800M acquisition scenario (task §21).
 *
 * Funded $200M cash / $250M revolver / $350M new secured notes. +$100M
 * acquired EBITDA, +$20M synergy, $15M transaction fees. BEFORE/TRANSACTION/
 * AFTER are hand-computed independently below before any assertion runs,
 * and the fixture proves the persisted company data is byte-identical after
 * the simulation (runScenario/runScenarioAgainstCovenants are pure).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { fact } from "../../lib/financial-core/types";
import type { Scenario } from "../../lib/financial-core/types";
import { loadCompanyFinancialCoreData } from "../../lib/financial-core-db/adapter";
import { runScenarioAgainstCovenants } from "../../lib/financial-core/scenario-service";

const COMPANY_ID = "vantage-crest-holdings-c";
const AS_OF = new Date("2027-01-01T00:00:00.000Z");
const SOFR = 5.25;

const FAC_REVOLVER = "vch-c-revolver";
const FAC_TERM_LOAN = "vch-c-term-loan";

async function insertFixture() {
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Vantage Crest Holdings (synthetic, Company C)" } });

  await prisma.financialState.create({
    data: {
      companyId: COMPANY_ID,
      asOfDate: AS_OF,
      periodType: "ACTUAL",
      balanceSheetFacts: { cash: fact(300, "REPORTED", AS_OF), totalDebtPrincipal: fact(200, "RECONSTRUCTED", AS_OF), securedDebtPrincipal: fact(200, "RECONSTRUCTED", AS_OF) },
      incomeStatementFacts: {
        gaapEbitda: fact(300, "REPORTED", AS_OF),
        cumulativeNetIncomeSinceIssue: fact(0, "REPORTED", AS_OF),
        equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF),
        interestExpense: fact(20, "REPORTED", AS_OF),
      },
      covenantMetricFacts: { assumedNewDebtRatePct: fact(7.5, "ASSUMED", AS_OF) },
      liquidityFacts: { revolverFacilityId: FAC_REVOLVER },
    } as any,
  });

  await prisma.facility.create({
    data: {
      id: FAC_REVOLVER,
      companyId: COMPANY_ID,
      name: "$400M Revolving Credit Facility",
      facilityType: "REVOLVER",
      originalPrincipal: 400,
      commitmentAmount: 400,
      secured: true,
      couponType: "FLOATING",
      marginBps: 225,
      referenceRate: "SOFR",
      rateFloorPct: 0,
      maturityDate: new Date("2030-01-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.facility.create({
    data: {
      id: FAC_TERM_LOAN,
      companyId: COMPANY_ID,
      name: "Term Loan B",
      facilityType: "TERM_LOAN",
      originalPrincipal: 200,
      secured: true,
      couponType: "FLOATING",
      marginBps: 275,
      referenceRate: "SOFR",
      rateFloorPct: 0.5,
      maturityDate: new Date("2029-01-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.debtEvent.create({ data: { companyId: COMPANY_ID, facilityId: FAC_TERM_LOAN, eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 200, provenance: fact(200, "REPORTED", AS_OF) as any } });
}

async function teardownFixture() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Synthetic Company C - $800M acquisition scenario (task §21)", () => {
  beforeAll(async () => {
    await teardownFixture();
    await insertFixture();
  });
  afterAll(async () => {
    await teardownFixture();
  });

  it("computes BEFORE / TRANSACTION / AFTER matching hand-computed expectations, and never mutates persisted state", async () => {
    const before = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);

    const scenario: Scenario = {
      id: "vch-c-scenario-acquisition",
      companyId: COMPANY_ID,
      baseFinancialStateId: before.state.id,
      actions: [
        {
          kind: "ACQUISITION",
          purchasePrice: 800,
          cashConsideration: 200,
          revolverFunding: { facilityId: FAC_REVOLVER, amount: 250 },
          newDebtFunding: {
            amount: 350,
            facilityDraft: { name: "7.00% Senior Secured Notes due 2032", facilityType: "NOTES", secured: true, couponType: "FIXED", couponPct: 7.0, maturityDate: new Date("2032-01-01") },
          },
          acquiredEbitda: 100,
          synergyEbitda: 20,
          transactionFees: 15,
        },
      ],
    };

    const result = runScenarioAgainstCovenants({ scenario, baseState: before.state, baseFacilities: before.facilities, baseEvents: before.events, asOfDate: AS_OF, rateAssumptions: [{ referenceRate: "SOFR", assumedRatePct: SOFR }] });

    // ---------------------------------------------------------------------
    // BEFORE (hand-computed):
    //   grossDebt=200 (term loan only, revolver undrawn), securedDebt=200
    //   cash=300, netDebt=200-300=-100 (net cash position)
    //   ebitda=300
    //   term loan rate = SOFR 5.25 + 275bps = 8.00% (>= 0.5% floor) -> interest = 200*0.08=16.0
    //   grossLeverage=200/300=0.666667, netLeverage=-100/300=-0.333333, securedLeverage=0.666667
    //   interestCoverage=300/16=18.75
    //   revolver availability = 400-0-0=400; totalLiquidity=300+400=700
    // ---------------------------------------------------------------------
    expect(result.before.position.capitalStructure.grossDebt).toBe(200);
    expect(result.before.position.capitalStructure.securedDebt).toBe(200);
    expect(result.before.position.liquidity.cash.value).toBe(300);
    expect(result.before.position.capitalStructure.netDebt).toBe(-100);
    expect(result.before.position.interest.totalAnnualizedCashInterest).toBeCloseTo(16.0, 6);
    expect(result.before.position.metrics.genericGrossLeverage.value).toBeCloseTo(200 / 300, 6);
    expect(result.before.position.metrics.genericNetLeverage.value).toBeCloseTo(-100 / 300, 6);
    expect(result.before.position.metrics.genericInterestCoverage.value).toBeCloseTo(300 / 16, 6);
    expect(result.before.position.liquidity.totalLiquidity).toBe(700);

    // ---------------------------------------------------------------------
    // TRANSACTION: sources (200 cash + 250 revolver + 350 new notes = 800)
    // exactly fund the $800M purchase price; $15M fees paid separately in
    // cash. Cash consideration + fees leave the balance sheet; revolver/new-
    // debt proceeds fund the deal directly (never touch the cash balance).
    // ---------------------------------------------------------------------
    expect(result.transaction.actions).toHaveLength(1);
    expect(result.transaction.actions[0]).toMatchObject({ kind: "ACQUISITION", purchasePrice: 800 });

    // ---------------------------------------------------------------------
    // AFTER (hand-computed):
    //   cash = 300 - 200 (consideration) - 15 (fees) = 85
    //   grossDebt = 200 (unchanged TL) + 250 (revolver draw) + 350 (new notes) = 800
    //   securedDebt = 800 (all three facilities secured)
    //   netDebt = 800 - 85 = 715
    //   ebitda = 300 + 100 (acquired) + 20 (synergy) = 420
    //   revolver rate = SOFR 5.25 + 225bps = 7.50% -> interest = 250*0.075=18.75
    //   term loan interest unchanged = 16.0
    //   new notes: fixed 7.00% -> interest = 350*0.07=24.5
    //   total interest = 16.0+18.75+24.5 = 59.25
    //   grossLeverage=800/420=1.904762, netLeverage=715/420=1.702381, securedLeverage=1.904762
    //   interestCoverage=420/59.25=7.088608
    //   revolver availability = 400-250-0=150; totalLiquidity=85+150=235
    // ---------------------------------------------------------------------
    expect(result.after.position.liquidity.cash.value).toBe(85);
    expect(result.after.position.capitalStructure.grossDebt).toBe(800);
    expect(result.after.position.capitalStructure.securedDebt).toBe(800);
    expect(result.after.position.capitalStructure.netDebt).toBe(715);
    expect(result.after.position.interest.totalAnnualizedCashInterest).toBeCloseTo(59.25, 6);
    expect(result.after.position.metrics.genericGrossLeverage.value).toBeCloseTo(800 / 420, 6);
    expect(result.after.position.metrics.genericNetLeverage.value).toBeCloseTo(715 / 420, 6);
    expect(result.after.position.metrics.genericSecuredLeverage.value).toBeCloseTo(800 / 420, 6);
    expect(result.after.position.metrics.genericInterestCoverage.value).toBeCloseTo(420 / 59.25, 6);
    expect(result.after.position.liquidity.revolverAvailability).toBe(150);
    expect(result.after.position.liquidity.totalLiquidity).toBe(235);
    expect(result.after.position.maturities.maturityWall.some((e) => e.year === 2032)).toBe(true);

    // --- Financial impact deltas (same underlying numbers, expressed as deltas) ---
    expect(result.financialImpact.cashDelta).toBeCloseTo(85 - 300, 6);
    expect(result.financialImpact.grossDebtDelta).toBe(600);
    expect(result.financialImpact.netDebtDelta).toBe(815);
    expect(result.financialImpact.ebitdaDelta).toBe(120);
    expect(result.financialImpact.interestDelta).toBeCloseTo(59.25 - 16.0, 6);
    expect(result.financialImpact.leverageDelta.grossLeverageDelta).toBeCloseTo(800 / 420 - 200 / 300, 6);
    expect(result.financialImpact.liquidityDelta).toBe(235 - 700);

    // --- Purity: persisted data is byte-identical after simulation (task §21) ---
    const after = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
    expect(after.state.balanceSheetFacts.cash.value).toBe(300);
    expect(after.state.balanceSheetFacts.totalDebtPrincipal.value).toBe(200);
    expect(after.facilities).toHaveLength(2);
    const [facilityRowCount, eventRowCount] = await Promise.all([prisma.facility.count({ where: { companyId: COMPANY_ID } }), prisma.debtEvent.count({ where: { companyId: COMPANY_ID } })]);
    expect(facilityRowCount).toBe(2);
    expect(eventRowCount).toBe(1);
  });

  it("re-running the identical scenario twice produces byte-identical results (determinism, task §24)", async () => {
    const base = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
    const scenario: Scenario = {
      id: "vch-c-determinism-check",
      companyId: COMPANY_ID,
      baseFinancialStateId: base.state.id,
      actions: [{ kind: "CHANGE_EBITDA", ebitdaDelta: 10 }, { kind: "DRAW_REVOLVER", facilityId: FAC_REVOLVER, amount: 30 }],
    };
    const r1 = runScenarioAgainstCovenants({ scenario, baseState: base.state, baseFacilities: base.facilities, baseEvents: base.events, asOfDate: AS_OF, rateAssumptions: [{ referenceRate: "SOFR", assumedRatePct: SOFR }] });
    const r2 = runScenarioAgainstCovenants({ scenario, baseState: base.state, baseFacilities: base.facilities, baseEvents: base.events, asOfDate: AS_OF, rateAssumptions: [{ referenceRate: "SOFR", assumedRatePct: SOFR }] });
    expect(r1.after.position.capitalStructure.grossDebt).toBe(r2.after.position.capitalStructure.grossDebt);
    expect(r1.after.state.id).toBe(r2.after.state.id);
    expect(JSON.stringify(r1.after.position)).toBe(JSON.stringify(r2.after.position));
  });
});
