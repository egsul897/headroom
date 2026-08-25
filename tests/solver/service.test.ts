import { describe, expect, it } from "vitest";
import { runSolver } from "../../lib/solver/service";
import type { ActivationState, Permission, PermissionRelationship, SharedConstraint, Transaction } from "../../lib/solver/types";

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

const FIN = { ebitda: 500, cash: 50, interestExpense: 40, cumulativeNetIncome: 0, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 7, totalDebt: 800, securedDebt: 400 };
const activationState: ActivationState = { asOfDate: new Date(), series: {}, events: [], usageCounts: {}, unknownKeys: new Set() };
const transaction: Transaction = {
  transactionType: "DEBT_INCURRENCE",
  amount: 100,
  currency: { code: "USD" },
  incurringEntity: { id: "borrower", name: "Borrower" },
  guarantorStatus: "GUARANTOR",
  secured: false,
  collateralPools: [],
  requestedLienPriority: [],
  useOfProceeds: "GENERAL_CORPORATE",
  acquisitionRelated: false,
  transactionDate: new Date("2026-06-30"),
};

describe("Phase 7 - service layer (lib/solver/service.ts)", () => {
  it("returns a full SolverResult with StateDelta, sources, and search stats for a trivial single-permission election", () => {
    const p = permission("a", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
    const result = runSolver({
      eligiblePermissions: [p],
      relationships: [],
      sharedConstraints: [],
      collateralScopes: [],
      ruleActivationConditions: [],
      financials: FIN,
      transaction,
      entityClasses: [],
      activationState,
      asOfDate: new Date("2026-06-30"),
    });

    expect(result.overall.status).toBe("CLEAR");
    expect(result.permissionPathUsed?.legs[0]!.amountAllocated).toBe(100);
    expect(result.permissionPathUsed?.stateEffects.debtOutstandingDelta).toEqual([{ permissionId: "a", amount: 100 }]);
    expect(result.permissionPathUsed?.stateEffects.leverageMetricsProForma).toBeDefined();
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.searchStats.evaluatedElections).toBe(1);
    expect(result.searchStats.limitExceeded).toBe(false);
    expect(result.searchStats.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("never mutates the financials object passed in (simulation/execution separation, task §15)", () => {
    const p = permission("a", { thresholdValue: 300 });
    const finCopy = { ...FIN };
    runSolver({
      eligiblePermissions: [p],
      relationships: [],
      sharedConstraints: [],
      collateralScopes: [],
      ruleActivationConditions: [],
      financials: finCopy,
      transaction,
      entityClasses: [],
      activationState,
      asOfDate: new Date("2026-06-30"),
    });
    expect(finCopy).toEqual(FIN);
  });

  it("fails closed with REVIEW_REQUIRED + SEARCH_LIMIT_EXCEEDED reason when the permission count exceeds the enumeration cap", () => {
    const perms = Array.from({ length: 25 }, (_, i) => permission(`p${i}`));
    const result = runSolver({
      eligiblePermissions: perms,
      relationships: [],
      sharedConstraints: [],
      collateralScopes: [],
      ruleActivationConditions: [],
      financials: FIN,
      transaction,
      entityClasses: [],
      activationState,
      asOfDate: new Date("2026-06-30"),
      maxPermissionsPerSide: 20,
    });
    expect(result.overall.status).toBe("REVIEW_REQUIRED");
    expect(result.searchStats.limitExceeded).toBe(true);
    expect(result.uncertainty.reviewItems.some((r) => r.reasonCategory === "SEARCH_LIMIT_EXCEEDED")).toBe(true);
  });

  it("is deterministic - identical inputs produce identical (non-timing) outputs across repeated runs", () => {
    const p1 = permission("a", { thresholdValue: 300 });
    const p2 = permission("b", { thresholdValue: 200 });
    const rel: PermissionRelationship = { id: "r", companyId: "co-1", fromPermissionId: "a", toPermissionId: "b", relationshipType: "CONCURRENT_COUNTED", sourceProvision: { documentId: "doc-1", sectionRef: "§r" } };
    const run = () =>
      runSolver({
        eligiblePermissions: [p1, p2],
        relationships: [rel],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: { ...transaction, amount: 50 },
        entityClasses: [],
        activationState,
        asOfDate: new Date("2026-06-30"),
      });
    const r1 = run();
    const r2 = run();
    expect(r1.overall.status).toBe(r2.overall.status);
    expect(r1.permissionPathUsed?.legs).toEqual(r2.permissionPathUsed?.legs);
    expect(r1.overall.maximumCapacity).toEqual(r2.overall.maximumCapacity);
  });

  it("caps allocation across two members of the SAME shared constraint jointly, not independently", () => {
    const p1 = permission("a", { thresholdValue: 200 });
    const p2 = permission("b", { thresholdValue: 200 });
    const rel: PermissionRelationship = { id: "r", companyId: "co-1", fromPermissionId: "a", toPermissionId: "b", relationshipType: "CONCURRENT_COUNTED", sourceProvision: { documentId: "doc-1", sectionRef: "§r" } };
    const constraint: SharedConstraint = {
      id: "sc-1",
      companyId: "co-1",
      name: "Shared cap",
      cap: { amount: 150 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "a" }, { permissionId: "b" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 0,
      sourceProvision: { documentId: "doc-1", sectionRef: "§sc" },
    };
    const result = runSolver({
      eligiblePermissions: [p1, p2],
      relationships: [rel],
      sharedConstraints: [constraint],
      collateralScopes: [],
      ruleActivationConditions: [],
      financials: FIN,
      transaction: { ...transaction, amount: 300 },
      entityClasses: [],
      activationState,
      asOfDate: new Date("2026-06-30"),
    });
    // $300 was requested but the shared cap only has $150 of headroom -
    // never a silent partial CLEAR; the transaction as a whole BLOCKS.
    expect(result.overall.status).toBe("BLOCKED");
    const jointPath = result.alternatives.find((a) => a.path.legs.length === 2)!.path;
    const combinedElection = jointPath.legs.reduce((sum, l) => sum + l.amountAllocated, 0);
    // Even though each permission alone could supply 200, the SHARED cap of
    // 150 must bound their combined allocation to at most 150 - never 300+.
    expect(combinedElection).toBeLessThanOrEqual(150);
  });

  it("clears when the requested amount fits within the shared cap across two members", () => {
    const p1 = permission("a", { thresholdValue: 200 });
    const p2 = permission("b", { thresholdValue: 200 });
    const rel: PermissionRelationship = { id: "r", companyId: "co-1", fromPermissionId: "a", toPermissionId: "b", relationshipType: "CONCURRENT_COUNTED", sourceProvision: { documentId: "doc-1", sectionRef: "§r" } };
    const constraint: SharedConstraint = {
      id: "sc-1",
      companyId: "co-1",
      name: "Shared cap",
      cap: { amount: 150 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "a" }, { permissionId: "b" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 0,
      sourceProvision: { documentId: "doc-1", sectionRef: "§sc" },
    };
    const result = runSolver({
      eligiblePermissions: [p1, p2],
      relationships: [rel],
      sharedConstraints: [constraint],
      collateralScopes: [],
      ruleActivationConditions: [],
      financials: FIN,
      transaction: { ...transaction, amount: 150 },
      entityClasses: [],
      activationState,
      asOfDate: new Date("2026-06-30"),
    });
    expect(result.overall.status).toBe("CLEAR");
    expect(result.permissionPathUsed?.legs.reduce((sum, l) => sum + l.amountAllocated, 0)).toBeCloseTo(150, 6);
  });
});
