import { describe, expect, it } from "vitest";
import { runSolverForDocument, buildDebtRatioTests, computeCovenantPosition } from "../../lib/covenant-engine";
import { evaluateRatioTests } from "../../lib/solver/ratio";
import { runSolver } from "../../lib/solver/service";
import type { RatioProvision } from "../../lib/solver/types";
import { toSolverNativeCompanyContext } from "../../lib/financial-core/solver-adapter";
import type { SolverNativeStaticData } from "../../lib/covenant-engine";
import type { ActivationState, Permission, Transaction } from "../../lib/solver/types";
import { loadCompanySolverStaticData } from "../../lib/covenant-engine";

const FIN = {
  ebitda: 500, cash: 100, interestExpense: 80, cumulativeNetIncome: 400,
  equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 6, totalDebt: 1200, securedDebt: 800,
};
const activationState: ActivationState = { asOfDate: new Date("2026-10-16"), series: {}, events: [], usageCounts: {}, unknownKeys: new Set() };
const transaction = (amount: number, secured: boolean): Transaction => ({
  transactionType: "DEBT_INCURRENCE", amount, currency: { code: "USD" },
  incurringEntity: { id: "borrower", name: "Borrower" }, guarantorStatus: "GUARANTOR",
  secured, collateralPools: [], requestedLienPriority: [], useOfProceeds: "GENERAL_CORPORATE", acquisitionRelated: false,
  transactionDate: new Date("2026-10-16"),
});
const perm = (id: string): Permission => ({
  id, documentId: "doc-1", companyId: "co-1", grantType: "DEBT_INCURRENCE", amountKind: "FIXED",
  action: "perm", entityScope: [], formulaType: "FLAT_AMOUNT", thresholdValue: 5000,
  eligibilityConditions: [], termConditions: [], measurementBasis: "CUMULATIVE_INCURRED",
  sourceProvision: { documentId: "doc-1", sectionRef: "6.16" }, modelingStatus: "MODELED",
});

