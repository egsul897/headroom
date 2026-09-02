/**
 * SEMANTIC ACCOUNTABILITY - Pass C: deterministic reconciliation of the
 * FROZEN Pass A inventory against the COMPOSED IR (mission §9/§10). No model
 * decides anything here. For every inventory item this classifies:
 *
 *   REPRESENTED                      - lineage in the composed IR (a rule/
 *                                      definition/shared-cap/condition/
 *                                      exception/expression node names the
 *                                      item) AND, when the item carries
 *                                      quantitative values, every value is
 *                                      provably present in the IR; or (no
 *                                      lineage) deterministic correspondence
 *                                      by value/term (disclosed as inferred).
 *   INTENTIONALLY_NON_COMPUTATIONAL  - the composition explicitly said so.
 *   UNSUPPORTED                      - the composition consumed it into an
 *                                      UNSUPPORTED node (or its
 *                                      attemptedStructure), or said so.
 *   AMBIGUOUS                        - the composition said so, or the item is
 *                                      a REFERENCE/DEPENDENCY carried as an
 *                                      IRUnresolvedDependency (never guessed).
 *   MISSING_FROM_COMPOSITION         - none of the above: a first-class
 *                                      safety signal (mission §9).
 *
 * QUANTITATIVE RECONCILIATION (mission §10) is separate and stricter: a
 * lineage claim does not earn REPRESENTED for a valued item unless the value
 * itself is in the IR (a composition may not "link every item without
 * semantic correspondence" - audit §33). Money/percent/ratio/multiplier
 * values must appear as typed literals; day-counts/periods/dates may also
 * appear in the IR's own structured time fields (periodDescription,
 * activeDuration, asOfDate, SCHEDULE bounds) or a first-class
 * condition/exception description - never merely in a free-text note.
 *
 * Reads the final IR type-only as a COMPARISON TARGET (independence contract
 * in types.ts) - never the compiler's reasoning, never the verifier.
 */
import type { IRCapacityExpression, IRDefinition, IRExpression, IRRule, IRSharedCapacity } from "../../ir/types";
import { numbersMatch } from "./quantitative";
import { INVENTORY_DISPOSITIONS, SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION } from "./types";
import type { FrozenSemanticInventory, InventoryDisposition, QuantitativeDisposition, QuantitativeValue, ReconciliationItem, SemanticAccountabilityResult, SemanticInventoryItem, SourceContextState } from "./types";

export interface CompositionForReconciliation {
  rules: IRRule[];
  definitions: IRDefinition[];
  sharedCapacities: IRSharedCapacity[];
}

export interface ReconcileInput {
  inventory: FrozenSemanticInventory;
  composition: CompositionForReconciliation;
  /** The composition's own explicit dispositions (tolerant strings) for items it did not consume. */
  dispositions: { inventoryItemId: string; disposition: string; note: string }[];
  sourceContextState: SourceContextState;
}

interface LineageEntry {
  irPath: string;
  inventoryItemIds: string[];
  /** The node is UNSUPPORTED, sits inside an UNSUPPORTED node's attemptedStructure, or is an unresolved dependency. */
  kind: "REPRESENTED" | "UNSUPPORTED" | "UNRESOLVED_DEPENDENCY";
}

interface IrValue {
  irPath: string;
  kind: "MONEY" | "PERCENT" | "RATIO" | "NUMBER" | "DATE" | "TEXT";
  numeric: number | null;
  text: string | null;
  insideUnsupportedAttempt: boolean;
}

interface Walk {
  lineage: LineageEntry[];
  values: IrValue[];
  termNames: Set<string>;
  unresolvedTargetRefs: string[];
}

function pushLineage(w: Walk, irPath: string, ids: string[] | undefined, kind: LineageEntry["kind"]): void {
  if (ids && ids.length > 0) w.lineage.push({ irPath, inventoryItemIds: [...ids], kind });
}

function pushText(w: Walk, irPath: string, text: string | null | undefined, insideAttempt: boolean): void {
  if (text && text.trim()) w.values.push({ irPath, kind: "TEXT", numeric: null, text, insideUnsupportedAttempt: insideAttempt });
}

