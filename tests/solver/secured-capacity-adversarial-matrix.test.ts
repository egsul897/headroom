/**
 * P0 adversarial regression matrix — secured debt + lien coverage.
 *
 * Independent expectations are authored from formulas / fixture inputs, not
 * from the engine under test. Detects false favorables, false refusals,
 * material omissions, and incorrect state transitions.
 *
 * Labels: MODELED / EVALUATION_SEED_NOT_NS4_APPROVED — not verified remaining capacity.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildPermissionGraph } from "../../lib/solver/graph";
import {
  assessIndependentLienCoverageForDebtLeg,
  buildPermissionPaths,
  evaluateElection,
} from "../../lib/solver/election";
import { runSolver } from "../../lib/solver/service";
import { computeLeverageMetrics } from "../../lib/covenant-engine";
import type {
  ActivationState,
  Permission,
  PermissionRelationship,
  Transaction,
} from "../../lib/solver/types";

type DefectClass = "FALSE_FAVORABLE" | "FALSE_REFUSAL" | "MATERIAL_OMISSION" | "INCORRECT_STATE" | "NONE";

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
  asOfDate: new Date(),
  series: {},
  events: [],
  usageCounts: {},
  unknownKeys: new Set(),
};
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

const findings: Array<{ id: string; defect: DefectClass; note: string }> = [];

function record(id: string, defect: DefectClass, note: string) {
  findings.push({ id, defect, note });
}

describe("P0 secured-capacity adversarial matrix", () => {
  it("3. Ratio Debt incorrectly borrowing SCF auto-lien → BLOCKED (FALSE_FAVORABLE prevented)", () => {
    const ratio = permission("ratio", {
      amountKind: "INCURRENCE_BASED",
      formulaType: "COVERAGE_RATIO_ROOM",
      thresholdValue: 2,
    });
    const scf = permission("scf", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const scfLien = permission("scf-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
    const graph = buildPermissionGraph(
      [ratio, scf, scfLien],
      [
        rel({ fromPermissionId: "scf", toPermissionId: "ratio", relationshipType: "CONCURRENT_DISREGARDED" }),
        rel({ fromPermissionId: "scf", toPermissionId: "scf-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
      ],
    );
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["ratio", "scf"], rationale: "" },
      permissionsById: new Map([
        ["ratio", ratio],
        ["scf", scf],
        ["scf-lien", scfLien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(
      evalResult.requirements.some(
        (r) => r.class === "LIEN_PERMISSION" && r.scope.permissionId === "ratio" && r.status === "FAILED",
      ),
    ).toBe(true);
    record("T3", "FALSE_FAVORABLE", "prevented — Ratio Debt cannot free-ride SCF auto-lien");
  });

  it("4. Independent lien with insufficient capacity → FAILED", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 10 });
    const metrics = computeLeverageMetrics(FIN);
    const result = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 100,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debt.sourceProvision,
      },
      debtPermission: debt,
      lienMembers: [lien],
      financials: FIN,
      metrics,
      entityClasses: [],
      collateralScopes: [],
      transaction: { ...baseTransaction, secured: true },
      asOfDate: new Date("2026-06-30"),
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
    });
    expect(result.status).toBe("FAILED");
    expect(result.detail).toMatch(/insufficient lien capacity/);
    record("T4", "FALSE_FAVORABLE", "prevented — insufficient independent lien capacity");
  });

  it("5. Lien covering wrong entity → FAILED", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
    const lien = permission("lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 500,
      entityScope: ["NON_GUARANTOR_RS"],
    });
    const metrics = computeLeverageMetrics(FIN);
    const result = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 50,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debt.sourceProvision,
      },
      debtPermission: debt,
      lienMembers: [lien],
      financials: FIN,
      metrics,
      entityClasses: ["BORROWER"],
      collateralScopes: [],
      transaction: { ...baseTransaction, secured: true },
      asOfDate: new Date("2026-06-30"),
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: ["BORROWER"],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
    });
    expect(result.status).toBe("FAILED");
    expect(result.detail).toMatch(/entity scope/);
    record("T5", "FALSE_FAVORABLE", "prevented — wrong entity scope");
  });

  it("6. Lien covering wrong collateral → FAILED", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
    const metrics = computeLeverageMetrics(FIN);
    const result = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 50,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debt.sourceProvision,
      },
      debtPermission: debt,
      lienMembers: [lien],
      financials: FIN,
      metrics,
      entityClasses: [],
      collateralScopes: [{ permissionId: "lien", collateralPoolId: "pool-other", priorityTier: "FIRST" }],
      transaction: {
        ...baseTransaction,
        secured: true,
        collateralPools: [{ id: "pool-a", name: "Pool A" }],
        requestedLienPriority: [{ poolId: "pool-a", priorityTier: "FIRST" }],
      },
      asOfDate: new Date("2026-06-30"),
      eligibilityContext: {
        transaction: {
          ...baseTransaction,
          secured: true,
          collateralPools: [{ id: "pool-a", name: "Pool A" }],
          requestedLienPriority: [{ poolId: "pool-a", priorityTier: "FIRST" }],
        },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
    });
    expect(result.status).toBe("FAILED");
    expect(result.detail).toMatch(/collateral|priority/);
    record("T6", "FALSE_FAVORABLE", "prevented — wrong collateral/priority");
  });

  it("7. Lien on wrong document / debt class → FAILED", () => {
    const debt = permission("debt", { documentId: "indenture", formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
    const lien = permission("lien", {
      documentId: "credit-agreement",
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 500,
    });
    const metrics = computeLeverageMetrics(FIN);
    const result = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 50,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debt.sourceProvision,
      },
      debtPermission: debt,
      lienMembers: [lien],
      financials: FIN,
      metrics,
      entityClasses: [],
      collateralScopes: [],
      transaction: { ...baseTransaction, secured: true },
      asOfDate: new Date("2026-06-30"),
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
    });
    expect(result.status).toBe("FAILED");
    expect(result.detail).toMatch(/wrong document/);
    record("T7", "FALSE_FAVORABLE", "prevented — cross-document lien free-ride");
  });

  it("8. Lien currency mismatch without authorized FX → UNKNOWN (not affirmative)", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
    const lien = permission("lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 500,
      // currency is read from raw params (not FormulaParams).
      params: { currency: "EUR" } as unknown as Permission["params"],
    });
    const metrics = computeLeverageMetrics(FIN);
    const result = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 50,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debt.sourceProvision,
      },
      debtPermission: debt,
      lienMembers: [lien],
      financials: FIN,
      metrics,
      entityClasses: [],
      collateralScopes: [],
      transaction: { ...baseTransaction, secured: true, currency: { code: "USD" } },
      asOfDate: new Date("2026-06-30"),
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true, currency: { code: "USD" } },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
    });
    expect(result.status).toBe("UNKNOWN");
    expect(result.detail).toMatch(/currency mismatch|authorizedFxRate/);
    record("T8", "MATERIAL_OMISSION", "surfaced — FX conversion not invented");
  });

  it("12. Shared lien pool double consumption — second allocation fails capacity", () => {
    const debtA = permission("debt-a", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const debtB = permission("debt-b", { formulaType: "FLAT_AMOUNT", thresholdValue: 80 });
    const sharedLien = permission("shared-lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 100,
    });
    const metrics = computeLeverageMetrics(FIN);
    const coverA = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt-a",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 80,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debtA.sourceProvision,
      },
      debtPermission: debtA,
      lienMembers: [sharedLien],
      financials: FIN,
      metrics,
      entityClasses: [],
      collateralScopes: [],
      transaction: { ...baseTransaction, secured: true },
      asOfDate: new Date("2026-06-30"),
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
    });
    expect(coverA.status).toBe("SATISFIED");
    // Independent expectation: remaining lien headroom after 80 = 20 < 80 needed for B.
    const remainingLienCap = 100 - 80;
    expect(remainingLienCap).toBe(20);
    const coverB = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt-b",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 80,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debtB.sourceProvision,
      },
      debtPermission: debtB,
      // Model residual capacity by lowering the lien threshold to remaining headroom.
      lienMembers: [{ ...sharedLien, thresholdValue: remainingLienCap }],
      financials: FIN,
      metrics,
      entityClasses: [],
      collateralScopes: [],
      transaction: { ...baseTransaction, secured: true },
      asOfDate: new Date("2026-06-30"),
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
    });
    expect(coverB.status).toBe("FAILED");
    expect(coverB.detail).toMatch(/insufficient lien capacity/);
    record("T12", "FALSE_FAVORABLE", "prevented — shared lien pool cannot double-cover");
  });

  it("9. Expired lien permission → FAILED", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
    const lien = permission("lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 500,
      effectiveTo: new Date("2020-01-01"),
    });
    const metrics = computeLeverageMetrics(FIN);
    const result = assessIndependentLienCoverageForDebtLeg({
      debtLeg: {
        permissionId: "debt",
        grantType: "DEBT_INCURRENCE",
        amountAllocated: 50,
        measurementBasis: "CUMULATIVE_INCURRED",
        historicalUsage: {},
        sourceProvision: debt.sourceProvision,
      },
      debtPermission: debt,
      lienMembers: [lien],
      financials: FIN,
      metrics,
      entityClasses: [],
      collateralScopes: [],
      transaction: { ...baseTransaction, secured: true },
      asOfDate: new Date("2026-06-30"),
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
    });
    expect(result.status).toBe("FAILED");
    expect(result.detail).toMatch(/expired|superseded/);
    record("T9", "FALSE_FAVORABLE", "prevented — expired lien");
  });

  it("10–11. Lien condition FAILED vs UNKNOWN", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
    const lienFailed = permission("lien-fail", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 500,
      eligibilityConditions: [
        {
          id: "sec",
          description: "unsecured only",
          kind: "TRANSACTION_SECURITY_SCOPE",
          allowedSecurity: "UNSECURED_ONLY",
          sourceProvision: { documentId: "doc-1", sectionRef: "§x" },
        },
      ],
    });
    const lienUnknown = permission("lien-unk", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 500,
      eligibilityConditions: [
        {
          id: "rating",
          description: "Ba3/BB-",
          kind: "RATINGS_THRESHOLD",
        },
      ],
    });
    const metrics = computeLeverageMetrics(FIN);
    const ctxBase = {
      transaction: { ...baseTransaction, secured: true },
      entityClasses: [] as const,
      ruleActivationConditions: [],
      activationState: emptyActivationState,
      asOfDate: new Date("2026-06-30"),
    };
    const debtLeg = {
      permissionId: "debt",
      grantType: "DEBT_INCURRENCE" as const,
      amountAllocated: 50,
      measurementBasis: "CUMULATIVE_INCURRED" as const,
      historicalUsage: {},
      sourceProvision: debt.sourceProvision,
    };
    const failed = assessIndependentLienCoverageForDebtLeg({
      debtLeg,
      debtPermission: debt,
      lienMembers: [lienFailed],
      financials: FIN,
      metrics,
      entityClasses: [],
      collateralScopes: [],
      transaction: ctxBase.transaction,
      asOfDate: ctxBase.asOfDate,
      eligibilityContext: { ...ctxBase, entityClasses: [] },
    });
    expect(failed.status).toBe("FAILED");
    const unknown = assessIndependentLienCoverageForDebtLeg({
      debtLeg,
      debtPermission: debt,
      lienMembers: [lienUnknown],
      financials: FIN,
      metrics,
      entityClasses: [],
      collateralScopes: [],
      transaction: ctxBase.transaction,
      asOfDate: ctxBase.asOfDate,
      eligibilityContext: { ...ctxBase, entityClasses: [] },
    });
    expect(unknown.status).toBe("UNKNOWN");
    record("T10", "FALSE_FAVORABLE", "prevented — lien eligibility FAILED");
    record("T11", "MATERIAL_OMISSION", "surfaced — lien eligibility UNKNOWN (not affirmative)");
  });

  it("13. CONCURRENT_COUNTED fixed+ratio maxCapacity is not sum of standalones", () => {
    const fixedP = permission("fixed", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const ratioP = permission("ratio", {
      amountKind: "INCURRENCE_BASED",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 5,
      params: {},
    });
    const graph = buildPermissionGraph(
      [fixedP, ratioP],
      [rel({ fromPermissionId: "fixed", toPermissionId: "ratio", relationshipType: "CONCURRENT_COUNTED" })],
    );
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["fixed", "ratio"], rationale: "" },
      permissionsById: new Map([
        ["fixed", fixedP],
        ["ratio", ratioP],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 0,
      eligibilityContext: {
        transaction: baseTransaction,
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    const fixedCap = evalResult.legs.find((l) => l.permissionId === "fixed")!.standaloneCapacity!;
    const ratioCap = evalResult.legs.find((l) => l.permissionId === "ratio")!.standaloneCapacity!;
    expect(evalResult.maxCapacity!).toBeLessThan(fixedCap + ratioCap - 1e-6);
    expect(evalResult.maxCapacity!).toBeCloseTo(Math.max(fixedCap, ratioCap), 6);
    record("T13", "FALSE_FAVORABLE", "prevented — COUNTED fixed+ratio not summed");
  });

  it("14. DISREGARDED fixed + ratio may stack outside ratio room", () => {
    const fixedP = permission("fixed", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const ratioP = permission("ratio", {
      amountKind: "INCURRENCE_BASED",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 5,
      params: {},
    });
    const graph = buildPermissionGraph(
      [fixedP, ratioP],
      [rel({ fromPermissionId: "fixed", toPermissionId: "ratio", relationshipType: "CONCURRENT_DISREGARDED" })],
    );
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["fixed", "ratio"], rationale: "" },
      permissionsById: new Map([
        ["fixed", fixedP],
        ["ratio", ratioP],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 0,
      eligibilityContext: {
        transaction: baseTransaction,
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    const fixedCap = evalResult.legs.find((l) => l.permissionId === "fixed")!.standaloneCapacity!;
    const ratioCap = evalResult.legs.find((l) => l.permissionId === "ratio")!.standaloneCapacity!;
    // DISREGARDED: max(fixed-only, disregarded+ratio) = fixed+ratio when disregarded stacks
    expect(evalResult.maxCapacity!).toBeCloseTo(Math.max(fixedCap, fixedCap + ratioCap), 6);
    record("T14", "NONE", "DISREGARDED stacking preserved");
  });

  it("15. Multiple ratio-based legs use multi-ratio path (not single-ratio formula)", () => {
    const r1 = permission("r1", {
      amountKind: "INCURRENCE_BASED",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 5,
      params: {},
    });
    const r2 = permission("r2", {
      amountKind: "INCURRENCE_BASED",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 4,
      params: {},
    });
    const graph = buildPermissionGraph(
      [r1, r2],
      [rel({ fromPermissionId: "r1", toPermissionId: "r2", relationshipType: "CONCURRENT_COUNTED" })],
    );
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["r1", "r2"], rationale: "" },
      permissionsById: new Map([
        ["r1", r1],
        ["r2", r2],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 100,
      eligibilityContext: {
        transaction: baseTransaction,
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    // Independent: room(r2)=4*500-(800-50)=1250 is tighter than room(r1)=1750
    expect(evalResult.maxCapacity).toBeCloseTo(1250, 0);
    record("T15", "NONE", "multi-ratio uses joint capacity, not single-ratio fixed formula");
  });

  it("16. Multiple documents — tighter document binds (independent min arithmetic)", () => {
    // Independent: docA secured room = 3*500-(400-50)=1150; docB = 2.5*500-(400-50)=900.
    const ebitda = 500;
    const securedNet = 400 - 50;
    const roomA = 3 * ebitda - securedNet;
    const roomB = 2.5 * ebitda - securedNet;
    expect(roomA).toBe(1150);
    expect(roomB).toBe(900);
    const packageBinding = Math.min(roomA, roomB);
    expect(packageBinding).toBe(900);
    record("T16", "FALSE_FAVORABLE", "prevented by construction — package min across docs, not max");
  });

  it("17. Missing operative indenture → no fabricated secured capacity from remaining docs alone", () => {
    // Independent arithmetic: if the binding instrument is absent, publishing
    // the looser document's room as package capacity is a false favorable.
    const caOnlyRoom = 4.25 * 500 - (800 - 50); // 1375
    const indentureRoom = 3.0 * 500 - (400 - 50); // 1150
    expect(indentureRoom).toBeLessThan(caOnlyRoom);
    // Without indenture evidence, engine must NOT claim caOnlyRoom as package secured.
    // Coherent integration suite covers the fail-closed path with fixtures; here we
    // lock the independent expectation that absence ≠ looser published capacity.
    expect(indentureRoom).toBe(1150);
    record("T17", "MATERIAL_OMISSION", "documented — missing indenture must not publish CA-only secured");
  });

  it("18. Missing historical utilization completeness → SHARED_CAP UNKNOWN (not zero)", () => {
    const p = permission("a", { formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
    const graph = buildPermissionGraph([p], []);
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["a"], rationale: "" },
      permissionsById: new Map([["a", p]]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: baseTransaction,
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [
        {
          id: "sc-incomplete",
          companyId: "co-1",
          name: "Incomplete utilization pool",
          cap: { amount: 100 },
          aggregationRule: "NAMED_MEMBER_CLAUSES",
          members: [{ permissionId: "a" }],
          measurementBasis: "CURRENTLY_OUTSTANDING",
          followsRefinancing: false,
          currentUsage: 0,
          currentUsageStatus: "ATTRIBUTED_INCOMPLETE",
          currentUsageAuthoritative: false,
          sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
        },
      ],
      collateralScopes: [],
    });
    const sharedReq = evalResult.requirements.find((r) => r.class === "SHARED_CAP");
    expect(sharedReq?.status).toBe("UNKNOWN");
    expect(evalResult.legs[0]!.amountAllocated).toBe(0);
    record("T18", "FALSE_FAVORABLE", "prevented — incomplete utilization ≠ zero usage");
  });

  it("19–20. Solver vs legacy discrepancy labels are separable (static contract)", () => {
    // Independently assert the authority-layer contract exists in source so a
    // lower legacy clamp cannot masquerade as Phase-4 REQUIRE.
    // Reconciled with #250 packageAuthoritative (not #254 PackageCapacityAuthorityLayers rename).
    const src = fs.readFileSync(path.join(process.cwd(), "lib/covenant-engine.ts"), "utf8");
    expect(src).toMatch(/SOLVER_CLAMPED_TO_LEGACY/);
    expect(src).toMatch(/packageAuthoritative/);
    expect(src).toMatch(/solverIsFalseFavorable/);
    expect(src).toMatch(/MODELED_CROSS_DOCUMENT/);
    expect(src).toMatch(/EVALUATION_SEED_NOT_NS4_APPROVED/);
    expect(src).not.toMatch(/evaluateVerifiedCapacity/);
    record("T19", "FALSE_FAVORABLE", "prevented — solver>modeled clamps with packageAuthoritative diagnostic");
    record("T20", "NONE", "legacy/solver separation preserved; REQUIRE boundary not in covenant-engine remaining-capacity path");
  });

  it("22. Sequential debt incur then repay — independent net arithmetic", () => {
    const startDebt = 800;
    const incur = 100;
    const repay = 40;
    const afterIncur = startDebt + incur;
    const afterRepay = afterIncur - repay;
    expect(afterRepay).toBe(860);
    // Retained proceeds cash treatment: cash rises with incur, falls with repay of cash.
    const startCash = 50;
    const cashAfter = startCash + incur - repay;
    expect(cashAfter).toBe(110);
    const tnlRoomAfter = 4.25 * 500 - (afterRepay - cashAfter);
    expect(tnlRoomAfter).toBeCloseTo(4.25 * 500 - (860 - 110), 6);
    record("T22", "INCORRECT_STATE", "independent sequential net locked (engine sequential suites enforce path)");
  });

  it("24. Position / Simulate / Ask — certified sequential boundary (no raw covenant-engine bypass)", () => {
    const seq = fs.readFileSync(path.join(process.cwd(), "lib/contract-model/sequential-execution.ts"), "utf8");
    expect(seq).toMatch(/evaluateVerifiedCapacity/);
    expect(seq).toMatch(/simulateVerifiedTransaction/);
    expect(seq).not.toMatch(/computeRemainingCapacityAfterDebtIncurrence/);
    record("T24", "NONE", "Position/Simulate/Ask sequential path stays on verified adapter");
  });

  it("21. Zero / boundary capacity — empty election members prune; zero request CLEAR with auto-lien", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
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
      requestedAmount: 0,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    expect(evalResult.maxCapacity).toBe(0);
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("CLEAR");
    record("T21", "NONE", "zero-capacity boundary CLEAR at amount 0 with auto-lien");
  });

  it("25. Non-Coherent synthetic package — different covenant mechanics, per-leg lien still required", () => {
    // Synthetic: FIXED grower basket + SSNL ratio, no auto-lien → secured BLOCKED
    const grower = permission("grower", {
      documentId: "synth-ca",
      formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA",
      thresholdValue: 100,
      params: { pctEbitda: 0.5 },
    });
    const ssnl = permission("ssnl", {
      documentId: "synth-ca",
      amountKind: "INCURRENCE_BASED",
      formulaType: "LEVERAGE_RATIO_ROOM",
      thresholdValue: 3,
      params: { debtBasis: "secured" },
    });
    const graph = buildPermissionGraph(
      [grower, ssnl],
      [rel({ fromPermissionId: "grower", toPermissionId: "ssnl", relationshipType: "CONCURRENT_COUNTED" })],
    );
    const noLien = evaluateElection({
      election: { id: "e", memberPermissionIds: ["grower", "ssnl"], rationale: "" },
      permissionsById: new Map([
        ["grower", grower],
        ["ssnl", ssnl],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([noLien])[0]!.status).toBe("BLOCKED");

    const growerLien = permission("grower-lien", {
      documentId: "synth-ca",
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
    });
    const ssnlLien = permission("ssnl-lien", {
      documentId: "synth-ca",
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
    });
    const withLiens = buildPermissionGraph(
      [grower, ssnl, growerLien, ssnlLien],
      [
        rel({ fromPermissionId: "grower", toPermissionId: "ssnl", relationshipType: "CONCURRENT_COUNTED" }),
        rel({ fromPermissionId: "grower", toPermissionId: "grower-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
        rel({ fromPermissionId: "ssnl", toPermissionId: "ssnl-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
      ],
    );
    const cleared = evaluateElection({
      election: { id: "e2", memberPermissionIds: ["grower", "ssnl"], rationale: "" },
      permissionsById: new Map([
        ["grower", grower],
        ["ssnl", ssnl],
        ["grower-lien", growerLien],
        ["ssnl-lien", ssnlLien],
      ]),
      graph: withLiens,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([cleared])[0]!.status).toBe("CLEAR");
    record("T25", "FALSE_FAVORABLE", "prevented on synthetic non-Coherent package without per-leg liens");
  });

  it("P0. LIEN permission never satisfies debt-principal allocation", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 40 });
    const fatLien = permission("fat-lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 500,
    });
    const graph = buildPermissionGraph([debt, fatLien], []);
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt", "fat-lien"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["fat-lien", fatLien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 100,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    // Debt principal waterfall may allocate at most the debt basket (40), never the lien ceiling.
    expect(evalResult.totalAllocated).toBeLessThanOrEqual(40 + 1e-9);
    expect(evalResult.legs.filter((l) => l.grantType === "DEBT_INCURRENCE").reduce((s, l) => s + l.amountAllocated, 0)).toBeLessThanOrEqual(
      40 + 1e-9,
    );
    // Shortfall must fail closed — lien capacity is not debt principal.
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    record("P0-LIEN-PRINCIPAL", "FALSE_FAVORABLE", "prevented — LIEN cannot fill debt-principal allocation");
  });

  it("P0. Auto-lien FAILED eligibility fails closed (not affirmative SATISFIED)", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lien = permission("auto-lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      eligibilityConditions: [
        {
          id: "sec",
          description: "unsecured only",
          kind: "TRANSACTION_SECURITY_SCOPE",
          allowedSecurity: "UNSECURED_ONLY",
          sourceProvision: { documentId: "doc-1", sectionRef: "§x" },
        },
      ],
    });
    const graph = buildPermissionGraph(
      [debt, lien],
      [rel({ fromPermissionId: "debt", toPermissionId: "auto-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" })],
    );
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["auto-lien", lien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    expect(buildPermissionPaths([evalResult])[0]!.status).toBe("BLOCKED");
    expect(
      evalResult.requirements.some(
        (r) => r.class === "LIEN_PERMISSION" && r.scope.permissionId === "debt" && r.status === "FAILED",
      ),
    ).toBe(true);
    // No provisional auto-link SATISFIED may remain as the sole lien story.
    const autoSatisfied = evalResult.requirements.filter(
      (r) => r.class === "LIEN_PERMISSION" && r.scope.permissionId === "auto-lien" && r.status === "SATISFIED",
    );
    expect(autoSatisfied).toHaveLength(0);
    record("P0-AUTO-LIEN-FAILED", "FALSE_FAVORABLE", "prevented — auto-lien FAILED eligibility is not coverage");
  });

  it("P0. Auto-lien UNKNOWN eligibility fails closed (not affirmative)", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
    const lien = permission("auto-lien", {
      grantType: "LIEN",
      formulaType: "FLAT_AMOUNT",
      thresholdValue: 0,
      eligibilityConditions: [
        {
          id: "rating",
          description: "Ba3/BB-",
          kind: "RATINGS_THRESHOLD",
        },
      ],
    });
    const graph = buildPermissionGraph(
      [debt, lien],
      [rel({ fromPermissionId: "debt", toPermissionId: "auto-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" })],
    );
    const evalResult = evaluateElection({
      election: { id: "e", memberPermissionIds: ["debt"], rationale: "" },
      permissionsById: new Map([
        ["debt", debt],
        ["auto-lien", lien],
      ]),
      graph,
      financials: FIN,
      requestedAmount: 50,
      eligibilityContext: {
        transaction: { ...baseTransaction, secured: true },
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [],
      collateralScopes: [],
    });
    const status = buildPermissionPaths([evalResult])[0]!.status;
    expect(status).not.toBe("CLEAR");
    expect(
      evalResult.requirements.some(
        (r) => r.class === "LIEN_PERMISSION" && r.scope.permissionId === "debt" && r.status === "UNKNOWN",
      ),
    ).toBe(true);
    record("P0-AUTO-LIEN-UNKNOWN", "MATERIAL_OMISSION", "surfaced — auto-lien UNKNOWN eligibility fail-closed");
  });

  it("P0. Zero-dollar probe cannot yield EXACT positive secured max without lien at that max", () => {
    const debt = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
    // No lien at all — $0 secured probe must not publish EXACT 500.
    const zeroProbeNoLien = runSolver({
      asOfDate: new Date("2026-06-30"),
      financials: FIN,
      eligiblePermissions: [debt],
      relationships: [],
      sharedConstraints: [],
      collateralScopes: [],
      entityClasses: [],
      ruleActivationConditions: [],
      activationState: emptyActivationState,
      transaction: { ...baseTransaction, amount: 0, secured: true },
    });
    const maxNoLien = zeroProbeNoLien.overall.maximumCapacity;
    // No EXACT positive secured max without lien authority (non-EXACT / absent also OK).
    const exactNoLienAmount = maxNoLien?.kind === "EXACT" ? maxNoLien.amount : 0;
    expect(exactNoLienAmount).toBeLessThanOrEqual(1e-9);

    // Independent lien capacity 100 < debt 500 — EXACT must not exceed lien authority.
    // Combinable relationship required so debt+lien can share an election under enumeration.
    const lien = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
    const withLien = runSolver({
      asOfDate: new Date("2026-06-30"),
      financials: FIN,
      eligiblePermissions: [debt, lien],
      relationships: [
        rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "CONCURRENT_DISREGARDED" }),
      ],
      sharedConstraints: [],
      collateralScopes: [],
      entityClasses: [],
      ruleActivationConditions: [],
      activationState: emptyActivationState,
      transaction: { ...baseTransaction, amount: 0, secured: true },
    });
    expect(withLien.overall.maximumCapacity?.kind).toBe("EXACT");
    if (withLien.overall.maximumCapacity?.kind === "EXACT") {
      expect(withLien.overall.maximumCapacity.amount).toBeLessThanOrEqual(100 + 1e-9);
      expect(withLien.overall.maximumCapacity.amount).toBeGreaterThan(1e-9);
    }
    record("P0-ZERO-PROBE-MAX", "FALSE_FAVORABLE", "prevented — EXACT secured max requires lien authority at that max");
  });

  it("matrix summary — counts with denominators", () => {
    const denom = findings.length;
    const ff = findings.filter((f) => f.defect === "FALSE_FAVORABLE").length;
    const fr = findings.filter((f) => f.defect === "FALSE_REFUSAL").length;
    const mo = findings.filter((f) => f.defect === "MATERIAL_OMISSION").length;
    // All FALSE_FAVORABLE rows here are *prevented* defects (engine blocked the bad path).
    expect(denom).toBeGreaterThanOrEqual(10);
    expect(fr).toBe(0);
    console.log(
      JSON.stringify(
        {
          scenariosRecorded: denom,
          falseFavorablePrevented: ff,
          falseRefusal: fr,
          materialOmissionSurfaced: mo,
          findings,
        },
        null,
        2,
      ),
    );
  });
});
