/**
 * PHASE 4C - deterministic capacity state.
 *
 * Gross capacity comes from the Phase-4A evaluator over the Phase-3 expression, resolved through
 * the Phase-4B strict resolver. Remaining is gross minus usage through the Phase-4A unit algebra.
 * Nothing here re-implements arithmetic, and nothing here decides which capacity a transaction
 * should use.
 */
import { rationalFromString } from "../decimal";
import { evaluateExpression } from "../evaluate-expression";
import { addAll, subtractValues, compareValues } from "../units";
import { serializeValue } from "../values";
import type { EvaluationResult, InputResolver, RuntimeValue, SerializedRuntimeValue } from "../types";
import { CONTRACT_RUNTIME_VERSION } from "../version";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "../input/version";
import { hashOf } from "../input/identity";
import type { IRDefinition, IRRule, IRSharedCapacity } from "../../ir/types";
import { CAPACITY_GRAPH_VERSION } from "./version";
import { buildLedgerIndex, selectUsage, type LedgerIndex } from "./ledger";
import { ruleNodeId, sharedNodeId } from "./graph";
import type {
  CapacityAmount, CapacityBounds, CapacityComplexity, CapacityExplanation, CapacityGraph,
  CapacityLimitation, CapacityState, CapacityStateEntry, CapacityStatus, LedgerPolicy,
  LedgerUsageRecord, OverConsumption, SharedConstraintState, SnapshotBinding,
} from "./types";
import { CAPACITY_STATUS_PRECEDENCE, DEFAULT_LEDGER_POLICY } from "./types";

const L = { exprId: null, inputKeys: [] as string[] };
const ZERO_REASON = "no value was determined; this is not zero";

export interface EvaluateCapacityStateArgs {
  graph: CapacityGraph;
  rules: readonly IRRule[];
  sharedCapacities?: readonly IRSharedCapacity[];
  definitions?: readonly IRDefinition[];
  /** The Phase-4B strict resolver. Financial facts never come from anywhere else. */
  inputs: InputResolver;
  ledger?: readonly LedgerUsageRecord[];
  ledgerPolicy?: LedgerPolicy;
  asOf?: string | null;
}

const amountOf = (v: SerializedRuntimeValue | null, reason: string): CapacityAmount => {
  if (!v) return { kind: "NOT_DETERMINED", reason };
  if (v.type === "CAPACITY") {
    if (v.capacity.kind === "UNLIMITED") return { kind: "UNLIMITED", gate: v.capacity.gate };
    if (v.capacity.kind === "GATE_NOT_SATISFIED") return { kind: "GATE_NOT_SATISFIED" };
    return { kind: "AMOUNT", value: { type: "MONEY", amount: v.capacity.amount, currency: v.capacity.currency, lineage: v.lineage } };
  }
  return { kind: "AMOUNT", value: v };
};

const runtimeValueOf = (a: CapacityAmount): RuntimeValue | null =>
  a.kind === "AMOUNT" && a.value.type === "MONEY" ? { type: "MONEY", amount: rationalFromString(a.value.amount), currency: a.value.currency, lineage: L } : null;

const currencyOf = (a: CapacityAmount): string | null => (a.kind === "AMOUNT" && a.value.type === "MONEY" ? a.value.currency : null);

const worst = (statuses: CapacityStatus[]): CapacityStatus =>
  statuses.length === 0 ? "UNSUPPORTED" : statuses.reduce((a, b) => (CAPACITY_STATUS_PRECEDENCE[b] > CAPACITY_STATUS_PRECEDENCE[a] ? b : a));

/** Map a Phase-4A evaluation status onto a capacity status. Legal state is applied separately. */
const statusFromEvaluation = (e: EvaluationResult | null): CapacityStatus =>
  !e ? "UNSUPPORTED" : e.status === "EXECUTABLE" ? "AVAILABLE" : e.status === "NEEDS_INPUT" ? "NEEDS_INPUT" : e.status === "AMBIGUOUS" ? "AMBIGUOUS" : e.status === "UNSUPPORTED" ? "UNSUPPORTED" : "ERROR";

/**
 * Remaining = gross - usage, through the Phase-4A unit algebra.
 *
 * Unlimited minus a finite usage is still unlimited: a pool with no contractual ceiling is not
 * reduced by drawing on it. Over-consumption is reported, never clamped to zero.
 */
