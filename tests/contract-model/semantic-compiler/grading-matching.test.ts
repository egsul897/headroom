/**
 * Phase 3B.1 synthetic test matrix, remediation class C (task §29-31,
 * IR-aware grading). Proves matchExpectedToCompiled/gradeRules match by
 * CONTENT, never by array position - the exact defect confirmed in Phase
 * 3B's own real regression (lsb-6.11-restricted-payments's $500,000
 * expectation being compared against the wrong rule at index 0 instead of
 * the real match at index 4), and the exact behavior task §40 requires for
 * a genuine multi-basket omission (lsb-6.13's preserved adversarial case)
 * to surface as MISSED_RULE without any package-specific logic anywhere in
 * the matcher.
 */
import { describe, expect, it } from "vitest";
import { gradeRules, matchExpectedToCompiled, type ExpectedRuleShape } from "../../../lib/contract-model/compiler/semantic/grading";
import type { IRRule } from "../../../lib/contract-model/ir/types";

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

const money = (amount: number) => ({ exprId: "e", kind: "MONEY" as const, type: "MONEY" as const, amount, currency: "USD" });
const percent = (value: number) => ({ exprId: "e", kind: "PERCENT" as const, type: "PERCENT" as const, value });
const ratio = (value: number) => ({ exprId: "e", kind: "RATIO" as const, type: "RATIO" as const, value });
const metricRef = (metricName: string) => ({ exprId: "e", kind: "METRIC_REFERENCE" as const, type: "MONEY" as const, metricName, companyId: "test-co", instrumentKey: "test-instrument", resolvedDefinitionId: null });
const unlimited = (gatedBy: unknown = null) => ({ kind: "UNLIMITED_CAPACITY" as const, type: "CAPACITY" as const, gatedBy });

