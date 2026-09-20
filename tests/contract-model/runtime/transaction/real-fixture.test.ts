/**
 * PHASE 4D §39, §40, §41 - simulation over the Phase-3 IR that already exists in this repo.
 *
 * The frozen paid compile result is used where it actually supports the case. Where it does not -
 * it carries no quantified shared-capacity resource and no reclassification edge - that absence is
 * asserted and reported, never filled in with a fixture described as real evidence.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { IRDefinition, IRRule, IRSharedCapacity, IRValueType } from "@/lib/contract-model/ir/types";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { RuntimeValue, RuntimeValueType } from "@/lib/contract-model/runtime/types";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import type { DependencyRecord, FinancialInput, FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import { simulateTransaction } from "@/lib/contract-model/runtime/transaction";
import type { HypotheticalTransaction, SelectedPath } from "@/lib/contract-model/runtime/transaction/types";

const FROZEN = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json";
const frozen = JSON.parse(readFileSync(FROZEN, "utf8")) as { rules: IRRule[]; definitions: IRDefinition[]; sharedCapacities?: IRSharedCapacity[] };

const CO = "rf-company";
const INST = "rf-instrument";
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

/** A snapshot built from the graph's OWN dependency manifest: nothing is matched by metric name. */
function snapshotFromManifest(deps: readonly DependencyRecord[]): FinancialSnapshot {
  return {
    snapshotId: "rf-pack", version: "1", companyId: CO, asOf: AS_OF, reportingPeriod: "rf-period",
    status: "APPROVED", supersedesSnapshotId: null,
    provenance: { source: "synthetic snapshot built from the graph's own manifest", sourceVersion: "rf-1" },
    review: { reviewedBy: "rf", reviewedAt: "2026-07-01T00:00:00Z", approvalRef: "rf-approval" },
    inputs: deps.map((d, i): FinancialInput => ({
      identity: {
        companyId: d.companyId ?? CO,
        scope: d.instrumentKey ? { kind: "INSTRUMENT_LEVEL", instrumentKey: d.instrumentKey } : { kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "ALL_INSTRUMENTS" } },
        inputKind: d.inputKind, key: d.key, identityStrength: d.identityStrength,
        period: d.period, asOf: d.asOf, valueType: rtType(d.expectedType),
        currency: d.expectedType === "MONEY" ? "USD" : null,
      },
      value: valueFor(d.expectedType, i), sourceVersion: "rf-1",
    })),
  };
}

const rules = frozen.rules.filter((r) => r.capacityExpression).map(retarget);
const definitions = frozen.definitions.map(retarget);
const sharedCapacities = (frozen.sharedCapacities ?? []).map(retarget);
const graph = buildCapacityGraph({ rules, definitions, sharedCapacities, companyId: CO, instrumentKey: INST, asOf: AS_OF });
const inputs = snapshotInputResolver({ snapshots: [snapshotFromManifest(graph.dependencyManifest.dependencies)], definitions, rules, companyId: CO, instrumentKey: INST });
const state = evaluateCapacityState({ graph, rules, definitions, sharedCapacities, inputs, ledger: [], asOf: AS_OF });
const context = { rules, definitions, sharedCapacities, ledger: [], asOf: AS_OF };

const run = (transaction: HypotheticalTransaction, selectedPath: SelectedPath) =>
  simulateTransaction({ transaction, currentState: state, capacityGraph: graph, selectedPath, inputs, context });

const tx = (transactionId: string, effects: HypotheticalTransaction["effects"]): HypotheticalTransaction =>
  ({ transactionId, companyId: CO, instrumentKey: INST, effectiveAsOf: AS_OF, category: null, label: null, effects, provenance: { source: "real-fixture simulation", sourceVersion: null, approvalRef: null } });
const path = (over: Partial<SelectedPath> = {}): SelectedPath => ({ capacityNodeIds: [], ruleIds: [], sharedCapacityIds: [], reclassificationElectionIds: [], ...over });

const ruleOf = (ruleId: string) => rules.find((r) => r.ruleId === ruleId)!;
/** True when every condition the real rule carries was reduced to a boolean expression by Phase 3. */
const fullyEvaluable = (ruleId: string) => ruleOf(ruleId).conditions.every((c) => c.expression !== null);

