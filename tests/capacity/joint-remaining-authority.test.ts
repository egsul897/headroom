/**
 * Joint #239 authority gate on #237 utilization-authority.
 *
 * Product resolver + solver shared-usage must agree: no path may publish
 * supported remaining from approved-but-incomplete, missing, partial,
 * mismatched, contradictory, or synthetic production evidence.
 * Also covers overlapping shared constraints / concurrent utilization.
 */
import { describe, expect, it } from "vitest";
import {
  REMAINING_AUTHORITY_CONTRACT_VERSION,
  assertMayPublishRemaining,
  authorityFromUtilizationResolution,
  buildSharedProductCapacityViews,
  computeVerifiedRemaining,
  decideSolverUtilizationAuthority,
  mayPublishRemainingCapacity,
  resolveUtilization,
  type UtilizationEvidenceRecord,
} from "@/lib/capacity";
import { computeSharedConstraintCurrentUsage } from "@/lib/solver/shared-usage";
import { evaluateElection } from "@/lib/solver/election";
import { buildPermissionGraph } from "@/lib/solver/graph";
import type { ActivationState, Permission, SharedConstraint, Transaction } from "@/lib/solver/types";

const AS_OF = "2026-10-09";

function permission(id: string, overrides: Partial<Permission> = {}): Permission {
  return {
    id,
    documentId: "doc-1",
    companyId: "co-1",
    grantType: "DEBT_INCURRENCE",
    amountKind: "FIXED",
    action: `permission ${id}`,
    entityScope: [],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 500,
    eligibilityConditions: [],
    termConditions: [],
    measurementBasis: "CURRENTLY_OUTSTANDING",
    sourceProvision: { documentId: "doc-1", sectionRef: `§${id}` },
    modelingStatus: "MODELED",
    ...overrides,
  };
}

const emptyActivationState: ActivationState = {
  asOfDate: new Date(AS_OF),
  series: {},
  events: [],
  usageCounts: {},
  unknownKeys: new Set(),
};

const baseTransaction: Transaction = {
  transactionType: "DEBT_INCURRENCE",
  amount: 50,
  currency: { code: "USD" },
  incurringEntity: { id: "borrower", name: "Borrower" },
  guarantorStatus: "GUARANTOR",
  secured: true,
  collateralPools: [],
  requestedLienPriority: [],
  useOfProceeds: "GENERAL_CORPORATE",
  acquisitionRelated: false,
  transactionDate: new Date(AS_OF),
};

function attributed(amount: number, ruleId = "rule-a"): UtilizationEvidenceRecord {
  return {
    usageId: `u-${amount}-${ruleId}`,
    kind: "ATTRIBUTED_RULE",
    amount,
    currency: "USD",
    effectiveAsOf: AS_OF,
    capacityRuleId: ruleId,
    sharedCapacityId: null,
    legacyBasketFamily: null,
    entityKey: null,
    status: "RECORDED",
    approvalState: "APPROVED",
    sourceLabel: "test",
    authenticity: "SYNTHETIC_LABELED",
  };
}

const gross = {
  amount: 100,
  gateSatisfied: true,
  modeled: true,
  capacityRuleId: "rule-a",
};

const authenticComplete = {
  capacityRuleId: "rule-a",
  asOf: AS_OF,
  approvalState: "APPROVED" as const,
  sourceLabel: "auth-complete",
  kind: "VERIFIED_COMPLETE" as const,
};

