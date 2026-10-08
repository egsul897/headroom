/**
 * Aggregate ceiling with no governing permission, and the governing-limit slot.
 *
 * Non-frozen. This file does not import the xref golden and does not treat a
 * ceiling as certified capacity. capacityExpression remains available capacity:
 * a MAX stored there still emits RULE_CAPACITY and THRESHOLD_AS_CAPACITY.
 * governingLimit is the ceiling. It is not a second basket. A condition that
 * merely holds the MAX is still not that slot.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import { buildIrInventory } from "../../lib/contract-model/compiler/semantic-verification/ir-inventory";
import { classifyFigures, figureRoleIssues } from "../../lib/contract-model/compiler/semantic-verification/figure-role";
import { collectNumericAssertions } from "../../lib/contract-model/compiler/semantic-verification/numeric-assertion";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import { normalizeSubmission } from "../../lib/contract-model/compiler/semantic/normalize";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import { SubmitCompilationSchema } from "../../lib/contract-model/compiler/semantic/wire-schema";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import { validateRule } from "../../lib/contract-model/ir/validate";
import type { IRGoverningLimit, IRRule } from "../../lib/contract-model/ir/types";
import { certifyCandidate } from "../../lib/contract-model/phase3-certification/certify";
import { buildCapacityGraph, evaluateCapacityState } from "../../lib/contract-model/runtime/capacity";
import { evaluateGoverningLimit, type ProvisionAggregateUsage } from "../../lib/contract-model/runtime/governing-limit";
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
    expect(conditionOnly.governingLimit ?? null).toBeNull();
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

const SECTION_704 = [
  "SECTION 7.02 Indebtedness . The Borrower shall not create, incur or assume any Indebtedness, except:",
  "",
  "(c) other Indebtedness incurred subject to Section 7.04.",
  "",
  "(d) other Indebtedness incurred subject to Section 7.04.",
  "",
  "SECTION 7.04 General Debt Basket . The aggregate principal amount of Indebtedness incurred under this Section 7.04 shall not at any time exceed the greater of $123,000,000 and 17% of Total Assets.",
].join("\n");

const CEILING_SENTENCE = "The aggregate principal amount of Indebtedness incurred under this Section 7.04 shall not at any time exceed the greater of $123,000,000 and 17% of Total Assets.";

function resolvedLineage(provisionKey: string): IRRule["operativeLineage"] {
  return { instrumentKey: INST, provisionKey, asOfDate: AS_OF, operativeStatus: "OPERATIVE_STATE_RESOLVED", currentSourceDocumentId: "doc" };
}

function established(tags: Array<"BORROWER" | "UNRESTRICTED_SUB">): Pick<IRRule, "entityScope" | "entityScopeAudit"> {
  return {
    entityScope: tags,
    entityScopeAudit: {
      guardVersion: "test",
      status: "SOURCE_MATCH_CONFIRMED",
      safeToRely: true,
      reasonCodes: [],
      rawEmitted: { entityScope: [...tags], entityScopeExcluded: [], source: "RULE_FIELD" },
      tagNormalization: [],
      before: { entityScope: [...tags], entityScopeExcluded: [], sufficiency: "COMPLETE" },
      witness: { ownExcerpt: "The Borrower", citedUnitLeadIn: null, decidedBy: "OWN_EXCERPT", signals: [] },
    },
  };
}

function governing(amount: number, percent: number, section: string): IRGoverningLimit {
  return {
    limitId: `limit-${section}`,
    ceilingExpression: MAX(MONEY(amount), MUL(PCT(percent), METRIC("Total Assets"))),
    measuredAggregate: {
      kind: "PROVISION_AGGREGATE",
      governingSectionRef: section,
      measurementBasis: "aggregate principal amount of Indebtedness",
      provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: section, excerpt: "aggregate principal amount of Indebtedness" },
    },
    provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: section, excerpt: CEILING_SENTENCE },
  };
}

function permission702(ruleId: string, over: Partial<IRRule> = {}): IRRule {
  return rule(ruleId, UNLIMITED(null), {
    sourceSectionRef: ruleId,
    posture: "PERMISSION",
    ruleType: "QUANTITATIVE_PERMISSION",
    action: "INCUR_DEBT",
    dependsOn: [{ relationshipType: "LIMITED_BY", targetRuleId: "7.04", description: "subject to Section 7.04" }],
    operativeLineage: resolvedLineage(ruleId),
    ...established(["BORROWER"]),
    ...over,
  });
}

function limit704(over: Partial<IRRule> = {}): IRRule {
  return rule("7.04", null, {
    sourceSectionRef: "7.04",
    ruleType: "QUANTITATIVE_RESTRICTION",
    posture: "PROHIBITION",
    action: "INCUR_DEBT",
    operativeLineage: resolvedLineage("7.04"),
    governingLimit: governing(123_000_000, 0.17, "Section 7.04"),
    ...established(["BORROWER"]),
    ...over,
  });
}

function usageOf(amount: string | null, conflicting = false): ProvisionAggregateUsage {
  return { amount, currency: "USD", conflicting, ...(conflicting ? { conflictDetail: "two aggregate records disagree and neither supersedes the other" } : {}) };
}

function capacityRuleIds(rules: IRRule[]): string[] {
  return buildCapacityGraph({ rules, companyId: CO, instrumentKey: INST, asOf: AS_OF }).nodes.filter((node) => node.kind === "RULE_CAPACITY").map((node) => node.ruleId).filter((ruleId): ruleId is string => ruleId !== null);
}

describe("governing aggregate limit", () => {
  it("does not let a standalone ceiling authorize debt", () => {
    const limit = limit704();
    expect(classifyFigures(SECTION_704).find((item) => item.value === 123_000_000)?.role).toBe("PROHIBITION_THRESHOLD");
    expect(figureRoleIssues(SECTION_704, [limit])).toEqual([]);
    expect(capacityRuleIds([limit])).toEqual([]);
    const measured = evaluateGoverningLimit({ limit, usage: usageOf("0"), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF });
    expect(measured.authorizesDebt).toBe(false);
    expect(measured.status).toBe("DETERMINED");
    expect(measured.memberRuleIds).toEqual([]);
    expect(measured.status).not.toBe("AVAILABLE");
    const claimed = limit704({ posture: "PERMISSION", ruleType: "QUANTITATIVE_PERMISSION" });
    expect(figureRoleIssues(SECTION_704, [claimed]).map((issue) => issue.kind)).toContain("GOVERNING_LIMIT_AS_PERMISSION");
    const refused = evaluateGoverningLimit({ limit: claimed, usage: usageOf("0"), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF });
    expect(refused.status).toBe("NON_EXECUTABLE");
    expect(refused.remaining).toBeNull();
    expect(refused.authorizesDebt).toBe(false);
  });

  it("keeps §7.02(c) as the only capacity and applies §7.04 as the ceiling", () => {
    const permission = permission702("7.02(c)");
    const limit = limit704();
    expect(JSON.stringify(permission.capacityExpression)).not.toContain("123000000");
    expect(JSON.stringify(permission)).not.toContain("0.17");
    expect(permission.dependsOn).toEqual([{ relationshipType: "LIMITED_BY", targetRuleId: "7.04", description: "subject to Section 7.04" }]);
    expect(limit.capacityExpression).toBeNull();
    expect(limit.governingLimit?.measuredAggregate.kind).toBe("PROVISION_AGGREGATE");
    expect(JSON.stringify(limit.governingLimit?.measuredAggregate)).not.toContain("METRIC_REFERENCE");
    expect(limit.governingLimit?.ceilingExpression.kind).toBe("MAX");
    expect(capacityRuleIds([permission, limit])).toEqual(["7.02(c)"]);
    expect(buildCapacityGraph({ rules: [permission, limit], companyId: CO, instrumentKey: INST, asOf: AS_OF }).edges.some((edge) => edge.sourceRelationship === "LIMITED_BY")).toBe(false);
    const measured = evaluateGoverningLimit({
      limit, permissions: [permission], usage: usageOf("20000000"), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF,
    });
    expect(measured.status).toBe("DETERMINED");
    expect(measured.ceiling).toBe("170000000");
    expect(measured.usage).toBe("20000000");
    expect(measured.remaining).toBe("150000000");
    expect(measured.remaining).not.toBe(measured.ceiling);
    expect(measured.authorizesDebt).toBe(false);
    expect(measured.memberHeadroom).toEqual([{ ruleId: "7.02(c)", remaining: "150000000", status: "DETERMINED" }]);
    expect(validateRule(limit).ok).toBe(true);
  });

  it("withholds a number when Total Assets or the aggregate usage is missing or in conflict", () => {
    const permission = permission702("7.02(c)");
    const limit = limit704();
    const missingAssets = evaluateGoverningLimit({ limit, permissions: [permission], usage: usageOf("20000000"), inputs: resolver([]), asOf: AS_OF });
    expect(missingAssets.status).toBe("NEEDS_INPUT");
    expect(missingAssets.remaining).toBeNull();
    expect(missingAssets.reasons.some((reason) => reason.includes("Total Assets"))).toBe(true);
    const missingUsage = evaluateGoverningLimit({ limit, permissions: [permission], usage: usageOf(null), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF });
    expect(missingUsage.status).toBe("NEEDS_INPUT");
    expect(missingUsage.remaining).toBeNull();
    expect(missingUsage.reasons.some((reason) => reason.includes("aggregate usage"))).toBe(true);
    const conflicted = evaluateGoverningLimit({ limit, permissions: [permission], usage: usageOf("20000000", true), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF });
    expect(conflicted.status).toBe("REVIEW_REQUIRED");
    expect(conflicted.remaining).toBeNull();
    expect(conflicted.reasons.some((reason) => reason.includes("disagree"))).toBe(true);
  });

  it("shares one ceiling across two permissions", () => {
    const first = permission702("7.02(c)");
    const second = permission702("7.02(d)");
    const limit = limit704();
    expect(capacityRuleIds([first, second, limit]).sort()).toEqual(["7.02(c)", "7.02(d)"]);
    const measured = evaluateGoverningLimit({
      limit, permissions: [first, second], usage: usageOf("40000000"), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF,
    });
    expect(measured.status).toBe("DETERMINED");
    expect(measured.ceiling).toBe("170000000");
    expect(measured.remaining).toBe("130000000");
    expect(measured.memberHeadroom.map((member) => member.remaining)).toEqual(["130000000", "130000000"]);
    expect(measured.memberHeadroom.every((member) => member.remaining !== measured.ceiling)).toBe(true);
    const copied = Number(measured.remaining) * measured.memberHeadroom.length;
    expect(copied).not.toBe(Number(measured.ceiling) * measured.memberHeadroom.length);
  });

  it("requires established entity scope and resolved amendment authority", () => {
    const limit = limit704();
    const mismatched = permission702("7.02(c)", established(["UNRESTRICTED_SUB"]));
    const entity = evaluateGoverningLimit({
      limit, permissions: [mismatched], usage: usageOf("20000000"), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF,
    });
    expect(entity.status).toBe("REVIEW_REQUIRED");
    expect(entity.remaining).toBeNull();
    expect(entity.reasons.some((reason) => reason.includes("outside"))).toBe(true);
    const uncertain = limit704({
      operativeLineage: { instrumentKey: INST, provisionKey: "7.04", asOfDate: AS_OF, operativeStatus: "OPERATIVE_STATE_REVIEW_REQUIRED", currentSourceDocumentId: "doc" },
    });
    const amendment = evaluateGoverningLimit({
      limit: uncertain, permissions: [permission702("7.02(c)")], usage: usageOf("20000000"), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF,
    });
    expect(amendment.status).toBe("REVIEW_REQUIRED");
    expect(amendment.remaining).toBeNull();
    expect(amendment.reasons.some((reason) => reason.includes("OPERATIVE_STATE_REVIEW_REQUIRED"))).toBe(true);
  });

  it("selects the greater of $123,000,000 and 17% of Total Assets and subtracts usage", () => {
    const permission = permission702("7.02(c)");
    const limit = limit704();
    const percentWins = evaluateGoverningLimit({
      limit, permissions: [permission], usage: usageOf("20000000"), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF,
    });
    expect(percentWins.ceiling).toBe("170000000");
    expect(percentWins.remaining).toBe("150000000");
    const flatWins = evaluateGoverningLimit({
      limit, permissions: [permission], usage: usageOf("1000000"), inputs: resolver([fact("Total Assets", "100000000")]), asOf: AS_OF,
    });
    expect(flatWins.ceiling).toBe("123000000");
    expect(flatWins.remaining).toBe("122000000");
    expect(flatWins.ceiling).not.toBe(flatWins.remaining);
  });

  it("rejects a governing limit whose figure is not a prohibition threshold", async () => {
    const misplaced = rule("misplaced", null, {
      sourceSectionRef: "9.02",
      ruleType: "QUANTITATIVE_RESTRICTION",
      posture: "PROHIBITION",
      governingLimit: governing(AMOUNT, 0.1, "Section 9.02"),
    });
    const issues = figureRoleIssues(SAME_CLAUSE, [misplaced]);
    expect(issues.map((issue) => issue.kind)).toContain("GOVERNING_LIMIT_ROLE");
    expect(issues.find((issue) => issue.kind === "GOVERNING_LIMIT_ROLE")?.role).toBe("FORMULA_COMPONENT");
    const result = await verify(SAME_CLAUSE, misplaced);
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings.some((finding) => finding.findingType === "WRONG_LOGIC" && finding.deterministicSignals.includes("GOVERNING_LIMIT_ROLE"))).toBe(true);
  });

  it("refuses a ceiling that is also stored as capacity", () => {
    const permission = permission702("7.02(c)", { capacityExpression: governing(123_000_000, 0.17, "Section 7.04").ceilingExpression });
    const duplicated = limit704({ capacityExpression: governing(123_000_000, 0.17, "Section 7.04").ceilingExpression });
    const issues = figureRoleIssues(SECTION_704, [permission, duplicated]);
    expect(issues.map((issue) => issue.kind).sort()).toEqual(["THRESHOLD_AS_CAPACITY", "THRESHOLD_AS_CAPACITY"]);
    expect(capacityRuleIds([permission, duplicated]).sort()).toEqual(["7.02(c)", "7.04"]);
    const measured = evaluateGoverningLimit({
      limit: duplicated, permissions: [permission], usage: usageOf("20000000"), inputs: resolver([fact("Total Assets", "1000000000")]), asOf: AS_OF,
    });
    expect(measured.status).toBe("REVIEW_REQUIRED");
    expect(measured.remaining).toBeNull();
    expect(measured.reasons.some((reason) => reason.includes("capacityExpression"))).toBe(true);
    expect(measured.authorizesDebt).toBe(false);
  });

  it("traces §7.02(c) LIMITED_BY §7.04 from source into one governing limit", () => {
    const submission = SubmitCompilationSchema.parse({
      rules: [
        {
          localRef: "perm",
          sourceSectionRef: "7.02(c)",
          covenantFamily: "INDEBTEDNESS",
          ruleType: "QUANTITATIVE_PERMISSION",
          posture: "PERMISSION",
          action: "INCUR_DEBT",
          capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: null, citation: "§7.02(c)", excerpt: "(c) other Indebtedness incurred subject to Section 7.04." },
          dependsOn: [
            { relationshipType: "LIMITED_BY", targetRef: "limit", description: "subject to Section 7.04" },
            { relationshipType: "LIMITED_BY", targetRef: "Section 7.04", description: "subject to Section 7.04" },
          ],
          sufficiency: "COMPLETE",
          citation: "§7.02(c)",
          excerpt: "(c) other Indebtedness incurred subject to Section 7.04.",
        },
        {
          localRef: "limit",
          sourceSectionRef: "7.04",
          covenantFamily: "INDEBTEDNESS",
          ruleType: "QUANTITATIVE_RESTRICTION",
          posture: "PROHIBITION",
          action: "INCUR_DEBT",
          capacityExpression: null,
          governingLimit: {
            ceilingExpression: {
              kind: "MAX",
              citation: "§7.04",
              excerpt: CEILING_SENTENCE,
              operands: [
                { kind: "MONEY", amount: 123_000_000, currency: "USD", citation: "§7.04", excerpt: "$123,000,000" },
                { kind: "MULTIPLY", citation: "§7.04", excerpt: "17% of Total Assets", operands: [
                  { kind: "PERCENT", value: 0.17, citation: "§7.04", excerpt: "17%" },
                  { kind: "METRIC_REFERENCE", metricName: "Total Assets", valueType: "MONEY", citation: "§7.04", excerpt: "Total Assets" },
                ] },
              ],
            },
            measuredAggregate: {
              governingSectionRef: "Section 7.04",
              measurementBasis: "aggregate principal amount of Indebtedness",
              citation: "§7.04",
              excerpt: "The aggregate principal amount of Indebtedness incurred under this Section 7.04",
            },
            citation: "§7.04",
            excerpt: CEILING_SENTENCE,
          },
          sufficiency: "COMPLETE",
          citation: "§7.04",
          excerpt: CEILING_SENTENCE,
        },
      ],
      definitions: [],
      sharedCapacities: [],
      irExtensionCandidates: [],
      overallNotes: [],
    });
    const normalized = normalizeSubmission(submission, testCompilerInput({ operativeSourceText: SECTION_704, sourceSectionRef: "7.04" }));
    const permission = normalized.rules.find((item) => item.sourceSectionRef === "7.02(c)");
    const limit = normalized.rules.find((item) => item.sourceSectionRef === "7.04");
    expect(permission?.capacityExpression?.kind).toBe("UNLIMITED_CAPACITY");
    expect(permission?.posture).toBe("PERMISSION");
    expect(permission?.action).toBe("INCUR_DEBT");
    expect(JSON.stringify(permission)).not.toContain("123000000");
    expect(JSON.stringify(permission)).not.toContain("0.17");
    expect(permission?.dependsOn.map((dependency) => dependency.relationshipType)).toEqual(["LIMITED_BY"]);
    expect(permission?.dependsOn[0]?.targetRuleId).toBe(limit?.ruleId);
    expect(permission?.sourceDependencies?.some((dependency) => dependency.relationshipType === "LIMITED_BY" && dependency.exactSourceTargetRef === "Section 7.04")).toBe(true);
    expect(limit?.capacityExpression).toBeNull();
    expect(limit?.posture).toBe("PROHIBITION");
    expect(limit?.ruleType).toBe("QUANTITATIVE_RESTRICTION");
    expect(limit?.governingLimit?.measuredAggregate).toMatchObject({
      kind: "PROVISION_AGGREGATE",
      governingSectionRef: "Section 7.04",
      measurementBasis: "aggregate principal amount of Indebtedness",
    });
    expect(limit?.governingLimit?.ceilingExpression.kind).toBe("MAX");
    expect(limit?.governingLimit?.provenance?.sourceCitation).toBe("§7.04");
    const traced = buildCapacityGraph({ rules: [permission!, limit!], companyId: permission!.companyId, instrumentKey: permission!.instrumentKey, asOf: AS_OF });
    expect(traced.nodes.filter((node) => node.kind === "RULE_CAPACITY").map((node) => node.ruleId)).toEqual([permission!.ruleId]);
    const inventory = buildIrInventory("trace", [limit!], []);
    expect(inventory.items.some((item) => item.kind === "GOVERNING_LIMIT" && item.textValue === "PROVISION_AGGREGATE:Section 7.04|aggregate principal amount of Indebtedness")).toBe(true);
    const assertions = collectNumericAssertions("trace", [limit!], []);
    expect(assertions.items.some((item) => item.fieldPath.includes("governingLimit") && item.normalizedValue === 123_000_000)).toBe(true);
    expect(assertions.items.some((item) => item.referencedSections.includes("Section 7.04"))).toBe(true);
  });
});
