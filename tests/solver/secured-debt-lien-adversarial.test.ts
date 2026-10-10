/**
 * Adversarial (non-Coherent) + modeled-binding proofs for secured debt∩lien.
 *
 * Engine-level: election debt+lien gate and COUNTED maxCapacity (see election.test).
 * Package-level: computeRemainingCapacityAfterDebtIncurrence must not publish a
 * solver-native package min that is more favorable than MODELED cross-document
 * binding — labeled MODELED / EVALUATION_SEED_NOT_NS4_APPROVED, never CERTIFIED.
 *
 * Independent expectations from contractual ratio rooms (not engine output):
 *   SSNL ≤ 3.0x → 3×1700 − (2221−1162) = 4041
 *   TNL ≤ 4.25x → 4.25×1700 − (3258−1162) = 5129
 */
import { describe, expect, it } from "vitest";
import {
  computeCovenantPosition,
  computeRemainingCapacityAfterDebtIncurrence,
  type CompanyCovenantData,
} from "../../lib/covenant-engine";

function syntheticPackage(): CompanyCovenantData {
  return {
    companyId: "synth-adversarial",
    documents: [
      {
        id: "synth-indenture",
        name: "Synthetic Notes Indenture",
        type: "INDENTURE",
        capacityFormulas: {
          secured: { op: "REF", code: "mila_secured" },
          unsecured: { op: "REF", code: "tnl_unsecured" },
        },
      },
      {
        id: "synth-ca",
        name: "Synthetic Credit Agreement",
        type: "CREDIT_AGREEMENT",
        capacityFormulas: {
          secured: { op: "REF", code: "ca_secured" },
          unsecured: { op: "REF", code: "ca_tnl" },
        },
      },
    ],
    provisions: [
      {
        id: "p-mila",
        documentId: "synth-indenture",
        code: "mila_secured",
        basketName: "MILA secured",
        sectionRef: "§3.3(b)(i)(C)",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 3.0,
        params: { debtBasis: "secured" },
      },
      {
        id: "p-tnl",
        documentId: "synth-indenture",
        code: "tnl_unsecured",
        basketName: "TNL unsecured",
        sectionRef: "§ratio",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 4.25,
        params: { debtBasis: "total" },
      },
      {
        id: "p-ca-sec",
        documentId: "synth-ca",
        code: "ca_secured",
        basketName: "CA secured",
        sectionRef: "§6.01",
        // Intentionally looser than Indenture SSNL — false-favorable if chosen for secured.
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 4.25,
        params: { debtBasis: "total" },
      },
      {
        id: "p-ca-tnl",
        documentId: "synth-ca",
        code: "ca_tnl",
        basketName: "CA TNL",
        sectionRef: "§6.11",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 4.25,
        params: { debtBasis: "total" },
      },
    ],
    financials: {
      ebitda: 1700,
      cash: 1162,
      totalDebt: 3258,
      securedDebt: 2221,
      interestExpense: 190,
      cumulativeNetIncome: 520,
      equityProceedsSinceIssue: 2150,
      assumedNewDebtRatePct: 6.5,
    },
    ledger: [],
  };
}

import { buildPermissionGraph } from "../../lib/solver/graph";
import { evaluateElection, buildPermissionPaths } from "../../lib/solver/election";
import { runSolver } from "../../lib/solver/service";
import type {
  ActivationState,
  Permission,
  PermissionRelationship,
  SharedConstraint,
  Transaction,
} from "../../lib/solver/types";

const emptyActivationState: ActivationState = {
  asOfDate: new Date("2026-06-30T12:00:00.000Z"),
  series: {},
  events: [],
  usageCounts: {},
  unknownKeys: new Set(),
};

const FIN = {
  ebitda: 500,
  cash: 50,
  interestExpense: 25,
  cumulativeNetIncome: 100,
  equityProceedsSinceIssue: 0,
  assumedNewDebtRatePct: 5,
  totalDebt: 800,
  securedDebt: 400,
};

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

