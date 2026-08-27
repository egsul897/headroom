/**
 * Phase 3B synthetic test matrix, part 1 (task §37 items 1-16, 22, 24-25) -
 * deterministic wire-to-IR normalization, exercised directly against
 * hand-built SubmitCompilationInput objects (no mocked model needed for
 * these - they test normalize.ts's own deterministic behavior).
 */
import { describe, expect, it } from "vitest";
import { normalizeSubmission } from "../../../lib/contract-model/compiler/semantic/normalize";
import { validateCompilationUnit } from "../../../lib/contract-model/ir/validate";
import { inferType } from "../../../lib/contract-model/ir/type-check";
import type { SubmitCompilationInput, WireRule } from "../../../lib/contract-model/compiler/semantic/wire-schema";
import { testCompilerInput } from "./test-helpers";

function submission(rules: Partial<WireRule>[], extra: Partial<SubmitCompilationInput> = {}): SubmitCompilationInput {
  return {
    rules: rules.map((r, i) => ({
      localRef: `r${i + 1}`,
      sourceSectionRef: "9.01",
      covenantFamily: "INDEBTEDNESS",
      ruleType: "QUANTITATIVE_PERMISSION",
      posture: "PERMISSION",
      action: "INCUR_DEBT",
      entityScope: [],
      entityScopeExcluded: [],
      capacityExpression: null,
      conditions: [],
      exceptions: [],
      dependsOn: [],
      sufficiency: "COMPLETE",
      sufficiencyReasons: [],
      citation: null,
      excerpt: null,
      ...r,
    })),
    definitions: [],
    sharedCapacities: [],
    irExtensionCandidates: [],
    overallNotes: [],
    ...extra,
  };
}

