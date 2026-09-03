/**
 * F-6 deterministic replay (zero paid calls): pushes RECORDED compiler payloads (rawModelOutput, exactly as the
 * model emitted them) back through wire parsing -> normalization -> IR validation -> Pass C reconciliation, and
 * measures how much substantive structure survives. Run it before and after a normalization/type-check change to
 * measure the change; nothing here calls a model.
 *
 *   npx tsx scripts/f6-recorded-replay.ts chewy  <out.json>   # Chewy §6.08 paid-run payload, incl. reconciliation
 *   npx tsx scripts/f6-recorded-replay.ts corpus <out.json>   # every recorded compile payload under tests/fixtures
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SubmitCompilationSchema } from "../lib/contract-model/compiler/semantic/wire-schema";
import { normalizeSubmission } from "../lib/contract-model/compiler/semantic/normalize";
import { validateCompilationUnit } from "../lib/contract-model/ir/validate";
import { inferType } from "../lib/contract-model/ir/type-check";
import { reconcileInventoryWithComposition } from "../lib/contract-model/compiler/semantic-accountability/reconciliation";
import type { IRCapacityExpression, IRDefinition, IRExpression, IRRule } from "../lib/contract-model/ir/types";
import type { SemanticCompilerInput } from "../lib/contract-model/compiler/semantic/types";

type Json = Record<string, unknown>;

interface ExprStats {
  /** UNSUPPORTED nodes in the live tree (attemptedStructure sidecars excluded). */
  unsupportedNodes: number;
  /** UNSUPPORTED nodes the model itself emitted (kind UNSUPPORTED in the raw wire). */
  modelEmittedUnsupported: number;
  /** Nodes that exist only inside an attemptedStructure sidecar - structure the live IR no longer carries. */
  nodesOnlyInAttemptedStructure: number;
  /** Composites kept in the live tree although a child is UNSUPPORTED (F-6 partial composites). */
  partialCompositesKept: number;
  liveNodes: number;
}

