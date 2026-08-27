/**
 * Phase 3A test matrix, Category A - expression typing (task §56).
 * Exercises inferType/validateExpressionTypes directly against small,
 * hand-built expression trees - the compositional building blocks every
 * fixture in tests/fixtures/ir-examples/real-covenant-shapes.ts is made of.
 */
import { describe, expect, it } from "vitest";
import { inferType, validateExpressionTypes } from "../../../lib/contract-model/ir/type-check";
import { withExpressionId } from "../../../lib/contract-model/ir/identity";
import { UNSUPPORTED_TYPE, type IRExpression } from "../../../lib/contract-model/ir/types";

function money(amount: number): IRExpression {
  return withExpressionId({ kind: "MONEY", type: "MONEY", amount, currency: "USD" });
}
function ratio(value: number): IRExpression {
  return withExpressionId({ kind: "RATIO", type: "RATIO", value });
}
function bool(value: boolean): IRExpression {
  return withExpressionId({ kind: "BOOLEAN_LITERAL", type: "BOOLEAN", value });
}
function percent(value: number): IRExpression {
  return withExpressionId({ kind: "PERCENT", type: "PERCENT", value });
}

describe("Phase 3A IR - Category A: expression typing", () => {
  it("A1: MONEY + MONEY types to MONEY", () => {
    const add = withExpressionId({ kind: "ADD", type: "MONEY", operands: [money(100), money(200)] });
    expect(inferType(add)).toBe("MONEY");
    expect(validateExpressionTypes(add)).toEqual([]);
  });

  it("A2: MONEY + BOOLEAN is rejected as nonsensical composition", () => {
    const add = withExpressionId({ kind: "ADD", type: "MONEY", operands: [money(100), bool(true)] });
    expect(inferType(add)).toBe(UNSUPPORTED_TYPE);
    const issues = validateExpressionTypes(add);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.kind).toBe("ADD");
  });

  it("A3: PERCENT x MONEY types to MONEY ('X% of a metric', the most common real covenant shape)", () => {
    const mult = withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands: [percent(0.05), money(1_000_000)] });
    expect(inferType(mult)).toBe("MONEY");
    expect(validateExpressionTypes(mult)).toEqual([]);
  });

  it("A4: RATIO COMPARE RATIO types to BOOLEAN", () => {
    const cmp = withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left: ratio(4.5), operator: "LTE", right: ratio(5.0) });
    expect(inferType(cmp)).toBe("BOOLEAN");
    expect(validateExpressionTypes(cmp)).toEqual([]);
  });

  it("A5: BOOLEAN AND BOOLEAN types to BOOLEAN; mixed-type AND is rejected", () => {
    const and = withExpressionId({ kind: "AND", type: "BOOLEAN", operands: [bool(true), bool(false)] });
    expect(inferType(and)).toBe("BOOLEAN");
    expect(validateExpressionTypes(and)).toEqual([]);

    const mixedAnd = withExpressionId({ kind: "AND", type: "BOOLEAN", operands: [bool(true), money(5)] });
    expect(inferType(mixedAnd)).toBe(UNSUPPORTED_TYPE);
    expect(validateExpressionTypes(mixedAnd).length).toBeGreaterThan(0);
  });

  it("A6: nested IF propagates the shared branch type; mismatched branch types are rejected", () => {
    const innerIf = withExpressionId({ kind: "IF", type: "MONEY", condition: bool(true), then: money(100), else: money(200) });
    const outerIf = withExpressionId({ kind: "IF", type: "MONEY", condition: bool(false), then: innerIf, else: money(300) });
    expect(inferType(outerIf)).toBe("MONEY");
    expect(validateExpressionTypes(outerIf)).toEqual([]);

    const mismatched = withExpressionId({ kind: "IF", type: "MONEY", condition: bool(true), then: money(100), else: ratio(1.0) });
    expect(inferType(mismatched)).toBe(UNSUPPORTED_TYPE);
    expect(validateExpressionTypes(mismatched).length).toBeGreaterThan(0);
  });
});
