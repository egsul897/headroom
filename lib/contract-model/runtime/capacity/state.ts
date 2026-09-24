/**
 * PHASE 4C - deterministic capacity state (remediated).
 *
 * Gross capacity comes from the Phase-4A evaluator over the Phase-3 expression, resolved through
 * the Phase-4B strict resolver. Remaining is gross minus usage through the Phase-4A unit algebra.
 * Nothing here re-implements arithmetic, and nothing here decides which capacity a transaction
 * should use.
 *
 * Remediation invariants:
 *   R8  legal state dominates arithmetic through one exhaustive table over every Phase-3
 *       sufficiency value; an unsafe entity scope is REVIEW_REQUIRED; arithmetic can never upgrade
 *       a legal state, only be reported under `provisional`;
 *   R9  a capacity that shares with something no quantified pool backs is never authoritative
 *       AVAILABLE; its effective remaining is NOT_DETERMINED and its local arithmetic provisional;
 *   R10 usage whose attribution is missing or ambiguous fails the capacities it could touch closed;
 *   R11 snapshot binding is ambiguous only on an actual Phase-4B conflict, never on set size;
 *   R13 the ledger is indexed once and selection is memoized per (path, currency); membership and
 *       component lookups are indexed; the operation counters below are the complexity proof.
 */
import type { RuntimeVerificationEnvelope, VerificationGatePolicy } from "../verification-envelope";
import { assessUnit, capacityVerificationFloor, gateIsActive, verificationBlocksIn, verificationIncompleteIn, VERIFICATION_DOMINANCE } from "../verification-gate";
import { rationalFromString } from "../decimal";
import { evaluateExpression } from "../evaluate-expression";
import { addAll, subtractValues, compareValues } from "../units";
import { serializeValue } from "../values";
import type { EvaluationResult, InputResolver, RuntimeValue, SerializedRuntimeValue } from "../types";
import { CONTRACT_RUNTIME_VERSION } from "../version";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "../input/version";
import { hashOf } from "../input/identity";
import type { IRDefinition, IRRule, IRSharedCapacity, RepresentationSufficiency } from "../../ir/types";
import { CAPACITY_GRAPH_VERSION } from "./version";
import { buildLedgerIndex, pathKeyOf, selectUsage, type LedgerIndex, type UsageResult } from "./ledger";
import type {
  CapacityAmount, CapacityBounds, CapacityComplexity, CapacityExplanation, CapacityGraph,
  CapacityLimitation, CapacityLimitationCode, CapacityNode, CapacityPathRef, CapacityState, CapacityStateEntry,
  CapacityStatus, LedgerPolicy, LedgerUsageRecord, OverConsumption, SharedConstraintState, SnapshotBinding,
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
  /** PHASE-4 VERIFICATION GATE: the envelope. Every expression evaluated here is gated against it, and VERIFICATION_DOMINANCE floors each capacity. */
  verification?: RuntimeVerificationEnvelope;
  /** PHASE-4 VERIFICATION GATE: ALLOW_MISSING (default) or REQUIRE. */
  policy?: VerificationGatePolicy;
}

// ---------------------------------------------------------------------------
// Legal-state dominance (R8)
// ---------------------------------------------------------------------------

/**
 * What each Phase-3 sufficiency value does to a capacity, exhaustively. `Record` over the union
 * makes a missing value a compile error; a value outside the union at runtime (untrusted JSON)
 * falls to the fail-closed default below. `status` is the FLOOR the capacity's status can never
 * fall under; `null` means the legal state imposes none.
 */
export const SUFFICIENCY_DOMINANCE: Record<RepresentationSufficiency, { status: CapacityStatus | null; limitation: CapacityLimitationCode | null }> = {
  COMPLETE: { status: null, limitation: null },
  PARTIAL: { status: "REVIEW_REQUIRED", limitation: "PHASE3_RULE_NOT_SAFE_TO_RELY_ON" },
  AMBIGUOUS: { status: "AMBIGUOUS", limitation: "PHASE3_RULE_AMBIGUOUS" },
  MISSING_CONTEXT: { status: "AMBIGUOUS", limitation: "PHASE3_RULE_AMBIGUOUS" },
  CONFLICTED: { status: "AMBIGUOUS", limitation: "PHASE3_RULE_AMBIGUOUS" },
  UNSUPPORTED: { status: "UNSUPPORTED", limitation: "PHASE3_RULE_UNSUPPORTED" },
};
const UNKNOWN_SUFFICIENCY = { status: "UNSUPPORTED" as CapacityStatus, limitation: "PHASE3_RULE_UNSUPPORTED" as CapacityLimitationCode };

