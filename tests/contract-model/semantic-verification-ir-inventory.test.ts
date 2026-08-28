/**
 * Phase 3C Layer 1b synthetic tests - ir-inventory.ts. Hand-built minimal
 * IRRule/IRDefinition fixtures (never real FWRG/LSB shapes/numbers).
 */
import { describe, expect, it } from "vitest";
import { buildIrInventory } from "../../lib/contract-model/compiler/semantic-verification/ir-inventory";
import type { IRRule } from "../../lib/contract-model/ir/types";

let ruleCounter = 0;
function rule(overrides: Partial<IRRule>): IRRule {
  ruleCounter++;
  return {
    ruleId: `ir-rule:test-${ruleCounter}`,
    irSchemaVersion: "test-v1",
    companyId: "test-co",
    instrumentKey: "test-instrument",
    sourceDocumentId: "test-doc",
    sourceSectionRef: "9.01",
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
    compilerVersion: "test-v1",
    sourceContentVersion: null,
    ...overrides,
  } as IRRule;
}

const exprId = (() => {
  let n = 0;
  return () => `ir-expr:test-${++n}`;
})();

describe("Phase 3C Layer 1b - IR-side semantic inventory", () => {
  it("a flat MONEY leaf is recorded as an AMOUNT item, not marked as an alternative", () => {
    const r = rule({ capacityExpression: { exprId: exprId(), kind: "MONEY", type: "MONEY", amount: 10_000_000, currency: "USD" } });
    const inv = buildIrInventory("case-1", [r], []);
    const amounts = inv.items.filter((i) => i.kind === "AMOUNT");
    expect(amounts).toHaveLength(1);
    expect(amounts[0]?.numericValue).toBe(10_000_000);
    expect(amounts[0]?.isAlternativeWithinSelection).toBe(false);
  });

  it("a MONEY leaf inside MAX(...) is marked isAlternativeWithinSelection - distinguishing it from an independent basket (task §10's own worked example)", () => {
    const r = rule({
      capacityExpression: {
        exprId: exprId(),
        kind: "MAX",
        type: "MONEY",
        operands: [
          { exprId: exprId(), kind: "MONEY", type: "MONEY", amount: 5_000_000, currency: "USD" },
          { exprId: exprId(), kind: "MULTIPLY", type: "MONEY", operands: [{ exprId: exprId(), kind: "PERCENT", type: "PERCENT", value: 0.08 }, { exprId: exprId(), kind: "METRIC_REFERENCE", type: "MONEY", metricName: "Consolidated Net Income", companyId: "c", instrumentKey: "i", resolvedDefinitionId: null }] },
        ],
      },
    });
    const inv = buildIrInventory("case-2", [r], []);
    const amount = inv.items.find((i) => i.kind === "AMOUNT")!;
    const percent = inv.items.find((i) => i.kind === "PERCENT")!;
    const metric = inv.items.find((i) => i.kind === "METRIC_REFERENCE")!;
    expect(amount.isAlternativeWithinSelection).toBe(true);
    expect(percent.isAlternativeWithinSelection).toBe(true);
    expect(metric.textValue).toBe("Consolidated Net Income");
    expect(amount.irPath).toContain("operands[0]");
  });

  it("records action, posture, conditions, exceptions, and dependencies at the rule level", () => {
    const r = rule({
      action: "PAY_DIVIDEND",
      posture: "PERMISSION",
      conditions: [{ conditionId: "c1", conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "no Event of Default", provenance: null }],
      exceptions: [{ exceptionId: "e1", appliesToRuleId: "ir-rule:other", description: "carve-out", permissionRuleId: null, conditions: [], provenance: null }],
      dependsOn: [{ relationshipType: "REQUIRES", targetRuleId: "ir-rule:dep", description: "x" }],
    });
    const inv = buildIrInventory("case-3", [r], []);
    expect(inv.items.some((i) => i.kind === "ACTION" && i.textValue === "PAY_DIVIDEND")).toBe(true);
    expect(inv.items.some((i) => i.kind === "POSTURE" && i.textValue === "PERMISSION")).toBe(true);
    expect(inv.items.some((i) => i.kind === "CONDITION" && i.textValue === "no Event of Default")).toBe(true);
    expect(inv.items.some((i) => i.kind === "EXCEPTION" && i.textValue === "carve-out")).toBe(true);
    expect(inv.items.some((i) => i.kind === "DEPENDENCY" && i.textValue?.includes("ir-rule:dep"))).toBe(true);
  });

  it("UNLIMITED_CAPACITY produces a marker item plus the gatedBy subtree", () => {
    const r = rule({
      capacityExpression: {
        kind: "UNLIMITED_CAPACITY",
        type: "CAPACITY",
        gatedBy: { exprId: exprId(), kind: "COMPARE", type: "BOOLEAN", left: { exprId: exprId(), kind: "METRIC_REFERENCE", type: "RATIO", metricName: "Leverage Ratio", companyId: "c", instrumentKey: "i", resolvedDefinitionId: null }, operator: "LTE", right: { exprId: exprId(), kind: "RATIO", type: "RATIO", value: 3.5 } },
      },
    });
    const inv = buildIrInventory("case-4", [r], []);
    expect(inv.items.some((i) => i.kind === "UNLIMITED_CAPACITY_MARKER")).toBe(true);
    const ratio = inv.items.find((i) => i.kind === "RATIO");
    expect(ratio?.numericValue).toBe(3.5);
  });

  it("IF then/else branches are both marked as alternatives (mutually exclusive outcomes)", () => {
    const r = rule({
      capacityExpression: {
        exprId: exprId(),
        kind: "IF",
        type: "MONEY",
        condition: { exprId: exprId(), kind: "BOOLEAN_LITERAL", type: "BOOLEAN", value: true },
        then: { exprId: exprId(), kind: "MONEY", type: "MONEY", amount: 1, currency: "USD" },
        else: { exprId: exprId(), kind: "MONEY", type: "MONEY", amount: 2, currency: "USD" },
      },
    });
    const inv = buildIrInventory("case-5", [r], []);
    const amounts = inv.items.filter((i) => i.kind === "AMOUNT");
    expect(amounts).toHaveLength(2);
    expect(amounts.every((a) => a.isAlternativeWithinSelection)).toBe(true);
  });

  it("SCHEDULE cases and defaultValue are all marked as alternatives", () => {
    const r = rule({
      capacityExpression: {
        exprId: exprId(),
        kind: "SCHEDULE",
        type: "RATIO",
        cases: [{ from: null, to: "2026-12-31", value: { exprId: exprId(), kind: "RATIO", type: "RATIO", value: 5.0 }, description: "through 2026" }],
        defaultValue: { exprId: exprId(), kind: "RATIO", type: "RATIO", value: 4.5 },
      },
    });
    const inv = buildIrInventory("case-6", [r], []);
    const ratios = inv.items.filter((i) => i.kind === "RATIO");
    expect(ratios).toHaveLength(2);
    expect(ratios.every((r2) => r2.isAlternativeWithinSelection)).toBe(true);
    expect(ratios.map((r2) => r2.numericValue).sort()).toEqual([4.5, 5.0]);
  });

  it("UNSUPPORTED nodes produce a marker preserving the model's own semanticDescription, nested anywhere in the tree", () => {
    const r = rule({
      capacityExpression: {
        exprId: exprId(),
        kind: "MAX",
        type: "MONEY",
        operands: [{ exprId: exprId(), kind: "MONEY", type: "MONEY", amount: 1, currency: "USD" }, { exprId: exprId(), kind: "UNSUPPORTED", type: null, sourceEvidence: "x", semanticDescription: "a stateful cooldown proviso", reason: "y", requiredReview: true }],
      },
    });
    const inv = buildIrInventory("case-7", [r], []);
    const unsupported = inv.items.find((i) => i.kind === "UNSUPPORTED_MARKER");
    expect(unsupported?.textValue).toBe("a stateful cooldown proviso");
  });

  it("a definition's calculationExpression and dependsOnTerms are both walked", () => {
    const def = { definitionId: "ir-def:1", irSchemaVersion: "v1", companyId: "c", instrumentKey: "i", sourceDocumentId: "d", termName: "Consolidated EBITDA", covenantFamily: "DEFINITIONS_CALCULATION_RULES" as const, calculationExpression: { exprId: exprId(), kind: "ADD" as const, type: "MONEY" as const, operands: [{ exprId: exprId(), kind: "MONEY" as const, type: "MONEY" as const, amount: 100, currency: "USD" }] }, dependsOnTerms: ["Net Income"], sufficiency: "COMPLETE" as const, sufficiencyReasons: [], provenance: null, compilerVersion: "v1", sourceContentVersion: null };
    const inv = buildIrInventory("case-8", [], [def]);
    expect(inv.items.some((i) => i.kind === "AMOUNT" && i.numericValue === 100)).toBe(true);
    expect(inv.items.some((i) => i.kind === "DEPENDENCY" && i.textValue?.includes("Net Income"))).toBe(true);
    expect(inv.definitionCount).toBe(1);
  });

  it("stable content-derived item identity: rebuilding the same rule produces identical itemIds", () => {
    const r = rule({ ruleId: "ir-rule:stable", capacityExpression: { exprId: "e1", kind: "MONEY", type: "MONEY", amount: 42, currency: "USD" } });
    const inv1 = buildIrInventory("case-9", [r], []);
    const inv2 = buildIrInventory("case-9", [r], []);
    expect(inv1.items.map((i) => i.itemId)).toEqual(inv2.items.map((i) => i.itemId));
  });
});
