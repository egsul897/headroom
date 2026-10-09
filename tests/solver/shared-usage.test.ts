import { describe, expect, it } from "vitest";
import {
  basketUsageFromAttributedEvents,
  computeSharedConstraintCurrentUsage,
  isAuthoritativeUsageStatus,
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

  it("distinguishes verified zero, no attribution, partial, computed, and external unknowns", () => {
    const attributedZero = [
      {
        permissionId: "a",
        cumulativeIncurred: 0,
        currentlyOutstanding: 0,
        prepaymentCredit: 0,
      },
    ];
    const verified = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: attributedZero,
    });
    expect(verified).toMatchObject({ usage: 0, status: "VERIFIED_ZERO", authoritative: true });
    expect(isAuthoritativeUsageStatus(verified.status)).toBe(true);

    const none = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [],
    });
    expect(none).toMatchObject({ usage: 0, status: "ZERO_NO_ATTRIBUTED_USAGE", authoritative: false });
    expect(isAuthoritativeUsageStatus(none.status)).toBe(false);

    const partial = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }, { permissionId: "b" }],
      basketUsage: [
        {
          permissionId: "a",
          cumulativeIncurred: 10,
          currentlyOutstanding: 10,
          prepaymentCredit: 0,
        },
      ],
    });
    expect(partial).toMatchObject({
      usage: 10,
      status: "PARTIAL_ATTRIBUTED_USAGE",
      authoritative: false,
    });

    const usage = basketUsageFromAttributedEvents(
      [
        { eventType: "ISSUANCE", amount: 100, relatedPermissionIds: ["a"] },
        { eventType: "REPAYMENT", amount: 30, relatedPermissionIds: ["a"] },
      ],
      ["a"],
    );
    expect(
      computeSharedConstraintCurrentUsage({
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        members: [{ permissionId: "a" }],
        basketUsage: usage,
      }),
    ).toMatchObject({ usage: 70, status: "COMPUTED", authoritative: true });

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
        aggregationRule: "ENTITY_CLASS_FILTER",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        members: [{ entityClass: "NON_GUARANTOR_RS" }],
        basketUsage: usage,
      }).status,
    ).toBe("ENTITY_CLASS_USAGE_UNAVAILABLE");
  });

  it("loadCompanySolverStaticData attaches usage status and never marks unattributed zero authoritative", async () => {
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
    expect(without.sharedConstraints[0]!.currentUsageStatus).toBe("ZERO_NO_ATTRIBUTED_USAGE");
    expect(without.sharedConstraints[0]!.currentUsageAuthoritative).toBe(false);

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
    expect(withUsage.sharedConstraints[0]!.currentUsageStatus).toBe("COMPUTED");
    expect(withUsage.sharedConstraints[0]!.currentUsageAuthoritative).toBe(true);

    const verifiedZero = await loadCompanySolverStaticData(prisma, "co-1", new Date(), {
      basketUsage: [
        {
          permissionId: "p1",
          cumulativeIncurred: 0,
          currentlyOutstanding: 0,
          prepaymentCredit: 0,
        },
      ],
    });
    expect(verifiedZero.sharedConstraints[0]!.currentUsage).toBe(0);
    expect(verifiedZero.sharedConstraints[0]!.currentUsageStatus).toBe("VERIFIED_ZERO");
    expect(verifiedZero.sharedConstraints[0]!.currentUsageAuthoritative).toBe(true);
  });
});