function walkExpression(w: Walk, expr: IRExpression | null | undefined, path: string, insideAttempt: boolean, insideUnsupported: boolean): void {
  if (!expr) return;
  const unsupportedContext = insideAttempt || insideUnsupported;
  pushLineage(w, path, expr.inventoryItemIds, unsupportedContext || expr.kind === "UNSUPPORTED" ? "UNSUPPORTED" : "REPRESENTED");
  switch (expr.kind) {
    case "MONEY":
      w.values.push({ irPath: path, kind: "MONEY", numeric: expr.amount, text: null, insideUnsupportedAttempt: insideAttempt });
      return;
    case "NUMBER":
      w.values.push({ irPath: path, kind: "NUMBER", numeric: expr.value, text: null, insideUnsupportedAttempt: insideAttempt });
      return;
    case "PERCENT":
      w.values.push({ irPath: path, kind: "PERCENT", numeric: expr.value, text: null, insideUnsupportedAttempt: insideAttempt });
      return;
    case "RATIO":
      w.values.push({ irPath: path, kind: "RATIO", numeric: expr.value, text: null, insideUnsupportedAttempt: insideAttempt });
      return;
    case "DATE_LITERAL":
      w.values.push({ irPath: path, kind: "DATE", numeric: null, text: expr.isoDate, insideUnsupportedAttempt: insideAttempt });
      return;
    case "BOOLEAN_LITERAL":
      return;
    case "METRIC_REFERENCE":
      w.termNames.add(expr.metricName.toLowerCase());
      return;
    case "DEFINED_TERM_REFERENCE":
      w.termNames.add(expr.termName.toLowerCase());
      return;
    case "RULE_REFERENCE":
    case "LEDGER_USAGE_REFERENCE":
    case "TRANSACTION_INPUT_REFERENCE":
    case "ENTITY_SCOPE_REFERENCE":
      return;
    case "ADD":
    case "SUM":
    case "MULTIPLY":
    case "MAX":
    case "MIN":
    case "AND":
    case "OR":
      expr.operands.forEach((op, i) => walkExpression(w, op, `${path}.operands[${i}]`, insideAttempt, insideUnsupported));
      return;
    case "SUBTRACT":
      walkExpression(w, expr.left, `${path}.left`, insideAttempt, insideUnsupported);
      walkExpression(w, expr.right, `${path}.right`, insideAttempt, insideUnsupported);
      return;
    case "DIVIDE":
      walkExpression(w, expr.numerator, `${path}.numerator`, insideAttempt, insideUnsupported);
      walkExpression(w, expr.denominator, `${path}.denominator`, insideAttempt, insideUnsupported);
      return;
    case "COMPARE":
      walkExpression(w, expr.left, `${path}.left`, insideAttempt, insideUnsupported);
      walkExpression(w, expr.right, `${path}.right`, insideAttempt, insideUnsupported);
      return;
    case "NOT":
      walkExpression(w, expr.operand, `${path}.operand`, insideAttempt, insideUnsupported);
      return;
    case "IF":
      walkExpression(w, expr.condition, `${path}.condition`, insideAttempt, insideUnsupported);
      walkExpression(w, expr.then, `${path}.then`, insideAttempt, insideUnsupported);
      if (expr.else) walkExpression(w, expr.else, `${path}.else`, insideAttempt, insideUnsupported);
      return;
    case "AS_OF":
      if (typeof expr.asOfDate === "string") pushText(w, `${path}.asOfDate`, expr.asOfDate, insideAttempt);
      else walkExpression(w, expr.asOfDate, `${path}.asOfDate`, insideAttempt, insideUnsupported);
      walkExpression(w, expr.value, `${path}.value`, insideAttempt, insideUnsupported);
      return;
    case "DURING_PERIOD":
      pushText(w, `${path}.periodDescription`, expr.periodDescription, insideAttempt);
      walkExpression(w, expr.value, `${path}.value`, insideAttempt, insideUnsupported);
      return;
    case "SCHEDULE":
      expr.cases.forEach((c, i) => {
        pushText(w, `${path}.cases[${i}].from`, c.from, insideAttempt);
        pushText(w, `${path}.cases[${i}].to`, c.to, insideAttempt);
        pushText(w, `${path}.cases[${i}].description`, c.description, insideAttempt);
        walkExpression(w, c.value, `${path}.cases[${i}].value`, insideAttempt, insideUnsupported);
      });
      if (expr.defaultValue) walkExpression(w, expr.defaultValue, `${path}.defaultValue`, insideAttempt, insideUnsupported);
      return;
    case "EVENT_ACTIVE":
      pushText(w, `${path}.eventDescription`, expr.eventDescription, insideAttempt);
      pushText(w, `${path}.activeDuration`, expr.activeDuration, insideAttempt);
      if (expr.triggerCondition) walkExpression(w, expr.triggerCondition, `${path}.triggerCondition`, insideAttempt, insideUnsupported);
      return;
    case "UNSUPPORTED":
      pushText(w, `${path}.semanticDescription`, expr.semanticDescription, true);
      pushText(w, `${path}.sourceEvidence`, expr.sourceEvidence, true);
      if (expr.attemptedStructure) walkExpression(w, expr.attemptedStructure, `${path}.attemptedStructure`, true, true);
      return;
    default: {
      const _exhaustive: never = expr;
      throw new Error(`semantic-accountability/reconciliation.ts: unhandled IRExpression kind ${JSON.stringify(_exhaustive)}`);
    }
  }
}

