/**
 * Phase 4A - actual Phase-3 compositional IR consumed by the runtime (mission §27).
 * Read-only frozen fixtures: a small number of expressions from the frozen unseen-package compile result
 * (selected by SHAPE, located by rule id in the test only) plus the hand-authored real-shape IR fixtures.
 * No provider calls; the runtime code path is the same generic evaluator.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { IRRule } from "@/lib/contract-model/ir/types";
import { FIXTURE_1_FIXED_DEBT_BASKET, FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT, FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO, FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE } from "../../fixtures/ir-examples/real-covenant-shapes";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { evaluateRule } from "@/lib/contract-model/runtime/rule-evaluator";
import { buildDependencyGraph } from "@/lib/contract-model/runtime/dependency-graph";
import { EMPTY_RESOLVER, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { SRC, m, r, resolver } from "./helpers";

const FROZEN = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json";
const frozen = JSON.parse(readFileSync(FROZEN, "utf8")) as { rules: IRRule[] };
const byShape = (pred: (r: IRRule) => boolean) => frozen.rules.filter(pred);
const capKind = (r: IRRule) => r.capacityExpression?.kind ?? null;

/** Metric names are read from the fixture itself at test time - the runtime never sees them as code. */
function metricNamesIn(expr: unknown): string[] {
  const out: string[] = [];
  const walk = (n: unknown) => { if (!n || typeof n !== "object") return; const o = n as Record<string, unknown>; if (o.kind === "METRIC_REFERENCE" && typeof o.metricName === "string" && !out.includes(o.metricName)) out.push(o.metricName); for (const v of Object.values(o)) if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v); };
  walk(expr);
  return out;
}

