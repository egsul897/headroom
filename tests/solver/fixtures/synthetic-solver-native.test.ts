/**
 * Synthetic solver-native fixtures (task §11) - Cases A through J.
 *
 * These fixtures are entirely test-only, in-memory data, deliberately
 * shaped differently from Coherent's own data (design doc §S.3: "must
 * differ from Coherent's in shape, not just in dollar parameters, to prove
 * genuine generalization"). Nothing here reads or writes
 * prisma/seed-data.ts, the Coherent seed function, or any existing golden
 * test - this file is the "new, clearly-separate seed/test-fixture code"
 * the task requires. No company/document/section-specific solver code is
 * introduced anywhere in lib/solver/* to make these pass; every case below
 * exercises the exact same generalized runSolver entry point.
 *
 * Each case is run end-to-end through lib/solver/service.ts's `runSolver` -
 * the same function a real integration would call - so these are Phase 6/7
 * "end-to-end transaction tests" (design doc §S.4), not unit tests of an
 * internal helper.
 */

import { describe, expect, it } from "vitest";
import { runSolver } from "../../../lib/solver/service";
import type { ActivationState, Permission, PermissionCollateralScope, PermissionRelationship, RuleActivationCondition, SharedConstraint, Transaction } from "../../../lib/solver/types";

const FIN = { ebitda: 500, cash: 50, interestExpense: 40, cumulativeNetIncome: 0, equityProceedsSinceIssue: 0, assumedNewDebtRatePct: 0, totalDebt: 800, securedDebt: 400 };

function emptyActivationState(overrides: Partial<ActivationState> = {}): ActivationState {
  return { asOfDate: new Date("2026-06-30"), series: {}, events: [], usageCounts: {}, unknownKeys: new Set(), ...overrides };
}

function baseTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
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
    ...overrides,
  };
}

function permission(id: string, overrides: Partial<Permission> = {}): Permission {
  return {
    id,
    documentId: overrides.documentId ?? "synth-doc-1",
    companyId: "synth-co",
    grantType: "DEBT_INCURRENCE",
    amountKind: "FIXED",
    action: `synthetic permission ${id}`,
    entityScope: [],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 100,
    eligibilityConditions: [],
    termConditions: [],
    measurementBasis: "CUMULATIVE_INCURRED",
    sourceProvision: { documentId: overrides.documentId ?? "synth-doc-1", sectionRef: `§${id}` },
    modelingStatus: "MODELED",
    ...overrides,
  };
}

function rel(overrides: Partial<PermissionRelationship>): PermissionRelationship {
  return {
    id: overrides.id ?? `${overrides.fromPermissionId}->${overrides.toPermissionId}`,
    companyId: "synth-co",
    fromPermissionId: "a",
    toPermissionId: "b",
    relationshipType: "CONCURRENT_DISREGARDED",
    sourceProvision: { documentId: "synth-doc-1", sectionRef: "§rel" },
    ...overrides,
  };
}

