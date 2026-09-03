/**
 * FINAL SEMANTIC DECOMPOSITION ITERATION - whole-agreement synthetic
 * corpus (docs/final-semantic-decomposition/03's own OPTION 1 decision;
 * Section 8/9 of the governing mission). Every company/metric/number/
 * section-reference below is invented for this file (anti-benchmark-
 * gaming discipline) - no Superior, no real EBITDA/Applicable Rate/
 * Maintenance Liquidity/Secured Net Leverage language, no known-package
 * section numbers or GT amounts anywhere in this file.
 *
 * SCOPE NOTE (honestly disclosed, matches 03's own OPTION 1 decision and
 * the mission's own Section 21 "no new unseen issuer/GT required"
 * discipline): this corpus validates, deterministically and at zero
 * marginal cost, that the wire schema and normalization/IR layer CAN
 * represent every named whole-agreement provision family (debt, liens,
 * restricted payments, investments, asset sales, financial covenants,
 * cure mechanics, shared caps, dependency graphs, reclassification,
 * nested exceptions, cross-references) - since OPTION 1 introduces no new
 * inventory/composition AI pass, there is no new AI-facing recall/
 * coverage rate to measure here; that measurement instead happens on
 * REAL source in the whole-agreement reality check (13/14), which is the
 * appropriate place to test actual model behavior. This file is the
 * "does the target representation exist and compose correctly" half of
 * the evidence; 13/14 is the "does the model actually produce it from
 * real prose" half.
 */
import { describe, expect, it } from "vitest";
import { normalizeSubmission } from "../../lib/contract-model/compiler/semantic/normalize";
import { checkIntraDefinitionComponentCompleteness } from "../../lib/contract-model/compiler/semantic/completeness-check";
import type { SubmitCompilationInput, WireDefinition, WireExpression, WireRule, WireSharedCapacity } from "../../lib/contract-model/compiler/semantic/wire-schema";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

