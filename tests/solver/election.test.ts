import { describe, expect, it } from "vitest";
import { buildPermissionGraph } from "../../lib/solver/graph";
import {
  bisectMaxFeasibleAmount,
  buildPermissionPaths,
  computeElectionMaxCapacityBisected,
  enumerateElections,
  evaluateElection,
  permissionAsProvision,
} from "../../lib/solver/election";
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

const FIN = { ebitda: 500, cash: 50, interestExpense: 40, cumulativeNetIncome: 0, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 7, totalDebt: 800, securedDebt: 400 };
const emptyActivationState: ActivationState = { asOfDate: new Date(), series: {}, events: [], usageCounts: {}, unknownKeys: new Set() };
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

describe("Phase 6 - election enumeration + feasibility (lib/solver/election.ts)", () => {
  describe("enumerateElections - pruning", () => {
    it("a singleton is always valid regardless of relationships", () => {
      const graph = buildPermissionGraph([permission("a")], []);
      const result = enumerateElections([permission("a")], graph);
      expect(result.elections).toHaveLength(1);
      expect(result.elections[0]!.memberPermissionIds).toEqual(["a"]);
    });

    it("prunes a pair with no established relationship (fail-closed UNKNOWN default)", () => {
      const perms = [permission("a"), permission("b")];
      const graph = buildPermissionGraph(perms, []);
      const result = enumerateElections(perms, graph);
      // Only the two singletons should be valid - not the combined pair.
      expect(result.elections.map((e) => e.memberPermissionIds.sort().join(","))).toEqual(["a", "b"]);
      expect(result.prunedElections).toBe(1);
      expect(result.candidateElections).toBe(3);
    });

    it("prunes ALTERNATIVE and MUTUALLY_EXCLUSIVE pairs from co-occurring in an election", () => {
      const perms = [permission("a"), permission("b"), permission("c")];
      const graph = buildPermissionGraph(
        perms,
        [rel({ fromPermissionId: "a", toPermissionId: "b", relationshipType: "ALTERNATIVE" }), rel({ fromPermissionId: "a", toPermissionId: "c", relationshipType: "MUTUALLY_EXCLUSIVE" }), rel({ fromPermissionId: "b", toPermissionId: "c", relationshipType: "CONCURRENT_DISREGARDED" })]
      );
      const result = enumerateElections(perms, graph);
      const combos = result.elections.map((e) => e.memberPermissionIds.sort().join(","));
      expect(combos).toContain("a");
      expect(combos).toContain("b");
      expect(combos).toContain("c");
      expect(combos).toContain("b,c"); // combinable
      expect(combos).not.toContain("a,b"); // ALTERNATIVE
      expect(combos).not.toContain("a,c"); // MUTUALLY_EXCLUSIVE
    });

    it("allows a CONCURRENT_DISREGARDED/CONCURRENT_COUNTED clique to combine", () => {
      const perms = [permission("a"), permission("b")];
      const graph = buildPermissionGraph(perms, [rel({ fromPermissionId: "a", toPermissionId: "b", relationshipType: "CONCURRENT_COUNTED" })]);
      const result = enumerateElections(perms, graph);
      expect(result.elections.map((e) => e.memberPermissionIds.sort().join(","))).toEqual(expect.arrayContaining(["a", "b", "a,b"]));
    });

    it("fails closed (limitExceeded, zero elections) rather than attempting an unbounded search past the configured cap", () => {
      const perms = Array.from({ length: 21 }, (_, i) => permission(`p${i}`));
      const graph = buildPermissionGraph(perms, []);
      const result = enumerateElections(perms, graph, 20);
      expect(result.limitExceeded).toBe(true);
      expect(result.elections).toHaveLength(0);
      expect(result.candidateElections).toBe(0);
    });
  });

  describe("evaluateElection - allocation (design doc §E.5 worked cases)", () => {
    it("Case: one permission covers the entire amount - trivial election, closed-form check", () => {
      const p = permission("a", { formulaType: "FLAT_AMOUNT", thresholdValue: 250 });
      const graph = buildPermissionGraph([p], []);
      const permissionsById = new Map([["a", p]]);
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["a"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 100,
        eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(evalResult.totalAllocated).toBe(100);
      expect(evalResult.legs[0]!.standaloneCapacity).toBe(250);
    });

    it("Case: fixed + ratio concurrent, DISREGARDED - fixed usage does not shrink ratio room", () => {
      const fixedP = permission("fixed", { formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
      const ratioP = permission("ratio", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 5, params: {} });
      const graph = buildPermissionGraph([fixedP, ratioP], [rel({ fromPermissionId: "fixed", toPermissionId: "ratio", relationshipType: "CONCURRENT_DISREGARDED" })]);
      const permissionsById = new Map([["fixed", fixedP], ["ratio", ratioP]]);
      const withoutFixedRoom = 5 * FIN.ebitda - (FIN.totalDebt - FIN.cash); // netDebt basis: 2500 - (800-50) = 1750

      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["fixed", "ratio"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 10000,
        eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      const ratioLeg = evalResult.legs.find((l) => l.permissionId === "ratio")!;
      expect(ratioLeg.standaloneCapacity).toBeCloseTo(withoutFixedRoom, 6);
    });

    it("Case: fixed + ratio concurrent, COUNTED - fixed usage shrinks ratio room by the fixed allocation", () => {
      const fixedP = permission("fixed", { formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
      const ratioP = permission("ratio", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 5, params: {} });
      const graph = buildPermissionGraph([fixedP, ratioP], [rel({ fromPermissionId: "fixed", toPermissionId: "ratio", relationshipType: "CONCURRENT_COUNTED" })]);
      const permissionsById = new Map([["fixed", fixedP], ["ratio", ratioP]]);
      const withoutFixedRoom = 5 * FIN.ebitda - (FIN.totalDebt - FIN.cash); // netDebt basis: 1750
      const expectedRatioRoom = withoutFixedRoom - 50; // fixed's $50 counted against the ratio basis

      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["fixed", "ratio"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 10000,
        eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      const ratioLeg = evalResult.legs.find((l) => l.permissionId === "ratio")!;
      expect(ratioLeg.standaloneCapacity).toBeCloseTo(expectedRatioRoom, 6);
    });

    it("Case: fixed + SSNL-basis ratio concurrent COUNTED, secured transaction - the fixed basket's contribution counts toward secured debt too (report §O item 3 fix)", () => {
      const fixedP = permission("fixed", { formulaType: "FLAT_AMOUNT", thresholdValue: 50 });
      const ratioP = permission("ratio", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 5, params: { debtBasis: "secured" } });
      const graph = buildPermissionGraph([fixedP, ratioP], [rel({ fromPermissionId: "fixed", toPermissionId: "ratio", relationshipType: "CONCURRENT_COUNTED" })]);
      const permissionsById = new Map([["fixed", fixedP], ["ratio", ratioP]]);
      const withoutFixedRoom = 5 * FIN.ebitda - (FIN.securedDebt - FIN.cash); // SSNL basis: 2500 - (400-50) = 2150
      const expectedRatioRoom = withoutFixedRoom - 50; // fixed's $50 counted as secured too, since the transaction is secured

      const securedTransaction = { ...baseTransaction, secured: true };
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["fixed", "ratio"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 10000,
        eligibilityContext: { transaction: securedTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      const ratioLeg = evalResult.legs.find((l) => l.permissionId === "ratio")!;
      // Before the fix this would have been `withoutFixedRoom` (understating
      // secured pro forma debt by ignoring the concurrently-counted fixed
      // basket's own $50) - a false-affirmative risk for a real secured
      // Phase 1 transaction.
      expect(ratioLeg.standaloneCapacity).toBeCloseTo(expectedRatioRoom, 6);
    });

    it("Case: automatic lien linkage - a lien leg is included automatically once its linked debt leg is included, allocated to match", () => {
      const debtP = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
      const lienP = permission("lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
      const graph = buildPermissionGraph([debtP, lienP], [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" })]);
      const permissionsById = new Map([["debt", debtP], ["lien", lienP]]);

      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["debt"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 200,
        eligibilityContext: { transaction: { ...baseTransaction, secured: true }, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      const lienLeg = evalResult.legs.find((l) => l.permissionId === "lien");
      expect(lienLeg).toBeDefined();
      expect(lienLeg!.linkedFrom).toBe("debt");
      expect(lienLeg!.amountAllocated).toBe(200); // matches the debt leg's own allocation
    });

    it("Case: debt permission available but lien permission insufficient - LIEN_PERMISSION requirement fails when no linkage exists and pool priority is requested but unmet", () => {
      const debtP = permission("debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
      const graph = buildPermissionGraph([debtP], []);
      const permissionsById = new Map([["debt", debtP]]);
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["debt"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 200,
        eligibilityContext: {
          transaction: { ...baseTransaction, secured: true, collateralPools: [{ id: "pool-a", name: "Pool A" }], requestedLienPriority: [{ poolId: "pool-a", priorityTier: "FIRST" }] },
          entityClasses: [],
          ruleActivationConditions: [],
          activationState: emptyActivationState,
          asOfDate: new Date(),
        },
        sharedConstraints: [],
        collateralScopes: [],
      });
      const priorityReq = evalResult.requirements.find((r) => r.class === "PRIORITY_CONDITION");
      expect(priorityReq?.status).toBe("FAILED");
    });

    it("Case: non-authoritative shared usage must not yield favorable remaining capacity", () => {
      const p = permission("a", { formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
      const graph = buildPermissionGraph([p], []);
      const constraint: SharedConstraint = {
        id: "sc-unattrib",
        companyId: "co-1",
        name: "Unattributed shared cap",
        cap: { amount: 100 },
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        members: [{ permissionId: "a" }],
        measurementBasis: "CURRENTLY_OUTSTANDING",
        followsRefinancing: false,
        currentUsage: 0,
        currentUsageStatus: "ZERO_NO_ATTRIBUTED_USAGE",
        currentUsageAuthoritative: false,
        sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
      };
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["a"], rationale: "" },
        permissionsById: new Map([["a", p]]),
        graph,
        financials: FIN,
        requestedAmount: 50,
        eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [constraint],
        collateralScopes: [],
      });
      const sharedReq = evalResult.requirements.find((r) => r.class === "SHARED_CAP");
      expect(sharedReq?.status).toBe("UNKNOWN");
      expect(sharedReq?.reasonCategory).toBe("EXTERNAL_INPUT");
      // Must not allocate as if remaining = cap − 0.
      expect(evalResult.legs[0]!.amountAllocated).toBe(0);
      expect(evalResult.requirements.some((r) => r.status === "UNKNOWN")).toBe(true);
    });

    it("Case: shared capacity cap - a permission's allocation is capped at the constraint's remaining headroom", () => {
      const p = permission("a", { formulaType: "FLAT_AMOUNT", thresholdValue: 500 });
      const graph = buildPermissionGraph([p], []);
      const constraint: SharedConstraint = {
        id: "sc-1",
        companyId: "co-1",
        name: "Shared cross-instrument cap",
        cap: { amount: 100 },
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        members: [{ permissionId: "a" }],
        measurementBasis: "CURRENTLY_OUTSTANDING",
        followsRefinancing: false,
        currentUsage: 60,
        currentUsageStatus: "COMPUTED",
        currentUsageAuthoritative: true,
        sourceProvision: { documentId: "doc-1", sectionRef: "§shared" },
      };
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["a"], rationale: "" },
        permissionsById: new Map([["a", p]]),
        graph,
        financials: FIN,
        requestedAmount: 500,
        eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [constraint],
        collateralScopes: [],
      });
      // Standalone capacity is 500 but shared headroom is 100-60=40.
      expect(evalResult.legs[0]!.amountAllocated).toBe(40);
    });

    it("Case: entity scope mismatch fails the GUARANTOR_CONDITION requirement", () => {
      const p = permission("a", { entityScope: ["GUARANTOR_RS"] });
      const graph = buildPermissionGraph([p], []);
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["a"], rationale: "" },
        permissionsById: new Map([["a", p]]),
        graph,
        financials: FIN,
        requestedAmount: 10,
        eligibilityContext: { transaction: baseTransaction, entityClasses: ["NON_GUARANTOR_RS"], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(evalResult.requirements.some((r) => r.class === "GUARANTOR_CONDITION" && r.status === "FAILED")).toBe(true);
    });

    it("Case: an unsupported eligibility-condition kind fails closed (UNKNOWN), never silently SATISFIED", () => {
      const p = permission("a", {
        eligibilityConditions: [{ id: "ec-1", description: "Requires Ba3/BB- or better from either rating agency", kind: "RATINGS_THRESHOLD" }],
      });
      const graph = buildPermissionGraph([p], []);
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["a"], rationale: "" },
        permissionsById: new Map([["a", p]]),
        graph,
        financials: FIN,
        requestedAmount: 10,
        eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      const cond = evalResult.requirements.find((r) => r.class === "COVENANT_APPLICABILITY" && r.detail.includes("RATINGS_THRESHOLD"));
      expect(cond?.status).toBe("UNKNOWN");
      expect(cond?.reasonCategory).toBe("LEGAL_JUDGMENT");
      expect(buildPermissionPaths([evalResult])[0]!.status).not.toBe("CLEAR");
    });
  });

  describe("bisectMaxFeasibleAmount - monotone bisection", () => {
    it("converges to the fixed point of a linear non-increasing capacity function", () => {
      // capacity(x) = 1000 - x  =>  fixed point where x = capacity(x) is x = 500
      const result = bisectMaxFeasibleAmount((x) => 1000 - x);
      expect(result).toBeCloseTo(500, 1);
    });

    it("is deterministic - identical inputs produce identical outputs", () => {
      const fn = (x: number) => 2000 - 1.5 * x;
      expect(bisectMaxFeasibleAmount(fn)).toBe(bisectMaxFeasibleAmount(fn));
    });
  });

  describe("computeElectionMaxCapacityBisected - two concurrently-drawn INCURRENCE_BASED members", () => {
    it("returns a positive, finite maximum for two ratio-room permissions sharing the same debt basis", () => {
      const r1 = permission("r1", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 5, params: {} });
      const r2 = permission("r2", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4, params: {} });
      const max = computeElectionMaxCapacityBisected([r1, r2], 0, FIN);
      expect(max).toBeGreaterThan(0);
      expect(Number.isFinite(max)).toBe(true);
    });
  });

  describe("buildPermissionPaths - status derivation", () => {
    it("evaluates 2+ concurrent incurrence-based members for a specific amount (joint feasibility fix) rather than reporting NOT_EVALUABLE", () => {
      // capacity(r1) = 5*500 - 750 = 1750; capacity(r2) = 4*500 - 750 = 1250.
      const r1 = permission("r1", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 5, params: {} });
      const r2 = permission("r2", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 4, params: {} });
      const graph = buildPermissionGraph([r1, r2], [rel({ fromPermissionId: "r1", toPermissionId: "r2", relationshipType: "CONCURRENT_COUNTED" })]);
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["r1", "r2"], rationale: "" },
        permissionsById: new Map([["r1", r1], ["r2", r2]]),
        graph,
        financials: FIN,
        requestedAmount: 100,
        eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(evalResult.status).toBe("EVALUATED");
      expect(evalResult.maxCapacity).toBeCloseTo(1250, 6); // min across members, never the sum
      expect(buildPermissionPaths([evalResult])).toHaveLength(1);
      expect(buildPermissionPaths([evalResult])[0]!.status).toBe("CLEAR");
    });

    it("joint feasibility: two permissions each independently 'appear' to permit $300M, but the shared pro forma state only supports $300M jointly, not $600M", () => {
      // Both reference total net leverage off the SAME pre-transaction state:
      // capacity(a) = capacity(b) = threshold*ebitda - (totalDebt - cash).
      // threshold*500 - 750 = 300  =>  threshold = 2.1
      const a = permission("a", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 2.1, params: {} });
      const b = permission("b", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 2.1, params: {} });
      const graph = buildPermissionGraph([a, b], [rel({ fromPermissionId: "a", toPermissionId: "b", relationshipType: "CONCURRENT_COUNTED" })]);
      const permissionsById = new Map([["a", a], ["b", b]]);

      const at300 = evaluateElection({
        election: { id: "e", memberPermissionIds: ["a", "b"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 300,
        eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(buildPermissionPaths([at300])[0]!.status).toBe("CLEAR");
      expect(at300.totalAllocated).toBeCloseTo(300, 6);

      // The buggy independent-evaluation approach would wrongly sum 300+300=600 and clear it.
      const at600 = evaluateElection({
        election: { id: "e", memberPermissionIds: ["a", "b"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 600,
        eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(buildPermissionPaths([at600])[0]!.status).toBe("BLOCKED"); // never CLEAR
      expect(at600.requirements.some((r) => r.status === "FAILED")).toBe(true);
    });

    it("boundary: exactly at the joint ceiling clears; $1 above it blocks", () => {
      const a = permission("a", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 2.1, params: {} });
      const b = permission("b", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 2.1, params: {} });
      const graph = buildPermissionGraph([a, b], [rel({ fromPermissionId: "a", toPermissionId: "b", relationshipType: "CONCURRENT_COUNTED" })]);
      const permissionsById = new Map([["a", a], ["b", b]]);
      const run = (amount: number) =>
        evaluateElection({
          election: { id: "e", memberPermissionIds: ["a", "b"], rationale: "" },
          permissionsById,
          graph,
          financials: FIN,
          requestedAmount: amount,
          eligibilityContext: { transaction: baseTransaction, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
          sharedConstraints: [],
          collateralScopes: [],
        });
      expect(buildPermissionPaths([run(300)])[0]!.status).toBe("CLEAR");
      expect(buildPermissionPaths([run(301)])[0]!.status).toBe("BLOCKED");
    });

    it("two ratio permissions with different applicable metrics (total vs. secured net leverage) - both must hold for a secured incurrence", () => {
      // TNL basis: threshold*500 - 750 = 300 => threshold 2.1
      const tnl = permission("tnl", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 2.1, params: { debtBasis: "total" } });
      // SSNL basis: threshold*500 - (400-50) = 150 => threshold*500 = 500 => threshold = 1.0
      const ssnl = permission("ssnl", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 1.0, params: { debtBasis: "secured" } });
      const tnlLien = permission("tnl-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
      const ssnlLien = permission("ssnl-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
      const graph = buildPermissionGraph(
        [tnl, ssnl, tnlLien, ssnlLien],
        [
          rel({ fromPermissionId: "tnl", toPermissionId: "ssnl", relationshipType: "CONCURRENT_COUNTED" }),
          rel({ fromPermissionId: "tnl", toPermissionId: "tnl-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
          rel({ fromPermissionId: "ssnl", toPermissionId: "ssnl-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
        ],
      );
      const permissionsById = new Map([
        ["tnl", tnl],
        ["ssnl", ssnl],
        ["tnl-lien", tnlLien],
        ["ssnl-lien", ssnlLien],
      ]);
      const secured = { ...baseTransaction, secured: true };

      // SSNL room (150) is the tighter of the two - joint ceiling is min(300, 150) = 150.
      const at150 = evaluateElection({
        election: { id: "e", memberPermissionIds: ["tnl", "ssnl"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 150,
        eligibilityContext: { transaction: secured, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(buildPermissionPaths([at150])[0]!.status).toBe("CLEAR");

      const at250 = evaluateElection({
        election: { id: "e", memberPermissionIds: ["tnl", "ssnl"], rationale: "" },
        permissionsById,
        graph,
        financials: FIN,
        requestedAmount: 250,
        eligibilityContext: { transaction: secured, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(buildPermissionPaths([at250])[0]!.status).toBe("BLOCKED"); // TNL alone would allow 250, but SSNL blocks it
      expect(at250.requirements.find((r) => r.scope.permissionId === "ssnl")?.status).toBe("FAILED");
      expect(at250.requirements.find((r) => r.scope.permissionId === "tnl")?.status).toBe("SATISFIED");

      // Without any lien path, secured dual-ratio election is BLOCKED (debt+lien gate).
      const noLienGraph = buildPermissionGraph([tnl, ssnl], [rel({ fromPermissionId: "tnl", toPermissionId: "ssnl", relationshipType: "CONCURRENT_COUNTED" })]);
      const noLien = evaluateElection({
        election: { id: "e", memberPermissionIds: ["tnl", "ssnl"], rationale: "" },
        permissionsById: new Map([
          ["tnl", tnl],
          ["ssnl", ssnl],
        ]),
        graph: noLienGraph,
        financials: FIN,
        requestedAmount: 150,
        eligibilityContext: { transaction: secured, entityClasses: [], ruleActivationConditions: [], activationState: emptyActivationState, asOfDate: new Date() },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(buildPermissionPaths([noLien])[0]!.status).toBe("BLOCKED");
      expect(noLien.requirements.some((r) => r.class === "LIEN_PERMISSION" && r.status === "FAILED")).toBe(true);
    });
  });

  describe("secured borrowing requires debt + lien per debt leg (correctness gate)", () => {
    it("blocks Ratio Debt that free-rides on another leg's AUTOMATIC_LINKED_PERMISSION lien", () => {
      // Synthetic (non-Coherent): SCF flat + Ratio Debt under CONCURRENT_DISREGARDED.
      // Pre-fix: Ratio Debt inherited SCF auto-lien → false-favorable secured max.
      const scf = permission("scf", { formulaType: "FLAT_AMOUNT", thresholdValue: 1779 });
      const ratio = permission("ratio", {
        amountKind: "INCURRENCE_BASED",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 2.0,
        params: { debtBasis: "total" },
      });
      const scfLien = permission("scf-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
      const graph = buildPermissionGraph(
        [scf, ratio, scfLien],
        [
          rel({ fromPermissionId: "scf", toPermissionId: "ratio", relationshipType: "CONCURRENT_DISREGARDED" }),
          rel({ fromPermissionId: "scf", toPermissionId: "scf-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
        ],
      );
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["scf", "ratio"], rationale: "" },
        permissionsById: new Map([
          ["scf", scf],
          ["ratio", ratio],
          ["scf-lien", scfLien],
        ]),
        graph,
        financials: FIN,
        requestedAmount: 5000,
        eligibilityContext: {
          transaction: { ...baseTransaction, secured: true },
          entityClasses: [],
          ruleActivationConditions: [],
          activationState: emptyActivationState,
          asOfDate: new Date(),
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
    });

    it("allows secured debt when each debt leg has its own auto-lien", () => {
      const mila = permission("mila", {
        amountKind: "INCURRENCE_BASED",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 3.0,
        params: { debtBasis: "secured" },
      });
      const capex = permission("capex", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
      const milaLien = permission("mila-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
      const capexLien = permission("capex-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
      const graph = buildPermissionGraph(
        [mila, capex, milaLien, capexLien],
        [
          rel({ fromPermissionId: "capex", toPermissionId: "mila", relationshipType: "CONCURRENT_DISREGARDED" }),
          rel({ fromPermissionId: "mila", toPermissionId: "mila-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
          rel({ fromPermissionId: "capex", toPermissionId: "capex-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" }),
        ],
      );
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["mila", "capex"], rationale: "" },
        permissionsById: new Map([
          ["mila", mila],
          ["capex", capex],
          ["mila-lien", milaLien],
          ["capex-lien", capexLien],
        ]),
        graph,
        financials: FIN,
        requestedAmount: 100,
        eligibilityContext: {
          transaction: { ...baseTransaction, secured: true },
          entityClasses: [],
          ruleActivationConditions: [],
          activationState: emptyActivationState,
          asOfDate: new Date(),
        },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(buildPermissionPaths([evalResult])[0]!.status).toBe("CLEAR");
      expect(evalResult.requirements.filter((r) => r.class === "LIEN_PERMISSION" && r.status === "FAILED")).toHaveLength(0);
    });

    it("CONCURRENT_COUNTED fixed+ratio maxCapacity is not the sum of standalones", () => {
      const fixedP = permission("fixed", { formulaType: "FLAT_AMOUNT", thresholdValue: 200 });
      const ratioP = permission("ratio", {
        amountKind: "INCURRENCE_BASED",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 5,
        params: { debtBasis: "total" },
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
        requestedAmount: 10000,
        eligibilityContext: {
          transaction: baseTransaction,
          entityClasses: [],
          ruleActivationConditions: [],
          activationState: emptyActivationState,
          asOfDate: new Date(),
        },
        sharedConstraints: [],
        collateralScopes: [],
      });
      const fixedCap = evalResult.legs.find((l) => l.permissionId === "fixed")!.standaloneCapacity!;
      const ratioCap = evalResult.legs.find((l) => l.permissionId === "ratio")!.standaloneCapacity!;
      expect(evalResult.maxCapacity).toBeDefined();
      expect(evalResult.maxCapacity!).toBeLessThan(fixedCap + ratioCap - 1e-6);
      // COUNTED: max(fixed-only, disregarded(0)+ratioRoom) = max(200, ratioRoom)
      expect(evalResult.maxCapacity!).toBeCloseTo(Math.max(fixedCap, ratioCap), 6);
    });

    it("adversarial non-Coherent: independent LIEN member covers debt without auto-link", () => {
      const debt = permission("gen-debt", { formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
      const lien = permission("gen-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 100 });
      const graph = buildPermissionGraph([debt, lien], []);
      const evalResult = evaluateElection({
        election: { id: "e", memberPermissionIds: ["gen-debt", "gen-lien"], rationale: "" },
        permissionsById: new Map([
          ["gen-debt", debt],
          ["gen-lien", lien],
        ]),
        graph,
        financials: FIN,
        requestedAmount: 50,
        eligibilityContext: {
          transaction: { ...baseTransaction, secured: true },
          entityClasses: [],
          ruleActivationConditions: [],
          activationState: emptyActivationState,
          asOfDate: new Date(),
        },
        sharedConstraints: [],
        collateralScopes: [],
      });
      expect(buildPermissionPaths([evalResult])[0]!.status).toBe("CLEAR");
      expect(
        evalResult.requirements.some(
          (r) => r.class === "LIEN_PERMISSION" && r.scope.permissionId === "gen-debt" && r.status === "SATISFIED",
        ),
      ).toBe(true);
    });
  });

  describe("permissionAsProvision", () => {
    it("maps a Permission onto the CovenantProvisionInput shape evaluateProvision expects", () => {
      const p = permission("a", { code: "flat_basket", formulaType: "GREATER_OF_FLAT_OR_PCT_EBITDA", thresholdValue: 50, params: { pctEbitda: 0.1 } });
      const provision = permissionAsProvision(p);
      expect(provision.formulaType).toBe("GREATER_OF_FLAT_OR_PCT_EBITDA");
      expect(provision.thresholdValue).toBe(50);
      expect(provision.params).toEqual({ pctEbitda: 0.1 });
    });
  });
});
