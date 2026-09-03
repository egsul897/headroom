/**
 * F-6 (Phase 3 Chewy remediation 3) - the type lattice's UNKNOWN vs
 * CONFLICT distinction (lib/contract-model/ir/type-check.ts analyzeType) and
 * the validation rules built on it. Every expression here is hand-built and
 * synthetic; the rules under test are the mission's §7 type table plus the
 * §13 trust-safety guarantees (invalid dimensional arithmetic stays
 * rejected, an unknown operator stays flagged, partial stays non-executable,
 * a COMPLETE claim over an unsupported subtree is a validation failure).
 */
import { describe, expect, it } from "vitest";
import { analyzeType, inferType, validateCapacityExpressionTypes, validateExpressionTypes } from "../../../lib/contract-model/ir/type-check";
import { validateDefinition, validateRule } from "../../../lib/contract-model/ir/validate";
import { withExpressionId, computeRuleId, computeDefinitionId } from "../../../lib/contract-model/ir/identity";
import { UNSUPPORTED_TYPE, type IRDefinition, type IRExpression, type IRRule } from "../../../lib/contract-model/ir/types";

const CO = "f6-co";
const INST = "f6-instrument";

const money = (amount: number): IRExpression => withExpressionId({ kind: "MONEY", type: "MONEY", amount, currency: "USD" });
const num = (value: number): IRExpression => withExpressionId({ kind: "NUMBER", type: "NUMBER", value });
const pct = (value: number): IRExpression => withExpressionId({ kind: "PERCENT", type: "PERCENT", value });
const ratio = (value: number): IRExpression => withExpressionId({ kind: "RATIO", type: "RATIO", value });
const bool = (value: boolean): IRExpression => withExpressionId({ kind: "BOOLEAN_LITERAL", type: "BOOLEAN", value });
const metric = (metricName: string, type: "MONEY" | "RATIO" | "NUMBER" = "MONEY"): IRExpression => withExpressionId({ kind: "METRIC_REFERENCE", type, metricName, companyId: CO, instrumentKey: INST, resolvedDefinitionId: null });
const unsupported = (why: string): IRExpression => withExpressionId({ kind: "UNSUPPORTED", type: null, sourceEvidence: why, semanticDescription: why, reason: why, requiredReview: true });
const add = (...operands: IRExpression[]): IRExpression => withExpressionId({ kind: "ADD", type: "MONEY", operands });
const sub = (left: IRExpression, right: IRExpression): IRExpression => withExpressionId({ kind: "SUBTRACT", type: "MONEY", left, right });
const mul = (...operands: IRExpression[]): IRExpression => withExpressionId({ kind: "MULTIPLY", type: "MONEY", operands });
const max = (...operands: IRExpression[]): IRExpression => withExpressionId({ kind: "MAX", type: "MONEY", operands });
const min = (...operands: IRExpression[]): IRExpression => withExpressionId({ kind: "MIN", type: "MONEY", operands });
const cmp = (left: IRExpression, operator: "GT" | "GTE" | "LT" | "LTE" | "EQ", right: IRExpression): IRExpression => withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left, operator, right });
const and = (...operands: IRExpression[]): IRExpression => withExpressionId({ kind: "AND", type: "BOOLEAN", operands });
const or = (...operands: IRExpression[]): IRExpression => withExpressionId({ kind: "OR", type: "BOOLEAN", operands });
const not = (operand: IRExpression): IRExpression => withExpressionId({ kind: "NOT", type: "BOOLEAN", operand });
const iff = (condition: IRExpression, then: IRExpression, els: IRExpression | null): IRExpression => withExpressionId({ kind: "IF", type: "MONEY", condition, then, else: els });

