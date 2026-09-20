/** Phase 4A runtime test helpers - generic IR node builders (no covenant names in production; test labels are data). */
import type { IRDefinition, IRExpression, IRRule, IRValueType, SourceProvenance } from "@/lib/contract-model/ir/types";
import { fixtureInputResolver, metricInput, type FixtureInputs } from "@/lib/contract-model/runtime/input-resolver";
import { rationalFromString } from "@/lib/contract-model/runtime/decimal";
import type { InputProvenance, RuntimeValue } from "@/lib/contract-model/runtime/types";

let counter = 0;
export const resetIds = () => { counter = 0; };
const id = () => `ir-expr:test-${++counter}`;
export const prov = (citation: string, excerpt: string | null = null): SourceProvenance => ({ documentId: "doc-test", sourceNodeKey: null, sourceCitation: citation, excerpt });

export const MONEY = (amount: number, currency = "USD", p?: SourceProvenance): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency, exprId: id(), ...(p ? { provenance: p } : {}) });
export const NUM = (value: number): IRExpression => ({ kind: "NUMBER", type: "NUMBER", value, exprId: id() });
export const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: id() });
export const RATIO = (value: number): IRExpression => ({ kind: "RATIO", type: "RATIO", value, exprId: id() });
export const BOOL = (value: boolean): IRExpression => ({ kind: "BOOLEAN_LITERAL", type: "BOOLEAN", value, exprId: id() });
export const DATE = (isoDate: string): IRExpression => ({ kind: "DATE_LITERAL", type: "DATE", isoDate, exprId: id() });
export const METRIC = (metricName: string, type: "MONEY" | "RATIO" | "NUMBER" = "MONEY", p?: SourceProvenance): IRExpression => ({ kind: "METRIC_REFERENCE", type, metricName, companyId: "co", instrumentKey: "inst", resolvedDefinitionId: null, exprId: id(), ...(p ? { provenance: p } : {}) });
export const TERM = (termName: string, type: IRValueType = "MONEY", resolvedDefinitionId: string | null = null): IRExpression => ({ kind: "DEFINED_TERM_REFERENCE", type, termName, companyId: "co", instrumentKey: "inst", resolvedDefinitionId, exprId: id() });
export const RULEREF = (ruleId: string): IRExpression => ({ kind: "RULE_REFERENCE", type: "CAPACITY", ruleId, companyId: "co", instrumentKey: "inst", exprId: id() });
export const LEDGER = (sharedCapId: string | null, ruleId: string | null): IRExpression => ({ kind: "LEDGER_USAGE_REFERENCE", type: "MONEY", sharedCapId, ruleId, exprId: id() });
export const TX = (inputName: string, type: IRValueType = "MONEY"): IRExpression => ({ kind: "TRANSACTION_INPUT_REFERENCE", type, inputName, exprId: id() });
export const ADD = (...operands: IRExpression[]): IRExpression => ({ kind: "ADD", type: "MONEY", operands, exprId: id() });
export const SUM = (...operands: IRExpression[]): IRExpression => ({ kind: "SUM", type: "MONEY", operands, exprId: id() });
export const SUB = (left: IRExpression, right: IRExpression): IRExpression => ({ kind: "SUBTRACT", type: "MONEY", left, right, exprId: id() });
export const MUL = (...operands: IRExpression[]): IRExpression => ({ kind: "MULTIPLY", type: "MONEY", operands, exprId: id() });
export const DIV = (numerator: IRExpression, denominator: IRExpression, type: "NUMBER" | "RATIO" = "NUMBER"): IRExpression => ({ kind: "DIVIDE", type, numerator, denominator, exprId: id() });
export const MAX = (...operands: IRExpression[]): IRExpression => ({ kind: "MAX", type: "MONEY", operands, exprId: id() });
export const MIN = (...operands: IRExpression[]): IRExpression => ({ kind: "MIN", type: "MONEY", operands, exprId: id() });
export const CMP = (left: IRExpression, operator: "GT" | "GTE" | "LT" | "LTE" | "EQ", right: IRExpression): IRExpression => ({ kind: "COMPARE", type: "BOOLEAN", left, operator, right, exprId: id() });
export const AND = (...operands: IRExpression[]): IRExpression => ({ kind: "AND", type: "BOOLEAN", operands, exprId: id() });
export const OR = (...operands: IRExpression[]): IRExpression => ({ kind: "OR", type: "BOOLEAN", operands, exprId: id() });
export const NOT = (operand: IRExpression): IRExpression => ({ kind: "NOT", type: "BOOLEAN", operand, exprId: id() });
export const IF = (condition: IRExpression, then: IRExpression, els: IRExpression | null): IRExpression => ({ kind: "IF", type: "MONEY", condition, then, else: els, exprId: id() });
export const ASOF = (value: IRExpression, asOfDate: IRExpression | string): IRExpression => ({ kind: "AS_OF", type: "MONEY", value, asOfDate, exprId: id() });
export const DURING = (value: IRExpression, periodDescription: string): IRExpression => ({ kind: "DURING_PERIOD", type: "MONEY", value, periodDescription, exprId: id() });
export const SCHEDULE = (cases: { from: string | null; to: string | null; value: IRExpression }[], defaultValue: IRExpression | null = null): IRExpression => ({ kind: "SCHEDULE", type: "RATIO", cases: cases.map((c) => ({ ...c, description: "" })), defaultValue, exprId: id() });
export const EVENT = (eventDescription: string, triggerCondition: IRExpression | null, activeDuration: string | null): IRExpression => ({ kind: "EVENT_ACTIVE", type: "BOOLEAN", eventDescription, triggerCondition, activeDuration, exprId: id() });
export const UNSUP = (reason = "not representable"): IRExpression => ({ kind: "UNSUPPORTED", type: null, sourceEvidence: "(evidence)", semanticDescription: "an operand Phase 3 could not represent", reason, requiredReview: true, exprId: id() });

