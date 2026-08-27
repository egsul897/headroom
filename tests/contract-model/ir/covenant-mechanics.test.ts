/**
 * Phase 3A test matrix, Category B - covenant mechanics (task §56). Proves
 * each real, distinct covenant shape task §0-§22 requires the IR to
 * represent actually structurally exists in the 15 real-covenant fixtures
 * (tests/fixtures/ir-examples/real-covenant-shapes.ts, drawn verbatim from
 * the FWRG/LSB human ground truth) - never re-deriving new figures here.
 */
import { describe, expect, it } from "vitest";
import { validateCompilationUnit, validateRule } from "../../../lib/contract-model/ir/validate";
import { inferType } from "../../../lib/contract-model/ir/type-check";
import { withExpressionId, computeRuleId } from "../../../lib/contract-model/ir/identity";
import type { IRRule, IRExpression } from "../../../lib/contract-model/ir/types";
import {
  ALL_FIXTURE_RULES,
  ALL_FIXTURE_DEFINITIONS,
  ALL_FIXTURE_SHARED_CAPACITIES,
  FIXTURE_1_FIXED_DEBT_BASKET,
  FIXTURE_2_PERCENTAGE_OF_EBITDA,
  FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT,
  FIXTURE_4_GREATER_OF_FIXED_OR_TOTAL_ASSETS_PCT,
  FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO,
  FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE,
  FIXTURE_8_ACQUISITION_STEP_UP,
  FIXTURE_9_MULTIBASKET_SECTION,
  FIXTURE_10_SHARED_CAP_RULE_A,
  FIXTURE_10_SHARED_CAP_RULE_B,
  FIXTURE_10_SHARED_CAPACITY,
  FIXTURE_11_NO_DEFAULT_CONDITION,
  FIXTURE_13_RP_PERMISSION_UNDER_EXCEPTION,
  FIXTURE_13_RP_PROHIBITION,
  FIXTURE_14_BUILDER_AVAILABLE_AMOUNT,
} from "../../fixtures/ir-examples/real-covenant-shapes";

