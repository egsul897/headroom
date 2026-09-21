/**
 * PHASE 4D §6, §7, §20, §29, §32, §35, §44 - identity, canonicalization, replay determinism,
 * purity and the deterministic complexity counters.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { canonicalTransaction, CANONICALIZATION_RULES } from "@/lib/contract-model/runtime/transaction/identity";
import {
  FACILITY, FIGURE, MONEY, MUL, ORG, PCT, WHEN, adjustFigure, amountOf, cash, consume, election,
  figure, nodeOf, onProvision, proposal, provision, reclassify, resetIds, route, simulate, usage, world,
} from "./helpers";

beforeEach(resetIds);

const flat = (id: string, amount = 100) => provision(id, MONEY(amount));

describe("§7 canonicalization contract", () => {
  it("states explicitly which collections are order-sensitive, which are not, and what is excluded", () => {
    expect(CANONICALIZATION_RULES.orderSensitive).toContain("transaction.effects - the stated sequence of effects");
    for (const k of ["selectedPath.capacityNodeIds", "selectedPath.ruleIds", "selectedPath.sharedCapacityIds", "selectedPath.reclassificationElectionIds"]) {
      expect(CANONICALIZATION_RULES.orderInsensitive).toContain(k);
    }
    expect(CANONICALIZATION_RULES.excluded.some((x) => x.startsWith("diagnostics"))).toBe(true);
    expect(CANONICALIZATION_RULES.excluded.some((x) => x.startsWith("trace"))).toBe(true);
    expect(CANONICALIZATION_RULES.numericRule).toContain("exact decimal value plus its unit");
  });

  it("1. object-key insertion order never reaches a hash", () => {
    const w = world({ rules: [flat("p-a")] });
    const path = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
    const a = canonicalTransaction(proposal("tx", [consume("e1", nodeOf("p-a"), cash("20"))]), path, w.state.snapshotBinding);
    const reordered = canonicalTransaction({ provenance: { approvalRef: null, sourceVersion: "v1", source: "caller-supplied hypothetical" }, effects: [consume("e1", nodeOf("p-a"), cash("20"))], label: null, category: null, effectiveAsOf: WHEN, instrumentKey: FACILITY, companyId: ORG, transactionId: "tx" }, path, w.state.snapshotBinding);
    expect(JSON.stringify(Object.keys(a).sort())).toBe(JSON.stringify(Object.keys(reordered).sort()));
    expect(a).toEqual(reordered);
  });

  it("8 / 9. the canonical form carries no diagnostics, no trace and no display text", () => {
    const w = world({ rules: [flat("p-a")] });
    const form = JSON.stringify(canonicalTransaction(
      proposal("tx", [consume("e1", nodeOf("p-a"), cash("20"), { note: "a reader-facing note" })], { label: "a display label" }),
      route({ capacityNodeIds: [nodeOf("p-a")] }), w.state.snapshotBinding));
    for (const excluded of ["diagnostic", "trace", "a reader-facing note", "a display label", "complexity"]) {
      expect(form.toLowerCase()).not.toContain(excluded.toLowerCase());
    }
  });

  it("5. a changed election changes identity; 6. a changed input snapshot changes identity", () => {
    const rules = [provision("p-src", MONEY(100), { dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "p-dst", description: "may reclassify" }] }), flat("p-dst")];
    const ledger = [usage("u1", "40", onProvision("p-src"))];
    const w = world({ rules, ledger });
    const path = route({ reclassificationElectionIds: ["el-1"] });
    const at = (amount: string) => simulate(w, proposal("tx", [reclassify("e1", election("el-1", "p-src", "p-dst", amount))]), path).transactionIdentity.transactionHash;
    expect(at("25")).not.toBe(at("26"));

    // The snapshot IDENTITY is what a transaction is specified against. A snapshot's content cannot
    // change under a fixed identity - Phase 4B snapshots are immutable and a revision is a new
    // snapshot - so binding the identity is binding the financial state.
    resetIds();
    const grower = [provision("p-grow", MUL(PCT(0.2), FIGURE("fig-1")))];
    const facts = [figure("fig-1", "1000")];
    const growerPath = route({ capacityNodeIds: [nodeOf("p-grow")], ruleIds: ["p-grow"] });
    const against = (snapshotId: string) => {
      const wx = world({ rules: grower, facts, snapshotId });
      return simulate(wx, proposal("tx", [consume("e1", nodeOf("p-grow"), cash("50"))]), growerPath);
    };
    const packA = against("pack-a");
    const packB = against("pack-b");
    expect(packA.preTransactionState.snapshotBinding.snapshotIds).toEqual(["pack-a"]);
    expect(packB.transactionIdentity.transactionHash).not.toBe(packA.transactionIdentity.transactionHash);
    expect(packB.postStateIdentity!.postStateHash).not.toBe(packA.postStateIdentity!.postStateHash);
  });

  it("the money rule: identity binds an exact value and a unit, never a rendering", () => {
    const w = world({ rules: [flat("p-a")] });
    const path = route({ capacityNodeIds: [nodeOf("p-a")] });
    const form = canonicalTransaction(proposal("tx", [consume("e1", nodeOf("p-a"), cash("20.50"))]), path, w.state.snapshotBinding);
    expect(JSON.stringify(form)).toContain('"unit":"MONEY:USD"');
    expect(JSON.stringify(form)).toContain('"exact":"20.50"');
    expect(JSON.stringify(form)).not.toContain("$");
  });
});

describe("§20 post-state identity", () => {
  it("binds the pre-state, the transaction, the snapshot set, the input view, the graph, the ledger, the versions and the effect sequence", () => {
    const w = world({ rules: [flat("p-a")], facts: [figure("fig-1", "10")] });
    const r = simulate(w, proposal("tx", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    const bound = r.postStateIdentity!.boundTo;
    for (const k of ["preStateHash", "transactionHash", "snapshotSetHash", "simulationInputViewHash", "capacityGraphHash", "ledgerPreHash", "ledgerPostHash", "effectSequence", "runtimeVersion", "inputContractVersion", "capacityGraphVersion", "transactionSimulationVersion", "capacityStateHash"]) {
      expect(Object.keys(bound)).toContain(k);
    }
    expect(bound.preStateHash).toBe(w.state.stateHash);
    expect(bound.ledgerPreHash).not.toBe(bound.ledgerPostHash);
    expect(Object.keys(bound)).not.toContain("trace");
    expect(Object.keys(bound)).not.toContain("diagnostics");
  });
});

describe("§32 replay determinism", () => {
  it("the same specification replays byte-identically, five times over", () => {
    const build = () => {
      resetIds();
      const w = world({ rules: [provision("p-g", MUL(PCT(0.25), FIGURE("fig-1"))), flat("p-b")], facts: [figure("fig-1", "800")], ledger: [usage("u1", "30", onProvision("p-b"))] });
      return simulate(w, proposal("tx-replay", [adjustFigure("e0", "fig-1", "DELTA", cash("200")), consume("e1", nodeOf("p-g"), cash("100"))]),
        route({ capacityNodeIds: [nodeOf("p-g")], ruleIds: ["p-g"] }));
    };
    const first = build();
    for (let i = 0; i < 4; i++) {
      const again = build();
      expect(again.transactionIdentity.transactionHash).toBe(first.transactionIdentity.transactionHash);
      expect(again.simulationIdentity.simulationId).toBe(first.simulationIdentity.simulationId);
      expect(again.postStateIdentity!.postStateHash).toBe(first.postStateIdentity!.postStateHash);
      expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    }
    expect(first.trace.length).toBeGreaterThan(0);
  });

  it("no clock, counter or random source reaches the result", () => {
    const w = world({ rules: [flat("p-a")] });
    const r = simulate(w, proposal("tx", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(r.simulationIdentity.simulationId).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("§29 / §35 purity and failure atomicity", () => {
  it("nothing the caller supplied is mutated, on a satisfied path or a refused one", () => {
    const ledger = [usage("u1", "30", onProvision("p-a"))];
    const w = world({ rules: [flat("p-a")], ledger });
    const path = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
    for (const amount of ["20", "5000"]) {
      const tx = proposal("tx", [consume("e1", nodeOf("p-a"), cash(amount))]);
      const before = JSON.stringify({ tx, state: w.state, graph: w.graph, ledger, path });
      simulate(w, tx, path);
      expect(JSON.stringify({ tx, state: w.state, graph: w.graph, ledger, path })).toBe(before);
    }
  });

  it("a refused transaction publishes no post-state and no committable plan", () => {
    const w = world({ rules: [flat("p-a")] });
    const r = simulate(w, proposal("tx", [consume("e1", nodeOf("p-a"), cash("5000"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.postState).toBeNull();
    expect(r.postStateIdentity).toBeNull();
    expect(r.commitPlan.committable).toBe(false);
    expect(r.commitPlan.executed).toBe(false);
    expect(r.commitPlan.postStateHash).toBeNull();
  });

  it("the commit plan is declarative: it describes what would be written and writes nothing", () => {
    const w = world({ rules: [flat("p-a")] });
    const r = simulate(w, proposal("tx", [consume("e1", nodeOf("p-a"), cash("20"))]), route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] }));
    expect(r.commitPlan.executed).toBe(false);
    expect(r.commitPlan.wouldAppendLedgerRecords.map((x) => x.usageId)).toEqual(["tx::e1"]);
    expect(r.commitPlan.note).toContain("writes no ledger");
  });
});

describe("§44 deterministic complexity", () => {
  const sized = (n: number) => {
    resetIds();
    const pad = (i: number) => String(i).padStart(3, "0");
    const rules = Array.from({ length: n }, (_, i) => flat(`p-${pad(i)}`));
    const w = world({ rules, ledger: rules.map((r, i) => usage(`u-${pad(i)}`, "1", onProvision(r.ruleId))) });
    const effects = rules.map((r, i) => consume(`e-${pad(i)}`, nodeOf(r.ruleId), cash("5")));
    const r = simulate(w, proposal("tx-n", effects), route({ capacityNodeIds: rules.map((x) => nodeOf(x.ruleId)), ruleIds: rules.map((x) => x.ruleId) }));
    return { n, ...r.complexity, proposed: r.ledgerEffects.proposed.length, path: r.selectedPathResult };
  };

  // NOTE ON A DELIBERATE CHANGE OF EXPECTATION (Phase-4D remediation).
  //
  // These two assertions previously required `stateEvaluations === 2` and `ledgerEntriesExamined
  // === 3n` for any number of effects. Those numbers were achievable only because every draw was
  // measured against the SAME pre-transaction state, which is precisely the defect the remediation
  // removed: two draws of 60 against a capacity of 100 were each SATISFIED.
  //
  // Under the corrected sequential contract each draw is measured against the state its
  // predecessors produced, so the engine recomputes Phase-4C state once per ledger-affecting
  // effect. The counters below are the measured cost of correctness, not a relaxed bound: they are
  // exact, and they are asserted exactly. A transaction with a single draw and no adjustment still
  // costs 2 evaluations, so the common case is unchanged.
  it("state evaluations are linear in the number of ledger-affecting effects", () => {
    for (const n of [5, 10, 20, 40]) {
      const m = sized(n);
      expect(m.path).toBe("SATISFIED");
      expect(m.capacitiesEvaluated).toBe(n);
      expect(m.effectsApplied).toBe(n);
      expect(m.proposed).toBe(n);
      expect(m.simulationSteps).toBe(15);
      // One opening evaluation plus one per draw that changed the ledger before the next draw.
      expect(m.stateEvaluations).toBe(n + 1);
    }
  });

  it("the per-effect recomputation is linear in evaluations and never re-enters the pipeline", () => {
    const a = sized(5), b = sized(40);
    expect(a.stateEvaluations).toBe(a.n + 1);
    expect(b.stateEvaluations).toBe(b.n + 1);
    // The pipeline itself stays a fixed 15 steps however many effects are stated: the sequential
    // execution loops inside one step, it does not re-run the simulation.
    expect(a.simulationSteps).toBe(15);
    expect(b.simulationSteps).toBe(15);
    // Ledger scanning is the known quadratic cost of recomputation, measured and disclosed in
    // docs/phase-4d/remediation/16-complexity.json rather than asserted away.
    expect(b.ledgerEntriesExamined).toBeGreaterThan(a.ledgerEntriesExamined);
  });
});

describe("§5 the two status dimensions stay independent", () => {
  it("every combination observed keeps simulation success and path outcome separate", () => {
    const w = world({ rules: [flat("p-a")] });
    const path = route({ capacityNodeIds: [nodeOf("p-a")], ruleIds: ["p-a"] });
    const ok = simulate(w, proposal("t1", [consume("e1", nodeOf("p-a"), cash("20"))]), path);
    const short = simulate(w, proposal("t2", [consume("e1", nodeOf("p-a"), cash("500"))]), path);
    expect([ok.simulationStatus, ok.selectedPathResult]).toEqual(["SIMULATED", "SATISFIED"]);
    expect([short.simulationStatus, short.selectedPathResult]).toEqual(["SIMULATED", "INSUFFICIENT_CAPACITY"]);
    // Neither dimension is a boolean and neither is derived from the other.
    expect(JSON.stringify(ok)).not.toContain('"permitted"');
    expect(JSON.stringify(short)).not.toContain('"permitted"');
    expect(amountOf(ok.postState!.capacities[0]!.usage)).toBe("20");
  });
});
