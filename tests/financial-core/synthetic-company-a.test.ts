/**
 * Synthetic Company A - standard capital structure (task §19).
 *
 * Isolated, obviously-fictional fixture inserted via real Prisma calls,
 * following the exact pattern tests/solver/live-integration.test.ts already
 * established - never touching Coherent's data or prisma/seed-data.ts.
 * Every expected figure below is hand-computed independently in this file's
 * comments before the assertions, not derived by calling the engine first.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { fact } from "../../lib/financial-core/types";
import { loadCompanyFinancialCoreData } from "../../lib/financial-core-db/adapter";
import { getFinancialPosition } from "../../lib/financial-core/position-service";

const COMPANY_ID = "fixture-forge-industries-a";
const AS_OF = new Date("2027-01-01T00:00:00.000Z");
const SOFR_ASSUMPTION = { referenceRate: "SOFR", assumedRatePct: 5.0 };

const FAC_REVOLVER = "ffi-a-revolver";
const FAC_TERM_LOAN = "ffi-a-term-loan";
const FAC_SECURED_NOTES = "ffi-a-secured-notes";
const FAC_UNSECURED_NOTES = "ffi-a-unsecured-notes";

async function insertFixture() {
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Fixture Forge Industries (synthetic, Company A)" } });

  await prisma.financialState.create({
    data: {
      companyId: COMPANY_ID,
      asOfDate: AS_OF,
      periodType: "ACTUAL",
      balanceSheetFacts: {
        cash: fact(170, "REPORTED", AS_OF),
        restrictedCash: fact(20, "REPORTED", AS_OF),
        totalDebtPrincipal: fact(1070, "RECONSTRUCTED", AS_OF),
        securedDebtPrincipal: fact(820, "RECONSTRUCTED", AS_OF),
      },
      incomeStatementFacts: {
        gaapEbitda: fact(500, "REPORTED", AS_OF),
        cumulativeNetIncomeSinceIssue: fact(0, "REPORTED", AS_OF),
        equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF),
        interestExpense: fact(60, "REPORTED", AS_OF),
      },
      covenantMetricFacts: {
        assumedNewDebtRatePct: fact(7.0, "ASSUMED", AS_OF),
      },
    } as any,
  });

  await prisma.facility.create({
    data: {
      id: FAC_REVOLVER,
      companyId: COMPANY_ID,
      name: "$500M Revolving Credit Facility",
      facilityType: "REVOLVER",
      originalPrincipal: 500,
      commitmentAmount: 500,
      secured: true,
      couponType: "FLOATING",
      marginBps: 250,
      referenceRate: "SOFR",
      rateFloorPct: 0,
      maturityDate: new Date("2030-03-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.debtEvent.create({
    data: { companyId: COMPANY_ID, facilityId: FAC_REVOLVER, eventType: "ISSUANCE", date: new Date("2026-06-01"), amount: 120, provenance: fact(120, "REPORTED", AS_OF) as any },
  });

  await prisma.facility.create({
    data: {
      id: FAC_TERM_LOAN,
      companyId: COMPANY_ID,
      name: "Term Loan B",
      facilityType: "TERM_LOAN",
      originalPrincipal: 400,
      secured: true,
      couponType: "FLOATING",
      marginBps: 300,
      referenceRate: "SOFR",
      rateFloorPct: 0.5,
      maturityDate: new Date("2028-03-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.debtEvent.create({
    data: { companyId: COMPANY_ID, facilityId: FAC_TERM_LOAN, eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 400, provenance: fact(400, "REPORTED", AS_OF) as any },
  });

  await prisma.facility.create({
    data: {
      id: FAC_SECURED_NOTES,
      companyId: COMPANY_ID,
      name: "6.50% Senior Secured Notes due 2031",
      facilityType: "NOTES",
      originalPrincipal: 300,
      secured: true,
      couponType: "FIXED",
      couponPct: 6.5,
      maturityDate: new Date("2031-06-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.debtEvent.create({
    data: { companyId: COMPANY_ID, facilityId: FAC_SECURED_NOTES, eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 300, provenance: fact(300, "REPORTED", AS_OF) as any },
  });

  await prisma.facility.create({
    data: {
      id: FAC_UNSECURED_NOTES,
      companyId: COMPANY_ID,
      name: "7.25% Senior Unsecured Notes due 2033",
      facilityType: "NOTES",
      originalPrincipal: 250,
      secured: false,
      couponType: "FIXED",
      couponPct: 7.25,
      maturityDate: new Date("2033-06-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.debtEvent.create({
    data: { companyId: COMPANY_ID, facilityId: FAC_UNSECURED_NOTES, eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 250, provenance: fact(250, "REPORTED", AS_OF) as any },
  });
}

async function teardownFixture() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Synthetic Company A - standard capital structure (task §19)", () => {
  beforeAll(async () => {
    await teardownFixture();
    await insertFixture();
  });
  afterAll(async () => {
    await teardownFixture();
  });

  it("loads from Postgres and computes the full financial position matching hand-computed expectations", async () => {
    const { state, facilities, events } = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
    const position = getFinancialPosition(state, facilities, events, AS_OF, [SOFR_ASSUMPTION]);

    // --- Cash ---
    expect(position.liquidity.cash.value).toBe(170);
    expect(position.liquidity.restrictedCash).toBe(20);
    expect(position.liquidity.availableCash).toBe(150);

    // --- Capital structure ---
    // Gross debt = 120 (revolver drawn) + 400 (TL) + 300 (secured notes) + 250 (unsecured notes) = 1070
    expect(position.capitalStructure.grossDebt).toBe(1070);
    // Net debt = grossDebt - total cash = 1070 - 170 = 900
    expect(position.capitalStructure.netDebt).toBe(900);
    // Secured = 120 + 400 + 300 = 820; Unsecured = 250
    expect(position.capitalStructure.securedDebt).toBe(820);
    expect(position.capitalStructure.unsecuredDebt).toBe(250);
    // Fixed = notes (300+250)=550; Floating = revolver+TL (120+400)=520
    expect(position.capitalStructure.fixedRateDebt).toBe(550);
    expect(position.capitalStructure.floatingRateDebt).toBe(520);
    expect(position.capitalStructure.fixedPct).toBeCloseTo((550 / 1070) * 100, 6);
    expect(position.capitalStructure.floatingPct).toBeCloseTo((520 / 1070) * 100, 6);

    // --- Interest ---
    // Revolver: SOFR 5.00 + 250bps = 7.50%, floor 0% -> 7.50%. Interest = 120 * 0.075 = 9.0
    // Term loan: SOFR 5.00 + 300bps = 8.00%, floor 0.5% -> 8.00%. Interest = 400 * 0.08 = 32.0
    // Secured notes: fixed 6.50%. Interest = 300 * 0.065 = 19.5
    // Unsecured notes: fixed 7.25%. Interest = 250 * 0.0725 = 18.125
    // Total = 9.0 + 32.0 + 19.5 + 18.125 = 78.625
    expect(position.interest.totalAnnualizedCashInterest).toBeCloseTo(78.625, 6);
    // WAC = 7862.5 / 1070 = 7.348130...%
    expect(position.capitalStructure.weightedAverageInterestRatePct).toBeCloseTo(7862.5 / 1070, 6);

    // --- Generic financial metrics (explicitly NOT covenant-defined ratios) ---
    expect(position.metrics.genericGrossLeverage.status).toBe("OK");
    expect(position.metrics.genericGrossLeverage.value).toBeCloseTo(1070 / 500, 6);
    expect(position.metrics.genericNetLeverage.value).toBeCloseTo(900 / 500, 6);
    expect(position.metrics.genericSecuredLeverage.value).toBeCloseTo(820 / 500, 6);
    expect(position.metrics.genericInterestCoverage.value).toBeCloseTo(500 / 78.625, 6);

    // --- Liquidity ---
    // Revolver availability = commitment 500 - drawn 120 - LC usage 0 = 380 (plain REVOLVER, no borrowing-base constraint)
    expect(position.liquidity.revolverAvailability).toBe(380);
    expect(position.liquidity.revolverAvailabilityStatus).toBe("AVAILABLE");
    // Total liquidity = available cash 150 + revolver availability 380 = 530
    expect(position.liquidity.totalLiquidity).toBe(530);

    // --- Maturities ---
    // Only the term loan (2028-03-01, ~14 months out) falls within 24 or 36
    // months of AS_OF (2027-01-01); nothing falls within 12 months; the
    // revolver's 2030-03-01 termination (~38 months out) falls outside 36.
    expect(position.maturities.dueWithin12Months).toBe(0);
    expect(position.maturities.dueWithin24Months).toBe(400);
    expect(position.maturities.dueWithin36Months).toBe(400);
    expect(position.maturities.nextMaturity?.facilityId).toBe(FAC_TERM_LOAN);
    expect(position.maturities.nextMaturity?.principal).toBe(400);
    // Maturity wall buckets sum to gross debt exactly.
    const wallTotal = position.maturities.maturityWall.reduce((s, e) => s + e.principalMaturing, 0);
    expect(wallTotal).toBe(1070);
    expect(position.maturities.maturityWall.map((e) => e.year)).toEqual([2028, 2030, 2031, 2033]);

    expect(position.warnings.length).toBe(0);
  });

  it("proves DebtTranche is untouched - no rows written to it by this fixture", async () => {
    const count = await prisma.debtTranche.count({ where: { companyId: COMPANY_ID } });
    expect(count).toBe(0);
  });
});
