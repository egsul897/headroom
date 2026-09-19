/**
 * Phase 4A - anti-enumeration and metamorphic tests (mission §25-§26, §32).
 * One runtime code path handles every expression shape; only the IR data changes.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { metricInput } from "@/lib/contract-model/runtime/input-resolver";
import type { IRExpression } from "@/lib/contract-model/ir/types";
import { ADD, CMP, MAX, METRIC, MIN, MONEY, MUL, PCT, RATIO, SRC, SUB, m, metrics, resetIds, resolver } from "./helpers";

beforeEach(resetIds);

type Case = { label: string; expr: () => IRExpression; inputs: [string, string][]; expected: { type: string; amount?: string; value?: string | boolean } };

// The matrix: labels and metric names are DATA in the fixture, never read by the runtime.
const MATRIX: Case[] = [
  { label: "A. MAX($75m, 12.5% x metric-1)", expr: () => MAX(MONEY(75_000_000), MUL(PCT(0.125), METRIC("metric-1"))), inputs: [["metric-1", "800000000"]], expected: { type: "MONEY", amount: "100000000" } },
  { label: "B. MAX($50m, 7.5% x metric-2)", expr: () => MAX(MONEY(50_000_000), MUL(PCT(0.075), METRIC("metric-2"))), inputs: [["metric-2", "400000000"]], expected: { type: "MONEY", amount: "50000000" } },
  { label: "C. MIN($100m, 15% x metric-1)", expr: () => MIN(MONEY(100_000_000), MUL(PCT(0.15), METRIC("metric-1"))), inputs: [["metric-1", "800000000"]], expected: { type: "MONEY", amount: "100000000" } },
  { label: "D. $25m + 5% x metric-2", expr: () => ADD(MONEY(25_000_000), MUL(PCT(0.05), METRIC("metric-2"))), inputs: [["metric-2", "400000000"]], expected: { type: "MONEY", amount: "45000000" } },
  { label: "E. (10% x metric-1) - $5m", expr: () => SUB(MUL(PCT(0.1), METRIC("metric-1")), MONEY(5_000_000)), inputs: [["metric-1", "800000000"]], expected: { type: "MONEY", amount: "75000000" } },
  { label: "F. ratio comparison 2.5 >= 2.0", expr: () => CMP(RATIO(2.5), "GTE", RATIO(2)), inputs: [], expected: { type: "BOOLEAN", value: true } },
  { label: "G. same structure as A with every name and number changed", expr: () => MAX(MONEY(31_000_000, "GBP"), MUL(PCT(0.0625), METRIC("zeta-quantity"))), inputs: [["zeta-quantity", "1024000000"]], expected: { type: "MONEY", amount: "64000000" } },
];

describe("anti-enumeration matrix (§25)", () => {
  it.each(MATRIX.map((c) => [c.label, c] as const))("%s", (_l, c) => {
    const inputs = resolver({ metrics: c.inputs.map(([k, v]) => metricInput(k, m(v, c.label.startsWith("G") ? "GBP" : "USD"), SRC)) });
    const res = evaluateExpression({ expression: c.expr(), inputs });
    expect(res.status).toBe("EXECUTABLE");
    expect(res.value).toMatchObject(c.expected);
  });

  it("production runtime code contains no covenant-form or metric-name branching", () => {
    const files = ["version", "decimal", "types", "values", "units", "input-resolver", "evaluate-expression", "dependency-graph", "rule-evaluator", "index"].map((f) => readFileSync(`lib/contract-model/runtime/${f}.ts`, "utf8"));
    const src = files.join("\n").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    for (const forbidden of ["EBITDA", "Total Assets", "Restricted Payment", "GREATER_OF", "RATIO_DEBT", "FREE_AND_CLEAR", "GENERAL_DEBT", "AVAILABLE_AMOUNT", "PERMITTED_LIEN", "Chewy", "chwy", "6.01", "Incremental Amount", "Liens", "Investments"]) {
      expect(src.includes(forbidden), forbidden).toBe(false);
    }
  });
});

describe("metamorphic properties (§26)", () => {
  const withX = (v: string) => metrics(["x", m(v)]);
  it("ADD and MAX are commutative", () => {
    const a = evaluateExpression({ expression: ADD(MONEY(3), MUL(PCT(0.5), METRIC("x"))), inputs: withX("10") });
    const b = evaluateExpression({ expression: ADD(MUL(PCT(0.5), METRIC("x")), MONEY(3)), inputs: withX("10") });
    expect(a.value).toMatchObject({ amount: "8" });
    expect(b.value).toMatchObject({ amount: "8" });
    const c = evaluateExpression({ expression: MAX(MONEY(3), METRIC("x")), inputs: withX("10") });
    const d = evaluateExpression({ expression: MAX(METRIC("x"), MONEY(3)), inputs: withX("10") });
    expect(c.value).toMatchObject({ amount: "10" });
    expect(d.value).toMatchObject({ amount: "10" });
  });
  it("changing a literal 0.125 -> 0.075 changes the result data but not the execution topology", () => {
    const shape = (p: number) => MAX(MONEY(75_000_000), MUL(PCT(p), METRIC("x")));
    const a = evaluateExpression({ expression: shape(0.125), inputs: withX("800000000") });
    const b = evaluateExpression({ expression: shape(0.075), inputs: withX("800000000") });
    expect(a.value).toMatchObject({ amount: "100000000" });
    expect(b.value).toMatchObject({ amount: "75000000" });
    const topo = (r: typeof a) => JSON.stringify(r.trace, (k, v) => (k === "value" || k === "exprId" || k === "selected" || k === "input" || k === "lineage" ? undefined : v));
    expect(topo(a)).toBe(topo(b));
    expect(a.stats.nodesEvaluated).toBe(b.stats.nodesEvaluated);
  });
  it("renaming the metric key together with its input leaves the numeric result unchanged", () => {
    const a = evaluateExpression({ expression: MUL(PCT(0.125), METRIC("alpha")), inputs: metrics(["alpha", m("800000000")]) });
    const b = evaluateExpression({ expression: MUL(PCT(0.125), METRIC("omega")), inputs: metrics(["omega", m("800000000")]) });
    expect(a.value).toMatchObject({ amount: "100000000" });
    expect(b.value).toMatchObject({ amount: "100000000" });
  });
  it("unit-incompatible substitutions fail identically regardless of labels", () => {
    for (const label of ["alpha", "Some Named Amount", "zeta-quantity"]) {
      const res = evaluateExpression({ expression: ADD(MONEY(1), METRIC(label, "RATIO")), inputs: metrics([label, { type: "RATIO", value: { num: 2n, den: 1n }, lineage: { exprId: null, inputKeys: [] } }]) });
      expect(res.status).toBe("ERROR");
      expect(res.diagnostics.at(-1)!.code).toBe("UNIT_MISMATCH");
    }
  });
});

describe("determinism (§32)", () => {
  it("same IR + same inputs + same runtime version produce byte-identical semantic results across runs and fresh resolvers", () => {
    resetIds();
    const expr = MAX(MONEY(75_000_000), MUL(PCT(0.125), METRIC("x")));
    const run = () => JSON.stringify(evaluateExpression({ expression: expr, inputs: metrics(["x", m("800000000")]), context: { asOf: "2026-06-30" } }));
    const first = run();
    for (let i = 0; i < 5; i++) expect(run()).toBe(first);
    expect(first).not.toMatch(/"at":|timestamp|Date\(/);
    const missing = () => JSON.stringify(evaluateExpression({ expression: expr, inputs: metrics() }));
    expect(missing()).toBe(missing());
  });
});