/**
 * PHASE-4 VERIFICATION GATE: the second dominance table lives in ../verification-gate.ts as
 * VERIFICATION_DOMINANCE and is re-exported here so the two tables can be read side by side. They
 * are NOT merged: sufficiency asks whether the rule is fully REPRESENTED, verification asks whether
 * what it represents is SUPPORTED. Their outputs meet only in the worst-of over
 * CAPACITY_STATUS_PRECEDENCE below, so neither can lower the other's floor and arithmetic can lift
 * neither.
 */
export { VERIFICATION_DOMINANCE };

/** The status floor each limitation code imposes. One table, used for pools and capacities alike. */
export const LIMITATION_STATUS_FLOOR: Record<CapacityLimitationCode, CapacityStatus> = {
  PHASE3_RULE_NOT_SAFE_TO_RELY_ON: "REVIEW_REQUIRED",
  PHASE3_RULE_AMBIGUOUS: "AMBIGUOUS",
  PHASE3_RULE_UNSUPPORTED: "UNSUPPORTED",
  ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON: "REVIEW_REQUIRED",
  ENTITY_SCOPE_UNSPECIFIED: "AVAILABLE",
  MISSING_FINANCIAL_INPUT: "NEEDS_INPUT",
  AMBIGUOUS_FINANCIAL_INPUT: "AMBIGUOUS",
  UNSUPPORTED_EXPRESSION: "UNSUPPORTED",
  AMBIGUOUS_CONSUMPTION_ALLOCATION: "AMBIGUOUS",
  ALLOCATION_INFORMATION_MISSING: "AMBIGUOUS",
  DUPLICATE_LEDGER_USAGE_IDENTITY: "AMBIGUOUS",
  USAGE_NOT_ATTRIBUTABLE_IN_GRAPH: "AMBIGUOUS",
  OVER_CONSUMPTION: "REVIEW_REQUIRED",
  CURRENCY_MISMATCH_NO_CONVERSION_MODELED: "ERROR",
  SHARED_CAPACITY_NOT_QUANTIFIED: "REVIEW_REQUIRED",
  SHARED_CAPACITY_CYCLE: "REVIEW_REQUIRED",
  CAPACITY_GRAPH_CYCLE: "REVIEW_REQUIRED",
  LEDGER_SET_UNSAFE: "REVIEW_REQUIRED",
  DUPLICATE_USAGE_ID: "AMBIGUOUS",
  DUPLICATE_SHARED_CAPACITY_IDENTITY: "UNSUPPORTED",
  DUPLICATE_RULE_IDENTITY: "UNSUPPORTED",
  RECLASSIFICATION_NOT_EXECUTABLE: "REVIEW_REQUIRED",
  SNAPSHOT_BINDING_AMBIGUOUS: "AMBIGUOUS",
  USAGE_AMOUNT_NOT_REPRESENTABLE: "REVIEW_REQUIRED",
  // The weaker of the two verification floors; a NODE hit adds its UNSUPPORTED floor through VERIFICATION_DOMINANCE.
  PHASE3_VERIFICATION_MATERIAL_FINDING: "REVIEW_REQUIRED",
  PHASE3_VERIFICATION_INCOMPLETE: "REVIEW_REQUIRED",
};

/** Statuses under which published amounts are withheld and the arithmetic goes to `provisional`. */
const NON_AUTHORITATIVE: readonly CapacityStatus[] = ["REVIEW_REQUIRED", "AMBIGUOUS"];

// ---------------------------------------------------------------------------
// Amount helpers (no arithmetic of their own)
// ---------------------------------------------------------------------------

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

const sortLimitations = (ls: CapacityLimitation[]) => ls.sort((a, b) => (`${a.code}|${a.message}` < `${b.code}|${b.message}` ? -1 : 1));

/** A usage block from the ledger layer, as a capacity limitation. UNIT_FAILURE is a unit-algebra refusal. */
const blockLimitation = (b: NonNullable<UsageResult["blocked"]>): CapacityLimitation =>
  ({ code: b.code === "UNIT_FAILURE" ? "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" : b.code, message: b.message, refs: [...b.usageIds].sort() });

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