function rule(overrides: Partial<IRRule>): IRRule {
  return { ruleId: computeRuleId(CO, INST, "f6", "r"), irSchemaVersion: "headroom-covenant-ir.v1", companyId: CO, instrumentKey: INST, sourceDocumentId: "doc", sourceSectionRef: "f6", covenantFamily: "RESTRICTED_PAYMENTS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "PAY_DIVIDEND", entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, compilerVersion: null, sourceContentVersion: null, ...overrides };
}
function definition(overrides: Partial<IRDefinition>): IRDefinition {
  return { definitionId: computeDefinitionId(CO, INST, "T"), irSchemaVersion: "headroom-covenant-ir.v1", companyId: CO, instrumentKey: INST, sourceDocumentId: "doc", termName: "T", covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: null, dependsOnTerms: [], sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, compilerVersion: null, sourceContentVersion: null, ...overrides };
}

describe("F-6 type lattice - the §7 type table on fully typed trees (unchanged verdicts)", () => {
  it("MONEY+MONEY, MONEY-MONEY, PERCENT×MONEY, PERCENT×NUMBER, MAX/MIN(MONEY), COMPARE, AND/OR, IF all resolve as the table says", () => {
    expect(inferType(add(money(1), money(2)))).toBe("MONEY");
    expect(inferType(sub(money(1), money(2)))).toBe("MONEY");
    expect(inferType(mul(pct(0.1), money(2)))).toBe("MONEY");
    expect(inferType(mul(pct(0.1), num(2)))).toBe("NUMBER");
    expect(inferType(max(money(1), money(2)))).toBe("MONEY");
    expect(inferType(min(money(1), money(2)))).toBe("MONEY");
    expect(inferType(cmp(ratio(2), "LTE", ratio(3)))).toBe("BOOLEAN");
    expect(inferType(cmp(money(1), "GT", money(2)))).toBe("BOOLEAN");
    expect(inferType(cmp(pct(0.1), "EQ", pct(0.2)))).toBe("BOOLEAN");
    expect(inferType(and(bool(true), cmp(ratio(1), "LT", ratio(2))))).toBe("BOOLEAN");
    expect(inferType(or(bool(true), bool(false)))).toBe("BOOLEAN");
    expect(inferType(iff(bool(true), money(1), money(2)))).toBe("MONEY");
    expect(inferType(add(ratio(5), ratio(0.5)))).toBe("RATIO");
  });

  it("invalid dimensional combinations are CONFLICTS - rejected by inferType, analyzeType and validateExpressionTypes alike, never silently coerced", () => {
    const cases: [IRExpression, RegExp][] = [
      [add(money(1), bool(true)), /ADD operands/],
      [add(money(1), ratio(2)), /no mixing/],
      [sub(money(1), ratio(2)), /SUBTRACT operands/],
      [mul(money(1), money(2)), /at most one MONEY/],
      [max(money(1), ratio(2)), /mixed types/],
      [cmp(money(1), "LT", ratio(2)), /same type/],
      [and(bool(true), money(1)), /must all be BOOLEAN/],
      [not(money(1)), /NOT operand must be BOOLEAN/],
      [iff(money(1), money(1), money(2)), /IF condition must be BOOLEAN/],
      [iff(bool(true), money(1), ratio(2)), /same type/],
    ];
    for (const [expr, message] of cases) {
      expect(inferType(expr)).toBe(UNSUPPORTED_TYPE);
      const analysis = analyzeType(expr);
      expect(analysis.conflict).toMatch(message);
      expect(analysis.unsupported).toBe(true);
      expect(validateExpressionTypes(expr).some((i) => message.test(i.message))).toBe(true);
    }
  });

  it("an unknown comparison operator stays flagged", () => {
    const bad = withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left: money(1), operator: "APPROX" as unknown as "EQ", right: money(2) });
    expect(validateExpressionTypes(bad).some((i) => /unknown comparison operator/.test(i.message))).toBe(true);
  });
});

describe("F-6 type lattice - UNKNOWN (partial) is distinct from CONFLICT", () => {
  it("a composite over an UNSUPPORTED child is UNKNOWN: typed by its known part, non-executable, and NOT a type error", () => {
    const partial = sub(add(mul(pct(0.06), metric("Net Cash Proceeds")), mul(pct(0.07), metric("Market Capitalization"))), unsupported("amounts used elsewhere"));
    const analysis = analyzeType(partial);
    expect(analysis.known).toBe("MONEY");
    expect(analysis.unsupported).toBe(true);
    expect(analysis.conflict).toBeNull();
    expect(inferType(partial)).toBe(UNSUPPORTED_TYPE); // executability gate unchanged
    expect(validateExpressionTypes(partial)).toEqual([]); // honest partiality is not malformation
  });

  it("the known part must still be internally consistent - an UNSUPPORTED sibling never hides a genuine conflict among the typed operands", () => {
    const conflicting = add(money(1), ratio(2), unsupported("x"));
    const analysis = analyzeType(conflicting);
    expect(analysis.conflict).toMatch(/no mixing/);
    expect(analysis.known).toBeNull();
    expect(validateExpressionTypes(conflicting)).toHaveLength(1);
  });

  it("with no typed operand at all the dimension is unknown (null), never guessed", () => {
    expect(analyzeType(add(unsupported("a"), unsupported("b"))).known).toBeNull();
    expect(analyzeType(mul(pct(1), unsupported("base"))).known).toBeNull(); // a percent alone fixes no dimension
    expect(analyzeType(mul(pct(0.5), pct(0.5))).known).toBe("NUMBER"); // ...but a pure percent product without an unknown is dimensionless NUMBER, as before
  });

  it("BOOLEAN operators over an unsupported operand stay BOOLEAN-shaped but non-executable", () => {
    const gate = and(or(cmp(metric("FLLR", "RATIO"), "LTE", ratio(2)), cmp(metric("ICR", "RATIO"), "GTE", ratio(1.75))), not(unsupported("Specified Event of Default")));
    expect(analyzeType(gate)).toEqual({ known: "BOOLEAN", unsupported: true, conflict: null });
    expect(inferType(gate)).toBe(UNSUPPORTED_TYPE);
    expect(validateExpressionTypes(gate)).toEqual([]);
  });

  it("a missing child expression cannot disappear: the unsupported leaf is still in the tree and still poisons executability, however deep", () => {
    const deep = max(money(1), add(money(2), mul(pct(0.1), sub(metric("A"), unsupported("gone")))));
    expect(inferType(deep)).toBe(UNSUPPORTED_TYPE);
    expect(JSON.stringify(deep)).toContain('"kind":"UNSUPPORTED"');
  });
});

