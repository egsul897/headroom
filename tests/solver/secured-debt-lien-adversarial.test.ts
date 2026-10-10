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