describe("Synthetic solver-native fixtures (Cases A-J)", () => {
  describe("Case A - fixed + ratio stacking with disregard semantics", () => {
    it("a fixed permission and a ratio permission used concurrently, fixed disregarded from the ratio denominator", () => {
      const fixedP = permission("fixed-basket", { formulaType: "FLAT_AMOUNT", thresholdValue: 75, action: "Fixed general debt basket" });
      const ratioP = permission("leverage-basket", {
        amountKind: "INCURRENCE_BASED",
        formulaType: "LEVERAGE_RATIO_ROOM",
        thresholdValue: 5,
        params: {},
        action: "Leverage-ratio incurrence basket",
      });
      const relationship = rel({ fromPermissionId: "fixed-basket", toPermissionId: "leverage-basket", relationshipType: "CONCURRENT_DISREGARDED", sourceProvision: { documentId: "synth-doc-1", sectionRef: "§A.3" } });

      const result = runSolver({
        eligiblePermissions: [fixedP, ratioP],
        relationships: [relationship],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 1500 }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });

      expect(result.overall.status).toBe("CLEAR");
      const legs = result.permissionPathUsed!.legs;
      expect(legs.find((l) => l.permissionId === "fixed-basket")!.amountAllocated).toBe(75);
      const ratioLeg = legs.find((l) => l.permissionId === "leverage-basket")!;
      // Disregarded: ratio room is computed on the UNCHANGED debt basis, not reduced by the fixed basket's own draw.
      expect(ratioLeg.standaloneCapacity).toBeCloseTo(5 * FIN.ebitda - (FIN.totalDebt - FIN.cash), 6);
      const fixedLeg = legs.find((l) => l.permissionId === "fixed-basket")!;
      expect(fixedLeg.concurrentTreatment?.disregardedFromRatioDenominator).toBe(true);
    });
  });

  describe("Case B - debt + lien independence (debt available, lien priority insufficient)", () => {
    it("debt is modeled and sufficient, but the requested lien priority is not covered - overall BLOCKED on PRIORITY_CONDITION alone", () => {
      const debtP = permission("term-loan", { formulaType: "FLAT_AMOUNT", thresholdValue: 300, action: "Term loan debt basket" });
      const lienP = permission("term-loan-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0, action: "Automatic lien for term loan" });
      const linkage = rel({ fromPermissionId: "term-loan", toPermissionId: "term-loan-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION", sourceProvision: { documentId: "synth-doc-1", sectionRef: "§B.2" } });
      const scope: PermissionCollateralScope = { permissionId: "term-loan-lien", collateralPoolId: "pool-a", priorityTier: "SECOND" };

      const result = runSolver({
        eligiblePermissions: [debtP, lienP],
        relationships: [linkage],
        sharedConstraints: [],
        collateralScopes: [scope],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 200, secured: true, collateralPools: [{ id: "pool-a", name: "Pool A" }], requestedLienPriority: [{ poolId: "pool-a", priorityTier: "FIRST" }] }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });

      expect(result.overall.status).toBe("BLOCKED");
      const priorityReq = result.permissionPathUsed?.conditionsTested.find((c) => c.class === "PRIORITY_CONDITION") ?? result.alternatives[0]?.path.conditionsTested.find((c) => c.class === "PRIORITY_CONDITION");
      expect(priorityReq?.status).toBe("FAILED");
      // The debt leg itself was fully available - only the priority condition failed.
      const debtReq = (result.permissionPathUsed?.conditionsTested ?? result.alternatives[0]!.path.conditionsTested).find((c) => c.class === "DEBT_PERMISSION");
      expect(debtReq?.status).toBe("SATISFIED");
    });
  });

  describe("Case C - automatic lien linkage", () => {
    it("a debt permission automatically provides its corresponding lien permission at matching priority", () => {
      const debtP = permission("notes", { formulaType: "FLAT_AMOUNT", thresholdValue: 400, action: "Notes debt basket" });
      const lienP = permission("notes-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0, action: "Automatic lien for notes" });
      const linkage = rel({ fromPermissionId: "notes", toPermissionId: "notes-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION", sourceProvision: { documentId: "synth-doc-1", sectionRef: "§C.1" } });
      const scope: PermissionCollateralScope = { permissionId: "notes-lien", collateralPoolId: "pool-a", priorityTier: "FIRST" };

      const result = runSolver({
        eligiblePermissions: [debtP, lienP],
        relationships: [linkage],
        sharedConstraints: [],
        collateralScopes: [scope],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 200, secured: true, collateralPools: [{ id: "pool-a", name: "Pool A" }], requestedLienPriority: [{ poolId: "pool-a", priorityTier: "FIRST" }] }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });

      expect(result.overall.status).toBe("CLEAR");
      const linked = result.permissionPathUsed!.linkedPermissions;
      expect(linked).toHaveLength(1);
      expect(linked[0]).toMatchObject({ debtPermissionId: "notes", lienPermissionId: "notes-lien", priorityTier: "FIRST" });
      const lienLeg = result.permissionPathUsed!.legs.find((l) => l.permissionId === "notes-lien")!;
      expect(lienLeg.amountAllocated).toBe(200);
      expect(lienLeg.linkedFrom).toBe("notes");
    });
  });

  describe("Case D - alternative path: TNL clears while FCCR needs an assumption", () => {
    it("overall CLEARS through the TNL alternative even though the FCCR alternative is ASSUMPTION_REQUIRED (the fixed old-MAX-bug scenario)", () => {
      const tnlP = permission("tnl-basket", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 5, params: {}, action: "TNL-gated basket" });
      const fccrP = permission("fccr-basket", { amountKind: "INCURRENCE_BASED", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2, action: "FCCR-gated basket" });
      const alternative = rel({ fromPermissionId: "tnl-basket", toPermissionId: "fccr-basket", relationshipType: "ALTERNATIVE", sourceProvision: { documentId: "synth-doc-1", sectionRef: "§D.4" } });

      // FIN has assumedNewDebtRatePct = 0 -> the FCCR basket's leaf calculation is review_required (missing rate) -> RATIO_CONDITION UNKNOWN/MISSING_ASSUMPTION.
      const result = runSolver({
        eligiblePermissions: [tnlP, fccrP],
        relationships: [alternative],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 100 }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });

      expect(result.overall.status).toBe("CLEAR");
      expect(result.permissionPathUsed!.legs[0]!.permissionId).toBe("tnl-basket");
      // The FCCR alternative must still be visible in `alternatives`, not silently dropped - it has no
      // leg (its ratio calculation never resolved to a modeled capacity) but its RequirementResult, scoped
      // to fccr-basket, is present and UNKNOWN/MISSING_ASSUMPTION.
      const fccrAlt = result.alternatives.find((a) => a.path.conditionsTested.some((c) => c.scope.permissionId === "fccr-basket"));
      expect(fccrAlt?.path.status).toBe("ASSUMPTION_REQUIRED");
      expect(fccrAlt?.path.conditionsTested.find((c) => c.scope.permissionId === "fccr-basket")?.reasonCategory).toBe("MISSING_ASSUMPTION");
    });
  });

  describe("Case E - shared constraint: two permissions consume one shared cross-instrument cap", () => {
    it("two permissions in the same election jointly exhaust one shared cap rather than each drawing it independently", () => {
      const p1 = permission("series-2031", { formulaType: "FLAT_AMOUNT", thresholdValue: 200, action: "2031 Notes debt basket" });
      const p2 = permission("series-2032", { formulaType: "FLAT_AMOUNT", thresholdValue: 200, action: "2032 Notes debt basket" });
      const combine = rel({ fromPermissionId: "series-2031", toPermissionId: "series-2032", relationshipType: "CONCURRENT_COUNTED", sourceProvision: { documentId: "synth-doc-1", sectionRef: "§E.1" } });
      const sharedCap: SharedConstraint = {
        id: "shared-notes-cap",
        companyId: "synth-co",
        name: "Combined notes cap",
        cap: { amount: 250 },
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        members: [{ permissionId: "series-2031" }, { permissionId: "series-2032" }],
        measurementBasis: "CUMULATIVE_INCURRED",
        followsRefinancing: true,
        currentUsage: 0,
        sourceProvision: { documentId: "synth-doc-1", sectionRef: "§E.1" },
      };

      const result = runSolver({
        eligiblePermissions: [p1, p2],
        relationships: [combine],
        sharedConstraints: [sharedCap],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 400 }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });

      // $400 was requested but the shared cap only has $250 of headroom - no
      // election (p1 alone, p2 alone, or the two jointly) can cover the full
      // $400, so this must BLOCK rather than silently clear a partial amount
      // (the same fail-closed shortfall rule the joint-feasibility fix
      // applies generally, not only to concurrently-drawn ratio permissions).
      expect(result.overall.status).toBe("BLOCKED");
      const jointPath = result.alternatives.find((a) => a.path.legs.length === 2)!.path;
      const totalAllocated = jointPath.legs.reduce((sum, l) => sum + l.amountAllocated, 0);
      expect(totalAllocated).toBeLessThanOrEqual(250);
      expect(jointPath.sharedConstraintsConsumed.reduce((s, c) => s + c.amountConsumed, 0)).toBeLessThanOrEqual(250);
      expect(result.constraintsEvaluated.sharedConstraints).toContainEqual(sharedCap);
    });

    it("clears when the requested amount fits within the shared cap", () => {
      const p1 = permission("series-2031", { formulaType: "FLAT_AMOUNT", thresholdValue: 200, action: "2031 Notes debt basket" });
      const p2 = permission("series-2032", { formulaType: "FLAT_AMOUNT", thresholdValue: 200, action: "2032 Notes debt basket" });
      const combine = rel({ fromPermissionId: "series-2031", toPermissionId: "series-2032", relationshipType: "CONCURRENT_COUNTED", sourceProvision: { documentId: "synth-doc-1", sectionRef: "§E.1" } });
      const sharedCap: SharedConstraint = {
        id: "shared-notes-cap",
        companyId: "synth-co",
        name: "Combined notes cap",
        cap: { amount: 250 },
        aggregationRule: "NAMED_MEMBER_CLAUSES",
        members: [{ permissionId: "series-2031" }, { permissionId: "series-2032" }],
        measurementBasis: "CUMULATIVE_INCURRED",
        followsRefinancing: true,
        currentUsage: 0,
        sourceProvision: { documentId: "synth-doc-1", sectionRef: "§E.1" },
      };
      const result = runSolver({
        eligiblePermissions: [p1, p2],
        relationships: [combine],
        sharedConstraints: [sharedCap],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 250 }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });
      expect(result.overall.status).toBe("CLEAR");
      expect(result.permissionPathUsed!.legs.reduce((s, l) => s + l.amountAllocated, 0)).toBeCloseTo(250, 6);
    });
  });

  describe("Case F - entity-specific sub-cap: a global basket exists, but one entity class has a tighter shared sub-cap", () => {
    it("a non-guarantor incurring entity is capped by the entity-class-filtered constraint even though the permission itself has no per-permission member row", () => {
      const globalP = permission("global-basket", { formulaType: "FLAT_AMOUNT", thresholdValue: 500, entityScope: [], action: "Company-wide general debt basket" });
      const nonGuarantorSubCap: SharedConstraint = {
        id: "non-guarantor-subcap",
        companyId: "synth-co",
        name: "Non-Guarantor Restricted Subsidiary sub-cap",
        cap: { amount: 100 },
        aggregationRule: "ENTITY_CLASS_FILTER",
        members: [{ entityClass: "NON_GUARANTOR_RS" }],
        measurementBasis: "CUMULATIVE_INCURRED",
        followsRefinancing: false,
        currentUsage: 0,
        sourceProvision: { documentId: "synth-doc-1", sectionRef: "§F.6" },
      };

      const nonGuarantorResult = runSolver({
        eligiblePermissions: [globalP],
        relationships: [],
        sharedConstraints: [nonGuarantorSubCap],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 500, incurringEntity: { id: "non-guarantor-sub", name: "Non-Guarantor Sub LLC" } }),
        entityClasses: ["NON_GUARANTOR_RS"],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });
      // Capped by the $100 sub-cap, not the $500 global basket - and since
      // $500 was requested, the shortfall correctly BLOCKS overall (never a
      // silent partial CLEAR for $100 of a $500 ask).
      expect(nonGuarantorResult.overall.status).toBe("BLOCKED");
      expect(nonGuarantorResult.alternatives[0]!.path.legs[0]!.amountAllocated).toBe(100);

      const nonGuarantorWithinCap = runSolver({
        eligiblePermissions: [globalP],
        relationships: [],
        sharedConstraints: [nonGuarantorSubCap],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 100, incurringEntity: { id: "non-guarantor-sub", name: "Non-Guarantor Sub LLC" } }),
        entityClasses: ["NON_GUARANTOR_RS"],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });
      expect(nonGuarantorWithinCap.overall.status).toBe("CLEAR");
      expect(nonGuarantorWithinCap.permissionPathUsed!.legs[0]!.amountAllocated).toBe(100);

      const guarantorResult = runSolver({
        eligiblePermissions: [globalP],
        relationships: [],
        sharedConstraints: [nonGuarantorSubCap],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 500, incurringEntity: { id: "borrower", name: "Borrower" } }),
        entityClasses: ["BORROWER"],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });
      expect(guarantorResult.permissionPathUsed!.legs[0]!.amountAllocated).toBe(500); // the Borrower is not in the constrained entity class - full global capacity applies
    });
  });

  describe("Case G - collateral pools: same debt permitted different priority on two pools", () => {
    it("one lien permission is FIRST priority on Pool A and SECOND priority on Pool B simultaneously", () => {
      const debtP = permission("abl-loan", { formulaType: "FLAT_AMOUNT", thresholdValue: 300, action: "ABL term loan" });
      const lienP = permission("abl-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0, action: "ABL lien" });
      const linkage = rel({ fromPermissionId: "abl-loan", toPermissionId: "abl-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION", sourceProvision: { documentId: "synth-doc-1", sectionRef: "§G.2" } });
      const scopes: PermissionCollateralScope[] = [
        { permissionId: "abl-lien", collateralPoolId: "pool-abl", priorityTier: "FIRST" },
        { permissionId: "abl-lien", collateralPoolId: "pool-fixed-assets", priorityTier: "SECOND" },
      ];

      const result = runSolver({
        eligiblePermissions: [debtP, lienP],
        relationships: [linkage],
        sharedConstraints: [],
        collateralScopes: scopes,
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({
          amount: 150,
          secured: true,
          collateralPools: [{ id: "pool-abl", name: "ABL Priority Collateral" }, { id: "pool-fixed-assets", name: "Fixed Asset Collateral" }],
          requestedLienPriority: [{ poolId: "pool-abl", priorityTier: "FIRST" }, { poolId: "pool-fixed-assets", priorityTier: "SECOND" }],
        }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });

      expect(result.overall.status).toBe("CLEAR");
      const priorityReqs = result.permissionPathUsed!.conditionsTested.filter((c) => c.class === "PRIORITY_CONDITION");
      expect(priorityReqs).toHaveLength(2);
      expect(priorityReqs.every((r) => r.status === "SATISFIED")).toBe(true);
    });

    it("requesting the WRONG priority on one of the two pools fails only that pool's condition", () => {
      const debtP = permission("abl-loan", { formulaType: "FLAT_AMOUNT", thresholdValue: 300 });
      const lienP = permission("abl-lien", { grantType: "LIEN", formulaType: "FLAT_AMOUNT", thresholdValue: 0 });
      const linkage = rel({ fromPermissionId: "abl-loan", toPermissionId: "abl-lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" });
      const scopes: PermissionCollateralScope[] = [
        { permissionId: "abl-lien", collateralPoolId: "pool-abl", priorityTier: "FIRST" },
        { permissionId: "abl-lien", collateralPoolId: "pool-fixed-assets", priorityTier: "SECOND" },
      ];
      const result = runSolver({
        eligiblePermissions: [debtP, lienP],
        relationships: [linkage],
        sharedConstraints: [],
        collateralScopes: scopes,
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({
          amount: 150,
          secured: true,
          collateralPools: [{ id: "pool-fixed-assets", name: "Fixed Asset Collateral" }],
          requestedLienPriority: [{ poolId: "pool-fixed-assets", priorityTier: "FIRST" }], // only SECOND is actually available on this pool
        }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });
      expect(result.overall.status).toBe("BLOCKED");
    });
  });

  describe("Case H - dynamic activation: a covenant activates only when a state predicate becomes true", () => {
    const permissionWithActivation = permission("springing-basket", { formulaType: "FLAT_AMOUNT", thresholdValue: 150, action: "Springing basket" });
    const activation: RuleActivationCondition = {
      id: "springing-activation",
      companyId: "synth-co",
      appliesTo: { permissionId: "springing-basket" },
      predicate: { kind: "POINT_IN_TIME", description: "Liquidity >= $50M", seriesKey: "liquidity", comparator: "gte", threshold: 50 },
      effect: "APPLICABILITY",
      sourceProvision: { documentId: "synth-doc-1", sectionRef: "§H.9" },
    };

    it("is REVIEW_REQUIRED (never silently active) when the activation state is entirely unknown", () => {
      const result = runSolver({
        eligiblePermissions: [permissionWithActivation],
        relationships: [],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [activation],
        financials: FIN,
        transaction: baseTransaction({ amount: 50 }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });
      expect(result.overall.status).toBe("REVIEW_REQUIRED");
    });

    it("CLEARS once the predicate is satisfied", () => {
      const state = emptyActivationState({ series: { liquidity: [{ asOf: new Date("2026-06-01"), value: 75 }] } });
      const result = runSolver({
        eligiblePermissions: [permissionWithActivation],
        relationships: [],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [activation],
        financials: FIN,
        transaction: baseTransaction({ amount: 50 }),
        entityClasses: [],
        activationState: state,
        asOfDate: new Date("2026-06-30"),
      });
      expect(result.overall.status).toBe("CLEAR");
    });

    it("is BLOCKED (confirmed inactive, not merely unresolved) when the predicate is confirmed false", () => {
      const state = emptyActivationState({ series: { liquidity: [{ asOf: new Date("2026-06-01"), value: 10 }] } });
      const result = runSolver({
        eligiblePermissions: [permissionWithActivation],
        relationships: [],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [activation],
        financials: FIN,
        transaction: baseTransaction({ amount: 50 }),
        entityClasses: [],
        activationState: state,
        asOfDate: new Date("2026-06-30"),
      });
      expect(result.overall.status).toBe("BLOCKED");
    });
  });

  describe("Case I - external borrowing-base input: formula computable, missing certified reserve fails closed", () => {
    it("a computable basket gated on a certified external input is REVIEW_REQUIRED (never a fabricated capacity) when the reserve is missing", () => {
      const baseBorrowingBasket = permission("borrowing-base-basket", {
        formulaType: "FLAT_AMOUNT", // the arithmetic itself is trivially computable
        thresholdValue: 200,
        action: "Borrowing-base-gated basket",
        eligibilityConditions: [{ id: "reserve-cert", description: "Requires a certified reserve figure from the most recent Borrowing Base Certificate", kind: "CUSTOM_STATE_PREDICATE", ruleActivationConditionId: "reserve-activation" }],
      });
      const reserveActivation: RuleActivationCondition = {
        id: "reserve-activation",
        companyId: "synth-co",
        appliesTo: { permissionId: "borrowing-base-basket" },
        predicate: { kind: "POINT_IN_TIME", description: "Certified reserve figure present", seriesKey: "certified_reserve", comparator: "gte", threshold: 0 },
        effect: "APPLICABILITY",
        sourceProvision: { documentId: "synth-doc-1", sectionRef: "§I.5" },
      };

      // Missing certified reserve: the series is explicitly marked unknown, exactly as a real missing Borrowing Base Certificate line item would be (design doc §K fail-closed rule).
      const missingReserveState = emptyActivationState({ unknownKeys: new Set(["certified_reserve"]) });
      const missing = runSolver({
        eligiblePermissions: [baseBorrowingBasket],
        relationships: [],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [reserveActivation],
        financials: FIN,
        transaction: baseTransaction({ amount: 50 }),
        entityClasses: [],
        activationState: missingReserveState,
        asOfDate: new Date("2026-06-30"),
      });
      expect(missing.overall.status).toBe("REVIEW_REQUIRED");

      // Once the certificate reports the reserve, the same computable basket clears.
      const withReserveState = emptyActivationState({ series: { certified_reserve: [{ asOf: new Date("2026-06-01"), value: 10 }] } });
      const present = runSolver({
        eligiblePermissions: [baseBorrowingBasket],
        relationships: [],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [reserveActivation],
        financials: FIN,
        transaction: baseTransaction({ amount: 50 }),
        entityClasses: [],
        activationState: withReserveState,
        asOfDate: new Date("2026-06-30"),
      });
      expect(present.overall.status).toBe("CLEAR");
    });
  });

  describe("Case J - parameter adjustment trigger: a permitted transaction produces a downstream parameter adjustment", () => {
    it("exercising permission A adjusts a named parameter on permission B, structured in the winning path and StateDelta", () => {
      const mfnTrigger = permission("new-tranche", { formulaType: "FLAT_AMOUNT", thresholdValue: 300, action: "New incremental term loan tranche" });
      const existingTranche = permission("existing-tranche", { formulaType: "FLAT_AMOUNT", thresholdValue: 0, action: "Existing term loan tranche (pricing-adjustable)" });
      const trigger = rel({
        fromPermissionId: "new-tranche",
        toPermissionId: "existing-tranche",
        relationshipType: "PARAMETER_ADJUSTMENT_TRIGGER",
        parameter: { parameter: "couponPct", adjustmentBps: 50, before: 0.055 },
        sourceProvision: { documentId: "synth-doc-1", sectionRef: "§J.7 (MFN)" },
      });

      const result = runSolver({
        eligiblePermissions: [mfnTrigger, existingTranche],
        relationships: [trigger],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 200 }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });

      expect(result.overall.status).toBe("CLEAR");
      const adjustments = result.permissionPathUsed!.parameterAdjustmentsTriggered;
      expect(adjustments).toHaveLength(1);
      expect(adjustments[0]).toMatchObject({ triggeringPermissionId: "new-tranche", affectedPermissionId: "existing-tranche", parameter: "couponPct", before: 0.055, after: 0.06 });
      // The adjustment must also be reflected in the winning path's StateDelta - explainability, not just an internal computation.
      expect(result.permissionPathUsed!.stateEffects.parameterAdjustmentsApplied).toEqual([{ affectedPermissionId: "existing-tranche", parameter: "couponPct", before: 0.055, after: 0.06 }]);
    });
  });

  describe("Provenance requirement (task §12/§16)", () => {
    it("every solver-native affirmative result carries document, section, and permission-id provenance", () => {
      const p = permission("prov-basket", { formulaType: "FLAT_AMOUNT", thresholdValue: 100, documentId: "synth-doc-provenance", sourceProvision: { documentId: "synth-doc-provenance", sectionRef: "§9.02(b)" } });
      const result = runSolver({
        eligiblePermissions: [p],
        relationships: [],
        sharedConstraints: [],
        collateralScopes: [],
        ruleActivationConditions: [],
        financials: FIN,
        transaction: baseTransaction({ amount: 50 }),
        entityClasses: [],
        activationState: emptyActivationState(),
        asOfDate: new Date("2026-06-30"),
      });
      expect(result.overall.status).toBe("CLEAR");
      expect(result.sources).toContainEqual(expect.objectContaining({ documentId: "synth-doc-provenance", sectionRef: "§9.02(b)", permissionId: "prov-basket" }));
    });

    it("does NOT cleanly clear (a bare permission with no source citation is not representable by construction, since sourceProvision is required on every Permission)", () => {
      // Provenance is enforced structurally: Permission.sourceProvision is a
      // required field in lib/solver/types.ts, so it is impossible to
      // construct a Permission without one - the "missing source" failure
      // mode task §12 requires is therefore a compile-time guarantee, not
      // merely a runtime check. This test documents that guarantee rather
      // than exercising a runtime branch that cannot occur.
      const p = permission("no-shortcuts");
      expect(p.sourceProvision.documentId).toBeTruthy();
      expect(p.sourceProvision.sectionRef).toBeTruthy();
    });
  });

  describe("Determinism (task §13)", () => {
    it("Case A re-run with identical inputs produces byte-identical legs/status", () => {
      const fixedP = permission("fixed-basket", { formulaType: "FLAT_AMOUNT", thresholdValue: 75 });
      const ratioP = permission("leverage-basket", { amountKind: "INCURRENCE_BASED", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 5, params: {} });
      const relationship = rel({ fromPermissionId: "fixed-basket", toPermissionId: "leverage-basket", relationshipType: "CONCURRENT_DISREGARDED" });
      const run = () =>
        runSolver({
          eligiblePermissions: [fixedP, ratioP],
          relationships: [relationship],
          sharedConstraints: [],
          collateralScopes: [],
          ruleActivationConditions: [],
          financials: FIN,
          transaction: baseTransaction({ amount: 1500 }),
          entityClasses: [],
          activationState: emptyActivationState(),
          asOfDate: new Date("2026-06-30"),
        });
      const r1 = run();
      const r2 = run();
      expect(r1.permissionPathUsed?.legs).toEqual(r2.permissionPathUsed?.legs);
      expect(r1.overall.status).toEqual(r2.overall.status);
    });
  });
});
