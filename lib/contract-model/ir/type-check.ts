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
 *
 * F-6 (Phase 3 Chewy remediation 3): the type lattice distinguishes two
 * states that the original all-or-nothing `inferType` conflated:
 *
 *   UNKNOWN  - a subtree contains an UNSUPPORTED node, so its own value is
 *              not executable, but its KNOWN operands are dimensionally
 *              consistent. This is an honest PARTIAL representation:
 *              SUBTRACT(MONEY-tree, UNSUPPORTED) is still a MONEY-shaped
 *              subtraction whose left side is fully represented.
 *   CONFLICT - the KNOWN operand types are mutually inconsistent for the
 *              operator (ADD(MONEY, BOOLEAN), MAX(MONEY, RATIO)). This is a
 *              genuine dimensional error and is always rejected.
 *
 * `analyzeType` reports both; `inferType` (unchanged contract) still
 * returns UNSUPPORTED for either, so nothing that consults inferType can
 * ever treat a partial tree as executable. Only validation (a CONFLICT is
 * a TYPE_ERROR, an UNKNOWN is not) and normalization (a CONFLICT collapses
 * to an UNSUPPORTED node, an UNKNOWN keeps the composite with its
 * unsupported child in place) read the finer distinction.
 */
import type { CompareOperator, IRCapacityExpression, IRExpression, IRValueType, InferredType } from "./types";
import { UNSUPPORTED_TYPE } from "./types";

const MONEY_OR_NUMBER: readonly IRValueType[] = ["MONEY", "NUMBER"];
const MONEY_NUMBER_RATIO: readonly IRValueType[] = ["MONEY", "NUMBER", "RATIO"];

/** The finer-grained result of typing a subtree - see the module header for UNKNOWN vs CONFLICT. */
export interface TypeAnalysis {
  /**
   * The dimension this subtree's KNOWN part resolves to (the type its
   * fully-typed operands determine), or null when nothing typed is known
   * (every operand unsupported, or this node itself is in conflict).
   * For a partial composite this is the declared type of its represented
   * part, never a claim that the whole subtree is executable - consult
   * `unsupported` (or inferType) for that.
   */
  known: IRValueType | null;
  /** True when this subtree is, or contains, an UNSUPPORTED node or a conflicting composite - i.e. it can never be deterministically executed. */
  unsupported: boolean;
  /** Non-null when the KNOWN operand types of THIS node are inconsistent for its operator - a genuine dimensional error, distinct from an unknown operand. Reported only at the node where it occurs, never re-reported by ancestors. */
  conflict: string | null;
}

function leaf(type: IRValueType): TypeAnalysis {
  return { known: type, unsupported: false, conflict: null };
}
function conflict(message: string): TypeAnalysis {
  return { known: null, unsupported: true, conflict: message };
}
function known(children: TypeAnalysis[]): IRValueType[] {
  return children.flatMap((c) => (c.known !== null && c.conflict === null ? [c.known] : []));
}
function anyUnsupported(children: TypeAnalysis[]): boolean {
  return children.some((c) => c.unsupported);
}

