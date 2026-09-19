/**
 * PHASE 4C - explicit reclassification state transitions.
 *
 * Phase 3 records a reclassification RIGHT as an IRRuleDependency with relationshipType
 * RECLASSIFIABLE_TO, carrying a target rule id and a free-text description. It carries no amount,
 * no effective date and no direction constraint, so a transition can never be DERIVED from the IR.
 *
 * Phase 4C therefore executes an election the caller supplies, and only where the authorizing edge
 * exists. It never decides that a reclassification should occur, never picks an amount, and never
 * reinterprets the description. Anything the election does not state is returned as an explicit
 * RECLASSIFICATION_NOT_EXECUTABLE with the exact missing fields.
 */
import { rationalFromString } from "../decimal";
import { addAll, compareValues } from "../units";
import type { RuntimeValue } from "../types";
import { hashOf } from "../input/identity";
import { CAPACITY_GRAPH_VERSION } from "./version";
import { ruleNodeId } from "./graph";
import { evaluateCapacityState, type EvaluateCapacityStateArgs } from "./state";
import type {
  CapacityState, CapacityStateTransitionResult, LedgerUsageRecord, ReclassificationBlockCode,
  ReclassificationElection, ReclassificationOutcome,
} from "./types";

const L = { exprId: null, inputKeys: [] as string[] };
const money = (amount: string, currency: string): RuntimeValue => ({ type: "MONEY", amount: rationalFromString(amount), currency, lineage: L });
const negate = (amount: string) => (amount.startsWith("-") ? amount.slice(1) : `-${amount}`);

export interface ApplyCapacityStateTransitionArgs extends EvaluateCapacityStateArgs {
  /** The state the transition starts from. It is never mutated. */
  before: CapacityState;
  elections: readonly ReclassificationElection[];
}

/** Every field an executable transition needs. A missing one is named, never filled in. */
function missingSemanticFields(e: ReclassificationElection): string[] {
  const missing: string[] = [];
  if (!e.electionId) missing.push("electionId");
  if (!e.sourceRuleId) missing.push("sourceRuleId");
  if (!e.destinationRuleId) missing.push("destinationRuleId");
  if (!e.amount || !e.amount.amount) missing.push("amount.amount");
  if (!e.amount || !e.amount.currency) missing.push("amount.currency");
  if (!e.effectiveAsOf) missing.push("effectiveAsOf");
  if (!e.provenance || !e.provenance.source) missing.push("provenance.source");
  return missing;
}

