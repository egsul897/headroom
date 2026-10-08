/**
 * Unlimited carve-out qualitative-gate honesty (emit/recompile).
 *
 * An uncapped permission whose own clause conjoins two qualitative restrictions
 * — a property-character object class, and a manner such as ordinary course —
 * is two gates. Neither test has a licensed computable condition type. The
 * licensed residual is conditionType UNSUPPORTED on each gate, composed with
 * AND on UNLIMITED_CAPACITY.gatedBy. Sufficiency is PARTIAL. A consumer cannot
 * execute the gate and cannot treat either restriction as absent.
 *
 * This pass does not invent a condition type, does not map a property-character
 * test onto PURPOSE, ENTITY_TYPE, or SECURITY_SCOPE, and does not special-case
 * an agreement or a section. A defined term standing alone as the object is
 * not a property-character test. A single manner with no separate object class
 * is left as the emitter wrote it.
 *
 * A pre-existing condition is removed only when every non-empty surface is
 * redundant with the two gates. Substring containment is not equivalence: a
 * third independent qualifier is kept. An operative pair that cannot be
 * uniquely attributed is not copied onto a sibling, and sufficiency is
 * AMBIGUOUS. Unknown attribution is not COMPLETE.
 *
 * Soft gate. invent-absence forever. IMPLEMENTED ≠ CERTIFIED.
 */
import { withExpressionId } from "../../ir/identity";
import type { IRCapacityExpression, IRCondition, IRExpression, IRUnsupportedExpression, SourceProvenance, UnlimitedCapacity } from "../../ir/types";

export const UNLIMITED_CARVEOUT_QUALITATIVE_GATE_REASON =
  "QUALITATIVE_GATE_NO_CLOSED_CONDITION_TYPE: an unlimited carve-out states a property-character object class and an ordinary-course manner; neither has a licensed computable condition type, so each gate is UNSUPPORTED, composed with AND on gatedBy, and sufficiency is PARTIAL (invent-absence; not a certification)";

export const UNLIMITED_CARVEOUT_AMBIGUOUS_ATTRIBUTION_REASON =
  "QUALITATIVE_GATE_ATTRIBUTION_AMBIGUOUS: the operative window states a property-character object class and an ordinary-course manner, but this unlimited rule cannot be uniquely attributed that clause; the gates are not copied onto a sibling by guess, and unknown attribution is AMBIGUOUS rather than COMPLETE (invent-absence; not a certification)";

const FUNCTION_WORDS = new Set(["a", "an", "the", "any", "its", "such", "other", "all", "of", "or", "and", "to", "for", "by", "with", "from", "on", "in", "at", "as"]);

/** Framing words a restatement uses around the two gates. An independent qualifier is a token outside this list. */
const RESTATEMENT_WORDS = new Set(["exception", "exceptions", "transfer", "transfers", "transferred", "transferring", "applies", "apply", "applied", "applying", "only", "occurs", "occur", "occurring", "occurred", "when", "provided", "that", "this", "carve", "out", "unlimited", "permission", "permitted", "does", "do", "be", "is", "are", "was", "were", "which", "shall", "must", "may", "will"]);

/** Lowercase object phrase, then the ordinary-course manner, in one clause. Defined-term capitals do not match. Fresh each call so lastIndex cannot leak. */
function dualQualitativePattern(): RegExp {
  return /\bof\s+([a-z](?:[a-z]|[\s,-])*?)\s+(in\s+the\s+ordinary\s+course(?:\s+of\s+business)?)\b/g;
}

export interface UnlimitedCarveOutHonestyInput {
  operativeText: string;
  /** Model excerpts and descriptions for THIS rule, used only to choose a clause when the operative window states more than one. */
  anchors: readonly (string | null | undefined)[];
  scopePath: string;
  /** True when this submission contains exactly one UNLIMITED_CAPACITY rule, so a single operative match can be attributed without guessing across siblings. */
  soleUnlimited: boolean;
  capacity: IRCapacityExpression | null;
  conditions: IRCondition[];
  /** Binds an exact source slice to authoritative provenance. A null excerpt fails closed: the rem does not emit an unbound gate. */
  bindExcerpt: (excerpt: string) => SourceProvenance | null;
}

export interface UnlimitedCarveOutHonestyResult {
  capacity: IRCapacityExpression | null;
  conditions: IRCondition[];
  applied: boolean;
  /** True when the operative pair exists and this rule cannot be uniquely attributed it. Sufficiency must not stay COMPLETE. */
  ambiguousAttribution: boolean;
  reason: string | null;
}

function norm(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function isPropertyCharacterPhrase(raw: string): boolean {
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed || /[A-Z0-9$%]/.test(collapsed)) return false;
  if (/[^a-z\s,-]/.test(collapsed)) return false;
  const content = collapsed.split(/[\s,]+/).filter((token) => token.length > 0 && !FUNCTION_WORDS.has(token));
  return content.length >= 2;
}

