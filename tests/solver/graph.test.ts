import { describe, expect, it } from "vitest";
import {
  activationConditionsFor,
  automaticallyLinkedPermissions,
  buildPermissionGraph,
  evaluateStatePredicate,
  groupPeers,
  parameterAdjustmentTriggersFrom,
  relationshipTypeBetween,
  resolveApplicability,
  resolveParameterValue,
} from "../../lib/solver/graph";
import type { ActivationState, Permission, PermissionRelationship, RuleActivationCondition, StatePredicate } from "../../lib/solver/types";

function permission(id: string, overrides: Partial<Permission> = {}): Permission {
  return {
    id,
    documentId: "doc-1",
    companyId: "co-1",
    grantType: "DEBT_INCURRENCE",
    amountKind: "FIXED",
    action: "incur debt",
    entityScope: [],
    formulaType: "FLAT_AMOUNT",
    thresholdValue: 100,
    eligibilityConditions: [],
    termConditions: [],
    measurementBasis: "CUMULATIVE_INCURRED",
    sourceProvision: { documentId: "doc-1", sectionRef: "§1" },
    modelingStatus: "MODELED",
    ...overrides,
  };
}

function rel(overrides: Partial<PermissionRelationship>): PermissionRelationship {
  return {
    id: overrides.id ?? "rel-1",
    companyId: "co-1",
    fromPermissionId: "a",
    toPermissionId: "b",
    relationshipType: "ALTERNATIVE",
    sourceProvision: { documentId: "doc-1", sectionRef: "§2" },
    ...overrides,
  };
}

const emptyState: ActivationState = { asOfDate: new Date(), series: {}, events: [], usageCounts: {}, unknownKeys: new Set() };