/** Types a subtree, distinguishing an honest UNKNOWN (unsupported child, known operands consistent) from a CONFLICT (known operands inconsistent). Never throws. */
export function analyzeType(expr: IRExpression): TypeAnalysis {
  switch (expr.kind) {
    case "MONEY":
    case "NUMBER":
    case "PERCENT":
    case "RATIO":
    case "BOOLEAN_LITERAL":
    case "DATE_LITERAL":
      return leaf(expr.type);
    case "METRIC_REFERENCE":
    case "DEFINED_TERM_REFERENCE":
    case "RULE_REFERENCE":
    case "LEDGER_USAGE_REFERENCE":
    case "TRANSACTION_INPUT_REFERENCE":
    case "ENTITY_SCOPE_REFERENCE":
      return leaf(expr.type);
    case "UNSUPPORTED":
      return { known: null, unsupported: true, conflict: null };

    case "ADD":
    case "SUM": {
      const children = expr.operands.map(analyzeType);
      const types = known(children);
      // RATIO permitted here (matching MAX/MIN below) so a stepped ratio
      // threshold plus a ratio step-up offset composes as a well-typed ADD
      // (task §9) - but RATIO must not mix with MONEY/NUMBER in the same
      // operation, so the distinct-type check below still applies.
      if (!types.every((t) => MONEY_NUMBER_RATIO.includes(t))) return conflict(`${expr.kind} operands must all be MONEY/NUMBER, or all be RATIO (no mixing)`);
      const distinct = new Set(types);
      if (distinct.has("RATIO") && distinct.size > 1) return conflict(`${expr.kind} operands must all be MONEY/NUMBER, or all be RATIO (no mixing)`);
      const result: IRValueType | null = types.length === 0 ? null : distinct.has("RATIO") ? "RATIO" : types.includes("MONEY") ? "MONEY" : "NUMBER";
      return { known: result, unsupported: anyUnsupported(children), conflict: null };
    }
    case "MULTIPLY": {
      const children = expr.operands.map(analyzeType);
      const types = known(children);
      // PERCENT is a scaling factor, not a dimension of its own - "X% of
      // EBITDA" (one of the most common real covenant shapes, task §7) is
      // MULTIPLY(PERCENT, MONEY) and must type-check to MONEY. Any number
      // of PERCENT operands may appear (percent-of-percent, e.g. a
      // compounding discount) alongside AT MOST one genuinely-dimensioned
      // operand (MONEY/RATIO), whose type the whole expression takes; a
      // NUMBER operand is a dimensionless multiplier, treated like PERCENT;
      // with no dimensioned operand the product is dimensionless NUMBER.
      // Two dimensioned operands (MONEY x MONEY, MONEY x RATIO) are a
      // genuine dimensional conflict (F-6 closes the gap where the earlier
      // check let MONEY x MONEY through as MONEY, against its own comment).
      const dimensioned = types.filter((t) => t !== "PERCENT" && t !== "NUMBER");
      if (!dimensioned.every((t) => t === "MONEY" || t === "RATIO")) return conflict("MULTIPLY operands must be any number of PERCENT/NUMBER scaling factors plus at most one MONEY or RATIO operand");
      if (dimensioned.length > 1) return conflict("MULTIPLY operands must be any number of PERCENT/NUMBER scaling factors plus at most one MONEY or RATIO operand");
      const unsupported = anyUnsupported(children);
      // A product whose only KNOWN operands are scaling factors but which
      // also has an unsupported operand has an unknown dimension (the
      // unsupported operand may carry it) - never assumed NUMBER.
      const result: IRValueType | null = dimensioned.length === 1 ? dimensioned[0]! : unsupported ? null : "NUMBER";
      return { known: result, unsupported, conflict: null };
    }
    case "SUBTRACT": {
      const children = [analyzeType(expr.left), analyzeType(expr.right)];
      const types = known(children);
      if (!types.every((t) => MONEY_OR_NUMBER.includes(t))) return conflict("SUBTRACT operands must both be MONEY or NUMBER");
      const result: IRValueType | null = types.length === 0 ? null : types.includes("MONEY") ? "MONEY" : "NUMBER";
      return { known: result, unsupported: anyUnsupported(children), conflict: null };
    }
    case "DIVIDE": {
      const children = [analyzeType(expr.numerator), analyzeType(expr.denominator)];
      const types = known(children);
      if (!types.every((t) => MONEY_NUMBER_RATIO.includes(t))) return conflict("DIVIDE operands must be MONEY, NUMBER, or RATIO");
      // MONEY / MONEY -> a dimensionless ratio-like number; anything else stays NUMBER unless the expression's own declared type says RATIO (the node itself asserts intent for the ambiguous cases).
      return { known: expr.type, unsupported: anyUnsupported(children), conflict: null };
    }
    case "MAX":
    case "MIN": {
      const children = expr.operands.map(analyzeType);
      const types = known(children);
      if (!types.every((t) => MONEY_NUMBER_RATIO.includes(t))) return conflict(`${expr.kind} operands must all share the same type (MONEY, NUMBER, or RATIO) - mixed types are not comparable`);
      // All operands of a MAX/MIN must share the same real type - mixing MONEY and RATIO operands is nonsensical composition even though both individually pass the coarse membership check above.
      const distinct = new Set(types);
      if (distinct.size > 1) return conflict(`${expr.kind} operands must all share the same type (MONEY, NUMBER, or RATIO) - mixed types are not comparable`);
      return { known: types[0] ?? null, unsupported: anyUnsupported(children), conflict: null };
    }
    case "COMPARE": {
      const children = [analyzeType(expr.left), analyzeType(expr.right)];
      const types = known(children);
      if (types.length === 2 && types[0] !== types[1]) return conflict("COMPARE operands must be the same type");
      return { known: "BOOLEAN", unsupported: anyUnsupported(children), conflict: null };
    }
    case "AND":
    case "OR": {
      const children = expr.operands.map(analyzeType);
      const types = known(children);
      if (!types.every((t) => t === "BOOLEAN")) return conflict(`${expr.kind} operands must all be BOOLEAN`);
      return { known: "BOOLEAN", unsupported: anyUnsupported(children), conflict: null };
    }
    case "NOT": {
      const child = analyzeType(expr.operand);
      const types = known([child]);
      if (!types.every((t) => t === "BOOLEAN")) return conflict("NOT operand must be BOOLEAN");
      return { known: "BOOLEAN", unsupported: child.unsupported, conflict: null };
    }
    case "IF": {
      const cond = analyzeType(expr.condition);
      const thenA = analyzeType(expr.then);
      const elseA = expr.else ? analyzeType(expr.else) : null;
      const children = elseA ? [cond, thenA, elseA] : [cond, thenA];
      if (cond.known !== null && cond.conflict === null && cond.known !== "BOOLEAN") return conflict("IF condition must be BOOLEAN");
      const branchTypes = known(elseA ? [thenA, elseA] : [thenA]);
      if (new Set(branchTypes).size > 1) return conflict("IF branches must resolve to the same type");
      return { known: branchTypes[0] ?? null, unsupported: anyUnsupported(children), conflict: null };
    }
    case "AS_OF":
    case "DURING_PERIOD": {
      const child = analyzeType(expr.value);
      return { known: child.conflict ? null : child.known, unsupported: child.unsupported, conflict: null };
    }
    case "SCHEDULE": {
      const caseAnalyses = expr.cases.map((c) => analyzeType(c.value));
      const defaultAnalysis = expr.defaultValue ? analyzeType(expr.defaultValue) : null;
      const children = defaultAnalysis ? [...caseAnalyses, defaultAnalysis] : caseAnalyses;
      const types = known(children);
      if (new Set(types).size > 1) return conflict("SCHEDULE cases (and defaultValue, if set) must all resolve to the same type");
      return { known: types[0] ?? null, unsupported: anyUnsupported(children), conflict: null };
    }
    case "EVENT_ACTIVE": {
      if (expr.triggerCondition) {
        const trigger = analyzeType(expr.triggerCondition);
        if (trigger.known !== null && trigger.conflict === null && trigger.known !== "BOOLEAN") return conflict("EVENT_ACTIVE triggerCondition must be BOOLEAN");
        return { known: "BOOLEAN", unsupported: trigger.unsupported, conflict: null };
      }
      return leaf("BOOLEAN");
    }
  }
}

