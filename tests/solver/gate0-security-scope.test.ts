/**
 * Gate-0 eligibility fix regression suite - proves the new, generalized
 * `TRANSACTION_SECURITY_SCOPE` eligibility-condition kind (lib/solver/types.ts,
 * lib/solver/election.ts) mechanically enforces a permission's declared
 * secured/unsecured-or-junior restriction, and that
 * `computeMaximumCapacityFromEvaluations` (lib/solver/service.ts) correctly
 * excludes a FAILED election from the winning maximum-capacity computation as
 * a result - with zero branching on permission code or company anywhere in
 * lib/solver/**. See docs/founder-legal-review-2026-08-25.md §3 and
 * docs/legal-review-status-model.md §10 for the real-world defect this
 * generalizes a fix for (Coherent permission
 * coh-ca-d-incr-ratiobased-unsecjr).
 */
import { describe, expect, it } from "vitest";
import { evaluatePermissionEligibility, type EligibilityContext } from "../../lib/solver/election";
import { runSolver } from "../../lib/solver/service";
import type { ActivationState, Permission, PermissionCollateralScope, Transaction } from "../../lib/solver/types";

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

const UNSECURED_OR_JUNIOR_CONDITION = {
  id: "cond-unsec-or-jr",
  description: "Available only for debt that is unsecured or junior-secured",
  kind: "TRANSACTION_SECURITY_SCOPE" as const,
  allowedSecurity: "UNSECURED_OR_JUNIOR" as const,
  sourceProvision: { documentId: "doc-1", sectionRef: "§X" },
};

const UNSECURED_ONLY_CONDITION = {
  id: "cond-unsec-only",
  description: "Available only for unsecured debt",
  kind: "TRANSACTION_SECURITY_SCOPE" as const,
  allowedSecurity: "UNSECURED_ONLY" as const,
  sourceProvision: { documentId: "doc-1", sectionRef: "§Y" },
};

function eligibilityContext(transaction: Transaction): EligibilityContext {
  return {
    transaction,
    entityClasses: [],
    ruleActivationConditions: [],
    activationState,
    asOfDate: new Date("2026-06-30"),
  };
}

