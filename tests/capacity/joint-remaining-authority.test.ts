/**
 * Joint #232 / #234 remaining-authority contract.
 *
 * Product resolver and solver shared-usage helpers must agree: no path may
 * publish supported remaining from approved-but-incomplete, missing, partial,
 * stale, mismatched, synthetic-in-PRODUCTION, or contradictory evidence.
 */
import { describe, expect, it } from "vitest";
import {
  DEMO_BINDINGS,
  buildSharedProductCapacityViews,
  computeVerifiedRemaining,
  mayPublishRemainingCapacity,
  refuseAuthoritativeRemaining,
  resolveUtilization,
  syntheticCompletenessCertificate,
  type UtilizationEvidenceRecord,
} from "@/lib/capacity";
import { computeSharedConstraintCurrentUsage } from "@/lib/solver/shared-usage";
import { evaluateElection } from "@/lib/solver/election";
import { buildPermissionGraph } from "@/lib/solver/graph";
import type { SharedConstraint } from "@/lib/solver/types";

const AS_OF = "2026-10-09";
const CO = "co-joint";

function attributed(amount: number, ruleId = "rule-a"): UtilizationEvidenceRecord {
  return {
    usageId: `u-${amount}`,
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

describe("joint remaining authority (#232 solver + #234 product)", () => {
  it("approved attributed records without completeness certificate do not support remaining on either path", () => {
    const product = resolveUtilization({
      companyId: CO,
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [attributed(35)],
      executionMode: "PRODUCTION",
    });
    expect(product.supportsRemainingClaim).toBe(false);
    expect(mayPublishRemainingCapacity(product.supportsRemainingClaim)).toBe(false);

    const verified = computeVerifiedRemaining({
      gross,
      utilization: product,
      certificationStatus: "NOT_CERTIFIED",
    });
    expect(verified.mayPublishAvailable).toBe(false);
    expect(verified.supportedRemaining).toBeNull();
    expect(refuseAuthoritativeRemaining(verified).mayPublishAvailable).toBe(false);

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
      executionMode: "PRODUCTION",
    });
    expect(solver.supportsRemainingClaim).toBe(false);
    expect(solver.attributedKnown).toBe(true);
  });

  it("missing / partial / stale / mismatched / contradictory / synthetic-in-PRODUCTION never publish remaining", () => {
    const cases = [
      resolveUtilization({
        companyId: CO,
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        records: [],
        executionMode: "PRODUCTION",
      }),
      resolveUtilization({
        companyId: CO,
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        records: [attributed(10)],
        unattributedLegacyBasketPresent: true,
        executionMode: "PRODUCTION",
      }),
      resolveUtilization({
        companyId: CO,
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        records: [attributed(10)],
        executionMode: "PRODUCTION",
        currentBindings: DEMO_BINDINGS,
        completenessCertificate: syntheticCompletenessCertificate({
          kind: "VERIFIED_COMPLETE",
          capacityRuleId: "rule-a",
          companyId: CO,
          asOf: "2026-01-01",
          bindings: {
            ...DEMO_BINDINGS,
            financialStateAsOf: "2026-01-01",
          },
        }),
      }),
      resolveUtilization({
        companyId: CO,
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        records: [attributed(10)],
        executionMode: "PRODUCTION",
        currentBindings: DEMO_BINDINGS,
        completenessCertificate: syntheticCompletenessCertificate({
          kind: "VERIFIED_COMPLETE",
          capacityRuleId: "other-rule",
          companyId: CO,
          asOf: AS_OF,
        }),
      }),
      resolveUtilization({
        companyId: CO,
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        records: [attributed(10)],
        executionMode: "PRODUCTION",
        currentBindings: DEMO_BINDINGS,
        completenessCertificate: syntheticCompletenessCertificate({
          kind: "VERIFIED_EMPTY",
          capacityRuleId: "rule-a",
          companyId: CO,
          asOf: AS_OF,
        }),
      }),
      // Synthetic certificate under PRODUCTION — refuse even with matching bindings.
      resolveUtilization({
        companyId: CO,
        capacityRuleId: "rule-a",
        asOf: AS_OF,
        records: [attributed(10)],
        executionMode: "PRODUCTION",
        currentBindings: DEMO_BINDINGS,
        completenessCertificate: syntheticCompletenessCertificate({
          kind: "VERIFIED_COMPLETE",
          capacityRuleId: "rule-a",
          companyId: CO,
          asOf: AS_OF,
        }),
      }),
    ];

    for (const u of cases) {
      expect(u.supportsRemainingClaim).toBe(false);
      const v = computeVerifiedRemaining({
        gross,
        utilization: u,
        certificationStatus: "NOT_CERTIFIED",
      });
      expect(v.mayPublishAvailable).toBe(false);
      expect(v.supportedRemaining).toBeNull();
      expect(refuseAuthoritativeRemaining(v).remaining).toBeNull();
    }

    const solverSyntheticProd = computeSharedConstraintCurrentUsage({
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
        kind: "VERIFIED_COMPLETE",
        approvalState: "APPROVED",
        asOf: AS_OF,
        sourceLabel: "synth",
        authenticity: "SYNTHETIC_LABELED",
        constraintId: "sc1",
      },
      constraintId: "sc1",
      asOf: AS_OF,
      executionMode: "PRODUCTION",
    });
    expect(solverSyntheticProd.supportsRemainingClaim).toBe(false);

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
        kind: "VERIFIED_COMPLETE",
        approvalState: "APPROVED",
        asOf: AS_OF,
        sourceLabel: "auth",
        authenticity: "AUTHENTIC",
        constraintId: "sc1",
      },
      constraintId: "sc1",
      asOf: AS_OF,
      executionMode: "PRODUCTION",
    });
    expect(solverPartial.supportsRemainingClaim).toBe(false);

    const solverStale = computeSharedConstraintCurrentUsage({
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
        kind: "VERIFIED_COMPLETE",
        approvalState: "APPROVED",
        asOf: "2026-01-01",
        sourceLabel: "stale",
        authenticity: "AUTHENTIC",
        constraintId: "sc1",
      },
      constraintId: "sc1",
      asOf: AS_OF,
      executionMode: "PRODUCTION",
    });
    expect(solverStale.supportsRemainingClaim).toBe(false);
  });

  it("Position/Simulate/Ask shared views never diverge and never publish AVAILABLE without remaining support", () => {
    const utilization = resolveUtilization({
      companyId: CO,
      capacityRuleId: "rule-a",
      asOf: AS_OF,
      records: [attributed(35)],
      executionMode: "PRODUCTION",
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
    expect(views.POSITION.productionAuthoritativeRemaining).toBe(false);
  });

  it("solver election refuses favorable shared remaining without completeness", () => {
    const p = {
      id: "a",
      companyId: "co",
      documentId: "d",
      grantType: "DEBT_INCURRENCE" as const,
      amountKind: "FIXED" as const,
      action: "test",
      entityScope: [] as string[],
      formulaType: "FLAT_AMOUNT" as const,
      thresholdValue: 500,
      params: null,
      eligibilityConditions: [],
      termConditions: [],
      measurementBasis: "CURRENTLY_OUTSTANDING" as const,
      sourceProvision: { documentId: "d", sectionRef: "§1" },
      effectiveFrom: null,
      effectiveTo: null,
      modelingStatus: "MODELED" as const,
    };
    const graph = buildPermissionGraph([p], []);
    const constraint: SharedConstraint = {
      id: "sc1",
      companyId: "co",
      name: "shared",
      cap: { amount: 100 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "a" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 20,
      currentUsageStatus: "COMPUTED",
      currentUsageAuthoritative: false,
      currentUsageSupportsRemainingClaim: false,
      currentUsageAttributedKnown: true,
      currentUsageCompletenessCertified: false,
      sourceProvision: { documentId: "d", sectionRef: "§s" },
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
        transaction: {
          id: "t",
          companyId: "co",
          amount: 50,
          secured: true,
          asOfDate: new Date(AS_OF),
          incurringEntity: { id: "b", name: "Borrower" },
        },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: { activatedConditionIds: [], inactiveConditionIds: [], unknownConditionIds: [] },
        asOfDate: new Date(AS_OF),
      },
      sharedConstraints: [constraint],
      collateralScopes: [],
    });
    expect(evalResult.requirements.find((r) => r.class === "SHARED_CAP")?.status).toBe("UNKNOWN");
    expect(evalResult.legs[0]!.amountAllocated).toBe(0);
  });
});
