/**
 * Focused regression: solver-side completeness must not establish
 * production-authoritative remaining from APPROVED certs with missing
 * authenticity or unverified issuer authority.
 *
 * Preserves valid synthetic demo behavior via allowSyntheticRemaining.
 * Selective #244 trusted-issuer port onto canonical #250 / #237 bridge.
 */
import { describe, expect, it } from "vitest";
import {
  assertMayPublishRemaining,
  decideSolverUtilizationAuthority,
  productionTrustedIssuerAuth,
  sessionCounselPrincipal,
} from "@/lib/capacity";
import { computeSharedConstraintCurrentUsage } from "@/lib/solver/shared-usage";

const AS_OF = "2026-10-09";
const PROD_AUTH = productionTrustedIssuerAuth([sessionCounselPrincipal("counsel-alice")]);

const baseComplete = {
  capacityRuleId: "a",
  asOf: AS_OF,
  approvalState: "APPROVED" as const,
  sourceLabel: "test-complete",
  kind: "VERIFIED_COMPLETE" as const,
};

const attributedUsage = [
  {
    permissionId: "a",
    cumulativeIncurred: 70,
    currentlyOutstanding: 70,
    prepaymentCredit: 0,
  },
];

describe("solver production authority — authenticity + trusted issuer", () => {
  it("APPROVED certificate with missing authenticity cannot establish production-authoritative remaining", () => {
    const decision = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 70,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        ...baseComplete,
        // authenticity intentionally omitted
        issuer: {
          role: "COUNSEL_REVIEWER",
          actorId: "counsel-alice",
          attestedAt: `${AS_OF}T12:00:00.000Z`,
        },
      },
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(decision.authoritativeForRemaining).toBe(false);
    expect(decision.supportsRemainingClaim).toBe(false);
    expect(assertMayPublishRemaining(decision)).toBe(false);
    expect(
      decision.blockers.some((b) => /missing authenticity/i.test(b)),
    ).toBe(true);

    const computed = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: attributedUsage,
      completenessCertificate: {
        ...baseComplete,
        issuer: {
          role: "COUNSEL_REVIEWER",
          actorId: "counsel-alice",
        },
      },
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(computed.authoritative).toBe(false);
  });

  it("forged / missing issuer authority cannot establish production-authoritative remaining", () => {
    const forged = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 70,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        ...baseComplete,
        authenticity: "AUTHENTIC",
        issuer: {
          role: "COUNSEL_REVIEWER",
          actorId: "forged-attacker",
          attestedAt: `${AS_OF}T12:00:00.000Z`,
        },
      },
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(forged.authoritativeForRemaining).toBe(false);
    expect(assertMayPublishRemaining(forged)).toBe(false);
    expect(
      forged.blockers.some((b) => /not found in trusted identity|forged|unauthorized/i.test(b)),
    ).toBe(true);

    const missingIssuer = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 70,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        ...baseComplete,
        authenticity: "AUTHENTIC",
        // issuer intentionally omitted
      },
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(missingIssuer.authoritativeForRemaining).toBe(false);
    expect(
      missingIssuer.blockers.some((b) => /unverified issuer authority|requires certificate issuer/i.test(b)),
    ).toBe(true);

    const missingTrustedAuth = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 70,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        ...baseComplete,
        authenticity: "AUTHENTIC",
        issuer: {
          role: "COUNSEL_REVIEWER",
          actorId: "counsel-alice",
        },
      },
      // trustedIssuerAuth intentionally omitted — role string alone insufficient
    });
    expect(missingTrustedAuth.authoritativeForRemaining).toBe(false);
    expect(
      missingTrustedAuth.blockers.some((b) => /trusted issuer authorization context missing|issuer\.role alone/i.test(b)),
    ).toBe(true);
  });

  it("valid AUTHENTIC cert + trusted counsel produces production-authoritative remaining", () => {
    const decision = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 70,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        ...baseComplete,
        authenticity: "AUTHENTIC",
        issuer: {
          role: "COUNSEL_REVIEWER",
          actorId: "counsel-alice",
          attestedAt: `${AS_OF}T12:00:00.000Z`,
        },
      },
      trustedIssuerAuth: PROD_AUTH,
    });
    expect(decision.authoritativeForRemaining).toBe(true);
    expect(decision.supportsRemainingClaim).toBe(true);
    expect(assertMayPublishRemaining(decision)).toBe(true);
  });

  it("preserves valid synthetic demo behavior via allowSyntheticRemaining", () => {
    const decision = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 35,
      aggregation: "NAMED_MEMBER_CLAUSES",
      allowSyntheticRemaining: true,
      completenessCertificate: {
        ...baseComplete,
        authenticity: "SYNTHETIC_LABELED",
        // no trusted issuer — demo hatch does not require production identity
      },
    });
    expect(decision.authoritativeForRemaining).toBe(true);
    expect(decision.supportsRemainingClaim).toBe(true);
    expect(assertMayPublishRemaining(decision)).toBe(true);

    // Without allow hatch, synthetic still refuses
    const refused = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 35,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: {
        ...baseComplete,
        authenticity: "SYNTHETIC_LABELED",
      },
    });
    expect(refused.authoritativeForRemaining).toBe(false);
  });
});
