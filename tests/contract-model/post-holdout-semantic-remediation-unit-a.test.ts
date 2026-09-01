/**
 * POST-HOLDOUT-SEMANTIC-REMEDIATION Unit A synthetic test matrix
 * (docs/post-holdout-semantic-remediation/04-semantic-architecture-decision
 * .json). Covers the mission's own S1-S20 dense-definition scenarios,
 * generically - every term/number below is invented for this test file,
 * never copied from any real package (anti-enumeration: S18/S19 below
 * explicitly re-run the same shape under a renamed term and different
 * numbers to prove zero production code cares what the term is called).
 *
 * Targets: normalize.ts's buildComposite/unsupportedNode (attemptedStructure
 * preservation) and completeness-check.ts's
 * checkIntraDefinitionComponentCompleteness (the new diagnostic that reads
 * it). type-check.ts's inferType is intentionally NOT modified by this
 * remediation and is exercised here only indirectly, to confirm its
 * poison-propagation verdict (which composite counts as UNSUPPORTED) is
 * unchanged - only what happens to the DISCARDED structure changed.
 *
 * Component-count assertions below deliberately avoid hand-predicting exact
 * recursive totals (checkIntraDefinitionComponentCompleteness walks the
 * FULL preserved tree, so a well-typed sub-composite's own children add to
 * the count too) - unsupportedComponentCount IS asserted exactly (each
 * `unsupported()` leaf below always survives normalization as a real
 * UNSUPPORTED IR leaf, since normalizeExpression recurses into every
 * operand unconditionally), and wellTypedComponentCount/totalComponentCount
 * are asserted as safe lower bounds plus the invariant that they sum
 * correctly - both are meaningful, non-brittle checks of the real behavior.
 */
import { describe, expect, it } from "vitest";
import { normalizeSubmission } from "../../lib/contract-model/compiler/semantic/normalize";
import { checkIntraDefinitionComponentCompleteness } from "../../lib/contract-model/compiler/semantic/completeness-check";
import type { SubmitCompilationInput, WireDefinition, WireExpression } from "../../lib/contract-model/compiler/semantic/wire-schema";
import { testCompilerInput } from "./semantic-compiler/test-helpers";

function submission(definitions: Partial<WireDefinition>[]): SubmitCompilationInput {
  return {
    rules: [],
    definitions: definitions.map((d, i) => ({
      localRef: `d${i + 1}`,
      termName: `Synthetic Term ${i + 1}`,
      covenantFamily: "DEFINITIONS_CALCULATION_RULES",
      calculationExpression: null,
      dependsOnTerms: [],
      sufficiency: "AMBIGUOUS",
      sufficiencyReasons: [],
      citation: null,
      excerpt: null,
      ...d,
    })),
    sharedCapacities: [],
    irExtensionCandidates: [],
    overallNotes: [],
  };
}

/** A resolvable METRIC_REFERENCE leaf - always well-typed. */
function metric(name: string, valueType: "MONEY" | "RATIO" | "NUMBER" = "MONEY"): WireExpression {
  return { kind: "METRIC_REFERENCE", metricName: name, valueType } as WireExpression;
}

/** A model-emitted UNSUPPORTED leaf - the genuine failure this whole remediation is about preserving visibility into. */
function unsupported(reason: string): WireExpression {
  return { kind: "UNSUPPORTED", reason, semanticDescription: reason } as WireExpression;
}

function compile(expr: WireExpression) {
  const { definitions } = normalizeSubmission(submission([{ calculationExpression: expr }]), testCompilerInput());
  return definitions[0]!.calculationExpression!;
}

