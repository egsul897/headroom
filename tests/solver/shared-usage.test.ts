import { describe, expect, it } from "vitest";
import {
  basketUsageFromAttributedEvents,
  canPublishRemainingFromUsage,
  computeSharedConstraintCurrentUsage,
} from "../../lib/solver/shared-usage";
import { loadCompanySolverStaticData } from "../../lib/covenant-engine";

const EMPTY_CERT = {
  kind: "VERIFIED_EMPTY" as const,
  approvalState: "APPROVED" as const,
  asOf: "2026-10-09",
  sourceLabel: "test-empty-cert",
  authenticity: "SYNTHETIC_LABELED" as const,
};

const COMPLETE_CERT = {
  kind: "VERIFIED_COMPLETE" as const,
  approvalState: "APPROVED" as const,
  asOf: "2026-10-09",
  sourceLabel: "test-complete-cert",
  authenticity: "SYNTHETIC_LABELED" as const,
};

describe("shared-usage helpers (#234 completeness alignment)", () => {
  it("attributed usage without completeness certificate does NOT support remaining", () => {
    const usage = basketUsageFromAttributedEvents(
      [{ eventType: "ISSUANCE", amount: 70, relatedPermissionIds: ["a"] }],
      ["a"],
    );
    const result = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: usage,
    });
    expect(result).toMatchObject({
      usage: 70,
      status: "COMPUTED",
      attributedKnown: true,
      supportsRemainingClaim: false,
      authoritative: false,
    });
    expect(canPublishRemainingFromUsage(result)).toBe(false);
  });

  it("VERIFIED_COMPLETE certificate enables remaining claim for attributed usage", () => {
    const usage = [
      {
        permissionId: "a",
        cumulativeIncurred: 70,
        currentlyOutstanding: 70,
        prepaymentCredit: 0,
      },
    ];
    const result = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: usage,
      completenessCertificate: { ...COMPLETE_CERT, constraintId: "sc1" },
      constraintId: "sc1",
      asOf: "2026-10-09",
    });
    expect(result.supportsRemainingClaim).toBe(true);
    expect(result.usage).toBe(70);
  });

  it("VERIFIED_EMPTY certificate enables remaining with zero usage; missing attribution alone does not", () => {
    const none = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [],
    });
    expect(none).toMatchObject({
      status: "ZERO_NO_ATTRIBUTED_USAGE",
      supportsRemainingClaim: false,
    });

    const verified = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [],
      completenessCertificate: { ...EMPTY_CERT, constraintId: "sc1" },
      constraintId: "sc1",
      asOf: "2026-10-09",
    });
    expect(verified).toMatchObject({
      status: "VERIFIED_ZERO",
      supportsRemainingClaim: true,
      usage: 0,
    });
  });

  it("partial, external, stale, and mismatched certificates never support remaining", () => {
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
      completenessCertificate: { ...COMPLETE_CERT, constraintId: "sc1" },
      constraintId: "sc1",
      asOf: "2026-10-09",
    });
    expect(partial.supportsRemainingClaim).toBe(false);
    expect(partial.status).toBe("PARTIAL_ATTRIBUTED_USAGE");

    expect(
      computeSharedConstraintCurrentUsage({
        aggregationRule: "EXTERNAL_INSTRUMENT_BALANCE",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        members: [{ externalInstrumentRef: "x" }],
        basketUsage: [],
        completenessCertificate: EMPTY_CERT,
      }).supportsRemainingClaim,
    ).toBe(false);

    const stale = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [
        {
          permissionId: "a",
          cumulativeIncurred: 0,
          currentlyOutstanding: 0,
          prepaymentCredit: 0,
        },
      ],
      completenessCertificate: { ...EMPTY_CERT, asOf: "2026-01-01", constraintId: "sc1" },
      constraintId: "sc1",
      asOf: "2026-10-09",
    });
    expect(stale.supportsRemainingClaim).toBe(false);
    expect(stale.status).toBe("COMPLETENESS_CERTIFICATE_INVALID");

    const mismatched = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [
        {
          permissionId: "a",
          cumulativeIncurred: 5,
          currentlyOutstanding: 5,
          prepaymentCredit: 0,
        },
      ],
      completenessCertificate: { ...COMPLETE_CERT, constraintId: "other" },
      constraintId: "sc1",
      asOf: "2026-10-09",
    });
    expect(mismatched.supportsRemainingClaim).toBe(false);

    const emptyCertWithUsage = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [
        {
          permissionId: "a",
          cumulativeIncurred: 5,
          currentlyOutstanding: 5,
          prepaymentCredit: 0,
        },
      ],
      completenessCertificate: { ...EMPTY_CERT, constraintId: "sc1" },
      constraintId: "sc1",
      asOf: "2026-10-09",
    });
    expect(emptyCertWithUsage.supportsRemainingClaim).toBe(false);
    expect(emptyCertWithUsage.status).toBe("COMPLETENESS_CERTIFICATE_INVALID");
  });

  it("loadCompanySolverStaticData requires completeness certificate for remaining support", async () => {
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
    expect(without.sharedConstraints[0]!.currentUsageSupportsRemainingClaim).toBe(false);
    expect(without.sharedConstraints[0]!.currentUsageAuthoritative).toBe(false);

    const attributedOnly = await loadCompanySolverStaticData(prisma, "co-1", new Date(), {
      basketUsage: [
        {
          permissionId: "p1",
          cumulativeIncurred: 55,
          currentlyOutstanding: 55,
          prepaymentCredit: 0,
        },
      ],
    });
    expect(attributedOnly.sharedConstraints[0]!.currentUsage).toBe(55);
    expect(attributedOnly.sharedConstraints[0]!.currentUsageAttributedKnown).toBe(true);
    expect(attributedOnly.sharedConstraints[0]!.currentUsageSupportsRemainingClaim).toBe(false);

    const withCert = await loadCompanySolverStaticData(prisma, "co-1", new Date(), {
      asOf: "2026-10-09",
      basketUsage: [
        {
          permissionId: "p1",
          cumulativeIncurred: 55,
          currentlyOutstanding: 55,
          prepaymentCredit: 0,
        },
      ],
      completenessCertificates: {
        scc1: COMPLETE_CERT,
      },
    });
    expect(withCert.sharedConstraints[0]!.currentUsageSupportsRemainingClaim).toBe(true);
    expect(withCert.sharedConstraints[0]!.currentUsageCompletenessCertified).toBe(true);
  });
});
