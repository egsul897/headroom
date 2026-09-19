/**
 * PHASE 4A - the deterministic expression evaluator.
 *
 * Consumes the Phase-3 compositional IR directly (no parallel AST). Every
 * node yields an explicit result state; nothing is coerced, guessed or
 * repaired. Public entry point: evaluateExpression(). Total over valid
 * serialized IR: expected bad states are structured results, never thrown.
 */
import type { IRCapacityExpression, IRDefinition, IRExpression, IRRule, IRValueType, RepresentationSufficiency, SourceProvenance } from "../ir/types";
import * as R from "./decimal";
import type { EvaluationContext, EvaluationResult, InputResolver, MetricInput, MissingInput, MissingInputKind, ResolvedInputRecord, RuntimeDiagnostic, RuntimeDiagnosticCode, RuntimeStatus, RuntimeValue, SerializedRuntimeValue, TraceNode } from "./types";
import { STATUS_PRECEDENCE } from "./types";
import { addAll, compareWith, divideValues, extreme, multiplyAll, subtractValues } from "./units";
import { boolean, capacity, date, entitySet, isIsoDate, lineage, money, number, percent, ratio, serializeValue, withLineage } from "./values";
import { CONTRACT_RUNTIME_VERSION } from "./version";

export interface EvaluateExpressionArgs {
  expression: IRCapacityExpression;
  inputs: InputResolver;
  context?: EvaluationContext;
}

interface Env { asOf: string | null; period: string | null; depth: number }

interface NodeResult {
  status: RuntimeStatus;
  value: RuntimeValue | null;
  missing: MissingInput[];
  diagnostics: RuntimeDiagnostic[];
  bounds: { knownLowerBound?: RuntimeValue; knownUpperBound?: RuntimeValue } | null;
  trace: TraceNode;
}

const BLOCKED_SUFFICIENCY: RepresentationSufficiency[] = ["AMBIGUOUS", "MISSING_CONTEXT", "CONFLICTED"];

function worst(statuses: RuntimeStatus[]): RuntimeStatus {
  return statuses.reduce<RuntimeStatus>((w, s) => (STATUS_PRECEDENCE[s] > STATUS_PRECEDENCE[w] ? s : w), "EXECUTABLE");
}

function valueMatchesType(v: RuntimeValue, expected: IRValueType | "CAPACITY"): boolean {
  if (expected === "CAPACITY") return v.type === "MONEY" || v.type === "CAPACITY";
  if (expected === "DURATION" || expected === "PERIOD") return false;
  return v.type === expected;
}

class Evaluator {
  private readonly memo = new Map<string, NodeResult>();
  private readonly expansionStack: string[] = [];
  readonly inputsUsed: ResolvedInputRecord[] = [];
  readonly citations: string[] = [];
  readonly expanded: { kind: "DEFINITION" | "RULE"; id: string }[] = [];
  nodesEvaluated = 0;
  cacheHits = 0;
  maxDepth = 0;
  referenceNodes = 0;

  constructor(private readonly inputs: InputResolver, private readonly context: EvaluationContext) {}

  // ---- helpers -------------------------------------------------------------

  private prov(expr: { provenance?: SourceProvenance }): SourceProvenance | null {
    const p = expr.provenance ?? null;
    if (p && !this.citations.includes(p.sourceCitation)) this.citations.push(p.sourceCitation);
    return p;
  }

  private trace(expr: { exprId?: string; kind: string; provenance?: SourceProvenance }, status: RuntimeStatus, value: RuntimeValue | null, children: TraceNode[], extra: Partial<TraceNode> = {}): TraceNode {
    return { exprId: expr.exprId ?? null, kind: expr.kind, status, value: value ? serializeValue(value) : null, provenance: this.prov(expr), children, ...extra };
  }

  private done(expr: { exprId?: string; kind: string; provenance?: SourceProvenance }, value: RuntimeValue, children: NodeResult[] = [], extra: Partial<TraceNode> = {}): NodeResult {
    return { status: "EXECUTABLE", value, missing: [], diagnostics: children.flatMap((c) => c.diagnostics), bounds: null, trace: this.trace(expr, "EXECUTABLE", value, children.map((c) => c.trace), extra) };
  }