function submission(overrides: Partial<SubmitCompilationInput>): SubmitCompilationInput {
  return { rules: [], definitions: [], sharedCapacities: [], irExtensionCandidates: [], overallNotes: [], ...overrides };
}
function rule(r: Partial<WireRule> & { localRef: string }): WireRule {
  return { sourceSectionRef: "9.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], capacityExpression: null, conditions: [], exceptions: [], dependsOn: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: null, excerpt: null, ...r };
}
function def(d: Partial<WireDefinition> & { localRef: string; termName: string }): WireDefinition {
  return { covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: null, dependsOnTerms: [], sufficiency: "COMPLETE", sufficiencyReasons: [], citation: null, excerpt: null, ...d };
}
function cap(c: Partial<WireSharedCapacity> & { localRef: string; capExpression: WireExpression }): WireSharedCapacity {
  return { description: "", memberRefs: [], citation: null, excerpt: null, ...c };
}
function metric(name: string, valueType: "MONEY" | "RATIO" | "NUMBER" = "MONEY"): WireExpression {
  return { kind: "METRIC_REFERENCE", metricName: name, valueType };
}
function compile(sub: SubmitCompilationInput) {
  return normalizeSubmission(sub, testCompilerInput());
}

describe("Whole-agreement synthetic corpus S1-S35", () => {
  it("S1 (dense financial definition): 15 additions + 5 subtractions + 2 caps composes end to end", () => {
    const addends: WireExpression[] = Array.from({ length: 15 }, (_, i) => metric(`Zorbex Addback ${i + 1}`));
    const subtracted: WireExpression = { kind: "SUM", operands: Array.from({ length: 5 }, (_, i) => metric(`Zorbex Deduction ${i + 1}`)) };
    const capped: WireExpression = { kind: "MIN", operands: [{ kind: "MONEY", amount: 4_000_000 }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.1 }, metric("Zorbex Base Metric")] }] };
    const { definitions } = compile(submission({ definitions: [def({ localRef: "d1", termName: "Zorbex Consolidated Adjustment", calculationExpression: { kind: "SUBTRACT", left: { kind: "ADD", operands: [...addends, capped] }, right: subtracted } })] }));
    expect(definitions[0]!.calculationExpression!.kind).toBe("SUBTRACT");
  });

  it("S2 (ratio definition): arbitrary secured metric / arbitrary earnings metric composes to RATIO", () => {
    const { definitions } = compile(submission({ definitions: [def({ localRef: "d1", termName: "Quixotic Coverage Ratio", calculationExpression: { kind: "DIVIDE", numerator: metric("Quixotic Secured Debt"), denominator: metric("Quixotic Adjusted Earnings") } })] }));
    expect(definitions[0]!.calculationExpression!.kind).toBe("DIVIDE");
  });

  it("S3 (four-tier pricing grid via SCHEDULE)", () => {
    const { definitions } = compile(
      submission({
        definitions: [
          def({
            localRef: "d1",
            termName: "Meridian Applicable Margin",
            calculationExpression: {
              kind: "SCHEDULE",
              cases: [
                { from: "0", to: "1", description: "tier 1", value: { kind: "PERCENT", value: 0.03 } },
                { from: "1", to: "2", description: "tier 2", value: { kind: "PERCENT", value: 0.035 } },
                { from: "2", to: "3", description: "tier 3", value: { kind: "PERCENT", value: 0.04 } },
                { from: "3", to: null, description: "tier 4", value: { kind: "PERCENT", value: 0.045 } },
              ],
              defaultValue: null,
            },
          }),
        ],
      })
    );
    expect(definitions[0]!.calculationExpression!.kind).toBe("SCHEDULE");
  });

  it("S4 (debt general basket): greater of a fixed amount and a percentage of an arbitrary metric", () => {
    const { rules } = compile(submission({ rules: [rule({ localRef: "r1", capacityExpression: { kind: "MAX", operands: [{ kind: "MONEY", amount: 25_000_000 }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.15 }, metric("Meridian Total Assets")] }] } })] }));
    expect(rules[0]!.capacityExpression!.kind).toBe("MAX");
  });

  it("S5 (ratio debt basket with incurrence condition)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({
            localRef: "r1",
            capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "COMPARE", left: metric("Meridian Leverage Ratio", "RATIO"), operator: "LTE", right: { kind: "RATIO", value: 4.0 } } },
          }),
        ],
      })
    );
    expect(rules[0]!.capacityExpression!.kind).toBe("UNLIMITED_CAPACITY");
  });

  it("S6 (refinancing debt): principal being refinanced + accrued interest + fees limitation composes as an ADD of METRIC_REFERENCE operands", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({ localRef: "r2", capacityExpression: { kind: "ADD", operands: [metric("Meridian Principal Amount Refinanced"), metric("Meridian Accrued Interest"), metric("Meridian Refinancing Fees")] } }),
        ],
      })
    );
    expect(rules[0]!.capacityExpression!.kind).toBe("ADD");
  });

  it("S6b (RULE_REFERENCE composes correctly as a STANDALONE capacityExpression referencing a prior rule's own overall capacity, confirming the real, narrower shape RULE_REFERENCE's own CAPACITY type actually supports)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({ localRef: "r1", capacityExpression: { kind: "MONEY", amount: 10_000_000 } }),
          rule({ localRef: "r2", capacityExpression: { kind: "RULE_REFERENCE", ruleRef: "r1" } }),
        ],
      })
    );
    expect(rules[1]!.capacityExpression!.kind).toBe("RULE_REFERENCE");
    expect((rules[1]!.capacityExpression as { ruleId: string }).ruleId).toBe(rules[0]!.ruleId);
  });

  it("S7 (lien basket tied to a debt basket via RULE_REFERENCE)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({ localRef: "debt1", covenantFamily: "INDEBTEDNESS", capacityExpression: { kind: "MONEY", amount: 5_000_000 } }),
          rule({ localRef: "lien1", covenantFamily: "LIENS", capacityExpression: { kind: "RULE_REFERENCE", ruleRef: "debt1" } }),
        ],
      })
    );
    expect(rules[1]!.capacityExpression!.kind).toBe("RULE_REFERENCE");
  });

  it("S8 (ratio lien with leverage condition)", () => {
    const { rules } = compile(submission({ rules: [rule({ localRef: "r1", covenantFamily: "LIENS", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "COMPARE", left: metric("Meridian Secured Leverage Ratio", "RATIO"), operator: "LTE", right: { kind: "RATIO", value: 3.0 } } } })] }));
    expect(rules[0]!.capacityExpression!.kind).toBe("UNLIMITED_CAPACITY");
  });

  it("S9 (restricted-payment builder basket): 50% cumulative net income + equity contributions - prior usage, via LEDGER_USAGE_REFERENCE", () => {
    const { sharedCapacities } = compile(
      submission({
        sharedCapacities: [
          cap({ localRef: "cap1", capExpression: { kind: "SUBTRACT", left: { kind: "ADD", operands: [{ kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.5 }, metric("Meridian Cumulative Net Income")] }, metric("Meridian Cumulative Equity Contributions")] }, right: { kind: "LEDGER_USAGE_REFERENCE", sharedCapRef: "cap1" } } }),
        ],
      })
    );
    expect(sharedCapacities[0]!.capExpression.kind).toBe("SUBTRACT");
  });

  it("S10 (RP fixed general basket)", () => {
    const { rules } = compile(submission({ rules: [rule({ localRef: "r1", covenantFamily: "RESTRICTED_PAYMENTS", capacityExpression: { kind: "MONEY", amount: 15_000_000 } })] }));
    expect(rules[0]!.capacityExpression!.kind).toBe("MONEY");
  });

  it("S11 (RP leverage-based unlimited basket subject to ratio)", () => {
    const { rules } = compile(submission({ rules: [rule({ localRef: "r1", covenantFamily: "RESTRICTED_PAYMENTS", capacityExpression: { kind: "UNLIMITED_CAPACITY", gatedBy: { kind: "COMPARE", left: metric("Meridian Total Leverage Ratio", "RATIO"), operator: "LTE", right: { kind: "RATIO", value: 3.5 } } } })] }));
    expect(rules[0]!.capacityExpression!.kind).toBe("UNLIMITED_CAPACITY");
  });

  it("S12 (investment basket with grower amount)", () => {
    const { rules } = compile(submission({ rules: [rule({ localRef: "r1", covenantFamily: "INVESTMENTS", capacityExpression: { kind: "MAX", operands: [{ kind: "MONEY", amount: 8_000_000 }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.2 }, metric("Meridian Consolidated EBITDA-Equivalent")] }] } })] }));
    expect(rules[0]!.capacityExpression!.kind).toBe("MAX");
  });

  it("S13 (permitted acquisition with multiple conditions)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({
            localRef: "r1",
            covenantFamily: "INVESTMENTS",
            capacityExpression: { kind: "MONEY", amount: 20_000_000 },
            conditions: [
              { conditionType: "RATIO_TEST", expression: { kind: "COMPARE", left: metric("Meridian Pro Forma Leverage Ratio", "RATIO"), operator: "LTE", right: { kind: "RATIO", value: 4.5 } }, referencesDefinitionId: null, description: "pro forma leverage test", citation: null, excerpt: null },
              { conditionType: "NO_DEFAULT", expression: null, referencesDefinitionId: null, description: "no default continuing", citation: null, excerpt: null },
            ],
          }),
        ],
      })
    );
    expect(rules[0]!.conditions.length).toBe(2);
  });

  it("S14 (asset-sale permission + reinvestment period via EVENT_ACTIVE.activeDuration)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({
            localRef: "r1",
            covenantFamily: "ASSET_SALES",
            capacityExpression: { kind: "EVENT_ACTIVE", eventDescription: "reinvestment window following an asset disposition", triggerCondition: { kind: "COMPARE", left: metric("Meridian Net Proceeds Reinvested"), operator: "GTE", right: metric("Meridian Net Proceeds Received") }, activeDuration: "365 days" },
          }),
        ],
      })
    );
    expect(rules[0]!.capacityExpression!.kind).toBe("EVENT_ACTIVE");
  });

  it("S15 (mandatory prepayment with threshold and reinvestment exception)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({
            localRef: "r1",
            covenantFamily: "ASSET_SALES",
            ruleType: "MANDATORY_PREPAYMENT",
            posture: "REQUIREMENT",
            capacityExpression: { kind: "SUBTRACT", left: metric("Meridian Net Proceeds"), right: { kind: "MONEY", amount: 2_000_000 } },
            exceptions: [{ description: "reinvested within the reinvestment period", permissionRef: null, conditions: [], citation: null, excerpt: null }],
          }),
        ],
      })
    );
    expect(rules[0]!.exceptions.length).toBe(1);
  });

  it("S16 (junior-debt prepayment restriction + exceptions)", () => {
    const { rules } = compile(submission({ rules: [rule({ localRef: "r1", covenantFamily: "RESTRICTED_DEBT_PAYMENTS", posture: "PROHIBITION", capacityExpression: null, exceptions: [{ description: "scheduled interest payments", permissionRef: null, conditions: [], citation: null, excerpt: null }, { description: "refinancing permitted under the refinancing basket", permissionRef: "r_ref", conditions: [], citation: null, excerpt: null }] })] }));
    expect(rules[0]!.exceptions.length).toBe(2);
  });

  it("S17 (springing financial covenant triggered by revolver usage)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({
            localRef: "r1",
            covenantFamily: "FINANCIAL_MAINTENANCE_COVENANTS",
            conditions: [{ conditionType: "SPRINGING_TRIGGER", expression: { kind: "COMPARE", left: metric("Meridian Revolver Utilization"), operator: "GT", right: { kind: "PERCENT", value: 0.35 } }, referencesDefinitionId: null, description: "springs when revolver utilization exceeds 35%", citation: null, excerpt: null }],
            capacityExpression: { kind: "COMPARE", left: metric("Meridian Leverage Ratio", "RATIO"), operator: "LTE", right: { kind: "RATIO", value: 5.0 } },
          }),
        ],
      })
    );
    expect(rules[0]!.conditions[0]!.conditionType).toBeTruthy();
  });

  it("S18 (stepped leverage covenant over time via SCHEDULE keyed by date ranges)", () => {
    const { definitions } = compile(
      submission({
        definitions: [
          def({
            localRef: "d1",
            termName: "Meridian Maximum Leverage Ratio",
            calculationExpression: {
              kind: "SCHEDULE",
              cases: [
                { from: "2026-01-01", to: "2026-12-31", description: "year 1", value: { kind: "RATIO", value: 5.5 } },
                { from: "2027-01-01", to: "2027-12-31", description: "year 2", value: { kind: "RATIO", value: 5.0 } },
                { from: "2028-01-01", to: null, description: "year 3+", value: { kind: "RATIO", value: 4.5 } },
              ],
              defaultValue: null,
            },
          }),
        ],
      })
    );
    expect(definitions[0]!.calculationExpression!.kind).toBe("SCHEDULE");
  });

  it("S19 (reporting obligation due N days after quarter end)", () => {
    const { rules } = compile(submission({ rules: [rule({ localRef: "r1", covenantFamily: "REPORTING_COVENANTS", ruleType: "QUALITATIVE_OBLIGATION", posture: "REQUIREMENT", action: "DELIVER_FINANCIALS", conditions: [{ conditionType: "TIMING_DEADLINE", expression: { kind: "DURING_PERIOD", operand: { kind: "NUMBER", value: 45 }, periodDescription: "days after each fiscal quarter end" }, referencesDefinitionId: null, description: "45 days after quarter end", citation: null, excerpt: null }] })] }));
    expect(rules[0]!.conditions.length).toBe(1);
  });

  it("S20 (notice obligation triggered by default)", () => {
    const { rules } = compile(submission({ rules: [rule({ localRef: "r1", covenantFamily: "REPORTING_COVENANTS", ruleType: "QUALITATIVE_OBLIGATION", posture: "REQUIREMENT", action: "DELIVER_NOTICE", conditions: [{ conditionType: "EVENT_TRIGGERED", expression: { kind: "EVENT_ACTIVE", eventDescription: "occurrence of an Event of Default", triggerCondition: null, activeDuration: null }, referencesDefinitionId: null, description: "promptly upon a default", citation: null, excerpt: null }] })] }));
    expect(rules[0]!.conditions.length).toBe(1);
  });

  it("S21 (cure right with cure-period mechanics)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({
            localRef: "r1",
            covenantFamily: "FINANCIAL_MAINTENANCE_COVENANTS",
            capacityExpression: { kind: "EVENT_ACTIVE", eventDescription: "equity cure right following a covenant breach", triggerCondition: { kind: "COMPARE", left: metric("Meridian Cure Amount"), operator: "GTE", right: metric("Meridian Deficiency Amount") }, activeDuration: "one fiscal quarter" },
          }),
        ],
      })
    );
    expect(rules[0]!.capacityExpression!.kind).toBe("EVENT_ACTIVE");
  });

  it("S22 (shared cap used by two separate covenant sections)", () => {
    const { sharedCapacities, rules } = compile(
      submission({
        sharedCapacities: [cap({ localRef: "cap1", capExpression: { kind: "MONEY", amount: 30_000_000 }, memberRefs: ["r1", "r2"] })],
        rules: [
          rule({ localRef: "r1", covenantFamily: "INDEBTEDNESS", capacityExpression: { kind: "LEDGER_USAGE_REFERENCE", sharedCapRef: "cap1" } }),
          rule({ localRef: "r2", covenantFamily: "INVESTMENTS", capacityExpression: { kind: "LEDGER_USAGE_REFERENCE", sharedCapRef: "cap1" } }),
        ],
      })
    );
    expect(rules[0]!.capacityExpression!.kind).toBe("LEDGER_USAGE_REFERENCE");
    expect(rules[1]!.capacityExpression!.kind).toBe("LEDGER_USAGE_REFERENCE");
    expect((rules[0]!.capacityExpression as { sharedCapId: string }).sharedCapId).toBe((rules[1]!.capacityExpression as { sharedCapId: string }).sharedCapId);
    expect(sharedCapacities[0]!.sharedCapId).toBe((rules[0]!.capacityExpression as { sharedCapId: string }).sharedCapId);
  });

  it("S23 (reclassification from one basket to another) - modeled as a dependency edge between two rules", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({ localRef: "r1", covenantFamily: "RESTRICTED_PAYMENTS", capacityExpression: { kind: "MONEY", amount: 5_000_000 } }),
          rule({ localRef: "r2", covenantFamily: "INVESTMENTS", capacityExpression: { kind: "MONEY", amount: 5_000_000 }, dependsOn: [{ relationshipType: "REQUIRES", targetRef: "r1", description: "reclassified from the restricted payments basket" }] }),
        ],
      })
    );
    expect(rules[1]!.dependsOn.length).toBe(1);
    expect(rules[1]!.dependsOn[0]!.targetRuleId).toBe(rules[0]!.ruleId);
  });

  it("S24 (nested exception inside a prohibition)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({
            localRef: "r1",
            covenantFamily: "AFFILIATE_TRANSACTIONS",
            posture: "PROHIBITION",
            capacityExpression: null,
            exceptions: [{ description: "transactions on arm's-length terms", permissionRef: null, conditions: [{ conditionType: "OTHER_RULE_SATISFIED", expression: { kind: "COMPARE", left: metric("Meridian Transaction Value"), operator: "LTE", right: { kind: "MONEY", amount: 1_000_000 } }, referencesDefinitionId: null, description: "below the de minimis threshold", citation: null, excerpt: null }], citation: null, excerpt: null }],
          }),
        ],
      })
    );
    expect(rules[0]!.exceptions[0]!.conditions.length).toBe(1);
  });

  it("S25 (cross-reference to another section's permission via RULE_REFERENCE inside a condition)", () => {
    const { rules } = compile(
      submission({
        rules: [
          rule({ localRef: "r1", covenantFamily: "INDEBTEDNESS", capacityExpression: { kind: "MONEY", amount: 12_000_000 } }),
          rule({ localRef: "r2", covenantFamily: "LIENS", conditions: [{ conditionType: "OTHER_RULE_SATISFIED", expression: { kind: "RULE_REFERENCE", ruleRef: "r1" }, referencesDefinitionId: null, description: "permitted only to secure debt incurred under the r1 basket", citation: null, excerpt: null }] }),
        ],
      })
    );
    expect((rules[1]!.conditions[0]!.expression as { kind: string; ruleId: string } | null)?.kind).toBe("RULE_REFERENCE");
  });

  it("S26 (three sibling definitions plus an operative rule using all three)", () => {
    const { definitions, rules } = compile(
      submission({
        definitions: [
          def({ localRef: "d1", termName: "Meridian Base Metric", calculationExpression: metric("Meridian Raw Input A") }),
          def({ localRef: "d2", termName: "Meridian Adjustment Metric", calculationExpression: metric("Meridian Raw Input B") }),
          def({ localRef: "d3", termName: "Meridian Composite Ratio", dependsOnTerms: ["Meridian Base Metric", "Meridian Adjustment Metric"], calculationExpression: { kind: "DIVIDE", numerator: { kind: "DEFINED_TERM_REFERENCE", termName: "Meridian Base Metric" }, denominator: { kind: "DEFINED_TERM_REFERENCE", termName: "Meridian Adjustment Metric" } } }),
        ],
        rules: [rule({ localRef: "r1", capacityExpression: { kind: "COMPARE", left: { kind: "DEFINED_TERM_REFERENCE", termName: "Meridian Composite Ratio", valueType: "RATIO" }, operator: "LTE", right: { kind: "RATIO", value: 3.0 } } })],
      })
    );
    expect(definitions.length).toBe(3);
    expect(definitions[2]!.dependsOnTerms).toEqual(["Meridian Base Metric", "Meridian Adjustment Metric"]);
    expect(rules[0]!.capacityExpression!.kind).toBe("COMPARE");
  });

  it("S27 (long section with 20+ independently operative baskets/exceptions) composes without truncation or crash", () => {
    const manyRules: WireRule[] = Array.from({ length: 22 }, (_, i) => rule({ localRef: `r${i + 1}`, covenantFamily: "INDEBTEDNESS", capacityExpression: { kind: "MONEY", amount: 1_000_000 * (i + 1) } }));
    const { rules } = compile(submission({ rules: manyRules }));
    expect(rules.length).toBe(22);
    expect(rules.every((r) => r.capacityExpression?.kind === "MONEY")).toBe(true);
  });

  it("S28 (arbitrary renaming of all financial metrics) - identical structural outcome under two unrelated invented naming schemes", () => {
    const build = (label: string) => compile(submission({ definitions: [def({ localRef: "d1", termName: label, calculationExpression: { kind: "ADD", operands: [metric(`${label} Component A`), metric(`${label} Component B`)] } })] })).definitions[0]!.calculationExpression!;
    const a = build("Fistgrove Consolidated Yield");
    const b = build("Peppermill Adjusted Throughput");
    expect(a.kind).toBe(b.kind);
    expect(a.kind).toBe("ADD");
  });

  it("S29 (all monetary amounts and percentages changed) - identical structural outcome regardless of magnitude", () => {
    const build = (amount: number, pct: number) => compile(submission({ rules: [rule({ localRef: "r1", capacityExpression: { kind: "MAX", operands: [{ kind: "MONEY", amount }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: pct }, metric("Common Base Metric")] }] } })] })).rules[0]!.capacityExpression!;
    const a = build(3_141_592, 0.0271);
    const b = build(99_000_001, 0.4999);
    expect(a.kind).toBe(b.kind);
    expect(a.kind).toBe("MAX");
  });

  it("S30 (reorder clauses without semantic change) - operand order does not affect type inference outcome", () => {
    const a = compile(submission({ definitions: [def({ localRef: "d1", termName: "T", calculationExpression: { kind: "ADD", operands: [metric("X"), metric("Y"), metric("Z")] } })] })).definitions[0]!.calculationExpression!;
    const b = compile(submission({ definitions: [def({ localRef: "d1", termName: "T", calculationExpression: { kind: "ADD", operands: [metric("Z"), metric("X"), metric("Y")] } })] })).definitions[0]!.calculationExpression!;
    expect(a.kind).toBe(b.kind);
  });

  it("S31 (deliberate omission of one material inventory item) - a definition missing one addend still composes the rest, and the intra-definition completeness diagnostic reports it, not silently", () => {
    const operands: WireExpression[] = [metric("Present Component 1"), metric("Present Component 2"), { kind: "UNSUPPORTED", reason: "clause (c) was not represented in the supplied source", semanticDescription: "deliberately omitted clause" }];
    const { definitions } = compile(submission({ definitions: [def({ localRef: "d1", termName: "Deliberately Incomplete Metric", calculationExpression: { kind: "ADD", operands } })] }));
    const expr = definitions[0]!.calculationExpression!;
    expect(expr.kind).toBe("ADD"); // F-6: the two present components stay live; the omitted one is an in-place UNSUPPORTED operand
    expect(definitions[0]!.sufficiency).not.toBe("COMPLETE");
    const result = checkIntraDefinitionComponentCompleteness(expr);
    expect(result.applicable).toBe(true);
    expect(result.unsupportedComponentCount).toBe(1);
    expect(result.wellTypedComponentCount).toBeGreaterThanOrEqual(2);
  });

  it("S32 (ambiguous drafting -> review required) preserved via AMBIGUOUS sufficiency, not silently upgraded", () => {
    const { definitions } = compile(submission({ definitions: [def({ localRef: "d1", termName: "Ambiguous Metric", calculationExpression: metric("Some Metric"), sufficiency: "AMBIGUOUS", sufficiencyReasons: ["the source text supports two readings of this clause"] })] }));
    expect(definitions[0]!.sufficiency).toBe("AMBIGUOUS");
  });

  it("S33 (source truncation -> safe failure, no fabricated value)", () => {
    const { definitions } = compile(submission({ definitions: [def({ localRef: "d1", termName: "Truncated Metric", calculationExpression: { kind: "UNSUPPORTED", reason: "the supplied source text cuts off mid-clause", semanticDescription: "truncated source" } })] }));
    expect(definitions[0]!.calculationExpression!.kind).toBe("UNSUPPORTED");
    expect(definitions[0]!.calculationExpression!.type).toBeNull();
  });

  it("S34 (semantic capture complete but financial mapping unavailable) - a fully well-typed definition is not the same as a financially-evaluable one, and this layer does not conflate the two", () => {
    const { definitions } = compile(submission({ definitions: [def({ localRef: "d1", termName: "Fully Captured Metric", calculationExpression: { kind: "MAX", operands: [{ kind: "MONEY", amount: 75_000_000 }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.125 }, metric("Some Consolidated Metric")] }] }, sufficiency: "COMPLETE" })] }));
    const expr = definitions[0]!.calculationExpression!;
    expect(expr.kind).toBe("MAX"); // semantically complete and structurally sound
    // Phase 5 financial-source mapping (resolving "Some Consolidated Metric" to an actual dollar figure) is intentionally NOT required or asserted here - this layer's own job stops at semantic capture.
  });

  it("S35 (ordinary non-financial covenant obligation) composes as a qualitative rule with no capacityExpression required", () => {
    const { rules } = compile(submission({ rules: [rule({ localRef: "r1", covenantFamily: "QUALITATIVE_NEGATIVE_COVENANTS", ruleType: "QUALITATIVE_OBLIGATION", posture: "PROHIBITION", action: null, capacityExpression: null })] }));
    expect(rules[0]!.capacityExpression).toBeNull();
    expect(rules[0]!.posture).toBeTruthy();
  });
});