describe("Phase 3B.1 synthetic tests - IR-aware content-based rule matching (remediation class C)", () => {
  it("matches by CONTENT rather than array position: a single expectation matches the correct rule even when it is NOT at index 0 (the confirmed lsb-6.11 defect)", () => {
    const prohibition = rule({ posture: "PROHIBITION", action: "PAY_DIVIDEND", capacityExpression: null });
    const otherPermission1 = rule({ posture: "PERMISSION", action: "PAY_DIVIDEND", capacityExpression: null, sufficiency: "COMPLETE" });
    const otherPermission2 = rule({ posture: "PERMISSION", action: "PAY_DIVIDEND", capacityExpression: { exprId: "e", kind: "UNSUPPORTED", type: "UNSUPPORTED", semanticDescription: "x", reason: "y", sourceEvidence: "z" } as never, sufficiency: "MISSING_CONTEXT" });
    const theRealMatch = rule({ posture: "PERMISSION", action: "PAY_DIVIDEND", capacityExpression: money(500_000) as never, sufficiency: "COMPLETE" });
    const compiled = [prohibition, otherPermission1, otherPermission2, theRealMatch];
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.11", expectedFlatAmount: 500_000 }];

    const findings = gradeRules(compiled, expected);
    // No WRONG_THRESHOLD - the matcher found the real $500,000 rule at index 3, not index 0.
    expect(findings.filter((f) => f.ref === "case-1")).toHaveLength(0);

    const matchResult = matchExpectedToCompiled(compiled, expected);
    expect(matchResult.matched).toHaveLength(1);
    expect(matchResult.matched[0]?.compiled.ruleId).toBe(theRealMatch.ruleId);
  });

  it("a genuine omission (expected content present in NO compiled rule) is reported as MISSED_RULE, never forced onto a superficially-similar rule (the lsb-6.13 preservation requirement, task §40) - zero section-specific logic involved", () => {
    const compiled = [
      rule({ posture: "PROHIBITION", capacityExpression: null }),
      rule({ posture: "PERMISSION", capacityExpression: { exprId: "e", kind: "UNSUPPORTED", type: "UNSUPPORTED", semanticDescription: "x", reason: "y", sourceEvidence: "z" } as never, sufficiency: "MISSING_CONTEXT" }),
      rule({ posture: "PERMISSION", capacityExpression: unlimited() as never, sufficiency: "COMPLETE" }),
      rule({ posture: "PERMISSION", capacityExpression: unlimited() as never, sufficiency: "COMPLETE" }),
    ];
    // Neither $35,000,000 nor $5,000,000 appears anywhere in the compiled output above.
    const expected: ExpectedRuleShape[] = [
      { ref: "jv-basket", sourceSectionRef: "6.13", expectedFlatAmount: 35_000_000 },
      { ref: "general-basket", sourceSectionRef: "6.13", expectedFlatAmount: 5_000_000 },
    ];

    const findings = gradeRules(compiled, expected);
    const missed = findings.filter((f) => f.category === "MISSED_RULE");
    expect(missed.map((f) => f.ref).sort()).toEqual(["general-basket", "jv-basket"]);
    expect(missed.every((f) => f.dangerous)).toBe(true);
    // No WRONG_THRESHOLD findings were forced onto the wrong rules.
    expect(findings.some((f) => f.category === "WRONG_THRESHOLD")).toBe(false);
  });

  it("a MISSED_RULE is NOT dangerous when the compiler already attempted the exact same section and honestly downgraded it to non-COMPLETE (the fwrg-6.04-b type-check-safety-net shape) - it did not stay silent about the gap", () => {
    // The compiler tried to represent §6.04(b)(iv) but its own type-check safety net caught a
    // malformed ADD and downgraded the whole capacityExpression to UNSUPPORTED/sufficiency
    // PARTIAL - so none of the expected MONEY/PERCENT/metric content survives as real leaves,
    // making this pairing ineligible for a content-based match. The gap is real, but the
    // compiler already told the reader not to trust it - that must not be scored as dangerous.
    const selfFlagged = rule({ sourceSectionRef: "6.04(b)(iv)", action: "OTHER", sufficiency: "PARTIAL", capacityExpression: { exprId: "e", kind: "UNSUPPORTED", type: "UNSUPPORTED", semanticDescription: "x", reason: "y", sourceEvidence: "z" } as never });
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.04(b)(iv)", expectedAction: "PAY_JUNIOR_DEBT", expectedFlatAmount: 21_000_000, expectedPercent: 0.35 }];
    const findings = gradeRules([selfFlagged], expected);
    const missed = findings.find((f) => f.category === "MISSED_RULE");
    expect(missed).toBeDefined();
    expect(missed?.dangerous).toBe(false);
    expect(missed?.detail).toMatch(/honestly flagged it as non-COMPLETE/);
  });

  it("a MISSED_RULE IS dangerous when the compiler's only rule for that exact section is confidently COMPLETE but still lacks the expected content (a true silent gap)", () => {
    const confidentButWrong = rule({ sourceSectionRef: "6.13", posture: "PROHIBITION", capacityExpression: null, sufficiency: "COMPLETE" });
    const expected: ExpectedRuleShape[] = [{ ref: "jv-basket", sourceSectionRef: "6.13", expectedFlatAmount: 35_000_000 }];
    const findings = gradeRules([confidentButWrong], expected);
    const missed = findings.find((f) => f.category === "MISSED_RULE");
    expect(missed?.dangerous).toBe(true);
  });

  it("resolves competing candidates correctly via GLOBAL best-score assignment, not first-come-first-served iteration order", () => {
    // Two expectations, two candidates. candidateA truly matches expectedA ($10) and only WEAKLY
    // resembles expectedB (same action, wrong amount). candidateB truly matches expectedB ($20).
    // A naive per-expectation "first eligible" scan (iterating compiled in array order) would
    // incorrectly grab candidateA for expectedB first if it only checked action, not amount.
    const candidateA = rule({ action: "INCUR_DEBT", capacityExpression: money(10_000_000) as never });
    const candidateB = rule({ action: "INCUR_DEBT", capacityExpression: money(20_000_000) as never });
    const expectedA: ExpectedRuleShape = { ref: "basket-a", sourceSectionRef: "6.01", expectedAction: "INCUR_DEBT", expectedFlatAmount: 10_000_000 };
    const expectedB: ExpectedRuleShape = { ref: "basket-b", sourceSectionRef: "6.01", expectedAction: "INCUR_DEBT", expectedFlatAmount: 20_000_000 };

    const { matched, unmatchedExpected, unmatchedCompiled } = matchExpectedToCompiled([candidateA, candidateB], [expectedA, expectedB]);
    expect(unmatchedExpected).toHaveLength(0);
    expect(unmatchedCompiled).toHaveLength(0);
    const matchForA = matched.find((m) => m.expected.ref === "basket-a")!;
    const matchForB = matched.find((m) => m.expected.ref === "basket-b")!;
    expect(matchForA.compiled.ruleId).toBe(candidateA.ruleId);
    expect(matchForB.compiled.ruleId).toBe(candidateB.ruleId);
  });

  it("an unmatched compiled rule (legitimate extra coverage beyond the ground truth's own scope) is reported as EXTRA_RULE and is NEVER dangerous", () => {
    const expectedMatch = rule({ action: "GUARANTEE_DEBT", capacityExpression: money(2_500_000) as never });
    const siblingExpansion1 = rule({ action: "INCUR_DEBT", capacityExpression: unlimited() as never });
    const siblingExpansion2 = rule({ action: "INCUR_DEBT", capacityExpression: unlimited() as never });
    const compiled = [expectedMatch, siblingExpansion1, siblingExpansion2];
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.01(g)(i)", expectedAction: "GUARANTEE_DEBT", expectedFlatAmount: 2_500_000 }];

    const findings = gradeRules(compiled, expected);
    const extras = findings.filter((f) => f.category === "EXTRA_RULE");
    expect(extras).toHaveLength(2);
    expect(extras.every((f) => f.dangerous === false)).toBe(true);
  });

  it("expectedGenuinelyUnsupported matches the correct MISSING_CONTEXT/UNSUPPORTED candidate among several COMPLETE siblings", () => {
    const complete1 = rule({ capacityExpression: money(1) as never, sufficiency: "COMPLETE" });
    const genuinelyUnsupported = rule({ capacityExpression: null, sufficiency: "MISSING_CONTEXT" });
    const complete2 = rule({ capacityExpression: money(2) as never, sufficiency: "COMPLETE" });
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "Article 1", expectedGenuinelyUnsupported: true }];

    const findings = gradeRules([complete1, genuinelyUnsupported, complete2], expected);
    expect(findings.filter((f) => f.ref === "case-1")).toHaveLength(0); // correctly matched, no OVERCONFIDENT_COMPLETE finding
  });

  it("percent/ratio/metric-name signals all participate in eligibility and matching, not just flat amount", () => {
    const wrongMetric = rule({ capacityExpression: { exprId: "e", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.05), metricRef("Consolidated Net Income")] } as never });
    const rightMetric = rule({ capacityExpression: { exprId: "e", kind: "MULTIPLY", type: "MONEY", operands: [percent(0.05), metricRef("Consolidated EBITDA")] } as never });
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.01", expectedPercent: 0.05, expectedMetricNameContains: "EBITDA" }];

    const { matched } = matchExpectedToCompiled([wrongMetric, rightMetric], expected);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.compiled.ruleId).toBe(rightMetric.ruleId);
  });

  it("a ratio-gated UnlimitedCapacity expectation matches the correct candidate even among plain COMPLETE dollar-amount siblings", () => {
    const dollarRule = rule({ capacityExpression: money(1_000_000) as never });
    const ratioGated = rule({ capacityExpression: unlimited({ exprId: "e", kind: "COMPARE", type: "BOOLEAN", left: metricRef("Leverage Ratio"), operator: "LTE", right: ratio(3.5) }) as never });
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.04(a)(xi)", expectedUnlimitedCapacity: true, expectedRatio: 3.5 }];

    const { matched, unmatchedExpected } = matchExpectedToCompiled([dollarRule, ratioGated], expected);
    expect(unmatchedExpected).toHaveLength(0);
    expect(matched[0]?.compiled.ruleId).toBe(ratioGated.ruleId);
  });

  it("empty compiled array: every expectation is MISSED_RULE, no crash", () => {
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.01", expectedFlatAmount: 100 }];
    const findings = gradeRules([], expected);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.category).toBe("MISSED_RULE");
  });

  it("empty expected array: every compiled rule is EXTRA_RULE (non-dangerous), no crash", () => {
    const compiled = [rule({}), rule({})];
    const findings = gradeRules(compiled, []);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.category === "EXTRA_RULE" && f.dangerous === false)).toBe(true);
  });

  it("a correctly-matched pair still surfaces its own real defect findings (matching does not suppress gradeRule's own field checks)", () => {
    const decoy = rule({ action: "PAY_DIVIDEND", capacityExpression: money(1) as never });
    const theMatch = rule({ action: "OTHER", capacityExpression: money(2_500_000) as never }); // right amount, wrong action - the real fwrg-6.01-g-i shape
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.01(g)(i)", expectedAction: "GUARANTEE_DEBT", expectedFlatAmount: 2_500_000 }];

    const findings = gradeRules([decoy, theMatch], expected);
    const wrongAction = findings.filter((f) => f.category === "WRONG_ACTION");
    expect(wrongAction).toHaveLength(1);
    expect(wrongAction[0]?.detail).toMatch(/expected action GUARANTEE_DEBT, got OTHER/);
    // the decoy rule (never matched to any expectation) is reported separately as EXTRA_RULE
    expect(findings.filter((f) => f.category === "EXTRA_RULE")).toHaveLength(1);
  });

  it("a matched pair's dangerous flag still depends on the rule's own sufficiency, exactly as gradeRule defines it (PARTIAL/UNSUPPORTED rules are never dangerous even after a correct match)", () => {
    const honestlyFlagged = rule({ action: "OTHER", capacityExpression: money(2_500_000) as never, sufficiency: "PARTIAL" });
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.01", expectedAction: "GUARANTEE_DEBT", expectedFlatAmount: 2_500_000 }];
    const findings = gradeRules([honestlyFlagged], expected);
    expect(findings[0]?.category).toBe("WRONG_ACTION");
    expect(findings[0]?.dangerous).toBe(false);
  });

  it("weak-signal-only expectations (no strong value-bearing field at all) still match via the score>0 eligibility fallback", () => {
    const wrongAction = rule({ action: "PAY_DIVIDEND", posture: "PERMISSION" });
    const rightAction = rule({ action: "INCUR_DEBT", posture: "PERMISSION" });
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.01", expectedAction: "INCUR_DEBT" }];
    const { matched } = matchExpectedToCompiled([wrongAction, rightAction], expected);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.compiled.ruleId).toBe(rightAction.ruleId);
  });

  it("section-ref proximity acts only as a low-weight tiebreaker, never overriding a strong value-bearing signal from a different section", () => {
    const wrongSectionRightAmount = rule({ sourceSectionRef: "6.02", capacityExpression: money(10_000_000) as never });
    const rightSectionWrongAmount = rule({ sourceSectionRef: "6.01(i)", capacityExpression: money(1) as never });
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.01(i)", expectedFlatAmount: 10_000_000 }];
    const { matched } = matchExpectedToCompiled([wrongSectionRightAmount, rightSectionWrongAmount], expected);
    expect(matched[0]?.compiled.ruleId).toBe(wrongSectionRightAmount.ruleId);
  });

  it("multiple simultaneous defects on one matched rule are all reported (WRONG_ACTION + WRONG_PERCENT + WRONG_CONDITION together)", () => {
    const compiled = rule({ action: "OTHER", capacityExpression: money(21_000_000) as never, conditions: [] });
    const expected: ExpectedRuleShape[] = [{ ref: "case-1", sourceSectionRef: "6.04(b)", expectedAction: "PAY_JUNIOR_DEBT", expectedFlatAmount: 21_000_000, expectedPercent: 0.35, expectedConditionTypes: ["NO_DEFAULT"] }];
    const findings = gradeRules([compiled], expected);
    const categories = findings.map((f) => f.category).sort();
    expect(categories).toEqual(["WRONG_ACTION", "WRONG_CONDITION", "WRONG_PERCENT"]);
  });

  it("three simultaneous expectations against three candidates resolve to a correct one-to-one assignment even when every candidate shares the same action/posture", () => {
    const c10 = rule({ action: "INCUR_DEBT", capacityExpression: money(10_000_000) as never });
    const c20 = rule({ action: "INCUR_DEBT", capacityExpression: money(20_000_000) as never });
    const c30 = rule({ action: "INCUR_DEBT", capacityExpression: money(30_000_000) as never });
    const e10: ExpectedRuleShape = { ref: "e10", sourceSectionRef: "6.01", expectedAction: "INCUR_DEBT", expectedFlatAmount: 10_000_000 };
    const e20: ExpectedRuleShape = { ref: "e20", sourceSectionRef: "6.01", expectedAction: "INCUR_DEBT", expectedFlatAmount: 20_000_000 };
    const e30: ExpectedRuleShape = { ref: "e30", sourceSectionRef: "6.01", expectedAction: "INCUR_DEBT", expectedFlatAmount: 30_000_000 };
    const { matched, unmatchedExpected, unmatchedCompiled } = matchExpectedToCompiled([c30, c10, c20], [e20, e30, e10]);
    expect(unmatchedExpected).toHaveLength(0);
    expect(unmatchedCompiled).toHaveLength(0);
    expect(matched.find((m) => m.expected.ref === "e10")?.compiled.ruleId).toBe(c10.ruleId);
    expect(matched.find((m) => m.expected.ref === "e20")?.compiled.ruleId).toBe(c20.ruleId);
    expect(matched.find((m) => m.expected.ref === "e30")?.compiled.ruleId).toBe(c30.ruleId);
  });

  it("a rule already claimed by a higher-scoring expectation is not double-assigned to a second, lower-scoring expectation", () => {
    const onlyCandidate = rule({ capacityExpression: money(5_000_000) as never, action: "INCUR_DEBT" });
    const strongExpectation: ExpectedRuleShape = { ref: "strong", sourceSectionRef: "6.01", expectedFlatAmount: 5_000_000, expectedAction: "INCUR_DEBT" };
    const weakExpectation: ExpectedRuleShape = { ref: "weak", sourceSectionRef: "6.01", expectedAction: "INCUR_DEBT" };
    const { matched, unmatchedExpected } = matchExpectedToCompiled([onlyCandidate], [strongExpectation, weakExpectation]);
    expect(matched).toHaveLength(1);
    expect(matched[0]?.expected.ref).toBe("strong");
    expect(unmatchedExpected.map((e) => e.ref)).toEqual(["weak"]);
  });
});
