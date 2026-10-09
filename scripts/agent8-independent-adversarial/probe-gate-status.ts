import { buildCapacityGraph, evaluateCapacityState } from "../../lib/contract-model/runtime/capacity";
import { snapshotInputResolver } from "../../lib/contract-model/runtime/input";
import { simulateTransaction } from "../../lib/contract-model/runtime/transaction/simulate";
import { AS_OF, CO, INST, CMP, METRIC, MONEY, RATIO, UNLIM, approvedSnapshot, ratioFact, resetIds, rule } from "./helpers";

resetIds();
const gate = CMP(METRIC("First Lien Net Leverage Ratio", "RATIO"), "LTE", RATIO(3.75));
const rules = [
  rule("ratio-debt", UNLIM(gate), {
    conditions: [
      {
        conditionId: "g1",
        conditionType: "RATIO_SATISFIED",
        expression: gate,
        referencesDefinitionId: null,
        description: "FLNL <= 3.75x",
        provenance: null,
      },
    ],
  }),
  rule("general", MONEY(40_000_000)),
];
const graph = buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF });
const inputs = snapshotInputResolver({
  snapshots: [approvedSnapshot([ratioFact("First Lien Net Leverage Ratio", "4.1")])],
  companyId: CO,
  instrumentKey: INST,
});
const state = evaluateCapacityState({ graph, rules, inputs, ledger: [], asOf: AS_OF });
const ratio = state.capacities.find((c) => c.ruleId === "ratio-debt")!;
console.log(
  JSON.stringify(
    {
      status: ratio.status,
      gross: ratio.grossCapacity,
      rem: ratio.effectiveRemaining,
      lim: ratio.limitations.map((l) => l.code),
      // Post A8-01 remediation contract: NOT_SATISFIED, never AVAILABLE
      contract: {
        statusIsNotAvailable: ratio.status !== "AVAILABLE",
        statusIsNotSatisfied: ratio.status === "NOT_SATISFIED",
        amountKindGateNotSatisfied: ratio.grossCapacity.kind === "GATE_NOT_SATISFIED",
      },
    },
    null,
    2,
  ),
);

const sim = simulateTransaction({
  transaction: {
    transactionId: "tx",
    companyId: CO,
    instrumentKey: INST,
    effectiveAsOf: AS_OF,
    category: "debt",
    label: "ratio debt",
    entities: ["BORROWER"],
    effects: [
      {
        effectId: "e1",
        kind: "CONSUME_CAPACITY",
        capacityNodeId: "capacity:rule:ratio-debt",
        amount: { type: "MONEY", amount: "1000000", currency: "USD" },
      },
    ],
    provenance: { source: "t", sourceVersion: "1", approvalRef: null },
  } as never,
  currentState: state,
  capacityGraph: graph,
  selectedPath: {
    capacityNodeIds: ["capacity:rule:ratio-debt"],
    ruleIds: ["ratio-debt"],
    sharedCapacityIds: [],
    reclassificationElectionIds: [],
  },
  inputs,
  context: { rules, ledger: [], asOf: AS_OF },
});
console.log(
  JSON.stringify(
    {
      simStatus: sim.simulationStatus,
      path: sim.selectedPathResult,
      effects: sim.capacityEffects.map((e) => ({
        outcome: e.outcome,
        capacityStatus: e.capacityStatus,
        limitations: e.limitations.map((l) => l.code),
      })),
    },
    null,
    2,
  ),
);
