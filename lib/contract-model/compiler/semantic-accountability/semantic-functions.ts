/**
 * F-5.1 (Phase 3 Chewy remediation 5) - CANONICAL SEMANTIC FUNCTIONS.
 *
 * The certification pair (docs/phase-3-remediation-f5/10-certification-*) proved that Pass A's single scalar
 * `semanticRole` is structurally under-specified: of 298 items with an identical slot AND an identical source span,
 * 82 differed only in the role label, and the confusion matrix (docs/phase-3-remediation-f5-1/01-*) is dominated by
 * pairs where ONE source proposition genuinely carries SEVERAL functions at once - an alternative branch that is also
 * a formula addend, a proviso that is both a condition and a floor, a lettered carve-out that is both an exception to
 * the prohibition and the permission it grants, a proviso that carries an explicit cross-reference. A forced single
 * choice among overlapping labels therefore produced two inventory identities for one source semantic.
 *
 * This module replaces the scalar with a small COMPOSITIONAL model of orthogonal dimensions:
 *   effect        - the proposition's own deontic/definitional effect (scalar; mutually exclusive by construction)
 *   logic         - how it qualifies or branches another proposition (set)
 *   quantitative  - how a stated number participates (set)
 *   dependency    - how it depends on other text (set)
 * A proposition carries every function the source gives it. The legacy `semanticRole` is RETAINED as a
 * deterministically DERIVED compatibility field (deriveLegacyRole) so every existing consumer keeps working, and the
 * model's raw labels are kept in `declaredRoles` for transparency. Where the SOURCE STRUCTURE determines a function
 * (an explicit citation, a stated number, a comparator, a selector such as "the greater of", a qualifier opener such
 * as "provided that"), it is added DETERMINISTICALLY (deriveSemanticFunctions) - the model is consulted only for the
 * semantic judgments that genuinely need it. Deterministic additions are structural-form facts, never legal
 * conclusions, and they are attributes of an item - identity (inventory.ts) is keyed by source ownership, not labels.
 *
 * Independence contract: this file imports only ./types (Pass A side).
 */
import type { QuantitativeValue, SemanticRole } from "./types";

export const PRIMARY_EFFECTS = ["PERMISSION", "PROHIBITION", "REQUIREMENT", "DEFINITIONAL", "NONE"] as const;
export type PrimaryEffect = (typeof PRIMARY_EFFECTS)[number];
export const LOGIC_FUNCTIONS = ["CONDITION", "EXCEPTION", "TRIGGER", "ALTERNATIVE", "CURE", "RECLASSIFICATION"] as const;
export type LogicFunction = (typeof LOGIC_FUNCTIONS)[number];
export const QUANTITATIVE_FUNCTIONS = ["VALUE", "FORMULA_COMPONENT", "THRESHOLD", "TIME_PERIOD"] as const;
export type QuantitativeFunction = (typeof QUANTITATIVE_FUNCTIONS)[number];
export const DEPENDENCY_FUNCTIONS = ["REFERENCE", "DEPENDENCY", "SHARED_CAP"] as const;
export type DependencyFunction = (typeof DEPENDENCY_FUNCTIONS)[number];

export interface SemanticFunctions {
  effect: PrimaryEffect;
  logic: LogicFunction[];
  quantitative: QuantitativeFunction[];
  dependency: DependencyFunction[];
}

/** Provenance of each function token ("logic:CONDITION"): declared by the model, or added by a deterministic source-structure rule. */
export interface SemanticFunctionProvenance {
  declared: string[];
  deterministic: string[];
}

export const emptyFunctions = (): SemanticFunctions => ({ effect: "NONE", logic: [], quantitative: [], dependency: [] });

const EFFECT_ROLES: Partial<Record<SemanticRole, PrimaryEffect>> = { PERMISSION: "PERMISSION", PROHIBITION: "PROHIBITION", REQUIREMENT: "REQUIREMENT" };
const LOGIC_ROLES = new Set<string>(LOGIC_FUNCTIONS);
const QUANT_ROLES = new Set<string>(QUANTITATIVE_FUNCTIONS);
const DEP_ROLES = new Set<string>(DEPENDENCY_FUNCTIONS);