export function applyCapacityStateTransition(args: ApplyCapacityStateTransitionArgs): CapacityStateTransitionResult {
  const { before, graph, elections } = args;
  const asOf = args.asOf ?? before.asOf ?? null;
  const outcomes: ReclassificationOutcome[] = [];
  const generated: LedgerUsageRecord[] = [];
  const byNodeId = new Map(graph.nodes.map((n) => [n.capacityNodeId, n]));
  const reclassEdges = graph.edges.filter((e) => e.kind === "RECLASSIFIABLE_TO");
  const stateByRule = new Map(before.capacities.map((c) => [c.ruleId, c]));

  // A reclassification cycle among the elections themselves is refused before anything executes.
  const electionCycle = (() => {
    const out = new Map<string, string[]>();
    for (const e of elections) { const l = out.get(e.sourceRuleId) ?? []; l.push(e.destinationRuleId); out.set(e.sourceRuleId, l); }
    const colour = new Map<string, 0 | 1 | 2>();
    const stack: string[] = [];
    let found: string[] | null = null;
    const walk = (id: string) => {
      if (found) return;
      const c = colour.get(id) ?? 0;
      if (c === 1) { const at = stack.indexOf(id); if (at >= 0) found = [...stack.slice(at), id]; return; }
      if (c === 2) return;
      colour.set(id, 1); stack.push(id);
      for (const n of [...(out.get(id) ?? [])].sort()) walk(n);
      stack.pop(); colour.set(id, 2);
    };
    for (const id of [...out.keys()].sort()) walk(id);
    return found as string[] | null;
  })();

  for (const election of [...elections].sort((a, b) => (a.electionId < b.electionId ? -1 : 1))) {
    const blockedBy: { code: ReclassificationBlockCode; message: string; missingSemanticFields: string[] }[] = [];
    const missing = missingSemanticFields(election);
    if (missing.length > 0) blockedBy.push({ code: "MISSING_SEMANTIC_FIELDS", message: "the election does not state every field an executable transition needs; Phase 4C does not supply them", missingSemanticFields: missing });

    if (electionCycle && electionCycle.includes(election.sourceRuleId)) {
      blockedBy.push({ code: "RECLASSIFICATION_CYCLE", message: `the supplied elections form a cycle: ${electionCycle.join(" -> ")}`, missingSemanticFields: [] });
    }

    const sourceNode = byNodeId.get(ruleNodeId(election.sourceRuleId));
    const destNode = byNodeId.get(ruleNodeId(election.destinationRuleId));
    if (!sourceNode) blockedBy.push({ code: "SOURCE_CAPACITY_NOT_IN_GRAPH", message: `rule ${election.sourceRuleId} has no capacity node in this graph`, missingSemanticFields: [] });
    if (!destNode) blockedBy.push({ code: "DESTINATION_CAPACITY_NOT_IN_GRAPH", message: `rule ${election.destinationRuleId} has no capacity node in this graph`, missingSemanticFields: [] });
    if (sourceNode && destNode && (sourceNode.instrumentKey !== destNode.instrumentKey || sourceNode.companyId !== destNode.companyId)) {
      blockedBy.push({ code: "CROSS_INSTRUMENT_NOT_REPRESENTED", message: "source and destination belong to different companies or instruments; no cross-instrument reclassification is represented", missingSemanticFields: [] });
    }

    // The authorizing edge must exist. An election without one is a request the contract, as Phase 3
    // represents it, does not authorize.
    const edge = reclassEdges.find((e) => e.from === ruleNodeId(election.sourceRuleId) && e.to === ruleNodeId(election.destinationRuleId)) ?? null;
    if (!edge) blockedBy.push({ code: "NO_EXPLICIT_RECLASSIFICATION_EDGE", message: `Phase 3 records no RECLASSIFIABLE_TO relationship from ${election.sourceRuleId} to ${election.destinationRuleId}; the edge is never invented`, missingSemanticFields: [] });

    if (asOf !== null && election.effectiveAsOf > asOf) {
      blockedBy.push({ code: "EFFECTIVE_AFTER_AS_OF", message: `the election is effective ${election.effectiveAsOf}, after the evaluation as-of ${asOf}`, missingSemanticFields: [] });
    }

    // The source must actually carry the usage being moved. Moving usage that was never recorded
    // would create economic amount out of nothing.
    const sourceState = stateByRule.get(election.sourceRuleId);
    if (sourceState && missing.length === 0) {
      const applied = before.explanations.find((x) => x.ruleId === election.sourceRuleId)?.ledgerEntries ?? [];
      const currencies = new Set(applied.map((u) => u.amount.currency));
      if (currencies.size > 0 && !currencies.has(election.amount.currency)) {
        blockedBy.push({ code: "CURRENCY_MISMATCH_NO_CONVERSION_MODELED", message: `the election is denominated in ${election.amount.currency} but the source usage is in ${[...currencies].sort().join("/")}; no conversion is modelled`, missingSemanticFields: [] });
      } else if (applied.length > 0) {
        const total = addAll(applied.map((u) => money(u.amount.amount, u.amount.currency)), L);
        if (total.ok) {
          const cmp = compareValues(total.value, money(election.amount.amount, election.amount.currency));
          if (cmp.ok && cmp.cmp < 0) blockedBy.push({ code: "SOURCE_USAGE_INSUFFICIENT", message: `the election moves more than the usage recorded against the source capacity`, missingSemanticFields: [] });
        }
      } else {
        blockedBy.push({ code: "SOURCE_USAGE_INSUFFICIENT", message: "no usage is recorded against the source capacity, so there is nothing to reclassify", missingSemanticFields: [] });
      }
    }

    if (blockedBy.length > 0) {
      outcomes.push({ electionId: election.electionId, state: "RECLASSIFICATION_NOT_EXECUTABLE", blockedBy, authorizingEdge: edge ? { from: edge.from, to: edge.to, sourceRelationship: edge.sourceRelationship, description: edge.description } : null, generatedUsage: [], conservation: null });
      continue;
    }

    // Two rows: one removing the amount from the source, one adding it to the destination. The pair
    // nets to zero by construction, and the invariant is checked rather than assumed.
    const prov = { source: election.provenance.source, sourceVersion: election.provenance.sourceVersion, approvalRef: election.provenance.approvalRef, approvalState: "RECLASSIFICATION_ELECTION" };
    const out: LedgerUsageRecord = {
      usageId: `${election.electionId}:source`, companyId: graph.companyId, instrumentKey: graph.instrumentKey,
      effectiveAsOf: election.effectiveAsOf, amount: { amount: negate(election.amount.amount), currency: election.amount.currency },
      capacityPath: { kind: "RULE", ruleId: election.sourceRuleId }, transactionRef: election.electionId,
      status: "RECORDED", supersededByUsageId: null, provenance: prov,
    };
    const into: LedgerUsageRecord = {
      usageId: `${election.electionId}:destination`, companyId: graph.companyId, instrumentKey: graph.instrumentKey,
      effectiveAsOf: election.effectiveAsOf, amount: { amount: election.amount.amount, currency: election.amount.currency },
      capacityPath: { kind: "RULE", ruleId: election.destinationRuleId }, transactionRef: election.electionId,
      status: "RECORDED", supersededByUsageId: null, provenance: prov,
    };
    const net = addAll([money(out.amount.amount, out.amount.currency), money(into.amount.amount, into.amount.currency)], L);
    const holds = net.ok && net.value.type === "MONEY" && net.value.amount.num === 0n;
    if (!holds) {
      outcomes.push({ electionId: election.electionId, state: "RECLASSIFICATION_NOT_EXECUTABLE", blockedBy: [{ code: "CONSERVATION_VIOLATED", message: "the generated usage pair does not net to zero", missingSemanticFields: [] }], authorizingEdge: edge ? { from: edge.from, to: edge.to, sourceRelationship: edge.sourceRelationship, description: edge.description } : null, generatedUsage: [], conservation: null });
      continue;
    }
    generated.push(out, into);
    outcomes.push({
      electionId: election.electionId, state: "EXECUTED", blockedBy: [],
      authorizingEdge: edge ? { from: edge.from, to: edge.to, sourceRelationship: edge.sourceRelationship, description: edge.description } : null,
      generatedUsage: [out, into],
      conservation: { sourceDelta: out.amount.amount, destinationDelta: into.amount.amount, net: "0", holds: true },
    });
  }

  // A new state is computed from the original ledger plus the generated rows. `before` is untouched.
  const after = generated.length > 0
    ? evaluateCapacityState({ ...args, ledger: [...(args.ledger ?? []), ...generated], asOf })
    : null;

  const allExecuted = outcomes.length > 0 && outcomes.every((o) => o.state === "EXECUTED");
  return {
    capacityGraphVersion: CAPACITY_GRAPH_VERSION,
    before, after, outcomes, allExecuted,
    transitionHash: hashOf({ beforeHash: before.stateHash, afterHash: after?.stateHash ?? null, outcomes }),
  };
}