const baseTransaction: Transaction = {
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

describe("secured lien sufficiency (fail-closed adversarial)", () => {
  it("blocks when independent lien exists but capacity is insufficient for the debt allocation", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
    const graph = buildPermissionGraph([debt, lien], []);
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien", lien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 200,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 200 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(
      evalResult.requirements.some(
        (r) =>
          r.class === "LIEN_PERMISSION" &&
          r.scope.permissionId === "debt" &&
          r.status === "FAILED" &&
          /insufficient capacity/i.test(r.detail),
      ),
    ).toBe(true);
  });

  it("blocks when lien path exists but entity scope excludes the obligor", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const lien = permission("lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 100,
      entityScope: ["GUARANTOR_RS"],
    });
    const graph = buildPermissionGraph([debt, lien], []);
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien", lien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 80,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 80 },
        entityClasses: ["NON_GUARANTOR_RS"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(evalResult.requirements.some((r) => r.class === "GUARANTOR_CONDITION" && r.status === "FAILED")).toBe(true);
    expect(
      evalResult.requirements.some(
        (r) => r.class === "LIEN_PERMISSION" && r.scope.permissionId === "debt" && r.status === "FAILED",
      ),
    ).toBe(true);
  });

  it("blocks when lien shares exhausted authoritative capacity", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const graph = buildPermissionGraph([debt, lien], []);
    const shared: SharedConstraint = {
      id: "lien-pool",
      companyId: "co-1",
      name: "Lien shared pool",
      cap: { amount: 100 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 100,
      currentUsageAuthoritative: true,
      currentUsageStatus: "COMPUTED",
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
    };
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien", lien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 50 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(
      evalResult.requirements.some(
        (r) => r.class === "LIEN_PERMISSION" && r.scope.permissionId === "debt" && r.status === "FAILED",
      ),
    ).toBe(true);
  });

  it("P0: $100M lien gross + $80M authoritative shared util + $50M borrow must not CLEAR", () => {
    // Independent expectation: remaining lien authorization = 100 − 80 = 20 < 50.
    expect(100 - 80).toBe(20);
    expect(20).toBeLessThan(50);

    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const graph = buildPermissionGraph(
      [debt, lien],
      [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" })],
    );
    const shared: SharedConstraint = {
      id: "lien-pool-partial",
      companyId: "co-1",
      name: "Lien shared pool with historical usage",
      cap: { amount: 100 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 80,
      currentUsageAuthoritative: true,
      currentUsageStatus: "COMPUTED",
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
    };
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien", lien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 50 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).not.toBe("CLEAR");
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(
      evalResult.requirements.some(
        (r) =>
          r.class === "LIEN_PERMISSION" &&
          (r.status === "FAILED" || r.status === "UNKNOWN") &&
          (r.scope.permissionId === "debt" || r.scope.permissionId === "lien"),
      ),
    ).toBe(true);
  });

  it("P0: unknown historical lien utilization cannot support affirmative CLEAR", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const graph = buildPermissionGraph(
      [debt, lien],
      [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" })],
    );
    const shared: SharedConstraint = {
      id: "lien-pool-unknown",
      companyId: "co-1",
      name: "Lien pool unknown utilization",
      cap: { amount: 100 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 0,
      currentUsageAuthoritative: false,
      currentUsageStatus: "ATTRIBUTED_INCOMPLETE",
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
    };
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien", lien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 50 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    const status = buildPermissionPaths([evalResult])[0]!.status;
    expect(status).not.toBe("CLEAR");
    expect(["BLOCKED", "ASSUMPTION_REQUIRED", "REVIEW_REQUIRED"]).toContain(status);
    expect(
      evalResult.requirements.some(
        (r) =>
          (r.class === "LIEN_PERMISSION" || r.class === "SHARED_CAP") &&
          (r.status === "UNKNOWN" || r.status === "FAILED"),
      ),
    ).toBe(true);
  });

  it("blocks wrong collateral priority even when lien capacity exists", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
    const graph = buildPermissionGraph(
      [debt, lien],
      [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" })],
    );
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien", lien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: {
          ...baseTransaction,
          secured: true,
          amount: 50,
          collateralPools: [{ id: "pool-a", name: "Pool A" }],
          requestedLienPriority: [{ poolId: "pool-a", priorityTier: "FIRST" }],
        },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [],
      collateralScopes: [{ permissionId: "lien", collateralPoolId: "pool-a", priorityTier: "SECOND" }],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(evalResult.requirements.some((r) => r.class === "PRIORITY_CONDITION" && r.status === "FAILED")).toBe(true);
  });
});