  private fail(expr: { exprId?: string; kind: string; provenance?: SourceProvenance }, status: RuntimeStatus, code: RuntimeDiagnosticCode, message: string, children: NodeResult[] = [], phase3Reason?: string, missing: MissingInput[] = []): NodeResult {
    const diag: RuntimeDiagnostic = { code, status, message, exprId: expr.exprId ?? null, provenance: expr.provenance ?? null, ...(phase3Reason !== undefined ? { phase3Reason } : {}) };
    return { status, value: null, missing: [...children.flatMap((c) => c.missing), ...missing], diagnostics: [...children.flatMap((c) => c.diagnostics), diag], bounds: null, trace: this.trace(expr, status, null, children.map((c) => c.trace), { note: message }) };
  }

  /** Combine non-executable children by precedence; carries every missing input and diagnostic upward. */
  private propagate(expr: { exprId?: string; kind: string; provenance?: SourceProvenance }, children: NodeResult[], extra: Partial<TraceNode> = {}, bounds: NodeResult["bounds"] = null): NodeResult {
    const status = worst(children.map((c) => c.status));
    return { status, value: null, missing: children.flatMap((c) => c.missing), diagnostics: children.flatMap((c) => c.diagnostics), bounds, trace: this.trace(expr, status, null, children.map((c) => c.trace), { ...extra, ...(bounds ? { bounds: { ...(bounds.knownLowerBound ? { knownLowerBound: serializeValue(bounds.knownLowerBound) } : {}), ...(bounds.knownUpperBound ? { knownUpperBound: serializeValue(bounds.knownUpperBound) } : {}) } } : {}) }) };
  }

  private needsInput(expr: IRExpression, kind: MissingInputKind, key: string, env: Env, expectedType: IRValueType | "CAPACITY" | null, note: string): NodeResult {
    const missing: MissingInput = { kind, key, exprId: expr.exprId ?? null, asOf: env.asOf, period: env.period, expectedType };
    return this.fail(expr, "NEEDS_INPUT", "MISSING_INPUT", note, [], undefined, [missing]);
  }

  private useInput(expr: IRExpression, kind: MissingInputKind, key: string, input: MetricInput, expected: IRValueType | "CAPACITY", env: Env): NodeResult {
    if (!valueMatchesType(input.value, expected)) return this.fail(expr, "ERROR", "INPUT_TYPE_MISMATCH", `input "${key}" supplied a ${input.value.type} value where the IR declares ${expected}`);
    const value = withLineage(input.value, lineage(expr.exprId ?? null, [key]));
    const record: ResolvedInputRecord = { kind, key, period: input.period ?? env.period, asOf: input.asOf ?? env.asOf, provenance: input.provenance, value: serializeValue(value) };
    this.inputsUsed.push(record);
    return this.done(expr, value, [], { input: record });
  }

  private unitOutcome(expr: IRExpression, outcome: ReturnType<typeof addAll>, children: NodeResult[], extra: Partial<TraceNode> = {}): NodeResult {
    if (outcome.ok) return this.done(expr, outcome.value, children, extra);
    return this.fail(expr, "ERROR", outcome.code, outcome.message, children);
  }

  private blockedBySufficiency(expr: IRExpression, kind: "DEFINITION" | "RULE", id: string, sufficiency: RepresentationSufficiency, reasons: string[]): NodeResult | null {
    if (!BLOCKED_SUFFICIENCY.includes(sufficiency)) return null;
    return this.fail(expr, "AMBIGUOUS", "AMBIGUOUS_SEMANTICS", `${kind.toLowerCase()} ${id} is ${sufficiency} in the trusted IR; the runtime does not resolve it`, [], reasons.join(" | "));
  }

