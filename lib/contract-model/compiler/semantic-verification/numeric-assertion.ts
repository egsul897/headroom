/**
 * FIX B - material numeric assertions carried in FREE-TEXT IR fields.
 *
 * Root cause this closes (docs/phase-3-unsupported-numeric-forensics): the verifier's numeric
 * grounding ran end to end, but only over STRUCTURED numeric nodes. ir-inventory.ts inventories a
 * MONEY/NUMBER/PERCENT/RATIO literal; reconciliation.ts's findIrOnlyNumericItems then sweeps every
 * such node no source figure claimed and reports it IR_ONLY. A number the model asserted inside a
 * description, an event name, a period phrase or a provenance excerpt was never inventoried at all,
 * so it was never compared with anything - which is how a "100%" that appears nowhere in the
 * candidate's anchor, nowhere in any retrieved context, and nowhere in any prompt or few-shot
 * survived into a rule whose own representationSufficiency was COMPLETE.
 *
 * Three deliberate limits, because the cheap way to "fix" this is to make it scream:
 *
 *  1. Only fields that can carry a SUBSTANTIVE legal/economic assertion are inventoried
 *     (IR_FREE_TEXT_FIELD_AUDIT below is the whole audit, as data rather than as a comment).
 *     A citation identifier is never one: "Section 7.2(f)" must not manufacture a numeric
 *     assertion out of section numbering, which is why citation/identifier fields are excluded by
 *     CLASS and the grammar itself only ever recognizes a semantically QUALIFIED figure.
 *  2. The grammar recognizes currency, percentage, ratio and unit-qualified quantity forms only.
 *     A bare integer with nothing around it to say what it means ("2029", "1.01", "(iii)") is not
 *     a numeric assertion and is never treated as one.
 *  3. Grounding is a RENDERING equivalence, never a semantic one: 10% == 10.0%, $150 million ==
 *     $150,000,000, 2.0x == 2.00x, "thirty days" == "30 days". "all"/"entire"/"fully" are NOT
 *     100% here. Inferring that is precisely the class of unsupported transformation this module
 *     exists to catch, and a verifier that performed it could never detect one.
 *
 * This module never mutates compiler output and never deletes a value (mission §8): it inventories,
 * it compares against the SAME authenticated evidence universe the structured path already uses
 * (the candidate's own operative window plus retrieved-evidence.ts's authenticated set), and it
 * reports. reconciliation.ts decides what an UNGROUNDED result becomes; verify.ts decides what the
 * finding does to status.
 *
 * No company/package/section-specific logic (Architecture Invariants #29): every pattern is generic
 * legal-drafting number grammar, and nothing here knows any term, section or figure.
 */
import { hashParts } from "../hashing";
import { AMOUNT_RE, parseScaledAmount } from "./amount-parser";
import type {
  ExtractedNumeric,
  IRDefinition,
  IRRule,
  NumericAssertionEvidenceText,
  NumericAssertionFieldAuditEntry,
  NumericAssertionGrounding,
  NumericAssertionInventory,
  NumericAssertionItem,
} from "./types";
import type { IRCondition, IRException, IRExpression } from "../../ir/types";

export const NUMERIC_ASSERTION_ALGORITHM_VERSION = "fix-b-numeric-assertion.v1";

// ---------------------------------------------------------------------------
// Mission §4 - the free-text field audit, as data.
//
// Only MATERIAL_ASSERTION_FIELD and SOURCE_QUOTATION_FIELD entries are inventoried, and they are
// inventoried for DIFFERENT reasons: a material assertion field states what the rule MEANS (an
// ungrounded figure there is an unsupported assertion), a source quotation field claims to be the
// source VERBATIM (an ungrounded figure there is a fabricated excerpt - a provenance defect, not a
// meaning defect). findings.ts keeps those two outcomes as different finding types.
// ---------------------------------------------------------------------------

