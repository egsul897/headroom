/**
 * PHASE 4D test helpers. Every identifier here is arbitrary test data; production reads none of
 * them. The identifiers are deliberately unlike the Phase-4C suite's, so a passing matrix is
 * evidence about the engine rather than about one naming convention.
 */
import type { IRDefinition, IRExpression, IRCapacityExpression, IRRule, IRSharedCapacity } from "@/lib/contract-model/ir/types";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { InputResolver, RuntimeValue } from "@/lib/contract-model/runtime/types";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import type { FinancialInput, FinancialInputIdentity, FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import { buildCapacityGraph, evaluateCapacityState } from "@/lib/contract-model/runtime/capacity";
import type { CapacityGraph, CapacityPathRef, CapacityState, LedgerUsageRecord, ReclassificationElection } from "@/lib/contract-model/runtime/capacity/types";
import { simulateTransaction } from "@/lib/contract-model/runtime/transaction";
import type {
  ApplyReclassificationEffect, ChangeMetricEffect, ConsumeCapacityEffect, EventStateEffect,
  HypotheticalTransaction, RestoreCapacityEffect, SelectedPath, SupersedeLedgerUsageEffect,
  TransactionEffect, TransactionQuantity, TransactionSimulationResult,
} from "@/lib/contract-model/runtime/transaction/types";

export const ORG = "tx-org";
export const FACILITY = "tx-facility";
export const WHEN = "2026-06-30";

let n = 0;
export const resetIds = () => { n = 0; };
const nid = () => `t${++n}`;

// --- IR builders -----------------------------------------------------------
export const MONEY = (amount: number, currency = "USD"): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency, exprId: nid() });
export const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: nid() });
export const RATIO = (value: number): IRExpression => ({ kind: "RATIO", type: "RATIO", value, exprId: nid() });
export const FIGURE = (key: string, type: "MONEY" | "RATIO" = "MONEY"): IRExpression => ({ kind: "METRIC_REFERENCE", type, metricName: key, companyId: ORG, instrumentKey: FACILITY, resolvedDefinitionId: null, exprId: nid() });
export const MUL = (...operands: IRExpression[]): IRExpression => ({ kind: "MULTIPLY", type: "MONEY", operands, exprId: nid() });
export const ADD = (...operands: IRExpression[]): IRExpression => ({ kind: "ADD", type: "MONEY", operands, exprId: nid() });
export const LTE = (left: IRExpression, right: IRExpression): IRExpression => ({ kind: "COMPARE", type: "BOOLEAN", left, operator: "LTE", right, exprId: nid() });
export const UNLIMITED = (gatedBy: IRExpression | null = null): IRCapacityExpression => ({ kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy });
export const EVENT = (eventDescription: string): IRExpression => ({ kind: "EVENT_ACTIVE", type: "BOOLEAN", eventDescription, triggerCondition: null, activeDuration: null, exprId: nid() });

export function provision(ruleId: string, capacityExpression: IRCapacityExpression | null, over: Partial<IRRule> = {}): IRRule {
  return {
    ruleId, irSchemaVersion: "t", companyId: ORG, instrumentKey: FACILITY, sourceDocumentId: "doc",
    sourceSectionRef: `ref-${ruleId}`, covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], transactionScope: null,
    capacityExpression, conditions: [], exceptions: [], dependsOn: [], operativeLineage: null,
    sufficiency: "COMPLETE", sufficiencyReasons: [],
    provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: `cite-${ruleId}`, excerpt: null },
    compilerVersion: null, sourceContentVersion: null, ...over,
  };
}

export function pool(sharedCapId: string, capExpression: IRCapacityExpression, memberRuleIds: string[], over: Partial<IRSharedCapacity> = {}): IRSharedCapacity {
  return { sharedCapId, companyId: ORG, instrumentKey: FACILITY, description: `resource ${sharedCapId}`, capExpression, memberRuleIds, provenance: null, ...over };
}

export const condition = (conditionId: string, expression: IRExpression | null, description = `condition ${conditionId}`) =>
  ({ conditionId, conditionType: "OTHER" as never, expression, referencesDefinitionId: null, description, provenance: null });

export const scopeAudit = (status: string, safeToRely: boolean) => ({
  entityScopeAudit: {
    guardVersion: "t", status, safeToRely, reasonCodes: [],
    rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "EMPTY" }, tagNormalization: [],
    before: { entityScope: [], entityScopeExcluded: [], sufficiency: "COMPLETE" },
    witness: { ownExcerpt: null, citedUnitLeadIn: null, decidedBy: "NONE", signals: [] },
  },
} as never);