  private cycle(expr: IRExpression, frame: string): NodeResult | null {
    const at = this.expansionStack.indexOf(frame);
    if (at < 0) return null;
    const path = [...this.expansionStack.slice(at), frame];
    return this.fail(expr, "ERROR", "CYCLE", `dependency cycle: ${path.join(" -> ")}`);
  }

  // ---- entry ---------------------------------------------------------------

  evaluate(expr: IRCapacityExpression, env: Env): NodeResult {
    if (expr.kind === "UNLIMITED_CAPACITY") return this.evalUnlimited(expr, env);
    const key = expr.exprId ? `${expr.exprId}|${env.asOf ?? ""}|${env.period ?? ""}` : null;
    if (key) {
      const hit = this.memo.get(key);
      if (hit) { this.cacheHits++; return { ...hit, trace: { ...hit.trace, cacheHit: true } }; }
    }
    this.nodesEvaluated++;
    this.maxDepth = Math.max(this.maxDepth, env.depth);
    const out = this.evalNode(expr, env);
    if (key) this.memo.set(key, out);
    return out;
  }

  private evalUnlimited(expr: Extract<IRCapacityExpression, { kind: "UNLIMITED_CAPACITY" }>, env: Env): NodeResult {
    this.nodesEvaluated++;
    const l = lineage(null, []);
    if (!expr.gatedBy) return this.done(expr, capacity({ kind: "UNLIMITED", gate: "NONE" }, l));
    const gate = this.evaluate(expr.gatedBy, { ...env, depth: env.depth + 1 });
    if (gate.status !== "EXECUTABLE") return this.propagate(expr, [gate]);
    if (gate.value!.type !== "BOOLEAN") return this.fail(expr, "ERROR", "TYPE_CONTRACT_VIOLATION", `UNLIMITED_CAPACITY gate evaluated to ${gate.value!.type}, expected BOOLEAN`, [gate]);
    const l2 = lineage(null, gate.value!.lineage.inputKeys);
    return this.done(expr, capacity(gate.value!.type === "BOOLEAN" && gate.value!.value ? { kind: "UNLIMITED", gate: "SATISFIED" } : { kind: "GATE_NOT_SATISFIED" }, l2), [gate], { selected: { index: 0, exprId: expr.gatedBy.exprId ?? null, reason: gate.value!.value ? "gate satisfied" : "gate not satisfied" } });
  }

