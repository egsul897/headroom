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
 * is left as the emitter wrote it. An exact gate whose description only
 * narrates both gates is narrowed to the gate its excerpt already states.
 * A description that also states an independent qualifier is left as written.
 * A capitalized act name that the context bundle retrieved as a definition is
 * not synthesized into a DEFINED_TERM_REFERENCE: a compiled term node is
 * reliance, and the source contract then closes over that definition's own
 * dependency edges.
 *
 * A pre-existing condition is removed only when exact semantic redundancy with
 * those gates is proven. Substring containment is not equivalence. Excerpt and
 * description are the surfaces compared to the gate strings. expression,
 * referencesDefinitionId, referencesRuleTargets, evaluationBasis, and a
 * rawModelExcerpt that is not itself an exact gate are retention carriers:
 * if any of them is present, redundancy is not proven and the condition stays.
 *
 * A clause-sized excerpt is not the manner gate when one of those carriers,
 * or the description, states an independent restriction. The manner gate is
 * still emitted.
 *
 * When the operative window states the pair but this unlimited rule cannot be
 * uniquely attributed it, the gates are not copied by guess and sufficiency
 * is AMBIGUOUS. Unknown attribution is not COMPLETE. When the pair is
 * selected and the source slice cannot be bound, the gates are not emitted
 * and sufficiency is not left COMPLETE.
 *
 * Soft gate. invent-absence forever. IMPLEMENTED ≠ CERTIFIED.
 */
import { withExpressionId } from "../../ir/identity";
import type { IRCapacityExpression, IRCondition, IRExpression, IRUnsupportedExpression, SourceProvenance, UnlimitedCapacity } from "../../ir/types";

export const UNLIMITED_CARVEOUT_QUALITATIVE_GATE_REASON =
  "QUALITATIVE_GATE_NO_CLOSED_CONDITION_TYPE: an unlimited carve-out states a property-character object class and an ordinary-course manner; neither has a licensed computable condition type, so each gate is UNSUPPORTED, composed with AND on gatedBy, and sufficiency is PARTIAL (invent-absence; not a certification)";

export const UNLIMITED_CARVEOUT_AMBIGUOUS_ATTRIBUTION_REASON =
  "QUALITATIVE_GATE_ATTRIBUTION_AMBIGUOUS: the operative window states a property-character object class and an ordinary-course manner, but this unlimited rule cannot be uniquely attributed that clause; the gates are not copied onto a sibling by guess, and unknown attribution is AMBIGUOUS rather than COMPLETE (invent-absence; not a certification)";

export const UNLIMITED_CARVEOUT_UNBOUND_PAIR_REASON =
  "QUALITATIVE_GATE_SOURCE_UNBOUND: this unlimited rule is the unique attribution of a property-character object class and an ordinary-course manner, but the source slice could not be bound; the gates are not emitted unbound, and sufficiency is not COMPLETE (invent-absence; not a certification)";

const FUNCTION_WORDS = new Set(["a", "an", "the", "any", "its", "such", "other", "all", "of", "or", "and", "to", "for", "by", "with", "from", "on", "in", "at", "as"]);

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
  /** True when the pair was selected and the source slice did not bind. Gates stay uncopied. Sufficiency must not stay COMPLETE. */
  unboundPair: boolean;
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
  /** Exact source slice from the object through the manner. Distinct per clause when the object is. */
  clauseExcerpt: string;
}

function findPairs(operativeText: string): QualitativePair[] {
  const pairs: QualitativePair[] = [];
  for (const match of operativeText.matchAll(dualQualitativePattern())) {
    const objectExcerpt = match[1] ?? "";
    const mannerExcerpt = match[2] ?? "";
    if (!objectExcerpt || !mannerExcerpt) continue;
    if (match[0].includes(";")) continue;
    if (!isPropertyCharacterPhrase(objectExcerpt)) continue;
    const objectAt = match[0].indexOf(objectExcerpt);
    const mannerAt = match[0].lastIndexOf(mannerExcerpt);
    const start = (match.index ?? 0) + objectAt;
    const end = (match.index ?? 0) + mannerAt + mannerExcerpt.length;
    pairs.push({ objectExcerpt, mannerExcerpt, clauseExcerpt: operativeText.slice(start, end) });
  }
  return pairs;
}

type PairSelection =
  | { kind: "selected"; pair: QualitativePair }
  | { kind: "absent" }
  | { kind: "ambiguous" };

