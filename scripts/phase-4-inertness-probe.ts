/**
 * PHASE-4 INERTNESS PROBE (migration steps 1+2).
 *
 * The acceptance criterion for this migration is that Phase-4 execution is behaviourally unchanged
 * when no verification envelope is supplied. "The suite still passes" is weaker than that: a suite
 * can pass while a value, a diagnostic or a limitation quietly changes shape. So this probe drives
 * every Phase-4 entry point over fixed, deterministic fixtures, serializes everything the runtime
 * returns, and prints one sha256 over the whole thing.
 *
 * Run it BEFORE the migration and AFTER. The hashes must be identical.
 *
 * Nothing here is timestamped, randomized or clock-dependent - the runtime's own outputs carry no
 * wall-clock field, which is what makes this comparison meaningful rather than approximate.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import { createHash } from "node:crypto";
import { evaluateExpression } from "../lib/contract-model/runtime/evaluate-expression";
import { evaluateRule } from "../lib/contract-model/runtime/rule-evaluator";
import { buildDependencyGraph } from "../lib/contract-model/runtime/dependency-graph";
import { fixtureInputResolver, metricInput } from "../lib/contract-model/runtime/input-resolver";
import { buildCapacityGraph } from "../lib/contract-model/runtime/capacity/graph";
import { evaluateCapacityState } from "../lib/contract-model/runtime/capacity/state";
import { rationalFromString } from "../lib/contract-model/runtime/decimal";
import type { IRDefinition, IRExpression, IRRule } from "../lib/contract-model/ir/types";
import type { InputProvenance } from "../lib/contract-model/runtime/types";

let n = 0;
const id = () => `probe-expr-${++n}`;
const MONEY = (amount: number): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency: "USD", exprId: id() }) as IRExpression;
const PCT = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: id() }) as IRExpression;
const METRIC = (metricName: string): IRExpression => ({ kind: "METRIC_REFERENCE", type: "MONEY", metricName, companyId: "probe-co", instrumentKey: "probe-inst", resolvedDefinitionId: null, exprId: id() }) as IRExpression;
const MUL = (...operands: IRExpression[]): IRExpression => ({ kind: "MULTIPLY", type: "MONEY", operands, exprId: id() }) as IRExpression;
const MAX = (...operands: IRExpression[]): IRExpression => ({ kind: "MAX", type: "MONEY", operands, exprId: id() }) as IRExpression;
const CMP = (left: IRExpression, operator: "GT" | "LTE", right: IRExpression): IRExpression => ({ kind: "COMPARE", type: "BOOLEAN", left, operator, right, exprId: id() }) as IRExpression;

const prov: InputProvenance = { source: "PROBE", sourceId: "probe", asOf: "2026-01-01", statementPeriod: null, note: null } as unknown as InputProvenance;

function rule(ruleId: string, sufficiency: string, capacity: IRExpression | null, conditions: IRExpression[] = []): IRRule {
  return {
    ruleId, irSchemaVersion: "probe-v1", companyId: "probe-co", instrumentKey: "probe-inst", sourceDocumentId: "probe-doc",
    sourceSectionRef: "1.01", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT",
    entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: capacity,
    conditions: conditions.map((e, i) => ({ conditionId: `${ruleId}-c${i}`, conditionType: "OTHER", expression: e, referencesDefinitionId: null, description: `condition ${i}`, provenance: null })),
    exceptions: [], dependsOn: [], operativeLineage: null, sufficiency, sufficiencyReasons: sufficiency === "COMPLETE" ? [] : ["probe"],
    provenance: null, compilerVersion: "probe-v1", sourceContentVersion: null,
  } as unknown as IRRule;
}

function main() {
  n = 0;
  const inputs = fixtureInputResolver({ metrics: [metricInput("Consolidated EBITDA", { type: "MONEY", amount: rationalFromString("100000000"), currency: "USD", lineage: { inputKeys: ["Consolidated EBITDA"] } } as never, prov)] });

  const capacity = MAX(MONEY(50_000_000), MUL(PCT(0.25), METRIC("Consolidated EBITDA")));
  const cond = CMP(METRIC("Consolidated EBITDA"), "GT", MONEY(1));
  const rules: IRRule[] = [
    rule("probe:rule:complete", "COMPLETE", capacity, [cond]),
    rule("probe:rule:partial", "PARTIAL", MONEY(10_000_000)),
    rule("probe:rule:ambiguous", "AMBIGUOUS", MONEY(20_000_000)),
    rule("probe:rule:missing-context", "MISSING_CONTEXT", MONEY(30_000_000)),
    rule("probe:rule:unsupported", "UNSUPPORTED", MONEY(40_000_000)),
    rule("probe:rule:no-capacity", "COMPLETE", null, [cond]),
  ];
  const definitions: IRDefinition[] = [];

  const out: Record<string, unknown> = {};
  out.evaluateExpression_capacity = evaluateExpression({ expression: capacity as never, inputs });
  out.evaluateExpression_condition = evaluateExpression({ expression: cond as never, inputs });
  out.dependencyGraph = buildDependencyGraph(capacity as never, inputs);
  out.evaluateRule = rules.map((r) => evaluateRule(r, inputs, { asOf: "2026-01-01" }));

  const graph = buildCapacityGraph({ companyId: "probe-co", instrumentKey: "probe-inst", rules, definitions, asOf: "2026-01-01" });
  out.capacityGraph = graph;
  out.capacityState = evaluateCapacityState({ graph, rules, definitions, inputs, asOf: "2026-01-01" });

  const body = JSON.stringify(out, null, 1);
  console.log(`probeSha256 ${createHash("sha256").update(body).digest("hex")}`);
  console.log(`probeBytes  ${body.length}`);
  if (process.argv[2]) require("node:fs").writeFileSync(process.argv[2], body);
}

main();