/** The legacy scalar role, mapped onto the dimension it names. OTHER contributes nothing. */
export function roleToFunctions(role: SemanticRole): SemanticFunctions {
  const f = emptyFunctions();
  if (EFFECT_ROLES[role]) f.effect = EFFECT_ROLES[role]!;
  else if (LOGIC_ROLES.has(role)) f.logic.push(role as LogicFunction);
  else if (QUANT_ROLES.has(role)) f.quantitative.push(role as QuantitativeFunction);
  else if (DEP_ROLES.has(role)) f.dependency.push(role as DependencyFunction);
  return f;
}

const EFFECT_RANK: Record<PrimaryEffect, number> = { NONE: 0, DEFINITIONAL: 1, PERMISSION: 2, REQUIREMENT: 3, PROHIBITION: 4 };
/** Deontic effects are mutually exclusive: two items over one source stretch that claim PERMISSION and PROHIBITION (or REQUIREMENT) are two propositions, never one. */
export function effectsContradict(a: PrimaryEffect, b: PrimaryEffect): boolean {
  const deontic = (e: PrimaryEffect) => e === "PERMISSION" || e === "PROHIBITION" || e === "REQUIREMENT";
  return deontic(a) && deontic(b) && a !== b;
}

/** Union of two function sets. Effect: a deontic effect wins over DEFINITIONAL/NONE; two different deontic effects must be split BEFORE merging (effectsContradict) - here the stronger rank is kept only as a defensive fallback. */
export function unionFunctions(a: SemanticFunctions, b: SemanticFunctions): SemanticFunctions {
  const uniq = <T extends string>(xs: T[], order: readonly T[]): T[] => order.filter((o) => xs.includes(o));
  return {
    effect: EFFECT_RANK[b.effect] > EFFECT_RANK[a.effect] ? b.effect : a.effect,
    logic: uniq([...a.logic, ...b.logic], LOGIC_FUNCTIONS),
    quantitative: uniq([...a.quantitative, ...b.quantitative], QUANTITATIVE_FUNCTIONS),
    dependency: uniq([...a.dependency, ...b.dependency], DEPENDENCY_FUNCTIONS),
  };
}

export function functionTokens(f: SemanticFunctions): string[] {
  return [...(f.effect !== "NONE" ? [`effect:${f.effect}`] : []), ...f.logic.map((x) => `logic:${x}`), ...f.quantitative.map((x) => `quantitative:${x}`), ...f.dependency.map((x) => `dependency:${x}`)];
}

/** Canonical, order-independent signature ("effect:PERMISSION|logic:CONDITION|quantitative:THRESHOLD"). Empty string when no function at all. */
export function functionsSignature(f: SemanticFunctions): string {
  return functionTokens(f).join("|");
}

// ---------------------------------------------------------------------------
// Deterministic source-structure rules (structural FORM, never legal meaning).
// ---------------------------------------------------------------------------