/** The first real capacity that is an authoritative money amount AND carries no unreduced condition. */
const authoritative = state.capacities.find((c) => c.status === "AVAILABLE" && c.effectiveRemaining.kind === "AMOUNT" && c.effectiveRemaining.value.type === "MONEY" && fullyEvaluable(c.ruleId));
/** A real capacity whose rule carries a condition Phase 3 recorded but could not reduce to an expression. */
const withUnreducedCondition = state.capacities.find((c) => c.status === "AVAILABLE" && c.effectiveRemaining.kind === "AMOUNT" && !fullyEvaluable(c.ruleId));

describe("simulation over the frozen real Phase-3 compile result", () => {
  it("the frozen corpus supplies capacities this engine can simulate against", () => {
    expect(rules.length).toBeGreaterThan(0);
    expect(state.capacities.length).toBe(rules.length);
    expect(authoritative, "the frozen corpus reports at least one authoritative money capacity with fully reduced conditions").toBeTruthy();
    expect(withUnreducedCondition, "the frozen corpus also carries rules whose conditions Phase 3 could not reduce").toBeTruthy();
  });

  it("a draw within a real capacity is satisfied and reduces that real capacity", () => {
    const c = authoritative!;
    const remaining = c.effectiveRemaining as { kind: "AMOUNT"; value: { type: "MONEY"; amount: string; currency: string } };
    const r = run(tx("rf-tx-1", [{ effectId: "e1", kind: "CONSUME_CAPACITY", capacityNodeId: c.capacityNodeId, amount: { type: "MONEY", amount: "1", currency: remaining.value.currency } }]),
      path({ capacityNodeIds: [c.capacityNodeId], ruleIds: [c.ruleId] }));
    expect(r.simulationStatus).toBe("SIMULATED");
    expect(r.selectedPathResult).toBe("SATISFIED");
    expect(r.postState).not.toBeNull();
    const after = r.postState!.capacities.find((x) => x.capacityNodeId === c.capacityNodeId)!;
    expect(after.appliedUsageIds).toEqual(["rf-tx-1::e1"]);
    expect(after.remaining.kind).toBe("AMOUNT");
    expect(r.provenance.chain.some((l) => l.from.startsWith("phase3:rules"))).toBe(true);
  });

  it("a draw beyond a real capacity is refused with the shortfall stated", () => {
    const c = authoritative!;
    const remaining = c.effectiveRemaining as { kind: "AMOUNT"; value: { type: "MONEY"; amount: string; currency: string } };
    const tooMuch = `${remaining.value.amount}0000`;
    const r = run(tx("rf-tx-2", [{ effectId: "e1", kind: "CONSUME_CAPACITY", capacityNodeId: c.capacityNodeId, amount: { type: "MONEY", amount: tooMuch, currency: remaining.value.currency } }]),
      path({ capacityNodeIds: [c.capacityNodeId], ruleIds: [c.ruleId] }));
    expect(r.selectedPathResult).toBe("INSUFFICIENT_CAPACITY");
    expect(r.capacityEffects[0]!.shortfallAmount).not.toBeNull();
    expect(r.postState).toBeNull();
  });

  it("a real condition Phase 3 recorded but could not reduce leaves the path indeterminate, even where the draw itself fits", () => {
    const c = withUnreducedCondition!;
    const r = run(tx("rf-tx-cond", [{ effectId: "e1", kind: "CONSUME_CAPACITY", capacityNodeId: c.capacityNodeId, amount: { type: "MONEY", amount: "1", currency: "USD" } }]),
      path({ capacityNodeIds: [c.capacityNodeId], ruleIds: [c.ruleId] }));
    // The capacity arithmetic works; the legal test attached to it is not reducible, so the engine
    // says so instead of reporting a permission it cannot stand behind.
    expect(r.capacityEffects[0]!.outcome).toBe("SATISFIED");
    expect(r.conditions.some((x) => x.result === "UNSUPPORTED" || x.result === "REVIEW_REQUIRED")).toBe(true);
    expect(r.selectedPathResult).not.toBe("SATISFIED");
    expect(r.postState).toBeNull();
    expect(r.commitPlan.committable).toBe(false);
  });

  it("a real rule Phase 3 could not fully represent never becomes an authoritative permission", () => {
    const unsafe = state.capacities.filter((c) => c.phase3.sufficiency !== "COMPLETE");
    for (const c of unsafe.slice(0, 5)) {
      const r = run(tx(`rf-tx-unsafe-${c.ruleId}`, [{ effectId: "e1", kind: "CONSUME_CAPACITY", capacityNodeId: c.capacityNodeId, amount: { type: "MONEY", amount: "1", currency: "USD" } }]),
        path({ capacityNodeIds: [c.capacityNodeId], ruleIds: [c.ruleId] }));
      expect(r.selectedPathResult).not.toBe("SATISFIED");
      expect(r.commitPlan.committable).toBe(false);
    }
  });
});

