/**
 * Aggregate ceiling with no governing permission.
 *
 * Non-frozen. This file does not import the xref golden, does not change
 * figure-role, and does not treat a ceiling as certified capacity.
 *
 * The IR can store the MAX arithmetic, a QUANTITATIVE_RESTRICTION posture,
 * and a LIMITED_BY edge. It cannot store that MAX as a verified limit:
 * capacityExpression is available capacity, the capacity graph builds a
 * RULE_CAPACITY for every non-null capacityExpression, and LIMITED_BY is
 * drawn only between those nodes. A condition can hold the number without
 * becoming capacity, and that silence is not a verification of the limit.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { classifyFigures, figureRoleIssues } from "../../lib/contract-model/compiler/semantic-verification/figure-role";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { IRRule } from "../../lib/contract-model/ir/types";
import { buildCapacityGraph } from "../../lib/contract-model/runtime/capacity/graph";
import { testCompilerInput } from "./semantic-compiler/test-helpers";
import { AS_OF, CO, INST, MAX, METRIC, MONEY, MUL, PCT, UNLIMITED, resetIds, rule } from "./runtime/capacity/helpers";

const AMOUNT = 5_000_000;
const CEILING = "The aggregate principal amount of Indebtedness incurred under this Section shall not at any time exceed the greater of $5,000,000 and 10% of Total Assets.";
const PERMISSION = [
  "SECTION 9.02 Indebtedness. The Borrower shall not create, incur or assume any Indebtedness, except:",
  "",
  "(c) other Indebtedness incurred subject to Section 9.04.",
].join("\n");
const SPLIT = [
  PERMISSION,
  "",
  "SECTION 9.04 General Debt Basket. The aggregate principal amount of Indebtedness incurred under this Section 9.04 shall not at any time exceed the greater of $5,000,000 and 10% of Total Assets.",
].join("\n");
const SAME_CLAUSE = "The Borrower may incur Indebtedness in an amount equal to the greater of $5,000,000 and 10% of Total Assets.";

const caller = (): StageCaller => ({
  providerName: "test",
  model: "test",
  isSynthetic: false,
  async call<T>(schema: ZodType<T>): Promise<T> {
    return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [], findings: [], overallNotes: [] });
  },
  lastTelemetry: () => null,
});

function ceilingTree() {
  return MAX(MONEY(AMOUNT), MUL(PCT(0.1), METRIC("Total Assets")));
}

function permissionRule(capacity: IRRule["capacityExpression"]): IRRule {
  return rule("permission", capacity, { sourceSectionRef: "9.02(c)", dependsOn: [{ relationshipType: "LIMITED_BY", targetRuleId: "ceiling", description: "other Indebtedness is subject to the ceiling section" }] });
}

function ceilingRule(capacity: IRRule["capacityExpression"], over: Partial<IRRule> = {}): IRRule {
  return rule("ceiling", capacity, { sourceSectionRef: "9.04", ruleType: "QUANTITATIVE_RESTRICTION", posture: "PROHIBITION", action: "INCUR_DEBT", ...over });
}

async function verify(text: string, compiledRule: IRRule) {
  const compiled: SemanticCompilationResult = {
    status: "COMPLETED", failureReasons: [], errorDetail: null,
    rules: [compiledRule],
    definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {},
    provider: "test", model: "test", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString(),
  };
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, sourceSectionRef: compiledRule.sourceSectionRef ?? "9.04" }), compilationResult: compiled };
  return verifyCompiledCandidate(input, { reviewCaller: caller(), conditionSuspicionCaller: caller() });
}

beforeEach(resetIds);

describe("aggregate ceiling without a governing permission", () => {
  it("classifies a standalone aggregate ceiling as a prohibition threshold and refuses it as capacity", async () => {
    const figure = classifyFigures(CEILING).find((item) => item.kind === "MONEY" && item.value === AMOUNT);
    expect(figure?.role).toBe("PROHIBITION_THRESHOLD");
    expect(figure?.capacity).toBe(false);
    const asPermission = rule("claimed-basket", ceilingTree());
    expect(figureRoleIssues(CEILING, [asPermission]).map((issue) => issue.kind)).toEqual(["THRESHOLD_AS_CAPACITY"]);
    const asRestriction = ceilingRule(ceilingTree());
    expect(figureRoleIssues(CEILING, [asRestriction]).map((issue) => [issue.kind, issue.role])).toEqual([["THRESHOLD_AS_CAPACITY", "PROHIBITION_THRESHOLD"]]);
    const result = await verify(CEILING, asPermission);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings.some((finding) => finding.findingType === "WRONG_AMOUNT" && finding.severity === "MATERIAL")).toBe(true);
    const restriction = await verify(CEILING, asRestriction);
    expect(restriction.status).toBe("MATERIAL_DISCREPANCY");
    expect(restriction.findings.some((finding) => finding.findingType === "WRONG_AMOUNT")).toBe(true);
  });

  it("does not let a cross-section exception turn the ceiling into capacity", () => {
    const figure = classifyFigures(SPLIT).find((item) => item.kind === "MONEY" && item.value === AMOUNT);
    expect(figure?.role).toBe("PROHIBITION_THRESHOLD");
    expect(figure?.capacity).toBe(false);
    expect(classifyFigures(PERMISSION).some((item) => item.kind === "MONEY")).toBe(false);
    const permission = permissionRule(UNLIMITED(null));
    const ceiling = ceilingRule(null);
    expect(figureRoleIssues(SPLIT, [permission, ceiling])).toEqual([]);
    expect(figureRoleIssues(SPLIT, [permission, ceilingRule(ceilingTree())]).map((issue) => issue.ruleId)).toEqual(["ceiling"]);
    const graph = buildCapacityGraph({ rules: [permission, ceiling], companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(graph.nodes.filter((node) => node.kind === "RULE_CAPACITY").map((node) => node.ruleId)).toEqual(["permission"]);
    expect(graph.edges.some((edge) => edge.sourceRelationship === "LIMITED_BY")).toBe(false);
  });

  it("keeps a same-clause affirmative permission with its own greater-of capacity", async () => {
    const figure = classifyFigures(SAME_CLAUSE).find((item) => item.kind === "MONEY" && item.value === AMOUNT);
    expect(figure?.role).toBe("FORMULA_COMPONENT");
    expect(figure?.capacity).toBe(true);
    const granted = rule("granted", ceilingTree(), { sourceSectionRef: "9.02" });
    expect(figureRoleIssues(SAME_CLAUSE, [granted])).toEqual([]);
    const result = await verify(SAME_CLAUSE, granted);
    expect(result.findings.some((finding) => finding.findingType === "WRONG_AMOUNT")).toBe(false);
    expect(result.status).not.toBe("MATERIAL_DISCREPANCY");
  });

  it("does not give the ceiling a second executable capacity beside the permission", () => {
    const permission = permissionRule(UNLIMITED(null));
    const unrepresented = ceilingRule(null);
    const heldApart = buildCapacityGraph({ rules: [permission, unrepresented], companyId: CO, instrumentKey: INST, asOf: AS_OF });
    const nodes = heldApart.nodes.filter((node) => node.kind === "RULE_CAPACITY");
    expect(nodes.map((node) => node.ruleId)).toEqual(["permission"]);
    expect(JSON.stringify(permission.capacityExpression)).not.toContain(String(AMOUNT));
    expect(unrepresented.capacityExpression).toBeNull();

    const duplicated = buildCapacityGraph({ rules: [permissionRule(ceilingTree()), ceilingRule(ceilingTree())], companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(duplicated.nodes.filter((node) => node.kind === "RULE_CAPACITY").map((node) => node.ruleId).sort()).toEqual(["ceiling", "permission"]);
    expect(duplicated.edges.some((edge) => edge.sourceRelationship === "LIMITED_BY")).toBe(true);
    const duplicateIssues = figureRoleIssues(SPLIT, [permissionRule(ceilingTree()), ceilingRule(ceilingTree())]);
    expect(duplicateIssues.map((issue) => issue.kind)).toEqual(["THRESHOLD_AS_CAPACITY", "THRESHOLD_AS_CAPACITY"]);
    expect(duplicateIssues.map((issue) => issue.ruleId).sort()).toEqual(["ceiling", "permission"]);

    const conditionOnly = ceilingRule(null, {
      sufficiency: "PARTIAL",
      sufficiencyReasons: ["the measured aggregate has no non-capacity operand"],
      conditions: [{
        conditionId: "limit",
        conditionType: "AMOUNT_THRESHOLD",
        expression: ceilingTree(),
        referencesDefinitionId: null,
        description: "aggregate principal amount shall not exceed the stated ceiling",
        provenance: null,
      }],
    });
    expect(figureRoleIssues(CEILING, [conditionOnly])).toEqual([]);
    const silent = buildCapacityGraph({ rules: [permission, conditionOnly], companyId: CO, instrumentKey: INST, asOf: AS_OF });
    expect(silent.nodes.filter((node) => node.kind === "RULE_CAPACITY").map((node) => node.ruleId)).toEqual(["permission"]);
    expect(silent.edges.some((edge) => edge.sourceRelationship === "LIMITED_BY")).toBe(false);
  });
});
