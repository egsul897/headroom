import { describe, expect, it } from "vitest";
import { aggregateOverallStatus, pathStatus, rejectedAlternatives, selectWinningPath } from "../../lib/solver/status";
import { computeCovenantPosition, type CompanyCovenantData } from "../../lib/covenant-engine";
import type { PermissionPath, RequirementResult } from "../../lib/solver/types";

function req(overrides: Partial<RequirementResult>): RequirementResult {
  return { class: "DEBT_PERMISSION", scope: {}, status: "SATISFIED", detail: "ok", ...overrides };
}

function path(id: string, results: RequirementResult[], amount = 0): PermissionPath {
  return {
    id,
    status: pathStatus(results),
    legs: amount ? [{ permissionId: "p", grantType: "DEBT_INCURRENCE", amountAllocated: amount, measurementBasis: "CUMULATIVE_INCURRED", historicalUsage: {}, sourceProvision: { documentId: "d", sectionRef: "s" } }] : [],
    linkedPermissions: [],
    conditionsTested: results,
    sharedConstraintsConsumed: [],
    assumptionsUsed: [],
    parameterAdjustmentsTriggered: [],
    sourceProvisions: [],
    stateEffects: { debtOutstandingDelta: [], cashDelta: 0, basketUsageDelta: [], sharedConstraintUsageDelta: [] },
  };
}

