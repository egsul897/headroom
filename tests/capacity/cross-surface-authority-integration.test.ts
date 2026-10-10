/**
 * Cross-surface authority integration gate (PR #250).
 *
 * Exercises the actual Solver / Position / Simulate / Ask capacity authority
 * paths — decideSolverUtilizationAuthority, computeSharedConstraintCurrentUsage,
 * resolveUtilization → computeVerifiedRemaining → buildSharedProductCapacityViews.
 *
 * Prevents production-authoritative remaining from forged, unauthenticated,
 * synthetic, incomplete, or unauthorized evidence. Synthetic demo hatch is
 * tested separately and must not be reachable via production request inputs.
 */
import { describe, expect, it } from "vitest";
import {
  assertMayPublishRemaining,
  assertProductCapacityConsistency,
  buildSharedProductCapacityViews,
  computeVerifiedRemaining,
  decideSolverUtilizationAuthority,
  evidenceFromAttributedLedger,
  productionTrustedIssuerAuth,
  refuseAuthoritativeRemaining,
  resolveUtilization,
  sessionCounselPrincipal,
  sessionCustodianPrincipal,
} from "@/lib/capacity";
import { computeSharedConstraintCurrentUsage } from "@/lib/solver/shared-usage";

const AS_OF = "2026-10-09";
const RULE = "basket-xsurf";
const CO_AUTH = productionTrustedIssuerAuth([
  sessionCounselPrincipal("counsel-alice"),
  sessionCustodianPrincipal("custodian-bob"),
]);

const baseCert = {
  capacityRuleId: RULE,
  asOf: AS_OF,
  approvalState: "APPROVED" as const,
  sourceLabel: "xsurf-cert",
};

const validIssuer = {
  role: "COUNSEL_REVIEWER" as const,
  actorId: "counsel-alice",
  attestedAt: `${AS_OF}T12:00:00.000Z`,
};

const authenticComplete = {
  ...baseCert,
  kind: "VERIFIED_COMPLETE" as const,
  authenticity: "AUTHENTIC" as const,
  issuer: validIssuer,
};

const authenticRecord = evidenceFromAttributedLedger({
  usageId: "u-auth",
  amount: 40,
  currency: "USD",
  effectiveAsOf: "2026-01-01",
  capacityRuleId: RULE,
  status: "ACTIVE",
  approvalState: "APPROVED",
  sourceLabel: "authentic-ledger",
  authenticity: "AUTHENTIC",
});

const syntheticRecord = evidenceFromAttributedLedger({
  usageId: "u-syn",
  amount: 10,
  currency: "USD",
  effectiveAsOf: "2026-01-01",
  capacityRuleId: RULE,
  status: "ACTIVE",
  approvalState: "APPROVED",
  sourceLabel: "synthetic-fixture",
  authenticity: "SYNTHETIC_LABELED",
});

type CertInput = {
  capacityRuleId: string;
  asOf: string;
  approvalState: "APPROVED";
  sourceLabel: string;
  kind: "VERIFIED_EMPTY" | "VERIFIED_COMPLETE";
  authenticity?: "AUTHENTIC" | "SYNTHETIC_LABELED";
  issuer?: {
    role: "COUNSEL_REVIEWER" | "LEDGER_CUSTODIAN" | "SYSTEM_FIXTURE";
    actorId: string;
    attestedAt?: string;
  };
};

function productViews(over: {
  cert?: CertInput | null;
  records?: ReturnType<typeof evidenceFromAttributedLedger>[];
  trustedIssuerAuth?: typeof CO_AUTH | null;
  allowSyntheticRemaining?: boolean;
  gateSatisfied?: boolean;
}) {
  return buildSharedProductCapacityViews({
    gross: {
      amount: 100,
      gateSatisfied: over.gateSatisfied ?? true,
      modeled: true,
      capacityRuleId: RULE,
    },
    utilization: {
      capacityRuleId: RULE,
      asOf: AS_OF,
      records: over.records ?? [authenticRecord],
      completenessCertificate: over.cert === undefined ? authenticComplete : over.cert,
      trustedIssuerAuth: over.trustedIssuerAuth === undefined ? CO_AUTH : over.trustedIssuerAuth,
      allowSyntheticRemaining: over.allowSyntheticRemaining,
    },
  });
}

