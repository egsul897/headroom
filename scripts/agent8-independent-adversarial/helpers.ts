/**
 * Agent 8 — independent adversarial helpers.
 * Hand-built IR and arithmetic only. Expectations are independently calculated
 * from Phase-2 adversarial scenarios / authentic agreement mechanics — never
 * captured from a prior engine run.
 */
import type { IRCapacityExpression, IRExpression, IRRule, IRSharedCapacity } from "../../lib/contract-model/ir/types";
import { rationalFromString } from "../../lib/contract-model/runtime/decimal";
import type { FinancialInput, FinancialSnapshot } from "../../lib/contract-model/runtime/input/types";
import type { CapacityPathRef, LedgerUsageRecord, UsageStatus } from "../../lib/contract-model/runtime/capacity/types";
import type { RuntimeValue } from "../../lib/contract-model/runtime/types";

export const CO = "agent8-company";
export const INST = "agent8-instrument";
export const AS_OF = "2026-06-30";

let n = 0;
export const resetIds = () => {
  n = 0;
};
const eid = () => `a8-${++n}`;

export const MONEY = (amount: number, currency = "USD"): IRExpression => ({
  kind: "MONEY",
  type: "MONEY",
  amount,
  currency,
  exprId: eid(),
});
export const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: eid() });
export const RATIO = (value: number): IRExpression => ({ kind: "RATIO", type: "RATIO", value, exprId: eid() });
export const METRIC = (metricName: string, type: "MONEY" | "RATIO" = "MONEY"): IRExpression => ({
  kind: "METRIC_REFERENCE",
  type,
  metricName,
  companyId: CO,
  instrumentKey: INST,
  resolvedDefinitionId: null,
  exprId: eid(),
});
export const MUL = (...operands: IRExpression[]): IRExpression => ({
  kind: "MULTIPLY",
  type: "MONEY",
  operands,
  exprId: eid(),
});
export const MAX = (...operands: IRExpression[]): IRExpression => ({
  kind: "MAX",
  type: "MONEY",
  operands,
  exprId: eid(),
});
export const ADD = (...operands: IRExpression[]): IRExpression => ({
  kind: "ADD",
  type: "MONEY",
  operands,
  exprId: eid(),
});
export const CMP = (
  left: IRExpression,
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ",
  right: IRExpression,
): IRExpression => ({
  kind: "COMPARE",
  type: "BOOLEAN",
  left,
  operator,
  right,
  exprId: eid(),
});
export const UNLIM = (gatedBy: IRExpression | null = null): IRCapacityExpression => ({
  kind: "UNLIMITED_CAPACITY",
  type: "CAPACITY",
  gatedBy,
});

export function rule(
  ruleId: string,
  capacityExpression: IRCapacityExpression | null,
  over: Partial<IRRule> = {},
): IRRule {
  return {
    ruleId,
    irSchemaVersion: "agent8-independent",
    companyId: CO,
    instrumentKey: INST,
    sourceDocumentId: "doc",
    sourceSectionRef: `section-${ruleId}`,
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: {
      documentId: "doc",
      sourceNodeKey: null,
      sourceCitation: `cite-${ruleId}`,
      excerpt: null,
    },
    compilerVersion: null,
    sourceContentVersion: null,
    ...over,
  };
}

export function shared(
  sharedCapId: string,
  capExpression: IRCapacityExpression,
  memberRuleIds: string[],
): IRSharedCapacity {
  return {
    sharedCapId,
    companyId: CO,
    instrumentKey: INST,
    description: sharedCapId,
    capExpression,
    memberRuleIds,
    provenance: null,
  };
}

export function usage(
  usageId: string,
  amount: string,
  ruleId: string,
  over: Partial<LedgerUsageRecord> = {},
): LedgerUsageRecord {
  return {
    usageId,
    companyId: CO,
    instrumentKey: INST,
    effectiveAsOf: "2026-01-31",
    amount: { amount, currency: "USD" },
    capacityPath: { kind: "RULE", ruleId } satisfies CapacityPathRef,
    transactionRef: `txn-${usageId}`,
    status: "RECORDED" as UsageStatus,
    supersededByUsageId: null,
    provenance: {
      source: "agent8 ledger",
      sourceVersion: "1",
      approvalRef: "a8",
      approvalState: "APPROVED",
    },
    ...over,
  };
}

const mv = (amount: string, currency = "USD"): RuntimeValue => ({
  type: "MONEY",
  amount: rationalFromString(amount),
  currency,
  lineage: { exprId: null, inputKeys: [] },
});
const rv = (value: string): RuntimeValue => ({
  type: "RATIO",
  value: rationalFromString(value),
  lineage: { exprId: null, inputKeys: [] },
});

export function moneyFact(key: string, amount: string, asOf = AS_OF): FinancialInput {
  return {
    identity: {
      companyId: CO,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
      inputKind: "METRIC",
      key,
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "NOT_PERIOD_SPECIFIC" },
      asOf: { kind: "EXACT_DATE", isoDate: asOf },
      valueType: "MONEY",
      currency: "USD",
    },
    value: mv(amount),
    sourceVersion: "a8-1",
  };
}

export function ratioFact(key: string, value: string, asOf = AS_OF): FinancialInput {
  return {
    identity: {
      companyId: CO,
      scope: { kind: "INSTRUMENT_LEVEL", instrumentKey: INST },
      inputKind: "METRIC",
      key,
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "NOT_PERIOD_SPECIFIC" },
      asOf: { kind: "EXACT_DATE", isoDate: asOf },
      valueType: "RATIO",
      currency: null,
    },
    value: rv(value),
    sourceVersion: "a8-1",
  };
}

export function approvedSnapshot(
  inputs: FinancialInput[],
  asOf = AS_OF,
  status: FinancialSnapshot["status"] = "APPROVED",
): FinancialSnapshot {
  return {
    snapshotId: `snap-${asOf}-${status}`,
    version: "1",
    companyId: CO,
    asOf,
    reportingPeriod: `period-${asOf}`,
    status,
    supersedesSnapshotId: null,
    provenance: { source: "agent8", sourceVersion: "1" },
    review:
      status === "APPROVED"
        ? { reviewedBy: "a8", reviewedAt: `${asOf}T00:00:00Z`, approvalRef: "a8-appr" }
        : { reviewedBy: null, reviewedAt: null, approvalRef: null },
    inputs,
  };
}

export const moneyAmount = (a: { kind: string; value?: { type?: string; amount?: string } } | undefined): string | null =>
  a && a.kind === "AMOUNT" && a.value?.type === "MONEY" ? (a.value.amount ?? null) : null;

export const isNotDetermined = (a: { kind: string } | undefined): boolean => !!a && a.kind === "NOT_DETERMINED";
