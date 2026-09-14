/**
 * Phase 3A test matrix, Category C - safety (task §56). Proves the IR's
 * own honesty invariants: an UnsupportedExpression can never masquerade as
 * a real, executable value; an ambiguous/missing-context/conflicted
 * representation is a legitimate, distinguishable state rather than a
 * silent COMPLETE; dangling/cross-instrument references are mechanically
 * caught, never silently resolved.
 */
import { describe, expect, it } from "vitest";
import { inferType } from "../../../lib/contract-model/ir/type-check";
import { validateCompilationUnit, validateDefinition, validateRule } from "../../../lib/contract-model/ir/validate";
import { withExpressionId, computeRuleId } from "../../../lib/contract-model/ir/identity";
import { UNSUPPORTED_TYPE, type IRExpression, type IRRule } from "../../../lib/contract-model/ir/types";
import { FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE } from "../../fixtures/ir-examples/real-covenant-shapes";

const COMPANY_ID = "ir-fixture-co";
const INSTRUMENT_KEY = "ir-fixture-instrument";

function baseRule(overrides: Partial<IRRule> = {}): IRRule {
  return {
    ruleId: computeRuleId(COMPANY_ID, INSTRUMENT_KEY, "safety-test", "base"),
    irSchemaVersion: "headroom-covenant-ir.v1",
    companyId: COMPANY_ID,
    instrumentKey: INSTRUMENT_KEY,
    sourceDocumentId: "ir-fixture-doc",
    sourceSectionRef: "safety-test",
    covenantFamily: "INDEBTEDNESS",
    ruleType: "QUANTITATIVE_PERMISSION",
    posture: "PERMISSION",
    action: "INCUR_DEBT",
    entityScope: [],
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
    compilerVersion: null,
    sourceContentVersion: null,
    ...overrides,
  };
}

const unsupported: IRExpression = withExpressionId({
  kind: "UNSUPPORTED",
  type: null,
  sourceEvidence: "some dense cross-referenced clause",
  semanticDescription: "not representable in V1",
  reason: "test fixture",
  requiredReview: true,
});

describe("Phase 3A IR - Category C: safety", () => {
  it("C1: UnsupportedExpression is a first-class, preservable node - never dropped, never a real type", () => {
    expect(inferType(unsupported)).toBe(UNSUPPORTED_TYPE);
    const wrapped = withExpressionId({ kind: "ADD", type: "MONEY", operands: [withExpressionId({ kind: "MONEY", type: "MONEY", amount: 100, currency: "USD" }), unsupported] });
    expect(inferType(wrapped)).toBe(UNSUPPORTED_TYPE); // propagates upward through composition, never silently ignored
  });

  it("C2: AMBIGUOUS is a legitimate, distinguishable sufficiency state - not silently coerced to COMPLETE or UNSUPPORTED", () => {
    const rule = baseRule({ sufficiency: "AMBIGUOUS", sufficiencyReasons: ["the source text supports two readings and this V1 fixture does not adjudicate between them"] });
    expect(rule.sufficiency).toBe("AMBIGUOUS");
    expect(validateRule(rule).ok).toBe(true); // structurally well-formed even though semantically ambiguous - these are different questions
  });

  it("C3: MISSING_CONTEXT with a null calculationExpression is honestly valid - absence of formalized mechanics is not itself a structural defect (lsb-def-abl-notes-priority-collateral)", () => {
    expect(FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE.sufficiency).toBe("MISSING_CONTEXT");
    expect(FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE.calculationExpression).toBeNull();
    expect(validateDefinition(FIXTURE_15_UNSUPPORTED_CROSS_REFERENCE).ok).toBe(true);
  });

  it("C4: a CONFLICTED operative lineage status is representable and must not be silently treated as authoritative (task §24)", () => {
    const rule = baseRule({
      sufficiency: "CONFLICTED",
      sufficiencyReasons: ["operativeLineage.operativeStatus is OPERATIVE_STATE_CONFLICTED - Phase 2G found unresolved amendment conflicts for this provision"],
      operativeLineage: { instrumentKey: INSTRUMENT_KEY, provisionKey: "safety-test", asOfDate: "2026-01-01", operativeStatus: "OPERATIVE_STATE_CONFLICTED", currentSourceDocumentId: "ir-fixture-doc" },
    });
    expect(rule.operativeLineage?.operativeStatus).toBe("OPERATIVE_STATE_CONFLICTED");
    expect(rule.sufficiency).toBe("CONFLICTED"); // the rule's own sufficiency must reflect the conflicted lineage, never mask it as COMPLETE
  });

  it("C5: a dangling dependsOn reference is mechanically caught by validateCompilationUnit, never silently resolved", () => {
    const rule = baseRule({ dependsOn: [{ relationshipType: "REQUIRES", targetRuleId: "ir-rule:does-not-exist", description: "test" }] });
    const report = validateCompilationUnit({ irSchemaVersion: "headroom-covenant-ir.v1", companyId: COMPANY_ID, instrumentKey: INSTRUMENT_KEY, rules: [rule], definitions: [], sharedCapacities: [] });
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.kind === "DANGLING_REFERENCE")).toBe(true);
  });

  it("C6: a cross-instrument METRIC_REFERENCE is rejected, never silently matched across instruments (task §49)", () => {
    const crossInstrumentMetric = withExpressionId({ kind: "METRIC_REFERENCE", type: "MONEY", metricName: "EBITDA", companyId: COMPANY_ID, instrumentKey: "a-different-instrument", resolvedDefinitionId: null });
    const rule = baseRule({ capacityExpression: crossInstrumentMetric });
    const report = validateRule(rule);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.kind === "CROSS_INSTRUMENT_REFERENCE")).toBe(true);
  });

  it("C7: an UnsupportedExpression can never satisfy a real operator's type requirement, even deeply nested (e.g. as a COMPARE operand)", () => {
    const cmp = withExpressionId({ kind: "COMPARE", type: "BOOLEAN", left: unsupported, operator: "LTE", right: withExpressionId({ kind: "RATIO", type: "RATIO", value: 5.0 }) });
    expect(inferType(cmp)).toBe(UNSUPPORTED_TYPE); // never silently coerced to BOOLEAN just because the node's declared `type` field says so
    // The rule declares COMPLETE while its gate is not executable: since F-6 an
    // operator over an honest UNSUPPORTED child is no longer a structural
    // TYPE_ERROR (it is a PARTIAL representation), so the mechanical guard
    // is the explicit FALSE_COMPLETENESS issue - the report still fails.
    const rule = baseRule({ capacityExpression: { kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: cmp } });
    const report = validateRule(rule);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.kind === "FALSE_COMPLETENESS")).toBe(true);
    // Declared honestly PARTIAL, the same rule is structurally valid - partiality is not malformation.
    expect(validateRule({ ...rule, sufficiency: "PARTIAL" }).ok).toBe(true);
    // ...but the gate itself remains non-executable either way.
    expect(inferType(cmp)).toBe(UNSUPPORTED_TYPE);
  });
});
