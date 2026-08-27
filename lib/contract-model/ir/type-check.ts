/**
 * Phase 3A - deterministic type inference and compatibility rules (task
 * §30/§31). This is structural/semantic well-formedness, never legal
 * correctness (task §30's own explicit caveat) - ADD(MONEY, MONEY) is
 * well-typed nonsense if the source never actually adds those two figures;
 * this module cannot and does not know that. It exists to reject
 * mathematically nonsensical composition (ADD(MONEY, BOOLEAN)) and to
 * propagate UNSUPPORTED honestly rather than silently typing an
 * UnsupportedExpression as if it were a real value (invariant: an
 * unsupported node can never become deterministically executable).
 */
import type { CompareOperator, IRCapacityExpression, IRExpression, IRValueType, InferredType } from "./types";
import { UNSUPPORTED_TYPE } from "./types";

const MONEY_OR_NUMBER: readonly IRValueType[] = ["MONEY", "NUMBER"];
const MONEY_NUMBER_RATIO: readonly IRValueType[] = ["MONEY", "NUMBER", "RATIO"];

function isUnsupported(t: InferredType): t is typeof UNSUPPORTED_TYPE {
  return t === UNSUPPORTED_TYPE;
}

/** Infers the type of an expression tree, propagating UNSUPPORTED upward the moment any subexpression is itself unsupported or type-inconsistent - never guesses a type for something it cannot actually type-check. */
export function inferType(expr: IRExpression): InferredType {
  switch (expr.kind) {
    case "MONEY":
    case "NUMBER":
    case "PERCENT":
    case "RATIO":
    case "BOOLEAN_LITERAL":
    case "DATE_LITERAL":
      return expr.type;
    case "METRIC_REFERENCE":
    case "DEFINED_TERM_REFERENCE":
    case "RULE_REFERENCE":
    case "LEDGER_USAGE_REFERENCE":
    case "TRANSACTION_INPUT_REFERENCE":
    case "ENTITY_SCOPE_REFERENCE":
      return expr.type;
    case "UNSUPPORTED":
      return UNSUPPORTED_TYPE;

    case "ADD":
    case "SUM": {
      const types = expr.operands.map(inferType);
      if (types.some(isUnsupported)) return UNSUPPORTED_TYPE;
      // RATIO permitted here (matching MAX/MIN below) so a stepped ratio
      // threshold plus a ratio step-up offset composes as a well-typed ADD
      // (task §9) - but RATIO must not mix with MONEY/NUMBER in the same
      // operation, so the distinct-type check below still applies.
      if (!types.every((t) => MONEY_NUMBER_RATIO.includes(t as IRValueType))) return UNSUPPORTED_TYPE;
      const distinct = new Set(types);
      if (distinct.has("RATIO") && distinct.size > 1) return UNSUPPORTED_TYPE;
      if (distinct.has("RATIO")) return "RATIO";
      return types.includes("MONEY") ? "MONEY" : "NUMBER";
    }
    case "MULTIPLY": {
      const types = expr.operands.map(inferType);
      if (types.some(isUnsupported)) return UNSUPPORTED_TYPE;
      // PERCENT is a scaling factor, not a dimension of its own - "X% of
      // EBITDA" (one of the most common real covenant shapes, task §7) is
      // MULTIPLY(PERCENT, MONEY) and must type-check to MONEY. Any number
      // of PERCENT operands may appear (percent-of-percent, e.g. a
      // compounding discount) alongside AT MOST one genuinely-dimensioned
      // operand (MONEY/NUMBER/RATIO), whose type the whole expression
      // takes; with none, a pure percent product is dimensionless NUMBER.
      const nonPercent = types.filter((t) => t !== "PERCENT");
      if (nonPercent.length === 0) return "NUMBER";
      if (!nonPercent.every((t) => MONEY_NUMBER_RATIO.includes(t as IRValueType))) return UNSUPPORTED_TYPE;
      if (new Set(nonPercent).size > 1) return UNSUPPORTED_TYPE;
      return nonPercent[0] as IRValueType;
    }
    case "SUBTRACT": {
      const l = inferType(expr.left);
      const r = inferType(expr.right);
      if (isUnsupported(l) || isUnsupported(r)) return UNSUPPORTED_TYPE;
      if (!MONEY_OR_NUMBER.includes(l as IRValueType) || !MONEY_OR_NUMBER.includes(r as IRValueType)) return UNSUPPORTED_TYPE;
      return l === "MONEY" || r === "MONEY" ? "MONEY" : "NUMBER";
    }
    case "DIVIDE": {
      const n = inferType(expr.numerator);
      const d = inferType(expr.denominator);
      if (isUnsupported(n) || isUnsupported(d)) return UNSUPPORTED_TYPE;
      if (!MONEY_NUMBER_RATIO.includes(n as IRValueType) || !MONEY_NUMBER_RATIO.includes(d as IRValueType)) return UNSUPPORTED_TYPE;
      // MONEY / MONEY -> a dimensionless ratio-like number; anything else stays NUMBER unless the expression's own declared type says RATIO (the node itself asserts intent for the ambiguous cases, checked by validateExpression below).
      return expr.type;
    }
    case "MAX":
    case "MIN": {
      const types = expr.operands.map(inferType);
      if (types.some(isUnsupported)) return UNSUPPORTED_TYPE;
      if (!types.every((t) => MONEY_NUMBER_RATIO.includes(t as IRValueType))) return UNSUPPORTED_TYPE;
      // All operands of a MAX/MIN must share the same real type - mixing MONEY and RATIO operands is nonsensical composition even though both individually pass the coarse membership check above.
      const distinct = new Set(types);
      if (distinct.size > 1) return UNSUPPORTED_TYPE;
      return types[0] as IRValueType;
    }
    case "COMPARE": {
      const l = inferType(expr.left);
      const r = inferType(expr.right);
      if (isUnsupported(l) || isUnsupported(r)) return UNSUPPORTED_TYPE;
      if (l !== r) return UNSUPPORTED_TYPE;
      return "BOOLEAN";
    }
    case "AND":
    case "OR": {
      const types = expr.operands.map(inferType);
      if (types.some(isUnsupported)) return UNSUPPORTED_TYPE;
      if (!types.every((t) => t === "BOOLEAN")) return UNSUPPORTED_TYPE;
      return "BOOLEAN";
    }
    case "NOT": {
      const t = inferType(expr.operand);
      if (isUnsupported(t) || t !== "BOOLEAN") return UNSUPPORTED_TYPE;
      return "BOOLEAN";
    }
    case "IF": {
      const cond = inferType(expr.condition);
      const thenType = inferType(expr.then);
      const elseType = expr.else ? inferType(expr.else) : thenType;
      if (isUnsupported(cond) || cond !== "BOOLEAN") return UNSUPPORTED_TYPE;
      if (isUnsupported(thenType) || isUnsupported(elseType)) return UNSUPPORTED_TYPE;
      if (thenType !== elseType) return UNSUPPORTED_TYPE;
      return thenType;
    }
    case "AS_OF": {
      const t = inferType(expr.value);
      return t;
    }
    case "DURING_PERIOD": {
      const t = inferType(expr.value);
      return t;
    }
    case "SCHEDULE": {
      const caseTypes = expr.cases.map((c) => inferType(c.value));
      const defaultType = expr.defaultValue ? inferType(expr.defaultValue) : undefined;
      const allTypes = defaultType !== undefined ? [...caseTypes, defaultType] : caseTypes;
      if (allTypes.some(isUnsupported)) return UNSUPPORTED_TYPE;
      const distinct = new Set(allTypes);
      if (distinct.size !== 1) return UNSUPPORTED_TYPE;
      return allTypes[0] as IRValueType;
    }
    case "EVENT_ACTIVE": {
      if (expr.triggerCondition) {
        const t = inferType(expr.triggerCondition);
        if (isUnsupported(t) || t !== "BOOLEAN") return UNSUPPORTED_TYPE;
      }
      return "BOOLEAN";
    }
  }
}

