/** Phase 4B test helpers - snapshot and input builders. Metric keys are test data, never read by production code. */
import type { IRDefinition } from "@/lib/contract-model/ir/types";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "@/lib/contract-model/runtime/types";
import type { AsOfSelector, FinancialInput, FinancialInputIdentity, FinancialSnapshot, InputKind, InputScope, PeriodSelector, SnapshotStatus } from "@/lib/contract-model/runtime/input/types";

export const CO_A = "company-alpha";
export const CO_B = "company-beta";
export const INST_1 = "instrument-one";
export const INST_2 = "instrument-two";

export const money = (amount: string, currency = "USD"): RuntimeValue => ({ type: "MONEY", amount: rationalFromString(amount), currency, lineage: { exprId: null, inputKeys: [] } });
export const ratio = (value: string): RuntimeValue => ({ type: "RATIO", value: rationalFromString(value), lineage: { exprId: null, inputKeys: [] } });
export const bool = (value: boolean): RuntimeValue => ({ type: "BOOLEAN", value, lineage: { exprId: null, inputKeys: [] } });

export const instrumentScope = (instrumentKey: string): InputScope => ({ kind: "INSTRUMENT_LEVEL", instrumentKey });
export const companyScopeAll = (): InputScope => ({ kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "ALL_INSTRUMENTS" } });
export const companyScopeListed = (instrumentKeys: string[]): InputScope => ({ kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "LISTED", instrumentKeys } });

export const verbatimPeriod = (key: string): PeriodSelector => ({ kind: "VERBATIM_CONTRACT_PERIOD_KEY", key });
export const noPeriod = (): PeriodSelector => ({ kind: "NOT_PERIOD_SPECIFIC" });
export const exactAsOf = (isoDate: string): AsOfSelector => ({ kind: "EXACT_DATE", isoDate });
export const noAsOf = (): AsOfSelector => ({ kind: "NOT_AS_OF_SPECIFIC" });

export function identity(over: Partial<FinancialInputIdentity> & { key: string }): FinancialInputIdentity {
  return {
    companyId: CO_A,
    scope: instrumentScope(INST_1),
    inputKind: "METRIC" as InputKind,
    identityStrength: "CONTRACT_NAME_ONLY",
    period: noPeriod(),
    asOf: noAsOf(),
    valueType: "MONEY",
    currency: "USD",
    ...over,
  };
}

export function input(over: Partial<FinancialInput> & { identity: FinancialInputIdentity; value: RuntimeValue }): FinancialInput {
  return { sourceVersion: "src-v1", ...over };
}

export function snapshot(over: Partial<FinancialSnapshot> & { snapshotId: string; inputs: FinancialInput[] }): FinancialSnapshot {
  return {
    version: "1",
    companyId: CO_A,
    asOf: "2026-06-30",
    reportingPeriod: "FY2026-Q2",
    status: "APPROVED" as SnapshotStatus,
    supersedesSnapshotId: null,
    provenance: { source: "reviewed reporting pack", sourceVersion: "pack-v1" },
    review: { reviewedBy: "reviewer-1", reviewedAt: "2026-07-15T00:00:00Z", approvalRef: "approval-1" },
    ...over,
  };
}

export function definition(definitionId: string, termName: string, calculationExpression: IRDefinition["calculationExpression"], over: Partial<IRDefinition> = {}): IRDefinition {
  return {
    definitionId, irSchemaVersion: "t", companyId: CO_A, instrumentKey: INST_1, sourceDocumentId: "doc",
    termName, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression, dependsOnTerms: [],
    sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, compilerVersion: null, sourceContentVersion: null,
    ...over,
  };
}