  private evalNode(expr: IRExpression, env: Env): NodeResult {
    const child = { ...env, depth: env.depth + 1 };
    const id = expr.exprId ?? null;
    switch (expr.kind) {
      // ---- literals ----
      case "MONEY": return this.done(expr, money(R.rationalFromNumber(expr.amount), expr.currency, lineage(id, [], expr.amount)));
      case "NUMBER": return this.done(expr, number(R.rationalFromNumber(expr.value), lineage(id, [], expr.value)));
      case "PERCENT": return this.done(expr, percent(R.rationalFromNumber(expr.value), lineage(id, [], expr.value)));
      case "RATIO": return this.done(expr, ratio(R.rationalFromNumber(expr.value), lineage(id, [], expr.value)));
      case "BOOLEAN_LITERAL": return this.done(expr, boolean(expr.value, lineage(id, [], expr.value)));
      case "DATE_LITERAL":
        if (!isIsoDate(expr.isoDate)) return this.fail(expr, "ERROR", "MALFORMED_NODE", `DATE_LITERAL "${expr.isoDate}" is not an ISO calendar date`);
        return this.done(expr, date(expr.isoDate, lineage(id, [], expr.isoDate)));

      // ---- references ----
      case "METRIC_REFERENCE": {
        this.referenceNodes++;
        const input = this.inputs.resolveMetric({ metricName: expr.metricName, companyId: expr.companyId, instrumentKey: expr.instrumentKey, asOf: env.asOf, period: env.period, expectedType: expr.type });
        if (!input) return this.needsInput(expr, "METRIC", expr.metricName, env, expr.type, `metric "${expr.metricName}" has no runtime input${env.period ? ` for period "${env.period}"` : ""}${env.asOf ? ` as of "${env.asOf}"` : ""}`);
        return this.useInput(expr, "METRIC", expr.metricName, input, expr.type, env);
      }
      case "DEFINED_TERM_REFERENCE": {
        this.referenceNodes++;
        const res = this.inputs.resolveTerm(expr.termName, expr.resolvedDefinitionId, expr.companyId, expr.instrumentKey);
        if (!res) return this.needsInput(expr, "TERM", expr.termName, env, expr.type, `defined term "${expr.termName}" has neither a runtime value nor an evaluable definition`);
        if (res.kind === "VALUE") return this.useInput(expr, "TERM", expr.termName, res.input, expr.type, env);
        return this.evalDefinition(expr, res.definition, child);
      }
      case "RULE_REFERENCE": {
        this.referenceNodes++;
        const rule = this.inputs.resolveRule(expr.ruleId);
        if (!rule) return this.needsInput(expr, "RULE", expr.ruleId, env, "CAPACITY", `referenced rule ${expr.ruleId} is not available to the runtime`);
        return this.evalRuleCapacity(expr, rule, child);
      }
      case "LEDGER_USAGE_REFERENCE": {
        this.referenceNodes++;
        const key = expr.sharedCapId ?? expr.ruleId ?? "(unkeyed)";
        const input = this.inputs.resolveLedgerUsage({ sharedCapId: expr.sharedCapId, ruleId: expr.ruleId });
        if (!input) return this.needsInput(expr, "LEDGER_USAGE", key, env, "MONEY", `ledger usage for ${key} is not available (capacity ledger is a later Phase-4 subphase)`);
        return this.useInput(expr, "LEDGER_USAGE", key, input, "MONEY", env);
      }
      case "TRANSACTION_INPUT_REFERENCE": {
        this.referenceNodes++;
        const input = this.inputs.resolveTransactionInput(expr.inputName, expr.type);
        if (!input) return this.needsInput(expr, "TRANSACTION_INPUT", expr.inputName, env, expr.type, `transaction input "${expr.inputName}" was not supplied`);
        return this.useInput(expr, "TRANSACTION_INPUT", expr.inputName, input, expr.type, env);
      }
      case "ENTITY_SCOPE_REFERENCE": return this.done(expr, entitySet(expr.scope.include, expr.scope.exclude, lineage(id, [])));

      // ---- arithmetic ----
      case "ADD":
      case "SUM": {
        const ops = expr.operands.map((o) => this.evaluate(o, child));
        if (ops.some((o) => o.status !== "EXECUTABLE")) return this.propagate(expr, ops);
        return this.unitOutcome(expr, addAll(ops.map((o) => o.value!), this.opLineage(id, ops)), ops);
      }
      case "MULTIPLY": {
        const ops = expr.operands.map((o) => this.evaluate(o, child));
        if (ops.some((o) => o.status !== "EXECUTABLE")) return this.propagate(expr, ops);
        return this.unitOutcome(expr, multiplyAll(ops.map((o) => o.value!), this.opLineage(id, ops)), ops);
      }
      case "SUBTRACT": {
        const ops = [this.evaluate(expr.left, child), this.evaluate(expr.right, child)];
        if (ops.some((o) => o.status !== "EXECUTABLE")) return this.propagate(expr, ops);
        return this.unitOutcome(expr, subtractValues(ops[0]!.value!, ops[1]!.value!, this.opLineage(id, ops)), ops);
      }
      case "DIVIDE": {
        const ops = [this.evaluate(expr.numerator, child), this.evaluate(expr.denominator, child)];
        if (ops.some((o) => o.status !== "EXECUTABLE")) return this.propagate(expr, ops);
        return this.unitOutcome(expr, divideValues(ops[0]!.value!, ops[1]!.value!, expr.type, this.opLineage(id, ops)), ops);
      }
      case "MAX":
      case "MIN": {
        const ops = expr.operands.map((o) => this.evaluate(o, child));
        const known = ops.map((o, i) => [o, i] as const).filter(([o]) => o.status === "EXECUTABLE");
        if (known.length === ops.length) {
          const ex = extreme(ops.map((o) => o.value!), expr.kind);
          if (!ex.ok) return this.fail(expr, "ERROR", ex.code, ex.message, ops);
          const winner = ops[ex.index]!.value!;
          return this.done(expr, withLineage(winner, this.opLineage(id, ops)), ops, { selected: { index: ex.index, exprId: expr.operands[ex.index]!.exprId ?? null, reason: `${expr.kind} selected operand ${ex.index}` } });
        }
        // Safe partial evaluation (mission §19): a bound over the known operands is metadata, never the answer.
        let bounds: NodeResult["bounds"] = null;
        const status = worst(ops.map((o) => o.status));
        if (status === "NEEDS_INPUT" && known.length > 0) {
          const ex = extreme(known.map(([o]) => o.value!), expr.kind);
          if (ex.ok) { const b = known[ex.index]![0].value!; bounds = expr.kind === "MAX" ? { knownLowerBound: b } : { knownUpperBound: b }; }
        }
        return this.propagate(expr, ops, { note: `${expr.kind} cannot be finalized: ${ops.length - known.length} of ${ops.length} operands are not executable` }, bounds);
      }

      // ---- comparison / boolean ----
      case "COMPARE": {
        const ops = [this.evaluate(expr.left, child), this.evaluate(expr.right, child)];
        if (ops.some((o) => o.status !== "EXECUTABLE")) return this.propagate(expr, ops);
        return this.unitOutcome(expr, compareWith(ops[0]!.value!, ops[1]!.value!, expr.operator, this.opLineage(id, ops)), ops);
      }
      case "AND":
      case "OR": {
        const ops = expr.operands.map((o) => this.evaluate(o, child));
        const nonBool = ops.find((o) => o.status === "EXECUTABLE" && o.value!.type !== "BOOLEAN");
        if (nonBool) return this.fail(expr, "ERROR", "TYPE_CONTRACT_VIOLATION", `${expr.kind} operand evaluated to ${nonBool.value!.type}, expected BOOLEAN`, ops);
        const decisive = expr.kind === "AND" ? false : true;
        const decisiveIndex = ops.findIndex((o) => o.status === "EXECUTABLE" && o.value!.type === "BOOLEAN" && o.value!.value === decisive);
        // Short-circuit is permitted only over NEEDS_INPUT operands (legal predicates whose fact is missing) - never over
        // UNSUPPORTED/AMBIGUOUS/ERROR operands, which are not known to be legal predicates at all.
        const othersAreLegalPredicates = ops.every((o) => o.status === "EXECUTABLE" || o.status === "NEEDS_INPUT");
        if (decisiveIndex >= 0 && othersAreLegalPredicates) {
          return this.done(expr, boolean(decisive, this.opLineage(id, ops)), ops, { selected: { index: decisiveIndex, exprId: expr.operands[decisiveIndex]!.exprId ?? null, reason: `${expr.kind} short-circuit: operand ${decisiveIndex} is ${decisive}` } });
        }
        if (ops.some((o) => o.status !== "EXECUTABLE")) return this.propagate(expr, ops);
        const all = ops.map((o) => (o.value as Extract<RuntimeValue, { type: "BOOLEAN" }>).value);
        return this.done(expr, boolean(expr.kind === "AND" ? all.every(Boolean) : all.some(Boolean), this.opLineage(id, ops)), ops);
      }
      case "NOT": {
        const op = this.evaluate(expr.operand, child);
        if (op.status !== "EXECUTABLE") return this.propagate(expr, [op]);
        if (op.value!.type !== "BOOLEAN") return this.fail(expr, "ERROR", "TYPE_CONTRACT_VIOLATION", `NOT operand evaluated to ${op.value!.type}, expected BOOLEAN`, [op]);
        return this.done(expr, boolean(!op.value!.value, this.opLineage(id, [op])), [op]);
      }
      case "IF": {
        const cond = this.evaluate(expr.condition, child);
        if (cond.status !== "EXECUTABLE") return this.propagate(expr, [cond], { note: "IF condition not executable; branches not evaluated" });
        if (cond.value!.type !== "BOOLEAN") return this.fail(expr, "ERROR", "TYPE_CONTRACT_VIOLATION", `IF condition evaluated to ${cond.value!.type}, expected BOOLEAN`, [cond]);
        const takeThen = cond.value!.value;
        if (!takeThen && !expr.else) return this.fail(expr, "ERROR", "IF_WITHOUT_ELSE_NOT_TAKEN", "IF condition is false and the node has no else branch, so it yields no value", [cond]);
        const branch = this.evaluate(takeThen ? expr.then : expr.else!, child);
        if (branch.status !== "EXECUTABLE") return this.propagate(expr, [cond, branch], { selected: { index: takeThen ? 0 : 1, exprId: (takeThen ? expr.then : expr.else!).exprId ?? null, reason: takeThen ? "condition true: then-branch" : "condition false: else-branch" } });
        return this.done(expr, withLineage(branch.value!, this.opLineage(id, [cond, branch])), [cond, branch], { selected: { index: takeThen ? 0 : 1, exprId: (takeThen ? expr.then : expr.else!).exprId ?? null, reason: takeThen ? "condition true: then-branch" : "condition false: else-branch" } });
      }

      // ---- temporal ----
      case "AS_OF": {
        // An ISO date becomes the as-of context; any other as-of text (e.g. "the date of such incurrence") is passed
        // VERBATIM to the input resolver as the as-of key - the runtime never interprets it.
        let asOf: string | null;
        const children: NodeResult[] = [];
        if (typeof expr.asOfDate === "string") asOf = expr.asOfDate;
        else {
          const d = this.evaluate(expr.asOfDate, child);
          children.push(d);
          if (d.status !== "EXECUTABLE") return this.propagate(expr, [d], { note: "AS_OF date not executable" });
          if (d.value!.type !== "DATE") return this.fail(expr, "ERROR", "TYPE_CONTRACT_VIOLATION", `AS_OF date evaluated to ${d.value!.type}, expected DATE`, [d]);
          asOf = d.value!.isoDate;
        }
        const v = this.evaluate(expr.value, { ...child, asOf });
        children.push(v);
        if (v.status !== "EXECUTABLE") return this.propagate(expr, children, { note: `as of ${asOf}` });
        return this.done(expr, withLineage(v.value!, this.opLineage(id, [v])), children, { note: `as of ${asOf}` });
      }
      case "DURING_PERIOD": {
        // The period description is passed verbatim as the period key; no interpretation of "Test Period" language.
        const v = this.evaluate(expr.value, { ...child, period: expr.periodDescription });
        if (v.status !== "EXECUTABLE") return this.propagate(expr, [v], { note: `period "${expr.periodDescription}"` });
        return this.done(expr, withLineage(v.value!, this.opLineage(id, [v])), [v], { note: `period "${expr.periodDescription}"` });
      }
      case "SCHEDULE": {
        if (!env.asOf || !isIsoDate(env.asOf)) return this.needsInput(expr, "AS_OF_DATE", "asOf", env, "DATE", "SCHEDULE needs an ISO as-of date in the evaluation context to select a case");
        const asOf = env.asOf;
        const matches = expr.cases.map((c, i) => [c, i] as const).filter(([c]) => (c.from === null || c.from <= asOf) && (c.to === null || asOf < c.to));
        if (matches.length > 1) return this.fail(expr, "ERROR", "SCHEDULE_OVERLAPPING_CASES", `SCHEDULE has ${matches.length} cases covering ${asOf}`);
        if (matches.length === 0 && !expr.defaultValue) return this.fail(expr, "UNSUPPORTED", "SCHEDULE_NO_MATCHING_CASE", `SCHEDULE states no case covering ${asOf} and no default value`);
        const [c, i] = matches[0] ?? [null, -1];
        const target = c ? c.value : expr.defaultValue!;
        const v = this.evaluate(target, child);
        const selected = { index: i, exprId: target.exprId ?? null, reason: c ? `case ${i} (${c.from ?? "-"} to ${c.to ?? "-"}) covers ${asOf}` : `no case covers ${asOf}: default value` };
        if (v.status !== "EXECUTABLE") return this.propagate(expr, [v], { selected });
        return this.done(expr, withLineage(v.value!, this.opLineage(id, [v])), [v], { selected });
      }
      case "EVENT_ACTIVE": {
        this.referenceNodes++;
        const fact = this.inputs.resolveEventActive(expr.eventDescription, env.asOf);
        if (fact) {
          const value = boolean(fact.active, lineage(id, [expr.eventDescription]));
          const record: ResolvedInputRecord = { kind: "EVENT", key: expr.eventDescription, period: env.period, asOf: env.asOf, provenance: fact.provenance, value: serializeValue(value) };
          this.inputsUsed.push(record);
          return this.done(expr, value, [], { input: record });
        }
        if (expr.triggerCondition && expr.activeDuration) return this.fail(expr, "UNSUPPORTED", "TEMPORAL_SEMANTICS_NOT_MODELED", `EVENT_ACTIVE "${expr.eventDescription}" has a bounded active duration ("${expr.activeDuration}") whose window semantics are not modeled; supply the event-active fact as an input`);
        if (expr.triggerCondition) {
          const t = this.evaluate(expr.triggerCondition, child);
          if (t.status !== "EXECUTABLE") return this.propagate(expr, [t]);
          if (t.value!.type !== "BOOLEAN") return this.fail(expr, "ERROR", "TYPE_CONTRACT_VIOLATION", `EVENT_ACTIVE trigger evaluated to ${t.value!.type}, expected BOOLEAN`, [t]);
          return this.done(expr, boolean(t.value!.value, this.opLineage(id, [t])), [t], { note: "event activity taken from its trigger condition (no bounded duration stated)" });
        }
        return this.needsInput(expr, "EVENT", expr.eventDescription, env, "BOOLEAN", `whether event "${expr.eventDescription}" is active was not supplied`);
      }

      // ---- escape hatch ----
      case "UNSUPPORTED":
        return this.fail(expr, "UNSUPPORTED", "UNSUPPORTED_NODE", `Phase 3 marked this operand UNSUPPORTED: ${expr.semanticDescription}`, [], expr.reason);
    }
  }

