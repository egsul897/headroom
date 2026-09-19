/** Phase 4C test helpers. Every rule id, metric name and shared-cap id here is arbitrary test data. */
import type { IRDefinition, IRExpression, IRCapacityExpression, IRRule, IRSharedCapacity } from "@/lib/contract-model/ir/types";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "@/lib/contract-model/runtime/types";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input";
import type { FinancialInput, FinancialInputIdentity, FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
import type { LedgerUsageRecord, CapacityPathRef, UsageStatus } from "@/lib/contract-model/runtime/capacity/types";

export const CO = "capacity-company";
export const CO2 = "capacity-other-company";
export const INST = "capacity-instrument";
export const INST2 = "capacity-other-instrument";
export const AS_OF = "2026-06-30";

let n = 0;
export const resetIds = () => { n = 0; };
export const id = () => `x${++n}`;

export const MONEY = (amount: number, currency = "USD"): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency, exprId: id() });
export const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: id() });
export const RATIO = (value: number): IRExpression => ({ kind: "RATIO", type: "RATIO", value, exprId: id() });
export const METRIC = (metricName: string, type: "MONEY" | "RATIO" | "NUMBER" = "MONEY", companyId = CO, instrumentKey = INST): IRExpression =>
  ({ kind: "METRIC_REFERENCE", type, metricName, companyId, instrumentKey, resolvedDefinitionId: null, exprId: id() });
export const MUL = (...operands: IRExpression[]): IRExpression => ({ kind: "MULTIPLY", type: "MONEY", operands, exprId: id() });
export const ADD = (...operands: IRExpression[]): IRExpression => ({ kind: "ADD", type: "MONEY", operands, exprId: id() });
export const MAX = (...operands: IRExpression[]): IRExpression => ({ kind: "MAX", type: "MONEY", operands, exprId: id() });
export const MIN = (...operands: IRExpression[]): IRExpression => ({ kind: "MIN", type: "MONEY", operands, exprId: id() });
export const CMP = (left: IRExpression, right: IRExpression): IRExpression => ({ kind: "COMPARE", type: "BOOLEAN", left, operator: "LTE", right, exprId: id() });
export const UNSUPPORTED = (reason: string): IRExpression => ({ kind: "UNSUPPORTED", type: null, sourceEvidence: "test evidence", semanticDescription: reason, reason, requiredReview: true, exprId: id() });
export const UNLIMITED = (gatedBy: IRExpression | null = null): IRCapacityExpression => ({ kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy });

export function rule(ruleId: string, capacityExpression: IRCapacityExpression | null, over: Partial<IRRule> = {}): IRRule {
  return {
    ruleId, irSchemaVersion: "t", companyId: CO, instrumentKey: INST, sourceDocumentId: "doc",
    sourceSectionRef: `section-for-${ruleId}`, covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], transactionScope: null,
    capacityExpression, conditions: [], exceptions: [], dependsOn: [], operativeLineage: null,
    sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: `citation-${ruleId}`, excerpt: null },
    compilerVersion: null, sourceContentVersion: null, ...over,
  };
}

export function sharedCap(sharedCapId: string, capExpression: IRCapacityExpression, memberRuleIds: string[], over: Partial<IRSharedCapacity> = {}): IRSharedCapacity {
  return { sharedCapId, companyId: CO, instrumentKey: INST, description: `pool ${sharedCapId}`, capExpression, memberRuleIds, provenance: null, ...over };
}

export function definition(definitionId: string, termName: string, calculationExpression: IRDefinition["calculationExpression"], over: Partial<IRDefinition> = {}): IRDefinition {
  return { definitionId, irSchemaVersion: "t", companyId: CO, instrumentKey: INST, sourceDocumentId: "doc", termName, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression, dependsOnTerms: [], sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, compilerVersion: null, sourceContentVersion: null, ...over };
}

// --- financial facts ------------------------------------------------------
const mv = (amount: string, currency = "USD"): RuntimeValue => ({ type: "MONEY", amount: rationalFromString(amount), currency, lineage: { exprId: null, inputKeys: [] } });
const rv = (value: string): RuntimeValue => ({ type: "RATIO", value: rationalFromString(value), lineage: { exprId: null, inputKeys: [] } });

export function fact(key: string, amount: string, over: Partial<FinancialInputIdentity> & { type?: "MONEY" | "RATIO"; currency?: string | null } = {}): FinancialInput {
  const type = over.type ?? "MONEY";
  const currency = over.currency !== undefined ? over.currency : type === "MONEY" ? "USD" : null;
  const identity: FinancialInputIdentity = {
    companyId: CO, scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST }, inputKind: "METRIC", key,
    identityStrength: "CONTRACT_NAME_ONLY", period: { kind: "NOT_PERIOD_SPECIFIC" }, asOf: { kind: "EXACT_DATE", isoDate: AS_OF },
    valueType: type, currency, ...over,
  };
  return { identity, value: type === "MONEY" ? mv(amount, currency ?? "USD") : rv(amount), sourceVersion: "src-v1" };
}

export function snapshot(inputs: FinancialInput[], over: Partial<FinancialSnapshot> = {}): FinancialSnapshot {
  return {
    snapshotId: "snap-1", version: "1", companyId: CO, asOf: AS_OF, reportingPeriod: "period-1", status: "APPROVED",
    supersedesSnapshotId: null, provenance: { source: "test snapshot", sourceVersion: "pack-1" },
    review: { reviewedBy: "reviewer", reviewedAt: "2026-07-01T00:00:00Z", approvalRef: "approval-1" }, inputs, ...over,
  };
}

export const resolver = (inputs: FinancialInput[], definitions: IRDefinition[] = [], rules: IRRule[] = []) =>
  snapshotInputResolver({ snapshots: [snapshot(inputs)], definitions, rules, companyId: CO, instrumentKey: INST });

// --- ledger ---------------------------------------------------------------
export function usage(usageId: string, amount: string, path: CapacityPathRef, over: Partial<LedgerUsageRecord> = {}): LedgerUsageRecord {
  return {
    usageId, companyId: CO, instrumentKey: INST, effectiveAsOf: "2026-01-31",
    amount: { amount, currency: "USD" }, capacityPath: path, transactionRef: `txn-${usageId}`,
    status: "RECORDED" as UsageStatus, supersededByUsageId: null,
    provenance: { source: "test ledger", sourceVersion: "ledger-1", approvalRef: "usage-approval", approvalState: "APPROVED" },
    ...over,
  };
}
export const onRule = (ruleId: string): CapacityPathRef => ({ kind: "RULE", ruleId });
export const onShared = (sharedCapacityId: string): CapacityPathRef => ({ kind: "SHARED_CAPACITY", sharedCapacityId });
export const unresolved = (candidateRuleIds: string[], reason = "the historical record does not establish which permission was used"): CapacityPathRef => ({ kind: "UNRESOLVED", candidateRuleIds, reason });

/** Read the money amount out of a capacity amount, or null when it is not a plain amount. */
export const amountString = (a: { kind: string; value?: { type: string; amount?: string } }): string | null =>
  a.kind === "AMOUNT" && a.value?.type === "MONEY" ? a.value.amount ?? null : null;
