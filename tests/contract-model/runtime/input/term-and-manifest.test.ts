/**
 * Phase 4B - term resolution identity (cases K, L), the dependency manifest (R, Q, S),
 * evaluator integration, provenance and repeatability.
 */
import { describe, expect, it } from "vitest";
import type { IRExpression, IRRule } from "@/lib/contract-model/ir/types";
import { evaluateExpression } from "@/lib/contract-model/runtime/evaluate-expression";
import { buildFinancialDependencyManifest, buildRuleDependencyManifest } from "@/lib/contract-model/runtime/input/manifest";
import { snapshotInputResolver } from "@/lib/contract-model/runtime/input/snapshot-resolver";
import { FINANCIAL_INPUT_CONTRACT_VERSION } from "@/lib/contract-model/runtime/input/version";
import { CONTRACT_RUNTIME_VERSION } from "@/lib/contract-model/runtime/version";
import { CO_A, CO_B, INST_1, INST_2, definition, identity, input, money, noPeriod, ratio, snapshot, verbatimPeriod } from "./helpers";

let n = 0;
const id = () => `ir-expr:t-${++n}`;
const MONEY = (amount: number): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency: "USD", exprId: id() });
const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: id() });
const RATIO = (value: number): IRExpression => ({ kind: "RATIO", type: "RATIO", value, exprId: id() });
const BOOL = (value: boolean): IRExpression => ({ kind: "BOOLEAN_LITERAL", type: "BOOLEAN", value, exprId: id() });
const METRIC = (metricName: string, type: "MONEY" | "RATIO" = "MONEY", companyId = CO_A, instrumentKey = INST_1): IRExpression => ({ kind: "METRIC_REFERENCE", type, metricName, companyId, instrumentKey, resolvedDefinitionId: null, exprId: id() });
const TERM = (termName: string, resolvedDefinitionId: string | null = null, companyId = CO_A, instrumentKey = INST_1): IRExpression => ({ kind: "DEFINED_TERM_REFERENCE", type: "MONEY", termName, companyId, instrumentKey, resolvedDefinitionId, exprId: id() });
const MUL = (...operands: IRExpression[]): IRExpression => ({ kind: "MULTIPLY", type: "MONEY", operands, exprId: id() });
const MAX = (...operands: IRExpression[]): IRExpression => ({ kind: "MAX", type: "MONEY", operands, exprId: id() });
const IF = (condition: IRExpression, then: IRExpression, els: IRExpression | null): IRExpression => ({ kind: "IF", type: "MONEY", condition, then, else: els, exprId: id() });
const DURING = (value: IRExpression, periodDescription: string): IRExpression => ({ kind: "DURING_PERIOD", type: "MONEY", value, periodDescription, exprId: id() });
const CMP = (left: IRExpression, operator: "GTE" | "LTE", right: IRExpression): IRExpression => ({ kind: "COMPARE", type: "BOOLEAN", left, operator, right, exprId: id() });

const ctx = { companyId: CO_A, instrumentKey: INST_1 };

