/**
 * PHASE 4C - explicit reclassification state transitions (remediated).
 *
 * Phase 3 records a reclassification RIGHT as an IRRuleDependency with relationshipType
 * RECLASSIFIABLE_TO, carrying a target rule id and a free-text description. It carries no amount,
 * no effective date and no direction constraint, so a transition can never be DERIVED from the IR.
 *
 * Phase 4C therefore executes an election the caller supplies, and only where the authorizing edge
 * exists. It never decides that a reclassification should occur, never picks an amount, and never
 * reinterprets the description. Anything the election does not state is returned as an explicit
 * RECLASSIFICATION_NOT_EXECUTABLE with the exact missing fields.
 *
 * Batch semantics (R4, R5):
 *   - every election in a batch draws on the usage the source carried in `before`. There is no
 *     intra-batch chaining: an election cannot spend usage another election in the same batch
 *     moves in, so the result does not depend on election order;
 *   - conservation is checked per election AND aggregated by source over the whole batch: the sum
 *     an entire batch asks to move out of one source may never exceed what that source carries;
 *   - a batch is validated whole and applied whole. If any election is blocked, nothing is applied,
 *     `after` is null, and every otherwise-valid election is reported BLOCKED_BY_BATCH_ATOMICITY;
 *   - an election id is an immutable identity. Two elections sharing one id, or an id whose usage
 *     rows are already in the before-ledger, fail closed; nothing is applied twice.
 */
import { rationalFromString } from "../decimal";
import { addAll, compareValues } from "../units";
import type { RuntimeValue } from "../types";
import { serializeValue } from "../values";
import { hashOf } from "../input/identity";
import { CAPACITY_GRAPH_VERSION } from "./version";
import { ruleNodeId } from "./graph";
import { evaluateCapacityState, type EvaluateCapacityStateArgs } from "./state";
import type {
  CapacityEdge, CapacityState, CapacityStateTransitionResult, LedgerUsageRecord, ReclassificationBlockCode,
  ReclassificationElection, ReclassificationOutcome,
} from "./types";

const L = { exprId: null, inputKeys: [] as string[] };
const money = (amount: string, currency: string): RuntimeValue => ({ type: "MONEY", amount: rationalFromString(amount), currency, lineage: L });
const negate = (amount: string) => (amount.startsWith("-") ? amount.slice(1) : `-${amount}`);
/** Exact decimal string of a money value, through the Phase-4A serializer. */
const amountStr = (v: RuntimeValue | null): string | null => { if (!v) return null; const s = serializeValue(v); return s.type === "MONEY" ? s.amount : null; };

type Block = { code: ReclassificationBlockCode; message: string; missingSemanticFields: string[] };
const block = (code: ReclassificationBlockCode, message: string, missingSemanticFields: string[] = []): Block => ({ code, message, missingSemanticFields });

export interface ApplyCapacityStateTransitionArgs extends EvaluateCapacityStateArgs {
  /** The state the transition starts from. It is never mutated. */
  before: CapacityState;
  elections: readonly ReclassificationElection[];
}

/** A strictly positive exact amount, or null. An election never moves nothing, and never moves a negative. */
function positiveAmount(amount: string | undefined): RuntimeValue | null {
  if (!amount) return null;
  try {
    const v = rationalFromString(amount);
    return v.num > 0n ? { type: "MONEY", amount: v, currency: "", lineage: L } : null;
  } catch { return null; }
}

/** Every field an executable transition needs. A missing one is named, never filled in. */
function missingSemanticFields(e: ReclassificationElection): string[] {
  const missing: string[] = [];
  if (!e.electionId) missing.push("electionId");
  if (!e.sourceRuleId) missing.push("sourceRuleId");
  if (!e.destinationRuleId) missing.push("destinationRuleId");
  if (!e.amount || !positiveAmount(e.amount.amount)) missing.push("amount.amount");
  if (!e.amount || !e.amount.currency) missing.push("amount.currency");
  if (!e.effectiveAsOf) missing.push("effectiveAsOf");
  if (!e.provenance || !e.provenance.source) missing.push("provenance.source");
  return missing;
}