describe("secured debt package binding (adversarial synthetic)", () => {
  it("MODELED package secured binds to Indenture SSNL $4041, not CA TNL-shaped $5129", () => {
    const data = syntheticPackage();
    const pos = computeCovenantPosition(data);
    expect(pos.crossDocumentSecured.status).toBe("modeled");
    expect(pos.crossDocumentSecured.capacity).toBeCloseTo(4041, 5);
    expect(pos.crossDocumentSecured.bindingDocumentId).toBe("synth-indenture");
    expect(pos.crossDocumentUnsecured.capacity).toBeCloseTo(5129, 5);

    const rem = computeRemainingCapacityAfterDebtIncurrence(data, pos, 0, true);
    expect(rem.packageAuthoritative?.authority).toBe("MODELED_CROSS_DOCUMENT");
    expect(rem.packageAuthoritative?.label).toBe("MODELED / EVALUATION_SEED_NOT_NS4_APPROVED");
    expect(rem.packageAuthoritative?.remainingCapacity).toBeCloseTo(4041, 5);
    expect(rem.remainingCapacity).toBeCloseTo(4041, 5);
    // Must not publish the looser TNL-shaped $5129 as secured package remaining.
    expect(rem.remainingCapacity!).toBeLessThan(5000);
  });

  it("does not promote modeled binding to certified permission", () => {
    const data = syntheticPackage();
    const pos = computeCovenantPosition(data);
    const rem = computeRemainingCapacityAfterDebtIncurrence(data, pos, 100, true);
    expect(rem.packageAuthoritative?.authority).toBe("MODELED_CROSS_DOCUMENT");
    expect(rem.packageAuthoritative?.label).toBe("MODELED / EVALUATION_SEED_NOT_NS4_APPROVED");
    expect(rem.packageAuthoritative?.label.startsWith("MODELED")).toBe(true);
    expect(rem.packageAuthoritative?.solverAuthority).toBe("NON_AUTHORITATIVE_DIAGNOSTIC");
    expect(rem.remainingCapacity).toBeCloseTo(3941, 5);
  });
});