export const IR_FREE_TEXT_FIELD_AUDIT: readonly NumericAssertionFieldAuditEntry[] = [
  { fieldPath: "IRRule.conditions[].description", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "states the qualifying condition the rule imposes - a threshold asserted here changes when the permission is available" },
  { fieldPath: "IRRule.exceptions[].description", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "states what the exception carves out - a figure here changes capacity" },
  { fieldPath: "IRRule.exceptions[].conditions[].description", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "same as a rule condition, nested under an exception" },
  { fieldPath: "IRRule.dependsOn[].description", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "states the relationship to another rule - a shared-cap figure asserted here is an economic claim" },
  { fieldPath: "IRRule.unresolvedDependencies[].description", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "same, for an edge whose target lives outside this compilation unit" },
  { fieldPath: "IRExpression(UNSUPPORTED).semanticDescription", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "the escape hatch's own statement of what the source means - the one place an unrepresentable threshold is legitimately written as prose, so also the one place a fabricated one hides best" },
  { fieldPath: "IRExpression(SCHEDULE).cases[].description", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "describes a stepped threshold's step - a figure here is the step" },
  { fieldPath: "IRExpression(EVENT_ACTIVE).eventDescription", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "names the triggering event; thresholds are routinely stated in the event name" },
  { fieldPath: "IRExpression(EVENT_ACTIVE).activeDuration", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "a bounded duration IS a quantity the source must state" },
  { fieldPath: "IRExpression(DURING_PERIOD).periodDescription", fieldClass: "MATERIAL_ASSERTION_FIELD", inventoried: true, rationale: "a testing period is a quantity ('four consecutive fiscal quarters')" },
  { fieldPath: "SourceProvenance.excerpt", fieldClass: "SOURCE_QUOTATION_FIELD", inventoried: true, rationale: "claims to be the real source text verbatim - a figure present here and absent from the authenticated source is a fabricated excerpt, which is a grounding defect in its own right (mission §13) and never self-authenticating merely because it sits inside provenance" },
  { fieldPath: "IRExpression(UNSUPPORTED).sourceEvidence", fieldClass: "SOURCE_QUOTATION_FIELD", inventoried: true, rationale: "same: a quotation of the source, not a statement about it" },
  { fieldPath: "SourceProvenance.sourceCitation", fieldClass: "IDENTIFIER_OR_CITATION_FIELD", inventoried: false, rationale: "section numbering is not an economic assertion - '§7.2(f)' must never yield a numeric assertion (mission §13)" },
  { fieldPath: "SourceProvenance.documentId / sourceNodeKey", fieldClass: "IDENTIFIER_OR_CITATION_FIELD", inventoried: false, rationale: "opaque identifiers" },
  { fieldPath: "IRDefinition.termName / IRDefinition.dependsOnTerms[]", fieldClass: "IDENTIFIER_OR_CITATION_FIELD", inventoried: false, rationale: "a defined term legitimately carries digits ('2029 Notes', 'Senior Notes due 2028'); the name is an identifier, and the definition's own mechanics are inventoried structurally" },
  { fieldPath: "IRExpression(METRIC_REFERENCE).metricName / (DEFINED_TERM_REFERENCE).termName", fieldClass: "IDENTIFIER_OR_CITATION_FIELD", inventoried: false, rationale: "same - a reference by name, already reconciled as a METRIC_REFERENCE/DEFINED_TERM_REFERENCE item" },
  { fieldPath: "IRUnresolvedDependency.targetRef", fieldClass: "IDENTIFIER_OR_CITATION_FIELD", inventoried: false, rationale: "the literal cross-reference text ('Section 6.01(b)(iii)') - numbering, not economics" },
  { fieldPath: "IRRule.sufficiencyReasons[] / IRDefinition.sufficiencyReasons[]", fieldClass: "DIAGNOSTIC_FIELD", inventoried: false, rationale: "the compiler's own disclosure of what it could NOT represent - a figure quoted there is a report about a gap, not an assertion that the rule carries it" },
  { fieldPath: "IRExpression(UNSUPPORTED).reason", fieldClass: "DIAGNOSTIC_FIELD", inventoried: false, rationale: "why representation failed - same reasoning as sufficiencyReasons" },
  { fieldPath: "IRUnresolvedDependency.reason", fieldClass: "DIAGNOSTIC_FIELD", inventoried: false, rationale: "why the edge could not be resolved" },
  { fieldPath: "IRRule.entityScopeAudit.*", fieldClass: "DIAGNOSTIC_FIELD", inventoried: false, rationale: "the entity-scope guard's own audit trail" },
  { fieldPath: "IRRule.posture / ruleType / action / covenantFamily / entityScope[]", fieldClass: "NON_SEMANTIC_FIELD", inventoried: false, rationale: "closed enums - no free text to carry a number" },
  { fieldPath: "IRCondition.conditionType / IRRuleDependency.relationshipType", fieldClass: "NON_SEMANTIC_FIELD", inventoried: false, rationale: "closed enums" },
  { fieldPath: "IRMoneyLiteral.amount / IRPercentLiteral.value / IRRatioLiteral.value / IRNumberLiteral.value", fieldClass: "NON_SEMANTIC_FIELD", inventoried: false, rationale: "STRUCTURED numerics - already inventoried and reconciled by ir-inventory.ts/reconciliation.ts; re-inventorying them here would double-report the same value" },
  { fieldPath: "IRDateLiteral.isoDate / IRAsOf.asOfDate / IRScheduleCase.from|to", fieldClass: "NON_SEMANTIC_FIELD", inventoried: false, rationale: "calendar dates are not economic quantities and have their own representation" },
];

