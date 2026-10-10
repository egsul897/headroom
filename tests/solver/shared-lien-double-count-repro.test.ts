/**
 * HIGH-severity reproduction: two independent LIEN permissions on one $100M
 * shared constraint must not authorize $150M secured debt (double-count).
 *
 * Independent expectation (frozen before engine run):
 *   shared remaining = 100 − 0 = 100
 *   proposed = 150
 *   150 > 100 ⇒ must NOT CLEAR; maxCapacity ≤ 100
 */
import { describe, expect, it } from "vitest";
import { buildPermissionGraph } from "../../lib/solver/graph";
import { buildPermissionPaths, evaluateElection } from "../../lib/solver/election";
import { runSolver } from "../../lib/solver/service";
import type {
  ActivationState,
  Permission,
  PermissionRelationship,
  SharedConstraint,
  Transaction,
} from "../../lib/solver/types";

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
    thresholdValue: 100,
    eligibilityConditions: [],
    termConditions: [],
    measurementBasis: "CUMULATIVE_INCURRED",
    sourceProvision: { documentId: "doc-1", sectionRef: `§${id}` },
    modelingStatus: "MODELED",
    ...overrides,
  };
}

function rel(overrides: Partial<PermissionRelationship>): PermissionRelationship {
  return {
    id: overrides.id ?? `${overrides.fromPermissionId}-${overrides.toPermissionId}`,
    companyId: "co-1",
    fromPermissionId: "a",
    toPermissionId: "b",
    relationshipType: "CONCURRENT_DISREGARDED",
    sourceProvision: { documentId: "doc-1", sectionRef: "§rel" },
    ...overrides,
  };
}

const FIN = {
  ebitda: 500,
  cash: 50,
  interestExpense: 40,
  cumulativeNetIncome: 0,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 7,
  totalDebt: 800,
  securedDebt: 400,
};
const emptyActivationState: ActivationState = {
  asOfDate: new Date("2026-06-30"),
  series: {},
  events: [],
  usageCounts: {},
  unknownKeys: new Set(),
};
const baseTransaction: Transaction = {
  transactionType: "DEBT_INCURRENCE",
  amount: 150,
  currency: { code: "USD" },
  incurringEntity: { id: "borrower", name: "Borrower" },
  guarantorStatus: "GUARANTOR",
  secured: true,
  collateralPools: [],
  requestedLienPriority: [],
  useOfProceeds: "GENERAL_CORPORATE",
  acquisitionRelated: false,
  transactionDate: new Date("2026-06-30"),
};

