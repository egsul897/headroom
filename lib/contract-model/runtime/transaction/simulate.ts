/**
 * PHASE 4D - the deterministic hypothetical-transaction simulation pipeline.
 *
 * One canonical evaluation order, stated once here and never re-chosen by an individual effect
 * handler. Every number comes from Phase 4A, every financial fact from Phase 4B through the
 * explicit pro-forma overlay, and every capacity semantic from the recertified Phase 4C.
 *
 * The invariant this file exists to hold:
 *
 *   PostState = apply(PreState, ExplicitTransactionEffects, ExplicitPath, ExplicitInputs)
 *
 * and nothing else. No alternative path is considered, no allocation is inferred, no accounting
 * consequence is derived from what a transaction is called, no currency is converted, no amount is
 * resized to fit, and nothing is persisted.
 */
import { rationalFromString } from "../decimal";
import { evaluateExpression } from "../evaluate-expression";
import { addAll, compareValues, subtractValues } from "../units";
import { serializeValue } from "../values";
import { CONTRACT_RUNTIME_VERSION } from "../version";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "../input/version";
import { hashOf } from "../input/identity";
import { buildRuleDependencyManifest } from "../input/manifest";
import type { DependencyRecord } from "../input/types";
import type { EvaluationResult, RuntimeValue } from "../types";
import type { IRRule } from "../../ir/types";
import { CAPACITY_GRAPH_VERSION } from "../capacity/version";
import { ruleNodeId, sharedNodeId } from "../capacity/graph";
import { evaluateCapacityState } from "../capacity/state";
import { applyCapacityStateTransition } from "../capacity/reclassification";
import { DEFAULT_LEDGER_POLICY } from "../capacity/types";
import type {
  CapacityAmount, CapacityState, CapacityStateEntry, LedgerUsageRecord, ReclassificationOutcome,
} from "../capacity/types";
import { TRANSACTION_SIMULATION_VERSION } from "./version";
import { buildOverlay, quantityToRuntimeValue, valueUnit } from "./overlay";
import { classifyEffects, detectCompositionConflicts, detectEffectCycles, writesOf } from "./effects";
import { ledgerHash, simulationIdOf, transactionHash } from "./identity";
import type {
  ApplyReclassificationEffect, CapacityEffectResult, ChangeMetricEffect, ConditionResult,
  ConsumeCapacityEffect, EntityScopeResult, EventStateEffect, ProposedLedgerEffect,
  RestoreCapacityEffect, SelectedPathResult, SimulateTransactionArgs, SimulationComplexity,
  SimulationDependencyManifest, SimulationLimitation, SimulationStatus, SimulationTraceStep,
  SimulationTraceStepName, SupersedeLedgerUsageEffect, SupersededLedgerEffect,
  TransactionQuantity, TransactionSimulationResult,
} from "./types";
import { SELECTED_PATH_RESULT_PRECEDENCE, SIMULATION_STATUS_PRECEDENCE } from "./types";

const L = { exprId: null, inputKeys: [] as string[] };

const worstStatus = (xs: SimulationStatus[]): SimulationStatus =>
  xs.reduce((a, b) => (SIMULATION_STATUS_PRECEDENCE[b] > SIMULATION_STATUS_PRECEDENCE[a] ? b : a), "SIMULATED" as SimulationStatus);

const worstPath = (xs: SelectedPathResult[]): SelectedPathResult =>
  xs.reduce((a, b) => (SELECTED_PATH_RESULT_PRECEDENCE[b] > SELECTED_PATH_RESULT_PRECEDENCE[a] ? b : a), "SATISFIED" as SelectedPathResult);

const amountValue = (a: CapacityAmount): RuntimeValue | null =>
  a.kind === "AMOUNT" && a.value.type === "MONEY" ? { type: "MONEY", amount: rationalFromString(a.value.amount), currency: a.value.currency, lineage: L } : null;

/** Exact-rational sign test on a Phase-4C capacity amount. No float is ever introduced. */
const isNegativeAmount = (a: CapacityAmount): boolean =>
  a.kind === "AMOUNT" && a.value.type === "MONEY" && a.value.amount.trim().startsWith("-");

const amountCurrency = (a: CapacityAmount): string | null => (a.kind === "AMOUNT" && a.value.type === "MONEY" ? a.value.currency : null);

const sortLimitations = (ls: SimulationLimitation[]) => ls.sort((a, b) => (`${a.code}|${a.message}` < `${b.code}|${b.message}` ? -1 : 1));

/** The status floor each limitation imposes on the SIMULATION dimension (never on the path dimension). */
const SIMULATION_FLOOR: Record<string, SimulationStatus> = {
  SELECTED_PATH_NOT_FOUND: "ERROR", SELECTED_RULE_NOT_FOUND: "ERROR", SELECTED_SHARED_CAPACITY_NOT_FOUND: "ERROR",
  EFFECT_TARGET_NOT_IN_SELECTED_PATH: "ERROR", INVALID_EXPLICIT_ALLOCATION: "ERROR",
  DUPLICATE_PROPOSED_LEDGER_IDENTITY: "ERROR", DUPLICATE_EFFECT_IDENTITY: "ERROR", LEDGER_USAGE_NOT_FOUND: "ERROR",
  TRANSACTION_SCOPE_MISMATCH: "ERROR", INCOMPATIBLE_UNIT: "ERROR", CURRENCY_MISMATCH_NO_CONVERSION_MODELED: "ERROR",
  AMBIGUOUS_CAPACITY_ALLOCATION: "AMBIGUOUS", AMBIGUOUS_FINANCIAL_INPUT: "AMBIGUOUS",
  FIXED_POINT_REQUIRED: "UNSUPPORTED", TRANSACTION_EFFECT_DEPENDENCY_CYCLE: "UNSUPPORTED",
  UNSUPPORTED_TRANSACTION_EFFECT: "UNSUPPORTED", PHASE3_RULE_UNSUPPORTED: "UNSUPPORTED",
  MISSING_FINANCIAL_INPUT: "NEEDS_INPUT", OVERLAY_BASE_INPUT_MISSING: "NEEDS_INPUT", CAPACITY_NOT_DETERMINED: "NEEDS_INPUT",
  PHASE3_RULE_NOT_SAFE_TO_RELY_ON: "REVIEW_REQUIRED", ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON: "REVIEW_REQUIRED",
  SHARED_CAPACITY_NOT_QUANTIFIED: "REVIEW_REQUIRED", ENTITY_SCOPE_UNSPECIFIED: "REVIEW_REQUIRED",
  INVALID_RECLASSIFICATION_SOURCE: "ERROR", INVALID_RECLASSIFICATION_TARGET: "ERROR",
  // --- composition safety (Phase-4D remediation) ---------------------------
  // An aggregate over-draw is a conclusion the engine reached, not a failure to evaluate, so it
  // does not by itself raise the simulation dimension above SIMULATED.
  INSUFFICIENT_AGGREGATE_CAPACITY: "SIMULATED",
  CONFLICTING_LEDGER_SUCCESSOR: "AMBIGUOUS", CONFLICTING_EVENT_STATE: "AMBIGUOUS",
  CONFLICTING_METRIC_ADJUSTMENT: "AMBIGUOUS",
  INVALID_EFFECT_DEPENDENCY: "ERROR", EFFECT_DEPENDENCY_CONTRADICTS_ORDER: "ERROR",
  POST_STATE_INCONSISTENT: "ERROR",
};

/**
 * Limitations that mean the stated specification could not be evaluated at all, as opposed to a
 * specification that was evaluated and found not to work.
 */
const PRE_EVALUATION_BLOCKERS = new Set<string>([
  "SELECTED_PATH_NOT_FOUND", "SELECTED_RULE_NOT_FOUND", "SELECTED_SHARED_CAPACITY_NOT_FOUND",
  "EFFECT_TARGET_NOT_IN_SELECTED_PATH", "INVALID_EXPLICIT_ALLOCATION", "AMBIGUOUS_CAPACITY_ALLOCATION",
  "FIXED_POINT_REQUIRED", "TRANSACTION_EFFECT_DEPENDENCY_CYCLE", "TRANSACTION_SCOPE_MISMATCH",
  "DUPLICATE_EFFECT_IDENTITY", "DUPLICATE_PROPOSED_LEDGER_IDENTITY", "LEDGER_USAGE_NOT_FOUND",
  // A conflicting or malformed composition is a specification that cannot be evaluated at all -
  // not a path that was evaluated and found wanting.
  "CONFLICTING_LEDGER_SUCCESSOR", "CONFLICTING_EVENT_STATE", "CONFLICTING_METRIC_ADJUSTMENT",
  "INVALID_EFFECT_DEPENDENCY", "EFFECT_DEPENDENCY_CONTRADICTS_ORDER", "POST_STATE_INCONSISTENT",
]);