describe("Phase 3A IR - Category B: covenant mechanics", () => {
  it("B1: fixed basket - a plain MONEY capacityExpression (lsb-6.08, $500,000)", () => {
    expect(FIXTURE_1_FIXED_DEBT_BASKET.capacityExpression?.kind).toBe("MONEY");
    expect((FIXTURE_1_FIXED_DEBT_BASKET.capacityExpression as { amount: number }).amount).toBe(500_000);
    expect(validateRule(FIXTURE_1_FIXED_DEBT_BASKET).ok).toBe(true);
  });

  it("B2: percentage basket - MULTIPLY(PERCENT, METRIC_REFERENCE) types to MONEY (fwrg-6.01-g-i's 5% component)", () => {
    expect(FIXTURE_2_PERCENTAGE_OF_EBITDA.capacityExpression?.kind).toBe("MULTIPLY");
    expect(inferType(FIXTURE_2_PERCENTAGE_OF_EBITDA.capacityExpression as IRExpression)).toBe("MONEY");
    expect(validateRule(FIXTURE_2_PERCENTAGE_OF_EBITDA).ok).toBe(true);
  });

  it("B3: arbitrary-metric percentage basket - fixture 4 (Total Assets) is the IDENTICAL node-kind shape as fixture 3 (EBITDA), only metricName differs (anti-enumeration proof, lsb-6.01-i)", () => {
    const shapeOf = (expr: IRExpression): unknown => {
      if (expr.kind === "MAX") return { kind: "MAX", operands: expr.operands.map(shapeOf) };
      if (expr.kind === "MULTIPLY") return { kind: "MULTIPLY", operands: expr.operands.map(shapeOf) };
      if (expr.kind === "MONEY") return { kind: "MONEY" };
      if (expr.kind === "PERCENT") return { kind: "PERCENT" };
      if (expr.kind === "METRIC_REFERENCE") return { kind: "METRIC_REFERENCE" }; // metricName deliberately excluded from the shape comparison
      return { kind: expr.kind };
    };
    const shape3 = shapeOf(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT.capacityExpression as IRExpression);
    const shape4 = shapeOf(FIXTURE_4_GREATER_OF_FIXED_OR_TOTAL_ASSETS_PCT.capacityExpression as IRExpression);
    expect(shape4).toEqual(shape3);
    // and the metricName genuinely differs - this is not a trivial identity
    const findMetricName = (expr: IRExpression): string | null => {
      if (expr.kind === "METRIC_REFERENCE") return expr.metricName;
      if (expr.kind === "MAX" || expr.kind === "MULTIPLY") {
        for (const op of expr.operands) {
          const found = findMetricName(op);
          if (found) return found;
        }
      }
      return null;
    };
    const metricName = (expr: IRExpression): string => {
      const found = findMetricName(expr);
      if (!found) throw new Error("no METRIC_REFERENCE found in expression");
      return found;
    };
    expect(metricName(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT.capacityExpression as IRExpression)).toBe("Consolidated Adjusted EBITDA");
    expect(metricName(FIXTURE_4_GREATER_OF_FIXED_OR_TOTAL_ASSETS_PCT.capacityExpression as IRExpression)).toBe("Consolidated Total Assets");
  });

  it("B4: greater-of - MAX(MONEY, MULTIPLY(PERCENT, METRIC_REFERENCE)) types to MONEY (fwrg-6.01-g-i: greater of $2,500,000 and 5% of EBITDA)", () => {
    const capacity = FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT.capacityExpression as IRExpression;
    expect(capacity.kind).toBe("MAX");
    expect(inferType(capacity)).toBe("MONEY");
    expect(validateRule(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT).ok).toBe(true);
  });

  it("B5: ratio test - UnlimitedCapacity gated by a COMPARE, never a MONEY-typed node forced onto a pass/fail test (fwrg-6.10-a base leverage comparison)", () => {
    const capacity = FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO.capacityExpression;
    expect(capacity?.kind).toBe("UNLIMITED_CAPACITY");
    const gatedBy = (capacity as { gatedBy: IRExpression }).gatedBy;
    expect(gatedBy.kind).toBe("COMPARE");
    expect(inferType(gatedBy)).toBe("BOOLEAN");
    expect(validateRule(FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO).ok).toBe(true);
  });

  it("B6: stepped threshold - one SCHEDULE node with dated cases + a default, never a STEPPED_LEVERAGE-shaped special type (fwrg-6.10-a: 5.50 -> 5.25 -> 5.00)", () => {
    const gatedBy = (FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE.capacityExpression as { gatedBy: IRExpression }).gatedBy;
    const schedule = (gatedBy as { right: IRExpression }).right;
    expect(schedule.kind).toBe("SCHEDULE");
    if (schedule.kind !== "SCHEDULE") throw new Error("unreachable");
    expect(schedule.cases).toHaveLength(2);
    expect(schedule.defaultValue).not.toBeNull();
    expect(inferType(schedule)).toBe("RATIO");
    expect(validateRule(FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE).ok).toBe(true);
  });

  it("B7: acquisition step-up - EVENT_ACTIVE + IF + ADD(RATIO, RATIO), generalized past 'acquisition' specifically (fwrg-6.10-a: +0.50x for 4 quarters)", () => {
    const gatedBy = (FIXTURE_8_ACQUISITION_STEP_UP.capacityExpression as { gatedBy: IRExpression }).gatedBy;
    const stepIf = (gatedBy as { right: IRExpression }).right;
    expect(stepIf.kind).toBe("IF");
    if (stepIf.kind !== "IF") throw new Error("unreachable");
    expect(stepIf.condition.kind).toBe("EVENT_ACTIVE");
    expect(stepIf.then.kind).toBe("ADD");
    expect(inferType(stepIf)).toBe("RATIO");
    expect(FIXTURE_8_ACQUISITION_STEP_UP.sufficiency).toBe("PARTIAL"); // the anti-stacking rule is honestly not formalized
    expect(validateRule(FIXTURE_8_ACQUISITION_STEP_UP).ok).toBe(true);
  });

  it("B8: condition - a first-class IRCondition, never folded into unstructured notes (fwrg-6.04-a-x: NO_DEFAULT)", () => {
    expect(FIXTURE_11_NO_DEFAULT_CONDITION.conditions).toHaveLength(1);
    expect(FIXTURE_11_NO_DEFAULT_CONDITION.conditions[0]?.conditionType).toBe("NO_DEFAULT");
    expect(validateRule(FIXTURE_11_NO_DEFAULT_CONDITION).ok).toBe(true);
  });

  it("B9: exception - a PROHIBITION rule's exceptions reference a real, separately-modeled PERMISSION rule by id, never restated inline (lsb-6.11)", () => {
    expect(FIXTURE_13_RP_PROHIBITION.exceptions).toHaveLength(2);
    const fixedException = FIXTURE_13_RP_PROHIBITION.exceptions[0];
    expect(fixedException?.appliesToRuleId).toBe(FIXTURE_13_RP_PROHIBITION.ruleId);
    expect(fixedException?.permissionRuleId).toBe(FIXTURE_13_RP_PERMISSION_UNDER_EXCEPTION.ruleId);
    expect(validateRule(FIXTURE_13_RP_PROHIBITION).ok).toBe(true);
  });

  it("B10: multi-basket section - three independently-gated rules from ONE source section, never flattened into one rule (lsb-6.13)", () => {
    expect(FIXTURE_9_MULTIBASKET_SECTION).toHaveLength(3);
    for (const rule of FIXTURE_9_MULTIBASKET_SECTION) expect(rule.sourceSectionRef).toBe("6.13");
    const ruleIds = new Set(FIXTURE_9_MULTIBASKET_SECTION.map((r) => r.ruleId));
    expect(ruleIds.size).toBe(3); // distinct stable ids despite the shared section
  });

  it("B11: shared cap - a separate IRSharedCapacity resource, never duplicated into each member rule's own capacityExpression (fwrg-6.04-a-x/6.04-b cross-basket offset)", () => {
    expect(FIXTURE_10_SHARED_CAPACITY.memberRuleIds).toEqual([FIXTURE_10_SHARED_CAP_RULE_A.ruleId, FIXTURE_10_SHARED_CAP_RULE_B.ruleId]);
    const usageRefA = (FIXTURE_10_SHARED_CAP_RULE_A.capacityExpression as { right: IRExpression }).right;
    const usageRefB = (FIXTURE_10_SHARED_CAP_RULE_B.capacityExpression as { right: IRExpression }).right;
    expect(usageRefA.kind).toBe("LEDGER_USAGE_REFERENCE");
    expect(usageRefB.kind).toBe("LEDGER_USAGE_REFERENCE");
    if (usageRefA.kind !== "LEDGER_USAGE_REFERENCE" || usageRefB.kind !== "LEDGER_USAGE_REFERENCE") throw new Error("unreachable");
    expect(usageRefA.sharedCapId).toBe(FIXTURE_10_SHARED_CAPACITY.sharedCapId);
    expect(usageRefB.sharedCapId).toBe(FIXTURE_10_SHARED_CAPACITY.sharedCapId);
  });

  it("B12: rule dependency - each shared-cap rule's dependsOn edge resolves to the OTHER rule's real ruleId, never a dangling placeholder", () => {
    expect(FIXTURE_10_SHARED_CAP_RULE_A.dependsOn).toHaveLength(1);
    expect(FIXTURE_10_SHARED_CAP_RULE_A.dependsOn[0]?.relationshipType).toBe("SHARES_CAPACITY_WITH");
    expect(FIXTURE_10_SHARED_CAP_RULE_A.dependsOn[0]?.targetRuleId).toBe(FIXTURE_10_SHARED_CAP_RULE_B.ruleId);
    expect(FIXTURE_10_SHARED_CAP_RULE_B.dependsOn[0]?.targetRuleId).toBe(FIXTURE_10_SHARED_CAP_RULE_A.ruleId);

    const report = validateCompilationUnit({
      irSchemaVersion: "headroom-covenant-ir.v1",
      companyId: FIXTURE_10_SHARED_CAP_RULE_A.companyId,
      instrumentKey: FIXTURE_10_SHARED_CAP_RULE_A.instrumentKey,
      rules: [FIXTURE_10_SHARED_CAP_RULE_A, FIXTURE_10_SHARED_CAP_RULE_B],
      definitions: [],
      sharedCapacities: [FIXTURE_10_SHARED_CAPACITY],
    });
    expect(report.issues.filter((i) => i.kind === "DANGLING_REFERENCE")).toEqual([]);
  });

  it("B13: builder - honest PARTIAL sufficiency preserving a working component alongside a genuinely UNSUPPORTED one, never discarding the whole definition (fwrg-def-available-amount)", () => {
    expect(FIXTURE_14_BUILDER_AVAILABLE_AMOUNT.sufficiency).toBe("PARTIAL");
    const sum = FIXTURE_14_BUILDER_AVAILABLE_AMOUNT.calculationExpression as IRExpression;
    expect(sum.kind).toBe("SUM");
    if (sum.kind !== "SUM") throw new Error("unreachable");
    expect(sum.operands.map((o) => o.kind)).toContain("UNSUPPORTED");
    expect(sum.operands.map((o) => o.kind)).toContain("IF"); // the CNI Growth Amount component remains usable
  });

  it("B14: reclassification reference - a REUSED, real ContractRuleRelationshipType edge (RECLASSIFIABLE_TO), never a new parallel taxonomy (real evidence: CONMED 7.2 'General prohibition on Indebtedness... with a cross-basket reclassification right')", () => {
    // Minimal, standalone two-rule construction (companyId/instrumentKey match the
    // fixture file's own fictional identifiers) - grounded in real evidence already
    // present in this repository (tests/fixtures/unseen-packages/conmed-2025-credit-facility/
    // human-ground-truth.ts, provision a-7.2's own "cross-basket reclassification right"
    // summary), not a new model call.
    const companyId = "ir-fixture-co";
    const instrumentKey = "ir-fixture-instrument";
    const basketA: IRRule = {
      ruleId: computeRuleId(companyId, instrumentKey, "7.2(reclass-a)", "b14-a"),
      irSchemaVersion: "headroom-covenant-ir.v1",
      companyId,
      instrumentKey,
      sourceDocumentId: "ir-fixture-doc",
      sourceSectionRef: "7.2",
      covenantFamily: "INDEBTEDNESS",
      ruleType: "QUANTITATIVE_PERMISSION",
      posture: "PERMISSION",
      action: "INCUR_DEBT",
      entityScope: [],
      entityScopeExcluded: [],
      transactionScope: null,
      capacityExpression: withExpressionId({ kind: "MONEY", type: "MONEY", amount: 10_000_000, currency: "USD" }),
      conditions: [],
      exceptions: [],
      dependsOn: [{ relationshipType: "RECLASSIFIABLE_TO", targetRuleId: computeRuleId(companyId, instrumentKey, "7.2(reclass-b)", "b14-b"), description: "amounts incurred under this basket may later be reclassified into the general basket, per §7.2's own cross-basket reclassification right" }],
      operativeLineage: null,
      sufficiency: "COMPLETE",
      sufficiencyReasons: [],
      provenance: { documentId: "ir-fixture-doc", sourceNodeKey: null, sourceCitation: "§7.2", excerpt: null },
      compilerVersion: null,
      sourceContentVersion: null,
    };
    const basketB: IRRule = { ...basketA, ruleId: computeRuleId(companyId, instrumentKey, "7.2(reclass-b)", "b14-b"), dependsOn: [] };
    const report = validateCompilationUnit({ irSchemaVersion: "headroom-covenant-ir.v1", companyId, instrumentKey, rules: [basketA, basketB], definitions: [], sharedCapacities: [] });
    expect(report.issues.filter((i) => i.kind === "DANGLING_REFERENCE" || i.kind === "ILLEGAL_CYCLE")).toEqual([]);
  });

  it("all 15 fixtures + 2 definitions validate with zero structural issues except the fixture 14 definition's expected, honest UNSUPPORTED-propagation issue", () => {
    const report = validateCompilationUnit({
      irSchemaVersion: "headroom-covenant-ir.v1",
      companyId: "ir-fixture-co",
      instrumentKey: "ir-fixture-instrument",
      rules: ALL_FIXTURE_RULES,
      definitions: ALL_FIXTURE_DEFINITIONS,
      sharedCapacities: ALL_FIXTURE_SHARED_CAPACITIES,
    });
    const nonBuilderIssues = report.issues.filter((i) => !("exprId" in i) || !i.message.includes("SUM operands"));
    expect(nonBuilderIssues).toEqual([]);
  });
});