export const SRC: InputProvenance = { source: "FinancialSnapshot V3", sourceVersion: "v3", note: "test fixture" };
export const m = (amount: string, currency = "USD"): RuntimeValue => ({ type: "MONEY", amount: rationalFromString(amount), currency, lineage: { exprId: null, inputKeys: [] } });
export const n = (value: string): RuntimeValue => ({ type: "NUMBER", value: rationalFromString(value), lineage: { exprId: null, inputKeys: [] } });
export const r = (value: string): RuntimeValue => ({ type: "RATIO", value: rationalFromString(value), lineage: { exprId: null, inputKeys: [] } });
export const b = (value: boolean): RuntimeValue => ({ type: "BOOLEAN", value, lineage: { exprId: null, inputKeys: [] } });

export const resolver = (inputs: FixtureInputs) => fixtureInputResolver(inputs);
export const metrics = (...entries: [string, RuntimeValue, string?][]) => resolver({ metrics: entries.map(([k, v, period]) => metricInput(k, v, SRC, period ?? null)) });

export function definition(definitionId: string, termName: string, calculationExpression: IRExpression | null, sufficiency: IRDefinition["sufficiency"] = "COMPLETE", reasons: string[] = []): IRDefinition {
  return { definitionId, irSchemaVersion: "t", companyId: "co", instrumentKey: "inst", sourceDocumentId: "doc-test", termName, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression, dependsOnTerms: [], sufficiency, sufficiencyReasons: reasons, provenance: prov(`def ${termName}`), compilerVersion: null, sourceContentVersion: null };
}

export function rule(ruleId: string, capacityExpression: IRRule["capacityExpression"], overrides: Partial<IRRule> = {}): IRRule {
  return { ruleId, irSchemaVersion: "t", companyId: "co", instrumentKey: "inst", sourceDocumentId: "doc-test", sourceSectionRef: "7.02", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression, conditions: [], exceptions: [], dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: prov(`rule ${ruleId}`), compilerVersion: null, sourceContentVersion: null, ...overrides };
}