describe("Phase 4 - permission graph (lib/solver/graph.ts)", () => {
  describe("relationship lookup - fail-closed on the unestablished case", () => {
    it("returns undefined (never a default) when no relationship row exists between two permissions", () => {
      const graph = buildPermissionGraph([permission("a"), permission("b")], []);
      expect(relationshipTypeBetween(graph, "a", "b")).toBeUndefined();
    });

    it("finds a relationship regardless of which side is queried first", () => {
      const graph = buildPermissionGraph([permission("a"), permission("b")], [rel({ relationshipType: "CONCURRENT_DISREGARDED" })]);
      expect(relationshipTypeBetween(graph, "a", "b")).toBe("CONCURRENT_DISREGARDED");
      expect(relationshipTypeBetween(graph, "b", "a")).toBe("CONCURRENT_DISREGARDED");
    });

    it("throws on conflicting relationship rows between the same pair rather than silently picking one", () => {
      const graph = buildPermissionGraph(
        [permission("a"), permission("b")],
        [rel({ id: "r1", relationshipType: "CONCURRENT_DISREGARDED" }), rel({ id: "r2", relationshipType: "MUTUALLY_EXCLUSIVE" })]
      );
      expect(() => relationshipTypeBetween(graph, "a", "b")).toThrow(/conflicting relationship types/);
    });

    it("throws if a relationship references a permission id not in the supplied set (referential integrity)", () => {
      expect(() => buildPermissionGraph([permission("a")], [rel({ fromPermissionId: "a", toPermissionId: "ghost" })])).toThrow();
    });
  });

  describe("ALTERNATIVE / MUTUALLY_EXCLUSIVE groups", () => {
    it("groups >2-way alternatives via a shared groupKey", () => {
      const graph = buildPermissionGraph(
        [permission("a"), permission("b"), permission("c")],
        [
          rel({ id: "r1", fromPermissionId: "a", toPermissionId: "b", relationshipType: "ALTERNATIVE", groupKey: "g1" }),
          rel({ id: "r2", fromPermissionId: "b", toPermissionId: "c", relationshipType: "ALTERNATIVE", groupKey: "g1" }),
        ]
      );
      expect(groupPeers(graph, "a", "ALTERNATIVE")).toEqual(new Set(["b", "c"]));
      expect(groupPeers(graph, "c", "ALTERNATIVE")).toEqual(new Set(["a", "b"]));
    });

    it("does not conflate ALTERNATIVE peers with MUTUALLY_EXCLUSIVE peers", () => {
      const graph = buildPermissionGraph(
        [permission("a"), permission("b"), permission("c")],
        [rel({ id: "r1", fromPermissionId: "a", toPermissionId: "b", relationshipType: "ALTERNATIVE" }), rel({ id: "r2", fromPermissionId: "a", toPermissionId: "c", relationshipType: "MUTUALLY_EXCLUSIVE" })]
      );
      expect(groupPeers(graph, "a", "ALTERNATIVE")).toEqual(new Set(["b"]));
      expect(groupPeers(graph, "a", "MUTUALLY_EXCLUSIVE")).toEqual(new Set(["c"]));
    });
  });

  describe("AUTOMATIC_LINKED_PERMISSION / EQUAL_AND_RATABLE_PULLUP", () => {
    it("finds the lien leg automatically pulled in by an included debt leg", () => {
      const graph = buildPermissionGraph(
        [permission("debt"), permission("lien", { grantType: "LIEN" })],
        [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" })]
      );
      const linked = automaticallyLinkedPermissions(graph, "debt");
      expect(linked).toHaveLength(1);
      expect(linked[0]!.permissionId).toBe("lien");
    });

    it("does not traverse the reverse direction (linkage is directional: debt -> lien, not lien -> debt)", () => {
      const graph = buildPermissionGraph(
        [permission("debt"), permission("lien", { grantType: "LIEN" })],
        [rel({ fromPermissionId: "debt", toPermissionId: "lien", relationshipType: "AUTOMATIC_LINKED_PERMISSION" })]
      );
      expect(automaticallyLinkedPermissions(graph, "lien")).toHaveLength(0);
    });
  });

  describe("PARAMETER_ADJUSTMENT_TRIGGER", () => {
    it("finds MFN-style parameter-adjustment edges out of a permission", () => {
      const graph = buildPermissionGraph(
        [permission("a"), permission("b")],
        [rel({ fromPermissionId: "a", toPermissionId: "b", relationshipType: "PARAMETER_ADJUSTMENT_TRIGGER", parameter: { parameter: "couponPct", adjustmentBps: 50 } })]
      );
      const triggers = parameterAdjustmentTriggersFrom(graph, "a");
      expect(triggers).toHaveLength(1);
      expect(triggers[0]!.parameter).toEqual({ parameter: "couponPct", adjustmentBps: 50 });
    });
  });

  describe("evaluateStatePredicate - POINT_IN_TIME", () => {
    const predicate: StatePredicate = { kind: "POINT_IN_TIME", description: "rating >= BBB-", seriesKey: "rating", comparator: "gte", threshold: 3 };

    it("returns UNKNOWN when the series has no data as of the date", () => {
      expect(evaluateStatePredicate(predicate, emptyState, new Date("2026-01-01"))).toBe("UNKNOWN");
    });

    it("returns UNKNOWN when the series is explicitly marked unknown", () => {
      const state: ActivationState = { ...emptyState, series: { rating: [{ asOf: new Date("2026-01-01"), value: 4 }] }, unknownKeys: new Set(["rating"]) };
      expect(evaluateStatePredicate(predicate, state, new Date("2026-06-01"))).toBe("UNKNOWN");
    });

    it("compares against the latest entry at or before the as-of date", () => {
      const state: ActivationState = {
        ...emptyState,
        series: {
          rating: [
            { asOf: new Date("2026-01-01"), value: 2 },
            { asOf: new Date("2026-05-01"), value: 4 },
          ],
        },
      };
      expect(evaluateStatePredicate(predicate, state, new Date("2026-06-01"))).toBe(true);
      expect(evaluateStatePredicate(predicate, state, new Date("2026-02-01"))).toBe(false);
    });
  });

  describe("evaluateStatePredicate - CONTINUITY_WINDOW (hysteresis)", () => {
    const predicate: StatePredicate = {
      kind: "CONTINUITY_WINDOW",
      description: "liquidity >= $50M for 2 consecutive quarters",
      seriesKey: "liquidity",
      comparator: "gte",
      threshold: 50,
      minConsecutivePeriods: 2,
      periodUnit: "QUARTER",
    };

    function stateWith(values: number[]): ActivationState {
      return {
        ...emptyState,
        series: { liquidity: values.map((v, i) => ({ asOf: new Date(2026, i * 3, 1), value: v })) },
      };
    }

    it("N-1 periods of history: insufficient, returns UNKNOWN (not false)", () => {
      const state = stateWith([60]); // only 1 period, need 2
      expect(evaluateStatePredicate(predicate, state, new Date(2026, 3, 1))).toBe("UNKNOWN");
    });

    it("exactly N consecutive qualifying periods: true", () => {
      const state = stateWith([60, 55]);
      expect(evaluateStatePredicate(predicate, state, new Date(2026, 3, 1))).toBe(true);
    });

    it("N+1 periods but the window breaks: false", () => {
      const state = stateWith([60, 40, 55]); // most recent 2 = [55, 40] -> 40 fails
      expect(evaluateStatePredicate(predicate, state, new Date(2026, 6, 1))).toBe(false);
    });

    it("N+1 periods, all qualifying: true", () => {
      const state = stateWith([60, 55, 70]);
      expect(evaluateStatePredicate(predicate, state, new Date(2026, 6, 1))).toBe(true);
    });
  });

  describe("evaluateStatePredicate - EVENT_TRIGGERED", () => {
    const predicate: StatePredicate = { kind: "EVENT_TRIGGERED", description: "since discharge until reinstatement", sinceEvent: "DISCHARGE", until: "REINSTATEMENT" };

    it("false (confirmed, not unknown) before the triggering event has ever occurred", () => {
      expect(evaluateStatePredicate(predicate, emptyState, new Date("2026-01-01"))).toBe(false);
    });

    it("true after the triggering event and before any reversing event", () => {
      const state: ActivationState = { ...emptyState, events: [{ type: "DISCHARGE", asOf: new Date("2026-01-01") }] };
      expect(evaluateStatePredicate(predicate, state, new Date("2026-06-01"))).toBe(true);
    });

    it("false again after the reversing event", () => {
      const state: ActivationState = {
        ...emptyState,
        events: [
          { type: "DISCHARGE", asOf: new Date("2026-01-01") },
          { type: "REINSTATEMENT", asOf: new Date("2026-03-01") },
        ],
      };
      expect(evaluateStatePredicate(predicate, state, new Date("2026-06-01"))).toBe(false);
    });

    it("UNKNOWN when the event history is explicitly flagged unknown", () => {
      const state: ActivationState = { ...emptyState, unknownKeys: new Set(["event:DISCHARGE"]) };
      expect(evaluateStatePredicate(predicate, state, new Date("2026-06-01"))).toBe("UNKNOWN");
    });
  });

  describe("evaluateStatePredicate - USAGE_LIMITED (equity cure)", () => {
    const predicate: StatePredicate = { kind: "USAGE_LIMITED", description: "equity cure: 2 uses, 2 of 4 quarters spacing", usageKey: "equity_cure", maxUses: 2, minSpacingPeriods: 2, periodUnit: "QUARTER" };

    it("true (a use remains) with zero prior uses", () => {
      expect(evaluateStatePredicate(predicate, emptyState, new Date("2026-01-01"))).toBe(true);
    });

    it("false once maxUses is reached", () => {
      const state: ActivationState = { ...emptyState, usageCounts: { equity_cure: [{ asOf: new Date("2025-01-01") }, { asOf: new Date("2025-06-01") }] } };
      expect(evaluateStatePredicate(predicate, state, new Date("2026-01-01"))).toBe(false);
    });

    it("false when within the minimum spacing window of the last use, even under maxUses", () => {
      const state: ActivationState = { ...emptyState, usageCounts: { equity_cure: [{ asOf: new Date("2026-01-01") }] } };
      expect(evaluateStatePredicate(predicate, state, new Date(2026, 3, 1))).toBe(false); // ~1 quarter later, needs 2
    });

    it("true once past the minimum spacing window", () => {
      const state: ActivationState = { ...emptyState, usageCounts: { equity_cure: [{ asOf: new Date("2026-01-01") }] } };
      expect(evaluateStatePredicate(predicate, state, new Date(2026, 9, 1))).toBe(true); // ~3 quarters later
    });
  });

  describe("resolveApplicability - fail-closed composition", () => {
    const condition: RuleActivationCondition = {
      id: "cond-1",
      companyId: "co-1",
      appliesTo: { permissionId: "perm-1" },
      predicate: { kind: "POINT_IN_TIME", description: "rating suspension", seriesKey: "rating", comparator: "gte", threshold: 3 },
      effect: "APPLICABILITY",
      sourceProvision: { documentId: "doc-1", sectionRef: "§9" },
    };

    it("defaults to active (true) when no activation condition applies at all", () => {
      const result = resolveApplicability([], "perm-1", [], emptyState, new Date());
      expect(result.active).toBe(true);
    });

    it("is UNKNOWN, never silently active or inactive, when the predicate cannot be resolved", () => {
      const result = resolveApplicability([condition], "perm-1", [], emptyState, new Date());
      expect(result.active).toBe("UNKNOWN");
      expect(result.evaluated).toEqual([{ conditionId: "cond-1", result: "UNKNOWN" }]);
    });

    it("resolves true/false once the predicate has data", () => {
      const state: ActivationState = { ...emptyState, series: { rating: [{ asOf: new Date("2026-01-01"), value: 4 }] } };
      expect(resolveApplicability([condition], "perm-1", [], state, new Date("2026-06-01")).active).toBe(true);
    });

    it("finds conditions applying via covenantSectionIds or companyWide, not only a direct permissionId match", () => {
      const sectionCondition: RuleActivationCondition = { ...condition, id: "cond-2", appliesTo: { covenantSectionIds: ["§9"] } };
      const companyWide: RuleActivationCondition = { ...condition, id: "cond-3", appliesTo: { companyWide: true } };
      expect(activationConditionsFor([sectionCondition], "perm-1", ["§9"])).toHaveLength(1);
      expect(activationConditionsFor([sectionCondition], "perm-1", ["§other"])).toHaveLength(0);
      expect(activationConditionsFor([companyWide], "any-perm", [])).toHaveLength(1);
    });
  });

  describe("resolveParameterValue - step-up table", () => {
    const condition: RuleActivationCondition = {
      id: "cond-step",
      companyId: "co-1",
      appliesTo: { companyWide: true },
      predicate: { kind: "POINT_IN_TIME", description: "n/a for this test", seriesKey: "leverage", comparator: "gte", threshold: 0 },
      effect: "PARAMETER_VALUE",
      parameterResolution: { seriesKey: "leverage", steps: [{ thresholdAtLeast: 5, value: 3.5 }, { thresholdAtLeast: 4, value: 4.0 }], belowAllStepsValue: 4.5 },
      sourceProvision: { documentId: "doc-1", sectionRef: "§10" },
    };

    it("resolves the highest step whose threshold the current series value meets", () => {
      const state: ActivationState = { ...emptyState, series: { leverage: [{ asOf: new Date("2026-01-01"), value: 5.2 }] } };
      expect(resolveParameterValue(condition, state, new Date("2026-06-01"))).toEqual({ status: "RESOLVED", value: 3.5 });
    });

    it("falls back to belowAllStepsValue when below every step", () => {
      const state: ActivationState = { ...emptyState, series: { leverage: [{ asOf: new Date("2026-01-01"), value: 2.0 }] } };
      expect(resolveParameterValue(condition, state, new Date("2026-06-01"))).toEqual({ status: "RESOLVED", value: 4.5 });
    });

    it("is UNKNOWN when the series has no data", () => {
      expect(resolveParameterValue(condition, emptyState, new Date("2026-06-01"))).toEqual({ status: "UNKNOWN" });
    });
  });
});