  private opLineage(exprId: string | null, ops: NodeResult[]) {
    const keys: string[] = [];
    for (const o of ops) for (const k of o.value?.lineage.inputKeys ?? []) if (!keys.includes(k)) keys.push(k);
    return lineage(exprId, keys);
  }

  private evalDefinition(expr: Extract<IRExpression, { kind: "DEFINED_TERM_REFERENCE" }>, def: IRDefinition, env: Env): NodeResult {
    const blocked = this.blockedBySufficiency(expr, "DEFINITION", def.definitionId, def.sufficiency, def.sufficiencyReasons);
    if (blocked) return blocked;
    if (!def.calculationExpression) return this.needsInput(expr, "TERM", def.termName, env, expr.type, `definition ${def.definitionId} ("${def.termName}") carries no calculation expression; supply its value as an input`);
    const frame = `definition:${def.definitionId}`;
    const cyc = this.cycle(expr, frame);
    if (cyc) return cyc;
    this.expansionStack.push(frame);
    this.expanded.push({ kind: "DEFINITION", id: def.definitionId });
    const inner = this.evaluate(def.calculationExpression, env);
    this.expansionStack.pop();
    if (inner.status !== "EXECUTABLE") return this.propagate(expr, [inner], { note: `via definition ${def.definitionId}` });
    if (!valueMatchesType(inner.value!, expr.type)) return this.fail(expr, "ERROR", "TYPE_CONTRACT_VIOLATION", `definition "${def.termName}" evaluated to ${inner.value!.type} where the reference declares ${expr.type}`, [inner]);
    return this.done(expr, withLineage(inner.value!, this.opLineage(expr.exprId ?? null, [inner])), [inner], { note: `via definition ${def.definitionId}` });
  }