function walkCapacity(w: Walk, cap: IRCapacityExpression | null, path: string): void {
  if (!cap) return;
  if (cap.kind === "UNLIMITED_CAPACITY") {
    pushLineage(w, path, cap.inventoryItemIds, "REPRESENTED");
    walkExpression(w, cap.gatedBy, `${path}.gatedBy`, false, false);
    return;
  }
  walkExpression(w, cap, path, false, false);
}

function walkComposition(c: CompositionForReconciliation): Walk {
  const w: Walk = { lineage: [], values: [], termNames: new Set(), unresolvedTargetRefs: [] };
  c.rules.forEach((rule, i) => {
    const p = `rules[${i}]`;
    pushLineage(w, p, rule.inventoryItemIds, "REPRESENTED");
    walkCapacity(w, rule.capacityExpression, `${p}.capacityExpression`);
    rule.conditions.forEach((cond, j) => {
      pushLineage(w, `${p}.conditions[${j}]`, cond.inventoryItemIds, "REPRESENTED");
      pushText(w, `${p}.conditions[${j}].description`, cond.description, false);
      walkExpression(w, cond.expression, `${p}.conditions[${j}].expression`, false, false);
    });
    rule.exceptions.forEach((exc, j) => {
      pushLineage(w, `${p}.exceptions[${j}]`, exc.inventoryItemIds, "REPRESENTED");
      pushText(w, `${p}.exceptions[${j}].description`, exc.description, false);
      exc.conditions.forEach((cond, k) => {
        pushLineage(w, `${p}.exceptions[${j}].conditions[${k}]`, cond.inventoryItemIds, "REPRESENTED");
        pushText(w, `${p}.exceptions[${j}].conditions[${k}].description`, cond.description, false);
        walkExpression(w, cond.expression, `${p}.exceptions[${j}].conditions[${k}].expression`, false, false);
      });
    });
    rule.dependsOn.forEach((dep, j) => pushLineage(w, `${p}.dependsOn[${j}]`, dep.inventoryItemIds, "REPRESENTED"));
    (rule.unresolvedDependencies ?? []).forEach((dep, j) => {
      pushLineage(w, `${p}.unresolvedDependencies[${j}]`, dep.inventoryItemIds, "UNRESOLVED_DEPENDENCY");
      w.unresolvedTargetRefs.push(dep.targetRef.replace(/\s+/g, "").toLowerCase());
    });
  });
  c.definitions.forEach((def, i) => {
    const p = `definitions[${i}]`;
    pushLineage(w, p, def.inventoryItemIds, "REPRESENTED");
    w.termNames.add(def.termName.toLowerCase());
    def.dependsOnTerms.forEach((t) => w.termNames.add(t.toLowerCase()));
    walkExpression(w, def.calculationExpression, `${p}.calculationExpression`, false, false);
  });
  c.sharedCapacities.forEach((sc, i) => {
    const p = `sharedCapacities[${i}]`;
    pushLineage(w, p, sc.inventoryItemIds, "REPRESENTED");
    pushText(w, `${p}.description`, sc.description, false);
    walkCapacity(w, sc.capExpression, `${p}.capExpression`);
  });
  return w;
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function toIsoDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const m = raw.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
}