/** An explicit citation: "Section 6.01(b)(12)", "Sections 12.7 and 12.9(c)", "clause (x)", "sub-clause (a)", "Schedule 1.01", "Annex A", "Exhibit B", "Article VII", "§6.08". */
const CITATION_RE = /\b(?:sections?|§+|clauses?|sub-?clauses?|paragraphs?|schedules?|annex(?:es)?|exhibits?|articles?)\s*\(?[0-9ivxlcA-Z][0-9a-zA-Z.\-]*\)?(?:\s*\([a-z0-9]{1,4}\))*/i;
/** A comparison of a number against something: the structural form of a THRESHOLD. */
const COMPARATOR_RE = /\b(?:not\s+(?:to\s+)?exceed(?:ing|s)?|would\s+not\s+exceed|does\s+not\s+exceed|in\s+excess\s+of|(?:no|not)\s+(?:more|less|greater|later|earlier)\s+than|(?:at\s+least|at\s+most)|(?:less|greater|more|lower|higher)\s+than|equal\s+to\s+or\s+(?:less|greater)|exceeds?|(?:shall|must|will)\s+(?:be\s+)?(?:not\s+)?(?:less|greater|more)\s+than|not\s+less\s+than|below|above)\b/i;
/** A selection among alternatives: "the greater of", "the lesser of", "the lower of", "the greatest of", "either ... or". */
const SELECTOR_RE = /\b(?:the\s+)?(?:greater|greatest|lesser|least|lower|lowest|higher|highest|larger|largest|smaller|smallest)\s+of\b|\beither\b/i;
/** A qualifier opener: the structural form of a CONDITION ("provided that", "so long as", "if", "subject to", "to the extent", "unless") and of an EXCEPTION ("other than", "except", "excluding"). */
const CONDITION_OPENER_RE = /^\s*(?:[;,]\s*)?(?:\(?[a-z0-9]{1,4}\)\s*)?(?:and\s+|or\s+|but\s+)?(?:provided\s*,?\s*(?:however\s*,?\s*|further\s*,?\s*)?(?:that)?|so\s+long\s+as|if\b|only\s+if|subject\s+to|to\s+the\s+extent|unless|in\s+the\s+event\s+that|for\s+so\s+long\s+as|(?:on|upon)\s+the\s+condition\s+that)/i;
const EXCEPTION_OPENER_RE = /^\s*(?:[;,]\s*)?(?:\(?[a-z0-9]{1,4}\)\s*)?(?:and\s+|or\s+|but\s+)?(?:other\s+than|except(?:ing)?(?:\s+(?:for|that|as))?|excluding|but\s+excluding|but\s+not\s+including|not\s+including|save\s+(?:for|that))\b/i;
/** A trigger opener: "upon", "on the occurrence of", "at any time after", "if ... occurs" (only the explicit event forms). */
const TRIGGER_OPENER_RE = /^\s*(?:[;,]\s*)?(?:\(?[a-z0-9]{1,4}\)\s*)?(?:and\s+|or\s+)?(?:upon|on\s+(?:and\s+after\s+)?the\s+occurrence\s+of|at\s+any\s+time\s+(?:after|following)|from\s+and\s+after|immediately\s+(?:upon|after))\b/i;
const ENUMERATOR_RE = /^\s*(?:[;,]\s*)?(?:and\s+|or\s+)?\(?[a-z0-9]{1,4}\)/i;
/** A clause terminator or qualifier opener between a selector and the span means the span is NOT one of the selector's branches. */
const BRANCH_BREAK_RE = /[;.]|\bprovided\b|\bso\s+long\s+as\b|\bunless\b|\bsubject\s+to\b|\bexcept\b/i;
/**
 * True when the span is a BRANCH of a selection in the same slot: the preceding slot text carries a selector ("the
 * greater of") and nothing between that selector and the span breaks the branch list. An enumerated span ("(x) ...")
 * may sit up to 400 characters after the selector (the branches of "the greater of (x) ... and (y) ..." are long); a
 * bare branch ("$50,000,000", "12.5% of EBITDA") must sit within 120 characters of it.
 */
function hangsFromSelector(precedingText: string, enumerated: boolean): boolean {
  const window = precedingText.slice(-(enumerated ? 400 : 120));
  let last: RegExpExecArray | null = null;
  const re = new RegExp(SELECTOR_RE.source, "gi");
  for (let m = re.exec(window); m; m = re.exec(window)) last = m;
  if (!last) return false;
  const between = window.slice(last.index + last[0].length);
  return !BRANCH_BREAK_RE.test(between);
}
const TIME_KINDS = new Set(["DAYS", "DATE", "PERIOD"]);
function isBareValue(span: string, values: QuantitativeValue[]): boolean {
  let residue = span;
  for (const v of values) residue = residue.split(v.rawText).join(" ");
  return (residue.match(/[A-Za-z]{2,}/g) ?? []).length <= 3;
}

export interface FunctionDerivationInput {
  /** Every role the model declared for this proposition (primary first). */
  declaredRoles: SemanticRole[];
  /** The item's own verified source text. */
  spanText: string;
  /** Text of the item's slot that PRECEDES its span (same slot), plus the slot's enclosing lead-ins - used only to recognise a selector ("the greater of") the branch hangs from. */
  precedingText?: string;
  values: QuantitativeValue[];
  referencedSections: string[];
  operative: "OPERATIVE" | "DEFINITIONAL" | "UNKNOWN";
}

/**
 * Canonical functions = union of the declared roles' functions + deterministic source-structure additions.
 * Rules only ADD; they never remove a declared function and never decide legal meaning:
 *  - an explicit citation in the span (or a listed referencedSection)      -> dependency REFERENCE
 *  - a stated number with a comparator in the span                          -> quantitative THRESHOLD
 *  - a stated DAYS/DATE/PERIOD number                                        -> quantitative TIME_PERIOD
 *  - a stated number with no quantitative function, or a span that IS the number -> quantitative VALUE
 *  - a selector ("the greater of") in the span                              -> logic ALTERNATIVE (the selection itself)
 *  - a span hanging from a selector in the preceding slot text (a branch)   -> logic ALTERNATIVE (hangsFromSelector)
 *  - a condition opener / exception opener / trigger opener at span start   -> logic CONDITION / EXCEPTION / TRIGGER
 *  (the model's `operative` flag is NOT folded into effect - see below)
 */
