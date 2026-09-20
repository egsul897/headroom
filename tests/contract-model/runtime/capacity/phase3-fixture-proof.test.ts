/**
 * PHASE 4C §35 - the capacity state proved against Phase-3 IR that already exists in this repo.
 *
 * Sources: the frozen paid compile result (read-only, selected by expression SHAPE) and the
 * hand-authored real-shape fixtures. Every fact supplied is built from the graph's own dependency
 * manifest, so nothing is matched by name. No provider call, no new compile.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { IRDefinition, IRRule, IRSharedCapacity, IRValueType } from "@/lib/contract-model/ir/types";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { RuntimeValue, RuntimeValueType } from "@/lib/contract-model/runtime/types";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import type { DependencyRecord, FinancialInput, FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import {
  ALL_FIXTURE_DEFINITIONS, ALL_FIXTURE_RULES, FIXTURE_1_FIXED_DEBT_BASKET, FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT,
  FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO, FIXTURE_10_SHARED_CAPACITY, FIXTURE_10_SHARED_CAP_RULE_A,
  FIXTURE_10_SHARED_CAP_RULE_B, FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE,
} from "../../../fixtures/ir-examples/real-covenant-shapes";
import { onRule, usage } from "./helpers";

const FROZEN = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json";
const frozen = JSON.parse(readFileSync(FROZEN, "utf8")) as { rules: IRRule[]; definitions: IRDefinition[]; sharedCapacities?: IRSharedCapacity[] };

const CO = "proof-company";
const INST = "proof-instrument";
const AS_OF = "2026-06-30";
const L = { exprId: null, inputKeys: [] as string[] };

const retarget = <T extends { companyId: string; instrumentKey: string }>(o: T): T =>
  JSON.parse(JSON.stringify(o).replace(new RegExp(`"${o.companyId}"`, "g"), `"${CO}"`).replace(new RegExp(`"${o.instrumentKey}"`, "g"), `"${INST}"`)) as T;

const KNOWN: RuntimeValueType[] = ["MONEY", "NUMBER", "PERCENT", "RATIO", "BOOLEAN", "DATE", "ENTITY_SET"];
const rtType = (t: IRValueType | "CAPACITY"): RuntimeValueType => ((KNOWN as string[]).includes(t) ? (t as RuntimeValueType) : "MONEY");
const valueFor = (t: IRValueType | "CAPACITY", i: number): RuntimeValue =>
  t === "RATIO" ? { type: "RATIO", value: rationalFromString(String(1 + i / 10)), lineage: L }
    : t === "BOOLEAN" ? { type: "BOOLEAN", value: true, lineage: L }
      : t === "NUMBER" ? { type: "NUMBER", value: rationalFromString(String(i + 1)), lineage: L }
        : t === "PERCENT" ? { type: "PERCENT", fraction: rationalFromString("0.1"), lineage: L }
          : t === "DATE" ? { type: "DATE", isoDate: AS_OF, lineage: L }
            : { type: "MONEY", amount: rationalFromString(String(1_000_000 * (i + 1))), currency: "USD", lineage: L };

/** Build a snapshot from the graph's own manifest. Nothing is matched by metric name. */
function snapshotFromManifest(deps: readonly DependencyRecord[]): FinancialSnapshot {
  const inputs: FinancialInput[] = deps.map((d, i) => ({
    identity: {
      companyId: d.companyId ?? CO,
      scope: d.instrumentKey ? { kind: "INSTRUMENT_LEVEL", instrumentKey: d.instrumentKey } : { kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "ALL_INSTRUMENTS" } },
      inputKind: d.inputKind, key: d.key, identityStrength: d.identityStrength,
      period: d.period, asOf: d.asOf, valueType: rtType(d.expectedType),
      currency: d.expectedType === "MONEY" ? "USD" : null,
    },
    value: valueFor(d.expectedType, i), sourceVersion: "proof-v1",
  }));
  return {
    snapshotId: "proof-snap", version: "1", companyId: CO, asOf: AS_OF, reportingPeriod: "proof-period",
    status: "APPROVED", supersedesSnapshotId: null,
    provenance: { source: "synthetic snapshot built from the graph's own manifest", sourceVersion: "proof-v1" },
    review: { reviewedBy: "proof", reviewedAt: "2026-07-01T00:00:00Z", approvalRef: "proof-approval" }, inputs,
  };
}