describe("P0 shared lien constraint conservation (reference-calculated)", () => {
  /**
   * Two distinct independent LIEN permissions naming the same SharedConstraint
   * must not each contribute the full remaining headroom to the coverage pool.
   * Reference arithmetic is authored here independently of engine output.
   */
  function sharedLienFixture(args: {
    constraintCap: number;
    currentUsage: number;
    lienAThreshold: number;
    lienBThreshold: number;
    debtThreshold: number;
    requestedAmount: number;
    authoritative?: boolean;
  }) {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: args.debtThreshold });
    const lienA = permission("lien-a", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: args.lienAThreshold });
    const lienB = permission("lien-b", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: args.lienBThreshold });
    const shared: SharedConstraint = {
      id: "shared-lien-constraint",
      companyId: "co-1",
      name: "Shared lien authorization pool",
      cap: { amount: args.constraintCap },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien-a" }, { permissionId: "lien-b" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: args.currentUsage,
      currentUsageAuthoritative: args.authoritative !== false,
      currentUsageStatus: args.authoritative === false ? "ATTRIBUTED_INCOMPLETE" : "COMPUTED",
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
    };
    const relationships = [
      rel({ fromPermissionId: "debt", toPermissionId: "lien-a", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "debt", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "lien-a", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
    ];
    const graph = buildPermissionGraph([debt, lienA, lienB], relationships);
    return { debt, lienA, lienB, shared, relationships, graph };
  }

  it("two liens on one $100m constraint cannot CLEAR a $150m secured request", () => {
    // Independent reference: shared headroom = 100 − 0 = 100.
    // Each lien's standalone formula capacity is 500, but both draw the SAME
    // constraint — conserved pool = min(500,100) + min(500, remaining) = 100.
    // Request 150 > 100 → BLOCKED. Amount-independent max ≤ 100 (and ≤ debt 500).
    const constraintCap = 100;
    const currentUsage = 0;
    const refHeadroom = constraintCap - currentUsage;
    expect(refHeadroom).toBe(100);
    const conservedPool = Math.min(500, refHeadroom); // first lien takes all; second gets 0
    expect(conservedPool).toBe(100);
    expect(150).toBeGreaterThan(conservedPool);

    const { debt, lienA, lienB, shared, graph } = sharedLienFixture({
      constraintCap,
      currentUsage,
      lienAThreshold: 500,
      lienBThreshold: 500,
      debtThreshold: 500,
      requestedAmount: 150,
    });
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien-a", "lien-b"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien-a", lienA],
        ["lien-b", lienB],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 150,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 150 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(evalResult.maxCapacity).toBeDefined();
    expect(evalResult.maxCapacity!).toBeLessThanOrEqual(conservedPool + 1e-9);
    expect(evalResult.maxCapacity!).toBeCloseTo(Math.min(500, conservedPool), 6);
  });

  it("solver EXACT maxCapacity respects conserved shared lien headroom (not 2×)", () => {
    const constraintCap = 100;
    const refHeadroom = constraintCap - 0;
    const { debt, lienA, lienB, shared, relationships } = sharedLienFixture({
      constraintCap,
      currentUsage: 0,
      lienAThreshold: 500,
      lienBThreshold: 500,
      debtThreshold: 500,
      requestedAmount: 0,
    });
    const result = runSolver({
      asOfDate: emptyActivationState.asOfDate,
      financials: FIN,
      eligiblePermissions: [debt, lienA, lienB],
      relationships,
      sharedConstraints: [shared],
      collateralScopes: [],
      entityClasses: ["BORROWER"],
      ruleActivationConditions: [],
      activationState: emptyActivationState,
      transaction: { ...baseTransaction, amount: 0, secured: true },
    });
    expect(result.overall.maximumCapacity?.kind).toBe("EXACT");
    if (result.overall.maximumCapacity?.kind === "EXACT") {
      expect(result.overall.maximumCapacity.amount).toBeLessThanOrEqual(refHeadroom + 1e-9);
      expect(result.overall.maximumCapacity.amount).toBeGreaterThan(1e-9);
      // Must not invent 200 from double-counting the $100 pool.
      expect(result.overall.maximumCapacity.amount).toBeLessThan(150);
    }
  });

  it("genuinely independent liens (no shared constraint) remain additive", () => {
    // Reference: lienA=80 + lienB=70 = 150; debt=200; request=150 → CLEAR; max ≤ min(200,150)=150.
    const refPool = 80 + 70;
    expect(refPool).toBe(150);
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const lienB = permission("lien-b", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 70 });
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
      requestedAmount: 150,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 150 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("CLEAR");
    expect(evalResult.maxCapacity!).toBeCloseTo(Math.min(200, refPool), 6);
  });

  it("shared constraint with existing utilization conserves remaining only", () => {
    // Reference: cap 100, usage 40 → headroom 60. Two liens cannot invent 120.
    // Request 70 > 60 → BLOCKED; max ≤ 60.
    const constraintCap = 100;
    const currentUsage = 40;
    const refHeadroom = constraintCap - currentUsage;
    expect(refHeadroom).toBe(60);
    expect(70).toBeGreaterThan(refHeadroom);

    const { debt, lienA, lienB, shared, graph } = sharedLienFixture({
      constraintCap,
      currentUsage,
      lienAThreshold: 200,
      lienBThreshold: 200,
      debtThreshold: 200,
      requestedAmount: 70,
    });
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien-a", "lien-b"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien-a", lienA],
        ["lien-b", lienB],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 70,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 70 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(evalResult.maxCapacity!).toBeLessThanOrEqual(refHeadroom + 1e-9);
  });

  it("uneven lien standalones under one constraint: pool = min(sum standalones, headroom)", () => {
    // Reference: lienA=30, lienB=200, shared headroom=100 → conserved = 30 + min(200,70) = 100.
    // Request 90 → CLEAR; request 110 → BLOCKED; max ≤ 100.
    const refConserved = 30 + Math.min(200, 100 - 30);
    expect(refConserved).toBe(100);

    const { debt, lienA, lienB, shared, graph } = sharedLienFixture({
      constraintCap: 100,
      currentUsage: 0,
      lienAThreshold: 30,
      lienBThreshold: 200,
      debtThreshold: 300,
      requestedAmount: 90,
    });
    const at90 = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "lien-a", "lien-b"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien-a", lienA],
        ["lien-b", lienB],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 90,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 90 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([at90])[0]!.status).toBe("CLEAR");
    expect(at90.maxCapacity!).toBeCloseTo(Math.min(300, refConserved), 6);

    const at110 = evaluateElection({
      election: { id: "e2", memberPermissionIds: ["debt", "lien-a", "lien-b"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["lien-a", lienA],
        ["lien-b", lienB],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 110,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 110 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([at110])[0]!.status).toBe("BLOCKED");
  });

  it("non-authoritative shared utilization fails closed (not double-count invent)", () => {
    const { debt, lienA, lienB, shared, graph } = sharedLienFixture({
      constraintCap: 100,
      currentUsage: 0,
      lienAThreshold: 500,
      lienBThreshold: 500,
      debtThreshold: 500,
      requestedAmount: 50,
      authoritative: false,
    });
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
        transaction: { ...baseTransaction, secured: true, amount: 50 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).not.toBe("CLEAR");
  });

  it("multi-leg debt allocation cannot exceed conserved shared lien pool", () => {
    // Two debt legs (FIXED 80 + FIXED 80) sharing election with two liens on one $100 pool.
    // Reference conserved lien = 100; total debt request 150 → BLOCKED (lien shortfall).
    const refLien = 100;
    const debtA = permission("debt-a", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const debtB = permission("debt-b", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const lienA = permission("lien-a", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
    const lienB = permission("lien-b", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
    const shared: SharedConstraint = {
      id: "shared-lien-multi",
      companyId: "co-1",
      name: "Shared",
      cap: { amount: refLien },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien-a" }, { permissionId: "lien-b" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 0,
      currentUsageAuthoritative: true,
      currentUsageStatus: "COMPUTED",
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
    };
    const relationships = [
      rel({ fromPermissionId: "debt-a", toPermissionId: "debt-b", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "debt-a", toPermissionId: "lien-a", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "debt-a", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "debt-b", toPermissionId: "lien-a", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "debt-b", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "lien-a", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
    ];
    const graph = buildPermissionGraph([debtA, debtB, lienA, lienB], relationships);
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt-a", "debt-b", "lien-a", "lien-b"], rationale: "" },
      permissionsById: new Map([
        ["debt-a", debtA],
        ["debt-b", debtB],
        ["lien-a", lienA],
        ["lien-b", lienB],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 150,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, amount: 150 },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: emptyActivationState.asOfDate,
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(evalResult.maxCapacity!).toBeLessThanOrEqual(refLien + 1e-9);
  });
});