export function deriveSemanticFunctions(input: FunctionDerivationInput): { functions: SemanticFunctions; provenance: SemanticFunctionProvenance } {
  let f = emptyFunctions();
  for (const role of input.declaredRoles) f = unionFunctions(f, roleToFunctions(role));
  const declared = functionTokens(f);
  const span = input.spanText;
  const add = (dim: "logic" | "quantitative" | "dependency", fn: string) => {
    const arr = f[dim] as string[];
    if (!arr.includes(fn)) arr.push(fn);
  };
  if (CITATION_RE.test(span) || input.referencedSections.length > 0) add("dependency", "REFERENCE");
  if (input.values.length > 0) {
    if (COMPARATOR_RE.test(span)) add("quantitative", "THRESHOLD");
    if (input.values.some((v) => TIME_KINDS.has(v.kind))) add("quantitative", "TIME_PERIOD");
    // a span that IS the stated number (at most three words around it) is a VALUE whatever else it does; any other
    // valued span with no quantitative function at all is a VALUE by default
    if (f.quantitative.length === 0 || isBareValue(span, input.values)) add("quantitative", "VALUE");
  }
  if (SELECTOR_RE.test(span)) add("logic", "ALTERNATIVE");
  else if (input.precedingText && hangsFromSelector(input.precedingText, ENUMERATOR_RE.test(span))) add("logic", "ALTERNATIVE");
  if (CONDITION_OPENER_RE.test(span)) add("logic", "CONDITION");
  if (EXCEPTION_OPENER_RE.test(span)) add("logic", "EXCEPTION");
  if (TRIGGER_OPENER_RE.test(span)) add("logic", "TRIGGER");
  // effect is DEONTIC only (PERMISSION / PROHIBITION / REQUIREMENT from declared roles). DEFINITIONAL is reserved for
  // callers that establish it structurally; it is deliberately NOT derived from the model's `operative` flag - on the
  // certification pair that flag varied on 75 of 344 aligned items and would have leaked into the effect dimension.
  void input.operative;
  // keep canonical order
  f = unionFunctions(emptyFunctions(), f);
  const all = functionTokens(f);
  return { functions: f, provenance: { declared, deterministic: all.filter((t) => !declared.includes(t)) } };
}

/**
 * The legacy scalar `semanticRole`, DERIVED deterministically from the canonical functions with a fixed precedence
 * (an item that declared exactly one role and gained no deterministic function round-trips to that role). Kept only
 * for compatibility of existing consumers and for the legacy-role stability metric; it is never identity-bearing.
 */
export function deriveLegacyRole(f: SemanticFunctions, declared: SemanticRole[] = []): SemanticRole {
  const primary = declared[0];
  // A declared primary role that is still among the canonical functions is honoured first - the model's chosen
  // emphasis is the best single-label summary when it is consistent with the canonical set.
  if (primary && primary !== "OTHER") {
    const p = roleToFunctions(primary);
    const present = (p.effect !== "NONE" && p.effect === f.effect) || p.logic.every((x) => f.logic.includes(x)) && p.logic.length > 0 || p.quantitative.every((x) => f.quantitative.includes(x)) && p.quantitative.length > 0 || p.dependency.every((x) => f.dependency.includes(x)) && p.dependency.length > 0;
    if (present) return primary;
  }
  if (f.dependency.includes("SHARED_CAP")) return "SHARED_CAP";
  for (const l of ["CURE", "RECLASSIFICATION", "TRIGGER", "EXCEPTION", "CONDITION", "ALTERNATIVE"] as const) if (f.logic.includes(l)) return l;
  for (const q of ["THRESHOLD", "TIME_PERIOD", "FORMULA_COMPONENT", "VALUE"] as const) if (f.quantitative.includes(q)) return q;
  if (f.effect === "PROHIBITION" || f.effect === "REQUIREMENT" || f.effect === "PERMISSION") return f.effect;
  for (const d of ["REFERENCE", "DEPENDENCY"] as const) if (f.dependency.includes(d)) return d;
  return "OTHER";
}

/** Functions of an item from any evidence generation: v5 items carry them; v4-and-earlier items are mapped from their scalar role (no deterministic augmentation - the source is not at hand). */
export function functionsOf(item: { semanticRole: SemanticRole; semanticFunctions?: SemanticFunctions }): SemanticFunctions {
  return item.semanticFunctions ?? roleToFunctions(item.semanticRole);
}
