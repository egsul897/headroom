import { describe, expect, it } from "vitest";
import {
  DEMO_BINDINGS,
  authenticCompletenessCertificate,
  demoTrustedIssuerAuth,
  productionTrustedIssuerAuth,
  sessionCounselPrincipal,
  syntheticCompletenessCertificate,
} from "@/lib/capacity";
import {
  basketUsageFromAttributedEvents,
  canPublishRemainingFromUsage,
  computeSharedConstraintCurrentUsage,
  solverFlagsFromUsageResult,
} from "../../lib/solver/shared-usage";
import { loadCompanySolverStaticData } from "../../lib/covenant-engine";

const AS_OF = "2026-10-09";
const CO = "co-1";
const SC = "sc1";
const BINDINGS = {
  ...DEMO_BINDINGS,
  financialStateAsOf: AS_OF,
};
const DEMO_AUTH = demoTrustedIssuerAuth();
const PROD_AUTH = productionTrustedIssuerAuth([sessionCounselPrincipal("counsel-alice")]);

function emptyCert(constraintId = SC) {
  return syntheticCompletenessCertificate({
    kind: "VERIFIED_EMPTY",
    capacityRuleId: constraintId,
    companyId: CO,
    asOf: AS_OF,
    bindings: BINDINGS,
  });
}

function completeCert(constraintId = SC) {
  return syntheticCompletenessCertificate({
    kind: "VERIFIED_COMPLETE",
    capacityRuleId: constraintId,
    companyId: CO,
    asOf: AS_OF,
    bindings: BINDINGS,
  });
}

function authenticComplete(constraintId = SC) {
  return authenticCompletenessCertificate({
    kind: "VERIFIED_COMPLETE",
    capacityRuleId: constraintId,
    companyId: CO,
    actorId: "counsel-alice",
    asOf: AS_OF,
    bindings: BINDINGS,
    completenessMethod: "EXHAUSTIVE_ATTRIBUTED_LEDGER_ENUMERATION",
    openingBalancePolicy: "INCLUDED_IN_ATTRIBUTED_SET",
  });
}

const demoArgs = {
  currentBindings: BINDINGS,
  trustedIssuerAuth: DEMO_AUTH,
  executionMode: "DEMO_SYNTHETIC" as const,
  companyId: CO,
  asOf: AS_OF,
  currency: "USD" as const,
};