function selectPair(pairs: QualitativePair[], anchors: readonly (string | null | undefined)[], soleUnlimited: boolean): PairSelection {
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

function gateExactSet(objectExcerpt: string, mannerExcerpt: string): Set<string> {
  const objectN = norm(objectExcerpt);
  const mannerN = norm(mannerExcerpt);
  return new Set([objectN, mannerN, `${objectN} ${mannerN}`, `${mannerN} ${objectN}`]);
}

/**
 * Carriers that can state a restriction this pass does not prove redundant.
 * Excerpt and description are compared separately, as exact gate strings.
 * rawModelExcerpt is not authoritative source evidence; it still blocks
 * deletion when it is not itself an exact gate or the authoritative excerpt.
 */
function unprovenCarrier(condition: IRCondition, objectExcerpt: string, mannerExcerpt: string): boolean {
  if (condition.expression != null) return true;
  if (condition.referencesDefinitionId != null) return true;
  if ((condition.referencesRuleTargets?.length ?? 0) > 0) return true;
  if (condition.evaluationBasis != null) return true;
  const raw = condition.provenance?.rawModelExcerpt;
  if (typeof raw !== "string" || norm(raw).length === 0) return false;
  const rawN = norm(raw);
  const exact = gateExactSet(objectExcerpt, mannerExcerpt);
  if (exact.has(rawN)) return false;
  const authoritative = norm(excerptOf(condition) ?? "");
  return authoritative.length === 0 || rawN !== authoritative;
}

function hasMannerGate(conditions: readonly IRCondition[], pair: QualitativePair, operativeText: string): boolean {
  return conditions.some((condition) => isExactGate(condition, pair.mannerExcerpt) || clauseCountsAsMannerGate(condition, pair, operativeText));
}

/**
 * A clause excerpt (object through manner) is the manner gate only when no
 * unproven carrier and no description word beyond the pair is present.
 * The deterministic gate descriptions this pass writes are not qualifiers.
 */
function clauseCountsAsMannerGate(condition: IRCondition, pair: QualitativePair, operativeText: string): boolean {
  if (!isExactGate(condition, pair.clauseExcerpt)) return false;
  if (unprovenCarrier(condition, pair.objectExcerpt, pair.mannerExcerpt)) return false;
  const description = condition.description ?? "";
  if (description.length === 0) return true;
  const descriptionN = norm(description);
  if (gateExactSet(pair.objectExcerpt, pair.mannerExcerpt).has(descriptionN)) return true;
  if (descriptionN === norm(objectDescription(pair.objectExcerpt)) || descriptionN === norm(mannerDescription(pair.mannerExcerpt))) return true;
  const act = actTokenBefore(operativeText, pair.objectExcerpt);
  return qualifiersBeyondPair(description, pair.objectExcerpt, pair.mannerExcerpt, act).length === 0;
}

/** True when needle occurs once in haystack after whitespace and case folding. */
function occursOnce(haystack: string, needle: string): boolean {
  const hay = norm(haystack);
  const pin = norm(needle);
  if (!pin) return false;
  const at = hay.indexOf(pin);
  return at >= 0 && hay.indexOf(pin, at + pin.length) === -1;
}

/**
 * Binds the gate phrase when that phrase is a unique source span. A manner
 * repeated across sibling clauses is not unique; the clause slice (object
 * through manner) is, and binding that slice does not call the binder on the
 * ambiguous short phrase (a failed bind would record a false unresolved excerpt).
 */
function bindGate(input: UnlimitedCarveOutHonestyInput, excerpt: string, clauseExcerpt: string): SourceProvenance | null {
  const candidates: string[] = [];
  if (occursOnce(input.operativeText, excerpt)) candidates.push(excerpt);
  if (norm(clauseExcerpt) !== norm(excerpt) && occursOnce(input.operativeText, clauseExcerpt)) candidates.push(clauseExcerpt);
  for (const candidate of candidates) {
    const bound = input.bindExcerpt(candidate);
    if (bound?.excerpt && norm(bound.excerpt).includes(norm(excerpt))) return bound;
  }
  return null;
}

/**
 * Exact redundancy is equality of every non-empty authoritative excerpt and
 * description with one gate or with both gates in either order, and no
 * unproven carrier. A surface that merely contains a gate phrase is not
 * redundant. Substring overlap must not delete an independent qualifier.
 */
function isExactlyRedundant(condition: IRCondition, objectExcerpt: string, mannerExcerpt: string): boolean {
  if (condition.conditionType !== "UNSUPPORTED") return false;
  if (unprovenCarrier(condition, objectExcerpt, mannerExcerpt)) return false;
  const exact = gateExactSet(objectExcerpt, mannerExcerpt);
  const surfaces = [norm(excerptOf(condition) ?? ""), norm(condition.description ?? "")].filter((surface) => surface.length > 0);
  if (surfaces.length === 0) return false;
  return surfaces.every((surface) => exact.has(surface));
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

/** Sentence glue around the two gate phrases. An independent qualifier is any other word. */
const DESCRIPTION_GLUE = new Set(["a", "an", "the", "of", "for", "or", "and", "if", "in", "to", "on", "by", "with", "only", "applies", "apply", "applied", "exception", "occurs", "occur", "occurring", "when", "that", "this", "such", "its", "it", "is", "be", "may", "shall"]);

function actTokenBefore(operativeText: string, objectExcerpt: string): string | null {
  const text = operativeText.replace(/\s+/g, " ");
  const objectNorm = norm(objectExcerpt);
  const idx = norm(text).indexOf(objectNorm);
  if (idx < 0) return null;
  const before = text.slice(0, idx);
  const match = before.match(/\b([A-Za-z]+)\s+of\s*$/);
  return match?.[1] ?? null;
}

/**
 * Words left in a description after the two gate phrases and the act token
 * are removed. Empty means the description narrates the pair and nothing else.
 */
function qualifiersBeyondPair(description: string, objectExcerpt: string, mannerExcerpt: string, actToken: string | null): string[] {
  let text = norm(description);
  for (const phrase of [norm(objectExcerpt), norm(mannerExcerpt)].sort((a, b) => b.length - a.length)) {
    if (phrase.length > 0) text = text.split(phrase).join(" ");
  }
  const act = actToken ? norm(actToken) : null;
  return text.split(/[^a-z0-9]+/).filter((token) => token.length > 0 && !DESCRIPTION_GLUE.has(token) && token !== act);
}

/**
 * An exact object or manner gate whose description also narrates the other
 * gate, and no independent qualifier, is restated as that one gate. A
 * description with any other word is returned unchanged so the qualifier stays.
 */
function narrowExactGateDescription(condition: IRCondition, pair: QualitativePair, operativeText: string): IRCondition {
  const exactObject = isExactGate(condition, pair.objectExcerpt);
  const exactManner = isExactGate(condition, pair.mannerExcerpt);
  if (exactObject === exactManner) return condition;
  const other = exactObject ? pair.mannerExcerpt : pair.objectExcerpt;
  if (!norm(condition.description).includes(norm(other))) return condition;
  const act = actTokenBefore(operativeText, pair.objectExcerpt);
  if (qualifiersBeyondPair(condition.description, pair.objectExcerpt, pair.mannerExcerpt, act).length > 0) return condition;
  const description = exactObject ? objectDescription(pair.objectExcerpt) : mannerDescription(pair.mannerExcerpt);
  return description === condition.description ? condition : { ...condition, description };
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
  return { capacity: input.capacity, conditions: input.conditions, applied: false, ambiguousAttribution: false, unboundPair: false, reason: null };
}

function ambiguousAttribution(input: UnlimitedCarveOutHonestyInput): UnlimitedCarveOutHonestyResult {
  return { capacity: input.capacity, conditions: input.conditions, applied: false, ambiguousAttribution: true, unboundPair: false, reason: UNLIMITED_CARVEOUT_AMBIGUOUS_ATTRIBUTION_REASON };
}

function unboundSelectedPair(input: UnlimitedCarveOutHonestyInput): UnlimitedCarveOutHonestyResult {
  return { capacity: input.capacity, conditions: input.conditions, applied: false, ambiguousAttribution: false, unboundPair: true, reason: UNLIMITED_CARVEOUT_UNBOUND_PAIR_REASON };
}

/**
 * Materializes both qualitative gates on an unlimited carve-out when the
 * operative clause states them and the compiled rule does not already carry
 * each one as its own UNSUPPORTED condition and as an operand of gatedBy AND.
 * Returns the input unchanged when the pattern is absent. An unattributable
 * pair leaves the gates uncopied and sets ambiguousAttribution so sufficiency
 * cannot stay COMPLETE. A selected pair whose source slice cannot be bound
 * leaves the gates uncopied and sets unboundPair so sufficiency cannot stay
 * COMPLETE.
 */
export function applyUnlimitedCarveOutQualitativeGates(input: UnlimitedCarveOutHonestyInput): UnlimitedCarveOutHonestyResult {
  const capacity = input.capacity;
  if (!capacity || capacity.kind !== "UNLIMITED_CAPACITY") return unchanged(input);
  const selection = selectPair(findPairs(input.operativeText), input.anchors, input.soleUnlimited);
  if (selection.kind === "absent") return unchanged(input);
  if (selection.kind === "ambiguous") return ambiguousAttribution(input);
  const pair = selection.pair;

  const redundant = input.conditions.some((condition) => isExactlyRedundant(condition, pair.objectExcerpt, pair.mannerExcerpt));
  const hasObjectCondition = input.conditions.some((condition) => isExactGate(condition, pair.objectExcerpt));
  const hasMannerCondition = hasMannerGate(input.conditions, pair, input.operativeText);
  const gated = capacity.gatedBy ?? null;
  const composed = gated?.kind === "AND" && hasEvidence(gated, pair.objectExcerpt) && hasEvidence(gated, pair.mannerExcerpt);
  if (!redundant && hasObjectCondition && hasMannerCondition && composed) return unchanged(input);

  const objectProvenance = bindGate(input, pair.objectExcerpt, pair.clauseExcerpt);
  const mannerProvenance = bindGate(input, pair.mannerExcerpt, pair.clauseExcerpt);
  if (!objectProvenance?.excerpt || !mannerProvenance?.excerpt) return unboundSelectedPair(input);

  const kept = input.conditions
    .filter((condition) => !isExactlyRedundant(condition, pair.objectExcerpt, pair.mannerExcerpt))
    .map((condition) => narrowExactGateDescription(condition, pair, input.operativeText));
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
  if (!hasMannerGate(next, pair, input.operativeText)) {
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
    unboundPair: false,
    reason: UNLIMITED_CARVEOUT_QUALITATIVE_GATE_REASON,
  };
}