function computeRemaining(gross: CapacityAmount, usage: CapacityAmount, usageBlocked: boolean): { remaining: CapacityAmount; over: { deficit: SerializedRuntimeValue } | null; failure: string | null } {
  if (gross.kind === "UNLIMITED") return { remaining: gross, over: null, failure: null };
  if (gross.kind === "GATE_NOT_SATISFIED") return { remaining: gross, over: null, failure: null };
  if (gross.kind === "NOT_DETERMINED") return { remaining: gross, over: null, failure: null };
  // No applicable usage record is a determined zero: nothing was consumed. That is a different
  // fact from usage that could not be counted, which leaves remaining undetermined.
  if (usage.kind === "NOT_DETERMINED") return usageBlocked
    ? { remaining: { kind: "NOT_DETERMINED", reason: usage.reason }, over: null, failure: null }
    : { remaining: gross, over: null, failure: null };
  const g = runtimeValueOf(gross);
  const u = runtimeValueOf(usage);
  if (!g) return { remaining: { kind: "NOT_DETERMINED", reason: "gross capacity is not a money amount, so it cannot be reduced by usage" }, over: null, failure: null };
  if (!u) return { remaining: gross, over: null, failure: null };
  const out = subtractValues(g, u, { exprId: null, inputKeys: [] });
  if (!out.ok) return { remaining: { kind: "NOT_DETERMINED", reason: out.message }, over: null, failure: out.message };
  const remaining = serializeValue(out.value);
  const cmp = compareValues(out.value, { type: "MONEY", amount: rationalFromString("0"), currency: currencyOf(gross) ?? "", lineage: L });
  const negative = cmp.ok && cmp.cmp < 0;
  return { remaining: { kind: "AMOUNT", value: remaining }, over: negative ? { deficit: remaining } : null, failure: null };
}

/** The tighter of two amounts. Used to bound a member by its pool, never to allocate between them. */
function tighter(a: CapacityAmount, b: CapacityAmount): CapacityAmount {
  if (a.kind === "NOT_DETERMINED") return a;
  if (b.kind === "NOT_DETERMINED") return b;
  if (a.kind === "GATE_NOT_SATISFIED" || b.kind === "GATE_NOT_SATISFIED") return { kind: "GATE_NOT_SATISFIED" };
  if (a.kind === "UNLIMITED") return b;
  if (b.kind === "UNLIMITED") return a;
  const av = runtimeValueOf(a), bv = runtimeValueOf(b);
  if (!av || !bv) return { kind: "NOT_DETERMINED", reason: "one side is not a money amount, so the pair cannot be compared" };
  const cmp = compareValues(av, bv);
  if (!cmp.ok) return { kind: "NOT_DETERMINED", reason: cmp.message };
  return cmp.cmp <= 0 ? a : b;
}