/** Deterministic value correspondence (mission §10). Returns the IR paths where this source value is provably present, split by whether the presence is executable or only inside an UNSUPPORTED node's attempted structure. */
function findValue(v: QuantitativeValue, irValues: IrValue[]): { present: string[]; attemptedOnly: string[] } {
  const present: string[] = [];
  const attemptedOnly: string[] = [];
  const raw = v.rawText.replace(/\s+/g, " ").trim().toLowerCase();
  const consider = (candidate: IrValue, matched: boolean) => {
    if (!matched) return;
    (candidate.insideUnsupportedAttempt ? attemptedOnly : present).push(candidate.irPath);
  };
  for (const iv of irValues) {
    switch (v.kind) {
      case "MONEY":
        consider(iv, iv.kind === "MONEY" && v.normalizedValue !== null && iv.numeric !== null && numbersMatch(iv.numeric, v.normalizedValue));
        break;
      case "PERCENT":
        consider(iv, iv.kind === "PERCENT" && v.normalizedValue !== null && iv.numeric !== null && numbersMatch(iv.numeric, v.normalizedValue));
        break;
      case "RATIO":
      case "MULTIPLIER":
        // The IR encodes a multiple ("2.5x EBITDA") as a PERCENT scaling factor (2.5 = 250%) - the same number, so a PERCENT literal also satisfies a ratio/multiplier value.
        consider(iv, (iv.kind === "RATIO" || iv.kind === "NUMBER" || iv.kind === "PERCENT") && v.normalizedValue !== null && iv.numeric !== null && numbersMatch(iv.numeric, v.normalizedValue));
        break;
      case "DAYS":
      case "PERIOD":
      case "NUMBER":
        consider(iv, (iv.kind === "NUMBER" && v.normalizedValue !== null && iv.numeric !== null && numbersMatch(iv.numeric, v.normalizedValue)) || (iv.kind === "TEXT" && !!iv.text && (iv.text.toLowerCase().includes(raw) || (v.normalizedValue !== null && new RegExp(`\\b${v.normalizedValue}\\b`).test(iv.text)))));
        break;
      case "DATE": {
        const iso = toIsoDate(v.rawText.trim());
        consider(iv, (iv.kind === "DATE" && !!iso && iv.text === iso) || (iv.kind === "TEXT" && !!iv.text && (iv.text.toLowerCase().includes(raw) || (!!iso && iv.text.includes(iso)))));
        break;
      }
      default:
        consider(iv, iv.kind === "TEXT" && !!iv.text && iv.text.toLowerCase().includes(raw));
    }
  }
  return { present, attemptedOnly };
}

function normalizeDisposition(raw: string | undefined): InventoryDisposition | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (upper === "REPRESENTED") return null; // self-declared representation is never accepted - lineage/value correspondence decides
  return (INVENTORY_DISPOSITIONS as readonly string[]).includes(upper) ? (upper as InventoryDisposition) : null;
}

function isMaterial(item: SemanticInventoryItem): boolean {
  return item.materiality === "CRITICAL" || item.materiality === "MATERIAL";
}

/**
 * A composition sometimes reproduces an inventoryItemId without its
 * "tag:" prefix (observed on real content across providers - the model
 * still gets the 24-hex-char content digest exactly right, just drops the
 * namespace label). Since that digest IS the item's real identity
 * (stable-keys.ts: `${tag}:${digest}`), and a 24-hex-char match is
 * practically unique, this is resolved by digest lookup rather than
 * scored as a hallucinated/dangling reference - the same "tolerant of
 * model formatting, strict about content" posture as every wire-schema
 * enum in this codebase. A raw id that matches no known digest either way
 * is a genuine dangling reference and is left exactly as given.
 */
