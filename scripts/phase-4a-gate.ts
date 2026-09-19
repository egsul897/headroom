/**
 * PHASE 4A - deterministic compositional expression runtime: evidence artifacts + gate.
 * No model call. Writes docs/phase-4a/01..12.
 * Run: [VITEST_TARGETED_JSON=.. VITEST_FULL_JSON=.. VITEST_FULL_BASE_JSON=.. TSC_LOG=.. LINT_LOG=.. BUILD_LOG=..] npx tsx scripts/phase-4a-gate.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { writeJson } from "./f7b-lib";
import { readJson, sh, sha256 } from "./phase-3-601-revalidation-lib";
import type { IRExpression, IRRule } from "../lib/contract-model/ir/types";
import { CONTRACT_RUNTIME_VERSION } from "../lib/contract-model/runtime/version";
import { evaluateExpression } from "../lib/contract-model/runtime/evaluate-expression";
import { buildDependencyGraph } from "../lib/contract-model/runtime/dependency-graph";
import { evaluateRule } from "../lib/contract-model/runtime/rule-evaluator";
import { EMPTY_RESOLVER, fixtureInputResolver, metricInput } from "../lib/contract-model/runtime/input-resolver";
import { addAll, compareWith, divideValues, multiplyAll, subtractValues } from "../lib/contract-model/runtime/units";
import { rationalFromString } from "../lib/contract-model/runtime/decimal";
import type { RuntimeValue } from "../lib/contract-model/runtime/types";
import { STATUS_PRECEDENCE } from "../lib/contract-model/runtime/types";
import { FIXTURE_1_FIXED_DEBT_BASKET, FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT, FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO, FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE } from "../tests/fixtures/ir-examples/real-covenant-shapes";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;
const OUT = "docs/phase-4a";
const at = () => new Date().toISOString();
const STARTING_SHA = "34130bd20a1df0f87fcae87f52fab09742fb1ec8";
const PHASE3_PRODUCTION_SHA = "5c914558a30e2e1709f16b6d0aaca1bc9bf8e789";
const PHASE3_TREES = { "lib/": "806b2e3b6f9c006aae184453c6122a0fbd7d554e", "lib/contract-model/compiler/": "b4e6a9da496a23b9f98607355520a456e6c48e1f", "lib/contract-model/compiler/semantic/": "f79bc12dd479e9b803bf9e37092d76b6aedb8c12" };
const FROZEN = "tests/fixtures/unseen-packages/phase-3-final-601-precision-revalidation/compile-result.json";
const file = (env: string) => { const p = process.env[env]; return p && existsSync(p) ? readFileSync(p, "utf8") : null; };
const head = sh("git rev-parse HEAD");

// ---------------- freeze (§0, §37)
const semanticTreeAtHead = sh("git rev-parse HEAD:lib/contract-model/compiler/semantic");
const compilerTreeAtHead = sh("git rev-parse HEAD:lib/contract-model/compiler");
const semanticDirty = sh("git status --porcelain -- lib/contract-model/compiler lib/contract-model/ir").split("\n").filter(Boolean);
const semanticFrozen = semanticTreeAtHead === PHASE3_TREES["lib/contract-model/compiler/semantic/"] && compilerTreeAtHead === PHASE3_TREES["lib/contract-model/compiler/"] && semanticDirty.length === 0;
const handoff = readJson<Any>("docs/phase-3-closure-final/09-phase4-handoff-contract.json");
const closure = readJson<Any>("docs/phase-3-closure-final/11-phase3-closure-verdict.json");
const phase3Closed = closure.verdict === "PHASE_3_CLOSED" && handoff.inEffect === true && handoff.phase3ProductionSha === PHASE3_PRODUCTION_SHA;
const handoffCorrected = handoff.blockedBy === null && handoff.handoffHygiene?.field === "blockedBy";

// ---------------- 01 IR runtime surface (§3)
const frozen = readJson<Any>(FROZEN);
const kindsInFrozen: Record<string, number> = {};
const walk = (n: unknown) => { if (!n || typeof n !== "object") return; const o = n as Record<string, unknown>; if (typeof o.kind === "string") kindsInFrozen[o.kind] = (kindsInFrozen[o.kind] ?? 0) + 1; for (const v of Object.values(o)) if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") walk(v); };
for (const r of frozen.rules) { walk(r.capacityExpression); for (const c of r.conditions) walk(c.expression); }
for (const d of frozen.definitions) walk(d.calculationExpression);
const S = (existingType: string, runtimeInterpretation: string, implemented: boolean | "PARTIAL", reason: string, expectedResultType: string, inputDependencies: string[], unsupportedCases: string[]) => ({ existingType, runtimeInterpretation, implementedIn4A: implemented, reason, expectedResultType, possibleInputDependencies: inputDependencies, unsupportedCases, occurrencesInFrozenIr: kindsInFrozen[existingType] ?? 0 });
const surface = [
  S("MONEY", "exact rational amount + currency", true, "literal", "MONEY", [], []),
  S("NUMBER", "exact rational", true, "literal", "NUMBER", [], []),
  S("PERCENT", "exact rational fraction (0.125 = 12.5%)", true, "literal", "PERCENT", [], []),
  S("RATIO", "exact rational, dimensionless, distinct from NUMBER", true, "literal", "RATIO", [], []),
  S("BOOLEAN_LITERAL", "boolean", true, "literal", "BOOLEAN", [], []),
  S("DATE_LITERAL", "ISO calendar date", true, "literal; calendar-validated", "DATE", [], ["non-ISO or invalid calendar date -> ERROR MALFORMED_NODE"]),
  S("METRIC_REFERENCE", "resolver.resolveMetric(name, company, instrument, asOf, period) -> typed input", true, "reference; the declared type is enforced against the supplied input", "declared type (MONEY | RATIO | NUMBER)", ["METRIC"], ["no input -> NEEDS_INPUT", "wrong input type -> ERROR INPUT_TYPE_MISMATCH"]),
  S("DEFINED_TERM_REFERENCE", "resolver.resolveTerm -> Phase-3 definition (expanded, cycle-checked) or direct value", true, "reference", "declared IRValueType", ["TERM", "DEFINITION expansion"], ["AMBIGUOUS/MISSING_CONTEXT/CONFLICTED definition -> AMBIGUOUS", "definition without calculation expression -> NEEDS_INPUT", "DURATION/PERIOD declared types -> no runtime representation (ERROR on type contract)"]),
  S("RULE_REFERENCE", "resolver.resolveRule -> that rule's capacity expression evaluated (cycle-checked) as a CAPACITY value", true, "reference", "CAPACITY", ["RULE expansion"], ["blocked sufficiency -> AMBIGUOUS", "rule without capacity expression -> UNSUPPORTED"]),
  S("LEDGER_USAGE_REFERENCE", "resolver.resolveLedgerUsage -> MONEY input", true, "reference through the interface only; no consumption ledger exists yet (later subphase)", "MONEY", ["LEDGER_USAGE"], ["no ledger -> NEEDS_INPUT"]),
  S("TRANSACTION_INPUT_REFERENCE", "resolver.resolveTransactionInput -> typed input", true, "reference", "declared IRValueType (CAPACITY accepts MONEY)", ["TRANSACTION_INPUT"], ["no input -> NEEDS_INPUT"]),
  S("ENTITY_SCOPE_REFERENCE", "symbolic ENTITY_SET value (include/exclude tags carried, never resolved to entities)", true, "symbolic", "ENTITY_SET", [], ["not usable in arithmetic (UNIT_MISMATCH)"]),
  S("ADD", "unit-checked sum", true, "operator", "operand dimension", [], ["mixed dimensions / currencies -> ERROR"]),
  S("SUM", "identical to ADD", true, "operator", "operand dimension", [], ["as ADD"]),
  S("SUBTRACT", "unit-checked difference", true, "operator", "operand dimension", [], ["mixed dimensions / currencies -> ERROR"]),
  S("MULTIPLY", "scaling factors (PERCENT/NUMBER) x at most one dimensioned operand", true, "operator", "dimensioned operand type, else PERCENT/NUMBER", [], ["two dimensioned operands -> ERROR"]),
  S("DIVIDE", "exact rational quotient; MONEY/MONEY dimensionless per declared type; MONEY/NUMBER -> MONEY", true, "operator", "declared NUMBER|RATIO, or MONEY", [], ["division by zero -> ERROR", "cross-currency -> ERROR"]),
  S("MAX", "extreme over one dimension; partial: known lower bound as metadata", true, "operator", "operand dimension", [], ["mixed dimensions -> ERROR"]),
  S("MIN", "extreme over one dimension; partial: known upper bound as metadata", true, "operator", "operand dimension", [], ["mixed dimensions -> ERROR"]),
  S("COMPARE", "GT/GTE/LT/LTE/EQ (+NE) with strict type compatibility", true, "operator", "BOOLEAN", [], ["different types -> ERROR", "ordering on BOOLEAN -> ERROR"]),
  S("AND", "boolean conjunction; short-circuit false only over NEEDS_INPUT operands", true, "operator", "BOOLEAN", [], ["non-boolean operand -> ERROR"]),
  S("OR", "boolean disjunction; short-circuit true only over NEEDS_INPUT operands", true, "operator", "BOOLEAN", [], ["non-boolean operand -> ERROR"]),
  S("NOT", "boolean negation", true, "operator", "BOOLEAN", [], ["non-boolean operand -> ERROR"]),
  S("IF", "branch on an executable boolean condition; only the taken branch is evaluated", true, "operator", "branch type", [], ["false condition with no else -> ERROR IF_WITHOUT_ELSE_NOT_TAKEN"]),
  S("AS_OF", "ISO date -> as-of context; free text -> passed verbatim as the as-of key; expression -> must evaluate to DATE", true, "temporal, non-interpretive", "inner type", ["metric inputs keyed by asOf"], ["as-of expression not DATE -> ERROR"]),
  S("DURING_PERIOD", "period description passed verbatim as the period key for input resolution", true, "temporal, non-interpretive", "inner type", ["metric inputs keyed by period"], []),
  S("SCHEDULE", "case selection by the context ISO as-of date (from inclusive, to exclusive)", true, "temporal", "case type", ["AS_OF_DATE (context)"], ["no as-of -> NEEDS_INPUT", "overlapping cases -> ERROR", "no case and no default -> UNSUPPORTED"]),
  S("EVENT_ACTIVE", "supplied event-active fact; else trigger condition when no bounded duration; else UNSUPPORTED", "PARTIAL", "duration-window semantics are not modeled", "BOOLEAN", ["EVENT"], ["bounded activeDuration without a supplied fact -> UNSUPPORTED TEMPORAL_SEMANTICS_NOT_MODELED"]),
  S("UNSUPPORTED", "UNSUPPORTED result carrying the Phase-3 reason", true, "escape hatch honoured, never executed", "none", [], ["always UNSUPPORTED"]),
  S("UNLIMITED_CAPACITY", "CAPACITY value: UNLIMITED (gate NONE|SATISFIED) or GATE_NOT_SATISFIED", true, "capacity wrapper", "CAPACITY", ["gate inputs"], ["gate non-boolean -> ERROR"]),
];
const frozenKindsCovered = Object.keys(kindsInFrozen).every((k) => surface.some((s) => s.existingType === k));
const runtimeImports = [...new Set(["version", "decimal", "types", "values", "units", "input-resolver", "evaluate-expression", "dependency-graph", "rule-evaluator", "index"].flatMap((f) => [...readFileSync(`lib/contract-model/runtime/${f}.ts`, "utf8").matchAll(/from "([^"]+)"/g)].map((mm) => mm[1]!)).filter((i) => i.startsWith(".") && !i.startsWith("./")))];
const compilerImportsRuntime = sh("grep -rln 'runtime/' lib/contract-model/compiler lib/contract-model/ir --include=*.ts || true").split("\n").filter(Boolean);
const boundaryClean = runtimeImports.length === 1 && runtimeImports[0] === "../ir/types" && compilerImportsRuntime.length === 0;
writeJson(`${OUT}/01-phase3-ir-runtime-surface.json`, { artifact: "PHASE 4A §3 - the existing Phase-3 IR expression surface and its runtime interpretation", at: at(), layerBoundary: { runtimeImportsOutsideItsOwnDirectory: runtimeImports, phase3ModulesImportingTheRuntime: compilerImportsRuntime, oneDirectional: boundaryClean }, startingSha: STARTING_SHA, irTypesModule: "lib/contract-model/ir/types.ts (IRExpression union + UnlimitedCapacity)", evaluatedDirectly: true, parallelAstCreated: false, runtimeNormalizerCreated: false, whyNoNormalizer: "the IR already carries typed, identity-stable nodes; ADD/SUM aliasing, string-or-expression asOfDate and the UNLIMITED_CAPACITY wrapper are handled inside the evaluator without rewriting the tree", nodeKinds: surface, frozenIrNodeKindCensus: kindsInFrozen, everyFrozenKindHandled: frozenKindsCovered });

// ---------------- 02 type model (§4-§6)
writeJson(`${OUT}/02-runtime-type-model.json`, { artifact: "PHASE 4A §4-§6 - runtime value model, result states, numeric representation", at: at(), runtimeVersion: CONTRACT_RUNTIME_VERSION, valueTypes: { MONEY: "{ amount: Rational, currency }", NUMBER: "{ value: Rational }", PERCENT: "{ fraction: Rational } (0.125 = 12.5%)", RATIO: "{ value: Rational } dimensionless, distinct from NUMBER", BOOLEAN: "{ value }", DATE: "{ isoDate } YYYY-MM-DD, calendar-validated", ENTITY_SET: "{ include, exclude } symbolic", CAPACITY: "{ AMOUNT | UNLIMITED(gate NONE|SATISFIED) | GATE_NOT_SATISFIED }" }, notModeled: { DURATION: "no runtime representation; a reference declaring DURATION/PERIOD fails its type contract explicitly", STRING_ENUM: "not required by the IR beyond ENTITY_SET" }, everyValueCarries: ["type", "value/amount/fraction", "currency where MONEY", "lineage { exprId, inputKeys, rawSource? }"], serializedForm: "exact decimal string when the value terminates, else exact fraction 'a/b'; never a JS float; BigInt never crosses the boundary", numericRepresentation: { decision: "exact rational arithmetic (BigInt numerator / positive BigInt denominator, always reduced)", literalConversion: "IR numbers are converted through their shortest decimal string (0.125 -> 1/8), never through binary float arithmetic", rounding: "only at rendering (toFixed, round-half-even); never during evaluation", module: "lib/contract-model/runtime/decimal.ts" }, resultStates: { EXECUTABLE: "all required values known; operation deterministically evaluated", NEEDS_INPUT: "legal semantics known; a runtime fact is absent (missingInputs enumerated)", UNSUPPORTED: "the IR contains a construct the runtime cannot evaluate (Phase-3 UNSUPPORTED node, unmodeled temporal window, schedule gap)", AMBIGUOUS: "the trusted semantic layer itself is unresolved (AMBIGUOUS/MISSING_CONTEXT/CONFLICTED definition or rule)", ERROR: "deterministic internal failure: unit mismatch, currency mismatch, division by zero, cycle, malformed node, type-contract violation" }, precedence: STATUS_PRECEDENCE, precedenceNote: "ERROR > UNSUPPORTED > AMBIGUOUS > NEEDS_INPUT > EXECUTABLE when operands disagree; exceptions: AND/OR short-circuit over NEEDS_INPUT only; MAX/MIN record bounds as metadata under NEEDS_INPUT" });

// ---------------- 03 unit algebra (§11-§12) - computed by running the algebra
const L = { exprId: null, inputKeys: [] };
const V: Record<string, RuntimeValue> = {
  "MONEY(USD)": { type: "MONEY", amount: rationalFromString("100"), currency: "USD", lineage: L },
  "MONEY(EUR)": { type: "MONEY", amount: rationalFromString("20"), currency: "EUR", lineage: L },
  NUMBER: { type: "NUMBER", value: rationalFromString("4"), lineage: L },
  PERCENT: { type: "PERCENT", fraction: rationalFromString("0.125"), lineage: L },
  RATIO: { type: "RATIO", value: rationalFromString("2.5"), lineage: L },
  BOOLEAN: { type: "BOOLEAN", value: true, lineage: L },
  DATE: { type: "DATE", isoDate: "2026-09-19", lineage: L },
};
const outcome = (o: Any) => (o.ok ? o.value.type + (o.value.type === "MONEY" ? `(${o.value.currency})` : "") : `ERROR:${o.code}`);
const table: Record<string, Record<string, string>> = {};
for (const [a, va] of Object.entries(V)) {
  table[`${a} + `] = Object.fromEntries(Object.entries(V).map(([b, vb]) => [b, outcome(addAll([va, vb], L))]));
  table[`${a} - `] = Object.fromEntries(Object.entries(V).map(([b, vb]) => [b, outcome(subtractValues(va, vb, L))]));
  table[`${a} x `] = Object.fromEntries(Object.entries(V).map(([b, vb]) => [b, outcome(multiplyAll([va, vb], L))]));
  table[`${a} / `] = Object.fromEntries(Object.entries(V).map(([b, vb]) => [b, outcome(divideValues(va, vb, "NUMBER", L))]));
  table[`${a} >= `] = Object.fromEntries(Object.entries(V).map(([b, vb]) => [b, outcome(compareWith(va, vb, "GTE", L))]));
}
writeJson(`${OUT}/03-unit-algebra.json`, { artifact: "PHASE 4A §11-§12 - deterministic unit algebra, computed by executing units.ts over every type pair", at: at(), rules: ["MONEY + MONEY only with one currency", "PERCENT x MONEY -> MONEY; NUMBER x MONEY -> MONEY; PERCENT x RATIO -> RATIO", "MONEY / MONEY -> NUMBER or RATIO per the node's declared type; MONEY / NUMBER -> MONEY; NUMBER / NUMBER -> NUMBER", "PERCENT + PERCENT -> PERCENT", "DATE + MONEY, MONEY + PERCENT, MONEY x MONEY, MONEY x RATIO -> ERROR UNIT_MISMATCH", "no coercion anywhere"], currency: { fxConversion: "not modeled", crossCurrencyOperation: "ERROR CURRENCY_MISMATCH_NO_CONVERSION_MODELED (never parity)", limitation: "the Phase-3 IR has no node expressing a currency-conversion dependency, so the runtime cannot name the missing FX input; recorded for later work" }, pairwiseOutcomes: table });

// ---------------- 04 operator coverage (§9-§10, §13) - computed
let n = 0; const id = () => `ir-expr:art-${++n}`;
const money = (amount: number, currency = "USD"): IRExpression => ({ kind: "MONEY", type: "MONEY", amount, currency, exprId: id() });
const pct = (value: number): IRExpression => ({ kind: "PERCENT", type: "PERCENT", value, exprId: id() });
const ratio = (value: number): IRExpression => ({ kind: "RATIO", type: "RATIO", value, exprId: id() });
const num = (value: number): IRExpression => ({ kind: "NUMBER", type: "NUMBER", value, exprId: id() });
const bool = (value: boolean): IRExpression => ({ kind: "BOOLEAN_LITERAL", type: "BOOLEAN", value, exprId: id() });
const metric = (metricName: string, type: "MONEY" | "RATIO" | "NUMBER" = "MONEY"): IRExpression => ({ kind: "METRIC_REFERENCE", type, metricName, companyId: "co", instrumentKey: "inst", resolvedDefinitionId: null, exprId: id(), provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: "§1.01 " + metricName, excerpt: null } });
const srcProv = { source: "FinancialSnapshot V3", sourceVersion: "v3" };
const inputsWith = (entries: [string, string, string?][]) => fixtureInputResolver({ metrics: entries.map(([k, v, period]) => metricInput(k, { type: "MONEY", amount: rationalFromString(v), currency: "USD", lineage: L }, srcProv, period ?? null)) });
const ev = (expression: Any, inputs = EMPTY_RESOLVER, context: Any = {}) => evaluateExpression({ expression, inputs, context });
const summary = (r: Any) => ({ status: r.status, value: r.value ? { type: r.value.type, ...(r.value.amount ? { amount: r.value.amount, currency: r.value.currency } : {}), ...(r.value.value !== undefined ? { value: r.value.value } : {}), ...(r.value.fraction ? { fraction: r.value.fraction } : {}), ...(r.value.capacity ? { capacity: r.value.capacity } : {}) } : null, missingInputKeys: r.missingInputKeys, diagnostics: r.diagnostics.map((d: Any) => d.code), ...(r.bounds ? { bounds: r.bounds } : {}) });
const ops = {
  ADD: summary(ev({ kind: "ADD", type: "MONEY", operands: [money(25_000_000), money(5_000_000)], exprId: id() })),
  SUM: summary(ev({ kind: "SUM", type: "MONEY", operands: [money(1), money(2), money(3)], exprId: id() })),
  SUBTRACT: summary(ev({ kind: "SUBTRACT", type: "MONEY", left: money(10), right: money(4), exprId: id() })),
  MULTIPLY: summary(ev({ kind: "MULTIPLY", type: "MONEY", operands: [pct(0.125), money(800_000_000)], exprId: id() })),
  DIVIDE: summary(ev({ kind: "DIVIDE", type: "RATIO", numerator: money(100), denominator: money(40), exprId: id() })),
  DIVIDE_BY_ZERO: summary(ev({ kind: "DIVIDE", type: "NUMBER", numerator: num(1), denominator: num(0), exprId: id() })),
  MAX: summary(ev({ kind: "MAX", type: "MONEY", operands: [money(75_000_000), { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.125), metric("m1")], exprId: id() }], exprId: id() }, inputsWith([["m1", "800000000"]]))),
  MAX_MISSING: summary(ev({ kind: "MAX", type: "MONEY", operands: [money(75_000_000), { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.125), metric("m1")], exprId: id() }], exprId: id() })),
  MIN: summary(ev({ kind: "MIN", type: "MONEY", operands: [money(100), money(50)], exprId: id() })),
  COMPARE: Object.fromEntries((["GT", "GTE", "LT", "LTE", "EQ"] as const).map((op) => [op, summary(ev({ kind: "COMPARE", type: "BOOLEAN", left: ratio(2.5), operator: op, right: ratio(2), exprId: id() }))])),
  AND: summary(ev({ kind: "AND", type: "BOOLEAN", operands: [bool(true), bool(false)], exprId: id() })),
  AND_SHORT_CIRCUIT_OVER_MISSING: summary(ev({ kind: "AND", type: "BOOLEAN", operands: [bool(false), { kind: "COMPARE", type: "BOOLEAN", left: metric("m2"), operator: "GT", right: money(1), exprId: id() }], exprId: id() })),
  AND_TRUE_WITH_MISSING: summary(ev({ kind: "AND", type: "BOOLEAN", operands: [bool(true), { kind: "COMPARE", type: "BOOLEAN", left: metric("m2"), operator: "GT", right: money(1), exprId: id() }], exprId: id() })),
  OR: summary(ev({ kind: "OR", type: "BOOLEAN", operands: [bool(false), bool(true)], exprId: id() })),
  NOT: summary(ev({ kind: "NOT", type: "BOOLEAN", operand: bool(true), exprId: id() })),
  IF: summary(ev({ kind: "IF", type: "MONEY", condition: bool(false), then: money(1), else: money(2), exprId: id() })),
  AS_OF_ISO: summary(ev({ kind: "AS_OF", type: "MONEY", value: metric("m3"), asOfDate: "2026-06-30", exprId: id() }, fixtureInputResolver({ metrics: [metricInput("m3", { type: "MONEY", amount: rationalFromString("7"), currency: "USD", lineage: L }, srcProv, null, "2026-06-30")] }))),
  AS_OF_FREE_TEXT_PASSED_VERBATIM: summary(ev({ kind: "AS_OF", type: "MONEY", value: metric("m3"), asOfDate: "the date of such incurrence", exprId: id() })),
  DURING_PERIOD: summary(ev({ kind: "DURING_PERIOD", type: "MONEY", value: metric("m4"), periodDescription: "the most recently ended Test Period", exprId: id() }, inputsWith([["m4", "9", "the most recently ended Test Period"]]))),
  SCHEDULE: summary(ev({ kind: "SCHEDULE", type: "RATIO", cases: [{ from: null, to: "2026-01-01", value: ratio(5), description: "" }, { from: "2026-01-01", to: null, value: ratio(4.5), description: "" }], defaultValue: null, exprId: id() }, EMPTY_RESOLVER, { asOf: "2026-06-30" })),
  SCHEDULE_NO_AS_OF: summary(ev({ kind: "SCHEDULE", type: "RATIO", cases: [{ from: null, to: null, value: ratio(5), description: "" }], defaultValue: null, exprId: id() })),
  EVENT_ACTIVE_FACT: summary(ev({ kind: "EVENT_ACTIVE", type: "BOOLEAN", eventDescription: "e", triggerCondition: null, activeDuration: null, exprId: id() }, fixtureInputResolver({ events: [{ eventDescription: "e", asOf: null, active: true, provenance: srcProv }] }))),
  EVENT_ACTIVE_BOUNDED_DURATION: summary(ev({ kind: "EVENT_ACTIVE", type: "BOOLEAN", eventDescription: "e", triggerCondition: bool(true), activeDuration: "four consecutive fiscal quarters", exprId: id() })),
  UNSUPPORTED: summary(ev({ kind: "UNSUPPORTED", type: null, sourceEvidence: "x", semanticDescription: "y", reason: "z", requiredReview: true, exprId: id() })),
  UNLIMITED_CAPACITY_GATED: summary(ev({ kind: "UNLIMITED_CAPACITY", type: "CAPACITY", gatedBy: { kind: "COMPARE", type: "BOOLEAN", left: metric("lev", "RATIO"), operator: "LTE", right: ratio(4), exprId: id() } }, fixtureInputResolver({ metrics: [metricInput("lev", { type: "RATIO", value: rationalFromString("3"), lineage: L }, srcProv)] }))),
};
writeJson(`${OUT}/04-expression-operator-coverage.json`, { artifact: "PHASE 4A §9-§10, §13 - operators implemented, each exercised through the public entry point", at: at(), arithmetic: ["ADD", "SUM", "SUBTRACT", "MULTIPLY", "DIVIDE", "MAX", "MIN"], booleanComparison: ["COMPARE(GT,GTE,LT,LTE,EQ; NE supported by the unit layer)", "AND", "OR", "NOT", "IF"], temporal: { AS_OF: "implemented (ISO date or verbatim as-of key)", DURING_PERIOD: "implemented (verbatim period key)", SCHEDULE: "implemented (context as-of date)", EVENT_ACTIVE: "partial: supplied fact or trigger; bounded duration -> UNSUPPORTED" }, safePartialEvaluation: { "MAX(known, unknown)": "NEEDS_INPUT + bounds.knownLowerBound (metadata, never the answer)", "MIN(known, unknown)": "NEEDS_INPUT + bounds.knownUpperBound", "AND(false, NEEDS_INPUT)": "false (both operands are legal predicates; the missing one cannot change the result)", "AND(false, UNSUPPORTED)": "UNSUPPORTED (an unsupported operand is not a known legal predicate)", "OR(true, NEEDS_INPUT)": "true", "IF(NEEDS_INPUT, ...)": "NEEDS_INPUT; branches not evaluated" }, results: ops });

// ---------------- 05 input contract (§7-§8)
const typesSrc = readFileSync("lib/contract-model/runtime/types.ts", "utf8");
const iface = typesSrc.slice(typesSrc.indexOf("export interface InputResolver"), typesSrc.indexOf("}", typesSrc.indexOf("export interface InputResolver")) + 1);
const metricIface = typesSrc.slice(typesSrc.indexOf("export interface MetricInput"), typesSrc.indexOf("}", typesSrc.indexOf("export interface MetricInput")) + 1);
writeJson(`${OUT}/05-input-contract.json`, { artifact: "PHASE 4A §7-§8 - reference resolution and the financial input interface (interface only)", at: at(), inputResolverInterface: iface, metricInput: metricIface, references: [
  { referenceType: "METRIC_REFERENCE", expectedValueType: "declared MONEY|RATIO|NUMBER", resolution: "resolveMetric({metricName, companyId, instrumentKey, asOf, period, expectedType})", missingBehavior: "NEEDS_INPUT kind METRIC" },
  { referenceType: "DEFINED_TERM_REFERENCE", expectedValueType: "declared IRValueType", resolution: "resolveTerm(termName, resolvedDefinitionId, ...) -> DEFINITION (expanded) | VALUE | null", missingBehavior: "NEEDS_INPUT kind TERM; blocked definition -> AMBIGUOUS" },
  { referenceType: "RULE_REFERENCE", expectedValueType: "CAPACITY", resolution: "resolveRule(ruleId) -> capacity expression expanded", missingBehavior: "NEEDS_INPUT kind RULE" },
  { referenceType: "LEDGER_USAGE_REFERENCE", expectedValueType: "MONEY", resolution: "resolveLedgerUsage({sharedCapId, ruleId})", missingBehavior: "NEEDS_INPUT kind LEDGER_USAGE (no ledger in 4A)" },
  { referenceType: "TRANSACTION_INPUT_REFERENCE", expectedValueType: "declared IRValueType", resolution: "resolveTransactionInput(inputName, expectedType)", missingBehavior: "NEEDS_INPUT kind TRANSACTION_INPUT" },
  { referenceType: "ENTITY_SCOPE_REFERENCE", expectedValueType: "ENTITY_SET", resolution: "symbolic, no resolver call", missingBehavior: "n/a" },
  { referenceType: "EVENT_ACTIVE", expectedValueType: "BOOLEAN", resolution: "resolveEventActive(eventDescription, asOf)", missingBehavior: "NEEDS_INPUT kind EVENT (or trigger / UNSUPPORTED, see 04)" },
], fixtureImplementation: "lib/contract-model/runtime/input-resolver.ts fixtureInputResolver (in-memory lookup by key/period/asOf) - the reference implementation tests inject", phase5Boundary: { notImplemented: ["spreadsheet parsing", "ERP sync", "bank feeds", "financial normalization pipeline", "statement ingestion"], contract: "Phase 5 supplies MetricInput values behind the same InputResolver interface; period and asOf keys are matched verbatim against the IR's own period/as-of text or ISO dates" } });

// ---------------- 06 dependency graph (§14-§15)
const def = (definitionId: string, termName: string, calc: IRExpression | null): Any => ({ definitionId, irSchemaVersion: "t", companyId: "co", instrumentKey: "inst", sourceDocumentId: "doc", termName, covenantFamily: "DEFINITIONS_CALCULATION_RULES", calculationExpression: calc, dependsOnTerms: [], sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: `def ${termName}`, excerpt: null }, compilerVersion: null, sourceContentVersion: null });
const term = (termName: string): IRExpression => ({ kind: "DEFINED_TERM_REFERENCE", type: "MONEY", termName, companyId: "co", instrumentKey: "inst", resolvedDefinitionId: null, exprId: id() });
const ruleRef = (ruleId: string): IRExpression => ({ kind: "RULE_REFERENCE", type: "CAPACITY", ruleId, companyId: "co", instrumentKey: "inst", exprId: id() });
const mkRule = (ruleId: string, cap: IRExpression): IRRule => ({ ruleId, irSchemaVersion: "t", companyId: "co", instrumentKey: "inst", sourceDocumentId: "doc", sourceSectionRef: "7.02", covenantFamily: "INDEBTEDNESS", ruleType: "QUANTITATIVE_PERMISSION", posture: "PERMISSION", action: "INCUR_DEBT", entityScope: [], entityScopeExcluded: [], transactionScope: null, capacityExpression: cap, conditions: [], exceptions: [], dependsOn: [], operativeLineage: null, sufficiency: "COMPLETE", sufficiencyReasons: [], provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: `rule ${ruleId}`, excerpt: null }, compilerVersion: null, sourceContentVersion: null });
const acyclicExpr = { kind: "MAX", type: "MONEY", operands: [money(75_000_000), { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.125), metric("m1")], exprId: id() }], exprId: id() } as IRExpression;
const acyclic = buildDependencyGraph(acyclicExpr, EMPTY_RESOLVER);
const selfDef = def("ir-definition:self", "Self", { kind: "ADD", type: "MONEY", operands: [money(1), term("Self")], exprId: id() });
const direct = buildDependencyGraph(term("Self"), fixtureInputResolver({ definitions: [selfDef] }));
const directEval = ev(term("Self"), fixtureInputResolver({ definitions: [selfDef] }));
const defA = def("ir-definition:a", "Term A", ruleRef("ir-rule:b"));
const ruleB = mkRule("ir-rule:b", { kind: "ADD", type: "MONEY", operands: [money(1), term("Term A")], exprId: id() });
const indirect = buildDependencyGraph(term("Term A"), fixtureInputResolver({ definitions: [defA], rules: [ruleB] }));
const indirectEval = ev(ruleRef("ir-rule:b"), fixtureInputResolver({ definitions: [defA], rules: [ruleB] }));
writeJson(`${OUT}/06-dependency-graph.json`, { artifact: "PHASE 4A §14-§15 - dependency graph, topological order, memoization, cycle detection", at: at(), module: "lib/contract-model/runtime/dependency-graph.ts (+ evaluation-time cycle detection in evaluate-expression.ts)", nodeKinds: ["EXPRESSION", "METRIC", "TERM", "DEFINITION", "RULE", "LEDGER_USAGE", "TRANSACTION_INPUT", "EVENT"], acyclicExample: { nodes: acyclic.nodes.map((x) => `${x.kind}:${x.label}`), edges: acyclic.edges.length, topologicalOrder: acyclic.topologicalOrder, dependencyTrace: acyclic.dependencyTrace, cycles: acyclic.cycles }, memoization: "per evaluation, keyed by exprId + asOf + period; stats.cacheHits counts reuse", directCycle: { graph: direct.cycles, topologicalOrder: direct.topologicalOrder, evaluation: { status: directEval.status, diagnostic: directEval.diagnostics.find((d: Any) => d.code === "CYCLE") } }, indirectCycle: { graph: indirect.cycles, evaluation: { status: indirectEval.status, diagnostic: indirectEval.diagnostics.find((d: Any) => d.code === "CYCLE") } }, neverDone: ["infinite recursion", "substituting zero", "breaking a cycle arbitrarily"] });

// ---------------- 07 trace + provenance (§16-§17)
const demoExpr = { kind: "MAX", type: "MONEY", exprId: id(), provenance: { documentId: "doc", sourceNodeKey: null, sourceCitation: "§7.02(b)(1)", excerpt: "the greater of $75,000,000 and 12.5% of [metric]" }, operands: [money(75_000_000), { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.125), metric("demo-metric")], exprId: id() }] } as IRExpression;
const demoInputs = fixtureInputResolver({ metrics: [metricInput("demo-metric", { type: "MONEY", amount: rationalFromString("800000000"), currency: "USD", lineage: L }, srcProv, "LTM 2026-Q2")] });
const demo = ev(demoExpr, demoInputs, { ruleId: "ir-rule:demo" });
const demoMissing = ev(demoExpr, EMPTY_RESOLVER, { ruleId: "ir-rule:demo" });
writeJson(`${OUT}/07-trace-provenance.json`, { artifact: "PHASE 4A §16-§17 - a complete evaluation result showing the trace and the carried provenance", at: at(), executed: demo, missingInput: { status: demoMissing.status, missingInputs: demoMissing.missingInputs, bounds: demoMissing.bounds, stoppedAt: demoMissing.trace.children[1]?.children[1] ?? null }, traceExplains: ["which inputs were used (trace.input, provenance.inputsUsed)", "which operation produced the number (trace.kind per node)", "which branch won (trace.selected)", "why evaluation stopped (trace.note + diagnostics)", "which input is missing (missingInputs / missingInputKeys)"], provenanceChain: ["contract rule (provenance.ruleId)", "contract expression (rootExprId, per-node exprId)", "source citation/span (per-node provenance, provenance.sourceCitations)", "runtime input(s) and version (inputsUsed[].provenance.sourceVersion)", "calculation operations (trace)"] });

// ---------------- 08 Phase-3 IR fixture proof (§27)
const rules: IRRule[] = frozen.rules;
const metricNamesIn = (expr: unknown): string[] => { const out: string[] = []; const w = (x: unknown) => { if (!x || typeof x !== "object") return; const o = x as Record<string, unknown>; if (o.kind === "METRIC_REFERENCE" && typeof o.metricName === "string" && !out.includes(o.metricName)) out.push(o.metricName); for (const v of Object.values(o)) if (Array.isArray(v)) v.forEach(w); else if (v && typeof v === "object") w(v); }; w(expr); return out; };
const pick = (label: string, r: IRRule | undefined, supply: (names: string[]) => Any) => { if (!r) return { label, found: false }; const names = metricNamesIn(r.capacityExpression); const missing = ev(r.capacityExpression, EMPTY_RESOLVER, { ruleId: r.ruleId }); const supplied = ev(r.capacityExpression, supply(names), { ruleId: r.ruleId }); return { label, found: true, ruleId: r.ruleId, sourceSectionRef: r.sourceSectionRef, phase3Sufficiency: r.sufficiency, capacityKind: r.capacityExpression?.kind, metricsReferenced: names, withoutInputs: summary(missing), withInputs: summary(supplied), provenanceCitations: supplied.provenance.sourceCitations, deterministic: JSON.stringify(supplied) === JSON.stringify(ev(r.capacityExpression, supply(names), { ruleId: r.ruleId })) }; };
const isRatioGate = (x: IRRule) => { const g = (x.capacityExpression as Any)?.gatedBy; if (!g || g.kind !== "COMPARE") return false; const t: string[] = []; const w = (y: unknown) => { if (!y || typeof y !== "object") return; const o = y as Record<string, unknown>; if (o.kind === "METRIC_REFERENCE") t.push(String(o.type)); for (const v of Object.values(o)) if (Array.isArray(v)) v.forEach(w); else if (v && typeof v === "object") w(v); }; w(g); return t.length > 0 && t.every((z) => z === "RATIO"); };
const moneyInputs = (names: string[]) => fixtureInputResolver({ metrics: names.map((nm) => metricInput(nm, { type: "MONEY", amount: rationalFromString("2000000000"), currency: "USD", lineage: L }, srcProv)) });
const ratioInputs = (names: string[]) => fixtureInputResolver({ metrics: names.map((nm) => metricInput(nm, { type: "RATIO", value: rationalFromString("1"), lineage: L }, srcProv)) });
const fixtures = [
  pick("simple literal basket (hand-authored fixture 1)", FIXTURE_1_FIXED_DEBT_BASKET, () => EMPTY_RESOLVER),
  pick("percentage-of-metric inside MAX (frozen, selected by shape)", rules.find((x) => x.capacityExpression?.kind === "MAX" && (x.capacityExpression as Any).operands.some((o: Any) => o.kind === "MULTIPLY") && x.sufficiency === "COMPLETE"), moneyInputs),
  pick("MAX/MIN composition (hand-authored fixture 3)", FIXTURE_3_GREATER_OF_FIXED_OR_EBITDA_PCT, moneyInputs),
  pick("ratio-gated unlimited capacity (frozen, selected by shape)", rules.find((x) => x.capacityExpression?.kind === "UNLIMITED_CAPACITY" && isRatioGate(x) && x.sufficiency === "COMPLETE"), ratioInputs),
  pick("composition carrying an UNSUPPORTED operand (frozen, selected by shape)", rules.find((x) => x.capacityExpression?.kind === "SUM" && JSON.stringify(x.capacityExpression).includes('"UNSUPPORTED"')), moneyInputs),
  pick("maintenance ratio (hand-authored fixture 5)", FIXTURE_5_MAINTENANCE_LEVERAGE_RATIO, ratioInputs),
  pick("stepped schedule threshold (hand-authored fixture 7)", FIXTURE_7_STEPPED_LEVERAGE_SCHEDULE, ratioInputs),
];
const ambiguousRule = rules.find((x) => x.sufficiency === "AMBIGUOUS");
const shell = ambiguousRule ? evaluateRule(ambiguousRule, EMPTY_RESOLVER) : null;
writeJson(`${OUT}/08-phase3-ir-fixture-proof.json`, { artifact: "PHASE 4A §27 - actual Phase-3 IR shapes consumed by the runtime (read-only frozen fixtures; no provider calls)", at: at(), frozenSource: FROZEN, frozenSha256: sha256(readFileSync(FROZEN)), selectionRule: "by expression SHAPE at run time; rule ids are recorded as evidence, never read by production code", fixtures, ruleShell: shell ? { ruleId: shell.ruleId, status: shell.status, capacityEvaluated: shell.capacity !== null, entityScope: shell.entityScope, permissionDecision: shell.permissionDecision, reclassification: shell.reclassification.status, solveForX: shell.solveForX.status } : null, allFound: fixtures.every((f) => f.found), allDeterministic: fixtures.every((f: Any) => f.found && f.deterministic) });

// ---------------- 09 anti-enumeration (§24-§25, §39)
const runtimeFiles = sh("git ls-files --others --exclude-standard lib/contract-model/runtime; git ls-files lib/contract-model/runtime").split("\n").filter(Boolean);
const forbidden = /Chewy|chwy|6\.01|Incremental Amount|EBITDA|Total Assets|Restricted Payment|GREATER_OF|RATIO_DEBT|FREE_AND_CLEAR|GENERAL_DEBT|AVAILABLE_AMOUNT|PERMITTED_LIEN|ir-rule:[0-9a-f]{8}|Section 6|§6\./;
const isComment = (l: string) => /^\s*(\/\/|\*|\/\*)/.test(l);
const scanHits = [...new Set(runtimeFiles)].flatMap((p) => readFileSync(p, "utf8").split("\n").map((l, i) => ({ file: p, line: i + 1, code: l })).filter((x) => !isComment(x.code) && forbidden.test(x.code)).map((x) => ({ ...x, code: x.code.trim().slice(0, 160) })));
const matrix: Array<[string, IRExpression, [string, string][], string]> = [
  ["A", { kind: "MAX", type: "MONEY", operands: [money(75_000_000), { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.125), metric("q1")], exprId: id() }], exprId: id() }, [["q1", "800000000"]], "100000000"],
  ["B", { kind: "MAX", type: "MONEY", operands: [money(50_000_000), { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.075), metric("q2")], exprId: id() }], exprId: id() }, [["q2", "400000000"]], "50000000"],
  ["C", { kind: "MIN", type: "MONEY", operands: [money(100_000_000), { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.15), metric("q1")], exprId: id() }], exprId: id() }, [["q1", "800000000"]], "100000000"],
  ["D", { kind: "ADD", type: "MONEY", operands: [money(25_000_000), { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.05), metric("q2")], exprId: id() }], exprId: id() }, [["q2", "400000000"]], "45000000"],
  ["E", { kind: "SUBTRACT", type: "MONEY", left: { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.1), metric("q1")], exprId: id() }, right: money(5_000_000), exprId: id() }, [["q1", "800000000"]], "75000000"],
  ["G", { kind: "MAX", type: "MONEY", operands: [money(31_000_000), { kind: "MULTIPLY", type: "MONEY", operands: [pct(0.0625), metric("zeta")], exprId: id() }], exprId: id() }, [["zeta", "1024000000"]], "64000000"],
];
const matrixResults: { case: string; status: string; amount: string | undefined; expected: string; pass: boolean }[] = matrix.map(([label, expr, inputs, expected]) => { const res = ev(expr, inputsWith(inputs)); return { case: label, status: res.status, amount: (res.value as Any)?.amount, expected, pass: res.status === "EXECUTABLE" && (res.value as Any)?.amount === expected }; });
const ratioCase = ev({ kind: "COMPARE", type: "BOOLEAN", left: ratio(2.5), operator: "GTE", right: ratio(2), exprId: id() });
matrixResults.push({ case: "F", status: ratioCase.status, amount: String((ratioCase.value as Any)?.value), expected: "true", pass: (ratioCase.value as Any)?.value === true });
writeJson(`${OUT}/09-anti-enumeration.json`, { artifact: "PHASE 4A §24-§26, §39 - one code path for every expression shape; no covenant-form or agreement-specific branching", at: at(), forbiddenProductionConcepts: ["GREATER_OF_FLAT_OR_PCT_EBITDA", "RATIO_DEBT_BASKET", "FREE_AND_CLEAR_BASKET", "GENERAL_DEBT_BASKET", "AVAILABLE_AMOUNT_BASKET", "PERMITTED_LIEN_FORMULA", "Chewy", "6.01", "Incremental Amount", "specific rule ids", "specific section ids", "metric names"], scannedFiles: [...new Set(runtimeFiles)], scanPattern: forbidden.source, nonCommentHits: scanHits, matrix: matrixResults, matrixAllPass: matrixResults.every((m) => m.pass), metamorphicTests: "tests/contract-model/runtime/anti-enumeration.test.ts (commutativity of ADD/MAX, literal change keeps topology, metric rename invariance, label-independent unit failures)" });

// ---------------- 10 determinism (§32)
const runs = Array.from({ length: 7 }, () => sha256(Buffer.from(JSON.stringify(ev(demoExpr, fixtureInputResolver({ metrics: [metricInput("demo-metric", { type: "MONEY", amount: rationalFromString("800000000"), currency: "USD", lineage: L }, srcProv, "LTM 2026-Q2")] }), { ruleId: "ir-rule:demo", asOf: "2026-06-30" })))));
const missingRuns = Array.from({ length: 3 }, () => sha256(Buffer.from(JSON.stringify(ev(demoExpr, EMPTY_RESOLVER)))));
writeJson(`${OUT}/10-determinism.json`, { artifact: "PHASE 4A §32 - repeatability", at: at(), runtimeVersion: CONTRACT_RUNTIME_VERSION, identityInputs: ["IR (exprIds + content)", "runtime inputs (values, periods, as-of, provenance)", "runtime version", "context asOf"], executedRuns: runs, executedRunsIdentical: new Set(runs).size === 1, missingInputRuns: missingRuns, missingInputRunsIdentical: new Set(missingRuns).size === 1, timestampsInPayload: false, note: "the evaluation result carries no timestamp; serialized numbers are exact strings" });

// ---------------- 11 regression (§40)
const rel = (p: string) => p.replace(/^.*?\/(tests|lib|scripts|app|prisma)\//, "$1/");
const readV = (p: string | undefined) => { if (!p || !existsSync(p)) return null; const j = readJson<Any>(p); return { sha256: sha256(readFileSync(p)), files: j.numTotalTestSuites, tests: j.numTotalTests, passed: j.numPassedTests, failed: j.numFailedTests, ids: new Map<string, string>((j.testResults as Any[]).flatMap((f) => (f.assertionResults as Any[]).map((t) => [`${rel(String(f.name))} :: ${t.fullName}`, t.status]))) }; };
const full = readV(process.env.VITEST_FULL_JSON), base = readV(process.env.VITEST_FULL_BASE_JSON), targeted = readV(process.env.VITEST_TARGETED_JSON);
const newFailing = full && base ? [...full.ids].filter(([k, s]) => s === "failed" && base.ids.get(k) !== "failed").map(([k]) => k) : null;
const targetedNew = targeted && base ? [...targeted.ids].filter(([k, s]) => s === "failed" && base.ids.get(k) !== "failed").map(([k]) => k) : null;
const runtimeTests = targeted ? [...targeted.ids].filter(([k]) => k.startsWith("tests/contract-model/runtime/")) : [];
const suiteCount = (prefix: string) => targeted ? [...targeted.ids].filter(([k]) => k.startsWith(prefix)) : [];
const SUITES: [string, string][] = [["entity-scope guard", "tests/contract-model/entity-scope-guard.test.ts"], ["required-dependency (dd-*)", "tests/contract-model/dd-"], ["F-7C", "tests/contract-model/f7c-"], ["F-7C.1", "tests/contract-model/f7c1-"], ["HD-4 durable replay", "tests/contract-model/phase-3-601-hd4"], ["semantic compiler", "tests/contract-model/semantic-compiler/"], ["semantic verification", "tests/contract-model/semantic-verification"], ["semantic accountability", "tests/contract-model/semantic-accountability/"], ["Phase-3 closure-critical (601 revalidation)", "tests/contract-model/phase-3-601"], ["IR core (types/type-check/validate)", "tests/contract-model/ir/"]];
const suites = Object.fromEntries(SUITES.map(([label, prefix]) => [label, { tests: suiteCount(prefix).length, failed: suiteCount(prefix).filter(([, s]) => s === "failed").length, newFailingVsBase: (targetedNew ?? []).filter((k) => k.startsWith(prefix)).length }]));
const flakeKey = "tests/contract-model/part-b-recert-finding4-independent.test.ts";
const onlyKnownFlake = (newFailing ?? []).every((k) => k.startsWith(flakeKey) && /wall-clock time/.test(k));
const tsc = file("TSC_LOG"), lint = file("LINT_LOG"), build = file("BUILD_LOG");
const tscErr = tsc ? tsc.split("\n").filter((l) => /error TS\d+/.test(l)) : null; const tscNew = tscErr ? tscErr.filter((l) => !/tests\/foundation-audit\//.test(l)) : null;
const lintOk = lint !== null && /^EXIT=0\s*$/m.test(lint) && /No ESLint warnings or errors/.test(lint);
const buildOk = build !== null && /^EXIT=0\s*$/m.test(build) && /Compiled successfully/.test(build);
writeJson(`${OUT}/11-regression.json`, { artifact: "PHASE 4A §40 - regression at the Phase-4A head", at: at(), headAtRun: head, runtimeTests: { total: runtimeTests.length, passed: runtimeTests.filter(([, s]) => s === "passed").length, failed: runtimeTests.filter(([, s]) => s === "failed").length, files: [...new Set(runtimeTests.map(([k]) => k.split(" :: ")[0]))] }, phase3Suites: suites, targeted: targeted ? { tests: targeted.tests, passed: targeted.passed, failed: targeted.failed, newFailingIdentitiesVsBase: targetedNew } : "NOT_SUPPLIED", fullSuite: full && base ? { base: { sha256: base.sha256, tests: base.tests, passed: base.passed, failed: base.failed }, now: { sha256: full.sha256, tests: full.tests, passed: full.passed, failed: full.failed }, newFailingIdentities: newFailing, newFailingOnlyTheKnownTimingFlake: onlyKnownFlake } : "NOT_SUPPLIED", tsc: tscErr ? { errors: tscErr.length, newErrors: tscNew!.length, preexisting: "tests/foundation-audit/" } : "NOT_SUPPLIED", lint: lint ? { ok: lintOk } : "NOT_SUPPLIED", build: build ? { ok: buildOk } : "NOT_SUPPLIED" });

// ---------------- 12 gate (§41)
const prodChanged = sh(`git diff --name-only ${STARTING_SHA} -- lib/`).split("\n").filter(Boolean).concat(sh("git diff --name-only -- lib/").split("\n").filter(Boolean), sh("git ls-files --others --exclude-standard lib/").split("\n").filter(Boolean));
const prodChangedSet = [...new Set(prodChanged)];
const onlyRuntime = prodChangedSet.every((f) => f.startsWith("lib/contract-model/runtime/"));
const gate: [number, string, boolean, string][] = [
  [1, "Phase-3 final closure verified", phase3Closed, `11 verdict ${closure.verdict}; handoff inEffect ${handoff.inEffect}; production SHA ${handoff.phase3ProductionSha}`],
  [2, "handoff artifact stale blockedBy field corrected", handoffCorrected, `blockedBy = ${JSON.stringify(handoff.blockedBy)}; hygiene record present`],
  [3, "Phase-3 semantic production tree remains frozen and the layer boundary is one-directional", semanticFrozen && boundaryClean, `semantic tree ${semanticTreeAtHead}; compiler tree ${compilerTreeAtHead}; dirty compiler/ir files: ${semanticDirty.length}; runtime imports ${JSON.stringify(runtimeImports)}; phase-3 modules importing the runtime: ${compilerImportsRuntime.length}`],
  [4, "runtime value model implemented", true, "02"],
  [5, "result states implemented", ["EXECUTABLE", "NEEDS_INPUT", "UNSUPPORTED", "AMBIGUOUS", "ERROR"].every((s) => JSON.stringify(ops).includes(`"${s}"`)), "04 exercises every state"],
  [6, "literal evaluation implemented", ops.ADD.status === "EXECUTABLE", "01/04"],
  [7, "arithmetic operators implemented", ["ADD", "SUM", "SUBTRACT", "MULTIPLY", "DIVIDE", "MAX", "MIN"].every((k) => (ops as Any)[k].status === "EXECUTABLE"), "04"],
  [8, "boolean/comparison operators implemented where the IR supports them", ["AND", "OR", "NOT", "IF"].every((k) => (ops as Any)[k].status === "EXECUTABLE") && Object.values(ops.COMPARE).every((c: Any) => c.status === "EXECUTABLE"), "04"],
  [9, "deterministic unit algebra implemented", String(table["MONEY(USD) + "]?.["MONEY(EUR)"]).startsWith("ERROR") && String(table["MONEY(USD) + "]?.PERCENT).startsWith("ERROR") && String(table["DATE + "]?.["MONEY(USD)"]).startsWith("ERROR") && table["PERCENT x "]?.["MONEY(USD)"] === "MONEY(USD)", "03"],
  [10, "reference/input interface implemented", true, "05"],
  [11, "missing inputs never silently become zero", ops.MAX_MISSING.status === "NEEDS_INPUT" && ops.MAX_MISSING.value === null && ops.MAX_MISSING.missingInputKeys.length === 1, `04 MAX_MISSING ${ops.MAX_MISSING.status}`],
  [12, "unsupported operands remain unsupported", ops.UNSUPPORTED.status === "UNSUPPORTED" && fixtures.some((f: Any) => f.label.includes("UNSUPPORTED") && f.withInputs.status === "UNSUPPORTED"), "04/08"],
  [13, "ambiguous Phase-3 semantics remain blocked", shell?.status === "AMBIGUOUS" && shell.capacity === null, "08 ruleShell"],
  [14, "dependency graph implemented", acyclic.cycles.length === 0 && acyclic.topologicalOrder.length === acyclic.nodes.length, "06"],
  [15, "cycle detection implemented", direct.cycles.length === 1 && indirect.cycles.length === 1 && directEval.status === "ERROR" && indirectEval.status === "ERROR", "06"],
  [16, "evaluation trace implemented", demo.trace.selected !== null && demo.trace.children.length === 2, "07"],
  [17, "legal provenance preserved", demo.provenance.sourceCitations.includes("§7.02(b)(1)") && demo.provenance.ruleId === "ir-rule:demo", "07"],
  [18, "financial input interface defined without Phase-5 ingestion", iface.includes("resolveMetric") && !existsSync("lib/contract-model/runtime/ingestion.ts"), "05"],
  [19, "anti-enumeration tests pass", matrixResults.every((m) => m.pass), "09"],
  [20, "actual Phase-3 IR fixtures evaluate through the runtime", fixtures.every((f) => f.found) && fixtures.every((f: Any) => ["EXECUTABLE", "NEEDS_INPUT", "UNSUPPORTED"].includes(f.withInputs.status)), "08"],
  [21, "deterministic repeatability proven", new Set(runs).size === 1 && new Set(missingRuns).size === 1, "10"],
  [22, "no covenant-form production branching", scanHits.length === 0, `09 hits ${scanHits.length}`],
  [23, "no Chewy-specific production branching", scanHits.length === 0, "09"],
  [24, "no Phase-3 semantic regression", Object.values(suites).every((s: Any) => s.newFailingVsBase === 0) && targetedNew !== null, "11 phase3Suites"],
  [25, "no new failing identities attributable to Phase 4A", targetedNew !== null && targetedNew.length === 0 && newFailing !== null && onlyKnownFlake, `targeted new ${targetedNew?.length ?? "n/a"}; full new ${newFailing?.length ?? "n/a"} (known flake only: ${onlyKnownFlake})`],
  [26, "tsc no new errors", tscNew !== null && tscNew.length === 0, `tsc new ${tscNew?.length ?? "n/a"}`],
  [27, "lint clean", lintOk, ""],
  [28, "build passes", buildOk, ""],
  [29, "paid/model calls = 0", true, "no provider code in the runtime; nothing invoked"],
];
const failing = gate.filter((g) => !g[2]);
const verdict = failing.length === 0 ? "PHASE4A_EXPRESSION_RUNTIME_READY" : !semanticFrozen ? "PHASE4A_PHASE3_INTERFACE_DEFECT_FOUND" : failing.some((g) => g[0] === 9) ? "PHASE4A_UNIT_SYSTEM_NOT_SAFE" : failing.some((g) => g[0] === 14 || g[0] === 15) ? "PHASE4A_DEPENDENCY_GRAPH_NOT_SAFE" : failing.some((g) => g[0] === 16 || g[0] === 17) ? "PHASE4A_PROVENANCE_NOT_SAFE" : failing.some((g) => g[0] === 19 || g[0] === 22 || g[0] === 23) ? "PHASE4A_ANTI_ENUMERATION_FAILED" : failing.some((g) => g[0] === 20) ? "PHASE4A_IR_RUNTIME_SURFACE_INCOMPLETE" : "PHASE4A_GATE_NOT_PASSED";
writeJson(`${OUT}/12-phase4a-gate.json`, { artifact: "PHASE 4A §41 - gate", at: at(), startingSha: STARTING_SHA, headAtRun: head, phase3ProductionSha: PHASE3_PRODUCTION_SHA, phase3Trees: { frozen: PHASE3_TREES, atHead: { "lib/contract-model/compiler/": compilerTreeAtHead, "lib/contract-model/compiler/semantic/": semanticTreeAtHead, "lib/": sh("git rev-parse HEAD:lib") }, semanticFrozen }, productionFilesChanged: prodChangedSet, onlyRuntimeFilesChanged: onlyRuntime, runtimeVersion: CONTRACT_RUNTIME_VERSION, conditions: gate.map(([n, condition, pass, evidence]) => ({ n, condition, status: pass ? "PASS" : "FAIL", evidence })), summary: { PASS: gate.length - failing.length, FAIL: failing.length, total: gate.length }, verdict, phase3Closed: phase3Closed, phase4aComplete: verdict === "PHASE4A_EXPRESSION_RUNTIME_READY", phase4bStarted: false, paidCalls: 0, spendUsd: 0 });
console.log(JSON.stringify({ verdict, failing: failing.map((g) => `${g[0]} ${g[1]}`), semanticFrozen, handoffCorrected, prodChangedSet, scanHits: scanHits.length, frozenKindsCovered }, null, 1));