describe("§40 / §41 the frozen corpus gaps are carried forward, never filled in", () => {
  it("the real corpus carries zero quantified shared-capacity resources, so no pool is simulated against", () => {
    expect((frozen.sharedCapacities ?? []).length).toBe(0);
    expect(graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY")).toEqual([]);
    expect(state.sharedConstraints).toEqual([]);
  });

  it("a real shared relationship with no quantified resource stays non-authoritative through simulation", () => {
    const shareEdges = graph.edges.filter((e) => e.sourceRelationship === "SHARES_CAPACITY_WITH");
    expect(shareEdges.length).toBeGreaterThan(0);
    const member = state.capacities.find((c) => shareEdges.some((e) => e.from === c.capacityNodeId));
    expect(member).toBeTruthy();
    const r = run(tx("rf-tx-share", [{ effectId: "e1", kind: "CONSUME_CAPACITY", capacityNodeId: member!.capacityNodeId, amount: { type: "MONEY", amount: "1", currency: "USD" } }]),
      path({ capacityNodeIds: [member!.capacityNodeId], ruleIds: [member!.ruleId] }));
    expect(r.selectedPathResult).not.toBe("SATISFIED");
    expect(r.capacityEffects[0]!.availableAmount.kind).toBe("NOT_DETERMINED");
    expect(r.capacityEffects[0]!.limitations.map((l) => l.code)).toContain("SHARED_CAPACITY_NOT_QUANTIFIED");
    expect(r.commitPlan.committable).toBe(false);
  });

  it("the real corpus carries zero executable reclassification edges, so an election against it is refused", () => {
    expect(graph.edges.filter((e) => e.kind === "RECLASSIFIABLE_TO")).toEqual([]);
    const [a, b] = state.capacities;
    const r = run(tx("rf-tx-reclass", [{
      effectId: "e1", kind: "APPLY_RECLASSIFICATION",
      election: { electionId: "rf-el", sourceRuleId: a!.ruleId, destinationRuleId: b!.ruleId, amount: { amount: "1", currency: "USD" }, effectiveAsOf: "2026-03-31", provenance: { source: "real-fixture", sourceVersion: null, approvalRef: null } },
    }]), path({ reclassificationElectionIds: ["rf-el"] }));
    expect(r.reclassificationEffects.allExecuted).toBe(false);
    expect(r.reclassificationEffects.outcomes[0]!.blockedBy.map((x) => x.code)).toContain("NO_EXPLICIT_RECLASSIFICATION_EDGE");
    expect(r.reclassificationEffects.outcomes[0]!.authorizingEdge).toBeNull();
    expect(r.postState).toBeNull();
  });

  it("the evidence boundary is explicit: real-corpus proof covers ordinary capacity only", () => {
    const realCorpusProves = {
      capacityConsumption: true,
      overConsumptionRefusal: true,
      legalStateDominance: true,
      unquantifiedSharedRelationship: true,
      quantifiedSharedPoolExecution: false,
      reclassificationExecution: false,
    };
    expect(realCorpusProves.quantifiedSharedPoolExecution).toBe(false);
    expect(realCorpusProves.reclassificationExecution).toBe(false);
    expect((frozen.sharedCapacities ?? []).length).toBe(0);
    expect(graph.edges.filter((e) => e.kind === "RECLASSIFIABLE_TO").length).toBe(0);
  });
});