export function evaluateCapacityState(args: EvaluateCapacityStateArgs): CapacityState {
  const { graph, inputs } = args;
  const asOf = args.asOf ?? null;
  const policy = args.ledgerPolicy ?? DEFAULT_LEDGER_POLICY;
  const { companyId, instrumentKey } = graph;
  const definitions = args.definitions ?? [];
  const ruleById = new Map(args.rules.filter((r) => r.companyId === companyId && r.instrumentKey === instrumentKey).map((r) => [r.ruleId, r]));
  const sharedById = new Map((args.sharedCapacities ?? []).filter((s) => s.companyId === companyId && s.instrumentKey === instrumentKey).map((s) => [s.sharedCapId, s]));
  const ledgerIndex: LedgerIndex = buildLedgerIndex(args.ledger ?? []);

  const complexity: CapacityComplexity = { nodesVisited: 0, edgesVisited: 0, expressionsEvaluated: 0, ledgerEntriesApplied: 0, ledgerEntriesConsidered: ledgerIndex.ordered.length, sharedConstraintsEvaluated: 0, maxDepth: 0, cacheHits: 0 };
  const stateLimitations: CapacityLimitation[] = [...graph.limitations];
  const snapshotIds = new Set<string>();
  const snapshotVersions = new Set<string>();
  const evaluations: EvaluationResult[] = [];

  const evaluate = (expression: Parameters<typeof evaluateExpression>[0]["expression"], context: Parameters<typeof evaluateExpression>[0]["context"]): EvaluationResult => {
    const r = evaluateExpression({ expression, inputs, context });
    complexity.expressionsEvaluated++;
    complexity.maxDepth = Math.max(complexity.maxDepth, r.stats.maxDepth);
    complexity.cacheHits += r.stats.cacheHits;
    evaluations.push(r);
    for (const u of r.provenance.inputsUsed) {
      if (u.provenance.snapshotId) snapshotIds.add(u.provenance.snapshotId);
      if (u.provenance.snapshotVersion) snapshotVersions.add(u.provenance.snapshotVersion);
    }
    return r;
  };

  // ---- shared capacity pools ---------------------------------------------
  const memberEdges = graph.edges.filter((e) => e.kind === "MEMBER_OF_SHARED_CAP");
  const sharedConstraints: SharedConstraintState[] = [];
  for (const node of graph.nodes.filter((n) => n.kind === "SHARED_CAPACITY")) {
    complexity.nodesVisited++;
    complexity.sharedConstraintsEvaluated++;
    const cap = sharedById.get(node.sharedCapacityId!);
    const limitations: CapacityLimitation[] = [];
    if (!cap) {
      sharedConstraints.push({ sharedCapacityId: node.sharedCapacityId!, capacityNodeId: node.capacityNodeId, status: "UNSUPPORTED", grossCapacity: { kind: "NOT_DETERMINED", reason: "no shared-capacity resource supplied for this node" }, usage: { kind: "NOT_DETERMINED", reason: ZERO_REASON }, remaining: { kind: "NOT_DETERMINED", reason: ZERO_REASON }, memberRuleIds: [], memberUsage: [], directUsageIds: [], limitations: [{ code: "SHARED_CAPACITY_NOT_QUANTIFIED", message: `shared capacity ${node.sharedCapacityId} has no resource definition`, refs: [node.capacityNodeId] }], evaluation: null });
      continue;
    }
    const evaluation = evaluate(cap.capExpression, { companyId, instrumentKey, asOf });
    const gross = amountOf(evaluation.value, evaluation.status === "NEEDS_INPUT" ? "a financial fact the shared cap depends on is missing" : `shared cap not evaluable: ${evaluation.status}`);
    const currency = currencyOf(gross);
    const memberRuleIds = [...cap.memberRuleIds].sort();

    // Usage against the pool: every member's own usage plus usage recorded directly against the pool.
    const memberUsage: SharedConstraintState["memberUsage"] = [];
    const contributing: RuntimeValue[] = [];
    const contributingIds: string[] = [];
    let blocked: CapacityLimitation | null = null;
    for (const ruleId of memberRuleIds) {
      const r = selectUsage(ledgerIndex, { companyId, instrumentKey, target: { kind: "RULE", ruleId }, asOf, currency }, policy);
      complexity.ledgerEntriesApplied += r.applied.length;
      if (r.blocked) { blocked = blocked ?? { code: r.blocked.code === "AMBIGUOUS_CONSUMPTION_ALLOCATION" ? "AMBIGUOUS_CONSUMPTION_ALLOCATION" : "CURRENCY_MISMATCH_NO_CONVERSION_MODELED", message: r.blocked.message, refs: r.blocked.usageIds }; }
      memberUsage.push({ ruleId, usage: r.total ? { kind: "AMOUNT", value: r.total } : { kind: "NOT_DETERMINED", reason: r.blocked ? r.blocked.message : "no usage recorded against this member" }, usageIds: r.applied.map((u) => u.usageId) });
      for (const u of r.applied) { contributing.push({ type: "MONEY", amount: rationalFromString(u.amount.amount), currency: u.amount.currency, lineage: L }); contributingIds.push(u.usageId); }
    }
    const direct = selectUsage(ledgerIndex, { companyId, instrumentKey, target: { kind: "SHARED_CAPACITY", sharedCapacityId: cap.sharedCapId }, asOf, currency }, policy);
    complexity.ledgerEntriesApplied += direct.applied.length;
    if (direct.blocked) blocked = blocked ?? { code: direct.blocked.code === "AMBIGUOUS_CONSUMPTION_ALLOCATION" ? "AMBIGUOUS_CONSUMPTION_ALLOCATION" : "CURRENCY_MISMATCH_NO_CONVERSION_MODELED", message: direct.blocked.message, refs: direct.blocked.usageIds };
    for (const u of direct.applied) { contributing.push({ type: "MONEY", amount: rationalFromString(u.amount.amount), currency: u.amount.currency, lineage: L }); contributingIds.push(u.usageId); }

    let usage: CapacityAmount = { kind: "NOT_DETERMINED", reason: "no usage recorded against this shared capacity" };
    if (blocked) {
      limitations.push(blocked);
    } else if (contributing.length > 0) {
      // Summed through the Phase-4A unit algebra, which rejects a mixed-currency pool outright
      // rather than converting. Phase 4C owns no arithmetic of its own.
      const summed = addAll(contributing, { exprId: null, inputKeys: contributingIds });
      if (!summed.ok) limitations.push({ code: "CURRENCY_MISMATCH_NO_CONVERSION_MODELED", message: summed.message, refs: contributingIds.sort() });
      else usage = { kind: "AMOUNT", value: serializeValue(summed.value) };
    }

    const { remaining, over } = computeRemaining(gross, usage, blocked !== null);
    if (over) limitations.push({ code: "OVER_CONSUMPTION", message: `recorded usage exceeds the shared capacity`, refs: [node.capacityNodeId, ...contributingIds] });
    const status = worst([statusFromEvaluation(evaluation), ...limitations.map((l) => (l.code === "AMBIGUOUS_CONSUMPTION_ALLOCATION" ? "AMBIGUOUS" as CapacityStatus : l.code === "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" ? "ERROR" as CapacityStatus : "REVIEW_REQUIRED" as CapacityStatus))]);
    sharedConstraints.push({ sharedCapacityId: cap.sharedCapId, capacityNodeId: node.capacityNodeId, status, grossCapacity: gross, usage, remaining, memberRuleIds, memberUsage, directUsageIds: direct.applied.map((u) => u.usageId).sort(), limitations, evaluation });
  }
  sharedConstraints.sort((a, b) => (a.sharedCapacityId < b.sharedCapacityId ? -1 : 1));
  const sharedById2 = new Map(sharedConstraints.map((s) => [s.capacityNodeId, s]));

  // ---- rule capacities ----------------------------------------------------
  const capacities: CapacityStateEntry[] = [];
  const explanations: CapacityExplanation[] = [];
  for (const node of graph.nodes.filter((n) => n.kind === "RULE_CAPACITY")) {
    complexity.nodesVisited++;
    const rule = ruleById.get(node.ruleId!);
    const limitations: CapacityLimitation[] = [];
    if (!rule || !rule.capacityExpression) {
      capacities.push({ capacityNodeId: node.capacityNodeId, ruleId: node.ruleId!, status: "UNSUPPORTED", grossCapacity: { kind: "NOT_DETERMINED", reason: "rule has no capacity expression" }, usage: { kind: "NOT_DETERMINED", reason: ZERO_REASON }, remaining: { kind: "NOT_DETERMINED", reason: ZERO_REASON }, effectiveRemaining: { kind: "NOT_DETERMINED", reason: ZERO_REASON }, bounds: null, overConsumption: null, sharedConstraintIds: [], entityScope: node.entityScope, phase3: node.phase3 ?? { sufficiency: "UNSUPPORTED", sufficiencyReasons: [] }, provisional: null, limitations, usageSelection: [], appliedUsageIds: [], missingInputKeys: [], evaluation: null, componentRoles: [] });
      continue;
    }

    // The Phase-3 legal state is read first; it can only ever make the answer weaker.
    const blockedByPhase3 = rule.sufficiency === "AMBIGUOUS" || rule.sufficiency === "MISSING_CONTEXT" || rule.sufficiency === "CONFLICTED";
    const reviewRequired = rule.sufficiency === "PARTIAL" || node.entityScope?.safeToRely === false;
    if (blockedByPhase3) limitations.push({ code: "PHASE3_RULE_AMBIGUOUS", message: `Phase 3 marks this rule ${rule.sufficiency}: ${rule.sufficiencyReasons.join("; ") || "no reason recorded"}`, refs: [node.capacityNodeId] });
    if (rule.sufficiency === "PARTIAL") limitations.push({ code: "PHASE3_RULE_NOT_SAFE_TO_RELY_ON", message: `Phase 3 represents this rule only partially: ${rule.sufficiencyReasons.join("; ") || "no reason recorded"}`, refs: [node.capacityNodeId] });
    if (node.entityScope?.applicability === "SCOPE_NOT_SAFE_TO_RELY_ON") limitations.push({ code: "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON", message: "the Phase-3 entity-scope guard marked this rule's scope not safe to rely on; the capacity is not attributed to a specific entity set", refs: [node.capacityNodeId] });
    if (node.entityScope?.applicability === "SCOPE_UNSPECIFIED") limitations.push({ code: "ENTITY_SCOPE_UNSPECIFIED", message: "the rule's entity scope is unspecified; the capacity is not attributed to a specific entity set", refs: [node.capacityNodeId] });

    const evaluation = evaluate(rule.capacityExpression, { companyId, instrumentKey, asOf, ruleId: rule.ruleId });
    const gross = amountOf(evaluation.value, evaluation.status === "NEEDS_INPUT" ? "a financial fact this capacity depends on is missing" : `capacity not evaluable: ${evaluation.status}`);
    if (evaluation.status === "NEEDS_INPUT") limitations.push({ code: "MISSING_FINANCIAL_INPUT", message: `missing: ${evaluation.missingInputKeys.join(", ")}`, refs: evaluation.missingInputKeys });
    if (evaluation.status === "UNSUPPORTED") limitations.push({ code: "UNSUPPORTED_EXPRESSION", message: evaluation.diagnostics.map((d) => d.message)[0] ?? "the capacity expression contains a node Phase 3 could not represent", refs: [node.capacityNodeId] });

    const currency = currencyOf(gross);
    const usageResult = selectUsage(ledgerIndex, { companyId, instrumentKey, target: { kind: "RULE", ruleId: rule.ruleId }, asOf, currency }, policy);
    complexity.ledgerEntriesApplied += usageResult.applied.length;
    if (usageResult.blocked) {
      limitations.push({
        code: usageResult.blocked.code === "AMBIGUOUS_CONSUMPTION_ALLOCATION" ? "AMBIGUOUS_CONSUMPTION_ALLOCATION" : "CURRENCY_MISMATCH_NO_CONVERSION_MODELED",
        message: usageResult.blocked.message, refs: usageResult.blocked.usageIds,
      });
    }
    const usage: CapacityAmount = usageResult.total ? { kind: "AMOUNT", value: usageResult.total } : { kind: "NOT_DETERMINED", reason: usageResult.blocked ? usageResult.blocked.message : "no usage recorded against this capacity" };

    const { remaining, over } = computeRemaining(gross, usage, usageResult.blocked !== null);
    const overConsumption: OverConsumption | null = over ? { gross, usage, deficit: over.deficit, usageIds: usageResult.applied.map((u) => u.usageId) } : null;
    if (over) limitations.push({ code: "OVER_CONSUMPTION", message: "recorded usage exceeds the contractual capacity; the remaining figure is negative and is not clamped", refs: [node.capacityNodeId] });

    // Shared constraints bound the member. This reports what the pool leaves, not an allocation.
    complexity.edgesVisited += memberEdges.length;
    const myShared = memberEdges.filter((e) => e.from === node.capacityNodeId).map((e) => sharedById2.get(e.to)).filter((s): s is SharedConstraintState => Boolean(s));
    let effectiveRemaining = remaining;
    for (const s of myShared) effectiveRemaining = tighter(effectiveRemaining, s.remaining);
    for (const s of myShared) for (const l of s.limitations) if (!limitations.some((x) => x.code === l.code && x.message === l.message)) limitations.push(l);

    const bounds: CapacityBounds | null = evaluation.bounds ?? null;
    const statuses: CapacityStatus[] = [statusFromEvaluation(evaluation)];
    if (blockedByPhase3) statuses.push("AMBIGUOUS");
    if (reviewRequired) statuses.push("REVIEW_REQUIRED");
    if (limitations.some((l) => l.code === "AMBIGUOUS_CONSUMPTION_ALLOCATION")) statuses.push("AMBIGUOUS");
    if (limitations.some((l) => l.code === "CURRENCY_MISMATCH_NO_CONVERSION_MODELED")) statuses.push("ERROR");
    if (over) statuses.push("REVIEW_REQUIRED");
    for (const s of myShared) if (s.status !== "AVAILABLE") statuses.push(s.status);
    const status = worst(statuses);

    // A capacity whose legal state needs review keeps its arithmetic, but separately, so it can
    // never be read as authoritative headroom.
    const provisional = status === "REVIEW_REQUIRED" || status === "AMBIGUOUS" ? { grossCapacity: gross, remaining } : null;
    const published = status === "REVIEW_REQUIRED" || status === "AMBIGUOUS"
      ? { gross: { kind: "NOT_DETERMINED" as const, reason: "the legal state of this rule is not safe to rely on; the computed arithmetic is reported under `provisional`" }, remaining: { kind: "NOT_DETERMINED" as const, reason: "the legal state of this rule is not safe to rely on" } }
      : { gross, remaining };
    const publishedEffective = status === "REVIEW_REQUIRED" || status === "AMBIGUOUS" ? published.remaining : effectiveRemaining;

    limitations.sort((a, b) => (`${a.code}|${a.message}` < `${b.code}|${b.message}` ? -1 : 1));
    const entry: CapacityStateEntry = {
      capacityNodeId: node.capacityNodeId, ruleId: rule.ruleId, status,
      grossCapacity: published.gross, usage, remaining: published.remaining, effectiveRemaining: publishedEffective,
      bounds, overConsumption, sharedConstraintIds: myShared.map((s) => s.sharedCapacityId).sort(),
      entityScope: node.entityScope, phase3: { sufficiency: rule.sufficiency, sufficiencyReasons: rule.sufficiencyReasons },
      provisional, limitations, usageSelection: usageResult.selection, appliedUsageIds: usageResult.applied.map((u) => u.usageId).sort(),
      missingInputKeys: evaluation.missingInputKeys, evaluation,
      componentRoles: graph.nodes.filter((n) => n.ruleId === rule.ruleId && n.componentRole !== null).map((n) => ({ capacityNodeId: n.capacityNodeId, exprId: n.expressionId, role: n.componentRole! })),
    };
    capacities.push(entry);
    explanations.push({
      capacityNodeId: node.capacityNodeId, ruleId: rule.ruleId,
      grossCapacity: entry.grossCapacity, lessUsage: entry.usage,
      sharedConstraints: myShared.map((s) => ({ sharedCapacityId: s.sharedCapacityId, remaining: s.remaining })),
      effectiveRemaining: entry.effectiveRemaining, limitations: entry.limitations,
      inputsUsed: evaluation.provenance.inputsUsed,
      sourceRules: [{ ruleId: rule.ruleId, sourceSectionRef: rule.sourceSectionRef, sourceCitation: rule.provenance?.sourceCitation ?? null }],
      ledgerEntries: usageResult.applied,
      calculationTrace: evaluation.trace,
    });
  }
  capacities.sort((a, b) => (a.capacityNodeId < b.capacityNodeId ? -1 : 1));
  explanations.sort((a, b) => (a.capacityNodeId < b.capacityNodeId ? -1 : 1));

  if (!ledgerIndex.safe) stateLimitations.push({ code: "LEDGER_SET_UNSAFE", message: `the ledger is not safe to reduce against: ${ledgerIndex.issues.map((i) => i.code).join(", ")}`, refs: ledgerIndex.issues.flatMap((i) => i.usageIds) });

  const snapshotBinding: SnapshotBinding = {
    snapshotIds: [...snapshotIds].sort(),
    snapshotVersions: [...snapshotVersions].sort(),
    snapshotSetHash: snapshotIds.size > 0 ? hashOf([...snapshotIds].sort()) : null,
    inputContractVersion: evaluations.find((e) => e.provenance.inputContractVersion)?.provenance.inputContractVersion ?? null,
    ambiguous: snapshotIds.size > 1,
  };
  if (snapshotBinding.ambiguous) stateLimitations.push({ code: "SNAPSHOT_BINDING_AMBIGUOUS", message: `financial inputs came from more than one snapshot (${[...snapshotIds].sort().join(", ")}); the Phase-4B contract does not establish that they may coexist`, refs: [...snapshotIds].sort() });

  stateLimitations.sort((a, b) => (`${a.code}|${a.message}` < `${b.code}|${b.message}` ? -1 : 1));
  const body = {
    capacityGraphVersion: CAPACITY_GRAPH_VERSION,
    runtimeVersion: CONTRACT_RUNTIME_VERSION,
    inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    companyId, instrumentKey, asOf,
    graphHash: graph.graphHash,
    capacities, sharedConstraints, explanations,
    ledgerIssues: ledgerIndex.issues,
    snapshotBinding,
    limitations: stateLimitations,
    cycles: graph.cycles,
    complexity,
    notComputed: {
      permissionSelection: "NOT_COMPUTED_IN_PHASE_4C" as const,
      maximumTransactionAmount: "NOT_COMPUTED_IN_PHASE_4C" as const,
      allocationAcrossCapacities: "NOT_COMPUTED_IN_PHASE_4C" as const,
      transactionSimulation: "NOT_COMPUTED_IN_PHASE_4C" as const,
      totalCombinedHeadroom: "NOT_COMPUTED_IN_PHASE_4C" as const,
    },
  };
  // The hash covers the state's meaning, not its measurement counters.
  return { ...body, stateHash: hashOf({ ...body, complexity: undefined, explanations: undefined }) };
}