describe("HIGH: shared-constraint double-count across two independent liens", () => {
  it("two $100 independent liens on one $100 shared constraint cannot CLEAR $150 secured", () => {
    // Frozen independent expectation
    const sharedCap = 100;
    const proposed = 150;
    expect(proposed).toBeGreaterThan(sharedCap);

    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const shared: SharedConstraint = {
      id: "sc-lien-pool",
      companyId: "co-1",
      name: "Single $100 shared lien pool",
      cap: { amount: sharedCap },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien-a" }, { permissionId: "lien-b" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 0,
      currentUsageAuthoritative: true,
      currentUsageStatus: "VERIFIED_ZERO",
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
    };
    const relationships = [
      rel({ fromPermissionId: "debt", toPermissionId: "lien-a", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "debt", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "lien-a", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
    ];
    const graph = buildPermissionGraph([debt, lienA, lienB], relationships);
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien-a", "lien-b"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien-a", lienA],
        ["lien-b", lienB],
      ]),
      graph,
      financials: FIN,
      requestedAmount: proposed,
      eligibilityContext: {
        transaction: { ...baseTransaction, amount: proposed, secured: true },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });

    const pathStatus = buildPermissionPaths([evalResult])[0]!.status;
    console.log(
      JSON.stringify(
        {
          pathStatus,
          totalAllocated: evalResult.totalAllocated,
          maxCapacity: evalResult.maxCapacity,
          lienReqs: evalResult.requirements
            .filter((r) => r.class === "LIEN_PERMISSION" || r.class === "SHARED_CAP")
            .map((r) => ({ class: r.class, status: r.status, detail: r.detail })),
        },
        null,
        2,
      ),
    );

    // Defect if CLEAR or maxCapacity > sharedCap (double-count of two $100 liens).
    expect(pathStatus).not.toBe("CLEAR");
    expect(evalResult.maxCapacity === undefined || evalResult.maxCapacity <= sharedCap + 1e-6).toBe(true);
    if (evalResult.maxCapacity !== undefined) {
      expect(evalResult.maxCapacity).toBeLessThanOrEqual(sharedCap + 1e-6);
    }
  });

  it("partial utilization: $40 used + two $100 liens still caps at $60 remaining", () => {
    const sharedCap = 100;
    const used = 40;
    const remaining = sharedCap - used;
    const proposed = 90;
    expect(proposed).toBeGreaterThan(remaining);

    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const shared: SharedConstraint = {
      id: "sc-lien-pool",
      companyId: "co-1",
      name: "Shared lien pool with $40 utilization",
      cap: { amount: sharedCap },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien-a" }, { permissionId: "lien-b" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: used,
      currentUsageAuthoritative: true,
      currentUsageStatus: "VERIFIED_PARTIAL",
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
    };
    const relationships = [
      rel({ fromPermissionId: "debt", toPermissionId: "lien-a", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "debt", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "lien-a", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
    ];
    const graph = buildPermissionGraph([debt, lienA, lienB], relationships);
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien-a", "lien-b"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien-a", lienA],
        ["lien-b", lienB],
      ]),
      graph,
      financials: FIN,
      requestedAmount: proposed,
      eligibilityContext: {
        transaction: { ...baseTransaction, amount: proposed, secured: true },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    const pathStatus = buildPermissionPaths([evalResult])[0]!.status;
    expect(pathStatus).not.toBe("CLEAR");
    expect(evalResult.maxCapacity === undefined || evalResult.maxCapacity <= remaining + 1e-6).toBe(true);
  });

  it("non-authoritative shared utilization fails closed (UNKNOWN, not CLEAR)", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const shared: SharedConstraint = {
      id: "sc-lien-pool",
      companyId: "co-1",
      name: "Shared lien pool unknown util",
      cap: { amount: 100 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien-a" }, { permissionId: "lien-b" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 0,
      currentUsageAuthoritative: false,
      currentUsageStatus: "ZERO_NO_ATTRIBUTED_USAGE",
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
    };
    const graph = buildPermissionGraph(
      [debt, lienA, lienB],
      [
        rel({ fromPermissionId: "debt", toPermissionId: "lien-a", relationshipType: "CONCURRENT_DISREGARDED" }),
        rel({ fromPermissionId: "debt", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
        rel({ fromPermissionId: "lien-a", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
      ],
    );
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien-a", "lien-b"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien-a", lienA],
        ["lien-b", lienB],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: { ...baseTransaction, amount: 50, secured: true },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    const pathStatus = buildPermissionPaths([evalResult])[0]!.status;
    // Fail-closed: must not CLEAR when shared utilization is non-authoritative.
    expect(pathStatus).not.toBe("CLEAR");
    expect(["UNKNOWN", "BLOCKED", "REVIEW_REQUIRED"]).toContain(pathStatus);
  });

  it("runSolver EXACT maxCapacity also ≤ $100 shared constraint", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const shared: SharedConstraint = {
      id: "sc-lien-pool",
      companyId: "co-1",
      name: "Single $100 shared lien pool",
      cap: { amount: 100 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien-a" }, { permissionId: "lien-b" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 0,
      currentUsageAuthoritative: true,
      currentUsageStatus: "VERIFIED_ZERO",
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
    };
    const result = runSolver({
      eligiblePermissions: [debt, lienA, lienB],
      relationships: [
        rel({ fromPermissionId: "debt", toPermissionId: "lien-a", relationshipType: "CONCURRENT_DISREGARDED" }),
        rel({ fromPermissionId: "debt", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
        rel({ fromPermissionId: "lien-a", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
      ],
      sharedConstraints: [shared],
      collateralScopes: [],
      ruleActivationConditions: [],
      financials: FIN,
      transaction: { ...baseTransaction, amount: 1, secured: true },
      entityClasses: ["BORROWER"],
      activationState: emptyActivationState,
      asOfDate: emptyActivationState.asOfDate,
    });
    const mc = result.overall.maximumCapacity;
    console.log(JSON.stringify({ mc, overall: result.overall.status }, null, 2));
    expect(mc?.kind).toBe("EXACT");
    if (mc?.kind === "EXACT") {
      expect(mc.amount).toBeLessThanOrEqual(100 + 1e-6);
    }
  });
});