function childExpressions(e: IRExpression): IRExpression[] {
  switch (e.kind) {
    case "ADD": case "SUM": case "MULTIPLY": case "MAX": case "MIN": case "AND": case "OR": return e.operands;
    case "SUBTRACT": return [e.left, e.right];
    case "DIVIDE": return [e.numerator, e.denominator];
    case "COMPARE": return [e.left, e.right];
    case "NOT": return [e.operand];
    case "IF": return e.else ? [e.condition, e.then, e.else] : [e.condition, e.then];
    case "AS_OF": case "DURING_PERIOD": return [e.value];
    case "SCHEDULE": return e.defaultValue ? [...e.cases.map((c) => c.value), e.defaultValue] : e.cases.map((c) => c.value);
    case "EVENT_ACTIVE": return e.triggerCondition ? [e.triggerCondition] : [];
    default: return [];
  }
}
function countNodes(e: IRExpression): number { return 1 + childExpressions(e).reduce((n, c) => n + countNodes(c), 0); }
function walkStats(e: IRExpression | null | undefined, s: ExprStats): void {
  if (!e) return;
  s.liveNodes++;
  if (e.kind === "UNSUPPORTED") {
    s.unsupportedNodes++;
    if (e.attemptedStructure) s.nodesOnlyInAttemptedStructure += countNodes(e.attemptedStructure);
    return;
  }
  const kids = childExpressions(e);
  if (kids.length > 0 && kids.some((k) => inferType(k) === "UNSUPPORTED")) s.partialCompositesKept++;
  for (const k of kids) walkStats(k, s);
}
function walkCapacity(c: IRCapacityExpression | null, s: ExprStats): void {
  if (!c) return;
  if (c.kind === "UNLIMITED_CAPACITY") { walkStats(c.gatedBy, s); return; }
  walkStats(c, s);
}
function countRawUnsupported(o: unknown): number {
  if (Array.isArray(o)) return o.reduce((n: number, v) => n + countRawUnsupported(v), 0);
  if (o && typeof o === "object") {
    const rec = o as Json;
    return (rec.kind === "UNSUPPORTED" ? 1 : 0) + Object.entries(rec).reduce((n, [k, v]) => (k === "attemptedStructure" ? n : n + countRawUnsupported(v)), 0);
  }
  return 0;
}
function describe(e: IRExpression | IRCapacityExpression | null | undefined): string {
  if (!e) return "null";
  if (e.kind === "UNLIMITED_CAPACITY") return `UNLIMITED(gatedBy=${describe(e.gatedBy)})`;
  switch (e.kind) {
    case "MONEY": return `MONEY(${e.amount})`;
    case "NUMBER": case "PERCENT": case "RATIO": return `${e.kind}(${e.value})`;
    case "BOOLEAN_LITERAL": return `BOOL(${e.value})`;
    case "DATE_LITERAL": return `DATE(${e.isoDate})`;
    case "METRIC_REFERENCE": return `METRIC("${e.metricName}":${e.type})`;
    case "DEFINED_TERM_REFERENCE": return `TERM("${e.termName.slice(0, 40)}":${e.type})`;
    case "TRANSACTION_INPUT_REFERENCE": return `TXIN("${e.inputName.slice(0, 40)}":${e.type})`;
    case "RULE_REFERENCE": return `RULEREF(${e.ruleId})`;
    case "LEDGER_USAGE_REFERENCE": return `LEDGER(${e.sharedCapId ?? e.ruleId})`;
    case "ENTITY_SCOPE_REFERENCE": return "ENTITY_SCOPE";
    case "UNSUPPORTED": return `UNSUPPORTED("${e.semanticDescription.slice(0, 50)}"${e.attemptedStructure ? `; attempted=${describe(e.attemptedStructure)}` : ""})`;
    case "COMPARE": return `COMPARE(${describe(e.left)} ${e.operator} ${describe(e.right)})`;
    case "SUBTRACT": return `SUBTRACT:${e.type}(${describe(e.left)}, ${describe(e.right)})`;
    case "DIVIDE": return `DIVIDE:${e.type}(${describe(e.numerator)}, ${describe(e.denominator)})`;
    case "NOT": return `NOT(${describe(e.operand)})`;
    case "IF": return `IF:${e.type}(${describe(e.condition)} ? ${describe(e.then)} : ${describe(e.else)})`;
    case "AS_OF": return `AS_OF(${describe(e.value)})`;
    case "DURING_PERIOD": return `DURING(${describe(e.value)})`;
    case "SCHEDULE": return `SCHEDULE(${e.cases.map((c) => describe(c.value)).join(", ")})`;
    case "EVENT_ACTIVE": return `EVENT(${describe(e.triggerCondition)})`;
    default: return `${e.kind}:${(e as { type: string }).type}(${childExpressions(e).map(describe).join(", ")})`;
  }
}

interface RecordRef { file: string; pointer: string; record: Json; parent: Json | null }
function findRecords(o: unknown, file: string, pointer: string, parent: Json | null, out: RecordRef[]): void {
  if (Array.isArray(o)) { o.forEach((v, i) => findRecords(v, file, `${pointer}[${i}]`, parent, out)); return; }
  if (!o || typeof o !== "object") return;
  const rec = o as Json;
  if (rec.rawModelOutput && typeof rec.rawModelOutput === "object" && Array.isArray(rec.rules)) { out.push({ file, pointer, record: rec, parent }); return; }
  for (const [k, v] of Object.entries(rec)) findRecords(v, file, `${pointer}/${k}`, rec, out);
}
function listJson(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) listJson(p, out);
    else if (name.endsWith(".json") && st.size < 60_000_000) out.push(p);
  }
  return out;
}

