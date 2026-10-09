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
    expect(measureBasketUsageAmount(record, "NET_OF_REPAYMENT")).toBe(40);
    expect(measureBasketUsageAmount(record, "PREPAYMENT_CREDIT")).toBe(5);
    expect(measureBasketUsageAmount(undefined, "CURRENTLY_OUTSTANDING")).toBe(0);
  });

  it("builds attributed basket usage from issuance/repayment events", () => {
    const usage = basketUsageFromAttributedEvents(
      [
        { eventType: "ISSUANCE", amount: 100, relatedPermissionIds: ["a"] },
        { eventType: "REPAYMENT", amount: 30, relatedPermissionIds: ["a"] },
        { eventType: "ISSUANCE", amount: 50, relatedPermissionIds: [] },
      ],
      ["a", "b"],
    );
    expect(usage).toEqual([
      {
        permissionId: "a",
        cumulativeIncurred: 100,
        currentlyOutstanding: 70,
        prepaymentCredit: 0,
      },
    ]);
  });

  it("computes NAMED_MEMBER_CLAUSES usage and refuses inventing other aggregation rules", () => {
    const basketUsage = [
      {
        permissionId: "a",
        cumulativeIncurred: 100,
        currentlyOutstanding: 60,
        prepaymentCredit: 0,
      },
    ];
    const named = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage,
    });
    expect(named).toEqual({ usage: 60, status: "COMPUTED" });

    const external = computeSharedConstraintCurrentUsage({
      aggregationRule: "EXTERNAL_INSTRUMENT_BALANCE",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ externalInstrumentRef: "bond-1" }],
      basketUsage,
    });
    expect(external).toEqual({ usage: 0, status: "EXTERNAL_INPUT_REQUIRED" });

    const entity = computeSharedConstraintCurrentUsage({
      aggregationRule: "ENTITY_CLASS_FILTER",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ entityClass: "NON_GUARANTOR_RS" }],
      basketUsage,
    });
    expect(entity).toEqual({ usage: 0, status: "ENTITY_CLASS_USAGE_UNAVAILABLE" });
  });

  it("loadCompanySolverStaticData keeps currentUsage 0 without basketUsage (backward compatible)", async () => {
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
        findMany: async () => [{ constraintId: "scc1", permissionId: "p1", namedInstrument: null, entityClass: null, externalInstrumentRef: null }],
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
