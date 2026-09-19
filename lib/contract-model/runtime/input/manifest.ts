/**
 * PHASE 4B - the financial dependency manifest.
 *
 * Answers, before any evaluation is attempted: exactly which facts does this
 * expression or rule need, for which company, instrument, period and as-of, at
 * which type. Definitions and referenced rules are expanded, so a consumer
 * never has to run a failing evaluation and read the trace to discover what to
 * supply.
 */
import type { IRCapacityExpression, IRDefinition, IRExpression, IRRule, IRValueType } from "../../ir/types";
import { CONTRACT_RUNTIME_VERSION } from "../version";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "./version";
import { asOfSelectorFromContract, hashOf, periodSelectorFromContract } from "./identity";
import type { DependencyRecord, DependencyStatus, FinancialDependencyManifest, InputKind } from "./types";

export interface ManifestArgs {
  expression: IRCapacityExpression;
  definitions?: readonly IRDefinition[];
  rules?: readonly IRRule[];
  companyId?: string | null;
  instrumentKey?: string | null;
  ruleId?: string | null;
  /** The as-of the evaluation would run at, when known. */
  asOf?: string | null;
}

interface Env { period: string | null; asOf: string | null; status: DependencyStatus; conditionalOn: string | null; via: DependencyRecord["via"]; boundSibling: boolean }

/** True when a subtree needs no runtime input at all (literals and unsupported nodes only). */
function needsNoInput(expr: IRCapacityExpression): boolean {
  switch (expr.kind) {
    case "MONEY": case "NUMBER": case "PERCENT": case "RATIO": case "BOOLEAN_LITERAL": case "DATE_LITERAL": return true;
    case "UNSUPPORTED": return false;
    case "METRIC_REFERENCE": case "DEFINED_TERM_REFERENCE": case "RULE_REFERENCE": case "LEDGER_USAGE_REFERENCE": case "TRANSACTION_INPUT_REFERENCE": case "EVENT_ACTIVE": return false;
    case "ENTITY_SCOPE_REFERENCE": return true;
    case "UNLIMITED_CAPACITY": return expr.gatedBy ? needsNoInput(expr.gatedBy) : true;
    case "ADD": case "SUM": case "MULTIPLY": case "MAX": case "MIN": case "AND": case "OR": return expr.operands.every(needsNoInput);
    case "SUBTRACT": return needsNoInput(expr.left) && needsNoInput(expr.right);
    case "DIVIDE": return needsNoInput(expr.numerator) && needsNoInput(expr.denominator);
    case "COMPARE": return needsNoInput(expr.left) && needsNoInput(expr.right);
    case "NOT": return needsNoInput(expr.operand);
    case "IF": return needsNoInput(expr.condition) && needsNoInput(expr.then) && (expr.else ? needsNoInput(expr.else) : true);
    case "AS_OF": return needsNoInput(expr.value) && (typeof expr.asOfDate === "string" || needsNoInput(expr.asOfDate));
    case "DURING_PERIOD": return needsNoInput(expr.value);
    case "SCHEDULE": return false; // a schedule always needs an as-of to select a case
    default: return false;
  }
}