function inputFor(record: Json, parent: Json | null, candidateRef: string, sourceSectionRef: string | null): SemanticCompilerInput {
  const first = ((record.rules as Json[])[0] ?? (record.definitions as Json[])[0] ?? {}) as Json;
  return {
    companyId: String(first.companyId ?? "replay-co"),
    instrumentKey: String(first.instrumentKey ?? "replay-instrument"),
    sourceDocumentId: String(first.sourceDocumentId ?? "replay-doc"),
    candidateRef,
    sourceSectionRef,
    operativeLineage: (first.operativeLineage as SemanticCompilerInput["operativeLineage"]) ?? null,
    irSchemaVersion: String(first.irSchemaVersion ?? "headroom-covenant-ir.v1"),
    compilerAlgorithmVersion: String(first.compilerVersion ?? "replay"),
    // Fields normalizeSubmission never reads - present only to satisfy the input contract.
    operativeSourceText: "",
    contextBundle: { items: [] } as unknown as SemanticCompilerInput["contextBundle"],
    toolAccess: {} as SemanticCompilerInput["toolAccess"],
    compilerPromptVersion: String(parent?.compilerPromptVersion ?? "replay"),
    toolPolicyVersion: "replay",
  };
}

function canonical(o: unknown): string { return JSON.stringify(sortKeys(o)); }
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v as Json).sort().map((k) => [k, sortKeys((v as Json)[k])]));
  return v;
}

function replayRecord(ref: RecordRef, candidateRef: string, sourceSectionRef: string | null) {
  const raw = ref.record.rawModelOutput as Json;
  const submission = SubmitCompilationSchema.parse(raw);
  const input = inputFor(ref.record, ref.parent, candidateRef, sourceSectionRef);
  const normalized = normalizeSubmission(submission, input);
  const validation = validateCompilationUnit({ irSchemaVersion: input.irSchemaVersion, companyId: input.companyId, instrumentKey: input.instrumentKey, rules: normalized.rules, definitions: normalized.definitions, sharedCapacities: normalized.sharedCapacities });
  const stats: ExprStats = { unsupportedNodes: 0, modelEmittedUnsupported: countRawUnsupported(raw), nodesOnlyInAttemptedStructure: 0, partialCompositesKept: 0, liveNodes: 0 };
  const expressions: { owner: string; slot: string; ir: string; inferredType: string; sufficiency: string }[] = [];
  for (const r of normalized.rules) {
    walkCapacity(r.capacityExpression, stats);
    if (r.capacityExpression) expressions.push({ owner: `rule ${r.sourceSectionRef}`, slot: "capacityExpression", ir: describe(r.capacityExpression), inferredType: r.capacityExpression.kind === "UNLIMITED_CAPACITY" ? (r.capacityExpression.gatedBy ? `gate:${inferType(r.capacityExpression.gatedBy)}` : "CAPACITY") : inferType(r.capacityExpression), sufficiency: r.sufficiency });
    r.conditions.forEach((c, i) => { walkStats(c.expression, stats); if (c.expression) expressions.push({ owner: `rule ${r.sourceSectionRef}`, slot: `conditions[${i}]`, ir: describe(c.expression), inferredType: inferType(c.expression), sufficiency: r.sufficiency }); });
    r.exceptions.forEach((ex, i) => ex.conditions.forEach((c, j) => { walkStats(c.expression, stats); if (c.expression) expressions.push({ owner: `rule ${r.sourceSectionRef}`, slot: `exceptions[${i}].conditions[${j}]`, ir: describe(c.expression), inferredType: inferType(c.expression), sufficiency: r.sufficiency }); }));
  }
  for (const d of normalized.definitions) {
    walkStats(d.calculationExpression, stats);
    if (d.calculationExpression) expressions.push({ owner: `definition "${d.termName}"`, slot: "calculationExpression", ir: describe(d.calculationExpression), inferredType: inferType(d.calculationExpression), sufficiency: d.sufficiency });
  }
  for (const sc of normalized.sharedCapacities) walkCapacity(sc.capExpression, stats);
  const count = (xs: { sufficiency: string }[]) => Object.fromEntries(["COMPLETE", "PARTIAL", "AMBIGUOUS", "UNSUPPORTED", "MISSING_CONTEXT", "CONFLICTED"].map((s) => [s, xs.filter((x) => x.sufficiency === s).length]));
  const issuesByKind: Record<string, number> = {};
  for (const i of validation.issues) issuesByKind[i.kind] = (issuesByKind[i.kind] ?? 0) + 1;
  const typeWarnings = normalized.warnings.filter((w) => /type-check|not BOOLEAN|must be BOOLEAN|same type|determinable type|keeps its structure/.test(w.message)).map((w) => `[${w.scope}] ${w.message}`);
  const recordedRules = ref.record.rules as IRRule[];
  const recordedDefs = (ref.record.definitions ?? []) as IRDefinition[];
  const reproducedExactly = canonical(normalized.rules) === canonical(recordedRules) && canonical(normalized.definitions) === canonical(recordedDefs);
  return { normalized, validation, stats, expressions, ruleSufficiency: count(normalized.rules), definitionSufficiency: count(normalized.definitions), issuesByKind, validationIssues: validation.issues.map((i) => `[${i.kind}] ${i.message}`), typeWarnings, reproducedExactly, rules: normalized.rules.length, definitions: normalized.definitions.length, sharedCapacities: normalized.sharedCapacities.length };
}