interface QualitativePair {
  objectExcerpt: string;
  mannerExcerpt: string;
}

function findPairs(operativeText: string): QualitativePair[] {
  const pairs: QualitativePair[] = [];
  for (const match of operativeText.matchAll(dualQualitativePattern())) {
    const objectExcerpt = match[1] ?? "";
    const mannerExcerpt = match[2] ?? "";
    if (!objectExcerpt || !mannerExcerpt) continue;
    if (match[0].includes(";")) continue;
    if (!isPropertyCharacterPhrase(objectExcerpt)) continue;
    pairs.push({ objectExcerpt, mannerExcerpt });
  }
  return pairs;
}

function selectPair(pairs: QualitativePair[], anchors: readonly (string | null | undefined)[], soleUnlimited: boolean): { kind: "absent" } | { kind: "ambiguous" } | { kind: "selected"; pair: QualitativePair } {
  if (pairs.length === 0) return { kind: "absent" };
  const usable = anchors.filter((anchor): anchor is string => typeof anchor === "string" && anchor.trim().length > 0);
  const named = pairs.filter((pair) => usable.some((anchor) => norm(anchor).includes(norm(pair.objectExcerpt))));
  if (named.length === 1) return { kind: "selected", pair: named[0]! };
  if (named.length > 1) return { kind: "ambiguous" };
  if (pairs.length === 1 && soleUnlimited) return { kind: "selected", pair: pairs[0]! };
  return { kind: "ambiguous" };
}

function excerptOf(condition: IRCondition): string | null {
  return condition.provenance?.excerpt ?? null;
}

function isExactGate(condition: IRCondition, excerpt: string): boolean {
  return condition.conditionType === "UNSUPPORTED" && excerptOf(condition) !== null && norm(excerptOf(condition)!) === norm(excerpt);
}

function hasIndependentQualifier(surface: string, objectExcerpt: string, mannerExcerpt: string): boolean {
  let rest = norm(surface);
  const objectN = norm(objectExcerpt);
  const mannerN = norm(mannerExcerpt);
  if (objectN) rest = rest.split(objectN).join(" ");
  if (mannerN) rest = rest.split(mannerN).join(" ");
  const tokens = rest.split(/[^a-z0-9-]+/).filter((token) => token.length > 0 && !FUNCTION_WORDS.has(token) && !RESTATEMENT_WORDS.has(token));
  return tokens.length > 0;
}

/**
 * Redundant only when every non-empty surface, after the two gate phrases are
 * removed, has no remaining qualifier. An exact gate is kept. A surface that
 * merely contains a gate phrase is not redundant.
 */
function isQualitativelyRedundant(condition: IRCondition, objectExcerpt: string, mannerExcerpt: string): boolean {
  if (condition.conditionType !== "UNSUPPORTED") return false;
  if (isExactGate(condition, objectExcerpt) || isExactGate(condition, mannerExcerpt)) return false;
  const surfaces = [norm(excerptOf(condition) ?? ""), norm(condition.description ?? "")].filter((surface) => surface.length > 0);
  if (surfaces.length === 0) return false;
  const mentionsGate = surfaces.some((surface) => surface.includes(norm(objectExcerpt)) || surface.includes(norm(mannerExcerpt)));
  if (!mentionsGate) return false;
  return surfaces.every((surface) => !hasIndependentQualifier(surface, objectExcerpt, mannerExcerpt));
}

function visitUnsupported(expr: IRExpression | null, visit: (node: IRUnsupportedExpression) => void): void {
  if (!expr) return;
  if (expr.kind === "UNSUPPORTED") {
    visit(expr);
    return;
  }
  if (expr.kind === "AND" || expr.kind === "OR") {
    for (const operand of expr.operands) visitUnsupported(operand, visit);
  }
}

function hasEvidence(expr: IRExpression | null, excerpt: string): boolean {
  const want = norm(excerpt);
  let found = false;
  visitUnsupported(expr, (node) => {
    if (norm(node.sourceEvidence) === want) found = true;
  });
  return found;
}

function objectDescription(excerpt: string): string {
  return `The unlimited carve-out applies only to ${excerpt.replace(/\s+/g, " ").trim()}. This property-character test has no licensed computable condition type.`;
}

function mannerDescription(excerpt: string): string {
  return `The unlimited carve-out applies only when it is ${excerpt.replace(/\s+/g, " ").trim()}. This manner test has no licensed computable condition type.`;
}

function qualitativeLeaf(excerpt: string, description: string, provenance: SourceProvenance | null): IRExpression {
  return withExpressionId({
    kind: "UNSUPPORTED",
    type: null,
    sourceEvidence: excerpt,
    semanticDescription: description,
    reason: UNLIMITED_CARVEOUT_QUALITATIVE_GATE_REASON,
    requiredReview: true,
    ...(provenance ? { provenance } : {}),
  });
}

function andGate(operands: IRExpression[], provenance?: SourceProvenance): IRExpression {
  return withExpressionId({
    kind: "AND",
    type: "BOOLEAN",
    operands,
    ...(provenance ? { provenance } : {}),
  });
}