function digestOf(id: string): string {
  const idx = id.indexOf(":");
  return (idx >= 0 ? id.slice(idx + 1) : id).toLowerCase();
}
function buildDigestIndex(items: SemanticInventoryItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const it of items) map.set(digestOf(it.inventoryItemId), it.inventoryItemId);
  return map;
}
function canonicalizeId(raw: string, knownIds: Set<string>, digestIndex: Map<string, string>): { id: string; canonicalized: boolean } {
  if (knownIds.has(raw)) return { id: raw, canonicalized: false };
  const mapped = digestIndex.get(digestOf(raw));
  return mapped ? { id: mapped, canonicalized: true } : { id: raw, canonicalized: false };
}

export function reconcileInventoryWithComposition(input: ReconcileInput): SemanticAccountabilityResult {
  const { inventory, composition, sourceContextState } = input;
  const walk = walkComposition(composition);
  const knownIds = new Set(inventory.items.map((i) => i.inventoryItemId));
  const digestIndex = buildDigestIndex(inventory.items);
  let canonicalizedLineageReferences = 0;
  for (const entry of walk.lineage) {
    entry.inventoryItemIds = entry.inventoryItemIds.map((raw) => {
      const { id, canonicalized } = canonicalizeId(raw, knownIds, digestIndex);
      if (canonicalized) canonicalizedLineageReferences++;
      return id;
    });
  }
  const dispositions = (input.dispositions ?? []).map((d) => {
    const { id, canonicalized } = canonicalizeId(d.inventoryItemId, knownIds, digestIndex);
    if (canonicalized) canonicalizedLineageReferences++;
    return { ...d, inventoryItemId: id };
  });
  const dispositionById = new Map<string, { disposition: InventoryDisposition | null; raw: string; note: string }>();
  for (const d of dispositions) dispositionById.set(d.inventoryItemId, { disposition: normalizeDisposition(d.disposition), raw: d.disposition, note: d.note });

  let danglingLineageReferences = 0;
  for (const entry of walk.lineage) for (const id of entry.inventoryItemIds) if (!knownIds.has(id)) danglingLineageReferences++;
  for (const d of dispositions) if (!knownIds.has(d.inventoryItemId)) danglingLineageReferences++;

  const items: ReconciliationItem[] = inventory.items.map((item) => {
    const lineage = walk.lineage.filter((e) => e.inventoryItemIds.includes(item.inventoryItemId));
    const explicit = dispositionById.get(item.inventoryItemId) ?? null;
    const reasons: string[] = [];

    // Quantitative reconciliation (independent of lineage claims).
    const quantitative = item.quantitativeValues.map((value) => {
      const found = findValue(value, walk.values);
      let disposition: QuantitativeDisposition;
      if (found.present.length > 0) disposition = "VALUE_PRESENT_IN_IR";
      else if (found.attemptedOnly.length > 0) disposition = "VALUE_DISPOSITIONED";
      else if (explicit?.disposition && explicit.disposition !== "MISSING_FROM_COMPOSITION") disposition = "VALUE_DISPOSITIONED";
      else if (lineage.length > 0 && lineage.every((e) => e.kind !== "REPRESENTED")) disposition = "VALUE_DISPOSITIONED";
      else disposition = "VALUE_MISSING_FROM_COMPOSITION";
      return { value, disposition, irPaths: found.present.length > 0 ? found.present : found.attemptedOnly };
    });
    const anyValueMissing = quantitative.some((q) => q.disposition === "VALUE_MISSING_FROM_COMPOSITION");
    const anyValueOnlyAttempted = quantitative.some((q) => q.disposition === "VALUE_DISPOSITIONED" && q.irPaths.length > 0);

    let disposition: InventoryDisposition;
    let inferredPaths: string[] = [];
    if (lineage.length > 0) {
      if (anyValueMissing) {
        disposition = "MISSING_FROM_COMPOSITION";
        reasons.push(`composition lineage claims this item (${lineage.map((e) => e.irPath).join(", ")}) but ${quantitative.filter((q) => q.disposition === "VALUE_MISSING_FROM_COMPOSITION").map((q) => q.value.rawText).join(", ")} appears nowhere in the composed IR - a lineage claim without value correspondence does not count`);
      } else if (lineage.some((e) => e.kind === "REPRESENTED") && !anyValueOnlyAttempted) {
        disposition = "REPRESENTED";
        reasons.push(`lineage: ${lineage.map((e) => e.irPath).join(", ")}${quantitative.length > 0 ? `; every stated value present (${quantitative.flatMap((q) => q.irPaths).join(", ")})` : ""}`);
      } else if (lineage.some((e) => e.kind === "UNRESOLVED_DEPENDENCY") && !lineage.some((e) => e.kind === "REPRESENTED")) {
        disposition = "AMBIGUOUS";
        reasons.push(`carried as an unresolved cross-unit dependency (${lineage.map((e) => e.irPath).join(", ")}) - target not resolvable within this unit, never guessed`);
      } else {
        disposition = "UNSUPPORTED";
        reasons.push(`consumed only into UNSUPPORTED structure (${lineage.map((e) => e.irPath).join(", ")})`);
      }
    } else if (explicit?.disposition && explicit.disposition !== "MISSING_FROM_COMPOSITION") {
      disposition = explicit.disposition;
      reasons.push(`composition explicitly dispositioned it ${explicit.disposition}${explicit.note ? `: ${explicit.note}` : ""}`);
    } else {
      // Deterministic correspondence without lineage (disclosed as inferred).
      if (item.quantitativeValues.length > 0 && quantitative.every((q) => q.disposition === "VALUE_PRESENT_IN_IR")) {
        disposition = "REPRESENTED";
        inferredPaths = quantitative.flatMap((q) => q.irPaths);
        reasons.push(`no lineage declared, but every stated value is present in the composed IR (${inferredPaths.join(", ")}) - inferred by value correspondence`);
      } else if (!anyValueMissing && (item.semanticRole === "DEPENDENCY" || item.semanticRole === "REFERENCE") && item.referencedTerms.some((t) => walk.termNames.has(t.toLowerCase()))) {
        disposition = "REPRESENTED";
        reasons.push(`no lineage declared, but the referenced term(s) ${item.referencedTerms.filter((t) => walk.termNames.has(t.toLowerCase())).join(", ")} appear as references/dependencies in the composed IR - inferred by term correspondence`);
      } else if (!anyValueMissing && (item.semanticRole === "DEPENDENCY" || item.semanticRole === "REFERENCE" || item.semanticRole === "SHARED_CAP") && item.referencedSections.some((s) => walk.unresolvedTargetRefs.some((u) => u.includes(s.replace(/\s+/g, "").toLowerCase().replace(/^(sections?|§)/, ""))))) {
        disposition = "AMBIGUOUS";
        reasons.push(`the referenced section is carried as an unresolved cross-unit dependency in the composed IR - review required, never guessed`);
      } else if (item.quantitativeValues.length > 0 && quantitative.every((q) => q.disposition !== "VALUE_MISSING_FROM_COMPOSITION")) {
        disposition = "UNSUPPORTED";
        reasons.push(`stated value(s) appear only inside UNSUPPORTED attempted structure (${quantitative.flatMap((q) => q.irPaths).join(", ")})`);
      } else {
        disposition = "MISSING_FROM_COMPOSITION";
        reasons.push(`no lineage, no explicit disposition, and no deterministic correspondence in the composed IR${item.quantitativeValues.length > 0 ? ` (value(s) ${item.quantitativeValues.map((v) => v.rawText).join(", ")} absent)` : ""}`);
      }
    }

    return {
      inventoryItemId: item.inventoryItemId,
      semanticRole: item.semanticRole,
      materiality: item.materiality,
      disposition,
      lineageIrPaths: [...lineage.map((e) => e.irPath), ...inferredPaths],
      modelDisposition: explicit ? explicit.raw : null,
      quantitative,
      reason: reasons.join("; "),
    };
  });

  const materialItems = items.filter((r) => r.materiality === "CRITICAL" || r.materiality === "MATERIAL");
  const count = (d: InventoryDisposition) => items.filter((r) => r.disposition === d).length;
  const materialMissing = materialItems.filter((r) => r.disposition === "MISSING_FROM_COMPOSITION");
  const criticalMissing = materialMissing.filter((r) => r.materiality === "CRITICAL");
  const materialValues = materialItems.flatMap((r) => r.quantitative);
  const materialValuesMissing = materialValues.filter((q) => q.disposition === "VALUE_MISSING_FROM_COMPOSITION");
  const operativeEconomicUninventoried = inventory.uninventoriedValues.filter((v) => v.regionId === "operative" && (v.kind === "MONEY" || v.kind === "PERCENT" || v.kind === "RATIO"));

  const reasons: string[] = [];
  if (inventory.inventoryStatus !== "INVENTORY_OK") reasons.push(`inventory status ${inventory.inventoryStatus}: ${inventory.inventoryStatusReason}`);
  if (inventory.uninventoriedSegments.length > 0) reasons.push(`${inventory.uninventoriedSegments.length} operative-text segment(s) Pass A could not account for: ${inventory.uninventoriedSegments.map((s) => `${s.regionId}:${s.charStart}-${s.charEnd}`).join(", ")} - materiality undetermined, review required`);
  if (sourceContextState !== "COMPLETE_LOCAL_SOURCE" && sourceContextState !== "DEPENDENCY_EXPANDED_SOURCE") reasons.push(`source context is ${sourceContextState} - the unit's own boundary was not established as complete`);
  if (materialMissing.length > 0) reasons.push(`${materialMissing.length} material inventory item(s) MISSING_FROM_COMPOSITION (${criticalMissing.length} CRITICAL): ${materialMissing.map((r) => `${r.inventoryItemId} [${r.semanticRole}]`).join(", ")}`);
  if (materialValuesMissing.length > 0) reasons.push(`${materialValuesMissing.length} material quantitative value(s) absent from the composed IR: ${materialValuesMissing.map((q) => q.value.rawText).join(", ")}`);
  if (operativeEconomicUninventoried.length > 0) reasons.push(`${operativeEconomicUninventoried.length} money/percent/ratio value(s) in the operative text were inventoried by neither Pass A nor the composition: ${operativeEconomicUninventoried.map((v) => v.rawText).join(", ")} - materiality undetermined, review required`);
  if (danglingLineageReferences > 0) reasons.push(`${danglingLineageReferences} lineage/disposition reference(s) name an inventoryItemId that does not exist in the frozen inventory`);

  const semanticallyComplete = inventory.inventoryStatus === "INVENTORY_OK" && (sourceContextState === "COMPLETE_LOCAL_SOURCE" || sourceContextState === "DEPENDENCY_EXPANDED_SOURCE") && materialMissing.length === 0 && materialValuesMissing.length === 0 && operativeEconomicUninventoried.length === 0 && danglingLineageReferences === 0;

  return {
    candidateRef: inventory.candidateRef,
    inventoryStatus: inventory.inventoryStatus,
    sourceContextState,
    items,
    counts: {
      inventoried: items.length,
      material: materialItems.length,
      represented: count("REPRESENTED"),
      intentionallyNonComputational: count("INTENTIONALLY_NON_COMPUTATIONAL"),
      unsupported: count("UNSUPPORTED"),
      ambiguous: count("AMBIGUOUS"),
      missingFromComposition: count("MISSING_FROM_COMPOSITION"),
      materialMissingFromComposition: materialMissing.length,
      criticalMissingFromComposition: criticalMissing.length,
      materialQuantitativeValues: materialValues.length,
      materialQuantitativeValuesMissing: materialValuesMissing.length,
      uninventoriedValues: inventory.uninventoriedValues.length,
      uninventoriedSegments: inventory.uninventoriedSegments.length,
      danglingLineageReferences,
      canonicalizedLineageReferences,
    },
    semanticallyComplete,
    reasons,
    algorithmVersion: SEMANTIC_ACCOUNTABILITY_ALGORITHM_VERSION,
  };
}
