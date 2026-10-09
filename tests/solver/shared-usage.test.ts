import { describe, expect, it } from "vitest";
import {
  basketUsageFromAttributedEvents,
  computeSharedConstraintCurrentUsage,
  measureBasketUsageAmount,
} from "../../lib/solver/shared-usage";
import { loadCompanySolverStaticData } from "../../lib/covenant-engine";

describe("shared-usage helpers", () => {
  it("measures basket usage by measurement basis", () => {
    const record = {
      permissionId: "p1",
      cumulativeIncurred: 100,
      currentlyOutstanding: 40,
      prepaymentCredit: 5,
    };
    expect(measureBasketUsageAmount(record, "CUMULATIVE_INCURRED")).toBe(100);
    expect(measureBasketUsageAmount(record, "CURRENTLY_OUTSTANDING")).toBe(40);
    expect(measureBasketUsageAmount(undefined, "CURRENTLY_OUTSTANDING")).toBe(0);
  });

  it("builds attributed basket usage and refuses inventing non-named aggregation usage", () => {
    const usage = basketUsageFromAttributedEvents(
      [
        { eventType: "ISSUANCE", amount: 100, relatedPermissionIds: ["a"] },
        { eventType: "REPAYMENT", amount: 30, relatedPermissionIds: ["a"] },
      ],
      ["a"],
    );
    expect(usage[0]!.currentlyOutstanding).toBe(70);

    expect(
      computeSharedConstraintCurrentUsage({
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        members: [{ permissionId: "a" }],
        basketUsage: usage,
      }),
    ).toEqual({ usage: 70, status: "COMPUTED" });

    expect(
      computeSharedConstraintCurrentUsage({
        aggregationRule: "EXTERNAL_INSTRUMENT_BALANCE",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        members: [{ externalInstrumentRef: "x" }],
        basketUsage: usage,
      }).status,
    ).toBe("EXTERNAL_INPUT_REQUIRED");

    expect(
      computeSharedConstraintCurrentUsage({
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        members: [{ permissionId: "a" }],
        basketUsage: [],
      }).status,
    ).toBe("ZERO_NO_ATTRIBUTED_USAGE");
  });

  it("loadCompanySolverStaticData uses basketUsage when supplied", async () => {
    const prisma = {
      permission: { findMany: async () => [] },
      permissionRelationship: { findMany: async () => [] },
      sharedCapacityConstraint: {
        findMany: async () => [
          {
            id: "scc1",
            companyId: "co-1",
            name: "shared",
            capAmount: 100,
            capFormulaType: null,
            capParams: null,
            aggregationRule: "NAMED_MEMBER_CLAUSES" as const,
            measurementBasis: "CURRENTLY_OUTSTANDING" as const,
            followsRefinancing: false,
            sourceSectionRef: "§1",
          },
        ],
      },
      sharedCapacityConstraintMember: {
        findMany: async () => [
          {
            constraintId: "scc1",
            permissionId: "p1",
            namedInstrument: null,
            entityClass: null,
            externalInstrumentRef: null,
          },
        ],
      },
      permissionCollateralScope: { findMany: async () => [] },
      ruleActivationCondition: { findMany: async () => [] },
      solverCoverageDeclaration: { findMany: async () => [] },
    };

    const without = await loadCompanySolverStaticData(prisma, "co-1");
    expect(without.sharedConstraints[0]!.currentUsage).toBe(0);

    const withUsage = await loadCompanySolverStaticData(prisma, "co-1", new Date(), {
      basketUsage: [
        {
          permissionId: "p1",
          cumulativeIncurred: 90,
          currentlyOutstanding: 55,
          prepaymentCredit: 0,
        },
      ],
    });
    expect(withUsage.sharedConstraints[0]!.currentUsage).toBe(55);
  });
});