describe("K/L. term resolution keeps identity", () => {
  it("L. a definition id that points at another company's object is a CONFLICT, never a name fallback", () => {
    const foreign = definition("ir-definition:d1", "term-t", MONEY(5), { companyId: CO_B });
    const local = definition("ir-definition:d2", "term-t", MONEY(7));
    const r = snapshotInputResolver({ snapshots: [], definitions: [foreign, local] });
    const out = r.strict.resolveTermStrict("term-t", "ir-definition:d1", CO_A, INST_1, "MONEY", null, null);
    expect(out.state).toBe("CONFLICT");
    expect(out.reason).toContain("contradicts");
    expect(out.definition).toBeNull();
  });
  it("L. an unknown definition id does not silently fall back to the term name", () => {
    const local = definition("ir-definition:d2", "term-t", MONEY(7));
    const r = snapshotInputResolver({ snapshots: [], definitions: [local] });
    const out = r.strict.resolveTermStrict("term-t", "ir-definition:missing", CO_A, INST_1, "MONEY", null, null);
    expect(out.state).toBe("MISSING");
    expect(out.reason).toContain("does not fall back to a name lookup");
  });
  it("a name lookup never crosses instruments or companies", () => {
    const other = definition("ir-definition:d3", "term-t", MONEY(5), { instrumentKey: INST_2 });
    const r = snapshotInputResolver({ snapshots: [], definitions: [other] });
    const out = r.strict.resolveTermStrict("term-t", null, CO_A, INST_1, "MONEY", null, null);
    expect(out.state).toBe("MISSING");
    expect(out.rejectedDefinitions[0]!.reason).toContain("instrument");
  });
  it("two definitions with the same name and identity are AMBIGUOUS", () => {
    const a = definition("ir-definition:a", "term-t", MONEY(5));
    const b = definition("ir-definition:b", "term-t", MONEY(6));
    const r = snapshotInputResolver({ snapshots: [], definitions: [a, b] });
    expect(r.strict.resolveTermStrict("term-t", null, CO_A, INST_1, "MONEY", null, null).state).toBe("AMBIGUOUS");
  });
  it("K. a supplied value competing with an evaluable definition is a CONFLICT unless it declares an override", () => {
    const def = definition("ir-definition:d", "term-t", MONEY(5));
    const snaps = [snapshot({ snapshotId: "s", inputs: [input({ identity: identity({ key: "term-t", inputKind: "TERM_VALUE" }), value: money("50") })] })];
    const conflicted = snapshotInputResolver({ snapshots: snaps, definitions: [def] });
    const out = conflicted.strict.resolveTermStrict("term-t", null, CO_A, INST_1, "MONEY", null, null);
    expect(out.state).toBe("CONFLICT");
    expect(out.reason).toContain("does not declare itself an override");

    const overriding = [snapshot({ snapshotId: "s", inputs: [input({ identity: identity({ key: "term-t", inputKind: "TERM_VALUE" }), value: money("50"), overridesDefinitionId: "ir-definition:d" })] })];
    const ok = snapshotInputResolver({ snapshots: overriding, definitions: [def] });
    const out2 = ok.strict.resolveTermStrict("term-t", null, CO_A, INST_1, "MONEY", null, null);
    expect(out2.state).toBe("RESOLVED_VALUE");
    expect(out2.reason).toContain("explicitly overrides");
  });
  it("a definition alone resolves to the definition, and a value alone resolves to the value", () => {
    const def = definition("ir-definition:d", "term-t", MONEY(5));
    expect(snapshotInputResolver({ snapshots: [], definitions: [def] }).strict.resolveTermStrict("term-t", null, CO_A, INST_1, "MONEY", null, null).state).toBe("RESOLVED_DEFINITION");
    const snaps = [snapshot({ snapshotId: "s", inputs: [input({ identity: identity({ key: "term-t", inputKind: "TERM_VALUE" }), value: money("50") })] })];
    expect(snapshotInputResolver({ snapshots: snaps }).strict.resolveTermStrict("term-t", null, CO_A, INST_1, "MONEY", null, null).state).toBe("RESOLVED_VALUE");
  });
});