export function buildFinancialDependencyManifest(args: ManifestArgs): FinancialDependencyManifest {
  const definitions = args.definitions ?? [];
  const rules = args.rules ?? [];
  const records = new Map<string, DependencyRecord>();
  const expanded: { kind: "DEFINITION" | "RULE"; id: string }[] = [];
  const cycles: string[][] = [];
  const unsupportedNodes: { exprId: string | null; reason: string }[] = [];
  const stack: string[] = [];
  let companyId = args.companyId ?? null;
  let instrumentKey = args.instrumentKey ?? null;

  const add = (kind: InputKind, key: string, displayName: string, expectedType: IRValueType | "CAPACITY", env: Env, exprId: string | null, co: string | null, inst: string | null, scopeHint: DependencyRecord["scopeHint"]) => {
    const period = periodSelectorFromContract(env.period);
    const asOf = asOfSelectorFromContract(env.asOf);
    const id = [kind, key, co ?? "-", inst ?? "-", JSON.stringify(period), JSON.stringify(asOf), String(expectedType)].join("::");
    const existing = records.get(id);
    if (existing) {
      if (exprId && !existing.exprIds.includes(exprId)) existing.exprIds.push(exprId);
      // A dependency reached on both a required and a conditional path is required.
      if (env.status === "REQUIRED") { existing.status = "REQUIRED"; existing.conditionalOn = null; }
      if (!env.boundSibling) existing.safeBoundAvailableWithoutThis = false;
      return;
    }
    records.set(id, {
      inputKind: kind, key, displayNameFromContract: displayName,
      identityStrength: "CONTRACT_NAME_ONLY",
      companyId: co, instrumentKey: inst, scopeHint,
      period, asOf, expectedType,
      status: env.status, conditionalOn: env.conditionalOn,
      safeBoundAvailableWithoutThis: env.boundSibling,
      via: env.via, exprIds: exprId ? [exprId] : [],
    });
  };

  const walk = (expr: IRCapacityExpression, env: Env): void => {
    switch (expr.kind) {
      case "MONEY": case "NUMBER": case "PERCENT": case "RATIO": case "BOOLEAN_LITERAL": case "DATE_LITERAL": case "ENTITY_SCOPE_REFERENCE": return;
      case "UNSUPPORTED": unsupportedNodes.push({ exprId: expr.exprId ?? null, reason: expr.reason }); return;
      case "METRIC_REFERENCE": {
        companyId = companyId ?? expr.companyId; instrumentKey = instrumentKey ?? expr.instrumentKey;
        add("METRIC", expr.metricName, expr.metricName, expr.type, env, expr.exprId ?? null, expr.companyId, expr.instrumentKey, "COMPANY_OR_INSTRUMENT");
        return;
      }
      case "LEDGER_USAGE_REFERENCE": add("LEDGER_USAGE", expr.sharedCapId ?? expr.ruleId ?? "(unkeyed)", expr.sharedCapId ?? expr.ruleId ?? "(unkeyed)", "MONEY", env, expr.exprId ?? null, companyId, instrumentKey, "INSTRUMENT_LEVEL"); return;
      case "TRANSACTION_INPUT_REFERENCE": add("TRANSACTION_INPUT", expr.inputName, expr.inputName, expr.type, env, expr.exprId ?? null, companyId, instrumentKey, "INSTRUMENT_LEVEL"); return;
      case "EVENT_ACTIVE": {
        add("EVENT", expr.eventDescription, expr.eventDescription, "BOOLEAN", env, expr.exprId ?? null, companyId, instrumentKey, "INSTRUMENT_LEVEL");
        if (expr.triggerCondition) walk(expr.triggerCondition, env);
        return;
      }
      case "DEFINED_TERM_REFERENCE": {
        const def = definitions.find((d) => (expr.resolvedDefinitionId !== null && d.definitionId === expr.resolvedDefinitionId) || (expr.resolvedDefinitionId === null && d.termName === expr.termName && d.companyId === expr.companyId && d.instrumentKey === expr.instrumentKey)) ?? null;
        if (!def) { add("TERM_VALUE", expr.termName, expr.termName, expr.type, env, expr.exprId ?? null, expr.companyId, expr.instrumentKey, "COMPANY_OR_INSTRUMENT"); return; }
        const frame = `definition:${def.definitionId}`;
        if (stack.includes(frame)) { cycles.push([...stack.slice(stack.indexOf(frame)), frame]); return; }
        if (!expanded.some((e) => e.kind === "DEFINITION" && e.id === def.definitionId)) expanded.push({ kind: "DEFINITION", id: def.definitionId });
        if (!def.calculationExpression) { add("TERM_VALUE", expr.termName, expr.termName, expr.type, env, expr.exprId ?? null, expr.companyId, expr.instrumentKey, "COMPANY_OR_INSTRUMENT"); return; }
        stack.push(frame);
        walk(def.calculationExpression, { ...env, via: { kind: "DEFINITION", definitionId: def.definitionId } });
        stack.pop();
        return;
      }
      case "RULE_REFERENCE": {
        const rule = rules.find((r) => r.ruleId === expr.ruleId) ?? null;
        if (!rule?.capacityExpression) return;
        const frame = `rule:${rule.ruleId}`;
        if (stack.includes(frame)) { cycles.push([...stack.slice(stack.indexOf(frame)), frame]); return; }
        if (!expanded.some((e) => e.kind === "RULE" && e.id === rule.ruleId)) expanded.push({ kind: "RULE", id: rule.ruleId });
        stack.push(frame);
        walk(rule.capacityExpression, { ...env, via: { kind: "RULE", ruleId: rule.ruleId } });
        stack.pop();
        return;
      }
      case "UNLIMITED_CAPACITY": { if (expr.gatedBy) walk(expr.gatedBy, env); return; }
      case "MAX": case "MIN": {
        // A literal sibling means a safe bound exists without the other operands' inputs -
        // they stay REQUIRED for an exact answer; the flag records only that a bound is available.
        const hasLiteralSibling = expr.operands.some(needsNoInput);
        for (const o of expr.operands) walk(o, { ...env, boundSibling: env.boundSibling || (hasLiteralSibling && !needsNoInput(o)) });
        return;
      }
      case "ADD": case "SUM": case "MULTIPLY": case "AND": case "OR": { for (const o of expr.operands) walk(o, env); return; }
      case "SUBTRACT": { walk(expr.left, env); walk(expr.right, env); return; }
      case "DIVIDE": { walk(expr.numerator, env); walk(expr.denominator, env); return; }
      case "COMPARE": { walk(expr.left, env); walk(expr.right, env); return; }
      case "NOT": { walk(expr.operand, env); return; }
      case "IF": {
        walk(expr.condition, env);
        const branch = (label: string): Env => ({ ...env, status: env.status === "REQUIRED" ? "CONDITIONAL" : env.status, conditionalOn: env.conditionalOn ?? `IF ${expr.exprId ?? ""} ${label}` });
        walk(expr.then, branch("then-branch"));
        if (expr.else) walk(expr.else, branch("else-branch"));
        return;
      }
      case "AS_OF": {
        const asOf = typeof expr.asOfDate === "string" ? expr.asOfDate : env.asOf;
        if (typeof expr.asOfDate !== "string") walk(expr.asOfDate, env);
        walk(expr.value, { ...env, asOf });
        return;
      }
      case "DURING_PERIOD": { walk(expr.value, { ...env, period: expr.periodDescription }); return; }
      case "SCHEDULE": {
        for (const [i, c] of expr.cases.entries()) walk(c.value, { ...env, status: env.status === "REQUIRED" ? "CONDITIONAL" : env.status, conditionalOn: env.conditionalOn ?? `SCHEDULE ${expr.exprId ?? ""} case ${i} (${c.from ?? "-"} to ${c.to ?? "-"})` });
        if (expr.defaultValue) walk(expr.defaultValue, { ...env, status: env.status === "REQUIRED" ? "CONDITIONAL" : env.status, conditionalOn: env.conditionalOn ?? `SCHEDULE ${expr.exprId ?? ""} default` });
        return;
      }
    }
  };

  walk(args.expression, { period: null, asOf: args.asOf ?? null, status: "REQUIRED", conditionalOn: null, via: { kind: "EXPRESSION" }, boundSibling: false });

  const dependencies = [...records.values()].sort((a, b) => (`${a.inputKind}::${a.key}::${JSON.stringify(a.period)}::${JSON.stringify(a.asOf)}` < `${b.inputKind}::${b.key}::${JSON.stringify(b.period)}::${JSON.stringify(b.asOf)}` ? -1 : 1));
  const counts = {
    total: dependencies.length,
    required: dependencies.filter((d) => d.status === "REQUIRED").length,
    conditional: dependencies.filter((d) => d.status === "CONDITIONAL").length,
    optionalForBoundOnly: dependencies.filter((d) => d.status === "OPTIONAL_FOR_BOUND_ONLY").length,
  };
  const body = {
    contractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, runtimeVersion: CONTRACT_RUNTIME_VERSION,
    companyId, instrumentKey,
    rootExprId: args.expression.kind === "UNLIMITED_CAPACITY" ? null : args.expression.exprId ?? null,
    ruleId: args.ruleId ?? null,
    dependencies, expandedObjects: expanded, cycles, unsupportedNodes, counts,
  };
  return { ...body, manifestHash: hashOf(body) };
}