describe("Phase 3B synthetic tests - normalization", () => {
  it("1: fixed basket normalizes to a MONEY capacityExpression", () => {
    const { rules } = normalizeSubmission(submission([{ capacityExpression: { kind: "MONEY", amount: 10_000_000, citation: "§9.01(a)" } }]), testCompilerInput());
    expect(rules[0]?.capacityExpression?.kind).toBe("MONEY");
    expect((rules[0]?.capacityExpression as { amount: number }).amount).toBe(10_000_000);
    expect(rules[0]?.sufficiency).toBe("COMPLETE");
  });

  it("2: percentage-of-metric normalizes to MULTIPLY(PERCENT, METRIC_REFERENCE) typed MONEY", () => {
    const { rules } = normalizeSubmission(submission([{ capacityExpression: { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.1 }, { kind: "METRIC_REFERENCE", metricName: "Consolidated Total Assets" }] } }]), testCompilerInput());
    const expr = rules[0]?.capacityExpression;
    expect(expr?.kind).toBe("MULTIPLY");
    expect(inferType(expr as never)).toBe("MONEY");
  });

  it("3/4: greater-of arbitrary metric normalizes to MAX(MONEY, MULTIPLY(...)) - same shape for two different metrics (anti-enumeration)", () => {
    const build = (metricName: string) =>
      normalizeSubmission(submission([{ capacityExpression: { kind: "MAX", operands: [{ kind: "MONEY", amount: 5_000_000 }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.08 }, { kind: "METRIC_REFERENCE", metricName }] }] } }]), testCompilerInput()).rules[0]!;
    const ruleA = build("Consolidated Net Income");
    const ruleB = build("Consolidated Total Assets");
    expect(ruleA.capacityExpression?.kind).toBe("MAX");
    expect(ruleB.capacityExpression?.kind).toBe("MAX");
    expect(inferType(ruleA.capacityExpression as never)).toBe("MONEY");
    expect(inferType(ruleB.capacityExpression as never)).toBe("MONEY");
  });

  it("5: ratio condition normalizes to UNLIMITED_CAPACITY gated by COMPARE", () => {
    const { rules } = normalizeSubmission(
      submission([{ capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "COMPARE", left: { kind: "METRIC_REFERENCE", metricName: "Leverage Ratio", valueType: "RATIO" }, operator: "LTE", right: { kind: "RATIO", value: 4.0 } } } }]),
      testCompilerInput()
    );
    expect(rules[0]?.capacityExpression?.kind).toBe("UNLIMITED_CAPACITY");
    const gatedBy = (rules[0]?.capacityExpression as { gatedBy: unknown }).gatedBy;
    expect(inferType(gatedBy as never)).toBe("BOOLEAN");
  });

  it("6: stepped threshold normalizes to a SCHEDULE with correctly-typed cases", () => {
    const { rules } = normalizeSubmission(
      submission([
        {
          capacityExpression: {
            kind: "SCHEDULE",
            cases: [{ from: null, to: "2026-12-31", value: { kind: "RATIO", value: 5.0 }, description: "through 2026" }],
            defaultValue: { kind: "RATIO", value: 4.5 },
          },
        },
      ]),
      testCompilerInput()
    );
    expect(rules[0]?.capacityExpression?.kind).toBe("SCHEDULE");
    expect(inferType(rules[0]?.capacityExpression as never)).toBe("RATIO");
  });

  it("7: condition is preserved as a first-class IRCondition, not folded into notes", () => {
    const { rules } = normalizeSubmission(submission([{ conditions: [{ conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "no continuing default", citation: "§9.02", excerpt: null }] }]), testCompilerInput());
    expect(rules[0]?.conditions).toHaveLength(1);
    expect(rules[0]?.conditions[0]?.conditionType).toBe("NO_DEFAULT");
  });

  it("8: exception cross-references a sibling rule emitted in the SAME submission via localRef", () => {
    const sub = submission([
      { localRef: "perm", capacityExpression: { kind: "MONEY", amount: 2_000_000 } },
      { localRef: "prohib", ruleType: "PROHIBITION", posture: "PROHIBITION", capacityExpression: null, exceptions: [{ description: "up to $2,000,000", permissionRef: "perm", conditions: [], citation: null, excerpt: null }] },
    ] as never);
    const { rules } = normalizeSubmission(sub, testCompilerInput());
    const perm = rules.find((r) => r.action === "INCUR_DEBT" && r.posture === "PERMISSION")!;
    const prohib = rules.find((r) => r.posture === "PROHIBITION")!;
    expect(prohib.exceptions[0]?.permissionRuleId).toBe(perm.ruleId);
    expect(prohib.exceptions[0]?.appliesToRuleId).toBe(prohib.ruleId);
  });

  it("9: multi-basket section - three rules from the SAME sourceSectionRef get distinct, stable ruleIds", () => {
    const { rules } = normalizeSubmission(
      submission([{ localRef: "a", capacityExpression: { kind: "MONEY", amount: 1 } }, { localRef: "b", capacityExpression: { kind: "MONEY", amount: 2 } }, { localRef: "c", capacityExpression: { kind: "MONEY", amount: 3 } }] as never),
      testCompilerInput()
    );
    expect(new Set(rules.map((r) => r.ruleId)).size).toBe(3);
    expect(rules.every((r) => r.sourceSectionRef === "9.01")).toBe(true);
  });

  it("10: shared cap - memberRefs resolve to real member ruleIds, never dangling", () => {
    const sub = submission([{ localRef: "a", capacityExpression: { kind: "LEDGER_USAGE_REFERENCE", sharedCapRef: "cap1" } }, { localRef: "b", capacityExpression: { kind: "LEDGER_USAGE_REFERENCE", sharedCapRef: "cap1" } }] as never, {
      sharedCapacities: [{ localRef: "cap1", description: "shared cap", capExpression: { kind: "MONEY", amount: 5_000_000 }, memberRefs: ["a", "b"], citation: null, excerpt: null }],
    });
    const { rules, sharedCapacities } = normalizeSubmission(sub, testCompilerInput());
    expect(sharedCapacities).toHaveLength(1);
    expect(sharedCapacities[0]?.memberRuleIds).toEqual([rules[0]!.ruleId, rules[1]!.ruleId]);
    expect((rules[0]?.capacityExpression as { sharedCapId: string }).sharedCapId).toBe(sharedCapacities[0]!.sharedCapId);
  });

  it("11: no-default condition (trailing, standalone) is preserved", () => {
    const { rules } = normalizeSubmission(submission([{ conditions: [{ conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "trailing no-default proviso", citation: null, excerpt: null }] }]), testCompilerInput());
    expect(rules[0]?.conditions.map((c) => c.conditionType)).toContain("NO_DEFAULT");
  });

  it("12: pro-forma ratio condition applying globally normalizes correctly with AS_OF", () => {
    const { rules } = normalizeSubmission(
      submission([
        {
          capacityExpression: {
            kind: "UNLIMITED_CAPACITY",
            gatedBy: { kind: "COMPARE", left: { kind: "AS_OF", operand: { kind: "METRIC_REFERENCE", metricName: "Leverage Ratio", valueType: "RATIO" }, asOfDate: "pro forma" }, operator: "LTE", right: { kind: "RATIO", value: 3.5 } },
          },
        },
      ]),
      testCompilerInput()
    );
    const gatedBy = (rules[0]?.capacityExpression as { gatedBy: { left: unknown } }).gatedBy;
    expect((gatedBy.left as { kind: string }).kind).toBe("AS_OF");
  });

  it("13: exception embedded in a proviso applies only to the specific rule it targets, never a sibling", () => {
    const sub = submission([
      { localRef: "a", capacityExpression: { kind: "MONEY", amount: 1 }, exceptions: [{ description: "carve-out for a", permissionRef: null, conditions: [], citation: null, excerpt: null }] },
      { localRef: "b", capacityExpression: { kind: "MONEY", amount: 2 } },
    ] as never);
    const { rules } = normalizeSubmission(sub, testCompilerInput());
    const ruleA = rules.find((r) => (r.capacityExpression as { amount: number })?.amount === 1)!;
    const ruleB = rules.find((r) => (r.capacityExpression as { amount: number })?.amount === 2)!;
    expect(ruleA.exceptions).toHaveLength(1);
    expect(ruleA.exceptions[0]?.appliesToRuleId).toBe(ruleA.ruleId);
    expect(ruleB.exceptions).toHaveLength(0);
  });

  it("14: nested boolean logic preserves grouping - A OR (B AND C) is NOT the same tree as (A OR B) AND C", () => {
    const bool = (b: boolean) => ({ kind: "BOOLEAN_LITERAL" as const, boolValue: b });
    const orInner = normalizeSubmission(submission([{ capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "OR", operands: [bool(true), { kind: "AND", operands: [bool(false), bool(true)] }] } } }]), testCompilerInput()).rules[0]!;
    const andOuter = normalizeSubmission(submission([{ capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "AND", operands: [{ kind: "OR", operands: [bool(true), bool(false)] }, bool(true)] } } }]), testCompilerInput()).rules[0]!;
    expect((orInner.capacityExpression as { gatedBy: { kind: string } }).gatedBy.kind).toBe("OR");
    expect((andOuter.capacityExpression as { gatedBy: { kind: string } }).gatedBy.kind).toBe("AND");
    // structurally distinct trees, not accidentally normalized to the same shape
    expect(JSON.stringify(orInner.capacityExpression)).not.toBe(JSON.stringify(andOuter.capacityExpression));
  });

  it("15: entity scope include/exclude normalize against the real EntityClassTag vocabulary, dropping unrecognized tags honestly", () => {
    const { rules } = normalizeSubmission(submission([{ entityScope: ["BORROWER", "not-a-real-tag"], entityScopeExcluded: ["FOREIGN_RS"] }]), testCompilerInput());
    expect(rules[0]?.entityScope).toEqual(["BORROWER"]);
    expect(rules[0]?.entityScopeExcluded).toEqual(["FOREIGN_RS"]);
  });

  it("16: rule dependency (dependsOn) resolves a localRef to a real, non-dangling ruleId", () => {
    const sub = submission([{ localRef: "a", capacityExpression: { kind: "MONEY", amount: 1 }, dependsOn: [{ relationshipType: "SHARES_CAPACITY_WITH", targetRef: "b", description: "shares cap with b" }] }, { localRef: "b", capacityExpression: { kind: "MONEY", amount: 2 } }] as never);
    const { rules } = normalizeSubmission(sub, testCompilerInput());
    const ruleA = rules.find((r) => r.dependsOn.length > 0)!;
    const ruleB = rules.find((r) => r.ruleId !== ruleA.ruleId)!;
    expect(ruleA.dependsOn[0]?.targetRuleId).toBe(ruleB.ruleId);
    const report = validateCompilationUnit({ irSchemaVersion: "test", companyId: "sem-test-co", instrumentKey: "sem-test-instrument", rules, definitions: [], sharedCapacities: [] });
    expect(report.issues.filter((i) => i.kind === "DANGLING_REFERENCE")).toEqual([]);
  });

  it("22: an invalid/unrecognized IR node kind normalizes to UNSUPPORTED, never a fabricated real node", () => {
    const { rules } = normalizeSubmission(submission([{ capacityExpression: { kind: "SPECIAL_BASKET_TYPE_12", amount: 5 } as never }]), testCompilerInput());
    expect(rules[0]?.capacityExpression?.kind).toBe("UNSUPPORTED");
  });

  it("24: a CONFLICTED operative lineage forces sufficiency to CONFLICTED even if the model claimed COMPLETE", () => {
    const input = testCompilerInput({ operativeLineage: { instrumentKey: "sem-test-instrument", provisionKey: "9.01", asOfDate: "2026-01-01", operativeStatus: "OPERATIVE_STATE_CONFLICTED", currentSourceDocumentId: "sem-test-doc" } });
    const { rules } = normalizeSubmission(submission([{ sufficiency: "COMPLETE", capacityExpression: { kind: "MONEY", amount: 1 } }]), input);
    expect(rules[0]?.sufficiency).toBe("CONFLICTED");
  });

  it("25: an UNSUPPORTED subexpression forces the rule below COMPLETE, never silently absorbed", () => {
    const { rules } = normalizeSubmission(submission([{ sufficiency: "COMPLETE", capacityExpression: { kind: "ADD", operands: [{ kind: "MONEY", amount: 1 }, { kind: "UNSUPPORTED", reason: "cannot represent this component" }] } }]), testCompilerInput());
    expect(rules[0]?.sufficiency).not.toBe("COMPLETE");
    expect(rules[0]?.sufficiency).toBe("PARTIAL");
  });
});