export function simulateTransaction(args: SimulateTransactionArgs): TransactionSimulationResult {
  const { transaction: tx, currentState, capacityGraph: graph, selectedPath, inputs } = args;
  const ctx = args.context;
  const asOf = ctx.asOf ?? currentState.asOf ?? null;
  const baseLedger: readonly LedgerUsageRecord[] = ctx.ledger ?? [];
  const policy = ctx.ledgerPolicy ?? DEFAULT_LEDGER_POLICY;
  const limitations: SimulationLimitation[] = [];
  const diagnostics: { code: string; message: string; refs: string[] }[] = [];
  const trace: SimulationTraceStep[] = [];
  const complexity: SimulationComplexity = {
    capacitiesEvaluated: 0, conditionsEvaluated: 0, ledgerEntriesExamined: 0, effectsApplied: 0,
    graphEdgesTraversed: 0, maxDependencyDepth: 0, simulationSteps: 0, reclassificationEdgesExamined: 0,
    sharedResourcesEvaluated: 0, stateEvaluations: 0, indexLookups: 0,
  };
  const step = (name: SimulationTraceStepName, status: SimulationTraceStep["status"], reason: string, inputsIn: string[] = [], outputs: string[] = [], provenance: string[] = []) => {
    complexity.simulationSteps++;
    trace.push({ step: trace.length + 1, name, status, inputs: inputsIn, outputs, reason, provenance });
  };
  const limit = (code: SimulationLimitation["code"], message: string, refs: string[]) => { limitations.push({ code, message, refs }); };

  // ---- 1. validate the transaction -----------------------------------------
  const { classified, limitations: effectLimitations } = classifyEffects(tx.effects);
  limitations.push(...effectLimitations);
  // Structural composition conflicts, before anything is evaluated: competing ledger successors,
  // incompatible event or metric assignments, and malformed dependency edges. Each fails closed.
  limitations.push(...detectCompositionConflicts(tx.effects));
  if (tx.companyId !== graph.companyId || tx.instrumentKey !== graph.instrumentKey) {
    limit("TRANSACTION_SCOPE_MISMATCH", `the transaction states company ${tx.companyId} / instrument ${tx.instrumentKey}; the capacity graph is company ${graph.companyId} / instrument ${graph.instrumentKey}`, [tx.transactionId]);
  }
  if (currentState.graphHash !== graph.graphHash) {
    limit("TRANSACTION_SCOPE_MISMATCH", `the supplied pre-transaction state was computed against capacity graph ${currentState.graphHash.slice(0, 12)} but graph ${graph.graphHash.slice(0, 12)} was supplied; a state and a graph that do not correspond are never reconciled`, [tx.transactionId]);
  }
  const supportedIds = new Set(classified.filter((c) => c.supported).map((c) => c.effectId));
  const byKind = <T,>(kind: string): T[] => tx.effects.filter((e) => e.kind === kind && supportedIds.has(e.effectId)) as unknown as T[];
  const consumeEffects = byKind<ConsumeCapacityEffect>("CONSUME_CAPACITY");
  const restoreEffects = byKind<RestoreCapacityEffect>("RESTORE_CAPACITY");
  const supersedeEffects = byKind<SupersedeLedgerUsageEffect>("SUPERSEDE_LEDGER_USAGE");
  const reclassEffects = byKind<ApplyReclassificationEffect>("APPLY_RECLASSIFICATION");
  const metricEffects = byKind<ChangeMetricEffect>("CHANGE_METRIC");
  const eventEffects = [...byKind<EventStateEffect>("ACTIVATE_EVENT"), ...byKind<EventStateEffect>("DEACTIVATE_EVENT")];
  step("TRANSACTION_VALIDATED", limitations.length === 0 ? "OK" : "BLOCKED", `${tx.effects.length} effect(s) stated, ${supportedIds.size} supported`, [tx.transactionId], classified.map((c) => `${c.effectId}:${c.kind}`), [tx.provenance.source]);

  // ---- 2. validate the selected path ---------------------------------------
  const nodeById = new Map(graph.nodes.map((n) => [n.capacityNodeId, n]));
  complexity.indexLookups++;
  const selectedNodeIds = new Set(selectedPath.capacityNodeIds);
  for (const id of [...selectedPath.capacityNodeIds].sort()) {
    complexity.indexLookups++;
    if (!nodeById.has(id)) limit("SELECTED_PATH_NOT_FOUND", `the selected capacity node ${id} does not exist in this capacity graph; Phase 4D validates the path the caller selected and never substitutes another`, [id]);
  }
  for (const id of [...selectedPath.ruleIds].sort()) {
    complexity.indexLookups++;
    if (!nodeById.has(ruleNodeId(id))) limit("SELECTED_RULE_NOT_FOUND", `the selected rule ${id} has no capacity node in this graph`, [id]);
  }
  for (const id of [...selectedPath.sharedCapacityIds].sort()) {
    complexity.indexLookups++;
    if (!nodeById.has(sharedNodeId(id))) limit("SELECTED_SHARED_CAPACITY_NOT_FOUND", `the selected shared capacity ${id} has no node in this graph`, [id]);
  }
  for (const e of consumeEffects) {
    if (!selectedNodeIds.has(e.capacityNodeId)) limit("EFFECT_TARGET_NOT_IN_SELECTED_PATH", `effect ${e.effectId} draws on capacity node ${e.capacityNodeId}, which the caller did not select; a draw is only ever made against an explicitly selected capacity`, [e.effectId, e.capacityNodeId]);
  }
  for (const eff of reclassEffects) {
    if (!selectedPath.reclassificationElectionIds.includes(eff.election.electionId)) {
      limit("EFFECT_TARGET_NOT_IN_SELECTED_PATH", `effect ${eff.effectId} applies election ${eff.election.electionId}, which the caller did not select`, [eff.effectId, eff.election.electionId]);
    }
  }
  // Allocation across several explicitly selected capacities must be stated, never inferred.
  const consumedNodeIds = new Set(consumeEffects.map((e) => e.capacityNodeId));
  const uncovered = [...selectedNodeIds].filter((id) => !consumedNodeIds.has(id)).sort();
  if (consumeEffects.length > 0 && uncovered.length > 0) {
    limit("AMBIGUOUS_CAPACITY_ALLOCATION", `the caller selected ${selectedNodeIds.size} capacities but stated a draw against only ${consumedNodeIds.size}; how much comes from ${uncovered.join(", ")} is not stated and the runtime does not infer, split or rebalance an allocation`, uncovered);
  }
  const allocationCheck = checkAllocation(tx.intendedAmount ?? null, tx.unallocatedAmount ?? null, consumeEffects);
  if (allocationCheck) limit(allocationCheck.code, allocationCheck.message, allocationCheck.refs);
  step("SELECTED_PATH_VALIDATED", limitations.some((l) => l.code.startsWith("SELECTED_") || l.code === "AMBIGUOUS_CAPACITY_ALLOCATION" || l.code === "INVALID_EXPLICIT_ALLOCATION") ? "BLOCKED" : "OK",
    `${selectedPath.capacityNodeIds.length} capacity node(s), ${selectedPath.ruleIds.length} rule(s), ${selectedPath.reclassificationElectionIds.length} election(s) selected by the caller`,
    [...selectedPath.capacityNodeIds].sort(), [...consumedNodeIds].sort(), ["caller-supplied selected path"]);

  // ---- 3. dependency manifest ----------------------------------------------
  const ruleById = new Map(ctx.rules.filter((r) => r.companyId === graph.companyId && r.instrumentKey === graph.instrumentKey).map((r) => [r.ruleId, r]));
  complexity.indexLookups++;
  const selectedRules: IRRule[] = [...new Set([...selectedPath.ruleIds, ...[...selectedNodeIds].map((id) => nodeById.get(id)?.ruleId).filter((x): x is string => Boolean(x))])]
    .sort().map((id) => ruleById.get(id)).filter((r): r is IRRule => Boolean(r));
  const financialInputs: DependencyRecord[] = [];
  const seenDependency = new Set<string>();
  const capacityReads = new Map<string, string[]>();
  for (const rule of selectedRules) {
    if (!rule.capacityExpression) continue;
    const manifest = buildRuleDependencyManifest(rule, { companyId: graph.companyId, instrumentKey: graph.instrumentKey, asOf, definitions: ctx.definitions ?? [] });
    complexity.maxDependencyDepth = Math.max(complexity.maxDependencyDepth, manifest.expandedObjects.length + 1);
    const reads: string[] = [];
    for (const d of manifest.dependencies) {
      const key = [d.inputKind, d.key, d.companyId, d.instrumentKey, JSON.stringify(d.period), JSON.stringify(d.asOf), String(d.expectedType)].join("::");
      if (!seenDependency.has(key)) { seenDependency.add(key); financialInputs.push(d); }
      reads.push(d.inputKind === "EVENT" ? `event:${d.key}` : `metric:${d.key}`);
    }
    capacityReads.set(ruleNodeId(rule.ruleId), [...new Set(reads)].sort());
  }
  financialInputs.sort((a, b) => (`${a.inputKind}|${a.key}` < `${b.inputKind}|${b.key}` ? -1 : 1));
  const manifestBody = {
    transactionSimulationVersion: TRANSACTION_SIMULATION_VERSION,
    financialInputs,
    requiredCapacityNodeIds: [...selectedNodeIds].sort(),
    requiredRuleIds: selectedRules.map((r) => r.ruleId).sort(),
    requiredSharedCapacityIds: [...selectedPath.sharedCapacityIds].sort(),
    requiredLedgerUsageIds: [...new Set([...restoreEffects.map((e) => e.usageId), ...supersedeEffects.map((e) => e.usageId)])].sort(),
    requiredReclassificationElectionIds: [...selectedPath.reclassificationElectionIds].sort(),
    requiredReclassificationEdges: reclassEffects.map((e) => ({ sourceRuleId: e.election.sourceRuleId, destinationRuleId: e.election.destinationRuleId })).sort((a, b) => (`${a.sourceRuleId}->${a.destinationRuleId}` < `${b.sourceRuleId}->${b.destinationRuleId}` ? -1 : 1)),
    adjustedInputKeys: [...new Set(metricEffects.map((e) => e.metricKey))].sort(),
    adjustedEventDescriptions: [...new Set(eventEffects.map((e) => e.eventDescription))].sort(),
    entityScopeDependencies: selectedRules.map((r) => r.ruleId).sort(),
  };
  const dependencyManifest: SimulationDependencyManifest = { ...manifestBody, manifestHash: hashOf(manifestBody) };
  step("DEPENDENCY_MANIFEST_GENERATED", "OK", `${financialInputs.length} financial input(s), ${manifestBody.requiredCapacityNodeIds.length} capacity node(s), ${manifestBody.requiredLedgerUsageIds.length} ledger identity(ies) required before anything is evaluated`, manifestBody.requiredRuleIds, manifestBody.financialInputs.map((d) => d.key), ["Phase-4B rule dependency manifests"]);

  // Structural circularity, detected from the read/write graph of the stated effects.
  const cycles = detectEffectCycles(tx.effects.filter((e) => supportedIds.has(e.effectId)), capacityReads);
  for (const c of cycles) {
    limit(c.kind, `${c.explanation} (effects ${c.effectIds.join(" -> ")}${c.symbols.length ? `, through ${[...new Set(c.symbols)].sort().join(", ")}` : ""})`, c.effectIds);
    diagnostics.push({ code: c.kind, message: c.explanation, refs: c.effectIds });
  }

  // ---- 4 / 5. immutable pre-state and base snapshot -------------------------
  const ledgerPreHash = ledgerHash(baseLedger);
  step("PRE_STATE_LOADED", "OK", `pre-transaction state ${currentState.stateHash.slice(0, 12)} over ${baseLedger.length} ledger record(s); it is read, never mutated`, [currentState.stateHash], [ledgerPreHash], [`capacity graph ${graph.graphHash.slice(0, 12)}`]);
  step("BASE_SNAPSHOT_LOADED", "OK", `${currentState.snapshotBinding.snapshotIds.length} approved snapshot(s) bound; the snapshot is immutable and is never written to`, currentState.snapshotBinding.snapshotIds, [currentState.snapshotBinding.snapshotSetHash ?? "none"], ["Phase-4B snapshot binding"]);

  // ---- 6 / 7. explicit financial overlay and the pro-forma input view -------
  const overlay = buildOverlay({ base: inputs, transactionId: tx.transactionId, companyId: graph.companyId, instrumentKey: graph.instrumentKey, metricEffects, eventEffects });
  limitations.push(...overlay.limitations);
  step("FINANCIAL_OVERLAY_APPLIED", overlay.limitations.length === 0 ? "OK" : "BLOCKED", `${overlay.entries.filter((e) => e.state === "APPLIED").length} of ${overlay.entries.length} stated adjustment(s) applied; every other input reads through to the approved snapshot unchanged`, overlay.entries.map((e) => e.metricKey), overlay.entries.map((e) => `${e.metricKey}:${e.state}`), ["caller-supplied explicit adjustments only"]);
  const simulationInputView = overlay.view(currentState.snapshotBinding);
  step("SIMULATION_INPUT_VIEW_CREATED", "OK", `pro-forma view ${simulationInputView.inputViewHash.slice(0, 12)} over the immutable base snapshot`, [currentState.snapshotBinding.snapshotSetHash ?? "none"], [simulationInputView.inputViewHash], ["base snapshot + explicit transaction adjustments"]);

  // ---- identity -------------------------------------------------------------
  const txHash = transactionHash(tx, selectedPath, currentState.snapshotBinding);
  const simulationId = simulationIdOf({ transactionHash: txHash, preStateHash: currentState.stateHash, inputViewHash: simulationInputView.inputViewHash, graphHash: graph.graphHash, ledgerHash: ledgerPreHash });

  const blockedBeforeEvaluation = limitations.some((l) => PRE_EVALUATION_BLOCKERS.has(l.code));

  // ---- 8. evaluate the relevant capacities against the pro-forma view -------
  let postOverlayState: CapacityState | null = null;
  if (!blockedBeforeEvaluation) {
    postOverlayState = evaluateCapacityState({ graph, rules: ctx.rules, sharedCapacities: ctx.sharedCapacities, definitions: ctx.definitions, inputs: overlay.resolver, ledger: baseLedger, ledgerPolicy: policy, asOf });
    complexity.stateEvaluations++;
    complexity.capacitiesEvaluated += postOverlayState.capacities.length;
    complexity.sharedResourcesEvaluated += postOverlayState.sharedConstraints.length;
    complexity.ledgerEntriesExamined += postOverlayState.complexity.ledgerEntriesExamined;
    complexity.graphEdgesTraversed += postOverlayState.complexity.edgesVisited;
    step("CAPACITIES_EVALUATED", "OK", `${postOverlayState.capacities.length} capacity(ies) evaluated once against the pro-forma input view`, [simulationInputView.inputViewHash], [postOverlayState.stateHash], ["Phase-4C capacity state over the Phase-4A evaluator"]);
  } else {
    step("CAPACITIES_EVALUATED", "SKIPPED", "the specification was refused before evaluation; nothing was evaluated", [], [], []);
  }

  // ---- 9. conditions and entity scope --------------------------------------
  const conditions: ConditionResult[] = [];
  const entityScope: EntityScopeResult[] = [];
  if (postOverlayState) {
    for (const rule of selectedRules) {
      const unsafeLegal = rule.sufficiency !== "COMPLETE";
      for (const c of rule.conditions) {
        complexity.conditionsEvaluated++;
        const evaluation: EvaluationResult | null = c.expression ? evaluateExpression({ expression: c.expression, inputs: overlay.resolver, context: { companyId: rule.companyId, instrumentKey: rule.instrumentKey, asOf, ruleId: rule.ruleId } }) : null;
        conditions.push({ ruleId: rule.ruleId, conditionId: c.conditionId, conditionType: String(c.conditionType), description: c.description, ...conditionOutcome(evaluation, unsafeLegal, c.referencesDefinitionId), evaluation });
      }
      entityScope.push(entityScopeOutcome(rule, tx.entities ?? []));
    }
    for (const cr of conditions) {
      if (cr.result === "NOT_SATISFIED") limit("CONDITION_NOT_SATISFIED", `condition ${cr.conditionId} on rule ${cr.ruleId} is not satisfied: ${cr.description}`, [cr.ruleId, cr.conditionId]);
      if (cr.result === "NEEDS_INPUT") limit("MISSING_FINANCIAL_INPUT", `condition ${cr.conditionId} on rule ${cr.ruleId} needs a financial fact that is not supplied`, [cr.ruleId, cr.conditionId]);
    }
    for (const es of entityScope) {
      if (es.outcome === "CONFIRMED_EXCLUDED") limit("TRANSACTION_ENTITY_EXCLUDED", es.reason, [es.ruleId, ...es.transactionEntities]);
      if (es.outcome === "NOT_IN_DECLARED_SCOPE") limit("TRANSACTION_ENTITY_NOT_IN_SCOPE", es.reason, [es.ruleId, ...es.transactionEntities]);
      if (es.outcome === "SCOPE_NOT_SAFE_TO_RELY_ON") limit("ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON", es.reason, [es.ruleId]);
      if (es.outcome === "SCOPE_UNSPECIFIED") limit("ENTITY_SCOPE_UNSPECIFIED", es.reason, [es.ruleId]);
    }
    step("CONDITIONS_EVALUATED", "OK", `${conditions.length} condition(s) evaluated individually; a mixed set is never collapsed into one permitted flag`, selectedRules.map((r) => r.ruleId), conditions.map((c) => `${c.conditionId}:${c.result}`), ["Phase-3 rule conditions through the Phase-4A evaluator"]);
  } else {
    step("CONDITIONS_EVALUATED", "SKIPPED", "no capacity state was evaluated", [], [], []);
  }
  // ---- 10-13. SEQUENTIAL EXECUTION OF THE STATED EFFECTS -------------------
  //
  // The Phase-4D semantic contract, stated once and enforced here:
  //
  //   Effects apply IN THE STATED ORDER, each against the state its predecessors produced.
  //
  // Availability is therefore never measured twice against the same pre-transaction snapshot. A
  // second draw on a resource sees what the first draw left, a draw after a release sees the
  // released headroom, and a draw after a metric adjustment sees the adjusted capacity.
  //
  // Phase 4C remains the sole arithmetic authority: every measurement below reads a capacity entry
  // that `evaluateCapacityState` produced. Nothing here re-derives a remaining-capacity formula,
  // so the two layers cannot drift.
  const capacityEffects: CapacityEffectResult[] = [];
  const proposed: ProposedLedgerEffect[] = [];
  const superseded: SupersededLedgerEffect[] = [];
  const baseById = new Map(baseLedger.map((u) => [u.usageId, u]));
  complexity.indexLookups++;
  const proposedId = (effectId: string) => `${tx.transactionId}::${effectId}`;

  let reclassOutcomes: ReclassificationOutcome[] = [];
  let batchConservation: TransactionSimulationResult["reclassificationEffects"]["batchConservation"] = [];
  let reclassAllExecuted = reclassEffects.length === 0;
  complexity.reclassificationEdgesExamined += graph.edges.filter((x) => x.kind === "RECLASSIFIABLE_TO").length;

  // The working ledger. Superseded originals are restated in place; successors are appended.
  let workingLedger: LedgerUsageRecord[] = [...baseLedger];
  // The overlay grows as CHANGE_METRIC / event effects are reached, so an adjustment is visible
  // only to the effects stated after it.
  const appliedMetrics: ChangeMetricEffect[] = [];
  const appliedEvents: EventStateEffect[] = [];
  let cursorState: CapacityState | null = postOverlayState;
  let cursorDirty = false;
  let reclassBatchApplied = false;

  // A batch that must execute atomically cannot also be interleaved. Where another effect sits
  // between two elections AND touches a capacity those elections move, the stated sequence and the
  // atomic batch disagree, and Phase 4D says so rather than silently picking one reading.
  {
    const positions = tx.effects.map((e, i) => ({ e, i })).filter(({ e }) => e.kind === "APPLY_RECLASSIFICATION" && supportedIds.has(e.effectId));
    if (positions.length > 1) {
      const first = positions[0]!.i, last = positions[positions.length - 1]!.i;
      const moved = new Set(reclassEffects.flatMap((x) => [ruleNodeId(x.election.sourceRuleId), ruleNodeId(x.election.destinationRuleId)]));
      const between = tx.effects.slice(first + 1, last).filter((e) => e.kind !== "APPLY_RECLASSIFICATION" && supportedIds.has(e.effectId));
      const clashing = between.filter((e) => writesOf(e).some((w) => moved.has(w.replace(/^capacity:/, "capacity:"))) || (e.kind === "CONSUME_CAPACITY" && moved.has(e.capacityNodeId)));
      if (clashing.length > 0) {
        limit("RECLASSIFICATION_NOT_EXECUTABLE", `effects ${clashing.map((e) => e.effectId).sort().join(", ")} are stated between elections that execute as one conserving batch and touch capacity the batch moves; the stated order and the atomic batch cannot both be honoured, so the combination is refused rather than guessed`, clashing.map((e) => e.effectId).sort());
      }
    }
  }

  /** Recompute the Phase-4C state for the cursor, but only when a prior effect changed it. */
  const refreshCursor = (): CapacityState | null => {
    if (!cursorDirty && cursorState) return cursorState;
    const stepOverlay = buildOverlay({ base: inputs, transactionId: tx.transactionId, companyId: graph.companyId, instrumentKey: graph.instrumentKey, metricEffects: appliedMetrics, eventEffects: appliedEvents });
    cursorState = evaluateCapacityState({ graph, rules: ctx.rules, sharedCapacities: ctx.sharedCapacities, definitions: ctx.definitions, inputs: stepOverlay.resolver, ledger: workingLedger, ledgerPolicy: policy, asOf });
    complexity.stateEvaluations++;
    complexity.ledgerEntriesExamined += cursorState.complexity.ledgerEntriesExamined;
    cursorDirty = false;
    return cursorState;
  };

  if (postOverlayState) {
    // At the cursor's start no adjustment has been reached yet, so the opening state is the base
    // ledger under an empty overlay. Where the transaction states no adjustment at all this is
    // exactly `postOverlayState` and no extra evaluation is performed.
    if (metricEffects.length > 0 || eventEffects.length > 0) cursorDirty = true;

    for (const e of tx.effects) {
      if (!supportedIds.has(e.effectId)) continue;
      switch (e.kind) {
        case "CHANGE_METRIC": {
          appliedMetrics.push(e as ChangeMetricEffect);
          complexity.effectsApplied++;
          cursorDirty = true;
          break;
        }
        case "ACTIVATE_EVENT": case "DEACTIVATE_EVENT": {
          appliedEvents.push(e as EventStateEffect);
          complexity.effectsApplied++;
          cursorDirty = true;
          break;
        }
        case "CONSUME_CAPACITY": {
          const eff = e as ConsumeCapacityEffect;
          const state = refreshCursor();
          complexity.indexLookups++;
          complexity.effectsApplied++;
          const node = nodeById.get(eff.capacityNodeId);
          const entry = state?.capacities.find((c) => c.capacityNodeId === eff.capacityNodeId) ?? null;
          const result = consumptionResult(eff, node?.ruleId ?? null, node?.sharedCapacityId ?? null, entry);
          capacityEffects.push(result);
          complexity.sharedResourcesEvaluated += result.sharedConstraintIds.length;
          // The proposed row is appended whatever the outcome, so the post-state that gets
          // validated below is the state this transaction would actually produce.
          if (node && eff.amount.type === "MONEY") {
            const path = node.ruleId ? { kind: "RULE" as const, ruleId: node.ruleId } : node.sharedCapacityId ? { kind: "SHARED_CAPACITY" as const, sharedCapacityId: node.sharedCapacityId } : null;
            if (path) {
              const record: LedgerUsageRecord = {
                usageId: proposedId(eff.effectId), companyId: graph.companyId, instrumentKey: graph.instrumentKey,
                effectiveAsOf: tx.effectiveAsOf, amount: { amount: eff.amount.amount, currency: eff.amount.currency },
                capacityPath: path, transactionRef: tx.transactionId, status: "RECORDED", supersededByUsageId: null,
                provenance: { source: tx.provenance.source, sourceVersion: tx.provenance.sourceVersion, approvalRef: tx.provenance.approvalRef, approvalState: "PROPOSED_BY_SIMULATION" },
              };
              proposed.push({ kind: "PROPOSED_USAGE", effectId: eff.effectId, transactionId: tx.transactionId, simulationId, record, supersedesUsageId: null, preStateLedgerHash: ledgerPreHash, origin: "CONSUME_CAPACITY" });
              workingLedger = [...workingLedger, record];
              cursorDirty = true;
            }
          }
          break;
        }
        case "RESTORE_CAPACITY": case "SUPERSEDE_LEDGER_USAGE": {
          const eff = e as RestoreCapacityEffect | SupersedeLedgerUsageEffect;
          complexity.indexLookups++;
          complexity.effectsApplied++;
          const original = baseById.get(eff.usageId);
          if (!original) { limit("LEDGER_USAGE_NOT_FOUND", `effect ${eff.effectId} names usage ${eff.usageId}, which is not in the supplied ledger; an identity that does not exist is never created to satisfy an effect`, [eff.effectId, eff.usageId]); break; }
          const isRestore = eff.kind === "RESTORE_CAPACITY";
          const replacement = isRestore ? null : (eff as SupersedeLedgerUsageEffect).replacementAmount;
          if (replacement && replacement.type !== "MONEY") { limit("INCOMPATIBLE_UNIT", `effect ${eff.effectId} restates usage ${eff.usageId} with a ${replacement.type} amount; a ledger usage is money`, [eff.effectId]); break; }
          if (replacement && replacement.currency !== original.amount.currency) { limit("CURRENCY_MISMATCH_NO_CONVERSION_MODELED", `effect ${eff.effectId} restates usage ${eff.usageId} in ${replacement.currency} but the record is in ${original.amount.currency}; no conversion is modelled`, [eff.effectId, eff.usageId]); break; }
          const successorId = proposedId(eff.effectId);
          const successor: LedgerUsageRecord = {
            usageId: successorId, companyId: original.companyId, instrumentKey: original.instrumentKey,
            effectiveAsOf: tx.effectiveAsOf,
            amount: replacement ? { amount: replacement.amount, currency: replacement.currency } : { amount: original.amount.amount, currency: original.amount.currency },
            capacityPath: original.capacityPath, transactionRef: tx.transactionId,
            // A release is recorded as a reversal row: it exists, so the original is explicitly
            // superseded, and it is not itself counted under the recorded-usage policy.
            status: replacement ? "RECORDED" : "REVERSED", supersededByUsageId: null,
            provenance: { source: tx.provenance.source, sourceVersion: tx.provenance.sourceVersion, approvalRef: tx.provenance.approvalRef, approvalState: isRestore ? "PROPOSED_RELEASE_BY_SIMULATION" : "PROPOSED_RESTATEMENT_BY_SIMULATION" },
          };
          const restated: LedgerUsageRecord = { ...original, status: "SUPERSEDED", supersededByUsageId: successorId };
          superseded.push({ effectId: eff.effectId, originalUsageId: original.usageId, original, proposed: restated, supersededByUsageId: successorId, reason: eff.reason });
          proposed.push({ kind: "SUPERSEDED_USAGE", effectId: eff.effectId, transactionId: tx.transactionId, simulationId, record: successor, supersedesUsageId: original.usageId, preStateLedgerHash: ledgerPreHash, origin: isRestore ? "RESTORE_CAPACITY" : "SUPERSEDE_LEDGER_USAGE" });
          workingLedger = [...workingLedger.map((u) => (u.usageId === original.usageId ? restated : u)), successor];
          cursorDirty = true;
          break;
        }
        case "APPLY_RECLASSIFICATION": {
          // Elections are executed as ONE Phase-4C batch, so the recertified conservation rule -
          // a batch may not jointly move more usage than a source carries - still binds. The batch
          // runs at the position of the FIRST election in the stated sequence, so it observes the
          // effects stated before it and is observed by the effects stated after it.
          if (reclassBatchApplied) break;
          reclassBatchApplied = true;
          const state = refreshCursor();
          if (!state) break;
          const transition = applyCapacityStateTransition({
            graph, rules: ctx.rules, sharedCapacities: ctx.sharedCapacities, definitions: ctx.definitions,
            inputs: buildOverlay({ base: inputs, transactionId: tx.transactionId, companyId: graph.companyId, instrumentKey: graph.instrumentKey, metricEffects: appliedMetrics, eventEffects: appliedEvents }).resolver,
            ledger: workingLedger, ledgerPolicy: policy, asOf, before: state,
            elections: reclassEffects.map((x) => x.election),
          });
          complexity.stateEvaluations++;
          complexity.effectsApplied += reclassEffects.length;
          reclassOutcomes = transition.outcomes;
          batchConservation = transition.batchConservation;
          reclassAllExecuted = transition.allExecuted;
          for (const o of transition.outcomes) {
            for (const b of o.blockedBy) {
              const code = b.code === "SOURCE_CAPACITY_NOT_IN_GRAPH" ? "INVALID_RECLASSIFICATION_SOURCE"
                : b.code === "DESTINATION_CAPACITY_NOT_IN_GRAPH" ? "INVALID_RECLASSIFICATION_TARGET"
                  : b.code === "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" ? "CURRENCY_MISMATCH_NO_CONVERSION_MODELED" : "RECLASSIFICATION_NOT_EXECUTABLE";
              limit(code, `election ${o.electionId}: ${b.message}`, [o.electionId, ...b.missingSemanticFields]);
            }
          }
          for (const g of transition.outcomes.flatMap((o) => o.generatedUsage)) {
            proposed.push({ kind: "RECLASSIFIED_USAGE", effectId: null, transactionId: tx.transactionId, simulationId, record: g, supersedesUsageId: null, preStateLedgerHash: ledgerPreHash, origin: "RECLASSIFICATION_ELECTION" });
            workingLedger = [...workingLedger, g];
          }
          cursorDirty = true;
          break;
        }
        default: break;
      }
    }

    for (const r of capacityEffects) for (const l of r.limitations) if (!limitations.some((x) => x.code === l.code && x.message === l.message)) limitations.push(l);

    // One immutable usage identity, once. A proposed row may never reuse an existing identity.
    const proposedIds = new Map<string, number>();
    for (const p of proposed) proposedIds.set(p.record.usageId, (proposedIds.get(p.record.usageId) ?? 0) + 1);
    for (const [id, n] of [...proposedIds.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (n > 1) limit("DUPLICATE_PROPOSED_LEDGER_IDENTITY", `${n} proposed ledger rows claim usage identity ${id}; one identity may contribute at most once and nothing is chosen between them`, [id]);
      if (baseById.has(id)) limit("DUPLICATE_PROPOSED_LEDGER_IDENTITY", `a proposed ledger row claims usage identity ${id}, which the existing ledger already carries; the proposal would double-count and is refused`, [id]);
    }

    step("CAPACITY_CONSUMPTION_CALCULATED", capacityEffects.every((r) => r.outcome === "SATISFIED") ? "OK" : "BLOCKED", `${capacityEffects.length} explicit draw(s), each measured against the state its predecessors produced; an over-draw is reported, never clamped and never resized`, capacityEffects.map((r) => r.capacityNodeId), capacityEffects.map((r) => `${r.capacityNodeId}:${r.outcome}`), ["Phase-4C effective remaining, recomputed per stated effect"]);
    step("SHARED_CONSTRAINTS_EVALUATED", "OK", `${(cursorState ?? postOverlayState).sharedConstraints.length} shared constraint(s); a member draw is bounded by every pool it belongs to and no pool limit is copied onto a member`, capacityEffects.flatMap((r) => r.sharedConstraintIds), (cursorState ?? postOverlayState).sharedConstraints.map((s) => `${s.sharedCapacityId}:${s.status}`), ["Phase-4C shared constraint state"]);
    step("RECLASSIFICATION_APPLIED", reclassEffects.length === 0 ? "SKIPPED" : reclassAllExecuted ? "OK" : "BLOCKED", reclassEffects.length === 0 ? "no election was supplied; Phase 4D never elects a reclassification on the caller's behalf" : `${reclassEffects.length} explicit election(s), each validated against an encoded Phase-3 edge with conservation enforced by Phase 4C`, reclassEffects.map((e) => e.election.electionId), reclassOutcomes.map((o) => `${o.electionId}:${o.state}`), ["Phase-4C reclassification, recertified batch conservation"]);
    step("PROPOSED_LEDGER_EFFECTS_CREATED", limitations.some((l) => l.code === "DUPLICATE_PROPOSED_LEDGER_IDENTITY" || l.code === "LEDGER_USAGE_NOT_FOUND" || l.code === "CONFLICTING_LEDGER_SUCCESSOR") ? "BLOCKED" : "OK",
      `${proposed.length} proposed row(s), ${superseded.length} existing row(s) restated as superseded; the actual ledger is never written`, [ledgerPreHash], proposed.map((p) => p.record.usageId), ["proposal only - Phase 4D persists nothing"]);
  } else {
    step("CAPACITY_CONSUMPTION_CALCULATED", "SKIPPED", "no capacity state was evaluated", [], [], []);
    step("SHARED_CONSTRAINTS_EVALUATED", "SKIPPED", "no capacity state was evaluated", [], [], []);
    step("RECLASSIFICATION_APPLIED", "SKIPPED", "no capacity state was evaluated", [], [], []);
    step("PROPOSED_LEDGER_EFFECTS_CREATED", "SKIPPED", "no capacity state was evaluated", [], [], []);
  }

  // ---- statuses -------------------------------------------------------------
  const pathContributions: SelectedPathResult[] = [
    ...capacityEffects.map((r) => r.outcome),
    ...conditions.map((c) => (c.result === "SATISFIED" ? "SATISFIED" : c.result === "NOT_SATISFIED" ? "NOT_SATISFIED" : c.result === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "INDETERMINATE") as SelectedPathResult),
    ...entityScope.map((e) => entityScopePathResult(e.outcome)),
    ...(reclassEffects.length > 0 ? [reclassAllExecuted ? ("SATISFIED" as SelectedPathResult) : ("NOT_SATISFIED" as SelectedPathResult)] : []),
  ];
  // A specification the engine could not evaluate at all leaves the path dimension indeterminate.
  // A specification it DID evaluate keeps its conclusion - concluding that a path does not work is
  // a result, not an engine failure, and the two dimensions are never collapsed into one.
  const structurallyBlocked = limitations.some((l) => PRE_EVALUATION_BLOCKERS.has(l.code)) || cycles.length > 0 || !postOverlayState;
  const selectedPathResult: SelectedPathResult = structurallyBlocked ? "INDETERMINATE" : worstPath(pathContributions);
  const simulationStatus = worstStatus(limitations.map((l) => SIMULATION_FLOOR[l.code] ?? "SIMULATED"));

  // ---- 14. immutable post-state, then AUTHORITATIVE VALIDATION OF IT --------
  //
  // The post-state is not a report of a conclusion already reached. It is evidence that gets
  // checked. Phase 4C is asked what the combined transition actually produced, and if that answer
  // contradicts the transaction-level verdict the verdict loses, not the state.
  const applicable = !structurallyBlocked && (selectedPathResult === "SATISFIED" || selectedPathResult === "REVIEW_REQUIRED");
  let postState: CapacityState | null = null;
  let ledgerPostHash: string | null = null;
  let postStateConflicts: string[] = [];
  if (applicable) {
    const proposedLedger = workingLedger;
    postState = evaluateCapacityState({ graph, rules: ctx.rules, sharedCapacities: ctx.sharedCapacities, definitions: ctx.definitions, inputs: overlay.resolver, ledger: proposedLedger, ledgerPolicy: policy, asOf });
    complexity.stateEvaluations++;
    complexity.ledgerEntriesExamined += postState.complexity.ledgerEntriesExamined;
    ledgerPostHash = ledgerHash(proposedLedger);

    // Phase 4C reports an over-draw two ways: an OVER_CONSUMPTION limitation, and - where the
    // entry stays authoritative - a negative remaining. Both are read, because an over-draw that
    // makes an entry non-authoritative withholds the remaining figure entirely.
    const touchedNodes = new Set<string>([...selectedNodeIds, ...capacityEffects.map((c) => c.capacityNodeId)]);
    const touchedShared = new Set<string>([...selectedPath.sharedCapacityIds, ...capacityEffects.flatMap((c) => c.sharedConstraintIds)]);
    for (const c of postState.capacities) {
      if (!touchedNodes.has(c.capacityNodeId)) continue;
      if (c.limitations.some((l) => l.code === "OVER_CONSUMPTION")) postStateConflicts.push(`capacity ${c.capacityNodeId}`);
      else if (isNegativeAmount(c.remaining)) postStateConflicts.push(`capacity ${c.capacityNodeId}`);
    }
    for (const sc of postState.sharedConstraints) {
      if (!touchedShared.has(sc.sharedCapacityId) && !sc.memberRuleIds.some((rid) => touchedNodes.has(ruleNodeId(rid)))) continue;
      if (sc.limitations.some((l) => l.code === "OVER_CONSUMPTION")) postStateConflicts.push(`shared resource ${sc.sharedCapacityId}`);
      else if (isNegativeAmount(sc.remaining)) postStateConflicts.push(`shared resource ${sc.sharedCapacityId}`);
    }
    postStateConflicts = [...new Set(postStateConflicts)].sort();

    if (postStateConflicts.length > 0) {
      limit("INSUFFICIENT_AGGREGATE_CAPACITY", `the combined effects of this transaction over-consume ${postStateConflicts.join(", ")}; each draw may fit the state it was measured against, but the transition they produce together does not, so the transaction is refused rather than published`, postStateConflicts);
      // A contradictory transition is never published as a hypothetical successor state. The
      // arithmetic that produced it stays visible in capacityEffects and in the proposed rows.
      postState = null;
      ledgerPostHash = null;
      step("POST_STATE_DERIVED", "BLOCKED", `the recomputed post-state contradicts the per-effect conclusions (${postStateConflicts.join(", ")}); no successor state is published`, [ledgerPreHash], [], [`pre-state ${currentState.stateHash.slice(0, 12)}`]);
    } else {
      step("POST_STATE_DERIVED", "OK", `post-transaction state derived from the pre-transaction ledger plus ${proposed.length} proposed row(s) and validated against Phase 4C; the input state object is unchanged`, [ledgerPreHash], [postState.stateHash], [`pre-state ${currentState.stateHash.slice(0, 12)}`]);
    }
  } else {
    step("POST_STATE_DERIVED", "BLOCKED", structurallyBlocked ? "the specification was refused, so no post-state is published" : `the selected path is ${selectedPathResult}, so the transaction cannot be applied and no post-state is published; a partially applied state is never presented as valid`, [], [], []);
  }

  // The path and simulation dimensions are recomputed once the post-state has spoken, so a
  // verdict can never outlive the evidence that contradicted it.
  const finalPathResult: SelectedPathResult = postStateConflicts.length > 0
    ? worstPath([selectedPathResult, "INSUFFICIENT_CAPACITY"])
    : selectedPathResult;
  const finalSimulationStatus = worstStatus(limitations.map((l) => SIMULATION_FLOOR[l.code] ?? "SIMULATED"));

  const postStateBinding: Record<string, string | null> = {
    preStateHash: currentState.stateHash, transactionHash: txHash,
    snapshotSetHash: currentState.snapshotBinding.snapshotSetHash, simulationInputViewHash: simulationInputView.inputViewHash,
    capacityGraphHash: graph.graphHash, ledgerPreHash, ledgerPostHash,
    effectSequence: hashOf(tx.effects.map((e) => e.effectId)),
    runtimeVersion: CONTRACT_RUNTIME_VERSION, inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    capacityGraphVersion: CAPACITY_GRAPH_VERSION, transactionSimulationVersion: TRANSACTION_SIMULATION_VERSION,
    capacityStateHash: postState?.stateHash ?? null,
  };
  const postStateIdentity = postState ? { postStateHash: hashOf(postStateBinding), boundTo: postStateBinding } : null;

  sortLimitations(limitations);
  const missingInputs = [...new Set([
    ...(postOverlayState?.capacities.filter((c) => selectedNodeIds.has(c.capacityNodeId)).flatMap((c) => c.missingInputKeys) ?? []),
    ...conditions.flatMap((c) => c.evaluation?.missingInputKeys ?? []),
    ...overlay.entries.filter((e) => e.state !== "APPLIED").map((e) => e.metricKey),
  ])].sort();

  const commitPlan: TransactionSimulationResult["commitPlan"] = {
    // Committable means: the simulation ran, the selected path is satisfied, a post-state was
    // published, and that post-state survived validation. All four, never fewer.
    committable: postState !== null && postStateConflicts.length === 0 && finalPathResult === "SATISFIED" && finalSimulationStatus === "SIMULATED",
    blockedBy: [...new Set(limitations.map((l) => l.code))].sort(),
    wouldAppendLedgerRecords: proposed.map((p) => p.record),
    wouldSupersedeUsageIds: superseded.map((s) => s.originalUsageId).sort(),
    wouldRecordElectionIds: reclassOutcomes.filter((o) => o.state === "EXECUTED").map((o) => o.electionId).sort(),
    postStateHash: postStateIdentity?.postStateHash ?? null,
    executed: false,
    note: "declarative only. Phase 4D computes a hypothetical result; it writes no ledger, no snapshot, no state and no event, and it never schedules or executes this plan.",
  };

  step("STATUS_FINALIZED", "OK", `simulation ${finalSimulationStatus}, selected path ${finalPathResult}; the two dimensions are reported separately and are never collapsed into one permitted flag`, [], [finalSimulationStatus, finalPathResult], []);

  return {
    transactionSimulationVersion: TRANSACTION_SIMULATION_VERSION,
    runtimeVersion: CONTRACT_RUNTIME_VERSION,
    inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
    capacityGraphVersion: CAPACITY_GRAPH_VERSION,
    simulationStatus: finalSimulationStatus, selectedPathResult: finalPathResult,
    transactionIdentity: { transactionId: tx.transactionId, transactionHash: txHash, fields: { canonicalForm: "see canonicalTransaction in transaction/identity.ts" } },
    simulationIdentity: { simulationId, simulationHash: simulationId },
    selectedPath, dependencyManifest,
    preStateIdentity: { stateHash: currentState.stateHash, graphHash: graph.graphHash, ledgerHash: ledgerPreHash, asOf },
    preTransactionState: currentState,
    simulationInputView,
    effects: classified.map((c) => ({ effectId: c.effectId, kind: c.kind, supported: c.supported, applied: c.supported && !structurallyBlocked && postStateConflicts.length === 0, reason: c.reason })),
    capacityEffects,
    ledgerEffects: { proposed, superseded },
    financialEffects: overlay.entries,
    reclassificationEffects: { outcomes: reclassOutcomes, batchConservation, allExecuted: reclassAllExecuted },
    postState, postStateIdentity,
    conditions, entityScope, missingInputs, limitations, diagnostics, trace,
    provenance: {
      transactionId: tx.transactionId, simulationId,
      preStateHash: currentState.stateHash, postStateHash: postState?.stateHash ?? null,
      capacityGraphHash: graph.graphHash, snapshotSetHash: currentState.snapshotBinding.snapshotSetHash,
      inputViewHash: simulationInputView.inputViewHash, ledgerPreHash, ledgerPostHash,
      runtimeVersion: CONTRACT_RUNTIME_VERSION, inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION,
      capacityGraphVersion: CAPACITY_GRAPH_VERSION, transactionSimulationVersion: TRANSACTION_SIMULATION_VERSION,
      chain: [
        { from: `transaction:${tx.transactionId}`, to: `selectedPath`, via: "caller-supplied explicit selection" },
        { from: "selectedPath", to: `phase3:rules:${selectedRules.map((r) => r.ruleId).join(",") || "none"}`, via: "capacity node source identity" },
        { from: "phase3:rules", to: "phase4a:evaluation", via: "capacity and condition expressions" },
        { from: "phase4a:evaluation", to: `phase4b:snapshots:${currentState.snapshotBinding.snapshotIds.join(",") || "none"}`, via: "strict financial input resolution" },
        { from: "phase4b:snapshots", to: `phase4d:overlay:${simulationInputView.inputViewHash.slice(0, 12)}`, via: "explicit pro-forma adjustments" },
        { from: "phase4d:overlay", to: `phase4c:preState:${currentState.stateHash.slice(0, 12)}`, via: "capacity state and consumption ledger" },
        { from: "phase4c:preState", to: `phase4d:proposedEffects:${proposed.length}`, via: "explicit transaction effects" },
        { from: "phase4d:proposedEffects", to: postState ? `phase4c:postState:${postState.stateHash.slice(0, 12)}` : "postState:null", via: "re-evaluation over the proposed ledger" },
      ],
      inheritedLimitations: [
        ...currentState.limitations.map((l) => ({ origin: "phase4c:preState", code: l.code, message: l.message })),
        ...(postOverlayState?.capacities.filter((c) => selectedNodeIds.has(c.capacityNodeId)).flatMap((c) => c.limitations.map((l) => ({ origin: `phase4c:capacity:${c.capacityNodeId}`, code: l.code, message: l.message }))) ?? []),
      ].sort((a, b) => (`${a.origin}|${a.code}` < `${b.origin}|${b.code}` ? -1 : 1)),
    },
    complexity, commitPlan,
    notComputed: {
      pathSelection: "NOT_COMPUTED_IN_PHASE_4D",
      maximumTransactionAmount: "NOT_COMPUTED_IN_PHASE_4D",
      allocationAcrossCapacities: "NOT_COMPUTED_IN_PHASE_4D",
      alternativePathComparison: "NOT_COMPUTED_IN_PHASE_4D",
      accountingTreatment: "NOT_COMPUTED_IN_PHASE_4D",
      currencyConversion: "NOT_COMPUTED_IN_PHASE_4D",
    },
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** The stated split must add up to the stated total. Phase 4D checks it; it never derives one. */
function checkAllocation(intended: TransactionQuantity | null, unallocated: TransactionQuantity | null, consumes: ConsumeCapacityEffect[]): { code: "INVALID_EXPLICIT_ALLOCATION"; message: string; refs: string[] } | null {
  if (!intended || intended.type !== "MONEY") return null;
  const refs = consumes.map((c) => c.effectId).sort();
  const parts: RuntimeValue[] = [
    ...consumes.filter((c) => c.amount.type === "MONEY").map((c) => quantityToRuntimeValue(c.amount)),
    ...(unallocated && unallocated.type === "MONEY" ? [quantityToRuntimeValue(unallocated)] : []),
  ];
  if (parts.length === 0) return null;
  // Summed through the Phase-4A unit algebra, which refuses a mixed-currency total rather than
  // converting one side into the other.
  const total = addAll(parts, L);
  if (!total.ok) return { code: "INVALID_EXPLICIT_ALLOCATION", message: total.message, refs };
  const cmp = compareValues(total.value, quantityToRuntimeValue(intended));
  if (!cmp.ok) return { code: "INVALID_EXPLICIT_ALLOCATION", message: cmp.message, refs };
  if (cmp.cmp === 0) return null;
  const totalSerialized = serializeValue(total.value);
  return {
    code: "INVALID_EXPLICIT_ALLOCATION",
    message: `the stated draws${unallocated ? " plus the stated unallocated amount" : ""} total ${totalSerialized.type === "MONEY" ? totalSerialized.amount : "an amount that is not money"} but the transaction states an intended amount of ${intended.amount} ${intended.currency}; Phase 4D does not resize, rebalance or absorb the difference`,
    refs,
  };
}

/** Measure one explicit draw against one explicitly selected capacity. Legal state dominates. */
function consumptionResult(e: ConsumeCapacityEffect, ruleId: string | null, sharedCapacityId: string | null, entry: CapacityStateEntry | null): CapacityEffectResult {
  const limitations: SimulationLimitation[] = [];
  const base = {
    effectId: e.effectId, capacityNodeId: e.capacityNodeId, ruleId, sharedCapacityId,
    attemptedAmount: e.amount, sharedConstraintIds: entry?.sharedConstraintIds ?? [],
  };
  if (!entry) {
    limitations.push({ code: "SELECTED_PATH_NOT_FOUND", message: `capacity node ${e.capacityNodeId} has no state entry; a draw is never made against a capacity that was not evaluated`, refs: [e.capacityNodeId] });
    return { ...base, availableAmount: { kind: "NOT_DETERMINED", reason: "no capacity state entry" }, shortfallAmount: null, outcome: "INDETERMINATE", capacityStatus: "UNSUPPORTED", provisional: null, limitations };
  }
  if (e.amount.type !== "MONEY") {
    limitations.push({ code: "INCOMPATIBLE_UNIT", message: `effect ${e.effectId} draws a ${e.amount.type} amount against a capacity; a capacity draw is money`, refs: [e.effectId] });
    return { ...base, availableAmount: entry.effectiveRemaining, shortfallAmount: null, outcome: "INDETERMINATE", capacityStatus: entry.status, provisional: null, limitations };
  }
  // Narrowed once, so the closure below reads an amount that is known to be money.
  const amount: Extract<TransactionQuantity, { type: "MONEY" }> = e.amount;
  for (const l of entry.limitations) {
    if (l.code === "SHARED_CAPACITY_NOT_QUANTIFIED") limitations.push({ code: "SHARED_CAPACITY_NOT_QUANTIFIED", message: l.message, refs: l.refs });
    if (l.code === "PHASE3_RULE_NOT_SAFE_TO_RELY_ON" || l.code === "PHASE3_RULE_AMBIGUOUS") limitations.push({ code: "PHASE3_RULE_NOT_SAFE_TO_RELY_ON", message: l.message, refs: l.refs });
    if (l.code === "PHASE3_RULE_UNSUPPORTED") limitations.push({ code: "PHASE3_RULE_UNSUPPORTED", message: l.message, refs: l.refs });
    if (l.code === "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON") limitations.push({ code: "ENTITY_SCOPE_NOT_SAFE_TO_RELY_ON", message: l.message, refs: l.refs });
    if (l.code === "MISSING_FINANCIAL_INPUT") limitations.push({ code: "MISSING_FINANCIAL_INPUT", message: l.message, refs: l.refs });
    if (l.code === "AMBIGUOUS_FINANCIAL_INPUT") limitations.push({ code: "AMBIGUOUS_FINANCIAL_INPUT", message: l.message, refs: l.refs });
  }
  const measure = (available: CapacityAmount): { outcome: SelectedPathResult; shortfall: CapacityEffectResult["shortfallAmount"]; note: SimulationLimitation | null } => {
    if (available.kind === "UNLIMITED") return { outcome: "SATISFIED", shortfall: null, note: null };
    if (available.kind === "GATE_NOT_SATISFIED") return { outcome: "NOT_SATISFIED", shortfall: null, note: { code: "CAPACITY_GATE_NOT_SATISFIED", message: `capacity ${e.capacityNodeId} is gated and its gate is not satisfied, so it yields nothing for this transaction`, refs: [e.capacityNodeId] } };
    if (available.kind === "NOT_DETERMINED") return { outcome: "INDETERMINATE", shortfall: null, note: { code: "CAPACITY_NOT_DETERMINED", message: `capacity ${e.capacityNodeId} has no determined remaining amount (${available.reason}); the draw can be neither satisfied nor refused`, refs: [e.capacityNodeId] } };
    const availableValue = amountValue(available);
    const attempted = quantityToRuntimeValue(amount);
    if (!availableValue) return { outcome: "INDETERMINATE", shortfall: null, note: { code: "INCOMPATIBLE_UNIT", message: `capacity ${e.capacityNodeId} is not denominated as a money amount, so a money draw cannot be measured against it`, refs: [e.capacityNodeId] } };
    if (amountCurrency(available) !== amount.currency) {
      return { outcome: "NOT_SATISFIED", shortfall: null, note: { code: "CURRENCY_MISMATCH_NO_CONVERSION_MODELED", message: `the draw is ${amount.currency} and capacity ${e.capacityNodeId} is ${amountCurrency(available)}; no conversion is modelled and the runtime does not normalize currencies`, refs: [e.effectId, e.capacityNodeId] } };
    }
    const cmp = compareValues(availableValue, attempted);
    if (!cmp.ok) return { outcome: "INDETERMINATE", shortfall: null, note: { code: "INCOMPATIBLE_UNIT", message: cmp.message, refs: [e.effectId] } };
    if (cmp.cmp >= 0) return { outcome: "SATISFIED", shortfall: null, note: null };
    const short = subtractValues(attempted, availableValue, L);
    return {
      outcome: "INSUFFICIENT_CAPACITY",
      shortfall: short.ok ? serializeValue(short.value) : null,
      note: { code: "INSUFFICIENT_CAPACITY", message: `the transaction draws ${amount.amount} ${amount.currency} against capacity ${e.capacityNodeId}, which leaves ${available.value.type === "MONEY" ? available.value.amount : "an amount that is not money"}; the shortfall is reported and the transaction is never resized to fit`, refs: [e.effectId, e.capacityNodeId] },
    };
  };

  // An unsafe legal state is measured only provisionally: the arithmetic is computed and reported,
  // and it never becomes an authoritative permission.
  const legalUnsafe = entry.status === "REVIEW_REQUIRED" || entry.status === "AMBIGUOUS" || entry.status === "UNSUPPORTED";
  const authoritative = measure(entry.effectiveRemaining);
  if (authoritative.note) limitations.push(authoritative.note);
  let provisional: CapacityEffectResult["provisional"] = null;
  let outcome = authoritative.outcome;
  if (legalUnsafe && entry.provisional) {
    const p = measure(entry.provisional.effectiveRemaining);
    provisional = { availableAmount: entry.provisional.effectiveRemaining, shortfallAmount: p.shortfall, outcome: p.outcome };
    outcome = worstPath([entry.status === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : "INDETERMINATE", p.outcome]);
  } else if (entry.status === "NEEDS_INPUT") {
    outcome = "INDETERMINATE";
  }
  return { ...base, availableAmount: entry.effectiveRemaining, shortfallAmount: authoritative.shortfall, outcome, capacityStatus: entry.status, provisional, limitations };
}

function conditionOutcome(evaluation: EvaluationResult | null, unsafeLegal: boolean, referencesDefinitionId: string | null): { result: ConditionResult["result"]; reason: string } {
  if (unsafeLegal) return { result: "REVIEW_REQUIRED", reason: "the Phase-3 rule this condition belongs to is not fully represented, so the condition's result is not relied on" };
  if (!evaluation) return { result: "UNSUPPORTED", reason: referencesDefinitionId ? `the condition references ${referencesDefinitionId} and carries no boolean expression of its own` : "the condition is real but carries no boolean expression, so it cannot be evaluated" };
  if (evaluation.status === "NEEDS_INPUT") return { result: "NEEDS_INPUT", reason: `missing: ${evaluation.missingInputKeys.join(", ") || "an input the condition depends on"}` };
  if (evaluation.status === "AMBIGUOUS") return { result: "AMBIGUOUS", reason: "a fact the condition depends on resolved ambiguously" };
  if (evaluation.status === "UNSUPPORTED" || evaluation.status === "ERROR") return { result: "UNSUPPORTED", reason: evaluation.diagnostics.map((d) => d.message)[0] ?? "the condition could not be evaluated" };
  const v = evaluation.value;
  if (!v || v.type !== "BOOLEAN") return { result: "UNSUPPORTED", reason: `the condition evaluated to ${v?.type ?? "no value"} rather than a boolean` };
  return v.value ? { result: "SATISFIED", reason: "evaluated true against the pro-forma input view" } : { result: "NOT_SATISFIED", reason: "evaluated false against the pro-forma input view" };
}

/** Phase-3 entity scope, read as it stands. Never widened, never guessed. */
function entityScopeOutcome(rule: IRRule, transactionEntities: readonly string[]): EntityScopeResult {
  const audit = rule.entityScopeAudit;
  const base = {
    ruleId: rule.ruleId, transactionEntities: [...transactionEntities].sort() as EntityScopeResult["transactionEntities"],
    ruleEntityScope: rule.entityScope, ruleEntityScopeExcluded: rule.entityScopeExcluded,
    auditStatus: audit?.status ?? null, safeToRely: audit?.safeToRely ?? null,
  };
  if (audit && audit.safeToRely === false) return { ...base, outcome: "SCOPE_NOT_SAFE_TO_RELY_ON", reason: `the Phase-3 entity-scope guard marked rule ${rule.ruleId} not safe to rely on (${audit.status}); the transaction's entities are not confirmed against it and the scope is never widened to make the path work` };
  const excluded = transactionEntities.filter((x) => (rule.entityScopeExcluded as readonly string[]).includes(x)).sort();
  if (excluded.length > 0) return { ...base, outcome: "CONFIRMED_EXCLUDED", reason: `rule ${rule.ruleId} expressly excludes ${excluded.join(", ")}, which the transaction names; the selected path does not apply to this transaction` };
  if (transactionEntities.length === 0) return { ...base, outcome: "NO_TRANSACTION_ENTITIES_SUPPLIED", reason: "the transaction names no entity, so no entity claim is made either way; Phase 4D checks the entities a transaction states and never supplies one" };
  if (rule.entityScope.length === 0) return { ...base, outcome: "SCOPE_UNSPECIFIED", reason: `rule ${rule.ruleId} declares no entity scope, so whether it reaches ${[...transactionEntities].sort().join(", ")} is not established` };
  const covered = transactionEntities.every((x) => (rule.entityScope as readonly string[]).includes(x));
  if (covered) return { ...base, outcome: "CONFIRMED_APPLICABLE", reason: `every entity the transaction names appears in rule ${rule.ruleId}'s declared scope` };
  return { ...base, outcome: "NOT_IN_DECLARED_SCOPE", reason: `rule ${rule.ruleId} declares a scope that does not include ${transactionEntities.filter((x) => !(rule.entityScope as readonly string[]).includes(x)).sort().join(", ")}; the scope is reported as it stands and is never widened` };
}

const entityScopePathResult = (o: EntityScopeResult["outcome"]): SelectedPathResult =>
  o === "CONFIRMED_APPLICABLE" || o === "NO_TRANSACTION_ENTITIES_SUPPLIED" ? "SATISFIED"
    : o === "CONFIRMED_EXCLUDED" ? "NOT_APPLICABLE"
      : o === "NOT_IN_DECLARED_SCOPE" ? "NOT_SATISFIED" : "REVIEW_REQUIRED";