export function applyCapacityStateTransition(args: ApplyCapacityStateTransitionArgs): CapacityStateTransitionResult {
  const { before, graph } = args;
  const asOf = args.asOf ?? before.asOf ?? null;
  // Canonical order by election id. Nothing below depends on the order the caller supplied.
  const elections = [...args.elections].sort((a, b) => (a.electionId < b.electionId ? -1 : a.electionId > b.electionId ? 1 : 0));
  const byNodeId = new Map(graph.nodes.map((n) => [n.capacityNodeId, n]));
  const reclassEdges = new Map<string, CapacityEdge>();
  for (const e of graph.edges) if (e.kind === "RECLASSIFIABLE_TO") reclassEdges.set(`${e.from}->${e.to}`, e);
  const beforeLedgerIds = new Set((args.ledger ?? []).map((u) => u.usageId));
  /** What each source carried in `before`: the usage rows the state actually applied to it. */
  const appliedByRule = new Map(before.explanations.map((x) => [x.ruleId, x.ledgerEntries]));

  // Election identity: unique or fail closed (R5).
  const idCounts = new Map<string, number>();
  for (const e of elections) idCounts.set(e.electionId, (idCounts.get(e.electionId) ?? 0) + 1);

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

  // ---- pass 1: validate every election on its own, against `before` -------
  const blocks = new Map<ReclassificationElection, Block[]>();
  const edgeOf = new Map<ReclassificationElection, CapacityEdge | null>();
  /** Per source: what it carried, and which elections draw on it (only those individually well-formed). */
  const bySource = new Map<string, { currency: string | null; sourceUsage: RuntimeValue | null; sourceUsageFailed: boolean; drawers: ReclassificationElection[] }>();

  for (const election of elections) {
    const blockedBy: Block[] = [];
    const missing = missingSemanticFields(election);
    if (missing.length > 0) blockedBy.push(block("MISSING_SEMANTIC_FIELDS", "the election does not state every field an executable transition needs (an amount must be strictly positive); Phase 4C does not supply them", missing));
    if ((idCounts.get(election.electionId) ?? 0) > 1) blockedBy.push(block("DUPLICATE_ELECTION_IDENTITY", `election id ${election.electionId} is carried by ${idCounts.get(election.electionId)} elections in this batch; an election identity applies at most once and nothing is chosen between the bearers`));
    if (beforeLedgerIds.has(`${election.electionId}:source`) || beforeLedgerIds.has(`${election.electionId}:destination`)) blockedBy.push(block("ELECTION_ALREADY_APPLIED", `the ledger already carries usage generated by election ${election.electionId}; it is not applied again`));
    if (electionCycle && electionCycle.includes(election.sourceRuleId)) blockedBy.push(block("RECLASSIFICATION_CYCLE", `the supplied elections form a cycle: ${electionCycle.join(" -> ")}`));

    const sourceNode = byNodeId.get(ruleNodeId(election.sourceRuleId));
    const destNode = byNodeId.get(ruleNodeId(election.destinationRuleId));
    if (!sourceNode) blockedBy.push(block("SOURCE_CAPACITY_NOT_IN_GRAPH", `rule ${election.sourceRuleId} has no capacity node in this graph`));
    if (!destNode) blockedBy.push(block("DESTINATION_CAPACITY_NOT_IN_GRAPH", `rule ${election.destinationRuleId} has no capacity node in this graph`));
    if (sourceNode && destNode && (sourceNode.instrumentKey !== destNode.instrumentKey || sourceNode.companyId !== destNode.companyId)) {
      blockedBy.push(block("CROSS_INSTRUMENT_NOT_REPRESENTED", "source and destination belong to different companies or instruments; no cross-instrument reclassification is represented"));
    }

    // The authorizing edge must exist. An election without one is a request the contract, as Phase 3
    // represents it, does not authorize.
    const edge = reclassEdges.get(`${ruleNodeId(election.sourceRuleId)}->${ruleNodeId(election.destinationRuleId)}`) ?? null;
    edgeOf.set(election, edge);
    if (!edge) blockedBy.push(block("NO_EXPLICIT_RECLASSIFICATION_EDGE", `Phase 3 records no RECLASSIFIABLE_TO relationship from ${election.sourceRuleId} to ${election.destinationRuleId}; the edge is never invented`));

    if (asOf !== null && election.effectiveAsOf > asOf) blockedBy.push(block("EFFECTIVE_AFTER_AS_OF", `the election is effective ${election.effectiveAsOf}, after the evaluation as-of ${asOf}`));

    // The source must actually carry the usage being moved. Moving usage that was never recorded
    // would create economic amount out of nothing. Checked here per election, and again below in
    // aggregate over every election drawing on the same source.
    if (sourceNode && missing.length === 0) {
      const applied = appliedByRule.get(election.sourceRuleId) ?? [];
      const currencies = new Set(applied.map((u) => u.amount.currency));
      const entry = bySource.get(election.sourceRuleId) ?? { currency: currencies.size === 1 ? [...currencies][0]! : null, sourceUsage: null, sourceUsageFailed: false, drawers: [] };
      if (!bySource.has(election.sourceRuleId)) {
        if (applied.length > 0) {
          const total = addAll(applied.map((u) => money(u.amount.amount, u.amount.currency)), L);
          if (total.ok) entry.sourceUsage = total.value; else entry.sourceUsageFailed = true;
        }
        bySource.set(election.sourceRuleId, entry);
      }
      if (currencies.size > 0 && !currencies.has(election.amount.currency)) {
        blockedBy.push(block("CURRENCY_MISMATCH_NO_CONVERSION_MODELED", `the election is denominated in ${election.amount.currency} but the source usage is in ${[...currencies].sort().join("/")}; no conversion is modelled`));
      } else if (applied.length === 0) {
        blockedBy.push(block("SOURCE_USAGE_INSUFFICIENT", "no usage is recorded against the source capacity, so there is nothing to reclassify"));
      } else if (entry.sourceUsage) {
        const cmp = compareValues(entry.sourceUsage, money(election.amount.amount, election.amount.currency));
        if (cmp.ok && cmp.cmp < 0) blockedBy.push(block("SOURCE_USAGE_INSUFFICIENT", "the election moves more than the usage recorded against the source capacity"));
        if (cmp.ok) entry.drawers.push(election);
      }
    }
    blocks.set(election, blockedBy);
  }

  // ---- pass 2: conservation aggregated by source over the whole batch (R4) --
  const batchConservation: CapacityStateTransitionResult["batchConservation"] = [];
  for (const [sourceRuleId, entry] of [...bySource.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const drawers = entry.drawers;
    if (drawers.length === 0) {
      batchConservation.push({ sourceRuleId, sourceUsage: amountStr(entry.sourceUsage), requested: "0", holds: false });
      continue;
    }
    const requested = addAll(drawers.map((e) => money(e.amount.amount, e.amount.currency)), L);
    if (!requested.ok || !entry.sourceUsage) {
      for (const e of drawers) blocks.get(e)!.push(block("AGGREGATE_SOURCE_USAGE_EXCEEDED", `the elections drawing on ${sourceRuleId} cannot be totalled against its usage: ${requested.ok ? "source usage is not a single amount" : requested.message}`));
      batchConservation.push({ sourceRuleId, sourceUsage: amountStr(entry.sourceUsage), requested: (requested.ok ? amountStr(requested.value) : null) ?? "not totalled", holds: false });
      continue;
    }
    const cmp = compareValues(entry.sourceUsage, requested.value);
    const holds = cmp.ok && cmp.cmp >= 0;
    if (!holds) {
      for (const e of drawers) blocks.get(e)!.push(block("AGGREGATE_SOURCE_USAGE_EXCEEDED", `taken together, the ${drawers.length} elections drawing on ${sourceRuleId} move ${amountStr(requested.value) ?? "?"} but the source carries ${amountStr(entry.sourceUsage) ?? "?"} in the before-state; every election draws on the before-state and none may spend what another moves in`));
    }
    batchConservation.push({ sourceRuleId, sourceUsage: amountStr(entry.sourceUsage), requested: amountStr(requested.value) ?? "not totalled", holds });
  }

  // ---- pass 3: atomicity, then generation ----------------------------------
  const anyBlocked = elections.some((e) => blocks.get(e)!.length > 0);
  const outcomes: ReclassificationOutcome[] = [];
  const generated: LedgerUsageRecord[] = [];
  const edgeRef = (edge: CapacityEdge | null) => (edge ? { from: edge.from, to: edge.to, sourceRelationship: edge.sourceRelationship, description: edge.description } : null);

  for (const election of elections) {
    const blockedBy = blocks.get(election)!;
    const edge = edgeOf.get(election) ?? null;
    if (blockedBy.length === 0 && anyBlocked) blockedBy.push(block("BLOCKED_BY_BATCH_ATOMICITY", "this election is executable on its own, but another election in the batch is not; a batch applies whole or not at all"));
    if (blockedBy.length > 0) {
      outcomes.push({ electionId: election.electionId, state: "RECLASSIFICATION_NOT_EXECUTABLE", blockedBy, authorizingEdge: edgeRef(edge), generatedUsage: [], conservation: null });
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
      outcomes.push({ electionId: election.electionId, state: "RECLASSIFICATION_NOT_EXECUTABLE", blockedBy: [block("CONSERVATION_VIOLATED", "the generated usage pair does not net to zero")], authorizingEdge: edgeRef(edge), generatedUsage: [], conservation: null });
      continue;
    }
    generated.push(out, into);
    outcomes.push({
      electionId: election.electionId, state: "EXECUTED", blockedBy: [],
      authorizingEdge: edgeRef(edge), generatedUsage: [out, into],
      conservation: { sourceDelta: out.amount.amount, destinationDelta: into.amount.amount, net: "0", holds: true },
    });
  }

  // Pairwise conservation can fail only after aggregate validation passed; if it did, the batch is
  // not applied either. `after` exists only when every election executed.
  const allExecuted = outcomes.length > 0 && outcomes.every((o) => o.state === "EXECUTED");
  const after = allExecuted && generated.length > 0
    ? evaluateCapacityState({ ...args, ledger: [...(args.ledger ?? []), ...generated], asOf })
    : null;
  if (!allExecuted) for (const o of outcomes) if (o.state === "EXECUTED") { o.state = "RECLASSIFICATION_NOT_EXECUTABLE"; o.blockedBy = [block("BLOCKED_BY_BATCH_ATOMICITY", "another election in the batch failed its conservation check; a batch applies whole or not at all")]; o.generatedUsage = []; o.conservation = null; }

  return {
    capacityGraphVersion: CAPACITY_GRAPH_VERSION,
    batchConservation,
    before, after, outcomes, allExecuted,
    transitionHash: hashOf({ beforeHash: before.stateHash, afterHash: after?.stateHash ?? null, outcomes, batchConservation }),
  };
}