function composeGate(existing: IRExpression | null, objectLeaf: IRExpression, mannerLeaf: IRExpression, pair: QualitativePair, provenance?: SourceProvenance): IRExpression {
  const needObject = !hasEvidence(existing, pair.objectExcerpt);
  const needManner = !hasEvidence(existing, pair.mannerExcerpt);
  if (!existing) return andGate([objectLeaf, mannerLeaf], provenance);
  if (existing.kind === "AND" && !needObject && !needManner) return existing;
  const added: IRExpression[] = [];
  if (needObject) added.push(objectLeaf);
  if (needManner) added.push(mannerLeaf);
  if (existing.kind === "AND") return andGate([...existing.operands, ...added], existing.provenance ?? provenance);
  return andGate([existing, ...added], provenance);
}

function unchanged(input: UnlimitedCarveOutHonestyInput): UnlimitedCarveOutHonestyResult {
  return { capacity: input.capacity, conditions: input.conditions, applied: false, ambiguousAttribution: false, reason: null };
}

function ambiguousAttribution(input: UnlimitedCarveOutHonestyInput): UnlimitedCarveOutHonestyResult {
  return { capacity: input.capacity, conditions: input.conditions, applied: false, ambiguousAttribution: true, reason: UNLIMITED_CARVEOUT_AMBIGUOUS_ATTRIBUTION_REASON };
}

/**
 * Materializes both qualitative gates on an unlimited carve-out when the
 * operative clause states them and the compiled rule does not already carry
 * each one as its own UNSUPPORTED condition and as an operand of gatedBy AND.
 * Returns the input unchanged when the pattern is absent or the source slice
 * cannot be bound. An unattributable pair leaves the gates uncopied and sets
 * ambiguousAttribution so sufficiency cannot stay COMPLETE.
 */
export function applyUnlimitedCarveOutQualitativeGates(input: UnlimitedCarveOutHonestyInput): UnlimitedCarveOutHonestyResult {
  const capacity = input.capacity;
  if (!capacity || capacity.kind !== "UNLIMITED_CAPACITY") return unchanged(input);
  const selection = selectPair(findPairs(input.operativeText), input.anchors, input.soleUnlimited);
  if (selection.kind === "absent") return unchanged(input);
  if (selection.kind === "ambiguous") return ambiguousAttribution(input);
  const pair = selection.pair;

  const redundant = input.conditions.some((condition) => isQualitativelyRedundant(condition, pair.objectExcerpt, pair.mannerExcerpt));
  const hasObjectCondition = input.conditions.some((condition) => isExactGate(condition, pair.objectExcerpt));
  const hasMannerCondition = input.conditions.some((condition) => isExactGate(condition, pair.mannerExcerpt));
  const gated = capacity.gatedBy ?? null;
  const composed = gated?.kind === "AND" && hasEvidence(gated, pair.objectExcerpt) && hasEvidence(gated, pair.mannerExcerpt);
  if (!redundant && hasObjectCondition && hasMannerCondition && composed) return unchanged(input);

  const objectProvenance = input.bindExcerpt(pair.objectExcerpt);
  const mannerProvenance = input.bindExcerpt(pair.mannerExcerpt);
  if (!objectProvenance?.excerpt || !mannerProvenance?.excerpt) return unchanged(input);

  const kept = input.conditions.filter((condition) => !isQualitativelyRedundant(condition, pair.objectExcerpt, pair.mannerExcerpt));
  const next: IRCondition[] = [...kept];
  if (!next.some((condition) => isExactGate(condition, pair.objectExcerpt))) {
    next.push({
      conditionId: "",
      conditionType: "UNSUPPORTED",
      expression: null,
      referencesDefinitionId: null,
      description: objectDescription(pair.objectExcerpt),
      provenance: objectProvenance,
    });
  }
  if (!next.some((condition) => isExactGate(condition, pair.mannerExcerpt))) {
    next.push({
      conditionId: "",
      conditionType: "UNSUPPORTED",
      expression: null,
      referencesDefinitionId: null,
      description: mannerDescription(pair.mannerExcerpt),
      provenance: mannerProvenance,
    });
  }
  const conditions = next.map((condition, index) => ({ ...condition, conditionId: `${input.scopePath}.condition[${index}]` }));

  const unlimited = capacity as UnlimitedCapacity;
  const gatedBy = composeGate(
    unlimited.gatedBy,
    qualitativeLeaf(pair.objectExcerpt, objectDescription(pair.objectExcerpt), objectProvenance),
    qualitativeLeaf(pair.mannerExcerpt, mannerDescription(pair.mannerExcerpt), mannerProvenance),
    pair,
    unlimited.provenance
  );
  return {
    capacity: { ...unlimited, gatedBy },
    conditions,
    applied: true,
    ambiguousAttribution: false,
    reason: UNLIMITED_CARVEOUT_QUALITATIVE_GATE_REASON,
  };
}