/** Group by key in one pass. Duplicate keys are kept as a group, so identity collisions are visible. */
function groupBy<T>(xs: readonly T[], key: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of xs) { const g = m.get(key(x)) ?? []; g.push(x); m.set(key(x), g); }
  return m;
}

// ---------------------------------------------------------------------------
// The state
// ---------------------------------------------------------------------------

export function evaluateCapacityState(args: EvaluateCapacityStateArgs): CapacityState {
  const { graph, inputs } = args;
  const asOf = args.asOf ?? null;
  const policy = args.ledgerPolicy ?? DEFAULT_LEDGER_POLICY;
  const { companyId, instrumentKey } = graph;
  const gateActive = gateIsActive(args.verification, args.policy);

  // Identity: unique or refused (R7). A rule or pool id claimed twice among the supplied resources
  // resolves to nothing, never to whichever came last into a Map.
  const rulesById = groupBy(args.rules.filter((r) => r.companyId === companyId && r.instrumentKey === instrumentKey), (r) => r.ruleId);
  const sharedById = groupBy((args.sharedCapacities ?? []).filter((s) => s.companyId === companyId && s.instrumentKey === instrumentKey), (s) => s.sharedCapId);
  const ledgerIndex: LedgerIndex = buildLedgerIndex(args.ledger ?? [], { companyId, instrumentKey });

  const complexity: CapacityComplexity = {
    nodesVisited: 0, edgesVisited: 0, expressionsEvaluated: 0,
    ledgerEntriesApplied: 0, ledgerEntriesConsidered: ledgerIndex.ordered.length, ledgerEntriesExamined: 0,
    sharedConstraintsEvaluated: 0, sharedResourceLookups: 0, dependencyLookups: 0, indexLookups: 0,
    maxDepth: 0, cacheHits: 0,
  };
  const stateLimitations: CapacityLimitation[] = [...graph.limitations];
  const snapshotIds = new Set<string>();
  const snapshotVersions = new Set<string>();
  const evaluations: EvaluationResult[] = [];
  const conflictingInputKeys = new Set<string>();
  let snapshotConflict = false;

  // exprId -> reference key, from the graph's own manifest, so an ambiguity diagnostic names its fact.
  const keyByExprId = new Map<string, string>();
  for (const d of graph.dependencyManifest.dependencies) for (const e of d.exprIds) if (!keyByExprId.has(e)) keyByExprId.set(e, d.key);

  const evaluate = (expression: Parameters<typeof evaluateExpression>[0]["expression"], context: Parameters<typeof evaluateExpression>[0]["context"]): EvaluationResult => {
    const r = evaluateExpression({ expression, inputs, context, verification: args.verification, policy: args.policy });
    complexity.expressionsEvaluated++;
    complexity.maxDepth = Math.max(complexity.maxDepth, r.stats.maxDepth);
    complexity.cacheHits += r.stats.cacheHits;
    evaluations.push(r);
    for (const u of r.provenance.inputsUsed) {
      if (u.provenance.snapshotId) snapshotIds.add(u.provenance.snapshotId);
      if (u.provenance.snapshotVersion) snapshotVersions.add(u.provenance.snapshotVersion);
    }
    // An actual conflict is a Phase-4B AMBIGUOUS_INPUT or SNAPSHOT_SET_UNSAFE outcome, nothing else (R11).
    for (const d of r.diagnostics) {
      if (d.code !== "AMBIGUOUS_INPUT" && d.code !== "SNAPSHOT_SET_UNSAFE") continue;
      snapshotConflict = true;
      conflictingInputKeys.add((d.exprId && keyByExprId.get(d.exprId)) ?? d.message);
    }
    return r;
  };

  /** The reference keys an evaluation found ambiguous, for the capacity's own limitation. */
  const ambiguousKeysOf = (r: EvaluationResult): string[] =>
    [...new Set(r.diagnostics.filter((d) => d.code === "AMBIGUOUS_INPUT" || d.code === "SNAPSHOT_SET_UNSAFE").map((d) => (d.exprId && keyByExprId.get(d.exprId)) ?? d.message))].sort();

  // Usage selection is memoized per (capacity path, currency). A pool that re-reads its members'
  // usage hits the cache; the ledger bucket for a path is walked once per currency asked (R13).
  const usageCache = new Map<string, UsageResult>();
  const getUsage = (target: CapacityPathRef, currency: string | null): UsageResult => {
    const key = `${pathKeyOf(target)}|${currency ?? ""}`;
    complexity.indexLookups++;
    const hit = usageCache.get(key);
    if (hit) { complexity.cacheHits++; return hit; }
    const r = selectUsage(ledgerIndex, { target, asOf, currency }, policy);
    complexity.ledgerEntriesExamined += r.examined;
    complexity.ledgerEntriesApplied += r.applied.length;
    usageCache.set(key, r);
    return r;
  };

  // Membership and components, indexed once from the graph rather than filtered per node.
  const poolsByMember = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.kind !== "MEMBER_OF_SHARED_CAP") continue;
    const l = poolsByMember.get(e.from) ?? []; l.push(e.to); poolsByMember.set(e.from, l);
  }
  const componentsByRule = new Map<string, CapacityNode[]>();
  const ruleNodes: CapacityNode[] = [];
  const poolNodes: CapacityNode[] = [];
  for (const n of graph.nodes) {
    if (n.kind === "RULE_CAPACITY") ruleNodes.push(n);
    else if (n.kind === "SHARED_CAPACITY") poolNodes.push(n);
    else if (n.componentRole !== null && n.ruleId) { const l = componentsByRule.get(n.ruleId) ?? []; l.push(n); componentsByRule.set(n.ruleId, l); }
  }

  // ---- shared capacity pools ---------------------------------------------
  const sharedConstraints: SharedConstraintState[] = [];
  for (const node of poolNodes) {
    complexity.nodesVisited++;
    complexity.sharedConstraintsEvaluated++;
    complexity.dependencyLookups++;
    const claimants = sharedById.get(node.sharedCapacityId!) ?? [];
    const limitations: CapacityLimitation[] = [];
    const undeterminedPool = (status: CapacityStatus, reason: string, limitation: CapacityLimitation): SharedConstraintState =>
      ({ sharedCapacityId: node.sharedCapacityId!, capacityNodeId: node.capacityNodeId, status, grossCapacity: { kind: "NOT_DETERMINED", reason }, usage: { kind: "NOT_DETERMINED", reason: ZERO_REASON }, remaining: { kind: "NOT_DETERMINED", reason: ZERO_REASON }, memberRuleIds: [], memberUsage: [], directUsageIds: [], limitations: [limitation], evaluation: null });
    if (claimants.length === 0) {
      sharedConstraints.push(undeterminedPool("UNSUPPORTED", "no shared-capacity resource supplied for this node", { code: "SHARED_CAPACITY_NOT_QUANTIFIED", message: `shared capacity ${node.sharedCapacityId} has no resource definition`, refs: [node.capacityNodeId] }));
      continue;
    }
    if (claimants.length > 1) {
      sharedConstraints.push(undeterminedPool("UNSUPPORTED", "more than one resource claims this shared-capacity id; none is chosen", { code: "DUPLICATE_SHARED_CAPACITY_IDENTITY", message: `shared capacity id ${node.sharedCapacityId} is claimed by ${claimants.length} resources; nothing is chosen between them and the pool is not quantified`, refs: [node.capacityNodeId] }));
      continue;
    }
    const cap = claimants[0]!;
    const evaluation = evaluate(cap.capExpression, { companyId, instrumentKey, asOf });
    const gross = amountOf(evaluation.value, evaluation.status === "NEEDS_INPUT" ? "a financial fact the shared cap depends on is missing" : `shared cap not evaluable: ${evaluation.status}`);
    // PHASE-4 VERIFICATION GATE: a pool is not a verifiable unit, but its cap may expand into one, and
    // under REQUIRE the pool itself is unverified. A refusal is reported as what it is, not as an
    // ambiguous financial fact.
    const poolBlocks = gateActive ? verificationBlocksIn(evaluation) : [];
    if (poolBlocks.length > 0) limitations.push({ code: "PHASE3_VERIFICATION_MATERIAL_FINDING", message: `[${poolBlocks[0]!.reason}] ${poolBlocks[0]!.message}`, refs: [node.capacityNodeId, ...new Set(poolBlocks.flatMap((b) => b.findingIds))].sort() });
    if (gateActive && verificationIncompleteIn(evaluation)) limitations.push({ code: "PHASE3_VERIFICATION_INCOMPLETE", message: "a unit this shared cap depends on was not completely verified; the pool is reviewable, not defective", refs: [node.capacityNodeId] });
    if (evaluation.status === "AMBIGUOUS" && !(poolBlocks.length > 0 && ambiguousKeysOf(evaluation).length === 0)) limitations.push({ code: "AMBIGUOUS_FINANCIAL_INPUT", message: `a financial fact the shared cap depends on resolved ambiguously: ${ambiguousKeysOf(evaluation).join(", ")}`, refs: ambiguousKeysOf(evaluation) });
    const currency = currencyOf(gross);
    const memberRuleIds = [...new Set(cap.memberRuleIds)].sort();

    // Usage against the pool: every member's own usage plus usage recorded directly against the pool.
    const memberUsage: SharedConstraintState["memberUsage"] = [];
    const contributing: RuntimeValue[] = [];
    const contributingIds: string[] = [];
    let blocked: CapacityLimitation | null = null;
    for (const ruleId of memberRuleIds) {
      const r = getUsage({ kind: "RULE", ruleId }, currency);
      if (r.blocked) blocked = blocked ?? blockLimitation(r.blocked);
      memberUsage.push({ ruleId, usage: r.total ? { kind: "AMOUNT", value: r.total } : { kind: "NOT_DETERMINED", reason: r.blocked ? r.blocked.message : "no usage recorded against this member" }, usageIds: r.applied.map((u) => u.usageId) });
      for (const u of r.applied) { contributing.push({ type: "MONEY", amount: rationalFromString(u.amount.amount), currency: u.amount.currency, lineage: L }); contributingIds.push(u.usageId); }
    }
    const direct = getUsage({ kind: "SHARED_CAPACITY", sharedCapacityId: cap.sharedCapId }, currency);
    if (direct.blocked) blocked = blocked ?? blockLimitation(direct.blocked);
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
    const status = worst([statusFromEvaluation(evaluation), ...limitations.map((l) => LIMITATION_STATUS_FLOOR[l.code])]);
    sharedConstraints.push({ sharedCapacityId: cap.sharedCapId, capacityNodeId: node.capacityNodeId, status, grossCapacity: gross, usage, remaining, memberRuleIds, memberUsage, directUsageIds: direct.applied.map((u) => u.usageId).sort(), limitations: sortLimitations(limitations), evaluation });
  }
  sharedConstraints.sort((a, b) => (a.sharedCapacityId < b.sharedCapacityId ? -1 : 1));
  const poolByNodeId = new Map(sharedConstraints.map((s) => [s.capacityNodeId, s]));

  // ---- rule capacities ----------------------------------------------------
  const capacities: CapacityStateEntry[] = [];
  const explanations: CapacityExplanation[] = [];
  for (const node of ruleNodes) {
    complexity.nodesVisited++;
    complexity.dependencyLookups++;
    const claimants = rulesById.get(node.ruleId!) ?? [];
    const limitations: CapacityLimitation[] = [];
    const undeterminedEntry = (reason: string): CapacityStateEntry => ({
      capacityNodeId: node.capacityNodeId, ruleId: node.ruleId!, status: "UNSUPPORTED",
      grossCapacity: { kind: "NOT_DETERMINED", reason }, usage: { kind: "NOT_DETERMINED", reason: ZERO_REASON }, remaining: { kind: "NOT_DETERMINED", reason: ZERO_REASON }, effectiveRemaining: { kind: "NOT_DETERMINED", reason: ZERO_REASON },
      bounds: null, overConsumption: null, sharedConstraintIds: [], entityScope: node.entityScope, phase3: node.phase3 ?? { sufficiency: "UNSUPPORTED", sufficiencyReasons: [] },
      provisional: null, limitations, usageSelection: [], appliedUsageIds: [], missingInputKeys: [], evaluation: null, componentRoles: [],
    });
    if (claimants.length > 1) {
      limitations.push({ code: "DUPLICATE_RULE_IDENTITY", message: `rule id ${node.ruleId} is claimed by ${claimants.length} rules; nothing is chosen between them`, refs: [node.capacityNodeId] });
      capacities.push(undeterminedEntry("more than one rule claims this id; none is chosen"));
      continue;
    }
    const rule = claimants[0];
    if (!rule || !rule.capacityExpression) {
      capacities.push(undeterminedEntry("rule has no capacity expression"));
      continue;
    }

    // The Phase-3 legal state is read first, through the exhaustive table (R8). It can only ever
    // make the answer weaker: `legalFloor` is a floor on the status, never lowered by arithmetic.
    const dominance = SUFFICIENCY_DOMINANCE[rule.sufficiency] ?? UNKNOWN_SUFFICIENCY;
    const reasons = rule.sufficiencyReasons.join("; ") || "no reason recorded";
    if (dominance.limitation === "PHASE3_RULE_AMBIGUOUS") limitations.push({ code: "PHASE3_RULE_AMBIGUOUS", message: `Phase 3 marks this rule ${rule.sufficiency}: ${reasons}`, refs: [node.capacityNodeId] });
    if (dominance.limitation === "PHASE3_RULE_NOT_SAFE_TO_RELY_ON") limitations.push({ code: "PHASE3_RULE_NOT_SAFE_TO_RELY_ON", message: `Phase 3 represents this rule only partially: ${reasons}`, refs: [node.capacityNodeId] });
    if (dominance.limitation === "PHASE3_RULE_UNSUPPORTED") limitations.push({ code: "PHASE3_RULE_UNSUPPORTED", message: `Phase 3 marks this rule ${rule.sufficiency}: ${reasons}; any arithmetic is provisional only`, refs: [node.capacityNodeId] });
    const scopeUnsafe = node.entityScope?.safeToRely === false || node.entityScope?.applicability === "SCOPE_NOT_SAFE_TO_RELY_ON";
    if (scopeUnsafe) limitations.push({ code: "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON", message: "the Phase-3 entity-scope guard marked this rule's scope not safe to rely on; the capacity is not attributed to a specific entity set", refs: [node.capacityNodeId] });
    if (node.entityScope?.applicability === "SCOPE_UNSPECIFIED") limitations.push({ code: "ENTITY_SCOPE_UNSPECIFIED", message: "the rule's entity scope is unspecified; the capacity is not attributed to a specific entity set", refs: [node.capacityNodeId] });
    // A share relationship nothing quantifies: an unknown constraint could bind (R9).
    const sharedUnknown = node.unquantifiedSharedWith.length > 0;
    if (sharedUnknown) limitations.push({ code: "SHARED_CAPACITY_NOT_QUANTIFIED", message: `this capacity shares with ${node.unquantifiedSharedWith.join(", ")} under a relationship no shared-capacity resource quantifies; its effective availability is not authoritative`, refs: [node.capacityNodeId, ...node.unquantifiedSharedWith] });
    // PHASE-4 VERIFICATION GATE: the rule's own record, assessed once against the rule's own identity.
    // The floor is read AFTER evaluation because a NODE hit inside the capacity-driving expression
    // (including inside an expanded definition) is only known once the evaluator reached it.
    const identity = { ruleOrDefinitionId: rule.ruleId, companyId: rule.companyId, instrumentKey: rule.instrumentKey, irSchemaVersion: rule.irSchemaVersion, compilerVersion: rule.compilerVersion, sourceContentVersion: rule.sourceContentVersion };
    const own = gateActive ? assessUnit(rule.ruleId, args.verification, args.policy, identity) : null;

    const evaluation = evaluate(rule.capacityExpression, { companyId, instrumentKey, asOf, ruleId: rule.ruleId, unitId: rule.ruleId, unitIdentity: identity });
    const verificationFloor = own ? capacityVerificationFloor(own, evaluation, node.capacityNodeId) : null;
    if (verificationFloor) limitations.push(...verificationFloor.limitations);
    const legalFloor: CapacityStatus[] = [dominance.status, scopeUnsafe ? "REVIEW_REQUIRED" : null, sharedUnknown ? "REVIEW_REQUIRED" : null, ...(verificationFloor?.floors ?? [])].filter((s): s is CapacityStatus => s !== null);
    const legalUnsafe = legalFloor.length > 0;

    const gross = amountOf(evaluation.value, evaluation.status === "NEEDS_INPUT" ? "a financial fact this capacity depends on is missing" : `capacity not evaluable: ${evaluation.status}`);
    if (evaluation.status === "NEEDS_INPUT") limitations.push({ code: "MISSING_FINANCIAL_INPUT", message: `missing: ${evaluation.missingInputKeys.join(", ")}`, refs: evaluation.missingInputKeys });
    // An AMBIGUOUS that is purely a verification refusal is already reported above as what it is.
    const ambiguousIsVerificationOnly = (verificationFloor?.conditions.some((c) => c !== "NONE" && c !== "ATTEMPTED_INCOMPLETE") ?? false) && ambiguousKeysOf(evaluation).length === 0;
    if (evaluation.status === "AMBIGUOUS" && !ambiguousIsVerificationOnly) limitations.push({ code: "AMBIGUOUS_FINANCIAL_INPUT", message: `a financial fact this capacity depends on resolved ambiguously: ${ambiguousKeysOf(evaluation).join(", ")}`, refs: ambiguousKeysOf(evaluation) });
    if (evaluation.status === "UNSUPPORTED") limitations.push({ code: "UNSUPPORTED_EXPRESSION", message: evaluation.diagnostics.map((d) => d.message)[0] ?? "the capacity expression contains a node Phase 3 could not represent", refs: [node.capacityNodeId] });

    const currency = currencyOf(gross);
    const usageResult = getUsage({ kind: "RULE", ruleId: rule.ruleId }, currency);
    if (usageResult.blocked) limitations.push(blockLimitation(usageResult.blocked));
    const usage: CapacityAmount = usageResult.total ? { kind: "AMOUNT", value: usageResult.total } : { kind: "NOT_DETERMINED", reason: usageResult.blocked ? usageResult.blocked.message : "no usage recorded against this capacity" };

    const { remaining, over } = computeRemaining(gross, usage, usageResult.blocked !== null);
    const overConsumption: OverConsumption | null = over ? { gross, usage, deficit: over.deficit, usageIds: usageResult.applied.map((u) => u.usageId) } : null;
    if (over) limitations.push({ code: "OVER_CONSUMPTION", message: "recorded usage exceeds the contractual capacity; the remaining figure is negative and is not clamped", refs: [node.capacityNodeId] });

    // Shared constraints bound the member. This reports what the pool leaves, not an allocation.
    // Only this member's own pool edges are consulted, from the index built once above.
    const poolIds = poolsByMember.get(node.capacityNodeId) ?? [];
    complexity.indexLookups++;
    complexity.edgesVisited += poolIds.length;
    const myShared: SharedConstraintState[] = [];
    for (const p of poolIds) { complexity.sharedResourceLookups++; const s = poolByNodeId.get(p); if (s) myShared.push(s); }
    myShared.sort((a, b) => (a.sharedCapacityId < b.sharedCapacityId ? -1 : 1));
    let localEffective = remaining;
    for (const s of myShared) localEffective = tighter(localEffective, s.remaining);
    for (const s of myShared) for (const l of s.limitations) if (!limitations.some((x) => x.code === l.code && x.message === l.message)) limitations.push(l);

    const bounds: CapacityBounds | null = evaluation.bounds ?? null;
    const status = worst([statusFromEvaluation(evaluation), ...legalFloor, ...limitations.map((l) => LIMITATION_STATUS_FLOOR[l.code]), ...myShared.map((s) => s.status)]);

    // A capacity whose legal state is not safe to rely on keeps its arithmetic, but separately, so
    // it can never be read as authoritative headroom. Arithmetic never upgrades the legal state.
    const withheld = legalUnsafe || NON_AUTHORITATIVE.includes(status);
    const provisional = withheld ? { grossCapacity: gross, remaining, effectiveRemaining: localEffective } : null;
    const withheldReason = sharedUnknown && !NON_AUTHORITATIVE.includes(worst([statusFromEvaluation(evaluation), dominance.status ?? "AVAILABLE", scopeUnsafe ? "REVIEW_REQUIRED" : "AVAILABLE"]))
      ? "an unquantified shared-capacity relationship could bind this capacity; the local arithmetic is reported under `provisional`"
      : "the legal state of this rule is not safe to rely on; the computed arithmetic is reported under `provisional`";
    const published = withheld
      ? { gross: { kind: "NOT_DETERMINED" as const, reason: withheldReason }, remaining: { kind: "NOT_DETERMINED" as const, reason: withheldReason }, effective: { kind: "NOT_DETERMINED" as const, reason: withheldReason } }
      : { gross, remaining, effective: localEffective };

    const entry: CapacityStateEntry = {
      capacityNodeId: node.capacityNodeId, ruleId: rule.ruleId, status,
      grossCapacity: published.gross, usage, remaining: published.remaining, effectiveRemaining: published.effective,
      bounds, overConsumption, sharedConstraintIds: myShared.map((s) => s.sharedCapacityId),
      entityScope: node.entityScope, phase3: { sufficiency: rule.sufficiency, sufficiencyReasons: rule.sufficiencyReasons },
      provisional, limitations: sortLimitations(limitations), usageSelection: usageResult.selection, appliedUsageIds: usageResult.applied.map((u) => u.usageId).sort(),
      missingInputKeys: evaluation.missingInputKeys, evaluation,
      componentRoles: (componentsByRule.get(rule.ruleId) ?? []).map((n) => ({ capacityNodeId: n.capacityNodeId, exprId: n.expressionId, role: n.componentRole! })),
    };
    complexity.indexLookups++;
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
  const quarantinedUsageIds = [...ledgerIndex.quarantined.keys()].sort();
  if (quarantinedUsageIds.length > 0) stateLimitations.push({ code: "DUPLICATE_LEDGER_USAGE_IDENTITY", message: `usage identity claimed by more than one record: ${quarantinedUsageIds.join(", ")}; none of the claimants is counted`, refs: quarantinedUsageIds });
  // An unresolved usage whose every candidate is outside this graph touches no capacity here, so no
  // entry fails closed for it. It is still usage that exists: reported, never dropped (R10).
  const ruleNodeIdsInGraph = new Set(ruleNodes.map((n) => n.ruleId!));
  const notAttributable = new Map<string, LedgerUsageRecord>();
  for (const [candidate, records] of ledgerIndex.unresolvedByCandidate) {
    if (ruleNodeIdsInGraph.has(candidate)) continue;
    for (const u of records) if (u.capacityPath.kind === "UNRESOLVED" && !u.capacityPath.candidateRuleIds.some((c) => ruleNodeIdsInGraph.has(c))) notAttributable.set(u.usageId, u);
  }
  const ledgerIssues = [...ledgerIndex.issues];
  if (notAttributable.size > 0) {
    const ids = [...notAttributable.keys()].sort();
    ledgerIssues.push({ code: "UNRESOLVED_CANDIDATES_NOT_IN_GRAPH", message: `usage ${ids.join(", ")} names only candidate capacities that are not in this graph; it consumed something, but nothing here can be reduced by it`, usageIds: ids });
    stateLimitations.push({ code: "USAGE_NOT_ATTRIBUTABLE_IN_GRAPH", message: `usage exists that is attributable only to capacities outside this graph: ${ids.join(", ")}; no capacity here is reduced by it and none is authoritative about it`, refs: ids });
  }
  ledgerIssues.sort((a, b) => (`${a.code}|${a.usageIds.join(",")}` < `${b.code}|${b.usageIds.join(",")}` ? -1 : 1));
  if (ledgerIndex.unresolvedWithoutCandidates.length > 0) stateLimitations.push({ code: "ALLOCATION_INFORMATION_MISSING", message: `usage exists whose capacity attribution is missing entirely: ${ledgerIndex.unresolvedWithoutCandidates.map((u) => u.usageId).join(", ")}`, refs: ledgerIndex.unresolvedWithoutCandidates.map((u) => u.usageId) });

  const sortedSnapshotIds = [...snapshotIds].sort();
  const snapshotBinding: SnapshotBinding = {
    snapshotIds: sortedSnapshotIds,
    snapshotVersions: [...snapshotVersions].sort(),
    snapshotSetHash: snapshotIds.size > 0 ? hashOf(sortedSnapshotIds) : null,
    inputContractVersion: evaluations.find((e) => e.provenance.inputContractVersion)?.provenance.inputContractVersion ?? null,
    ambiguous: snapshotConflict,
    multiSnapshot: snapshotIds.size > 1,
    conflictingInputKeys: [...conflictingInputKeys].sort(),
  };
  if (snapshotBinding.ambiguous) stateLimitations.push({ code: "SNAPSHOT_BINDING_AMBIGUOUS", message: `a financial fact this state needed resolved ambiguously across the live snapshots (${snapshotBinding.conflictingInputKeys.join(", ")}); the Phase-4B contract refused to pick one`, refs: snapshotBinding.conflictingInputKeys });

  sortLimitations(stateLimitations);
  const body = {
    capacityGraphVersion: CAPACITY_GRAPH_VERSION,
    runtimeVersion: CONTRACT_RUNTIME_VERSION,
    inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    companyId, instrumentKey, asOf,
    graphHash: graph.graphHash,
    capacities, sharedConstraints, explanations,
    ledgerIssues,
    ledgerScope: { outOfScope: ledgerIndex.outOfScope, quarantinedUsageIds },
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
