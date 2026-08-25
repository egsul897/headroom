/**
 * Synthetic Company B - ABL/LC (task §20).
 *
 * Structurally different from Company A (an asset-based revolver whose
 * availability is constrained by a certified borrowing base, plus LC usage,
 * plus a second unrelated term facility) - proves mechanically that
 * COMMITMENT != BORROWING BASE != UNDRAWN COMMITMENT != ACTUAL AVAILABLE
 * CAPACITY != CASH != TOTAL LIQUIDITY, and that a missing borrowing-base
 * input fails closed for availability WITHOUT suppressing independent
 * analytics (cash, debt, leverage).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../lib/prisma";
import { fact } from "../../lib/financial-core/types";
import { loadCompanyFinancialCoreData } from "../../lib/financial-core-db/adapter";
import { getFinancialPosition } from "../../lib/financial-core/position-service";
import { computeLiquidityPosition } from "../../lib/financial-core/liquidity";

const COMPANY_ID = "borderline-abl-logistics-b";
const AS_OF = new Date("2027-03-01T00:00:00.000Z");

const FAC_ABL = "bal-b-abl-revolver";
const FAC_TERM_LOAN = "bal-b-term-loan";

async function insertBaseFixture() {
  await prisma.company.create({ data: { id: COMPANY_ID, name: "Borderline ABL Logistics (synthetic, Company B)" } });

  await prisma.financialState.create({
    data: {
      companyId: COMPANY_ID,
      asOfDate: AS_OF,
      periodType: "ACTUAL",
      balanceSheetFacts: {
        cash: fact(60, "REPORTED", AS_OF),
        totalDebtPrincipal: fact(230, "RECONSTRUCTED", AS_OF),
        securedDebtPrincipal: fact(230, "RECONSTRUCTED", AS_OF),
      },
      incomeStatementFacts: {
        gaapEbitda: fact(120, "REPORTED", AS_OF),
        cumulativeNetIncomeSinceIssue: fact(0, "REPORTED", AS_OF),
        equityProceedsSinceIssue: fact(0, "REPORTED", AS_OF),
        interestExpense: fact(15, "REPORTED", AS_OF),
      },
      covenantMetricFacts: { assumedNewDebtRatePct: fact(8.0, "ASSUMED", AS_OF) },
      liquidityFacts: { revolverFacilityId: FAC_ABL },
    } as any,
  });

  await prisma.facility.create({
    data: {
      id: FAC_ABL,
      companyId: COMPANY_ID,
      name: "$500M Asset-Based Revolving Facility",
      facilityType: "ABL",
      originalPrincipal: 500,
      commitmentAmount: 500,
      secured: true,
      couponType: "FLOATING",
      marginBps: 200,
      referenceRate: "SOFR",
      rateFloorPct: 0,
      maturityDate: new Date("2029-09-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.debtEvent.create({ data: { companyId: COMPANY_ID, facilityId: FAC_ABL, eventType: "ISSUANCE", date: new Date("2026-06-01"), amount: 50, provenance: fact(50, "REPORTED", AS_OF) as any } });
  await prisma.debtEvent.create({ data: { companyId: COMPANY_ID, facilityId: FAC_ABL, eventType: "LC_ISSUANCE", date: new Date("2026-08-01"), amount: 40, provenance: fact(40, "REPORTED", AS_OF) as any } });

  await prisma.facility.create({
    data: {
      id: FAC_TERM_LOAN,
      companyId: COMPANY_ID,
      name: "Equipment Term Loan",
      facilityType: "TERM_LOAN",
      originalPrincipal: 180,
      secured: true,
      couponType: "FIXED",
      couponPct: 9.0,
      maturityDate: new Date("2032-01-01"),
      issuedDate: new Date("2026-01-01"),
    },
  });
  await prisma.debtEvent.create({ data: { companyId: COMPANY_ID, facilityId: FAC_TERM_LOAN, eventType: "ISSUANCE", date: new Date("2026-01-01"), amount: 180, provenance: fact(180, "REPORTED", AS_OF) as any } });
}

async function insertBorrowingBaseCertificate(value: number) {
  await prisma.financialState.updateMany({
    where: { companyId: COMPANY_ID },
    data: { liquidityFacts: { revolverFacilityId: FAC_ABL, borrowingBaseValue: fact(value, "EXTERNAL_CERTIFICATE", AS_OF, { reviewStatus: "VERIFIED" }) } as any },
  });
}

async function teardownFixture() {
  await prisma.company.deleteMany({ where: { id: COMPANY_ID } });
}

describe("Synthetic Company B - ABL/LC (task §20)", () => {
  afterAll(async () => {
    await teardownFixture();
  });

  describe("missing borrowing-base certificate", () => {
    beforeAll(async () => {
      await teardownFixture();
      await insertBaseFixture();
    });

    it("fails closed for revolver/total-liquidity availability while independent analytics remain fully computed", async () => {
      const { state, facilities, events } = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
      const position = getFinancialPosition(state, facilities, events, AS_OF, [{ referenceRate: "SOFR", assumedRatePct: 5.5 }]);

      // Fails closed - no certified borrowing-base value on record.
      expect(position.liquidity.revolverAvailability).toBeNull();
      expect(position.liquidity.revolverAvailabilityStatus).toBe("UNAVAILABLE_REVIEW_REQUIRED");
      expect(position.liquidity.totalLiquidity).toBeNull();
      expect(position.warnings.some((w) => w.category === "MISSING_ASSUMPTION")).toBe(true);

      // But commitment/drawn/LC-usage/undrawn commitment (all NOT
      // borrowing-base-dependent) are still fully computed - never
      // suppressed just because availability is unresolved.
      expect(position.liquidity.revolverCommitment).toBe(500);
      expect(position.liquidity.revolverDrawn).toBe(50);
      expect(position.liquidity.revolverLcUsage).toBe(40);
      expect(position.liquidity.undrawnCommitment).toBe(500 - 50 - 40); // 410 - NOT the same as actual availability

      // Independent cash/debt/leverage analytics are entirely unaffected.
      expect(position.liquidity.cash.value).toBe(60);
      expect(position.capitalStructure.grossDebt).toBe(230); // 50 (ABL drawn) + 180 (term loan)
      expect(position.capitalStructure.securedDebt).toBe(230);
      expect(position.metrics.genericGrossLeverage.status).toBe("OK");
      expect(position.metrics.genericGrossLeverage.value).toBeCloseTo(230 / 120, 6);
    });
  });

  describe("with a certified borrowing-base value on record", () => {
    beforeAll(async () => {
      await teardownFixture();
      await insertBaseFixture();
      await insertBorrowingBaseCertificate(420);
    });

    it("computes availability as min(commitment, borrowing base) - drawn - LC usage - NEVER commitment - drawn alone", async () => {
      const { state, facilities, events } = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
      const liquidity = computeLiquidityPosition(state, facilities, events, AS_OF);

      // Commitment (500) != borrowing base (420) != undrawn commitment (410) != actual availability != cash != total liquidity.
      expect(liquidity.revolverCommitment).toBe(500);
      expect(liquidity.borrowingBaseValue).toBe(420);
      expect(liquidity.undrawnCommitment).toBe(410); // 500 - 50 - 40 (commitment-based, ignores borrowing base)
      // Actual availability = min(500, 420) - 50 - 40 = 330 - the task's own
      // worked example, restated: this must NOT equal commitment-minus-draws (450).
      expect(liquidity.revolverAvailability).toBe(330);
      expect(liquidity.revolverAvailability).not.toBe(liquidity.undrawnCommitment);
      expect(liquidity.availableCash).toBe(60); // no restricted cash on this fixture
      expect(liquidity.totalLiquidity).toBe(60 + 330); // 390 - distinct from every other figure above
      expect(new Set([liquidity.revolverCommitment, liquidity.borrowingBaseValue, liquidity.undrawnCommitment, liquidity.revolverAvailability, liquidity.availableCash, liquidity.totalLiquidity]).size).toBe(6);
    });

    it("borrowing base below drawn+LC usage produces a negative (overdrawn) availability, surfaced not hidden", async () => {
      // Adversarial: borrowing base collapses to below current utilization -
      // the ABL is effectively overdrawn against its own base. The engine
      // reports the true (negative) number rather than clamping to zero,
      // so a caller can see the overdraw explicitly.
      await prisma.financialState.updateMany({
        where: { companyId: COMPANY_ID },
        data: { liquidityFacts: { revolverFacilityId: FAC_ABL, borrowingBaseValue: fact(70, "EXTERNAL_CERTIFICATE", AS_OF, { reviewStatus: "VERIFIED" }) } as any },
      });
      const { state, facilities, events } = await loadCompanyFinancialCoreData(prisma, COMPANY_ID, AS_OF);
      const liquidity = computeLiquidityPosition(state, facilities, events, AS_OF);
      // min(500, 70) - 50 - 40 = -20
      expect(liquidity.revolverAvailability).toBe(-20);
      expect(liquidity.revolverAvailabilityStatus).toBe("AVAILABLE"); // computed, not review-required - the input itself is present and certified, the RESULT is simply negative
    });
  });
});