// --- financial facts -------------------------------------------------------
const mv = (amount: string, currency = "USD"): RuntimeValue => ({ type: "MONEY", amount: rationalFromString(amount), currency, lineage: { exprId: null, inputKeys: [] } });
const rv = (value: string): RuntimeValue => ({ type: "RATIO", value: rationalFromString(value), lineage: { exprId: null, inputKeys: [] } });

export function figure(key: string, amount: string, over: Partial<FinancialInputIdentity> & { type?: "MONEY" | "RATIO"; currency?: string | null } = {}): FinancialInput {
  const type = over.type ?? "MONEY";
  const currency = over.currency !== undefined ? over.currency : type === "MONEY" ? "USD" : null;
  const identity: FinancialInputIdentity = {
    companyId: ORG, scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: FACILITY }, inputKind: "METRIC", key,
    identityStrength: "CONTRACT_NAME_ONLY", period: { kind: "NOT_PERIOD_SPECIFIC" }, asOf: { kind: "EXACT_DATE", isoDate: WHEN },
    valueType: type, currency, ...over,
  };
  return { identity, value: type === "MONEY" ? mv(amount, currency ?? "USD") : rv(amount), sourceVersion: "src-1" };
}

export const pack = (inputs: FinancialInput[], over: Partial<FinancialSnapshot> = {}): FinancialSnapshot => ({
  snapshotId: "pack-1", version: "1", companyId: ORG, asOf: WHEN, reportingPeriod: "period-1", status: "APPROVED",
  supersedesSnapshotId: null, provenance: { source: "test reporting pack", sourceVersion: "v1" },
  review: { reviewedBy: "reviewer", reviewedAt: "2026-07-01T00:00:00Z", approvalRef: "approval-1" }, inputs, ...over,
});

export const resolverFor = (inputs: FinancialInput[], definitions: IRDefinition[] = [], rules: IRRule[] = [], snapshotId = "pack-1"): InputResolver =>
  inputs.length === 0 && definitions.length === 0 && rules.length === 0
    ? EMPTY_RESOLVER
    : snapshotInputResolver({ snapshots: [pack(inputs, { snapshotId })], definitions, rules, companyId: ORG, instrumentKey: FACILITY });

// --- ledger ----------------------------------------------------------------
export function usage(usageId: string, amount: string, path: CapacityPathRef, over: Partial<LedgerUsageRecord> = {}): LedgerUsageRecord {
  return {
    usageId, companyId: ORG, instrumentKey: FACILITY, effectiveAsOf: "2026-01-31",
    amount: { amount, currency: "USD" }, capacityPath: path, transactionRef: `hist-${usageId}`,
    status: "RECORDED", supersededByUsageId: null,
    provenance: { source: "historical ledger", sourceVersion: "v1", approvalRef: "hist-approval", approvalState: "APPROVED" },
    ...over,
  };
}
export const onProvision = (ruleId: string): CapacityPathRef => ({ kind: "RULE", ruleId });
export const onPool = (sharedCapacityId: string): CapacityPathRef => ({ kind: "SHARED_CAPACITY", sharedCapacityId });
export const nodeOf = (ruleId: string) => `capacity:rule:${ruleId}`;
export const poolNodeOf = (sharedCapacityId: string) => `capacity:shared:${sharedCapacityId}`;

// --- world -----------------------------------------------------------------
export interface World {
  graph: CapacityGraph;
  state: CapacityState;
  inputs: InputResolver;
  context: Parameters<typeof simulateTransaction>[0]["context"];
}

export function world(opts: { rules: IRRule[]; pools?: IRSharedCapacity[]; ledger?: LedgerUsageRecord[]; facts?: FinancialInput[]; definitions?: IRDefinition[]; snapshotId?: string }): World {
  const rules = opts.rules;
  const pools = opts.pools ?? [];
  const ledger = opts.ledger ?? [];
  const definitions = opts.definitions ?? [];
  const inputs = resolverFor(opts.facts ?? [], definitions, rules, opts.snapshotId ?? "pack-1");
  const graph = buildCapacityGraph({ rules, sharedCapacities: pools, definitions, companyId: ORG, instrumentKey: FACILITY, asOf: WHEN });
  const state = evaluateCapacityState({ graph, rules, sharedCapacities: pools, definitions, inputs, ledger, asOf: WHEN });
  return { graph, state, inputs, context: { rules, sharedCapacities: pools, definitions, ledger, asOf: WHEN } };
}