describe("Phase 5 - alternative-path status semantics (lib/solver/status.ts)", () => {
  describe("pathStatus - single-path aggregation", () => {
    it("CLEAR when every requirement is SATISFIED", () => {
      expect(pathStatus([req({ status: "SATISFIED" }), req({ status: "SATISFIED" })])).toBe("CLEAR");
    });
    it("BLOCKED when any requirement FAILED, even alongside UNKNOWNs", () => {
      expect(pathStatus([req({ status: "FAILED" }), req({ status: "UNKNOWN" })])).toBe("BLOCKED");
    });
    it("ASSUMPTION_REQUIRED when every UNKNOWN is a TRANSACTION_ASSUMPTION gap", () => {
      expect(pathStatus([req({ status: "SATISFIED" }), req({ class: "TRANSACTION_ASSUMPTION", status: "UNKNOWN" })])).toBe("ASSUMPTION_REQUIRED");
    });
    it("REVIEW_REQUIRED when at least one UNKNOWN is not an assumption gap", () => {
      expect(
        pathStatus([req({ class: "TRANSACTION_ASSUMPTION", status: "UNKNOWN" }), req({ class: "RATIO_CONDITION", status: "UNKNOWN", reasonCategory: "UNKNOWN_RELATIONSHIP" })])
      ).toBe("REVIEW_REQUIRED");
    });
    it("NOT_TESTED when there are no requirements at all", () => {
      expect(pathStatus([])).toBe("NOT_TESTED");
    });
    it("a reasonCategory of MISSING_ASSUMPTION is treated as an assumption gap even outside the TRANSACTION_ASSUMPTION class", () => {
      expect(pathStatus([req({ class: "RATIO_CONDITION", status: "UNKNOWN", reasonCategory: "MISSING_ASSUMPTION" })])).toBe("ASSUMPTION_REQUIRED");
    });
  });

  describe("aggregateOverallStatus - the exact precedence lattice from design doc §M.2", () => {
    it("CLEAR dominates everything else, including a BLOCKED sibling", () => {
      expect(aggregateOverallStatus(["CLEAR", "BLOCKED", "REVIEW_REQUIRED"])).toBe("CLEAR");
    });
    it("BLOCKED requires unanimous failure - a single non-BLOCKED path prevents it", () => {
      expect(aggregateOverallStatus(["BLOCKED", "BLOCKED"])).toBe("BLOCKED");
      expect(aggregateOverallStatus(["BLOCKED", "REVIEW_REQUIRED"])).not.toBe("BLOCKED");
    });
    it("ASSUMPTION_REQUIRED wins over REVIEW_REQUIRED/BLOCKED when present and nothing is CLEAR", () => {
      expect(aggregateOverallStatus(["ASSUMPTION_REQUIRED", "BLOCKED"])).toBe("ASSUMPTION_REQUIRED");
      expect(aggregateOverallStatus(["ASSUMPTION_REQUIRED", "REVIEW_REQUIRED"])).toBe("ASSUMPTION_REQUIRED");
    });
    it("REVIEW_REQUIRED is the fallback below CLEAR/BLOCKED-unanimous/ASSUMPTION_REQUIRED", () => {
      expect(aggregateOverallStatus(["REVIEW_REQUIRED", "BLOCKED"])).toBe("REVIEW_REQUIRED");
    });
    it("NOT_TESTED only when the Requirement Group is empty", () => {
      expect(aggregateOverallStatus([])).toBe("NOT_TESTED");
    });
  });

  describe("Regression: the legacy MAX-as-OR bug must not reproduce in the solver-native path", () => {
    // legal-model-remediation-design.md §2.2 / design doc §M.2 point 1: the
    // LEGACY engine's `MAX` node applies `worstStatus` ACROSS alternatives
    // before taking the best value, so a `review_required` sibling poisons a
    // genuinely `modeled`/clear one. This test proves the solver-native
    // aggregation does NOT do that: a passing TNL alternative clears overall
    // even though a sibling FCCR alternative is unresolved (task §22's
    // "Alternative path with one missing assumption" adversarial case, and
    // task's own Phase 5 worked example - Case D in
    // tests/solver/fixtures/synthetic-solver-native.ts exercises this at the
    // full end-to-end level).
    it("a CLEAR alternative is not poisoned by a REVIEW_REQUIRED sibling", () => {
      const tnlPath = path("tnl", [req({ status: "SATISFIED" })], 100);
      const fccrPath = path("fccr", [req({ class: "TRANSACTION_ASSUMPTION", status: "UNKNOWN" })]);
      expect(tnlPath.status).toBe("CLEAR");
      expect(fccrPath.status).toBe("ASSUMPTION_REQUIRED");
      expect(aggregateOverallStatus([tnlPath.status, fccrPath.status])).toBe("CLEAR");
    });

    it("a CLEAR alternative is not poisoned by a BLOCKED sibling", () => {
      const tnlPath = path("tnl", [req({ status: "SATISFIED" })], 100);
      const otherPath = path("other", [req({ status: "FAILED" })]);
      expect(aggregateOverallStatus([tnlPath.status, otherPath.status])).toBe("CLEAR");
    });

    it("demonstrates the legacy engine's own worstStatus/MAX WOULD have poisoned this exact scenario, confirming the fix is a genuine behavior change for solver-native paths (not a no-op)", () => {
      // Reconstruct the identical scenario through the LEGACY composition
      // path (evalExpr's MAX node over two REF provisions, one modeled, one
      // review_required) to show the old bug is real and specifically what
      // the new solver-native operator (pathStatus/aggregateOverallStatus)
      // fixes - lib/covenant-engine.ts itself is not modified anywhere in
      // this suite.
      const data: CompanyCovenantData = {
        companyId: "legacy-bug-demo",
        documents: [
          {
            id: "doc-1",
            name: "Demo Document",
            type: "OTHER",
            capacityFormulas: {
              secured: {
                op: "MAX",
                items: [
                  { op: "REF", code: "tnl_alt" }, // modeled, clear
                  { op: "REF", code: "fccr_alt" }, // review_required (missing rate)
                ],
              },
            },
          },
        ],
        provisions: [
          { id: "p1", documentId: "doc-1", code: "tnl_alt", basketName: "TNL alt", sectionRef: "§1", formulaType: "LEVERAGE_RATIO_ROOM", thresholdValue: 5, params: {} },
          { id: "p2", documentId: "doc-1", code: "fccr_alt", basketName: "FCCR alt", sectionRef: "§2", formulaType: "COVERAGE_RATIO_ROOM", thresholdValue: 2 },
        ],
        financials: {
          ebitda: 500,
          cash: 50,
          interestExpense: 40,
          cumulativeNetIncome: 0,
          equityProceedsSinceIssue: 0,
          assumedNewDebtRatePct: 0, // deliberately unset -> COVERAGE_RATIO_ROOM is review_required
          totalDebt: 800,
          securedDebt: 400,
        },
        ledger: [],
      };
      const position = computeCovenantPosition(data);
      // This IS the bug: the legacy MAX node's overall status is
      // review_required, not modeled, even though the TNL alternative alone
      // is fully modeled and would clear.
      expect(position.documents[0]!.securedStatus).toBe("review_required");
      expect(position.provisionCapacities.get("doc-1:tnl_alt")?.status).toBe("modeled");
    });
  });

  describe("selectWinningPath - deterministic tie-break", () => {
    it("prefers the CLEAR path with the largest total allocated amount", () => {
      const small = path("small", [req({ status: "SATISFIED" })], 50);
      const large = path("large", [req({ status: "SATISFIED" })], 200);
      expect(selectWinningPath([small, large])?.id).toBe("large");
    });

    it("breaks ties on amount by lexicographically smallest id, deterministically", () => {
      const a = path("a-path", [req({ status: "SATISFIED" })], 100);
      const b = path("b-path", [req({ status: "SATISFIED" })], 100);
      expect(selectWinningPath([b, a])?.id).toBe("a-path");
      // Re-running with the same inputs (order-independent) always yields the same winner.
      expect(selectWinningPath([a, b])?.id).toBe("a-path");
    });

    it("returns undefined when no path is CLEAR", () => {
      const blocked = path("blocked", [req({ status: "FAILED" })]);
      expect(selectWinningPath([blocked])).toBeUndefined();
    });
  });

  describe("rejectedAlternatives - explainability", () => {
    it("names every non-winning path with a reason derived from its own status, never silently dropped", () => {
      const winner = path("winner", [req({ status: "SATISFIED" })], 100);
      const blocked = path("blocked", [req({ status: "FAILED", detail: "leverage too high" })]);
      const reviewReq = path("review", [req({ class: "RATIO_CONDITION", status: "UNKNOWN", reasonCategory: "UNKNOWN_RELATIONSHIP", detail: "unresolved relationship" })]);
      const alts = rejectedAlternatives([winner, blocked, reviewReq], winner);
      expect(alts).toHaveLength(2);
      expect(alts.find((a) => a.path.id === "blocked")?.rejectionReason).toContain("leverage too high");
      expect(alts.find((a) => a.path.id === "review")?.rejectionReason).toContain("unresolved relationship");
    });
  });
});