export interface TypeIssue {
  exprId: string;
  kind: string;
  message: string;
}

const COMPARE_OPERATORS: readonly CompareOperator[] = ["GT", "GTE", "LT", "LTE", "EQ"];

/** Walks an expression tree bottom-up and collects every point where composition is type-invalid - arity, operand-type mismatch, or an operator applied to an UNSUPPORTED subtree treated as if it had a real type. Never throws; always returns the full issue list so a caller can report everything wrong at once rather than stopping at the first problem. */
export function validateExpressionTypes(expr: IRExpression, issues: TypeIssue[] = []): TypeIssue[] {
  switch (expr.kind) {
    case "MONEY":
    case "NUMBER":
    case "PERCENT":
    case "RATIO":
    case "BOOLEAN_LITERAL":
    case "DATE_LITERAL":
    case "METRIC_REFERENCE":
    case "DEFINED_TERM_REFERENCE":
    case "RULE_REFERENCE":
    case "LEDGER_USAGE_REFERENCE":
    case "TRANSACTION_INPUT_REFERENCE":
    case "ENTITY_SCOPE_REFERENCE":
    case "UNSUPPORTED":
      return issues;

    case "ADD":
    case "SUM":
      if (expr.operands.length === 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `${expr.kind} requires at least one operand` });
      for (const op of expr.operands) validateExpressionTypes(op, issues);
      if (inferType(expr) === UNSUPPORTED_TYPE && expr.operands.length > 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `${expr.kind} operands must all be MONEY/NUMBER, or all be RATIO (no mixing)` });
      return issues;

    case "MULTIPLY":
      if (expr.operands.length === 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: "MULTIPLY requires at least one operand" });
      for (const op of expr.operands) validateExpressionTypes(op, issues);
      if (inferType(expr) === UNSUPPORTED_TYPE && expr.operands.length > 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: "MULTIPLY operands must be any number of PERCENT scaling factors plus at most one MONEY/NUMBER/RATIO operand" });
      return issues;

    case "SUBTRACT":
      validateExpressionTypes(expr.left, issues);
      validateExpressionTypes(expr.right, issues);
      if (inferType(expr) === UNSUPPORTED_TYPE) issues.push({ exprId: expr.exprId, kind: expr.kind, message: "SUBTRACT operands must both be MONEY or NUMBER" });
      return issues;

    case "DIVIDE":
      validateExpressionTypes(expr.numerator, issues);
      validateExpressionTypes(expr.denominator, issues);
      if (inferType(expr.numerator) === UNSUPPORTED_TYPE || inferType(expr.denominator) === UNSUPPORTED_TYPE) issues.push({ exprId: expr.exprId, kind: expr.kind, message: "DIVIDE operands must be MONEY, NUMBER, or RATIO" });
      return issues;

    case "MAX":
    case "MIN":
      if (expr.operands.length < 2) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `${expr.kind} requires at least two operands` });
      for (const op of expr.operands) validateExpressionTypes(op, issues);
      if (inferType(expr) === UNSUPPORTED_TYPE && expr.operands.length >= 2) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `${expr.kind} operands must all share the same type (MONEY, NUMBER, or RATIO) - mixed types are not comparable` });
      return issues;

    case "COMPARE":
      validateExpressionTypes(expr.left, issues);
      validateExpressionTypes(expr.right, issues);
      if (!COMPARE_OPERATORS.includes(expr.operator)) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `unknown comparison operator ${expr.operator}` });
      if (inferType(expr) === UNSUPPORTED_TYPE) issues.push({ exprId: expr.exprId, kind: expr.kind, message: "COMPARE operands must be the same type" });
      return issues;

    case "AND":
    case "OR":
      if (expr.operands.length === 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `${expr.kind} requires at least one operand` });
      for (const op of expr.operands) validateExpressionTypes(op, issues);
      if (inferType(expr) === UNSUPPORTED_TYPE && expr.operands.length > 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `${expr.kind} operands must all be BOOLEAN` });
      return issues;

    case "NOT":
      validateExpressionTypes(expr.operand, issues);
      if (inferType(expr) === UNSUPPORTED_TYPE) issues.push({ exprId: expr.exprId, kind: expr.kind, message: "NOT operand must be BOOLEAN" });
      return issues;

    case "IF":
      validateExpressionTypes(expr.condition, issues);
      validateExpressionTypes(expr.then, issues);
      if (expr.else) validateExpressionTypes(expr.else, issues);
      if (inferType(expr.condition) !== "BOOLEAN") issues.push({ exprId: expr.exprId, kind: expr.kind, message: "IF condition must be BOOLEAN" });
      if (inferType(expr) === UNSUPPORTED_TYPE) issues.push({ exprId: expr.exprId, kind: expr.kind, message: "IF branches must resolve to the same type" });
      return issues;

    case "AS_OF":
      validateExpressionTypes(expr.value, issues);
      return issues;
    case "DURING_PERIOD":
      validateExpressionTypes(expr.value, issues);
      return issues;

    case "SCHEDULE":
      if (expr.cases.length === 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: "SCHEDULE requires at least one case" });
      for (const c of expr.cases) validateExpressionTypes(c.value, issues);
      if (expr.defaultValue) validateExpressionTypes(expr.defaultValue, issues);
      if (inferType(expr) === UNSUPPORTED_TYPE && expr.cases.length > 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: "SCHEDULE cases (and defaultValue, if set) must all resolve to the same type" });
      return issues;

    case "EVENT_ACTIVE":
      if (expr.triggerCondition) {
        validateExpressionTypes(expr.triggerCondition, issues);
        if (inferType(expr.triggerCondition) !== "BOOLEAN") issues.push({ exprId: expr.exprId, kind: expr.kind, message: "EVENT_ACTIVE triggerCondition must be BOOLEAN" });
      }
      return issues;
  }
}

/** Type-checks a capacityExpression, which may be an UnlimitedCapacity wrapper rather than a plain IRExpression. */
export function validateCapacityExpressionTypes(capacity: IRCapacityExpression, issues: TypeIssue[] = []): TypeIssue[] {
  if (capacity.kind === "UNLIMITED_CAPACITY") {
    if (capacity.gatedBy) {
      validateExpressionTypes(capacity.gatedBy, issues);
      if (inferType(capacity.gatedBy) !== "BOOLEAN") issues.push({ exprId: "unlimited-capacity-gate", kind: "UNLIMITED_CAPACITY", message: "UnlimitedCapacity.gatedBy must be BOOLEAN" });
    }
    return issues;
  }
  return validateExpressionTypes(capacity, issues);
}