describe("Rule 185: solver-native ratio tests", () => {
  it("leverage breach fails the test", () => {
    // (1200 + 1000 - 100) / 500 = 4.2 > 4.00
    const [t] = evaluateRatioTests([{ id: "r1", documentId: "doc-1", basketName: "Leverage", sectionRef: "6.14", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, debtBasis: "total" }], FIN, 1000, false);
    expect(t!.status).toBe("FAILED");
    expect(t!.postTransactionRatio).toBeCloseTo(4.2);
    expect(t!.applies).toBe(true);
  });

  it("leverage within threshold satisfies", () => {
    // (1200 + 100 - 100) / 500 = 2.4 <= 4.00
    const [t] = evaluateRatioTests([{ id: "r1", documentId: "doc-1", basketName: "Leverage", sectionRef: "6.14", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, debtBasis: "total" }], FIN, 100, false);
    expect(t!.status).toBe("SATISFIED");
  });

  it("secured-basis test does not apply to an unsecured deal", () => {
    const [t] = evaluateRatioTests([{ id: "r1", documentId: "doc-1", basketName: "Secured Leverage", sectionRef: "6.14", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 1.0, debtBasis: "secured" }], FIN, 1000, false);
    expect(t!.applies).toBe(false);
    expect(t!.status).toBe("SATISFIED");
  });

  it("coverage breach fails; zero rate is UNKNOWN (fail-closed)", () => {
    // post = 500 / (80 + 1000*0.06) = 500/140 = 3.57 < 4.00 -> FAILED
    const [breach] = evaluateRatioTests([{ id: "r1", documentId: "doc-1", basketName: "Coverage", sectionRef: "6.14", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 4.0 }], FIN, 1000, false);
    expect(breach!.status).toBe("FAILED");
    expect(breach!.postTransactionRatio).toBeCloseTo(500 / 140);
    const zeroRate = evaluateRatioTests([{ id: "r1", documentId: "doc-1", basketName: "Coverage", sectionRef: "6.14", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2.0 }], { ...FIN, assumedNewDebtRatePct: 0 }, 1000, false);
    expect(zeroRate[0]!.status).toBe("UNKNOWN");
  });

  it("runSolver: a breaching maintenance test blocks a clearing Permission election", () => {
    const ratio: RatioProvision = { id: "r1", documentId: "doc-1", basketName: "Leverage", sectionRef: "6.14", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, debtBasis: "total" };
    const result = runSolver({
      eligiblePermissions: [perm("p1")], relationships: [], sharedConstraints: [],
      collateralScopes: [], ruleActivationConditions: [], ratioProvisions: [ratio],
      financials: FIN, transaction: transaction(1000, false), entityClasses: [], activationState, asOfDate: new Date("2026-10-16"),
    });
    expect(result.overall.status).toBe("BLOCKED");
    expect(result.constraintsEvaluated.ratioTests).toHaveLength(1);
    expect(result.constraintsEvaluated.ratioTests[0]!.provisionId).toBe("r1");
  });

  it("runSolver: a satisfied maintenance test leaves a clearing election CLEAR", () => {
    const ratio: RatioProvision = { id: "r1", documentId: "doc-1", basketName: "Leverage", sectionRef: "6.14", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, debtBasis: "total" };
    const result = runSolver({
      eligiblePermissions: [perm("p1")], relationships: [], sharedConstraints: [],
      collateralScopes: [], ruleActivationConditions: [], ratioProvisions: [ratio],
      financials: FIN, transaction: transaction(100, false), entityClasses: [], activationState, asOfDate: new Date("2026-10-16"),
    });
    expect(result.overall.status).toBe("CLEAR");
    expect(result.constraintsEvaluated.ratioTests[0]!.status).toBe("SATISFIED");
  });

  it("runSolver: a breaching ratio test blocks even with NO eligible permissions (document-level test)", () => {
    const ratio: RatioProvision = { id: "r1", documentId: "doc-1", basketName: "Leverage", sectionRef: "6.14", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, debtBasis: "total" };
    const result = runSolver({
      eligiblePermissions: [], relationships: [], sharedConstraints: [],
      collateralScopes: [], ruleActivationConditions: [], ratioProvisions: [ratio],
      financials: FIN, transaction: transaction(1000, false), entityClasses: [], activationState, asOfDate: new Date("2026-10-16"),
    });
    expect(result.overall.status).toBe("BLOCKED");
  });

  it("solver ratio math agrees with the legacy buildDebtRatioTests on the same inputs", () => {
    const provisions: RatioProvision[] = [
      { id: "r1", documentId: "doc-1", basketName: "Leverage", sectionRef: "6.14", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, debtBasis: "total" },
      { id: "r2", documentId: "doc-1", basketName: "Coverage", sectionRef: "6.14", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2.5 },
    ];
    const solverTests = evaluateRatioTests(provisions, FIN, 1000, false);
    const data = {
      financials: FIN,
      documents: [{ id: "doc-1", name: "doc", type: "CREDIT_AGREEMENT", capacityFormulas: null }],
      provisions: provisions.map((p) => ({ id: p.id, documentId: p.documentId, code: `doc-1:${p.sectionRef}:RATIO`, basketName: p.basketName, sectionRef: p.sectionRef, formulaType: p.formulaType, thresholdValue: p.thresholdValue, params: p.debtBasis ? { debtBasis: p.debtBasis } : {}, notes: null })),
    } as never;
    const position = computeCovenantPosition(data);
    const legacy = buildDebtRatioTests(data, position, 1000, false);
    const byProvision = new Map(legacy.map((l) => [l.provisionId, l]));
    for (const t of solverTests) {
      expect(t.applies).toBe(true);
      const l = byProvision.get(t.provisionId!);
      expect(l).toBeDefined();
      expect(t.status).toBe(l!.status === "blocked" ? "FAILED" : l!.status === "review_required" ? "UNKNOWN" : "SATISFIED");
      expect(t.preTransactionRatio).toBeCloseTo(l!.preTransactionRatio, 9);
      if (t.postTransactionRatio !== undefined && l!.postTransactionRatio !== undefined) {
        expect(t.postTransactionRatio).toBeCloseTo(l!.postTransactionRatio, 9);
      }
    }
  });

  it("adapter: loadCompanySolverStaticData loads ratio provisions; runSolverForDocument blocks on them", async () => {
    const fakePrisma = {
      permission: { findMany: async () => [{ id: "p1", documentId: "doc-1", companyId: "co-1", code: "doc-1:6.16:DEBT", grantType: "DEBT_INCURRENCE", amountKind: "FIXED", action: "perm", entityScope: [], formulaType: "FLAT_AMOUNT", thresholdValue: 5000, eligibilityConditions: [], termConditions: [], measurementBasis: "CUMULATIVE_INCURRED", sectionRef: "6.16", definedTermRefs: [], effectiveFrom: null, effectiveTo: null, modelingStatus: "MODELED" }] },
      permissionRelationship: { findMany: async () => [] },
      sharedCapacityConstraint: { findMany: async () => [] },
      sharedCapacityConstraintMember: { findMany: async () => [] },
      permissionCollateralScope: { findMany: async () => [] },
      ruleActivationCondition: { findMany: async () => [] },
      solverCoverageDeclaration: { findMany: async () => [] },
      covenantProvision: {
        findMany: async () => [{ id: "r1", documentId: "doc-1", code: "doc-1:6.14:RATIO", basketName: "Leverage (maintenance)", sectionRef: "6.14", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4.0, params: { debtBasis: "total" }, notes: null }],
      },
    };
    const staticData: SolverNativeStaticData = await loadCompanySolverStaticData(fakePrisma as never, "co-1", new Date("2026-10-16"));
    expect(staticData.ratioProvisions).toHaveLength(1);
    expect(staticData.ratioProvisions[0]!.thresholdValue).toBe(4.0);
    const ctx = toSolverNativeCompanyContext({
      staticData, activationState, asOfDate: new Date("2026-10-16"), entityClasses: [],
      incurringEntity: { id: "borrower", name: "Borrower" }, guarantorStatus: "GUARANTOR", collateralPools: [], requestedLienPriority: [],
    });
    expect(ctx.ratioProvisions).toHaveLength(1);
    const res = runSolverForDocument("doc-1", "doc", FIN, 1000, false, ctx, { status: "SOLVER_NATIVE", reason: "test", permissions: [{ id: "p1", modelingStatus: "MODELED" }] } as never);
    expect(res.status).toBe("blocked");
    expect(res.solverResult!.constraintsEvaluated.ratioTests[0]!.provisionId).toBe("r1");
  });
});