describe("joint remaining authority on #237 utilization-authority", () => {
  it("pins joint contract version to #237 authority module", () => {
    expect(REMAINING_AUTHORITY_CONTRACT_VERSION).toBe("joint-232-234.on-237.v1");
  });

  it("approved attributed records without completeness do not support remaining on either path", () => {
    const product = resolveUtilization({
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [attributed(35)],
    });
    expect(product.supportsRemainingClaim).toBe(false);
    expect(mayPublishRemainingCapacity(product.supportsRemainingClaim)).toBe(false);
    expect(assertMayPublishRemaining(authorityFromUtilizationResolution(product))).toBe(false);

    const verified = computeVerifiedRemaining({
      gross,
      utilization: product,
      certificationStatus: "NOT_CERTIFIED",
    });
    expect(verified.mayPublishAvailable).toBe(false);
    expect(verified.supportedRemaining).toBeNull();

    const solver = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "rule-a" }],
      basketUsage: [
        {
          permissionId: "rule-a",
          cumulativeIncurred: 35,
          currentlyOutstanding: 35,
          prepaymentCredit: 0,
        },
      ],
    });
    expect(solver.authoritative).toBe(false);
    expect(assertMayPublishRemaining(decideSolverUtilizationAuthority({
      namedMemberCount: 1,
      attributedMemberCount: 1,
      measuredUsage: 35,
      aggregation: "NAMED_MEMBER_CLAUSES",
    }))).toBe(false);
  });

  it("missing / partial / mismatched / contradictory / synthetic-in-production never publish remaining", () => {
    const missing = resolveUtilization({ capacityRuleId: "rule-a", asOf: AS_OF, records: [] });
    const partial = resolveUtilization({
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [attributed(10)],
      unattributedLegacyBasketPresent: true,
    });
    const mismatched = resolveUtilization({
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [attributed(10)],
      completenessCertificate: { ...authenticComplete, capacityRuleId: "other-rule" },
    });
    const contradictory = resolveUtilization({
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [attributed(10)],
      completenessCertificate: {
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        approvalState: "APPROVED",
        sourceLabel: "empty-vs-usage",
        kind: "VERIFIED_EMPTY",
      },
    });

    for (const u of [missing, partial, mismatched, contradictory]) {
      expect(u.supportsRemainingClaim).toBe(false);
      const v = computeVerifiedRemaining({
        gross,
        utilization: u,
        certificationStatus: "NOT_CERTIFIED",
      });
      expect(v.mayPublishAvailable).toBe(false);
      expect(v.supportedRemaining).toBeNull();
    }

    const syntheticProd = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }],
      basketUsage: [
        {
          permissionId: "a",
          cumulativeIncurred: 10,
          currentlyOutstanding: 10,
          prepaymentCredit: 0,
        },
      ],
      completenessCertificate: {
        capacityRuleId: "a",
        asOf: AS_OF,
        approvalState: "APPROVED",
        sourceLabel: "synth",
        kind: "VERIFIED_COMPLETE",
        authenticity: "SYNTHETIC_LABELED",
      },
    });
    expect(syntheticProd.authoritative).toBe(false);

    const solverPartial = computeSharedConstraintCurrentUsage({
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
      completenessCertificate: {
        capacityRuleId: "a",
        asOf: AS_OF,
        approvalState: "APPROVED",
        sourceLabel: "auth",
        kind: "VERIFIED_COMPLETE",
        authenticity: "AUTHENTIC",
      },
    });
    expect(solverPartial.authoritative).toBe(false);
    expect(solverPartial.status).toBe("PARTIAL_ATTRIBUTED_USAGE");
  });

  it("Position/Simulate/Ask never diverge and never publish AVAILABLE without remaining support", () => {
    const utilization = resolveUtilization({
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [attributed(35)],
    });
    const views = buildSharedProductCapacityViews({
      gross,
      utilization,
      certificationStatus: "NOT_CERTIFIED",
    });
    expect(views.POSITION.mayPublishAvailable).toBe(false);
    expect(views.SIMULATE.mayPublishAvailable).toBe(false);
    expect(views.ASK.mayPublishAvailable).toBe(false);
    expect(views.POSITION.supportedRemainingCapacity).toBeNull();
    expect(views.SIMULATE.supportedRemainingCapacity).toBe(
      views.POSITION.supportedRemainingCapacity,
    );
    expect(views.ASK.publicationLabel).toBe(views.POSITION.publicationLabel);
  });

  it("solver election refuses favorable shared remaining without authoritative completeness", () => {
    const p = permission("a");
    const graph = buildPermissionGraph([p], []);
    const constraint: SharedConstraint = {
      id: "sc1",
      companyId: "co-1",
      name: "shared",
      cap: { amount: 100 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "a" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 20,
      currentUsageStatus: "ATTRIBUTED_INCOMPLETE",
      currentUsageAuthoritative: false,
      sourceProvision: { documentId: "doc-1", sectionRef: "§s" },
    };
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["a"], rationale: "" },
      permissionsById: new Map([["a", p]]),
      graph,
      financials: {
        ebitda: 100,
        cash: 10,
        interestExpense: 5,
        cumulativeNetIncome: 0,
        equityProceedsSinceIssue: 0,
        assumedNewDebtRatePct: 5,
        totalDebt: 50,
        securedDebt: 40,
      },
      requestedAmount: 50,
      eligibilityContext: {
        transaction: baseTransaction,
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date(AS_OF),
      },
      sharedConstraints: [constraint],
      collateralScopes: [],
    });
    expect(evalResult.requirements.find((r) => r.class === "SHARED_CAP")?.status).toBe("UNKNOWN");
    expect(evalResult.legs[0]!.amountAllocated).toBe(0);
  });

  it("overlapping shared constraints / concurrent utilization refuse remaining without per-constraint completeness", () => {
    // Two overlapping baskets share member "a"; concurrent attributed usage on both
    // without completeness must not publish remaining on either constraint.
    const scA = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }, { permissionId: "b" }],
      basketUsage: [
        { permissionId: "a", cumulativeIncurred: 40, currentlyOutstanding: 40, prepaymentCredit: 0 },
        { permissionId: "b", cumulativeIncurred: 10, currentlyOutstanding: 10, prepaymentCredit: 0 },
      ],
    });
    const scB = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }, { permissionId: "c" }],
      basketUsage: [
        { permissionId: "a", cumulativeIncurred: 40, currentlyOutstanding: 40, prepaymentCredit: 0 },
        { permissionId: "c", cumulativeIncurred: 5, currentlyOutstanding: 5, prepaymentCredit: 0 },
      ],
    });
    expect(scA.authoritative).toBe(false);
    expect(scB.authoritative).toBe(false);
    expect(scA.usage).toBe(50);
    expect(scB.usage).toBe(45);

    // Completeness on A only — B still blocked (concurrent/overlap does not leak authority).
    const scACertified = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }, { permissionId: "b" }],
      basketUsage: [
        { permissionId: "a", cumulativeIncurred: 40, currentlyOutstanding: 40, prepaymentCredit: 0 },
        { permissionId: "b", cumulativeIncurred: 10, currentlyOutstanding: 10, prepaymentCredit: 0 },
      ],
      completenessCertificate: {
        capacityRuleId: "sc-a",
        asOf: AS_OF,
        approvalState: "APPROVED",
        sourceLabel: "sc-a-complete",
        kind: "VERIFIED_COMPLETE",
        authenticity: "AUTHENTIC",
      },
    });
    const scBStillOpen = computeSharedConstraintCurrentUsage({
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      measurementBasis: "CURRENTLY_OUTSTANDING",
      members: [{ permissionId: "a" }, { permissionId: "c" }],
      basketUsage: [
        { permissionId: "a", cumulativeIncurred: 40, currentlyOutstanding: 40, prepaymentCredit: 0 },
        { permissionId: "c", cumulativeIncurred: 5, currentlyOutstanding: 5, prepaymentCredit: 0 },
      ],
    });
    expect(scACertified.authoritative).toBe(true);
    expect(scBStillOpen.authoritative).toBe(false);

    const pA = permission("a");
    const pB = permission("b", { id: "b" });
    const graph = buildPermissionGraph([pA, pB], []);
    const constraints: SharedConstraint[] = [
      {
        id: "sc-a",
        companyId: "co-1",
        name: "overlap-a",
        cap: { amount: 100 },
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        members: [{ permissionId: "a" }, { permissionId: "b" }],
        measurementBasis: "CURRENTLY_OUTSTANDING",
        followsRefinancing: false,
        currentUsage: 50,
        currentUsageStatus: "COMPUTED",
        currentUsageAuthoritative: true,
        sourceProvision: { documentId: "doc-1", sectionRef: "§a" },
      },
      {
        id: "sc-b",
        companyId: "co-1",
        name: "overlap-b",
        cap: { amount: 80 },
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        members: [{ permissionId: "a" }, { permissionId: "c" }],
        measurementBasis: "CURRENTLY_OUTSTANDING",
        followsRefinancing: false,
        currentUsage: 45,
        currentUsageStatus: "ATTRIBUTED_INCOMPLETE",
        currentUsageAuthoritative: false,
        sourceProvision: { documentId: "doc-1", sectionRef: "§b" },
      },
    ];
    // Election on member a hits both constraints; non-authoritative sc-b must block favorable remaining.
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["a"], rationale: "" },
      permissionsById: new Map([["a", pA], ["b", pB]]),
      graph,
      financials: {
        ebitda: 100,
        cash: 10,
        interestExpense: 5,
        cumulativeNetIncome: 0,
        equityProceedsSinceIssue: 0,
        assumedNewDebtRatePct: 5,
        totalDebt: 50,
        securedDebt: 40,
      },
      requestedAmount: 30,
      eligibilityContext: {
        transaction: baseTransaction,
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date(AS_OF),
      },
      sharedConstraints: constraints,
      collateralScopes: [],
    });
    const sharedReqs = evalResult.requirements.filter((r) => r.class === "SHARED_CAP");
    expect(sharedReqs.some((r) => r.status === "UNKNOWN")).toBe(true);
    expect(evalResult.legs[0]!.amountAllocated).toBe(0);
  });
});
