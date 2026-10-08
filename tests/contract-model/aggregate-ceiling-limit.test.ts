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
import { certifyCandidate } from "../../lib/contract-model/phase3-certification/certify";
import { buildCapacityGraph, evaluateCapacityState } from "../../lib/contract-model/runtime/capacity";
import { EMPTY_RESOLVER } from "../../lib/contract-model/runtime/input-resolver";
import { testCompilerInput } from "./semantic-compiler/test-helpers";
import { AS_OF, CO, INST, MAX, METRIC, MONEY, MUL, PCT, UNLIMITED, amountString, fact, resetIds, resolver, rule } from "./runtime/capacity/helpers";

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

function compiledResult(rules: IRRule[]): SemanticCompilationResult {
  return {
    status: "COMPLETED", failureReasons: [], errorDetail: null, rules,
    definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {},
    provider: "test", model: "test", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString(),
  };
}

async function verify(text: string, compiledRule: IRRule) {
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text, sourceSectionRef: compiledRule.sourceSectionRef ?? "9.04" }), compilationResult: compiledResult([compiledRule]) };
  return verifyCompiledCandidate(input, { reviewCaller: caller(), conditionSuspicionCaller: caller() });
}

function certify(compiledRule: IRRule, verification: Awaited<ReturnType<typeof verify>> | null) {
  return certifyCandidate({
    candidate: { discoveryId: "candidate-ceiling", structuralNodeIds: ["node-ceiling"], normalizedSourceRef: compiledRule.sourceSectionRef ?? "9.04" },
    anchored: true,
    operativeSourceVersion: "scv1-test",
    operativeIdentityStrength: "STRONG",
    semanticSourceContract: { strength: "STRONG", attributionMode: "ATTRIBUTED", version: "sscv1-test" } as never,
    bundle: null,
    compilation: compiledResult([compiledRule]),
    verification,
    operativeProvision: null,
    operativeLineage: null,
    snapshot: null,
    verifiedPackage: null,
    currentUnits: [compiledRule],
  });
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

  it("keeps §7.02(c) as the permission and refuses to certify or apply §7.04 as a second basket", async () => {
    const text = [
      "SECTION 7.02 Indebtedness . The Borrower shall not create, incur or assume any Indebtedness, except:",
      "",
      "(c) other Indebtedness incurred subject to Section 7.04.",
      "",
      "SECTION 7.04 General Debt Basket . The aggregate principal amount of Indebtedness incurred under this Section 7.04 shall not at any time exceed the greater of $123,000,000 and 17% of Total Assets.",
    ].join("\n");
    const figure = classifyFigures(text).find((item) => item.kind === "MONEY" && item.value === 123_000_000);
    expect(figure?.role).toBe("PROHIBITION_THRESHOLD");
    expect(figure?.capacity).toBe(false);
    expect(classifyFigures("(c) other Indebtedness incurred subject to Section 7.04.").some((item) => item.kind === "MONEY")).toBe(false);

    const permission = rule("7.02(c)", UNLIMITED(null), {
      sourceSectionRef: "7.02(c)", posture: "PERMISSION", ruleType: "QUANTITATIVE_PERMISSION", action: "INCUR_DEBT",
      dependsOn: [{ relationshipType: "LIMITED_BY", targetRuleId: "7.04", description: "subject to Section 7.04" }],
    });
    expect(figureRoleIssues(text, [permission])).toEqual([]);
    const separated = buildCapacityGraph({
      rules: [permission, ceilingRule(null, { ruleId: "7.04", sourceSectionRef: "7.04" })],
      companyId: CO, instrumentKey: INST, asOf: AS_OF,
    });
    expect(separated.nodes.filter((node) => node.kind === "RULE_CAPACITY").map((node) => node.ruleId)).toEqual(["7.02(c)"]);

    const claimed = rule("7.04", MAX(MONEY(123_000_000), MUL(PCT(0.17), METRIC("Total Assets"))), {
      sourceSectionRef: "7.04", posture: "PERMISSION", ruleType: "QUANTITATIVE_PERMISSION", action: "INCUR_DEBT",
    });
    const refused = await verify(text, claimed);
    expect(refused.status).toBe("MATERIAL_DISCREPANCY");
    expect(refused.findings.some((finding) => finding.findingType === "WRONG_AMOUNT")).toBe(true);
    const refusedCert = certify(claimed, refused);
    expect(refusedCert.status).not.toBe("CERTIFIED");
    expect(refusedCert.blockers.map((blocker) => blocker.code)).toContain("VERIFICATION_NOT_CLEAN");

    const unresolved = ceilingRule(MAX(MONEY(123_000_000), MUL(PCT(0.17), METRIC("Total Assets"))), {
      ruleId: "7.04", sourceSectionRef: "7.04", sufficiency: "PARTIAL",
      sufficiencyReasons: ["the aggregate measured by this ceiling is not a resolved non-capacity input"],
    });
    const partialCert = certify(unresolved, null);
    expect(partialCert.status).not.toBe("CERTIFIED");
    expect(partialCert.blockers.map((blocker) => blocker.code)).toEqual(expect.arrayContaining(["UNIT_SUFFICIENCY_INCOMPLETE", "VERIFICATION_MISSING"]));
    const withheld = evaluateCapacityState({
      graph: buildCapacityGraph({ rules: [unresolved], companyId: CO, instrumentKey: INST, asOf: AS_OF }),
      rules: [unresolved], inputs: EMPTY_RESOLVER, ledger: [], asOf: AS_OF,
    });
    expect(withheld.capacities[0]?.status).not.toBe("AVAILABLE");
    expect(withheld.capacities[0]?.grossCapacity.kind).toBe("NOT_DETERMINED");

    const supplied = ceilingRule(MAX(MONEY(123_000_000), MUL(PCT(0.17), METRIC("Total Assets"))), {
      ruleId: "7.04-supplied", sourceSectionRef: "7.04", sufficiency: "COMPLETE", entityScope: ["BORROWER"],
      entityScopeAudit: { status: "SOURCE_MATCH_CONFIRMED", safeToRely: true } as IRRule["entityScopeAudit"],
    });
    const computed = evaluateCapacityState({
      graph: buildCapacityGraph({ rules: [supplied], companyId: CO, instrumentKey: INST, asOf: AS_OF }),
      rules: [supplied], inputs: resolver([fact("Total Assets", "1000000000")]), ledger: [], asOf: AS_OF,
    });
    expect(computed.capacities[0]?.status).toBe("AVAILABLE");
    expect(amountString(computed.capacities[0]!.grossCapacity)).toBe("170000000");
    expect(figureRoleIssues(text, [supplied]).map((issue) => issue.kind)).toEqual(["THRESHOLD_AS_CAPACITY"]);
  });
});
