/**
 * Phase 3D - computeSemanticSignature tests (task §11-§14). The central
 * property under test throughout: two IRRules that differ ONLY in identity
 * fields (company/instrument/section) or literal values (dollar amount,
 * metric name, defined-term name) must produce an IDENTICAL signature, and
 * two rules that differ in real semantic SHAPE (MAX vs MIN, AND vs OR, a
 * missing condition) must produce a DIFFERENT signature - this is the
 * mechanical anti-memorization property task §9/§65(A)/(B) requires.
 */
import { describe, expect, it } from "vitest";
import { computeSemanticSignature } from "../../lib/contract-model/compiler/semantic-precedent/signature";
import type { IRCondition, IRExpression, IRRule, IRSharedCapacity } from "../../lib/contract-model/ir/types";

let counter = 0;
function money(amount: number): IRExpression {
  counter++;
  return { exprId: `expr-${counter}`, kind: "MONEY", type: "MONEY", amount, currency: "USD" };
}
function percent(value: number): IRExpression {
  counter++;
  return { exprId: `expr-${counter}`, kind: "PERCENT", type: "PERCENT", value };
}
function metric(metricName: string): IRExpression {
  counter++;
  return { exprId: `expr-${counter}`, kind: "METRIC_REFERENCE", type: "MONEY", metricName, companyId: "co", instrumentKey: "instr", resolvedDefinitionId: null };
}
function ratio(value: number): IRExpression {
  counter++;
  return { exprId: `expr-${counter}`, kind: "RATIO", type: "RATIO", value };
}

function rule(overrides: Partial<IRRule> = {}): IRRule {
  counter++;
  return {
    ruleId: `rule-${counter}`,
    irSchemaVersion: "v1",
    companyId: "co-a",
    instrumentKey: "instr-a",
    sourceDocumentId: "doc-a",
    sourceSectionRef: "6.01",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: ["BORROWER"],
    entityScopeExcluded: [],
    transactionScope: null,
    capacityExpression: null,
    conditions: [],
    exceptions: [],
    dependsOn: [],
    operativeLineage: null,
    sufficiency: "COMPLETE",
    sufficiencyReasons: [],
    provenance: null,
    compilerVersion: "v1",
    sourceContentVersion: null,
    ...overrides,
  } as IRRule;
}

function condition(overrides: Partial<IRCondition> = {}): IRCondition {
  counter++;
  return { conditionId: `cond-${counter}`, conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "test", provenance: null, ...overrides };
}