// --- transaction builders --------------------------------------------------
export const cash = (amount: string, currency = "USD"): TransactionQuantity => ({ type: "MONEY", amount, currency });

export const consume = (effectId: string, capacityNodeId: string, amount: TransactionQuantity, over: Partial<ConsumeCapacityEffect> = {}): ConsumeCapacityEffect =>
  ({ effectId, kind: "CONSUME_CAPACITY", capacityNodeId, amount, ...over });
export const restore = (effectId: string, usageId: string, reason = "released"): RestoreCapacityEffect =>
  ({ effectId, kind: "RESTORE_CAPACITY", usageId, reason });
export const supersede = (effectId: string, usageId: string, replacementAmount: TransactionQuantity | null, reason = "restated"): SupersedeLedgerUsageEffect =>
  ({ effectId, kind: "SUPERSEDE_LEDGER_USAGE", usageId, replacementAmount, reason });
export const reclassify = (effectId: string, election: ReclassificationElection): ApplyReclassificationEffect =>
  ({ effectId, kind: "APPLY_RECLASSIFICATION", election });
export const adjustFigure = (effectId: string, metricKey: string, kind: "DELTA" | "SET", value: TransactionQuantity, over: Partial<ChangeMetricEffect> = {}): ChangeMetricEffect =>
  ({ effectId, kind: "CHANGE_METRIC", metricKey, period: null, asOf: WHEN, adjustment: { kind, value }, ...over });
export const setEvent = (effectId: string, eventDescription: string, active: boolean): EventStateEffect =>
  ({ effectId, kind: active ? "ACTIVATE_EVENT" : "DEACTIVATE_EVENT", eventDescription, asOf: WHEN });

export const election = (electionId: string, sourceRuleId: string, destinationRuleId: string, amount: string): ReclassificationElection =>
  ({ electionId, sourceRuleId, destinationRuleId, amount: { amount, currency: "USD" }, effectiveAsOf: "2026-03-31", provenance: { source: "board election", sourceVersion: "v1", approvalRef: "approval-e" } });

export function proposal(transactionId: string, effects: TransactionEffect[], over: Partial<HypotheticalTransaction> = {}): HypotheticalTransaction {
  return {
    transactionId, companyId: ORG, instrumentKey: FACILITY, effectiveAsOf: WHEN,
    category: null, label: null, effects,
    provenance: { source: "caller-supplied hypothetical", sourceVersion: "v1", approvalRef: null },
    ...over,
  };
}

export const route = (over: Partial<SelectedPath> = {}): SelectedPath =>
  ({ capacityNodeIds: [], ruleIds: [], sharedCapacityIds: [], reclassificationElectionIds: [], ...over });

export const simulate = (w: World, transaction: HypotheticalTransaction, selectedPath: SelectedPath): TransactionSimulationResult =>
  simulateTransaction({ transaction, currentState: w.state, capacityGraph: w.graph, selectedPath, inputs: w.inputs, context: w.context });

/** The exact money amount of a capacity amount, or its kind when it is not a plain amount. */
export const amountOf = (a: { kind: string; value?: { type: string; amount?: string } }): string | null =>
  a.kind === "AMOUNT" && a.value?.type === "MONEY" ? a.value.amount ?? null : null;
export const codes = (ls: { code: string }[]): string[] => ls.map((l) => l.code).sort();

/**
 * Chain a simulation: the resulting proposed state and proposed ledger become the pre-state of the
 * next transaction. This is how a sequence is modelled - Phase 4D never chains inside one
 * transaction, so a caller who wants Tx2 to see Tx1's consequences states two transactions.
 */
export function advance(w: World, r: TransactionSimulationResult): World {
  if (!r.postState) throw new Error("cannot chain from a simulation that published no post-state");
  const supersededIds = new Map(r.ledgerEffects.superseded.map((s) => [s.originalUsageId, s.proposed]));
  const ledger: LedgerUsageRecord[] = [
    ...(w.context.ledger ?? []).map((u) => supersededIds.get(u.usageId) ?? u),
    ...r.ledgerEffects.proposed.map((p) => p.record),
  ];
  return { ...w, state: r.postState, context: { ...w.context, ledger } };
}