/** Convenience: the manifest for a whole rule (capacity expression plus every condition expression). */
export function buildRuleDependencyManifest(rule: IRRule, args: Omit<ManifestArgs, "expression" | "ruleId"> = {}): FinancialDependencyManifest {
  const parts: IRExpression[] = rule.conditions.flatMap((c) => (c.expression ? [c.expression] : []));
  const combined: IRCapacityExpression = rule.capacityExpression ?? { kind: "AND", type: "BOOLEAN", operands: parts, exprId: `ir-expr:manifest-${rule.ruleId}` };
  const first = buildFinancialDependencyManifest({ ...args, expression: combined, ruleId: rule.ruleId, companyId: args.companyId ?? rule.companyId, instrumentKey: args.instrumentKey ?? rule.instrumentKey });
  if (!rule.capacityExpression || parts.length === 0) return first;
  const conditionManifest = buildFinancialDependencyManifest({ ...args, expression: { kind: "AND", type: "BOOLEAN", operands: parts, exprId: `ir-expr:manifest-conditions-${rule.ruleId}` }, ruleId: rule.ruleId, companyId: args.companyId ?? rule.companyId, instrumentKey: args.instrumentKey ?? rule.instrumentKey });
  const merged = [...first.dependencies];
  for (const d of conditionManifest.dependencies) {
    const same = merged.find((m) => m.inputKind === d.inputKind && m.key === d.key && JSON.stringify(m.period) === JSON.stringify(d.period) && JSON.stringify(m.asOf) === JSON.stringify(d.asOf) && m.expectedType === d.expectedType);
    if (!same) merged.push(d);
    else if (d.status === "REQUIRED") { same.status = "REQUIRED"; same.conditionalOn = null; }
  }
  const dependencies = merged.sort((a, b) => (`${a.inputKind}::${a.key}` < `${b.inputKind}::${b.key}` ? -1 : 1));
  const counts = { total: dependencies.length, required: dependencies.filter((d) => d.status === "REQUIRED").length, conditional: dependencies.filter((d) => d.status === "CONDITIONAL").length, optionalForBoundOnly: dependencies.filter((d) => d.status === "OPTIONAL_FOR_BOUND_ONLY").length };
  const body = { ...first, dependencies, counts, expandedObjects: [...first.expandedObjects, ...conditionManifest.expandedObjects.filter((e) => !first.expandedObjects.some((f) => f.kind === e.kind && f.id === e.id))], cycles: [...first.cycles, ...conditionManifest.cycles], unsupportedNodes: [...first.unsupportedNodes, ...conditionManifest.unsupportedNodes], manifestHash: "" };
  return { ...body, manifestHash: hashOf({ ...body, manifestHash: undefined }) };
}