describe("frozen unseen-package IR (selected by shape)", () => {
  const percentOfMetric = byShape((x) => capKind(x) === "MAX" && (x.capacityExpression as { operands: { kind: string }[] }).operands.some((o) => o.kind === "MULTIPLY") && x.sufficiency === "COMPLETE")[0]!;
  const ratioTyped = (gate: unknown) => { const types: string[] = []; const walk = (n: unknown) => { if (!n || typeof n !== "object") return; const o = n as Record<string, unknown>; if (o.kind === "METRIC_REFERENCE") types.push(String(o.type)); for (const v of Object.values(o)) if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v); }; walk(gate); return types.length > 0 && types.every((t) => t === "RATIO"); };
  const unlimitedRatioGate = byShape((x) => capKind(x) === "UNLIMITED_CAPACITY" && (x.capacityExpression as { gatedBy: unknown }).gatedBy !== null && (x.capacityExpression as { gatedBy: { kind: string } }).gatedBy.kind === "COMPARE" && ratioTyped((x.capacityExpression as { gatedBy: unknown }).gatedBy) && x.sufficiency === "COMPLETE")[0]!;
  const partialWithUnsupported = byShape((x) => capKind(x) === "SUM" && JSON.stringify(x.capacityExpression).includes('"UNSUPPORTED"'))[0]!;
  const bareUnsupported = byShape((x) => capKind(x) === "UNSUPPORTED")[0]!;
  const termOnly = byShape((x) => capKind(x) === "DEFINED_TERM_REFERENCE" && x.sufficiency === "COMPLETE")[0]!;

  it("a MAX(fixed, percent x metric) capacity needs its metric, then executes exactly, with legal provenance carried", () => {
    const names = metricNamesIn(percentOfMetric.capacityExpression);
    expect(names.length).toBe(1);
    const missing = evaluateExpression({ expression: percentOfMetric.capacityExpression!, inputs: EMPTY_RESOLVER, context: { ruleId: percentOfMetric.ruleId } });
    expect(missing.status).toBe("NEEDS_INPUT");
    expect(missing.missingInputKeys).toEqual(names);
    expect(missing.bounds?.knownLowerBound).toMatchObject({ type: "MONEY" });
    const ok = evaluateExpression({ expression: percentOfMetric.capacityExpression!, inputs: resolver({ metrics: [metricInput(names[0]!, m("2000000000"), SRC)] }), context: { ruleId: percentOfMetric.ruleId } });
    expect(ok.status).toBe("EXECUTABLE");
    expect(ok.value!.type).toBe("MONEY");
    expect(ok.provenance.sourceCitations.length).toBeGreaterThan(0);
    expect(ok.provenance.sourceCitations[0]).toBe(percentOfMetric.sourceSectionRef);
    expect(ok.trace.selected).not.toBeNull();
    expect(JSON.stringify(ok)).toBe(JSON.stringify(evaluateExpression({ expression: percentOfMetric.capacityExpression!, inputs: resolver({ metrics: [metricInput(names[0]!, m("2000000000"), SRC)] }), context: { ruleId: percentOfMetric.ruleId } })));
  });

  it("an UNLIMITED capacity gated by a ratio test under a period needs the ratio metric for that verbatim period, then decides the gate", () => {
    const names = metricNamesIn(unlimitedRatioGate.capacityExpression);
    const missing = evaluateExpression({ expression: unlimitedRatioGate.capacityExpression!, inputs: EMPTY_RESOLVER });
    expect(missing.status).toBe("NEEDS_INPUT");
    expect(missing.missingInputs.every((mi) => mi.kind === "METRIC")).toBe(true);
    // supply every metric the gate names, for any period/as-of, as a ratio that satisfies "<= threshold"
    const inputs = resolver({ metrics: names.map((n) => metricInput(n, r("1"), SRC)) });
    const decided = evaluateExpression({ expression: unlimitedRatioGate.capacityExpression!, inputs });
    expect(decided.status).toBe("EXECUTABLE");
    expect(decided.value).toMatchObject({ type: "CAPACITY", capacity: { kind: "UNLIMITED", gate: "SATISFIED" } });
    // the first-encountered metric is the tested ratio (left of the comparison); push it far above the others
    const failed = evaluateExpression({ expression: unlimitedRatioGate.capacityExpression!, inputs: resolver({ metrics: names.map((n, i) => metricInput(n, r(i === 0 ? "99" : "1"), SRC)) }) });
    expect(failed.value).toMatchObject({ capacity: { kind: "GATE_NOT_SATISFIED" } });
  });

  it("a PARTIAL rule whose composition carries an UNSUPPORTED operand stays UNSUPPORTED with the Phase-3 reason - never a number", () => {
    const names = metricNamesIn(partialWithUnsupported.capacityExpression);
    const res = evaluateExpression({ expression: partialWithUnsupported.capacityExpression!, inputs: resolver({ metrics: names.map((n) => metricInput(n, m("1000000"), SRC)) }) });
    expect(res.status).toBe("UNSUPPORTED");
    expect(res.value).toBeNull();
    expect(res.diagnostics.some((d) => d.code === "UNSUPPORTED_NODE" && typeof d.phase3Reason === "string" && d.phase3Reason.length > 0)).toBe(true);
    const bare = evaluateExpression({ expression: bareUnsupported.capacityExpression!, inputs: EMPTY_RESOLVER });
    expect(bare.status).toBe("UNSUPPORTED");
  });

  it("a capacity that is a bare defined-term reference needs the term (no definition in scope) and the dependency graph says so", () => {
    const res = evaluateExpression({ expression: termOnly.capacityExpression!, inputs: EMPTY_RESOLVER });
    expect(res.status).toBe("NEEDS_INPUT");
    expect(res.missingInputs[0]!.kind).toBe("TERM");
    const g = buildDependencyGraph(termOnly.capacityExpression!, EMPTY_RESOLVER);
    expect(g.dependencyTrace[0]!.kind).toBe("TERM");
    expect(g.cycles).toEqual([]);
  });

  it("the rule shell respects the Phase-3 entity-scope audit and never decides permission", () => {
    const guarded = frozen.rules.filter((x) => x.entityScopeAudit).length;
    expect(guarded).toBe(0); // the frozen fixture predates the guard: unaudited scope must be reported as such
    const shell = evaluateRule(percentOfMetric, EMPTY_RESOLVER);
    expect(shell.entityScope.applicability).toBe("SCOPE_UNAUDITED");
    expect(shell.permissionDecision).toBe("NOT_COMPUTED_IN_PHASE_4A");
    expect(shell.reclassification.status).toBe("NOT_IMPLEMENTED_IN_PHASE_4A");
    expect(shell.solveForX.status).toBe("NOT_IMPLEMENTED_IN_PHASE_4A");
    const ambiguous = frozen.rules.find((x) => x.sufficiency === "AMBIGUOUS")!;
    const blocked = evaluateRule(ambiguous, EMPTY_RESOLVER);
    expect(blocked.status).toBe("AMBIGUOUS");
    expect(blocked.capacity).toBeNull();
    const audited = { ...percentOfMetric, entityScope: ["BORROWER" as const], entityScopeAudit: { guardVersion: "t", status: "UNWITNESSED" as const, safeToRely: false, reasonCodes: ["ENTITY_SCOPE_UNWITNESSED" as const], rawEmitted: { entityScope: null, entityScopeExcluded: null, source: "NOT_PERSISTED" as const }, tagNormalization: [], before: { entityScope: [], entityScopeExcluded: [], sufficiency: "COMPLETE" as const }, witness: { ownExcerpt: null, citedUnitLeadIn: null, decidedBy: "NONE" as const, signals: [] } } };
    expect(evaluateRule(audited, EMPTY_RESOLVER).entityScope.applicability).toBe("SCOPE_NOT_SAFE_TO_RELY_ON");
  });
});