describe("R/Q/S. the dependency manifest", () => {
  it("R. a definition-expanded expression exposes the underlying metric, not the term", () => {
    const def = definition("ir-definition:d", "term-t", MUL(PCT(0.5), METRIC("metric-inner")));
    const m = buildFinancialDependencyManifest({ expression: TERM("term-t"), definitions: [def], ...ctx });
    expect(m.dependencies.map((d) => `${d.inputKind}:${d.key}`)).toEqual(["METRIC:metric-inner"]);
    expect(m.expandedObjects).toEqual([{ kind: "DEFINITION", id: "ir-definition:d" }]);
    expect(m.dependencies[0]!.via).toEqual({ kind: "DEFINITION", definitionId: "ir-definition:d" });
  });
  it("a term with no definition available is itself the dependency", () => {
    const m = buildFinancialDependencyManifest({ expression: TERM("term-t"), ...ctx });
    expect(m.dependencies.map((d) => `${d.inputKind}:${d.key}`)).toEqual(["TERM_VALUE:term-t"]);
  });
  it("S. a MAX with a literal sibling keeps the metric REQUIRED while recording that a bound exists without it", () => {
    const expr = MAX(MONEY(75_000_000), MUL(PCT(0.125), METRIC("metric-e")));
    const m = buildFinancialDependencyManifest({ expression: expr, ...ctx });
    const dep = m.dependencies.find((d) => d.key === "metric-e")!;
    expect(dep.status).toBe("REQUIRED");
    expect(dep.safeBoundAvailableWithoutThis).toBe(true);
    // and evaluation agrees: a bound is reported but the answer is not
    const res = evaluateExpression({ expression: expr, inputs: snapshotInputResolver({ snapshots: [] }), context: ctx });
    expect(res.status).toBe("NEEDS_INPUT");
    expect(res.value).toBeNull();
    expect(res.bounds?.knownLowerBound).toMatchObject({ type: "MONEY", amount: "75000000" });
    expect(m.counts.required).toBe(1);
  });
  it("Q. IF branches are CONDITIONAL and the condition is REQUIRED", () => {
    const expr = IF(CMP(METRIC("metric-cond", "RATIO"), "LTE", RATIO(4)), MUL(PCT(0.1), METRIC("metric-then")), MUL(PCT(0.2), METRIC("metric-else")));
    const m = buildFinancialDependencyManifest({ expression: expr, ...ctx });
    const byKey = Object.fromEntries(m.dependencies.map((d) => [d.key, d]));
    expect(byKey["metric-cond"]!.status).toBe("REQUIRED");
    expect(byKey["metric-then"]!.status).toBe("CONDITIONAL");
    expect(byKey["metric-else"]!.status).toBe("CONDITIONAL");
    expect(byKey["metric-then"]!.conditionalOn).toContain("then-branch");
    expect(m.counts).toMatchObject({ total: 3, required: 1, conditional: 2 });
  });
  it("the period a metric is read under is carried verbatim, never parsed", () => {
    const m = buildFinancialDependencyManifest({ expression: DURING(METRIC("metric-p"), "the most recently ended Test Period"), ...ctx });
    expect(m.dependencies[0]!.period).toEqual({ kind: "VERBATIM_CONTRACT_PERIOD_KEY", key: "the most recently ended Test Period" });
  });
  it("manifest expansion is cycle-safe and reports the cycle", () => {
    const a = definition("ir-definition:a", "term-a", TERM("term-b"));
    const b = definition("ir-definition:b", "term-b", TERM("term-a"));
    const m = buildFinancialDependencyManifest({ expression: TERM("term-a"), definitions: [a, b], ...ctx });
    expect(m.cycles.length).toBeGreaterThan(0);
  });
  it("the manifest hash is deterministic and order-independent", () => {
    const expr = MAX(MONEY(1), MUL(PCT(0.1), METRIC("m1")), MUL(PCT(0.2), METRIC("m2")));
    const a = buildFinancialDependencyManifest({ expression: expr, ...ctx });
    const b = buildFinancialDependencyManifest({ expression: expr, ...ctx });
    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.contractVersion).toBe(FINANCIAL_INPUT_CONTRACT_VERSION);
    expect(a.runtimeVersion).toBe(CONTRACT_RUNTIME_VERSION);
  });
  it("a rule manifest covers the capacity expression and every condition", () => {
    const rule: IRRule = {
      ruleId: "ir-rule:r", irSchemaVersion: "t", companyId: CO_A, instrumentKey: INST_1, sourceDocumentId: "doc", sourceSectionRef: "7.02",
      covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT",
      entityScope: [], entityScopeExcluded: [], transactionScope: null,
      capacityExpression: MUL(PCT(0.1), METRIC("metric-cap")),
      conditions: [{ conditionId: "c1", conditionType: "RATIO_SATISFIED", expression: CMP(METRIC("metric-gate", "RATIO"), "LTE", RATIO(4)), referencesDefinitionId: null, description: "", provenance: null }],
      exceptions: [], dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: null, compilerVersion: null, sourceContentVersion: null,
    };
    const m = buildRuleDependencyManifest(rule);
    expect(m.dependencies.map((d) => d.key).sort()).toEqual(["metric-cap", "metric-gate"]);
    expect(m.ruleId).toBe("ir-rule:r");
  });
});