describe("computeSemanticSignature", () => {
  it("produces an identical signature for a 'greater of $X and Y% of Metric' shape regardless of the literal dollar amount, percentage, or metric name (task §22 parameterization intent applied at the retrieval layer)", () => {
    const a = rule({ capacityExpression: { exprId: "e1", kind: "MAX", type: "MONEY", operands: [money(75_000_000), { exprId: "e2", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.125), metric("Consolidated EBITDA")] }] } });
    const b = rule({ capacityExpression: { exprId: "e3", kind: "MAX", type: "MONEY", operands: [money(100_000_000), { exprId: "e4", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.075), metric("Consolidated Total Assets")] }] } });

    expect(computeSemanticSignature(a)).toEqual(computeSemanticSignature(b));
  });

  it("changing company/instrument/document/section identity never changes the signature (identity fields are absent from the walk entirely)", () => {
    const base = rule({ companyId: "co-a", instrumentKey: "instr-a", sourceDocumentId: "doc-a", sourceSectionRef: "6.01", capacityExpression: money(1_000_000) });
    const different = rule({ companyId: "co-z", instrumentKey: "instr-z", sourceDocumentId: "doc-z", sourceSectionRef: "9.99", capacityExpression: money(1_000_000) });
    expect(computeSemanticSignature(base)).toEqual(computeSemanticSignature(different));
  });

  it("distinguishes MAX from MIN (contrast test - task §39)", () => {
    const maxRule = rule({ capacityExpression: { exprId: "e1", kind: "MAX", type: "MONEY", operands: [money(1), money(2)] } });
    const minRule = rule({ capacityExpression: { exprId: "e2", kind: "MIN", type: "MONEY", operands: [money(1), money(2)] } });
    expect(computeSemanticSignature(maxRule).topLevelOperator).toBe("MAX");
    expect(computeSemanticSignature(minRule).topLevelOperator).toBe("MIN");
    expect(computeSemanticSignature(maxRule)).not.toEqual(computeSemanticSignature(minRule));
  });

  it("distinguishes AND from OR at the condition-expression level", () => {
    const andExpr: IRExpression = { exprId: "e1", kind: "AND", type: "BOOLEAN", operands: [ratio(4.5)] };
    const orExpr: IRExpression = { exprId: "e2", kind: "OR", type: "BOOLEAN", operands: [ratio(4.5)] };
    const andRule = rule({ conditions: [condition({ expression: andExpr })] });
    const orRule = rule({ conditions: [condition({ expression: orExpr })] });
    expect(computeSemanticSignature(andRule).operatorSet).toContain("AND");
    expect(computeSemanticSignature(orRule).operatorSet).toContain("OR");
    expect(computeSemanticSignature(andRule)).not.toEqual(computeSemanticSignature(orRule));
  });

  it("detects a ratio gate nested inside a COMPARE even without a bare RATIO literal at the top", () => {
    const expr: IRExpression = { exprId: "e1", kind: "COMPARE", type: "BOOLEAN", left: metric("Leverage Ratio"), operator: "LTE", right: ratio(4.5) };
    const r = rule({ conditions: [condition({ expression: expr })] });
    expect(computeSemanticSignature(r).hasRatioGate).toBe(true);
  });

  it("detects UNLIMITED_CAPACITY as the top-level operator and still walks gatedBy", () => {
    const r = rule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: { exprId: "e1", kind: "COMPARE", type: "BOOLEAN", left: metric("Leverage Ratio"), operator: "LTE", right: ratio(4.5) } } });
    const sig = computeSemanticSignature(r);
    expect(sig.topLevelOperator).toBe("UNLIMITED_CAPACITY");
    expect(sig.hasRatioGate).toBe(true);
  });

  it("hasSharedCapacity is true only when the rule's ruleId is a member of a provided IRSharedCapacity, and does not require any hardcoded id", () => {
    const r = rule({ ruleId: "rule-shared" });
    const sharedCapacities: IRSharedCapacity[] = [{ sharedCapId: "sc-1", companyId: "co", instrumentKey: "instr", description: "shared pool", capExpression: money(1), memberRuleIds: ["rule-shared"], provenance: null }];
    expect(computeSemanticSignature(r, { sharedCapacities }).hasSharedCapacity).toBe(true);
    expect(computeSemanticSignature(r, { sharedCapacities: [] }).hasSharedCapacity).toBe(false);
  });

  it("hasReclassificationDependency is true for RECLASSIFIABLE_TO/REDESIGNATES_TO and false for an unrelated relationship type", () => {
    const reclassRule = rule({ dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: "other", description: "x" }] });
    const unrelatedRule = rule({ dependsOn: [{ relationshipType: "REQUIRES", targetRuleId: "other", description: "x" }] });
    expect(computeSemanticSignature(reclassRule).hasReclassificationDependency).toBe(true);
    expect(computeSemanticSignature(unrelatedRule).hasReclassificationDependency).toBe(false);
  });

  it("entityScopeTags and conditionTypes are deduplicated and sorted (order-independence)", () => {
    const r1 = rule({ entityScope: ["BORROWER", "GUARANTOR_RS", "BORROWER"] });
    const r2 = rule({ entityScope: ["GUARANTOR_RS", "BORROWER"] });
    expect(computeSemanticSignature(r1).entityScopeTags).toEqual(computeSemanticSignature(r2).entityScopeTags);
  });
});