describe("F-6 validation - gates, conditions and false completeness", () => {
  it("an UnlimitedCapacity gate that is UNKNOWN (unsupported) is not a TYPE_ERROR; a gate with a KNOWN non-BOOLEAN type still is", () => {
    expect(validateCapacityExpressionTypes({ kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: and(bool(true), unsupported("x")) })).toEqual([]);
    expect(validateCapacityExpressionTypes({ kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: money(5) }).some((i) => /gatedBy must be BOOLEAN/.test(i.message))).toBe(true);
    expect(validateCapacityExpressionTypes({ kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: metric("Consolidated EBITDA") }).some((i) => /gatedBy must be BOOLEAN/.test(i.message))).toBe(true);
  });

  it("an IF whose condition is unsupported is UNKNOWN, an IF whose condition is a known MONEY is a CONFLICT", () => {
    expect(validateExpressionTypes(iff(unsupported("has an IPO occurred"), money(1), money(2)))).toEqual([]);
    expect(validateExpressionTypes(iff(metric("EBITDA"), money(1), money(2))).some((i) => /IF condition must be BOOLEAN/.test(i.message))).toBe(true);
  });

  it("FALSE_COMPLETENESS: a rule that declares COMPLETE over a partial capacity, condition, exception condition, or gate fails validation; declared PARTIAL it passes", () => {
    const partial = sub(money(10), unsupported("usage"));
    const gate = { kind: "UNLIMITED_CAPACITY" as const, type: "CAPACITY" as const, gatedBy: not(unsupported("event")) };
    const cases: IRRule[] = [
      rule({ capacityExpression: partial }),
      rule({ capacityExpression: gate }),
      rule({ conditions: [{ conditionId: "c", conditionType: "RATIO_SATISFIED", expression: and(bool(true), unsupported("x")), referencesDefinitionId: null, description: "", provenance: null }] }),
      rule({ exceptions: [{ exceptionId: "e", appliesToRuleId: "r", description: "", permissionRuleId: null, conditions: [{ conditionId: "c", conditionType: "OTHER_RULE_SATISFIED", expression: unsupported("x"), referencesDefinitionId: null, description: "", provenance: null }], provenance: null }] }),
    ];
    for (const r of cases) {
      const report = validateRule(r);
      expect(report.ok).toBe(false);
      expect(report.issues.map((i) => i.kind)).toContain("FALSE_COMPLETENESS");
      expect(report.issues.filter((i) => i.kind === "TYPE_ERROR")).toEqual([]);
      expect(validateRule({ ...r, sufficiency: "PARTIAL" }).ok).toBe(true);
    }
  });

  it("FALSE_COMPLETENESS applies to definitions exactly as to rules", () => {
    const partialBuilder = sub(add(max(money(540_000_000), mul(pct(0.75), metric("EBITDA"))), unsupported("retained proceeds")), unsupported("usage"));
    expect(validateDefinition(definition({ calculationExpression: partialBuilder, sufficiency: "COMPLETE" })).issues.map((i) => i.kind)).toContain("FALSE_COMPLETENESS");
    expect(validateDefinition(definition({ calculationExpression: partialBuilder, sufficiency: "PARTIAL" })).ok).toBe(true);
    expect(validateDefinition(definition({ calculationExpression: max(money(1), money(2)), sufficiency: "COMPLETE" })).ok).toBe(true);
  });

  it("a genuine conflict inside a COMPLETE rule is reported as both a TYPE_ERROR and FALSE_COMPLETENESS - never masked by the new leniency", () => {
    const report = validateRule(rule({ capacityExpression: add(money(1), bool(true)) }));
    expect(report.issues.map((i) => i.kind).sort()).toEqual(["FALSE_COMPLETENESS", "TYPE_ERROR"]);
  });
});