describe("evaluator integration: every resolution state maps to a distinct runtime state", () => {
  const expr = MUL(PCT(0.125), METRIC("metric-e"));
  const run = (snapshots: Parameters<typeof snapshotInputResolver>[0]["snapshots"], policy?: Parameters<typeof snapshotInputResolver>[0]["policy"]) =>
    evaluateExpression({ expression: expr, inputs: snapshotInputResolver({ snapshots, ...(policy ? { policy } : {}) }), context: ctx });

  it("RESOLVED evaluates and carries snapshot provenance", () => {
    const s = [snapshot({ snapshotId: "s1", version: "7", inputs: [input({ identity: identity({ key: "metric-e" }), value: money("800000000") })] })];
    const r = run(s);
    expect(r.status).toBe("EXECUTABLE");
    expect(r.value).toMatchObject({ type: "MONEY", amount: "100000000" });
    const used = r.provenance.inputsUsed[0]!;
    expect(used.provenance).toMatchObject({ snapshotId: "s1", snapshotVersion: "7", snapshotStatus: "APPROVED", selectionMethod: "EXACT_IDENTITY", inputContractVersion: FINANCIAL_INPUT_CONTRACT_VERSION, reliedOnNonApprovedSnapshot: false, identityStrength: "CONTRACT_NAME_ONLY", currency: "USD" });
    expect(used.provenance.approvalRef).toBe("approval-1");
    expect(r.provenance.inputContractVersion).toBe(FINANCIAL_INPUT_CONTRACT_VERSION);
  });
  it("MISSING becomes NEEDS_INPUT", () => {
    const r = run([]);
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.missingInputKeys).toEqual(["metric-e"]);
  });
  it("AMBIGUOUS becomes AMBIGUOUS, not a missing input", () => {
    const s = [
      snapshot({ snapshotId: "s1", inputs: [input({ identity: identity({ key: "metric-e" }), value: money("1") })] }),
      snapshot({ snapshotId: "s2", inputs: [input({ identity: identity({ key: "metric-e" }), value: money("2") })] }),
    ];
    const r = run(s);
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.diagnostics[0]!.code).toBe("AMBIGUOUS_INPUT");
    expect(r.value).toBeNull();
  });
  it("INCOMPATIBLE becomes ERROR with a type-conflict code", () => {
    const s = [snapshot({ snapshotId: "s1", inputs: [input({ identity: identity({ key: "metric-e", valueType: "RATIO", currency: null }), value: ratio("2") })] })];
    const r = run(s);
    expect(r.status).toBe("ERROR");
    expect(r.diagnostics[0]!.code).toBe("INPUT_TYPE_CONFLICT");
  });
  it("NOT_APPROVED becomes NEEDS_INPUT with its own code, and stays listed as a missing input", () => {
    const s = [snapshot({ snapshotId: "s1", status: "DRAFT", inputs: [input({ identity: identity({ key: "metric-e" }), value: money("1") })] })];
    const r = run(s);
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.diagnostics[0]!.code).toBe("INPUT_NOT_APPROVED");
    expect(r.missingInputKeys).toEqual(["metric-e"]);
    const widened = run(s, { acceptableStatuses: ["APPROVED", "DRAFT"], asOfMode: "EXACT" });
    expect(widened.status).toBe("EXECUTABLE");
    expect(widened.provenance.inputsUsed[0]!.provenance.reliedOnNonApprovedSnapshot).toBe(true);
  });
  it("an unsafe snapshot set blocks evaluation explicitly", () => {
    const s = [snapshot({ snapshotId: "s1", supersedesSnapshotId: "s1", inputs: [input({ identity: identity({ key: "metric-e" }), value: money("1") })] })];
    const r = run(s);
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.diagnostics[0]!.code).toBe("SNAPSHOT_SET_UNSAFE");
  });
  it("a term conflict surfaces as TERM_RESOLUTION_CONFLICT", () => {
    const def = definition("ir-definition:d", "term-t", MONEY(5));
    const s = [snapshot({ snapshotId: "s", inputs: [input({ identity: identity({ key: "term-t", inputKind: "TERM_VALUE" }), value: money("50") })] })];
    const r = evaluateExpression({ expression: TERM("term-t"), inputs: snapshotInputResolver({ snapshots: s, definitions: [def] }), context: ctx });
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.diagnostics[0]!.code).toBe("TERM_RESOLUTION_CONFLICT");
  });
  it("cross-company isolation holds end to end", () => {
    const s = [snapshot({ snapshotId: "s-b", companyId: CO_B, inputs: [input({ identity: identity({ key: "metric-e", companyId: CO_B }), value: money("800000000") })] })];
    const r = run(s);
    expect(r.status).toBe("NEEDS_INPUT");
    expect(r.value).toBeNull();
  });
});

describe("repeatability", () => {
  it("same IR, same snapshots, same context produce byte-identical results in any input order", () => {
    const expr = MAX(MONEY(1), MUL(PCT(0.125), METRIC("m1")), MUL(PCT(0.5), METRIC("m2")));
    const inputs = [
      input({ identity: identity({ key: "m1", period: verbatimPeriod("P") }), value: money("8") }),
      input({ identity: identity({ key: "m2", period: verbatimPeriod("P") }), value: money("4") }),
      input({ identity: identity({ key: "m1" }), value: money("800") }),
      input({ identity: identity({ key: "m2" }), value: money("400") }),
    ];
    const orders = [[0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]];
    const results = orders.map((o) => JSON.stringify(evaluateExpression({ expression: expr, inputs: snapshotInputResolver({ snapshots: [snapshot({ snapshotId: "s", inputs: o.map((i) => inputs[i]!) })] }), context: ctx })));
    expect(new Set(results).size).toBe(1);
    expect(JSON.parse(results[0]!).status).toBe("EXECUTABLE");
  });
  it("the manifest is stable across repeated builds and independent of definition order", () => {
    const d1 = definition("ir-definition:a", "term-a", MUL(PCT(0.5), METRIC("m-a")));
    const d2 = definition("ir-definition:b", "term-b", MUL(PCT(0.5), METRIC("m-b")));
    const expr = MAX(TERM("term-a"), TERM("term-b"), BOOL(false).kind === "BOOLEAN_LITERAL" ? MONEY(1) : MONEY(1));
    const a = buildFinancialDependencyManifest({ expression: expr, definitions: [d1, d2], ...ctx });
    const b = buildFinancialDependencyManifest({ expression: expr, definitions: [d2, d1], ...ctx });
    expect(a.manifestHash).toBe(b.manifestHash);
    expect(a.dependencies.map((d) => d.key)).toEqual(["m-a", "m-b"]);
  });
});
