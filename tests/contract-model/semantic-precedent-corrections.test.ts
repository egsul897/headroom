/**
 * Phase 3D - reviewer-correction model tests (task §27-§32/§52). Proves
 * each named dimension is classified correctly and that an unchanged rule
 * produces zero corrections (itself a meaningful "reviewer approved as-is"
 * signal).
 */
import { describe, expect, it } from "vitest";
import { computeReviewerCorrections, diffRule } from "../../lib/contract-model/compiler/semantic-precedent/corrections";
import type { IRExpression, IRRule } from "../../lib/contract-model/ir/types";

let counter = 0;
function money(amount: number): IRExpression {
  counter++;
  return { exprId: `e-${counter}`, kind: "MONEY", type: "MONEY", amount, currency: "USD" };
}
function percent(value: number): IRExpression {
  counter++;
  return { exprId: `e-${counter}`, kind: "PERCENT", type: "PERCENT", value };
}
function metric(metricName: string): IRExpression {
  counter++;
  return { exprId: `e-${counter}`, kind: "METRIC_REFERENCE", type: "MONEY", metricName, companyId: "co", instrumentKey: "instr", resolvedDefinitionId: null };
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
    capacityExpression: money(1_000_000),
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

describe("diffRule", () => {
  it("an unchanged rule produces zero corrections", () => {
    const r = rule({ ruleId: "same" });
    expect(diffRule(r, r)).toHaveLength(0);
  });

  it("classifies an action change as ACTION", () => {
    const proposed = rule({ ruleId: "r1", action: "INCUR_DEBT" });
    const reviewed = rule({ ruleId: "r1", action: "OTHER" });
    const corrections = diffRule(proposed, reviewed);
    expect(corrections.some((c) => c.dimension === "ACTION")).toBe(true);
  });

  it("classifies a posture change as POSTURE", () => {
    const proposed = rule({ ruleId: "r1", posture: "PERMISSION" });
    const reviewed = rule({ ruleId: "r1", posture: "PROHIBITION" });
    const corrections = diffRule(proposed, reviewed);
    expect(corrections.some((c) => c.dimension === "POSTURE")).toBe(true);
  });

  it("classifies a dollar-amount change as AMOUNT, not LOGIC", () => {
    const proposed = rule({ ruleId: "r1", capacityExpression: money(1_000_000) });
    const reviewed = rule({ ruleId: "r1", capacityExpression: money(2_000_000) });
    const corrections = diffRule(proposed, reviewed);
    expect(corrections.map((c) => c.dimension)).toEqual(["AMOUNT"]);
  });

  it("classifies MAX -> MIN as LOGIC", () => {
    const proposed = rule({ ruleId: "r1", capacityExpression: { exprId: "e1", kind: "MAX", type: "MONEY", operands: [money(1), money(2)] } });
    const reviewed = rule({ ruleId: "r1", capacityExpression: { exprId: "e2", kind: "MIN", type: "MONEY", operands: [money(1), money(2)] } });
    const corrections = diffRule(proposed, reviewed);
    expect(corrections.some((c) => c.dimension === "LOGIC")).toBe(true);
  });

  it("classifies a percent change as PERCENT and a metric-name change as METRIC, independently", () => {
    const proposed = rule({ ruleId: "r1", capacityExpression: { exprId: "e1", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.1), metric("Consolidated EBITDA")] } });
    const reviewed = rule({ ruleId: "r1", capacityExpression: { exprId: "e2", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.125), metric("Adjusted EBITDA")] } });
    const corrections = diffRule(proposed, reviewed);
    expect(corrections.some((c) => c.dimension === "PERCENT")).toBe(true);
    expect(corrections.some((c) => c.dimension === "METRIC")).toBe(true);
  });

  it("classifies an added exception as EXCEPTION", () => {
    const proposed = rule({ ruleId: "r1", exceptions: [] });
    const reviewed = rule({ ruleId: "r1", exceptions: [{ exceptionId: "exc-1", appliesToRuleId: "r1", description: "carve-out", permissionRuleId: null, conditions: [], provenance: null }] });
    const corrections = diffRule(proposed, reviewed);
    expect(corrections.some((c) => c.dimension === "EXCEPTION")).toBe(true);
  });

  it("classifies an entity-scope change as SCOPE", () => {
    const proposed = rule({ ruleId: "r1", entityScope: ["BORROWER"] });
    const reviewed = rule({ ruleId: "r1", entityScope: ["BORROWER", "GUARANTOR_RS"] });
    const corrections = diffRule(proposed, reviewed);
    expect(corrections.some((c) => c.dimension === "SCOPE")).toBe(true);
  });

  it("classifies an added dependency as DEPENDENCY", () => {
    const proposed = rule({ ruleId: "r1", dependsOn: [] });
    const reviewed = rule({ ruleId: "r1", dependsOn: [{ relationshipType: "REQUIRES", targetRuleId: "other", description: "x" }] });
    const corrections = diffRule(proposed, reviewed);
    expect(corrections.some((c) => c.dimension === "DEPENDENCY")).toBe(true);
  });

  it("classifies a provenance citation change as PROVENANCE", () => {
    const proposed = rule({ ruleId: "r1", provenance: { documentId: "doc-a", sourceNodeKey: null, sourceCitation: "6.01(a)", excerpt: null } });
    const reviewed = rule({ ruleId: "r1", provenance: { documentId: "doc-a", sourceNodeKey: null, sourceCitation: "6.01(b)", excerpt: null } });
    const corrections = diffRule(proposed, reviewed);
    expect(corrections.some((c) => c.dimension === "PROVENANCE")).toBe(true);
  });
});

describe("computeReviewerCorrections", () => {
  it("classifies a reviewer-added rule as MISSING_RULE", () => {
    const proposed = [rule({ ruleId: "r1" })];
    const reviewed = [rule({ ruleId: "r1" }), rule({ ruleId: "r2" })];
    const corrections = computeReviewerCorrections(proposed, reviewed);
    const missing = corrections.filter((c) => c.dimension === "MISSING_RULE");
    expect(missing).toHaveLength(1);
    expect(missing[0]!.reviewedValue).toContain("r2");
  });

  it("classifies a reviewer-removed rule as UNSUPPORTED_SEMANTIC_SHAPE", () => {
    const proposed = [rule({ ruleId: "r1" }), rule({ ruleId: "r2" })];
    const reviewed = [rule({ ruleId: "r1" })];
    const corrections = computeReviewerCorrections(proposed, reviewed);
    const removed = corrections.filter((c) => c.dimension === "UNSUPPORTED_SEMANTIC_SHAPE");
    expect(removed).toHaveLength(1);
    expect(removed[0]!.proposedValue).toContain("r2");
  });

  it("identical proposed/reviewed rule sets produce zero corrections", () => {
    const rules = [rule({ ruleId: "r1" }), rule({ ruleId: "r2" })];
    expect(computeReviewerCorrections(rules, rules)).toHaveLength(0);
  });

  it("matches rules by ruleId, not array position", () => {
    const proposed = [rule({ ruleId: "r1", action: "INCUR_DEBT" }), rule({ ruleId: "r2", action: "OTHER" })];
    // reversed order in the reviewed array - matching must still be by id, not index.
    const reviewed = [rule({ ruleId: "r2", action: "OTHER" }), rule({ ruleId: "r1", action: "INCUR_DEBT" })];
    expect(computeReviewerCorrections(proposed, reviewed)).toHaveLength(0);
  });
});