describe("hand-authored real-shape IR fixtures", () => {
  it("fixed basket, greater-of composition, maintenance ratio and stepped schedule all evaluate through the same runtime", () => {
    const fixed = evaluateExpression({ expression: FIXTURE_1_FIXED_DEBT_BASKET.capacityExpression!, inputs: EMPTY_RESOLVER });
    expect(fixed.status).toBe("EXECUTABLE");
    expect(fixed.value!.type).toBe("MONEY");

    const names3 = metricNamesIn(FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT.capacityExpression);
    const greater = evaluateExpression({ expression: FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT.capacityExpression!, inputs: resolver({ metrics: names3.map((n) => metricInput(n, m("1000000000"), SRC)) }) });
    expect(greater.status).toBe("EXECUTABLE");
    expect(greater.trace.selected).not.toBeNull();

    const gate5 = (FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO.capacityExpression as { gatedBy: NonNullable<IRRule["capacityExpression"]> }).gatedBy;
    const names5 = metricNamesIn(gate5);
    const ratio = evaluateExpression({ expression: gate5, inputs: resolver({ metrics: names5.map((n) => metricInput(n, r("3"), SRC)) }) });
    expect(ratio.status).toBe("EXECUTABLE");
    expect(ratio.value!.type).toBe("BOOLEAN");
    const maintenance = evaluateExpression({ expression: FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO.capacityExpression!, inputs: resolver({ metrics: names5.map((n) => metricInput(n, r("3"), SRC)) }) });
    expect(maintenance.value!.type).toBe("CAPACITY");

    const gate7 = (FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE.capacityExpression as { gatedBy: NonNullable<IRRule["capacityExpression"]> }).gatedBy;
    const names7 = metricNamesIn(gate7);
    const noDate = evaluateExpression({ expression: gate7, inputs: resolver({ metrics: names7.map((n) => metricInput(n, r("3"), SRC)) }) });
    expect(noDate.status).toBe("NEEDS_INPUT");
    expect(noDate.missingInputs.some((mi) => mi.kind === "AS_OF_DATE")).toBe(true);
    const dated = evaluateExpression({ expression: gate7, inputs: resolver({ metrics: names7.map((n) => metricInput(n, r("3"), SRC)) }), context: { asOf: "2030-01-01" } });
    expect(["EXECUTABLE", "UNSUPPORTED"]).toContain(dated.status);
  });
});
