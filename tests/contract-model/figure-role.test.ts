/**
 * A comparator figure is not basket capacity. Both directions, negation,
 * a conditional approval, and a nested proviso are covered. A real cap stays available.
 */
import { describe, expect, it } from "vitest";
import { classifyFigures, figureRoleIssues } from "../../lib/contract-model/compiler/semantic-verification/figure-role";
import { classifyFigureRoleInText } from "../../lib/contract-model/compiler/semantic/figure-role-guard";
import { verifyCompiledCandidate } from "../../lib/contract-model/compiler/semantic-verification/verify";
import type { VerificationInput } from "../../lib/contract-model/compiler/semantic-verification/types";
import type { SemanticCompilationResult } from "../../lib/contract-model/compiler/semantic/types";
import type { IRExpression, IRRule } from "../../lib/contract-model/ir/types";
import { testCompilerInput } from "./semantic-compiler/test-helpers";
import type { StageCaller } from "../../lib/contract-model/compiler/llm-caller";
import type { ZodType } from "zod";

function money(amount: number): IRExpression {
  return { exprId: "m", kind: "MONEY", type: "MONEY", amount, currency: "USD" };
}
function compare(operator: "GT" | "GTE" | "LT" | "LTE", value: number, kind: "RATIO" | "MONEY" = "RATIO"): IRExpression {
  const right: IRExpression = kind === "RATIO"
    ? { exprId: "r", kind: "RATIO", type: "RATIO", value }
    : money(value);
  return {
    exprId: "c",
    kind: "COMPARE",
    type: "BOOLEAN",
    operator,
    left: { exprId: "metric", kind: "METRIC_REFERENCE", type: kind === "RATIO" ? "RATIO" : "MONEY", metricName: "Metric", companyId: "c", instrumentKey: "i", resolvedDefinitionId: null },
    right,
  };
}
function rule(capacity: IRRule["capacityExpression"], conditions: IRRule["conditions"] = []): Pick<IRRule, "ruleId" | "capacityExpression" | "conditions" | "exceptions"> {
  return { ruleId: "rule-1", capacityExpression: capacity, conditions, exceptions: [] };
}

const caller = (): StageCaller => ({
  providerName: "test",
  model: "test",
  isSynthetic: false,
  async call<T>(schema: ZodType<T>): Promise<T> {
    return schema.parse({ status: "NO_MATERIAL_CONDITION_SUSPECTED", evidence: [], findings: [], overallNotes: [] });
  },
  lastTelemetry: () => null,
});

async function verify(text: string, capacity: IRRule["capacityExpression"]) {
  const compiled: SemanticCompilationResult = {
    status: "COMPLETED", failureReasons: [], errorDetail: null,
    rules: [{
      ruleId: "rule-1", irSchemaVersion: "v1", companyId: "c", instrumentKey: "i", sourceDocumentId: "d", sourceSectionRef: "7.01",
      covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT",
      entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: capacity, conditions: [], exceptions: [],
      dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, compilerVersion: "v1", sourceContentVersion: null,
    } as IRRule],
    definitions: [], sharedCapacities: [], irExtensionCandidates: [], unresolvedIssues: [], toolCallLog: [], rawModelOutput: {},
    provider: "test", model: "test", telemetry: null, cacheKey: "k", compiledAt: new Date().toISOString(),
  };
  const input: VerificationInput = { compilerInput: testCompilerInput({ operativeSourceText: text }), compilationResult: compiled };
  return verifyCompiledCandidate(input, { reviewCaller: caller(), conditionSuspicionCaller: caller() });
}

