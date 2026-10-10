import { describe, expect, it } from "vitest";
import {
  basketUsageFromAttributedEvents,
  computeSharedConstraintCurrentUsage,
  isAuthoritativeUsageStatus,
  measureBasketUsageAmount,
} from "../../lib/solver/shared-usage";
import { loadCompanySolverStaticData } from "../../lib/covenant-engine";
import { assertMayPublishRemaining, decideSolverUtilizationAuthority } from "../../lib/capacity";

describe("shared-usage helpers — completeness-certificate authority", () => {
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

  it("attributed zero without completeness cert is NOT authoritative remaining", () => {
    const attributedZero = [
      {
        permissionId: "a",
        cumulativeIncurred: 0,
        currentlyOutstanding: 0,
        prepaymentCredit: 0,
      },
    ];
    const incomplete = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: attributedZero,
    });
    expect(incomplete).toMatchObject({
      usage: 0,
      status: "ATTRIBUTED_INCOMPLETE",
      authoritative: false,
    });
    expect(isAuthoritativeUsageStatus(incomplete.status, incomplete.authoritative)).toBe(false);

    const verified = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: attributedZero,
      completenessCertificate: {
        capacityRuleId: "a",
        asOf: "2026-10-09",
        approvalState: "APPROVED",
        sourceLabel: "test-empty-cert",
        kind: "VERIFIED_EMPTY",
        authenticity: "AUTHENTIC",
      },
    });
    expect(verified).toMatchObject({ usage: 0, status: "VERIFIED_ZERO", authoritative: true });
    expect(isAuthoritativeUsageStatus(verified.status, verified.authoritative)).toBe(true);
  });

  it("known attributed usage without VERIFIED_COMPLETE cannot claim remaining", () => {
    const usage = basketUsageFromAttributedEvents(
      [
        { eventType: "ISSUANCE", amount: 100, relatedPermissionIds: ["a"] },
        { eventType: "REPAYMENT", amount: 30, relatedPermissionIds: ["a"] },
      ],
      ["a"],
    );
    const incomplete = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: usage,
    });
    expect(incomplete).toMatchObject({
      usage: 70,
      status: "ATTRIBUTED_INCOMPLETE",
      authoritative: false,
    });

    const complete = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: usage,
      completenessCertificate: {
        capacityRuleId: "a",
        asOf: "2026-10-09",
        approvalState: "APPROVED",
        sourceLabel: "test-complete-cert",
        kind: "VERIFIED_COMPLETE",
        authenticity: "AUTHENTIC",
      },
    });
    expect(complete).toMatchObject({ usage: 70, status: "COMPUTED", authoritative: true });
  });

  it("empty attribution / partial / external remain non-authoritative", () => {
    const none = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [],
    });
    expect(none).toMatchObject({ usage: 0, status: "ZERO_NO_ATTRIBUTED_USAGE", authoritative: false });

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

    expect(
      computeSharedConstraintCurrentUsage({
        aggregationRule: "EXTERNAL_INSTRUMENT_BALANCE",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        members: [{ externalInstrumentRef: "x" }],
        basketUsage: [],
      }).status,
    ).toBe("EXTERNAL_INPUT_REQUIRED");

    expect(
      computeSharedConstraintCurrentUsage({
        aggregationRule: "ENTITY_CLASS_FILTER",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        members: [{ entityClass: "NON_GUARANTOR_RS" }],
        basketUsage: [],
      }).status,
    ).toBe("ENTITY_CLASS_USAGE_UNAVAILABLE");
  });

  it("synthetic completeness cannot publish authoritative remaining without allow flag", () => {
    const decision = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 35,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        capacityRuleId: "r",
        asOf: "2026-10-09",
        approvalState: "APPROVED",
        sourceLabel: "synthetic-fixture",
        kind: "VERIFIED_COMPLETE",
        authenticity: "SYNTHETIC_LABELED",
      },
    });
    expect(decision.authoritativeForRemaining).toBe(false);
    expect(assertMayPublishRemaining(decision)).toBe(false);

    const allowed = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 35,
      aggregation: "NAMED_MEMBER_CLAUSES",
      allowSyntheticRemaining: true,
      completenessCertificate: {
        capacityRuleId: "r",
        asOf: "2026-10-09",
        approvalState: "APPROVED",
        sourceLabel: "synthetic-fixture",
        kind: "VERIFIED_COMPLETE",
        authenticity: "SYNTHETIC_LABELED",
      },
    });
    expect(allowed.authoritativeForRemaining).toBe(true);
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
            effectiveDate: new Date("2020-01-01"),
            expirationDate: null,
          },
        ],
      },
      sharedCapacityConstraintMember: {
        findMany: async () => [
          {
            id: "m1",
            constraintId: "scc1",
            permissionId: "perm-a",
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
    const data = await loadCompanySolverStaticData(prisma as never, "co-1");
    expect(data.sharedConstraints).toHaveLength(1);
    expect(data.sharedConstraints[0]).toMatchObject({
      currentUsage: 0,
      currentUsageStatus: "ZERO_NO_ATTRIBUTED_USAGE",
      currentUsageAuthoritative: false,
    });
  });
});