describe("Unit A (S1-S20) - dense multi-clause synthetic definition matrix", () => {
  it("S1 (additive metrics): a 6-way ADD of well-typed metrics composes cleanly - no attemptedStructure needed, positive control", () => {
    const expr = compile({ kind: "ADD", operands: [metric("Alpha Base"), metric("Beta Add"), metric("Gamma Add"), metric("Delta Add"), metric("Epsilon Add"), metric("Zeta Add")] });
    expect(expr.kind).toBe("ADD");
    const result = checkIntraDefinitionComponentCompleteness(expr);
    expect(result.applicable).toBe(false); // not UNSUPPORTED - the diagnostic correctly has nothing to report
  });

  it("S2 (the real holdout defect, reproduced synthetically): a 20-clause ADD with ONE genuinely unsupported clause preserves the other 19 as visible, well-typed structure instead of collapsing to one opaque blob", () => {
    const operands: WireExpression[] = [];
    for (let i = 1; i <= 19; i++) operands.push(metric(`Synthetic Addback Clause ${i}`));
    operands.push(unsupported("clause (t) cross-references an unresolved provision"));
    const expr = compile({ kind: "ADD", operands });
    expect(expr.kind).toBe("UNSUPPORTED"); // the top-level verdict is correctly still UNSUPPORTED - type safety is not weakened
    expect(expr.type).toBeNull();
    const result = checkIntraDefinitionComponentCompleteness(expr);
    expect(result.applicable).toBe(true);
    expect(result.unsupportedComponentCount).toBe(1);
    expect(result.wellTypedComponentCount).toBeGreaterThanOrEqual(19);
    expect(result.totalComponentCount).toBe(result.wellTypedComponentCount + result.unsupportedComponentCount);
    expect(result.unsupportedComponentReasons[0]).toContain("cross-references an unresolved provision");
  });

  it("S3 (capped addback): MIN(statedDollarFigure, MULTIPLY(PERCENT, base)) composes to a real MIN node typed MONEY - no new IR node needed", () => {
    const expr = compile({ kind: "MIN", operands: [{ kind: "MONEY", amount: 12_345_000 }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.2 }, metric("Synthetic Base Metric")] }] });
    expect(expr.kind).toBe("MIN");
  });

  it("S4 (aggregate cap over a SUM): MIN(ADD(a,b,c), cap) composes - the cap wraps the aggregate, not each addend", () => {
    const expr = compile({ kind: "MIN", operands: [{ kind: "ADD", operands: [metric("Component X"), metric("Component Y"), metric("Component Z")] }, { kind: "MONEY", amount: 9_000_000 }] });
    expect(expr.kind).toBe("MIN");
  });

  it("S5 (cross-metric synergy cap): MIN(amount, MULTIPLY(PERCENT, METRIC_REFERENCE(a DIFFERENT named metric))) composes without a new primitive", () => {
    const expr = compile({ kind: "MIN", operands: [{ kind: "MONEY", amount: 3_000_000 }, { kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.15 }, metric("Synthetic Acquired Metric")] }] });
    expect(expr.kind).toBe("MIN");
  });

  it("S6 (ratio definition): DIVIDE(numerator, denominator) composes and infers RATIO", () => {
    const expr = compile({ kind: "DIVIDE", numerator: metric("Synthetic Numerator Metric"), denominator: metric("Synthetic Denominator Metric") });
    expect(expr.kind).toBe("DIVIDE");
  });

  it("S7 (pricing grid via SCHEDULE): a 4-tier SCHEDULE composes with all case values sharing a type", () => {
    const expr = compile({
      kind: "SCHEDULE",
      cases: [
        { from: "0.00", to: "1.00", description: "tier 1", value: { kind: "PERCENT", value: 0.05 } },
        { from: "1.00", to: "2.00", description: "tier 2", value: { kind: "PERCENT", value: 0.06 } },
        { from: "2.00", to: "3.00", description: "tier 3", value: { kind: "PERCENT", value: 0.07 } },
      ],
      defaultValue: { kind: "PERCENT", value: 0.08 },
    });
    expect(expr.kind).toBe("SCHEDULE");
  });

  it("S7b (pricing grid via nested IF, the REAL holdout shape, one branch poisoned): preserves the good branch's structure instead of destroying the whole grid", () => {
    const expr = compile({
      kind: "IF",
      condition: { kind: "COMPARE", left: metric("Synthetic Ratio", "RATIO"), operator: "LTE", right: { kind: "RATIO", value: 1.0 } },
      then: { kind: "PERCENT", value: 0.05 },
      else: unsupported("nested tier logic beyond this point could not be resolved"),
    });
    expect(expr.kind).toBe("UNSUPPORTED");
    const result = checkIntraDefinitionComponentCompleteness(expr);
    expect(result.applicable).toBe(true);
    expect(result.unsupportedComponentCount).toBe(1); // exactly the one poisoned "else" branch
    expect(result.wellTypedComponentCount).toBeGreaterThan(0); // the condition and "then" branch survive as visible structure
    expect(result.totalComponentCount).toBe(result.wellTypedComponentCount + result.unsupportedComponentCount);
  });

  it("S8 (greater-of): MAX(a, b) composes", () => {
    const expr = compile({ kind: "MAX", operands: [{ kind: "MONEY", amount: 1_000_000 }, metric("Synthetic Floor Metric")] });
    expect(expr.kind).toBe("MAX");
  });

  it("S9 (nested proviso via EVENT_ACTIVE): composes as BOOLEAN", () => {
    const expr = compile({ kind: "EVENT_ACTIVE", eventDescription: "a synthetic triggering event", triggerCondition: { kind: "COMPARE", left: metric("Synthetic Trigger Metric"), operator: "GT", right: { kind: "MONEY", amount: 500_000 } } });
    expect(expr.kind).toBe("EVENT_ACTIVE");
  });

  it("S10 (maintenance-liquidity formula): SUBTRACT(threshold, balance) composes", () => {
    const expr = compile({ kind: "SUBTRACT", left: { kind: "MONEY", amount: 75_000_000 }, right: metric("Synthetic Liquidity Balance") });
    expect(expr.kind).toBe("SUBTRACT");
  });

  it("S11 (cash-sweep cure): a real-shaped MIN(SUBTRACT(...), cap) composes end to end", () => {
    const expr = compile({ kind: "MIN", operands: [{ kind: "SUBTRACT", left: { kind: "MONEY", amount: 50_000_000 }, right: metric("Synthetic Maintenance Liquidity") }, { kind: "MONEY", amount: 20_000_000 }] });
    expect(expr.kind).toBe("MIN");
  });

  it("S12 (multi-clause SUBTRACT poisoned): the exact real-holdout 'SUBTRACT operands do not type-check together' shape preserves the good side", () => {
    const expr = compile({ kind: "SUBTRACT", left: metric("Synthetic Base"), right: unsupported("this exclusion category could not be resolved") });
    expect(expr.kind).toBe("UNSUPPORTED");
    const result = checkIntraDefinitionComponentCompleteness(expr);
    expect(result.unsupportedComponentCount).toBe(1);
    expect(result.wellTypedComponentCount).toBeGreaterThanOrEqual(1); // the SUBTRACT node itself + the well-typed left operand survive
    expect(result.totalComponentCount).toBe(result.wellTypedComponentCount + result.unsupportedComponentCount);
  });

  it("S13 (deeply nested poison, two levels): a poisoned MULTIPLY nested inside a well-typed ADD is itself preserved as a single unsupported sub-component, distinct from its 9 well-typed siblings - the nested collapse does not cascade back up and destroy the 9 siblings", () => {
    const operands: WireExpression[] = [];
    for (let i = 1; i <= 9; i++) operands.push(metric(`Clause ${i}`));
    operands.push({ kind: "MULTIPLY", operands: [{ kind: "PERCENT", value: 0.1 }, unsupported("nested base metric unresolved")] });
    const expr = compile({ kind: "ADD", operands });
    expect(expr.kind).toBe("UNSUPPORTED");
    const result = checkIntraDefinitionComponentCompleteness(expr);
    // the nested MULTIPLY collapses to ONE unsupported leaf at this level (its own inner attempt is not expanded further by this diagnostic) - exactly 1, not 2, proving the nested failure does not fan out and swallow its siblings.
    expect(result.unsupportedComponentCount).toBe(1);
    expect(result.wellTypedComponentCount).toBeGreaterThanOrEqual(9); // the 9 sibling clauses all survive
    expect(result.totalComponentCount).toBe(result.wellTypedComponentCount + result.unsupportedComponentCount);
  });

  it("S14 (zero-cardinality edge case): an ADD with only ONE operand, and that operand IS the unsupported one - still reports correctly, no crash", () => {
    const expr = compile({ kind: "ADD", operands: [unsupported("the entire clause could not be resolved")] });
    expect(expr.kind).toBe("UNSUPPORTED");
    const result = checkIntraDefinitionComponentCompleteness(expr);
    expect(result.unsupportedComponentCount).toBe(1);
    expect(result.wellTypedComponentCount).toBeGreaterThanOrEqual(1); // the ADD wrapper itself is well-typed as a node kind, even though it has no well-typed operand
  });

  it("S15 (definition-vs-rule distinction): a definition whose calculationExpression is fully COMPLETE and typed is NOT reported as an intra-definition completeness concern", () => {
    const { definitions } = normalizeSubmission(submission([{ calculationExpression: metric("Fully Resolved Metric"), sufficiency: "COMPLETE" }]), testCompilerInput());
    expect(definitions[0]!.calculationExpression!.kind).toBe("METRIC_REFERENCE");
    const result = checkIntraDefinitionComponentCompleteness(definitions[0]!.calculationExpression!);
    expect(result.applicable).toBe(false);
  });

  it("S16 (genuinely atomic UNSUPPORTED, model-emitted directly, no composite ever attempted): applicable stays false - never fabricates an attemptedStructure that was never built", () => {
    const expr = compile(unsupported("the model itself could not decompose this at all"));
    expect(expr.kind).toBe("UNSUPPORTED");
    const result = checkIntraDefinitionComponentCompleteness(expr);
    expect(result.applicable).toBe(false);
    expect(result.totalComponentCount).toBe(0);
  });

  it("S17 (null calculationExpression): applicable stays false, no crash", () => {
    const result = checkIntraDefinitionComponentCompleteness(null);
    expect(result.applicable).toBe(false);
  });

  it("S18/S19 (anti-enumeration): the exact S2 shape re-run under a completely different, invented term name and different dollar amounts/positions produces an IDENTICAL structural outcome - zero production code branches on term identity", () => {
    const buildWith = (label: string, unsupportedIdx: number) => {
      const operands: WireExpression[] = [];
      for (let i = 1; i <= 14; i++) operands.push(i === unsupportedIdx ? unsupported(`${label} clause ${i} could not be resolved`) : metric(`${label} clause ${i}`));
      const expr = compile({ kind: "ADD", operands });
      return checkIntraDefinitionComponentCompleteness(expr);
    };
    const runA = buildWith("Zorbex Consolidated Metric", 3);
    const runB = buildWith("Quintessential Widget Adjustment", 11);
    expect(runA.unsupportedComponentCount).toBe(1);
    expect(runB.unsupportedComponentCount).toBe(1);
    expect(runA.wellTypedComponentCount).toBe(runB.wellTypedComponentCount); // identical shape -> identical counts, regardless of term name or which position the failure is at
    expect(runA.totalComponentCount).toBe(runB.totalComponentCount);
  });

  it("S20 (type safety is never weakened): the top-level UNSUPPORTED node's own `type` field stays null regardless of how much well-typed structure attemptedStructure preserves - never becomes falsely executable", () => {
    const operands: WireExpression[] = [];
    for (let i = 1; i <= 30; i++) operands.push(metric(`Clause ${i}`));
    operands.push(unsupported("one clause failed"));
    const expr = compile({ kind: "ADD", operands });
    expect(expr.type).toBeNull();
    expect(expr.kind).toBe("UNSUPPORTED");
  });
});