describe("figure roles", () => {
  it("treats shall-not-in-excess-of as a prohibition ceiling for normalize (IPV-22 / package G)", () => {
    const prohibition = "The Borrower shall not create, incur or assume any Indebtedness in excess of $35,000,000 in the aggregate at any time outstanding.";
    expect(classifyFigureRoleInText("$35,000,000", prohibition)).toBe("CAP");
    expect(classifyFigureRoleInText("35000000", prohibition)).toBe("CAP");
    // A bare approval threshold stays a threshold — not borrowable capacity.
    const condition = "any other transaction involving aggregate consideration in excess of $5,000,000, so long as such transaction has been approved";
    expect(classifyFigureRoleInText("$5,000,000", condition)).toBe("THRESHOLD");
  });

  it("classifies permission, condition, trigger, ratio, prohibition, and exception amounts", () => {
    const text = [
      "SECTION 9.01 Indebtedness. The Borrower shall not incur Indebtedness, except other Indebtedness in an aggregate principal amount not to exceed $10,000,000.",
      "SECTION 9.02 Affiliate Transactions. Any other transaction in excess of $5,000,000, so long as approved.",
      "SECTION 9.03 Availability. If Availability would be less than $15,000,000.",
      "SECTION 9.04 Ratio. So long as the Ratio does not exceed 3.50 to 1.00.",
      "SECTION 9.05 Restricted Debt. The Borrower shall not incur Indebtedness in excess of $8,000,000.",
      "SECTION 9.06 Baskets. The Borrower shall not incur Indebtedness, except Indebtedness not to exceed $2,000,000.",
    ].join("\n\n");
    const figures = classifyFigures(text);
    const roleFor = (value: number, kind: "MONEY" | "RATIO") => figures.find((figure) => figure.kind === kind && figure.value === value)?.role;
    expect(roleFor(10_000_000, "MONEY")).toBe("EXCEPTION_AMOUNT");
    expect(roleFor(5_000_000, "MONEY")).toBe("CONDITION_THRESHOLD");
    expect(roleFor(15_000_000, "MONEY")).toBe("TRIGGER_THRESHOLD");
    expect(roleFor(3.5, "RATIO")).toBe("RATIO_REQUIREMENT");
    expect(roleFor(8_000_000, "MONEY")).toBe("PROHIBITION_THRESHOLD");
    expect(roleFor(2_000_000, "MONEY")).toBe("EXCEPTION_AMOUNT");
  });

  it("refuses both comparator directions and a negated floor used as capacity", () => {
    const excess = "any other transaction involving aggregate consideration in excess of $5,000,000, so long as such transaction has been approved";
    const below = "shall not make any payment if Availability would be less than $15,000,000";
    const floor = "so long as Availability is not less than $12,500,000";
    expect(figureRoleIssues(excess, [rule(money(5_000_000))]).map((issue) => issue.kind)).toEqual(["THRESHOLD_AS_CAPACITY"]);
    expect(figureRoleIssues(below, [rule(money(15_000_000))]).map((issue) => issue.kind)).toEqual(["THRESHOLD_AS_CAPACITY"]);
    expect(figureRoleIssues(floor, [rule(money(12_500_000))]).map((issue) => issue.role)).toEqual(["CONDITION_THRESHOLD"]);
    const greater = "if the consideration is greater than $4,000,000";
    expect(figureRoleIssues(greater, [rule(money(4_000_000))]).map((issue) => issue.kind)).toEqual(["THRESHOLD_AS_CAPACITY"]);
    const noShall = "No Restricted Subsidiary shall incur Indebtedness in excess of $3,000,000 in the aggregate.";
    expect(figureRoleIssues(noShall, [rule(money(3_000_000))]).map((issue) => issue.kind)).toEqual(["THRESHOLD_AS_CAPACITY"]);
    expect(classifyFigures(noShall)[0]?.role).toBe("PROHIBITION_THRESHOLD");
    expect(classifyFigures(noShall)[0]?.capacity).toBe(false);
    const conditional = "The Borrower may consummate the transaction in excess of $5,000,000 so long as the Required Lenders have approved it in writing.";
    expect(figureRoleIssues(conditional, [rule(money(5_000_000))]).map((issue) => issue.kind)).toEqual(["THRESHOLD_AS_CAPACITY"]);
  });

  it("keeps a cap, including inside a nested proviso, and rejects a flipped ratio comparator", () => {
    const nested = "The Borrower shall not incur Indebtedness, except Indebtedness in an aggregate principal amount not to exceed $10,000,000, provided that the Consolidated Total Leverage Ratio does not exceed 3.50 to 1.00";
    expect(figureRoleIssues(nested, [rule(money(10_000_000))])).toEqual([]);
    const flipped = rule(null, [{ conditionId: "c", conditionType: "RATIO_SATISFIED", expression: compare("GTE", 3.5), referencesDefinitionId: null, description: "ratio at least 3.50", provenance: null }]);
    expect(figureRoleIssues(nested, [flipped]).some((issue) => issue.kind === "COMPARATOR_MISMATCH")).toBe(true);
    const faithful = rule(null, [{ conditionId: "c", conditionType: "RATIO_SATISFIED", expression: compare("LTE", 3.5), referencesDefinitionId: null, description: "ratio does not exceed 3.50", provenance: null }]);
    expect(figureRoleIssues(nested, [faithful])).toEqual([]);
    const maintenance = "SECTION 7.01 Financial Covenants. The Borrower shall not: (a) permit the Leverage Ratio to exceed 4.25 to 1.00; or (b) permit the Interest Coverage Ratio to be less than 2.50 to 1.00.";
    const maintenanceRules = [
      rule(null, [{ conditionId: "a", conditionType: "RATIO_SATISFIED", expression: compare("LTE", 4.25), referencesDefinitionId: null, description: "leverage not greater than 4.25", provenance: null }]),
      rule(null, [{ conditionId: "b", conditionType: "RATIO_SATISFIED", expression: compare("GTE", 2.5), referencesDefinitionId: null, description: "coverage not less than 2.50", provenance: null }]),
    ];
    expect(figureRoleIssues(maintenance, maintenanceRules)).toEqual([]);
    const flippedMax = rule(null, [{ conditionId: "a", conditionType: "RATIO_SATISFIED", expression: compare("GT", 4.25), referencesDefinitionId: null, description: "leverage greater than 4.25", provenance: null }]);
    expect(figureRoleIssues(maintenance, [flippedMax]).some((issue) => issue.kind === "COMPARATOR_MISMATCH")).toBe(true);
    const negated = "if the Ratio does not exceed 3.50 to 1.00";
    const notWrapped = rule(null, [{ conditionId: "c", conditionType: "RATIO_SATISFIED", expression: { exprId: "n", kind: "NOT", type: "BOOLEAN", operand: compare("GT", 3.5) }, referencesDefinitionId: null, description: "not greater", provenance: null }]);
    expect(figureRoleIssues(negated, [notWrapped])).toEqual([]);
  });

  it("does not verify a threshold submitted as available capacity", async () => {
    const text = "any other transaction with an Affiliate involving aggregate consideration in excess of $5,000,000, so long as such transaction has been approved by the board";
    const result = await verify(text, money(5_000_000));
    expect(result.status).toBe("MATERIAL_DISCREPANCY");
    expect(result.findings.some((finding) => finding.findingType === "WRONG_AMOUNT")).toBe(true);
  });

  it("uses one number under seven governing structures", () => {
    const amount = 5_000_000;
    const cases: Array<[string, string, boolean]> = [
      ["The Borrower may incur Indebtedness in an aggregate principal amount not to exceed $5,000,000.", "AFFIRMATIVE_PERMISSION", true],
      ["except other Indebtedness not to exceed $5,000,000.", "EXCEPTION_AMOUNT", true],
      ["The Borrower shall not incur Indebtedness in excess of $5,000,000.", "PROHIBITION_THRESHOLD", false],
      ["The Borrower shall not incur Indebtedness if the consideration is in excess of $5,000,000.", "CONDITION_THRESHOLD", false],
      ["if Availability would be less than $5,000,000.", "TRIGGER_THRESHOLD", false],
      ["an amount equal to the greater of $5,000,000 and Consolidated EBITDA.", "FORMULA_COMPONENT", false],
      ["The Borrower may incur an amount equal to the greater of $5,000,000 and Consolidated EBITDA.", "FORMULA_COMPONENT", true],
      ["The aggregate principal amount incurred under this Section shall not at any time exceed the greater of $5,000,000 and 10% of Total Assets.", "PROHIBITION_THRESHOLD", false],
      ["$5,000,000.", "UNCLASSIFIED", false],
      ["so long as Indebtedness does not exceed $5,000,000.", "CONDITION_THRESHOLD", false],
    ];
    for (const [text, role, capacity] of cases) {
      const figure = classifyFigures(text).find((item) => item.kind === "MONEY" && item.value === amount);
      expect(figure?.role, text).toBe(role);
      expect(figure?.capacity, text).toBe(capacity);
      const issues = figureRoleIssues(text, [rule(money(amount))]).map((issue) => issue.kind);
      expect(issues, text).toEqual(capacity ? [] : ["THRESHOLD_AS_CAPACITY"]);
    }
    const siblingProviso = [
      "SECTION 7.01 Indebtedness. The Borrower shall not incur Indebtedness, except:",
      "(a) other Indebtedness in an aggregate principal amount not to exceed $9,000,000; provided that no Default has occurred; and",
      "(b) Indebtedness not to exceed the greater of $5,000,000 and Consolidated EBITDA.",
    ].join("\n");
    const sibling = classifyFigures(siblingProviso).find((item) => item.kind === "MONEY" && item.value === amount);
    expect(sibling?.role, siblingProviso).toBe("EXCEPTION_AMOUNT");
    expect(sibling?.capacity, siblingProviso).toBe(true);
    expect(figureRoleIssues(siblingProviso, [rule(money(amount))]), siblingProviso).toEqual([]);
    const conditionInsideGrant = "The Borrower may incur Indebtedness not to exceed, so long as approved, the greater of $5,000,000 and Consolidated EBITDA.";
    const inside = classifyFigures(conditionInsideGrant).find((item) => item.kind === "MONEY" && item.value === amount);
    expect(inside?.capacity, conditionInsideGrant).toBe(false);
    expect(figureRoleIssues(conditionInsideGrant, [rule(money(amount))]).map((issue) => issue.kind), conditionInsideGrant).toEqual(["THRESHOLD_AS_CAPACITY"]);
    const maintenance = "The Borrower shall not permit the Leverage Ratio to exceed 5.00 to 1.00.";
    expect(classifyFigures(maintenance).find((figure) => figure.kind === "RATIO")?.role).toBe("FINANCIAL_MAINTENANCE");
    expect(figureRoleIssues(maintenance, [rule(null, [{ conditionId: "a", conditionType: "RATIO_SATISFIED", expression: compare("LTE", 5), referencesDefinitionId: null, description: "maximum leverage", provenance: null }])])).toEqual([]);
  });

  it("refuses intervening provisos, nested conditions, remote verbs, conflicting verbs, and a shared ceiling", () => {
    const amount = 5_000_000;
    const proviso = "The Borrower may incur Indebtedness, provided that such Indebtedness does not exceed $5,000,000.";
    expect(classifyFigures(proviso).find((item) => item.value === amount)?.capacity).toBe(false);
    const nested = [
      "SECTION 7.01 Indebtedness. The Borrower shall not incur Indebtedness, except:",
      "(a) Indebtedness not to exceed $9,000,000, provided that:",
      "(i) if the consideration is in excess of $5,000,000, the Required Lenders have consented.",
    ].join("\n");
    const nestedFigures = classifyFigures(nested);
    expect(nestedFigures.find((item) => item.value === 9_000_000)?.capacity).toBe(true);
    expect(nestedFigures.find((item) => item.value === amount)?.capacity).toBe(false);
    const remote = [
      "SECTION 7.01 Indebtedness. The Borrower may incur Indebtedness not to exceed $9,000,000.",
      "",
      "SECTION 7.02 Liens. The Borrower shall not create a Lien in excess of $5,000,000.",
    ].join("\n");
    expect(classifyFigures(remote).find((item) => item.value === amount)?.capacity).toBe(false);
    expect(classifyFigures(remote).find((item) => item.value === 9_000_000)?.capacity).toBe(true);
    const conflict = "The Borrower may incur Indebtedness. The Borrower shall not incur Indebtedness not to exceed $5,000,000.";
    expect(classifyFigures(conflict).find((item) => item.value === amount)?.capacity).toBe(false);
    const shared = [
      "SECTION 7.04 Investments. The Borrower shall not make any Investment, except:",
      "(a) Investments not to exceed $20,000,000; and",
      "(b) other Investments not to exceed $30,000,000.",
      "The aggregate amount of Investments made in reliance on clauses (a) and (b) together shall not exceed $5,000,000.",
    ].join("\n");
    const sharedFigures = classifyFigures(shared);
    expect(sharedFigures.find((item) => item.value === 20_000_000)?.capacity).toBe(true);
    expect(sharedFigures.find((item) => item.value === 30_000_000)?.capacity).toBe(true);
    expect(sharedFigures.find((item) => item.value === amount)?.capacity).toBe(false);
    expect(figureRoleIssues(shared, [rule(money(amount))]).map((issue) => issue.kind)).toEqual(["THRESHOLD_AS_CAPACITY"]);
    const ambiguous = [
      "SECTION 7.05 Payments. The Borrower shall not pay, except:",
      "(a) ordinary course payments.",
      "(h) a listed payment.",
      "(i) payments not to exceed $5,000,000.",
    ].join("\n");
    expect(classifyFigures(ambiguous).find((item) => item.value === amount)?.role).toBe("UNCLASSIFIED");
    expect(classifyFigures(ambiguous).find((item) => item.value === amount)?.capacity).toBe(false);
  });

  it("still verifies a source-supported cap", async () => {
    const text = "The Company may incur Indebtedness in an amount not to exceed $5,000,000.";
    const result = await verify(text, money(5_000_000));
    expect(result.findings.filter((finding) => finding.findingType === "WRONG_AMOUNT" || finding.findingType === "WRONG_LOGIC")).toEqual([]);
    expect(result.status).toBe("VERIFIED_NO_MATERIAL_GAP_FOUND");
  });
});