// ---------------------------------------------------------------------------
// Mission §5 - the extractor. Every form is SEMANTICALLY QUALIFIED: a currency marker, a percent
// marker, a ratio marker, or an explicit unit noun. A bare figure never qualifies on its own.
// ---------------------------------------------------------------------------

const PERCENT_RE = /\b(\d[\d,]*(?:\.\d+)?)\s*(?:%|percent\b)/gi;
const RATIO_RE = /\b(\d[\d,]*(?:\.\d+)?)\s*(?:x\b|(?:to|:)\s*1(?:\.0+)?\b)/gi;
const SCALED_BARE_RE = /\b(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion)\b/gi;
/** Generic unit nouns with the modifiers legal drafting actually puts in front of them. Deliberately a small, generic vocabulary - a noun not listed here simply does not qualify a bare figure, which fails CLOSED (no assertion inventoried) rather than open (a false accusation). */
const QUALIFIER = String.raw`(?:(?:calendar|business|consecutive|fiscal|successive)\s+)*(?:days?|weeks?|months?|years?|quarters?|subsidiar(?:y|ies)|persons?|entit(?:y|ies)|times?|installments?)`;
/**
 * The parenthetical-numeral form is not optional politeness in legal drafting: "within ninety (90)
 * days" is how the figure is normally written, and a grammar that only reads "90 days" would call
 * a perfectly grounded 90 unsupported. The leading/trailing parens are permitted on the figure
 * itself for exactly that reason.
 */
const QUANTITY_RE = new RegExp(String.raw`\(?\s*(\d[\d,]*(?:\.\d+)?)\s*\)?\s+(${QUALIFIER})\b`, "gi");
const SCALE_MULTIPLIER: Readonly<Record<string, number>> = { thousand: 1_000, million: 1_000_000, billion: 1_000_000_000 };

/**
 * Evidence-side only (mission §6's rendering equivalence): a source that writes "thirty days" and
 * an IR that writes "30 days" are the same figure. This table can only ever GROUND an assertion -
 * it is never used to read an assertion out of IR prose - so it cannot manufacture a finding.
 */
const SPELLED_NUMBERS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const SPELLED_QUANTITY_RE = new RegExp(String.raw`\b(${Object.keys(SPELLED_NUMBERS).join("|")})\s*(?:\(\s*[\d,]+\s*\))?\s+(${QUALIFIER})\b`, "gi");

function normalizeUnit(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/ies$/, "y").replace(/s$/, "");
}

function normalizeRendering(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/,/g, "");
}

function overlaps(taken: { start: number; end: number }[], start: number, end: number): boolean {
  return taken.some((t) => start < t.end && end > t.start);
}