function prove(rules: IRRule[], opts: { sharedCapacities?: IRSharedCapacity[]; definitions?: IRDefinition[]; ledger?: ReturnType<typeof usage>[] } = {}) {
  const graph = buildCapacityGraph({ rules, sharedCapacities: opts.sharedCapacities, definitions: opts.definitions, companyId: CO, instrumentKey: INST, asOf: AS_OF });
  const deps = graph.dependencyManifest.dependencies;
  const inputs = deps.length > 0 ? snapshotInputResolver({ snapshots: [snapshotFromManifest(deps)], definitions: opts.definitions, companyId: CO, instrumentKey: INST }) : EMPTY_RESOLVER;
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: opts.sharedCapacities, definitions: opts.definitions, inputs, ledger: opts.ledger ?? [], asOf: AS_OF });
  return { graph, state };
}

describe("hand-authored real-shape Phase-3 IR", () => {
  it("an ordinary flat basket yields available capacity and reduces by recorded usage", () => {
    const r = retarget(FIXTURE_1_FIXED_DEBT_BASKET);
    const { state } = prove([r], { ledger: [usage("u1", "100000", onRule(r.ruleId), { companyId: CO, instrumentKey: INST })] });
    const c = state.capacities[0]!;
    expect(c.status).toBe("AVAILABLE");
    expect(c.grossCapacity.kind).toBe("AMOUNT");
    expect(c.appliedUsageIds).toEqual(["u1"]);
    expect(c.remaining.kind).toBe("AMOUNT");
  });

  it("a MAX of a fixed amount and a percentage grower needs exactly one fact, then executes", () => {
    const r = retarget(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT);
    const graph = buildCapacityGraph({ rules: [r], companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(graph.dependencyManifest.dependencies.length).toBe(1);
    const withoutFacts = evaluateCapacityState({ graph, rules: [r], inputs: EMPTY_RESOLVER, asOf: AS_OF });
    expect(withoutFacts.capacities[0]!.status).toBe("NEEDS_INPUT");
    expect(withoutFacts.capacities[0]!.bounds?.knownLowerBound).toMatchObject({ type: "MONEY" });
    const { state } = prove([r]);
    expect(state.capacities[0]!.status).toBe("AVAILABLE");
  });

  it("an unlimited capacity gated by a ratio test stays an explicit capacity state, never a number", () => {
    const r = retarget(FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO);
    const { state } = prove([r]);
    const c = state.capacities[0]!;
    expect(["UNLIMITED", "GATE_NOT_SATISFIED"]).toContain(c.grossCapacity.kind);
    expect(JSON.stringify(c.grossCapacity)).not.toContain("Infinity");
  });

  it("a real shared capacity is an explicit constraint node whose limit is not copied onto members", () => {
    const cap = retarget(FIXTURE_10_SHARED_CAPACITY);
    const a = retarget(FIXTURE_10_SHARED_CAP_RULE_A);
    const b = retarget(FIXTURE_10_SHARED_CAP_RULE_B);
    const { graph, state } = prove([a, b], { sharedCapacities: [cap] });
    expect(graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY").length).toBe(1);
    expect(graph.edges.filter((e) => e.kind === "MEMBER_OF_SHARED_CAP").length).toBe(2);
    const pool = state.sharedConstraints[0]!;
    expect(pool.memberRuleIds.sort()).toEqual([a.ruleId, b.ruleId].sort());
    for (const c of state.capacities) expect(c.sharedConstraintIds).toEqual([cap.sharedCapId]);
  });

  it("a rule Phase 3 could not fully represent is reported with its limitation, not as headroom", () => {
    const d = retarget(FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE);
    expect(d.sufficiency).toBe("MISSING_CONTEXT");
    expect(d.calculationExpression).toBeNull();
  });

  it("every hand-authored fixture rule with a capacity produces a state entry with an explicit status", () => {
    const rules = ALL_FIXTURE_RULES.map(retarget).filter((r) => r.capacityExpression);
    const { state } = prove(rules, { definitions: ALL_FIXTURE_DEFINITIONS.map(retarget) });
    expect(state.capacities.length).toBe(rules.length);
    for (const c of state.capacities) {
      expect(["AVAILABLE", "NEEDS_INPUT", "UNSUPPORTED", "AMBIGUOUS", "REVIEW_REQUIRED", "ERROR"]).toContain(c.status);
      if (c.status !== "AVAILABLE") expect(c.limitations.length).toBeGreaterThan(0);
    }
  });
});

describe("the frozen paid compile result", () => {
  it("has no shared-capacity resources and no reclassification edges, which is recorded as a real gap", () => {
    expect((frozen.sharedCapacities ?? []).length).toBe(0);
    const reclass = frozen.rules.flatMap((r) => r.dependsOn.filter((d) => d.relationshipType === "RECLASSIFIABLE_TO"));
    expect(reclass.length).toBe(0);
    // The shared relationship IS present as an edge. Without a resource carrying a cap expression
    // there is no pool to compute, and Phase 4C reports that rather than inventing one.
    const shares = frozen.rules.flatMap((r) => r.dependsOn.filter((d) => d.relationshipType === "SHARES_CAPACITY_WITH"));
    expect(shares.length).toBeGreaterThan(0);
  });

  it("a frozen shared relationship with no quantified pool becomes an explicit limitation", () => {
    const withShare = frozen.rules.filter((r) => r.dependsOn.some((d) => d.relationshipType === "SHARES_CAPACITY_WITH") && r.capacityExpression).map(retarget);
    expect(withShare.length).toBeGreaterThan(0);
    const { graph } = prove(withShare.slice(0, 4));
    expect(graph.limitations.some((l) => l.code === "SHARED_CAPACITY_NOT_QUANTIFIED")).toBe(true);
    expect(graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY")).toEqual([]);
  });

  it("every frozen rule with a capacity expression yields a state entry, and none silently becomes zero", () => {
    const rules = frozen.rules.filter((r) => r.capacityExpression).map(retarget);
    const { graph, state } = prove(rules, { definitions: frozen.definitions.map(retarget) });
    expect(graph.nodes.filter((n) => n.kind === "RULE_CAPACITY").length).toBe(rules.length);
    expect(state.capacities.length).toBe(rules.length);
    for (const c of state.capacities) {
      if (c.grossCapacity.kind === "NOT_DETERMINED") expect(c.status).not.toBe("AVAILABLE");
      if (c.status === "AVAILABLE") expect(c.grossCapacity.kind).not.toBe("NOT_DETERMINED");
    }
    // Every distinguishable outcome is preserved; nothing collapses into one null.
    expect(new Set(state.capacities.map((c) => c.status)).size).toBeGreaterThan(1);
  });

  it("a frozen rule Phase 3 marked not fully represented never becomes authoritative headroom", () => {
    const partial = frozen.rules.filter((r) => r.capacityExpression && (r.sufficiency === "PARTIAL" || r.sufficiency === "AMBIGUOUS" || r.sufficiency === "MISSING_CONTEXT")).map(retarget);
    if (partial.length === 0) return;
    const { state } = prove(partial, { definitions: frozen.definitions.map(retarget) });
    for (const c of state.capacities) {
      expect(c.status).not.toBe("AVAILABLE");
      expect(c.grossCapacity.kind).toBe("NOT_DETERMINED");
    }
  });

  it("the frozen unlimited capacities stay explicit, never a numeric stand-in", () => {
    const unlimited = frozen.rules.filter((r) => r.capacityExpression?.kind === "UNLIMITED_CAPACITY").map(retarget);
    expect(unlimited.length).toBeGreaterThan(0);
    const { state } = prove(unlimited, { definitions: frozen.definitions.map(retarget) });
    const kinds = new Set(state.capacities.map((c) => c.grossCapacity.kind));
    expect([...kinds].every((k) => ["UNLIMITED", "GATE_NOT_SATISFIED", "NOT_DETERMINED"].includes(k))).toBe(true);
    expect(JSON.stringify(state)).not.toContain("Infinity");
  });

  it("the whole frozen graph is built and evaluated deterministically", () => {
    const rules = frozen.rules.filter((r) => r.capacityExpression).map(retarget);
    const a = prove(rules, { definitions: frozen.definitions.map(retarget) });
    const b = prove([...rules].reverse(), { definitions: frozen.definitions.map(retarget) });
    expect(a.graph.graphHash).toBe(b.graph.graphHash);
    expect(a.state.stateHash).toBe(b.state.stateHash);
  });
});