const mode = process.argv[2];
const out = process.argv[3];
if (!mode || !out) throw new Error("usage: f6-recorded-replay.ts chewy|corpus <out.json>");

if (mode === "chewy") {
  const file = "tests/fixtures/unseen-packages/phase-3-validation-chwy-paid-run/unit-6.08.json";
  const unit = JSON.parse(readFileSync(file, "utf-8")) as Json;
  const compile = unit.compile as Json;
  const ref: RecordRef = { file, pointer: "/compile", record: compile, parent: unit };
  const r = replayRecord(ref, String(unit.candidateRef), String((unit.unit as Json).sectionRef));
  const inventory = compile.frozenInventory as Parameters<typeof reconcileInventoryWithComposition>[0]["inventory"];
  const accountability = reconcileInventoryWithComposition({ inventory, composition: { rules: r.normalized.rules, definitions: r.normalized.definitions, sharedCapacities: r.normalized.sharedCapacities }, dispositions: [], sourceContextState: inventory.sourceContextState });
  const recordedAcc = compile.accountability as Json;
  // Every inventoryItemId attached to an UNSUPPORTED node (or to anything inside its attemptedStructure) - the
  // most specific lineage claim an item can have; used to audit that no such item is credited REPRESENTED.
  const directUnsupported = new Set<string>();
  const collect = (e: IRExpression | null | undefined, inside: boolean): void => {
    if (!e) return;
    if (inside || e.kind === "UNSUPPORTED") for (const id of e.inventoryItemIds ?? []) directUnsupported.add(id);
    if (e.kind === "UNSUPPORTED") { collect(e.attemptedStructure, true); return; }
    for (const k of childExpressions(e)) collect(k, inside);
  };
  for (const rule of r.normalized.rules) {
    if (rule.capacityExpression) collect(rule.capacityExpression.kind === "UNLIMITED_CAPACITY" ? rule.capacityExpression.gatedBy : rule.capacityExpression, false);
    rule.conditions.forEach((c) => collect(c.expression, false));
    rule.exceptions.forEach((ex) => ex.conditions.forEach((c) => collect(c.expression, false)));
  }
  for (const d of r.normalized.definitions) collect(d.calculationExpression, false);
  const dangling = r.normalized.rules.flatMap((rule) => rule.dependsOn.filter((d) => !r.normalized.rules.some((x) => x.ruleId === d.targetRuleId))).length;
  const result = {
    file,
    reproducedRecordedIRExactly: r.reproducedExactly,
    reproducedRecordedAccountabilityCounts: canonical(accountability.counts) === canonical(recordedAcc.counts),
    recordedAccountabilityCounts: recordedAcc.counts,
    replayAccountabilityCounts: accountability.counts,
    semanticallyComplete: accountability.semanticallyComplete,
    rules: r.rules, definitions: r.definitions, sharedCapacities: r.sharedCapacities,
    ruleSufficiency: r.ruleSufficiency, definitionSufficiency: r.definitionSufficiency,
    expressionStats: r.stats,
    irValidation: { ok: r.validation.ok, issuesByKind: r.issuesByKind, issues: r.validationIssues },
    danglingRuleDependencies: dangling,
    danglingLineageReferences: accountability.counts.danglingLineageReferences,
    unresolvedDependencies: r.normalized.rules.reduce((n, rule) => n + (rule.unresolvedDependencies?.length ?? 0), 0),
    typeWarnings: r.typeWarnings,
    expressions: r.expressions,
    itemsWithDirectUnsupportedLineage: [...directUnsupported].length,
    itemsWithDirectUnsupportedLineageCreditedRepresented: accountability.items.filter((i) => directUnsupported.has(i.inventoryItemId) && i.disposition === "REPRESENTED").map((i) => i.inventoryItemId),
    accountabilityItems: accountability.items.map((i) => ({ inventoryItemId: i.inventoryItemId, semanticRole: i.semanticRole, materiality: i.materiality, disposition: i.disposition, directUnsupportedLineage: directUnsupported.has(i.inventoryItemId), quantitative: i.quantitative.map((q) => ({ raw: q.value.rawText, disposition: q.disposition })), lineageIrPaths: i.lineageIrPaths })),
  };
  writeFileSync(out, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ reproducedIR: result.reproducedRecordedIRExactly, reproducedCounts: result.reproducedRecordedAccountabilityCounts, stats: r.stats, ruleSufficiency: r.ruleSufficiency, definitionSufficiency: r.definitionSufficiency, issuesByKind: r.issuesByKind, counts: accountability.counts }, null, 1));
} else {
  const files = listJson("tests/fixtures");
  const records: RecordRef[] = [];
  for (const f of files) {
    let parsed: unknown;
    try { parsed = JSON.parse(readFileSync(f, "utf-8")); } catch { continue; }
    findRecords(parsed, f, "", null, records);
  }
  const rows = records.filter((rec) => rec.record.rawModelOutput && Array.isArray((rec.record.rawModelOutput as Json).rules)).map((rec) => {
    const candidateRef = String(rec.parent?.candidateRef ?? (rec.record.accountability as Json | undefined)?.candidateRef ?? (rec.record.frozenInventory as Json | undefined)?.candidateRef ?? "replay");
    const sectionRef = (rec.parent?.sourceSectionRef as string | undefined) ?? ((rec.parent?.unit as Json | undefined)?.sectionRef as string | undefined) ?? (((rec.record.rules as Json[])[0]?.sourceSectionRef as string | undefined) ?? null);
    try {
      const r = replayRecord(rec, candidateRef, sectionRef);
      return { file: rec.file, pointer: rec.pointer, reproducedRecordedIRExactly: r.reproducedExactly, rules: r.rules, definitions: r.definitions, ruleSufficiency: r.ruleSufficiency, definitionSufficiency: r.definitionSufficiency, expressionStats: r.stats, irValidationIssuesByKind: r.issuesByKind, typeWarnings: r.typeWarnings.length, expressions: r.expressions };
    } catch (err) {
      return { file: rec.file, pointer: rec.pointer, error: String(err).slice(0, 300) };
    }
  });
  writeFileSync(out, JSON.stringify({ records: rows.length, rows }, null, 2));
  const agg = rows.reduce((a, row) => {
    if (!("expressionStats" in row) || !row.expressionStats || !row.irValidationIssuesByKind) return a;
    a.unsupportedNodes += row.expressionStats.unsupportedNodes; a.modelEmitted += row.expressionStats.modelEmittedUnsupported; a.attemptedOnly += row.expressionStats.nodesOnlyInAttemptedStructure; a.partialKept += row.expressionStats.partialCompositesKept;
    a.typeErrors += row.irValidationIssuesByKind.TYPE_ERROR ?? 0; a.falseCompleteness += row.irValidationIssuesByKind.FALSE_COMPLETENESS ?? 0;
    return a;
  }, { unsupportedNodes: 0, modelEmitted: 0, attemptedOnly: 0, partialKept: 0, typeErrors: 0, falseCompleteness: 0 });
  console.log(JSON.stringify({ records: rows.length, errors: rows.filter((r) => "error" in r).length, ...agg }));
}