  private evalRuleCapacity(expr: Extract<IRExpression, { kind: "RULE_REFERENCE" }>, rule: IRRule, env: Env): NodeResult {
    const blocked = this.blockedBySufficiency(expr, "RULE", rule.ruleId, rule.sufficiency, rule.sufficiencyReasons);
    if (blocked) return blocked;
    if (!rule.capacityExpression) return this.fail(expr, "UNSUPPORTED", "UNSUPPORTED_NODE", `referenced rule ${rule.ruleId} carries no capacity expression to use as a value`);
    const frame = `rule:${rule.ruleId}`;
    const cyc = this.cycle(expr, frame);
    if (cyc) return cyc;
    this.expansionStack.push(frame);
    this.expanded.push({ kind: "RULE", id: rule.ruleId });
    const inner = this.evaluate(rule.capacityExpression, env);
    this.expansionStack.pop();
    if (inner.status !== "EXECUTABLE") return this.propagate(expr, [inner], { note: `via rule ${rule.ruleId}` });
    const v = inner.value!;
    const cap = v.type === "MONEY" ? capacity({ kind: "AMOUNT", amount: v.amount, currency: v.currency }, this.opLineage(expr.exprId ?? null, [inner])) : v.type === "CAPACITY" ? withLineage(v, this.opLineage(expr.exprId ?? null, [inner])) : null;
    if (!cap) return this.fail(expr, "ERROR", "TYPE_CONTRACT_VIOLATION", `rule ${rule.ruleId} capacity evaluated to ${v.type}, expected MONEY or CAPACITY`, [inner]);
    return this.done(expr, cap, [inner], { note: `via rule ${rule.ruleId}` });
  }
}