function digits(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/**
 * Deterministic extraction of every MATERIAL numeric assertion in one piece of text. Precedence is
 * currency -> percentage -> ratio -> scaled bare figure -> unit-qualified quantity, and an earlier
 * match's span is never re-read by a later pattern ("$150,000,000" is one currency amount, never
 * also a bare figure). Never throws.
 */
export function extractNumericAssertions(text: string): ExtractedNumeric[] {
  const out: ExtractedNumeric[] = [];
  const taken: { start: number; end: number }[] = [];
  const push = (hit: ExtractedNumeric) => { out.push(hit); taken.push({ start: hit.charStart, end: hit.charEnd }); };

  for (const m of text.matchAll(new RegExp(AMOUNT_RE.source, "g"))) {
    const start = m.index ?? 0, end = start + m[0].length;
    if (overlaps(taken, start, end)) continue;
    const parsed = parseScaledAmount(m[0]);
    push({
      kind: "CURRENCY_AMOUNT",
      rawText: m[0],
      normalizedValue: parsed.canonicalValue,
      currency: parsed.currency,
      unit: parsed.currency,
      charStart: start,
      charEnd: end,
      withheldReason: parsed.canonicalValue === null ? `scale token "${parsed.scaleToken ?? "?"}" is not resolvable by this grammar - magnitude withheld` : null,
    });
  }
  for (const [re, kind] of [[PERCENT_RE, "PERCENTAGE"], [RATIO_RE, "RATIO"]] as const) {
    for (const m of text.matchAll(new RegExp(re.source, re.flags))) {
      const start = m.index ?? 0, end = start + m[0].length;
      if (overlaps(taken, start, end)) continue;
      const figure = digits(m[1]!);
      if (!Number.isFinite(figure)) continue;
      push({ kind, rawText: m[0], normalizedValue: kind === "PERCENTAGE" ? figure / 100 : figure, currency: null, unit: kind === "PERCENTAGE" ? "%" : "x", charStart: start, charEnd: end, withheldReason: null });
    }
  }
  for (const m of text.matchAll(new RegExp(SCALED_BARE_RE.source, SCALED_BARE_RE.flags))) {
    const start = m.index ?? 0, end = start + m[0].length;
    if (overlaps(taken, start, end)) continue;
    const figure = digits(m[1]!);
    const mult = SCALE_MULTIPLIER[m[2]!.toLowerCase()];
    if (!Number.isFinite(figure) || mult === undefined) continue;
    // No currency is stated, so none is claimed - currenciesCompatible-style matching lets it
    // ground against a stated-currency figure of the same magnitude, and never against a different
    // stated currency's.
    push({ kind: "CURRENCY_AMOUNT", rawText: m[0], normalizedValue: figure * mult, currency: null, unit: null, charStart: start, charEnd: end, withheldReason: null });
  }
  for (const m of text.matchAll(new RegExp(QUANTITY_RE.source, QUANTITY_RE.flags))) {
    const start = m.index ?? 0, end = start + m[0].length;
    if (overlaps(taken, start, end)) continue;
    const figure = digits(m[1]!);
    if (!Number.isFinite(figure)) continue;
    push({ kind: "QUALIFIED_QUANTITY", rawText: m[0], normalizedValue: figure, currency: null, unit: normalizeUnit(m[2]!), charStart: start, charEnd: end, withheldReason: null });
  }

  return out.sort((a, b) => a.charStart - b.charStart);
}

/** Evidence-side extraction: everything an assertion can be read from, plus spelled-out quantities. */
function extractEvidenceNumerics(text: string): ExtractedNumeric[] {
  const out = extractNumericAssertions(text);
  const taken = out.map((h) => ({ start: h.charStart, end: h.charEnd }));
  for (const m of text.matchAll(new RegExp(SPELLED_QUANTITY_RE.source, SPELLED_QUANTITY_RE.flags))) {
    const start = m.index ?? 0, end = start + m[0].length;
    if (overlaps(taken, start, end)) continue;
    out.push({ kind: "QUALIFIED_QUANTITY", rawText: m[0], normalizedValue: SPELLED_NUMBERS[m[1]!.toLowerCase()]!, currency: null, unit: normalizeUnit(m[2]!), charStart: start, charEnd: end, withheldReason: null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The IR free-text walk.
// ---------------------------------------------------------------------------

interface FieldVisit { fieldPath: string; fieldClass: NumericAssertionItem["fieldClass"]; text: string | null | undefined }

function provenanceFields(path: string, provenance: { excerpt: string | null } | null | undefined): FieldVisit[] {
  return provenance ? [{ fieldPath: `${path}.provenance.excerpt`, fieldClass: "SOURCE_QUOTATION_FIELD" as const, text: provenance.excerpt }] : [];
}

function expressionFields(expr: IRExpression | null | undefined, path: string): FieldVisit[] {
  if (!expr) return [];
  const out: FieldVisit[] = [...provenanceFields(path, (expr as { provenance?: { excerpt: string | null } }).provenance)];
  const walk = (e: IRExpression | null | undefined, p: string) => out.push(...expressionFields(e, p));

  switch (expr.kind) {
    case "UNSUPPORTED":
      out.push({ fieldPath: `${path}.semanticDescription`, fieldClass: "MATERIAL_ASSERTION_FIELD", text: expr.semanticDescription });
      out.push({ fieldPath: `${path}.sourceEvidence`, fieldClass: "SOURCE_QUOTATION_FIELD", text: expr.sourceEvidence });
      return out;
    case "SCHEDULE":
      expr.cases.forEach((c, i) => { out.push({ fieldPath: `${path}.cases[${i}].description`, fieldClass: "MATERIAL_ASSERTION_FIELD", text: c.description }); walk(c.value, `${path}.cases[${i}].value`); });
      walk(expr.defaultValue, `${path}.defaultValue`);
      return out;
    case "EVENT_ACTIVE":
      out.push({ fieldPath: `${path}.eventDescription`, fieldClass: "MATERIAL_ASSERTION_FIELD", text: expr.eventDescription });
      out.push({ fieldPath: `${path}.activeDuration`, fieldClass: "MATERIAL_ASSERTION_FIELD", text: expr.activeDuration });
      walk(expr.triggerCondition, `${path}.triggerCondition`);
      return out;
    case "DURING_PERIOD":
      out.push({ fieldPath: `${path}.periodDescription`, fieldClass: "MATERIAL_ASSERTION_FIELD", text: expr.periodDescription });
      walk(expr.value, `${path}.value`);
      return out;
    case "ADD": case "SUM": case "MULTIPLY": case "MAX": case "MIN": case "AND": case "OR":
      expr.operands.forEach((op, i) => walk(op, `${path}.operands[${i}]`));
      return out;
    case "SUBTRACT":
      walk(expr.left, `${path}.left`); walk(expr.right, `${path}.right`); return out;
    case "DIVIDE":
      walk(expr.numerator, `${path}.numerator`); walk(expr.denominator, `${path}.denominator`); return out;
    case "COMPARE":
      walk(expr.left, `${path}.left`); walk(expr.right, `${path}.right`); return out;
    case "NOT":
      walk(expr.operand, `${path}.operand`); return out;
    case "IF":
      walk(expr.condition, `${path}.condition`); walk(expr.then, `${path}.then`); walk(expr.else, `${path}.else`); return out;
    case "AS_OF":
      walk(expr.value, `${path}.value`); return out;
    default:
      // Every remaining kind is a literal or a by-name reference: its numerics are STRUCTURED
      // (already inventoried by ir-inventory.ts) or an identifier (never a numeric assertion).
      return out;
  }
}

function conditionFields(condition: IRCondition, path: string): FieldVisit[] {
  return [
    { fieldPath: `${path}.description`, fieldClass: "MATERIAL_ASSERTION_FIELD", text: condition.description },
    ...provenanceFields(path, condition.provenance),
    ...expressionFields(condition.expression, `${path}.expression`),
  ];
}

function exceptionFields(exception: IRException, path: string): FieldVisit[] {
  return [
    { fieldPath: `${path}.description`, fieldClass: "MATERIAL_ASSERTION_FIELD", text: exception.description },
    ...provenanceFields(path, exception.provenance),
    ...(exception.conditions ?? []).flatMap((c, i) => conditionFields(c, `${path}.conditions[${i}]`)),
  ];
}

function ruleFields(rule: IRRule, path: string): FieldVisit[] {
  const capacity = rule.capacityExpression;
  const capacityVisits: FieldVisit[] = capacity
    ? capacity.kind === "UNLIMITED_CAPACITY"
      ? [...provenanceFields(`${path}.capacityExpression`, capacity.provenance), ...expressionFields(capacity.gatedBy, `${path}.capacityExpression.gatedBy`)]
      : expressionFields(capacity as IRExpression, `${path}.capacityExpression`)
    : [];
  return [
    ...provenanceFields(path, rule.provenance),
    // Defensive `?? []`: this walker is also run offline over preserved and hand-authored IR,
    // where a partial rule shape is real. A malformed unit must never crash verification - the
    // fields that ARE present are still read.
    ...(rule.conditions ?? []).flatMap((c, i) => conditionFields(c, `${path}.conditions[${i}]`)),
    ...(rule.exceptions ?? []).flatMap((e, i) => exceptionFields(e, `${path}.exceptions[${i}]`)),
    ...(rule.dependsOn ?? []).map((d, i) => ({ fieldPath: `${path}.dependsOn[${i}].description`, fieldClass: "MATERIAL_ASSERTION_FIELD" as const, text: d.description })),
    ...(rule.unresolvedDependencies ?? []).map((d, i) => ({ fieldPath: `${path}.unresolvedDependencies[${i}].description`, fieldClass: "MATERIAL_ASSERTION_FIELD" as const, text: d.description })),
    ...capacityVisits,
  ];
}

function definitionFields(definition: IRDefinition, path: string): FieldVisit[] {
  return [...provenanceFields(path, definition.provenance), ...expressionFields(definition.calculationExpression, `${path}.calculationExpression`)];
}

/** Mission §5's preserved record for every assertion: original text, normalized value, unit/type, exact field path, rule id and local span. */
export function collectNumericAssertions(candidateRef: string, rules: IRRule[], definitions: IRDefinition[]): NumericAssertionInventory {
  const items: NumericAssertionItem[] = [];
  let fieldsWalked = 0;

  const visitAll = (visits: FieldVisit[], ruleOrDefinitionId: string) => {
    for (const visit of visits) {
      fieldsWalked++;
      if (typeof visit.text !== "string" || visit.text.trim().length === 0) continue;
      for (const hit of extractNumericAssertions(visit.text)) {
        items.push({
          ...hit,
          itemId: hashParts([candidateRef, ruleOrDefinitionId, visit.fieldPath, hit.kind, String(hit.normalizedValue), String(hit.charStart), NUMERIC_ASSERTION_ALGORITHM_VERSION]),
          candidateRef,
          ruleOrDefinitionId,
          fieldPath: visit.fieldPath,
          fieldClass: visit.fieldClass,
          fieldText: visit.text,
        });
      }
    }
  };

  rules.forEach((rule, i) => visitAll(ruleFields(rule, `rules[${i}]`), rule.ruleId));
  definitions.forEach((def, i) => visitAll(definitionFields(def, `definitions[${i}]`), def.definitionId));

  return { candidateRef, items, fieldsWalked, algorithmVersion: NUMERIC_ASSERTION_ALGORITHM_VERSION };
}

// ---------------------------------------------------------------------------
// Mission §6/§7/§8 - grounding against the authenticated evidence universe.
// ---------------------------------------------------------------------------

const NUMERIC_TOLERANCE_RELATIVE = 1e-9;
function valuesMatch(a: number, b: number): boolean {
  if (a === 0 || b === 0) return Math.abs(a - b) < 1e-12;
  return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) < NUMERIC_TOLERANCE_RELATIVE;
}

/** Two stated, different currencies are never the same figure (no FX here); a side that states none stays comparable on magnitude, exactly as reconciliation.ts's structured path already treats it. */
function comparable(assertion: ExtractedNumeric, evidence: ExtractedNumeric): boolean {
  if (assertion.kind !== evidence.kind) return false;
  if (assertion.kind === "CURRENCY_AMOUNT") return assertion.currency === null || evidence.currency === null || assertion.currency === evidence.currency;
  if (assertion.kind === "QUALIFIED_QUANTITY") return assertion.unit === evidence.unit;
  return true;
}

/**
 * Mission §8. Precedence is deliberate: the candidate's OWN operative window first (a value the
 * anchor itself states is owned by this candidate), then authenticated context (real support, but
 * from somewhere else - the distinction the candidate-span/F1 work exists to keep visible), then a
 * rendering equivalence anywhere, then nothing. `groundedIn` stays populated for a
 * NORMALIZED_EQUIVALENT so numeric grounding and source OWNERSHIP remain independently
 * inspectable (mission §12) rather than collapsed into one verdict.
 */
export function groundNumericAssertions(inventory: NumericAssertionInventory, evidence: NumericAssertionEvidenceText[]): NumericAssertionGrounding[] {
  const extracted = evidence.map((e) => ({ evidence: e, numerics: extractEvidenceNumerics(e.text) }));

  return inventory.items.map((assertion) => {
    if (assertion.normalizedValue === null) {
      return { assertion, status: "AMBIGUOUS" as const, groundedIn: null, matchedEvidenceId: null, matchedText: null, reason: `numeric assertion "${assertion.rawText}" at ${assertion.fieldPath} could not be read confidently (${assertion.withheldReason ?? "value withheld"}) - review required, never compared` };
    }

    let equivalent: { scope: "OPERATIVE" | "CONTEXT"; evidenceId: string; label: string; rawText: string } | null = null;
    for (const scope of ["OPERATIVE", "CONTEXT"] as const) {
      for (const { evidence: ev, numerics } of extracted) {
        if (ev.scope !== scope) continue;
        for (const candidate of numerics) {
          if (candidate.normalizedValue === null || !comparable(assertion, candidate)) continue;
          if (!valuesMatch(assertion.normalizedValue, candidate.normalizedValue)) continue;
          if (normalizeRendering(candidate.rawText) === normalizeRendering(assertion.rawText)) {
            return {
              assertion,
              status: scope === "OPERATIVE" ? ("GROUNDED_OPERATIVE" as const) : ("GROUNDED_CONTEXT" as const),
              groundedIn: scope,
              matchedEvidenceId: ev.evidenceId,
              matchedText: candidate.rawText,
              reason: `numeric assertion "${assertion.rawText}" at ${assertion.fieldPath} appears verbatim in ${ev.label}`,
            };
          }
          equivalent ??= { scope, evidenceId: ev.evidenceId, label: ev.label, rawText: candidate.rawText };
        }
      }
    }

    if (equivalent) {
      return {
        assertion,
        status: "NORMALIZED_EQUIVALENT" as const,
        groundedIn: equivalent.scope,
        matchedEvidenceId: equivalent.evidenceId,
        matchedText: equivalent.rawText,
        reason: `numeric assertion "${assertion.rawText}" at ${assertion.fieldPath} matches "${equivalent.rawText}" in ${equivalent.label} under rendering equivalence (same canonical value ${assertion.normalizedValue}${assertion.unit ? ` ${assertion.unit}` : ""})`,
      };
    }

    return {
      assertion,
      status: "UNGROUNDED" as const,
      groundedIn: null,
      matchedEvidenceId: null,
      matchedText: null,
      reason: assertion.fieldClass === "SOURCE_QUOTATION_FIELD"
        ? `provenance excerpt at ${assertion.fieldPath} quotes "${assertion.rawText}" as source text, but that figure appears in no authenticated source for this candidate - a model-generated excerpt is not evidence merely because it sits inside provenance`
        : `compiled IR asserts ${assertion.kind} "${assertion.rawText}" (canonical ${assertion.normalizedValue}${assertion.unit ? ` ${assertion.unit}` : ""}) in free text at ${assertion.fieldPath}, and no authenticated source figure - operative window or retrieved context - supports it`,
    };
  });
}