describe("Gate 0 - TRANSACTION_SECURITY_SCOPE eligibility condition (lib/solver/election.ts)", () => {
  describe("evaluatePermissionEligibility - direct unit coverage", () => {
    it("UNSECURED_OR_JUNIOR: SATISFIED for an unsecured transaction", () => {
      const p = permission("a", { eligibilityConditions: [UNSECURED_OR_JUNIOR_CONDITION] });
      const results = evaluatePermissionEligibility(p, eligibilityContext(baseTransaction({ secured: false })));
      const r = results.find((x) => x.detail === UNSECURED_OR_JUNIOR_CONDITION.description);
      expect(r?.status).toBe("SATISFIED");
    });

    it("UNSECURED_OR_JUNIOR: FAILED for a secured transaction with an uncharacterized (empty) requestedLienPriority - fails closed, never assumed eligible", () => {
      const p = permission("a", { eligibilityConditions: [UNSECURED_OR_JUNIOR_CONDITION] });
      const results = evaluatePermissionEligibility(p, eligibilityContext(baseTransaction({ secured: true, requestedLienPriority: [] })));
      const r = results.find((x) => x.detail === UNSECURED_OR_JUNIOR_CONDITION.description);
      expect(r?.status).toBe("FAILED");
    });

    it("UNSECURED_OR_JUNIOR: FAILED for a secured transaction requesting FIRST-lien priority", () => {
      const p = permission("a", { eligibilityConditions: [UNSECURED_OR_JUNIOR_CONDITION] });
      const results = evaluatePermissionEligibility(
        p,
        eligibilityContext(baseTransaction({ secured: true, requestedLienPriority: [{ poolId: "pool-1", priorityTier: "FIRST" }] }))
      );
      const r = results.find((x) => x.detail === UNSECURED_OR_JUNIOR_CONDITION.description);
      expect(r?.status).toBe("FAILED");
    });

    it("UNSECURED_OR_JUNIOR: FAILED for a secured transaction requesting PARI_PASSU priority", () => {
      const p = permission("a", { eligibilityConditions: [UNSECURED_OR_JUNIOR_CONDITION] });
      const results = evaluatePermissionEligibility(
        p,
        eligibilityContext(baseTransaction({ secured: true, requestedLienPriority: [{ poolId: "pool-1", priorityTier: "PARI_PASSU" }] }))
      );
      const r = results.find((x) => x.detail === UNSECURED_OR_JUNIOR_CONDITION.description);
      expect(r?.status).toBe("FAILED");
    });

    it("UNSECURED_OR_JUNIOR: SATISFIED for a secured transaction where every requested priority is confirmed SECOND (junior)", () => {
      const p = permission("a", { eligibilityConditions: [UNSECURED_OR_JUNIOR_CONDITION] });
      const results = evaluatePermissionEligibility(
        p,
        eligibilityContext(baseTransaction({ secured: true, requestedLienPriority: [{ poolId: "pool-1", priorityTier: "SECOND" }] }))
      );
      const r = results.find((x) => x.detail === UNSECURED_OR_JUNIOR_CONDITION.description);
      expect(r?.status).toBe("SATISFIED");
    });

    it("UNSECURED_OR_JUNIOR: FAILED if ANY requested pool is FIRST/PARI_PASSU, even if others are SECOND", () => {
      const p = permission("a", { eligibilityConditions: [UNSECURED_OR_JUNIOR_CONDITION] });
      const results = evaluatePermissionEligibility(
        p,
        eligibilityContext(
          baseTransaction({
            secured: true,
            requestedLienPriority: [
              { poolId: "pool-1", priorityTier: "SECOND" },
              { poolId: "pool-2", priorityTier: "FIRST" },
            ],
          })
        )
      );
      const r = results.find((x) => x.detail === UNSECURED_OR_JUNIOR_CONDITION.description);
      expect(r?.status).toBe("FAILED");
    });

    it("UNSECURED_ONLY: SATISFIED only when unsecured, FAILED even for a junior-secured request", () => {
      const p = permission("a", { eligibilityConditions: [UNSECURED_ONLY_CONDITION] });
      const unsecured = evaluatePermissionEligibility(p, eligibilityContext(baseTransaction({ secured: false })));
      expect(unsecured.find((x) => x.detail === UNSECURED_ONLY_CONDITION.description)?.status).toBe("SATISFIED");

      const juniorSecured = evaluatePermissionEligibility(
        p,
        eligibilityContext(baseTransaction({ secured: true, requestedLienPriority: [{ poolId: "pool-1", priorityTier: "SECOND" }] }))
      );
      expect(juniorSecured.find((x) => x.detail === UNSECURED_ONLY_CONDITION.description)?.status).toBe("FAILED");
    });

    it("never produces UNKNOWN for TRANSACTION_SECURITY_SCOPE - always a deterministic SATISFIED/FAILED", () => {
      const p = permission("a", { eligibilityConditions: [UNSECURED_OR_JUNIOR_CONDITION] });
      for (const txn of [
        baseTransaction({ secured: false }),
        baseTransaction({ secured: true, requestedLienPriority: [] }),
        baseTransaction({ secured: true, requestedLienPriority: [{ poolId: "pool-1", priorityTier: "FIRST" }] }),
        baseTransaction({ secured: true, requestedLienPriority: [{ poolId: "pool-1", priorityTier: "SECOND" }] }),
      ]) {
        const results = evaluatePermissionEligibility(p, eligibilityContext(txn));
        const r = results.find((x) => x.detail === UNSECURED_OR_JUNIOR_CONDITION.description);
        expect(r?.status).not.toBe("UNKNOWN");
        expect(["SATISFIED", "FAILED"]).toContain(r?.status);
      }
    });
  });

  describe("computeMaximumCapacityFromEvaluations (via runSolver) - end-to-end exclusion from maximum capacity", () => {
    // p-restricted has a larger standalone capacity (500) than p-baseline
    // (200), but carries the unsecured-or-junior restriction. p-baseline has
    // no restriction at all - mirroring the real Coherent fixture where
    // OTHER permissions (ca_incremental_cash_capped, ca_general_debt_601k)
    // have no such restriction and are unaffected by this fix.
    const restricted = permission("p-restricted", { formulaType: "FLAT_AMOUNT", thresholdValue: 500, eligibilityConditions: [UNSECURED_OR_JUNIOR_CONDITION] });
    const baseline = permission("p-baseline", { formulaType: "FLAT_AMOUNT", thresholdValue: 200, eligibilityConditions: [] });

    function solveFor(transaction: Transaction, collateralScopes: PermissionCollateralScope[] = []) {
      return runSolver({
        eligiblePermissions: [restricted, baseline],
        relationships: [],
        sharedConstraints: [],
        collateralScopes,
        ruleActivationConditions: [],
        financials: FIN,
        transaction,
        entityClasses: [],
        activationState,
        asOfDate: new Date("2026-06-30"),
      });
    }

    it("an ineligible FIRST-lien/secured transaction excludes the restricted permission's election - the baseline (200) wins, not the restricted permission's larger (500) capacity", () => {
      const result = solveFor(baseTransaction({ amount: 100, secured: true, requestedLienPriority: [] }));
      expect(result.overall.maximumCapacity?.kind).toBe("EXACT");
      if (result.overall.maximumCapacity?.kind === "EXACT") {
        expect(result.overall.maximumCapacity.amount).toBe(200);
        expect(result.overall.maximumCapacity.path.legs.map((l) => l.permissionId)).toEqual(["p-baseline"]);
      }
    });

    it("an eligible unsecured transaction includes the restricted permission - it can be the winning (larger, 500) election", () => {
      const result = solveFor(baseTransaction({ amount: 100, secured: false }));
      expect(result.overall.maximumCapacity?.kind).toBe("EXACT");
      if (result.overall.maximumCapacity?.kind === "EXACT") {
        expect(result.overall.maximumCapacity.amount).toBe(500);
        expect(result.overall.maximumCapacity.path.legs.map((l) => l.permissionId)).toEqual(["p-restricted"]);
      }
    });

    it("an eligible junior-secured (all-SECOND-tier) transaction includes the restricted permission - proving the mechanism supports this distinction even though no live caller populates requestedLienPriority today", () => {
      // A matching PermissionCollateralScope is supplied for p-restricted so
      // that the UNRELATED, generic PRIORITY_CONDITION check
      // (lib/solver/election.ts's "for (const requested of ...
      // requestedLienPriority)" loop) is satisfied too - this test isolates
      // the TRANSACTION_SECURITY_SCOPE mechanism specifically, not the
      // separate collateral-pool-priority machinery.
      const collateralScopes: PermissionCollateralScope[] = [{ permissionId: "p-restricted", collateralPoolId: "pool-1", priorityTier: "SECOND" }];
      const result = solveFor(baseTransaction({ amount: 100, secured: true, requestedLienPriority: [{ poolId: "pool-1", priorityTier: "SECOND" }] }), collateralScopes);
      expect(result.overall.maximumCapacity?.kind).toBe("EXACT");
      if (result.overall.maximumCapacity?.kind === "EXACT") {
        expect(result.overall.maximumCapacity.amount).toBe(500);
        expect(result.overall.maximumCapacity.path.legs.map((l) => l.permissionId)).toEqual(["p-restricted"]);
      }
    });
  });
});
