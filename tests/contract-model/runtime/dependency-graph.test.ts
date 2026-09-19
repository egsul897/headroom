/** Phase 4A - dependency graph, topological order, memoization, direct and indirect cycle detection. */
import { beforeEach, describe, expect, it } from "vitest";
import { buildDependencyGraph } from "@/lib/contract-model/runtime/dependency-graph";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { EMPTY_RESOLVER } from "@/lib/contract-model/runtime/input-resolver";
import { ADD, MAX, METRIC, MONEY, MUL, PCT, RULEREF, TERM, definition, resetIds, resolver, rule } from "./helpers";

beforeEach(resetIds);

describe("dependency graph", () => {
  it("builds nodes and edges for an expression and its runtime inputs, with a deterministic topological order", () => {
    const expr = MAX(MONEY(75_000_000), MUL(PCT(0.125), METRIC("Metric A")));
    const g = buildDependencyGraph(expr, EMPTY_RESOLVER);
    expect(g.cycles).toEqual([]);
    expect(g.nodes.map((n) => n.kind)).toEqual(["EXPRESSION", "EXPRESSION", "EXPRESSION", "EXPRESSION", "EXPRESSION", "METRIC"]);
    expect(g.dependencyTrace).toEqual([{ kind: "METRIC", key: "Metric A" }]);
    // dependencies before dependents: the metric input precedes its reference, which precedes MULTIPLY, which precedes MAX
    const pos = (id: string) => g.topologicalOrder.indexOf(id);
    expect(pos("metric:Metric A")).toBeLessThan(pos(expr.exprId!));
    expect(g.topologicalOrder.at(-1)).toBe(expr.exprId);
    expect(g.edges).toContainEqual({ from: expr.exprId!, to: (expr as { operands: { exprId: string }[] }).operands[1]!.exprId });
    expect(buildDependencyGraph(expr, EMPTY_RESOLVER)).toEqual(g);
  });

  it("expands definitions and rules through the resolver and records them as graph nodes", () => {
    const def = definition("ir-definition:d", "Term D", MUL(PCT(0.5), METRIC("X")));
    const r = rule("ir-rule:r", ADD(MONEY(1), TERM("Term D")));
    const expr = ADD(RULEREF("ir-rule:r"), TERM("Term D"));
    const g = buildDependencyGraph(expr, resolver({ definitions: [def], rules: [r] }));
    expect(g.cycles).toEqual([]);
    expect(g.nodes.filter((n) => n.kind === "DEFINITION").map((n) => n.id)).toEqual(["definition:ir-definition:d"]);
    expect(g.nodes.filter((n) => n.kind === "RULE").map((n) => n.id)).toEqual(["rule:ir-rule:r"]);
    expect(g.dependencyTrace).toEqual([{ kind: "METRIC", key: "X" }]);
  });

  it("detects a direct cycle (definition referencing itself) and does not produce an order", () => {
    const def = definition("ir-definition:self", "Self", ADD(MONEY(1), TERM("Self")));
    const g = buildDependencyGraph(TERM("Self"), resolver({ definitions: [def] }));
    expect(g.cycles.length).toBe(1);
    expect(g.cycles[0]!.nodes[0]).toBe("definition:ir-definition:self");
    expect(g.cycles[0]!.nodes.at(-1)).toBe("definition:ir-definition:self");
    expect(g.cycles[0]!.edgePath.length).toBe(g.cycles[0]!.nodes.length - 1);
    expect(g.cycles[0]!.provenance[0]).toMatchObject({ sourceCitation: "def Self" });
    expect(g.topologicalOrder).toEqual([]);
  });

  it("detects an indirect cycle through a rule and a definition", () => {
    const def = definition("ir-definition:a", "Term A", RULEREF("ir-rule:b"));
    const r = rule("ir-rule:b", ADD(MONEY(1), TERM("Term A")));
    const g = buildDependencyGraph(TERM("Term A"), resolver({ definitions: [def], rules: [r] }));
    expect(g.cycles.length).toBe(1);
    expect(g.cycles[0]!.nodes).toContain("definition:ir-definition:a");
    expect(g.cycles[0]!.nodes).toContain("rule:ir-rule:b");
  });
});

describe("cycles at evaluation time fail loudly (§15)", () => {
  it("direct cycle -> ERROR with the cycle path; never zero, never infinite recursion", () => {
    const def = definition("ir-definition:self", "Self", ADD(MONEY(1), TERM("Self")));
    const res = evaluateExpression({ expression: TERM("Self"), inputs: resolver({ definitions: [def] }) });
    expect(res.status).toBe("ERROR");
    expect(res.value).toBeNull();
    const cyc = res.diagnostics.find((d) => d.code === "CYCLE")!;
    expect(cyc.message).toContain("definition:ir-definition:self -> definition:ir-definition:self");
  });
  it("indirect cycle rule -> definition -> rule", () => {
    const def = definition("ir-definition:a", "Term A", RULEREF("ir-rule:b"));
    const r = rule("ir-rule:b", ADD(MONEY(1), TERM("Term A")));
    const res = evaluateExpression({ expression: RULEREF("ir-rule:b"), inputs: resolver({ definitions: [def], rules: [r] }) });
    expect(res.status).toBe("ERROR");
    expect(res.diagnostics.find((d) => d.code === "CYCLE")!.message).toContain("rule:ir-rule:b -> definition:ir-definition:a -> rule:ir-rule:b");
  });
  it("a shared (non-cyclic) definition used twice is evaluated once and memoized", () => {
    const def = definition("ir-definition:d", "Term D", MUL(PCT(0.5), METRIC("X")));
    const t = TERM("Term D");
    const res = evaluateExpression({ expression: ADD(t, t), inputs: resolver({ definitions: [def] }) });
    expect(res.status).toBe("NEEDS_INPUT");
    expect(res.stats.cacheHits).toBe(1);
  });
});
