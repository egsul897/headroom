/**
 * Cross-layer boundary: solver election (independent liens + shared constraint)
 * AND Phase 4D transaction simulation (debt+lien members of overlapping shared pool)
 * must both refuse false-favorable secured clearance.
 *
 * Scope note (PR #253 closeout):
 *   - `shared-lien-aggregate-conservation.test.ts` proves **transaction-engine**
 *     shared-capacity aggregation (Phase 4D), NOT solver-side independent-lien
 *     conservation. Solver conservation is covered by
 *     `shared-lien-double-count-repro.test.ts` (#258 remediation, reconciled here).
 *   - This file asserts both layers at the integration boundary for one secured
 *     scenario shape: no false CLEAR, no inflated EXACT max, no EXECUTABLE claim.
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
import {
  MONEY,
  cash,
  consume,
  nodeOf,
  pool,
  proposal,
  provision,
  resetIds,
  route,
  simulate,
  world,
  amountOf,
  codes,
} from "../contract-model/runtime/transaction/helpers";
import { isAffirmativelyExecutable } from "../../lib/product/unified-position/certified-simulate-bridge";

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

describe("solver ↔ simulation shared-lien boundary (secured)", () => {
  it("solver: two independent $100 liens on one $100 shared cap must NOT CLEAR $150 secured", () => {
    const debt = permission("debt", { thresholdValue: 200 });
    const lienA = permission("lien-a", { grantType: "LIEN", thresholdValue: 100 });
    const lienB = permission("lien-b", { grantType: "LIEN", thresholdValue: 100 });
    const shared: SharedConstraint = {
      id: "sc-shared-liens",
      companyId: "co-1",
      name: "Shared permitted-lien basket",
      cap: { amount: 100 },
      aggregationRule: "NAMED_MEMBER_CLAUSES",
      members: [{ permissionId: "lien-a" }, { permissionId: "lien-b" }],
      measurementBasis: "CURRENTLY_OUTSTANDING",
      followsRefinancing: false,
      currentUsage: 0,
      currentUsageStatus: "COMPUTED",
      currentUsageAuthoritative: true,
      sourceProvision: { documentId: "doc-1", sectionRef: "§shared-liens" },
    };
    const graph = buildPermissionGraph([debt, lienA, lienB], [
      rel({ fromPermissionId: "debt", toPermissionId: "lien-a", relationshipType: "CONCURRENT_DISREGARDED" }),
      rel({ fromPermissionId: "debt", toPermissionId: "lien-b", relationshipType: "CONCURRENT_DISREGARDED" }),
    ]);
    const txn: Transaction = {
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
        transaction: txn,
        entityClasses: [],
        ruleActivationConditions: [],
        activationState: emptyActivationState,
        asOfDate: new Date("2026-06-30"),
      },
      sharedConstraints: [shared],
      collateralScopes: [],
    });
    const path = buildPermissionPaths([evalResult])[0]!;
    expect(path.status).not.toBe("CLEAR");
    expect(evalResult.maxCapacity == null || evalResult.maxCapacity <= 100 + 1e-6).toBe(true);

    const solver = runSolver({
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
      transaction: txn,
      entityClasses: ["BORROWER"],
      activationState: emptyActivationState,
      asOfDate: emptyActivationState.asOfDate,
    });
    expect(solver.overall.status).not.toBe("CLEAR");
    const exactMax = solver.overall.maximumCapacity;
    if (exactMax?.kind === "EXACT") {
      expect(exactMax.amount).toBeLessThanOrEqual(100 + 1e-6);
    }
  });

  it("Phase 4D: debt+lien dual draws on overlapping shared pool fail closed (TX engine)", () => {
    resetIds();
    const w = world({
      rules: [
        provision("debt-1", MONEY(500), { action: "INCUR_DEBT" }),
        provision("lien-1", MONEY(500), { action: "CREATE_LIEN", covenantFamily: "LIENS" }),
        provision("lien-2", MONEY(500), { action: "CREATE_LIEN", covenantFamily: "LIENS" }),
      ],
      pools: [pool("shared-secured-pool", MONEY(100), ["debt-1", "lien-1", "lien-2"])],
    });
    // Stated dual-path style: debt 75 + lien 75 against $100 pool.
    const r = simulate(
      w,
      proposal(
        "tx-boundary-over",
        [
          consume("e-debt", nodeOf("debt-1"), cash("75")),
          consume("e-lien", nodeOf("lien-1"), cash("75")),
        ],
        { intendedAmount: cash("150") },
      ),
      route({
        capacityNodeIds: [nodeOf("debt-1"), nodeOf("lien-1")],
        ruleIds: ["debt-1", "lien-1"],
        sharedCapacityIds: ["shared-secured-pool"],
      }),
    );
    expect(r.postState).toBeNull();
    expect(r.commitPlan.committable).toBe(false);
    expect(r.selectedPathResult).not.toBe("SATISFIED");
    expect(
      codes(r.limitations).some(
        (c) => c === "INSUFFICIENT_CAPACITY" || c === "INSUFFICIENT_AGGREGATE_CAPACITY",
      ),
    ).toBe(true);
  });

  it("product EXECUTABLE badge cannot flip true on capacity-only stub after solver refuse", () => {
    // Boundary: even if a wrapper claimed capacity EXECUTED, without SIMULATED+SATISFIED
    // and constructed path the product must not show EXECUTABLE.
    expect(
      isAffirmativelyExecutable({
        verifiedPackage: { companyId: "co", instrumentKey: "i" } as never,
        selectedPathId: null,
        selectedPath: null,
        transaction: null,
        certified: {
          companyId: "co",
          evaluationDate: "2026-06-30",
          cutoffState: "RESOLVED",
          reportingPeriodKey: "2026Q2",
          approvedSnapshotId: "s",
          ledgerUsageCount: 0,
          verifiedPackagePresent: true,
          capacity: { outcome: "EXECUTED" } as never,
          simulation: null,
          blockers: [],
          authorityNote: "test",
        },
        pathSelectionError: null,
      }),
    ).toBe(false);
  });

  it("Phase 4D exact exhaust of shared pool is SATISFIED (not double-counted)", () => {
    resetIds();
    const w = world({
      rules: [
        provision("debt-1", MONEY(500), { action: "INCUR_DEBT" }),
        provision("lien-1", MONEY(500), { action: "CREATE_LIEN", covenantFamily: "LIENS" }),
      ],
      pools: [pool("shared-secured-pool", MONEY(100), ["debt-1", "lien-1"])],
    });
    const r = simulate(
      w,
      proposal(
        "tx-boundary-exact",
        [
          consume("e-debt", nodeOf("debt-1"), cash("55")),
          consume("e-lien", nodeOf("lien-1"), cash("45")),
        ],
        { intendedAmount: cash("100") },
      ),
      route({
        capacityNodeIds: [nodeOf("debt-1"), nodeOf("lien-1")],
        ruleIds: ["debt-1", "lien-1"],
        sharedCapacityIds: ["shared-secured-pool"],
      }),
    );
    expect(r.selectedPathResult).toBe("SATISFIED");
    const sc = r.postState!.sharedConstraints.find((s) => s.sharedCapacityId === "shared-secured-pool")!;
    expect(amountOf(sc.usage as never)).toBe("100");
  });
});