function expectAllSurfacesRefuse(
  views: ReturnType<typeof buildSharedProductCapacityViews>,
  diagnostic: RegExp,
) {
  for (const surface of ["POSITION", "SIMULATE", "ASK"] as const) {
    expect(views[surface].supportedRemainingCapacity, surface).toBeNull();
    expect(views[surface].mayPublishAvailable, surface).toBe(false);
    expect(views[surface].publicationLabel, surface).not.toBe("AVAILABLE");
    expect(
      views[surface].blockers.some((b) => diagnostic.test(b)),
      `${surface} diagnostic`,
    ).toBe(true);
  }
  expect(assertProductCapacityConsistency(views)).toEqual({ ok: true });
}

describe("cross-surface authority — Solver / Position / Simulate / Ask", () => {
  it("APPROVED certificate, authenticity missing → REFUSE on all surfaces + solver", () => {
    const cert = { ...baseCert, kind: "VERIFIED_COMPLETE" as const, issuer: validIssuer };
    const solver = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 40,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: cert,
      trustedIssuerAuth: CO_AUTH,
    });
    expect(solver.authoritativeForRemaining).toBe(false);
    expect(assertMayPublishRemaining(solver)).toBe(false);
    expect(solver.blockers.some((b) => /missing authenticity/i.test(b))).toBe(true);

    const views = productViews({ cert });
    expectAllSurfacesRefuse(views, /missing authenticity|not production-authoritative|completeness not certified/i);
  });

  it("APPROVED certificate, forged issuer → REFUSE", () => {
    const cert = {
      ...authenticComplete,
      issuer: {
        role: "COUNSEL_REVIEWER" as const,
        actorId: "forged-attacker",
        attestedAt: `${AS_OF}T12:00:00.000Z`,
      },
    };
    const shared = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [
        {
          permissionId: "a",
          cumulativeIncurred: 40,
          currentlyOutstanding: 40,
          prepaymentCredit: 0,
        },
      ],
      completenessCertificate: { ...cert, capacityRuleId: "a" },
      trustedIssuerAuth: CO_AUTH,
    });
    expect(shared.authoritative).toBe(false);

    const views = productViews({ cert });
    expectAllSurfacesRefuse(views, /not found in trusted identity|forged|unauthorized|not production-authoritative/i);
  });

  it("AUTHENTIC certificate, no trusted issuer context → REFUSE", () => {
    const views = productViews({ trustedIssuerAuth: null });
    expectAllSurfacesRefuse(views, /trusted issuer authorization context missing|issuer\.role alone|not production-authoritative/i);

    const util = resolveUtilization({
      capacityRuleId: RULE,
      asOf: AS_OF,
      records: [authenticRecord],
      completenessCertificate: authenticComplete,
      trustedIssuerAuth: null,
    });
    expect(util.supportsRemainingClaim).toBe(false);
    expect(util.productionAuthoritative).toBe(false);
  });

  it("AUTHENTIC certificate, unauthorized issuer role → REFUSE", () => {
    const auth = productionTrustedIssuerAuth([
      {
        actorId: "counsel-alice",
        authorizedRoles: ["LEDGER_CUSTODIAN"],
        identityAssurance: "SESSION_AUTHENTICATED",
        status: "ACTIVE",
      },
    ]);
    const views = productViews({ trustedIssuerAuth: auth });
    expectAllSurfacesRefuse(views, /not authorized for role COUNSEL_REVIEWER|not production-authoritative/i);
  });

  it("AUTHENTIC certificate, valid trusted issuer → may publish remaining (all surfaces agree)", () => {
    const views = productViews({});
    for (const surface of ["POSITION", "SIMULATE", "ASK"] as const) {
      expect(views[surface].supportedRemainingCapacity).toBe(60);
      expect(views[surface].mayPublishAvailable).toBe(true);
      expect(views[surface].publicationLabel).toBe("AVAILABLE");
    }
    expect(assertProductCapacityConsistency(views)).toEqual({ ok: true });

    const solver = decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 40,
      aggregation: "NAMED_MEMBER_CLAUSES",
      completenessCertificate: authenticComplete,
      trustedIssuerAuth: CO_AUTH,
    });
    expect(solver.authoritativeForRemaining).toBe(true);
  });

  it("SYNTHETIC_LABELED certificate → REFUSE production authority", () => {
    const cert = {
      ...baseCert,
      kind: "VERIFIED_COMPLETE" as const,
      authenticity: "SYNTHETIC_LABELED" as const,
    };
    const views = productViews({ cert, records: [syntheticRecord] });
    expectAllSurfacesRefuse(views, /synthetic|not production-authoritative/i);
  });

  it("Mixed authentic and synthetic usage → REFUSE production-authoritative remaining", () => {
    const views = productViews({ records: [authenticRecord, syntheticRecord] });
    expectAllSurfacesRefuse(views, /mixed authentic and synthetic|not production-authoritative/i);
  });

  it("Empty ledger, no verified-empty evidence → UNKNOWN", () => {
    const util = resolveUtilization({
      capacityRuleId: RULE,
      asOf: AS_OF,
      records: [],
    });
    expect(util.knowledge).toBe("UNKNOWN");
    expect(util.supportsRemainingClaim).toBe(false);
    expect(util.blockers.some((b) => /empty ledger|never defaulted to zero/i.test(b))).toBe(true);

    const views = productViews({ cert: null, records: [] });
    expectAllSurfacesRefuse(views, /empty ledger|never defaulted|completeness|UNKNOWN|not supported/i);
  });

  it("Attributed usage, no completeness certificate → INCOMPLETE / NOT DETERMINED", () => {
    const util = resolveUtilization({
      capacityRuleId: RULE,
      asOf: AS_OF,
      records: [authenticRecord],
    });
    expect(util.knowledge).toBe("KNOWN_ATTRIBUTED");
    expect(util.supportsRemainingClaim).toBe(false);
    expect(util.blockers.some((b) => /do not establish completeness/i.test(b))).toBe(true);

    const views = productViews({ cert: null });
    expect(views.POSITION.supportedRemainingCapacity).toBeNull();
    expect(views.POSITION.mayPublishAvailable).toBe(false);
    expect(views.POSITION.publicationLabel).toBe("GROSS_CONTRACTUAL");
  });

  it("EXTERNAL_INSTRUMENT_BALANCE / ENTITY_CLASS_FILTER without verified evidence → REFUSE", () => {
    for (const aggregation of ["EXTERNAL_INSTRUMENT_BALANCE", "ENTITY_CLASS_FILTER"] as const) {
      const d = decideSolverUtilizationAuthority({
        namedMemberCount: 1,
        attributedMemberCount: 0,
        measuredUsage: 0,
        aggregation,
        completenessCertificate: authenticComplete,
        trustedIssuerAuth: CO_AUTH,
      });
      expect(d.authoritativeForRemaining).toBe(false);
      expect(d.kind).toBe("EXTERNAL_UNKNOWN");
      expect(assertMayPublishRemaining(d)).toBe(false);
    }
  });

  it("synthetic demo hatch works only with allowSyntheticRemaining — not via production inputs", () => {
    const demo = computeVerifiedRemaining({
      gross: { amount: 100, gateSatisfied: true, modeled: true, capacityRuleId: RULE },
      utilization: {
        capacityRuleId: RULE,
        asOf: AS_OF,
        records: [syntheticRecord],
        completenessCertificate: {
          ...baseCert,
          kind: "VERIFIED_COMPLETE",
          authenticity: "SYNTHETIC_LABELED",
        },
        allowSyntheticRemaining: true,
      },
      allowSyntheticRemaining: true,
    });
    expect(demo.utilization.supportsRemainingClaim).toBe(true);
    expect(demo.utilization.productionAuthoritative).toBe(false);
    expect(demo.supportedRemaining).toBe(90);
    // Product views still strip non-production remaining.
    const gated = refuseAuthoritativeRemaining(demo);
    expect(gated.remaining).toBeNull();
    expect(gated.mayPublishAvailable).toBe(false);
  });
});