describe("shared-usage helpers (canonical #234 completeness)", () => {
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
      constraintId: SC,
      companyId: CO,
    });
    expect(result).toMatchObject({
      usage: 70,
      status: "COMPUTED",
      attributedKnown: true,
      supportsRemainingClaim: false,
      authoritative: false,
      productionAuthoritative: false,
    });
    expect(canPublishRemainingFromUsage(result)).toBe(false);
    const flags = solverFlagsFromUsageResult(result);
    expect(flags.currentUsageAuthoritative).toBe(false);
    expect(flags.currentUsageSupportsRemainingClaim).toBe(false);
    expect(flags.currentUsageAuthoritative).toBe(flags.currentUsageSupportsRemainingClaim);
  });

  it("DEMO VERIFIED_COMPLETE enables supportsRemainingClaim but not productionAuthoritative", () => {
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
      completenessCertificate: completeCert(),
      constraintId: SC,
      ...demoArgs,
    });
    expect(result.supportsRemainingClaim).toBe(true);
    expect(result.productionAuthoritative).toBe(false);
    expect(result.usage).toBe(70);
    expect(canPublishRemainingFromUsage(result, { requireProductionAuthoritative: true })).toBe(
      false,
    );
  });

  it("PRODUCTION authentic cert + trusted counsel enables productionAuthoritative remaining", () => {
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
      completenessCertificate: authenticComplete(),
      constraintId: SC,
      companyId: CO,
      asOf: AS_OF,
      currency: "USD",
      currentBindings: BINDINGS,
      trustedIssuerAuth: PROD_AUTH,
      executionMode: "PRODUCTION",
    });
    expect(result.supportsRemainingClaim).toBe(true);
    expect(result.productionAuthoritative).toBe(true);
    expect(canPublishRemainingFromUsage(result, { requireProductionAuthoritative: true })).toBe(
      true,
    );
    const flags = solverFlagsFromUsageResult(result);
    expect(flags.currentUsageAuthoritative).toBe(true);
    expect(flags.currentUsageSupportsRemainingClaim).toBe(true);
    expect(flags.currentUsageProductionAuthoritative).toBe(true);
  });

  it("VERIFIED_EMPTY certificate enables remaining with zero usage; missing attribution alone does not", () => {
    const none = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [],
      constraintId: SC,
      companyId: CO,
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
      completenessCertificate: emptyCert(),
      constraintId: SC,
      ...demoArgs,
    });
    expect(verified).toMatchObject({
      status: "VERIFIED_ZERO",
      supportsRemainingClaim: true,
      usage: 0,
      productionAuthoritative: false,
    });
  });

  it("partial, external, forged-issuer, stale, and mismatched certificates never support remaining", () => {
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
      completenessCertificate: completeCert(),
      constraintId: SC,
      ...demoArgs,
    });
    expect(partial.supportsRemainingClaim).toBe(false);
    expect(partial.status).toBe("PARTIAL_ATTRIBUTED_USAGE");

    expect(
      computeSharedConstraintCurrentUsage({
        aggregationRule: "EXTERNAL_INSTRUMENT_BALANCE",
        measurementBasis: "CURRENTLY_OUTSTANDING",
        members: [{ externalInstrumentRef: "x" }],
        basketUsage: [],
        completenessCertificate: emptyCert(),
        ...demoArgs,
      }).supportsRemainingClaim,
    ).toBe(false);

    // Forged issuer: certificate claims counsel but trusted registry has no such actor.
    const forged = computeSharedConstraintCurrentUsage({
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
      completenessCertificate: authenticComplete(),
      constraintId: SC,
      companyId: CO,
      asOf: AS_OF,
      currency: "USD",
      currentBindings: BINDINGS,
      trustedIssuerAuth: productionTrustedIssuerAuth([
        sessionCounselPrincipal("someone-else"),
      ]),
      executionMode: "PRODUCTION",
    });
    expect(forged.supportsRemainingClaim).toBe(false);
    expect(forged.status).toBe("COMPLETENESS_CERTIFICATE_INVALID");

    // Stale bindings
    const stale = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [],
      completenessCertificate: emptyCert(),
      constraintId: SC,
      ...demoArgs,
      currentBindings: { ...BINDINGS, ledgerEpochId: "stale-epoch" },
    });
    expect(stale.supportsRemainingClaim).toBe(false);
    expect(stale.status).toBe("COMPLETENESS_CERTIFICATE_INVALID");

    // Mismatched scope (provisionOrBasketId ≠ constraintId)
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
      completenessCertificate: completeCert("other"),
      constraintId: SC,
      ...demoArgs,
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
      completenessCertificate: emptyCert(),
      constraintId: SC,
      ...demoArgs,
    });
    expect(emptyCertWithUsage.supportsRemainingClaim).toBe(false);
    expect(emptyCertWithUsage.status).toBe("COMPLETENESS_CERTIFICATE_INVALID");
  });

  it("loadCompanySolverStaticData requires completeness + trusted auth for remaining support", async () => {
    const prisma = {
      permission: { findMany: async () => [] },
      permissionRelationship: { findMany: async () => [] },
      sharedCapacityConstraint: {
        findMany: async () => [
          {
            id: SC,
            companyId: CO,
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
            constraintId: SC,
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

    const without = await loadCompanySolverStaticData(prisma, CO);
    expect(without.sharedConstraints[0]!.currentUsageSupportsRemainingClaim).toBe(false);
    expect(without.sharedConstraints[0]!.currentUsageAuthoritative).toBe(false);
    expect(without.sharedConstraints[0]!.currentUsageProductionAuthoritative).toBe(false);

    const attributedOnly = await loadCompanySolverStaticData(prisma, CO, new Date(), {
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

    const withProdCert = await loadCompanySolverStaticData(prisma, CO, new Date(), {
      asOf: AS_OF,
      currency: "USD",
      basketUsage: [
        {
          permissionId: "p1",
          cumulativeIncurred: 55,
          currentlyOutstanding: 55,
          prepaymentCredit: 0,
        },
      ],
      completenessCertificates: {
        [SC]: authenticComplete(),
      },
      currentBindings: BINDINGS,
      trustedIssuerAuth: PROD_AUTH,
      executionMode: "PRODUCTION",
    });
    expect(withProdCert.sharedConstraints[0]!.currentUsageSupportsRemainingClaim).toBe(true);
    expect(withProdCert.sharedConstraints[0]!.currentUsageAuthoritative).toBe(true);
    expect(withProdCert.sharedConstraints[0]!.currentUsageProductionAuthoritative).toBe(true);
    expect(withProdCert.sharedConstraints[0]!.currentUsageCompletenessCertified).toBe(true);
  });
});
