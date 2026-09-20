/**
 * Phase 4A - deterministic expression runtime: literals, arithmetic, unit algebra, comparisons, booleans,
 * conditions, missing inputs, unsupported operands, ambiguity propagation, provenance, traces, temporal
 * operators, error totality.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { EMPTY_RESOLVER, metricInput } from "@/lib/contract-model/runtime/input-resolver";
import { CONTRACT_RUNTIME_VERSION } from "@/lib/contract-model/runtime/version";
import type { IRExpression } from "@/lib/contract-model/ir/types";
import { ADD, AND, ASOF, BOOL, CMP, DATE, DIV, DURING, EVENT, IF, LEDGER, MAX, METRIC, MIN, MONEY, MUL, NOT, NUM, OR, PCT, RATIO, RULEREF, SCHEDULE, SRC, SUB, SUM, TERM, TX, UNSUP, b, definition, m, metrics, n, prov, r, resetIds, resolver, rule } from "./helpers";

const ev = (expression: IRExpression, inputs = EMPTY_RESOLVER, context = {}) => evaluateExpression({ expression, inputs, context });
const val = (res: ReturnType<typeof ev>) => (res.value as { amount?: string; value?: string; fraction?: string; isoDate?: string } | null);

beforeEach(resetIds);

describe("literals", () => {
  it("evaluates every literal kind to a typed value with raw source lineage", () => {
    expect(ev(MONEY(75_000_000)).value).toMatchObject({ type: "MONEY", amount: "75000000", currency: "USD", lineage: { rawSource: 75_000_000 } });
    expect(ev(NUM(2.5)).value).toMatchObject({ type: "NUMBER", value: "2.5" });
    expect(ev(PCT(0.125)).value).toMatchObject({ type: "PERCENT", fraction: "0.125" });
    expect(ev(RATIO(2.5)).value).toMatchObject({ type: "RATIO", value: "2.5" });
    expect(ev(BOOL(true)).value).toMatchObject({ type: "BOOLEAN", value: true });
    expect(ev(DATE("2026-09-19")).value).toMatchObject({ type: "DATE", isoDate: "2026-09-19" });
    expect(ev(MONEY(1)).runtimeVersion).toBe(CONTRACT_RUNTIME_VERSION);
    expect(ev(MONEY(1)).status).toBe("EXECUTABLE");
  });
  it("a malformed date literal is a structured ERROR, not an exception", () => {
    const res = ev(DATE("2026-02-30"));
    expect(res.status).toBe("ERROR");
    expect(res.diagnostics[0]!.code).toBe("MALFORMED_NODE");
  });
});

describe("arithmetic operators (generic)", () => {
  it("ADD / SUM / SUBTRACT / MULTIPLY / DIVIDE / MAX / MIN", () => {
    expect(val(ev(ADD(MONEY(25_000_000), MONEY(5_000_000))))!.amount).toBe("30000000");
    expect(val(ev(SUM(MONEY(1), MONEY(2), MONEY(3))))!.amount).toBe("6");
    expect(val(ev(SUB(MONEY(10_000_000), MONEY(5_000_000))))!.amount).toBe("5000000");
    expect(val(ev(MUL(PCT(0.125), MONEY(800_000_000))))!.amount).toBe("100000000");
    expect(val(ev(DIV(MONEY(100), MONEY(40), "RATIO")))).toMatchObject({ value: "2.5" });
    expect(ev(DIV(MONEY(100), MONEY(40), "RATIO")).value!.type).toBe("RATIO");
    expect(val(ev(MAX(MONEY(75_000_000), MONEY(100_000_000))))!.amount).toBe("100000000");
    expect(val(ev(MIN(MONEY(75_000_000), MONEY(100_000_000))))!.amount).toBe("75000000");
  });
  it("MAX records which operand won", () => {
    const res = ev(MAX(MONEY(75_000_000), MUL(PCT(0.125), MONEY(800_000_000))));
    expect(res.trace.selected).toMatchObject({ index: 1, reason: "MAX selected operand 1" });
  });
  it("division by zero is a structured ERROR", () => {
    const res = ev(DIV(NUM(1), NUM(0)));
    expect(res.status).toBe("ERROR");
    expect(res.diagnostics.at(-1)!.code).toBe("DIVISION_BY_ZERO");
  });
});

describe("unit algebra", () => {
  const cases: [string, IRExpression, string | null, string | null][] = [
    ["MONEY + MONEY same currency -> MONEY", ADD(MONEY(1), MONEY(2)), "MONEY", null],
    ["MONEY + MONEY different currency -> ERROR (no FX modeled)", ADD(MONEY(50, "USD"), MONEY(20, "EUR")), null, "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"],
    ["MONEY - MONEY -> MONEY", SUB(MONEY(5), MONEY(2)), "MONEY", null],
    ["PERCENT x MONEY -> MONEY", MUL(PCT(0.1), MONEY(100)), "MONEY", null],
    ["NUMBER x MONEY -> MONEY", MUL(NUM(3), MONEY(100)), "MONEY", null],
    ["MONEY / MONEY -> RATIO per declared type", DIV(MONEY(100), MONEY(50), "RATIO"), "RATIO", null],
    ["MONEY / MONEY -> NUMBER per declared type", DIV(MONEY(100), MONEY(50), "NUMBER"), "NUMBER", null],
    ["NUMBER / NUMBER -> NUMBER", DIV(NUM(10), NUM(4)), "NUMBER", null],
    ["PERCENT + PERCENT -> PERCENT", ({ ...ADD(PCT(0.1), PCT(0.05)) }), "PERCENT", null],
    ["MONEY + PERCENT -> ERROR", ADD(MONEY(1), PCT(0.1)), null, "UNIT_MISMATCH"],
    ["DATE + MONEY -> ERROR", ADD(DATE("2026-01-01"), MONEY(1)), null, "UNIT_MISMATCH"],
    ["MONEY x MONEY -> ERROR", MUL(MONEY(1), MONEY(2)), null, "UNIT_MISMATCH"],
    ["MONEY x RATIO -> ERROR", MUL(MONEY(1), RATIO(2)), null, "UNIT_MISMATCH"],
    ["RATIO + MONEY -> ERROR", ADD(RATIO(1), MONEY(2)), null, "UNIT_MISMATCH"],
    ["MAX(MONEY, RATIO) -> ERROR", MAX(MONEY(1), RATIO(2)), null, "UNIT_MISMATCH"],
    ["MAX(USD, EUR) -> ERROR", MAX(MONEY(1, "USD"), MONEY(2, "EUR")), null, "CURRENCY_MISMATCH_NO_CONVERSION_MODELED"],
    ["MONEY / NUMBER -> MONEY", ({ ...DIV(MONEY(100), NUM(4)) }), "MONEY", null],
  ];
  it.each(cases)("%s", (_label, expr, type, code) => {
    const res = ev(expr);
    if (type) { expect(res.status).toBe("EXECUTABLE"); expect(res.value!.type).toBe(type); }
    else { expect(res.status).toBe("ERROR"); expect(res.diagnostics.at(-1)!.code).toBe(code); expect(res.value).toBeNull(); }
  });
});

describe("comparison and boolean operators", () => {
  it("COMPARE supports GT/GTE/LT/LTE/EQ with strict type compatibility", () => {
    expect(ev(CMP(RATIO(2.5), "GTE", RATIO(2))).value).toMatchObject({ value: true });
    expect(ev(CMP(RATIO(2.5), "LT", RATIO(2))).value).toMatchObject({ value: false });
    expect(ev(CMP(MONEY(1), "EQ", MONEY(1))).value).toMatchObject({ value: true });
    expect(ev(CMP(DATE("2026-01-01"), "LT", DATE("2026-06-30"))).value).toMatchObject({ value: true });
    const mixed = ev(CMP(MONEY(1), "GT", RATIO(1)));
    expect(mixed.status).toBe("ERROR");
    expect(mixed.diagnostics.at(-1)!.code).toBe("UNIT_MISMATCH");
  });
  it("no truthiness coercion: a non-boolean operand of AND/NOT/IF is an ERROR", () => {
    expect(ev(AND(BOOL(true), MONEY(1))).status).toBe("ERROR");
    expect(ev(NOT(NUM(1))).status).toBe("ERROR");
    expect(ev(IF(MONEY(1), MONEY(2), MONEY(3))).status).toBe("ERROR");
  });
  it("AND / OR / NOT / IF", () => {
    expect(ev(AND(BOOL(true), BOOL(true))).value).toMatchObject({ value: true });
    expect(ev(OR(BOOL(false), BOOL(true))).value).toMatchObject({ value: true });
    expect(ev(NOT(BOOL(true))).value).toMatchObject({ value: false });
    expect(val(ev(IF(BOOL(false), MONEY(1), MONEY(2))))!.amount).toBe("2");
    const noElse = ev(IF(BOOL(false), MONEY(1), null));
    expect(noElse.status).toBe("ERROR");
    expect(noElse.diagnostics.at(-1)!.code).toBe("IF_WITHOUT_ELSE_NOT_TAKEN");
  });
});

describe("missing inputs (mission §18) and safe partial evaluation (§19)", () => {
  it("MAX($75m, 12.5% x metric) with no metric input is NEEDS_INPUT with the metric named - never $75m", () => {
    const res = ev(MAX(MONEY(75_000_000), MUL(PCT(0.125), METRIC("Metric A"))));
    expect(res.status).toBe("NEEDS_INPUT");
    expect(res.value).toBeNull();
    expect(res.missingInputKeys).toEqual(["Metric A"]);
    expect(res.missingInputs[0]).toMatchObject({ kind: "METRIC", key: "Metric A", expectedType: "MONEY" });
    // the known operand is recorded only as a lower bound
    expect(res.bounds).toEqual({ knownLowerBound: expect.objectContaining({ type: "MONEY", amount: "75000000" }) });
  });
  it("MIN records a known upper bound; ADD records no bound at all", () => {
    expect(ev(MIN(MONEY(100), METRIC("X"))).bounds).toEqual({ knownUpperBound: expect.objectContaining({ amount: "100" }) });
    expect(ev(ADD(MONEY(100), METRIC("X"))).bounds).toBeNull();
  });
  it("with the input supplied the same expression executes", () => {
    const res = ev(MAX(MONEY(75_000_000), MUL(PCT(0.125), METRIC("Metric A"))), metrics(["Metric A", m("800000000")]));
    expect(res.status).toBe("EXECUTABLE");
    expect(val(res)!.amount).toBe("100000000");
    expect(res.provenance.inputsUsed).toEqual([expect.objectContaining({ kind: "METRIC", key: "Metric A", provenance: SRC })]);
    expect(res.value!.lineage.inputKeys).toEqual(["Metric A"]);
  });
  it("AND(false, unknown) short-circuits to false only over NEEDS_INPUT operands; OR(true, unknown) mirrors it", () => {
    expect(ev(AND(BOOL(false), CMP(METRIC("X"), "GT", MONEY(1)))).value).toMatchObject({ value: false });
    expect(ev(OR(BOOL(true), CMP(METRIC("X"), "GT", MONEY(1)))).value).toMatchObject({ value: true });
    // not over UNSUPPORTED (not a known legal predicate)
    expect(ev(AND(BOOL(false), UNSUP())).status).toBe("UNSUPPORTED");
    // AND(true, unknown) is genuinely unknown
    expect(ev(AND(BOOL(true), CMP(METRIC("X"), "GT", MONEY(1)))).status).toBe("NEEDS_INPUT");
  });
  it("every reference kind reports NEEDS_INPUT with its own kind when unsupplied", () => {
    expect(ev(TERM("Term T")).missingInputs[0]).toMatchObject({ kind: "TERM", key: "Term T" });
    expect(ev(RULEREF("ir-rule:x")).missingInputs[0]).toMatchObject({ kind: "RULE", key: "ir-rule:x" });
    expect(ev(LEDGER("ir-sharedcap:s", null)).missingInputs[0]).toMatchObject({ kind: "LEDGER_USAGE", key: "ir-sharedcap:s" });
    expect(ev(TX("proposed amount")).missingInputs[0]).toMatchObject({ kind: "TRANSACTION_INPUT", key: "proposed amount" });
    expect(ev(EVENT("some event", null, null)).missingInputs[0]).toMatchObject({ kind: "EVENT", key: "some event" });
    expect(ev(SCHEDULE([{ from: null, to: null, value: RATIO(4) }])).missingInputs[0]).toMatchObject({ kind: "AS_OF_DATE" });
  });
  it("an input of the wrong type is an ERROR, never coerced", () => {
    const res = ev(METRIC("X", "MONEY"), metrics(["X", r("2.5")]));
    expect(res.status).toBe("ERROR");
    expect(res.diagnostics[0]!.code).toBe("INPUT_TYPE_MISMATCH");
  });
});

describe("unsupported operands and ambiguity propagation (§20-§21)", () => {
  it("an UNSUPPORTED node yields UNSUPPORTED with the Phase-3 reason, never 0/false/null-as-zero", () => {
    const res = ev(SUB(UNSUP("ratio derivation not representable"), METRIC("X")), metrics(["X", m("1")]));
    expect(res.status).toBe("UNSUPPORTED");
    expect(res.value).toBeNull();
    expect(res.diagnostics.find((d) => d.code === "UNSUPPORTED_NODE")!.phase3Reason).toBe("ratio derivation not representable");
    expect(res.stats.unsupportedCount).toBe(1);
  });
  it("UNSUPPORTED dominates NEEDS_INPUT inside MAX (no bound is offered)", () => {
    const res = ev(MAX(MONEY(1), UNSUP(), METRIC("X")));
    expect(res.status).toBe("UNSUPPORTED");
    expect(res.bounds).toBeNull();
    expect(res.missingInputKeys).toEqual(["X"]);
  });
  it.each(["AMBIGUOUS", "MISSING_CONTEXT", "CONFLICTED"] as const)("a %s definition is AMBIGUOUS at runtime with its Phase-3 reasons", (suff) => {
    const inputs = resolver({ definitions: [definition("ir-definition:d1", "Term D", MONEY(5), suff, ["reason from phase 3"])] });
    const res = ev(TERM("Term D"), inputs);
    expect(res.status).toBe("AMBIGUOUS");
    expect(res.value).toBeNull();
    expect(res.diagnostics[0]).toMatchObject({ code: "AMBIGUOUS_SEMANTICS", phase3Reason: "reason from phase 3" });
  });
  it("a COMPLETE definition with a calculation expression is expanded and its result type-checked against the reference", () => {
    const inputs = resolver({ definitions: [definition("ir-definition:d2", "Term E", MUL(PCT(0.5), METRIC("X")))], metrics: [metricInput("X", m("200"), SRC)] });
    const res = ev(TERM("Term E"), inputs);
    expect(res.status).toBe("EXECUTABLE");
    expect(val(res)!.amount).toBe("100");
    expect(res.provenance.expandedObjects).toEqual([{ kind: "DEFINITION", id: "ir-definition:d2" }]);
    const wrong = ev(TERM("Term E", "RATIO"), inputs);
    expect(wrong.status).toBe("ERROR");
    expect(wrong.diagnostics.at(-1)!.code).toBe("TYPE_CONTRACT_VIOLATION");
  });
  it("a definition without a calculation expression needs its value as an input", () => {
    const inputs = resolver({ definitions: [definition("ir-definition:d3", "Term F", null)] });
    expect(ev(TERM("Term F"), inputs).missingInputs[0]).toMatchObject({ kind: "TERM", key: "Term F" });
  });
  it("an AMBIGUOUS referenced rule blocks; a COMPLETE one yields a CAPACITY value", () => {
    const blocked = resolver({ rules: [rule("ir-rule:a", MONEY(5), { sufficiency: "AMBIGUOUS" })] });
    expect(ev(RULEREF("ir-rule:a"), blocked).status).toBe("AMBIGUOUS");
    const ok = resolver({ rules: [rule("ir-rule:b", MONEY(5))] });
    expect(ev(RULEREF("ir-rule:b"), ok).value).toMatchObject({ type: "CAPACITY", capacity: { kind: "AMOUNT", amount: "5", currency: "USD" } });
  });
});

describe("temporal operators (§13)", () => {
  it("AS_OF with an ISO date sets the as-of key for input resolution; free-text as-of is passed verbatim, never interpreted", () => {
    const inputs = resolver({ metrics: [metricInput("X", m("10"), SRC, null, "2026-06-30"), metricInput("X", m("20"), SRC, null, "the date of such incurrence")] });
    expect(val(ev(ASOF(METRIC("X"), "2026-06-30"), inputs))!.amount).toBe("10");
    expect(val(ev(ASOF(METRIC("X"), "the date of such incurrence"), inputs))!.amount).toBe("20");
    const missing = ev(ASOF(METRIC("X"), "2025-01-01"), inputs);
    expect(missing.status).toBe("NEEDS_INPUT");
    expect(missing.missingInputs[0]).toMatchObject({ key: "X", asOf: "2025-01-01" });
    expect(val(ev(ASOF(METRIC("X"), DATE("2026-06-30")), inputs))!.amount).toBe("10");
  });
  it("DURING_PERIOD passes the period description verbatim as the period key", () => {
    const inputs = resolver({ metrics: [metricInput("X", m("30"), SRC, "the most recently ended Test Period")] });
    expect(val(ev(DURING(METRIC("X"), "the most recently ended Test Period"), inputs))!.amount).toBe("30");
    expect(ev(DURING(METRIC("X"), "some other period"), inputs).missingInputs[0]).toMatchObject({ key: "X", period: "some other period" });
  });
  it("SCHEDULE selects the case covering the context as-of date; overlaps are ERROR; no case and no default is UNSUPPORTED", () => {
    const sched = SCHEDULE([{ from: null, to: "2026-01-01", value: RATIO(5) }, { from: "2026-01-01", to: null, value: RATIO(4.5) }]);
    expect(ev(sched, EMPTY_RESOLVER, { asOf: "2025-06-30" }).value).toMatchObject({ value: "5" });
    expect(ev(sched, EMPTY_RESOLVER, { asOf: "2026-01-01" }).value).toMatchObject({ value: "4.5" });
    expect(ev(sched, EMPTY_RESOLVER, { asOf: "2026-01-01" }).trace.selected).toMatchObject({ index: 1 });
    const overlap = SCHEDULE([{ from: null, to: null, value: RATIO(5) }, { from: "2026-01-01", to: null, value: RATIO(4) }]);
    expect(ev(overlap, EMPTY_RESOLVER, { asOf: "2026-02-01" }).diagnostics.at(-1)!.code).toBe("SCHEDULE_OVERLAPPING_CASES");
    const gap = SCHEDULE([{ from: "2027-01-01", to: null, value: RATIO(5) }]);
    const g = ev(gap, EMPTY_RESOLVER, { asOf: "2026-02-01" });
    expect(g.status).toBe("UNSUPPORTED");
    expect(g.diagnostics.at(-1)!.code).toBe("SCHEDULE_NO_MATCHING_CASE");
    expect(ev(SCHEDULE([{ from: "2027-01-01", to: null, value: RATIO(5) }], RATIO(6)), EMPTY_RESOLVER, { asOf: "2026-02-01" }).value).toMatchObject({ value: "6" });
  });
  it("EVENT_ACTIVE: supplied fact wins; trigger without duration evaluates the trigger; bounded duration is UNSUPPORTED", () => {
    const fact = resolver({ events: [{ eventDescription: "step-up period", asOf: null, active: true, provenance: SRC }] });
    expect(ev(EVENT("step-up period", null, null), fact).value).toMatchObject({ value: true });
    expect(ev(EVENT("e2", CMP(RATIO(3), "GT", RATIO(2)), null)).value).toMatchObject({ value: true });
    const bounded = ev(EVENT("e3", CMP(RATIO(3), "GT", RATIO(2)), "four consecutive fiscal quarters"));
    expect(bounded.status).toBe("UNSUPPORTED");
    expect(bounded.diagnostics.at(-1)!.code).toBe("TEMPORAL_SEMANTICS_NOT_MODELED");
  });
});

describe("trace and provenance (§16-§17)", () => {
  it("the trace explains inputs, operations, the winning branch and where evaluation stopped; legal provenance is carried", () => {
    const expr = MAX(MONEY(75_000_000, "USD", prov("§7.02(b)(1)", "the greater of $75,000,000 and 12.5% of Metric A")), MUL(PCT(0.125), METRIC("Metric A", "MONEY", prov("§1.01 Metric A"))));
    const res = ev(expr, resolver({ metrics: [metricInput("Metric A", m("800000000"), { source: "FinancialSnapshot V3", sourceVersion: "v3" }, "LTM 2026-Q2")] }), { ruleId: "ir-rule:demo" });
    expect(res.trace.kind).toBe("MAX");
    expect(res.trace.selected).toMatchObject({ index: 1 });
    expect(res.trace.children[1]!.children[1]!.input).toMatchObject({ key: "Metric A", period: "LTM 2026-Q2", provenance: { source: "FinancialSnapshot V3", sourceVersion: "v3" } });
    expect(res.provenance).toMatchObject({ ruleId: "ir-rule:demo", rootExprId: expr.exprId, sourceCitations: ["§7.02(b)(1)", "§1.01 Metric A"] });
    expect(res.trace.children[0]!.provenance!.excerpt).toContain("the greater of");
    const stopped = ev(expr);
    expect(stopped.trace.children[1]!.children[1]).toMatchObject({ status: "NEEDS_INPUT", note: expect.stringContaining("has no runtime input") });
  });
  it("diagnostics carry runtime observability counters", () => {
    const res = ev(MAX(MONEY(1), MUL(PCT(0.5), METRIC("X"))), metrics(["X", m("4")]));
    expect(res.stats).toMatchObject({ nodesEvaluated: 5, cacheHits: 0, dependencyCount: 1, maxDepth: 2, missingInputCount: 0, unsupportedCount: 0, evaluationStatus: "EXECUTABLE" });
  });
  it("a shared subtree is memoized within one evaluation", () => {
    const shared = METRIC("X");
    const res = ev(ADD(shared, shared), metrics(["X", m("4")]));
    expect(val(res)!.amount).toBe("8");
    expect(res.stats.cacheHits).toBe(1);
  });
});

describe("error totality (§33)", () => {
  it("expected bad states are results, not exceptions", () => {
    const bad: IRExpression[] = [DIV(NUM(1), NUM(0)), ADD(MONEY(1), PCT(1)), METRIC("missing"), UNSUP(), DATE("nope"), MUL(MONEY(1), MONEY(1)), ADD(), ADD(BOOL(true), BOOL(false)), ADD(DATE("2026-01-01"), DATE("2026-01-02")), SUB(BOOL(true), BOOL(false)), MUL(DATE("2026-01-01"), NUM(2)), DIV(BOOL(true), NUM(2)), MAX(BOOL(true), BOOL(false)), CMP(BOOL(true), "GT", BOOL(false))];
    for (const e of bad) expect(() => ev(e)).not.toThrow();
    expect(ev(ADD()).diagnostics.at(-1)!.code).toBe("MALFORMED_NODE");
    expect(ev(ADD(BOOL(true), BOOL(false))).diagnostics.at(-1)!.code).toBe("UNIT_MISMATCH");
    expect(ev(ADD(DATE("2026-01-01"), DATE("2026-01-02"))).status).toBe("ERROR");
    expect(ev(CMP(BOOL(true), "GT", BOOL(false))).diagnostics.at(-1)!.code).toBe("TYPE_CONTRACT_VIOLATION");
  });
  it("UNLIMITED_CAPACITY evaluates its gate deterministically", () => {
    const gated = { kind: "UNLIMITED_CAPACITY" as const, type: "CAPACITY" as const, gatedBy: CMP(METRIC("Leverage", "RATIO"), "LTE", RATIO(4)) };
    expect(evaluateExpression({ expression: gated, inputs: metrics(["Leverage", r("3.5")]) }).value).toMatchObject({ type: "CAPACITY", capacity: { kind: "UNLIMITED", gate: "SATISFIED" } });
    expect(evaluateExpression({ expression: gated, inputs: metrics(["Leverage", r("4.5")]) }).value).toMatchObject({ capacity: { kind: "GATE_NOT_SATISFIED" } });
    expect(evaluateExpression({ expression: gated, inputs: EMPTY_RESOLVER }).status).toBe("NEEDS_INPUT");
    expect(evaluateExpression({ expression: { ...gated, gatedBy: null }, inputs: EMPTY_RESOLVER }).value).toMatchObject({ capacity: { kind: "UNLIMITED", gate: "NONE" } });
  });
  it("boolean and number helpers round-trip", () => {
    expect(b(true).type).toBe("BOOLEAN");
    expect(n("1").type).toBe("NUMBER");
  });
});