function dedupeMissing(missing: MissingInput[]): MissingInput[] {
  const seen = new Set<string>();
  return missing.filter((m) => { const k = `${m.kind}|${m.key}|${m.asOf ?? ""}|${m.period ?? ""}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** The public runtime entry point (mission §31). Total over valid serialized IR. */
export function evaluateExpression(args: EvaluateExpressionArgs): EvaluationResult {
  const context = args.context ?? {};
  const ev = new Evaluator(args.inputs, context);
  const root = ev.evaluate(args.expression, { asOf: context.asOf ?? null, period: null, depth: 0 });
  const missingInputs = dedupeMissing(root.missing);
  const serializeBounds = (b: NodeResult["bounds"]): EvaluationResult["bounds"] => b ? { ...(b.knownLowerBound ? { knownLowerBound: serializeValue(b.knownLowerBound) } : {}), ...(b.knownUpperBound ? { knownUpperBound: serializeValue(b.knownUpperBound) } : {}) } : null;
  const value: SerializedRuntimeValue | null = root.status === "EXECUTABLE" && root.value ? serializeValue(root.value) : null;
  return {
    runtimeVersion: CONTRACT_RUNTIME_VERSION,
    status: root.status,
    value,
    missingInputs,
    missingInputKeys: [...new Set(missingInputs.map((m) => m.key))],
    diagnostics: root.diagnostics,
    bounds: serializeBounds(root.bounds),
    trace: root.trace,
    provenance: {
      runtimeVersion: CONTRACT_RUNTIME_VERSION,
      ruleId: context.ruleId ?? null,
      definitionId: context.definitionId ?? null,
      rootExprId: args.expression.kind === "UNLIMITED_CAPACITY" ? null : args.expression.exprId ?? null,
      sourceCitations: ev.citations,
      inputsUsed: ev.inputsUsed,
      expandedObjects: ev.expanded,
    },
    stats: {
      nodesEvaluated: ev.nodesEvaluated,
      cacheHits: ev.cacheHits,
      dependencyCount: ev.referenceNodes,
      maxDepth: ev.maxDepth,
      missingInputCount: missingInputs.length,
      unsupportedCount: root.diagnostics.filter((d) => d.status === "UNSUPPORTED").length,
      evaluationStatus: root.status,
    },
  };
}