/** Infers the type of an expression tree, propagating UNSUPPORTED upward the moment any subexpression is itself unsupported or type-inconsistent - never guesses a type for something it cannot actually type-check. A partial composite (an unsupported child under otherwise-consistent operands) is UNSUPPORTED here exactly as before: this is the executability gate, and analyzeType is the only place the finer UNKNOWN/CONFLICT distinction is exposed. */
export function inferType(expr: IRExpression): InferredType {
  const analysis = analyzeType(expr);
  if (analysis.unsupported || analysis.conflict !== null || analysis.known === null) return UNSUPPORTED_TYPE;
  return analysis.known;
}

export interface TypeIssue {
  exprId: string;
  kind: string;
  message: string;
}

const COMPARE_OPERATORS: readonly CompareOperator[] = ["GT", "GTE", "LT", "LTE", "EQ"];

function pushConflict(expr: IRExpression, issues: TypeIssue[]): void {
  const analysis = analyzeType(expr);
  if (analysis.conflict !== null) issues.push({ exprId: expr.exprId, kind: expr.kind, message: analysis.conflict });
}

/**
 * Walks an expression tree bottom-up and collects every point where
 * composition is type-invalid - arity, or a genuine operand-type CONFLICT
 * among the operands whose types are known. Never throws; always returns
 * the full issue list so a caller can report everything wrong at once
 * rather than stopping at the first problem.
 *
 * F-6: an operator over an UNSUPPORTED subtree is NOT a type issue on its
 * own - that is an honest partial representation, surfaced through the
 * owning rule's/definition's sufficiency (which validate.ts checks for
 * false completeness), not through a structural type error. It remains
 * non-executable: inferType still reports UNSUPPORTED for it.
 */
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
    case "MULTIPLY":
      if (expr.operands.length === 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `${expr.kind} requires at least one operand` });
      for (const op of expr.operands) validateExpressionTypes(op, issues);
      pushConflict(expr, issues);
      return issues;

    case "SUBTRACT":
      validateExpressionTypes(expr.left, issues);
      validateExpressionTypes(expr.right, issues);
      pushConflict(expr, issues);
      return issues;

    case "DIVIDE":
      validateExpressionTypes(expr.numerator, issues);
      validateExpressionTypes(expr.denominator, issues);
      pushConflict(expr, issues);
      return issues;

    case "MAX":
    case "MIN":
      if (expr.operands.length < 2) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `${expr.kind} requires at least two operands` });
      for (const op of expr.operands) validateExpressionTypes(op, issues);
      pushConflict(expr, issues);
      return issues;

    case "COMPARE":
      validateExpressionTypes(expr.left, issues);
      validateExpressionTypes(expr.right, issues);
      if (!COMPARE_OPERATORS.includes(expr.operator)) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `unknown comparison operator ${expr.operator}` });
      pushConflict(expr, issues);
      return issues;

    case "AND":
    case "OR":
      if (expr.operands.length === 0) issues.push({ exprId: expr.exprId, kind: expr.kind, message: `${expr.kind} requires at least one operand` });
      for (const op of expr.operands) validateExpressionTypes(op, issues);
      pushConflict(expr, issues);
      return issues;

    case "NOT":
      validateExpressionTypes(expr.operand, issues);
      pushConflict(expr, issues);
      return issues;

    case "IF":
      validateExpressionTypes(expr.condition, issues);
      validateExpressionTypes(expr.then, issues);
      if (expr.else) validateExpressionTypes(expr.else, issues);
      pushConflict(expr, issues);
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
      pushConflict(expr, issues);
      return issues;

    case "EVENT_ACTIVE":
      if (expr.triggerCondition) validateExpressionTypes(expr.triggerCondition, issues);
      pushConflict(expr, issues);
      return issues;
  }
}

/** True when the expression's KNOWN type is a real, non-BOOLEAN dimension - an unknown (unsupported) gate is honest partiality, not a type error. */
function knownNonBoolean(expr: IRExpression): boolean {
  const analysis = analyzeType(expr);
  return analysis.conflict === null && analysis.known !== null && analysis.known !== "BOOLEAN";
}

/** Type-checks a capacityExpression, which may be an UnlimitedCapacity wrapper rather than a plain IRExpression. */
export function validateCapacityExpressionTypes(capacity: IRCapacityExpression, issues: TypeIssue[] = []): TypeIssue[] {
  if (capacity.kind === "UNLIMITED_CAPACITY") {
    if (capacity.gatedBy) {
      validateExpressionTypes(capacity.gatedBy, issues);
      if (knownNonBoolean(capacity.gatedBy)) issues.push({ exprId: "unlimited-capacity-gate", kind: "UNLIMITED_CAPACITY", message: "UnlimitedCapacity.gatedBy must be BOOLEAN" });
    }
    return issues;
  }
  return validateExpressionTypes(capacity, issues);
}
