/**
 * REQUIRED DEPENDENCY PREMATERIALIZATION - v2: precision and certificate honesty.
 *
 * A paid revalidation failed with one shard ending SHARD_MISSING_CONTEXT although every dependency it asked for
 * resolved deterministically. The property that was missing was never RESOLVABILITY - it was DELIVERY: dependencies
 * the planner itself had derived were dropped when the read-only context budget ran out, and further defined terms
 * two and three hops along a definition chain were never derived at all. v1 of this module made the dependency set a
 * deterministic, provenance-carrying, transitively closed object computed BEFORE any provider call.
 *
 * v2 closes two trust gaps an audit of v1 exposed:
 *
 *   1. CERTIFICATE SEMANTICS. v1 let a dependency that was REQUIRED, INTERNAL to the package and had NO resolvable
 *      text satisfy the executable certificate under the name "disclosed". A shard whose owned semantics cannot be
 *      evaluated without a definition the package does not resolve is not context-complete, however honestly the gap
 *      is named. Dispositions now distinguish delivered-in-full, delivered-as-excerpt, owned, EXTERNAL (proven from
 *      the source, never guessed from a name), INTERNAL-UNRESOLVED, AMBIGUOUS and NON-REQUIRED edges, and the
 *      certificate distinguishes CONTEXT_COMPLETE from EXPLICIT_EXTERNAL_LIMITATION, EXPLICIT_INTERNAL_LIMITATION and
 *      PLANNING_FAILED. Required + unavailable is never "fully executable".
 *
 *   2. PRECISION. A Pass-A "referenced term" is AI-produced evidence, not a fact. v2 qualifies every such edge
 *      deterministically against the source and the index before it may seed the required closure: a defined term,
 *      a grammatical-number or source-declared inflection of one, an inline declaration in the shard's own source, a
 *      declaration the structural detector's grammar missed (found in the document text itself), an external
 *      definition the source itself points outside the package, an ordinary lower-case legal word, or an unknown
 *      capitalised term. Occurrence scanning is word-boundary-disciplined and longest-match, so a defined term never
 *      matches inside an unrelated longer word, and the only aliases admitted are the ones the source or the index
 *      itself backs - never a hand-built legal dictionary.
 *
 * Nothing here is covenant-, section- or instrument-specific: every rule is a structural property of an indexed
 * document, and no term, section, company or instrument name appears in this file.
 */
import { computeSourceContentHash } from "../hashing";
import { resolveReferenceTarget } from "../semantic-accountability/reference-resolver";
import type { FrozenSemanticInventory, SemanticInventoryItem, SourceContextResult } from "../semantic-accountability/types";
import { findDefinedTermVariant, type StructuralIndex } from "../structural-index";
import type { DetectedDefinition } from "../structural-definitions";
import type { SemanticSourceUnit } from "./shard-types";

export const REQUIRED_DEPENDENCY_MODEL_VERSION = "required-dependency-delivery.v2-precision-and-certificate-honesty";

/** Typed category of a prematerialized dependency (§8). Ownership is always READ_ONLY_CONTEXT. */
export type RequiredDependencyKind = "REQUIRED_DEFINITION" | "REQUIRED_REFERENCED_SECTION" | "REQUIRED_PARENT_CONTEXT" | "REQUIRED_OPERATIVE_STATE";

/** Why the dependency is deterministically required. Every entry carries at least one. */
export type RequiredDependencyEvidence =
  | "DEFINED_TERM_OCCURRENCE_IN_OWNED_SOURCE"
  | "STRUCTURAL_CROSS_REFERENCE_IN_OWNED_SOURCE"
  | "INVENTORY_REFERENCED_TERM_EDGE"
  | "INVENTORY_REFERENCED_SECTION_EDGE"
  | "INVENTORY_PARENT_EDGE"
  | "FORWARDING_DEFINITION_TARGET"
  | "CROSS_REFERENCE_IN_REQUIRED_DEFINITION"
  | "TRANSITIVE_DEFINITION_CLOSURE";

/**
 * What the shard is actually holding for this dependency. Exactly one per dependency, decided before the call.
 * Only the first three are DELIVERED. The next three are explicit LIMITATIONS the certificate must carry. The last two
 * are exclusions and planning failures respectively; neither is ever counted as delivery.
 */
export type RequiredDependencyDisposition =
  /** A. Full text is in the shard's initial evidence package, untruncated. */
  | "DELIVERED_FULL"
  /** B. Resolvable but bounded: a provenance-carrying head excerpt is in the package and the partiality is disclosed. Its own closure is not expanded. */
  | "DELIVERED_BOUNDED_EXCERPT"
  /** C. The dependency IS this shard's own primary source (or is declared inline in it) - nothing to deliver. */
  | "OWNED_PRIMARY_SOURCE"
  /** D. The source itself says the definition lives in an instrument the package does not contain. Proven from source text plus package identity, never from the dependency's name. */
  | "EXTERNAL_REQUIRED_DEPENDENCY"
  /** E. Required, internal to the package, and no source text could be deterministically resolved for it. A LIMITATION, never delivery. */
  | "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED"
  /** F. The reference resolves to more than one substantive location; candidates and provenance are preserved, nothing is guessed. A LIMITATION, never delivery. */
  | "AMBIGUOUS_REQUIRED_DEPENDENCY"
  /** G. A Pass-A edge that deterministic qualification shows is not a semantic dependency at all (an ordinary word, a term absent from the source). Excluded from the closure; carried for audit only. */
  | "NON_REQUIRED_EDGE"
  /** Deliverable and required, but the plan did not deliver it. The only disposition that is a PLANNING FAILURE. */
  | "DELIVERABLE_NOT_DELIVERED";

/** How a cited term was resolved to (or excluded from) a definition - the Pass-A edge qualification layer (§8). */
export type TermResolutionMethod =
  | "DEFINED_TERM"
  | "GRAMMATICAL_NUMBER_VARIANT"
  | "SOURCE_DECLARED_CORRELATIVE"
  | "INLINE_DECLARATION_IN_OWNED_SOURCE"
  | "DECLARATION_FOUND_IN_SOURCE_TEXT"
  | "EXTERNAL_BY_SOURCE_DECLARATION"
  | "ORDINARY_LEGAL_WORD"
  | "TERM_ABSENT_FROM_SOURCE"
  | "UNKNOWN_CAPITALISED_TERM"
  | "AMBIGUOUS";

export interface TermResolution {
  method: TermResolutionMethod;
  /** The defined term whose text is delivered, when the cited spelling resolves to (or is an alias of) one. */
  aliasOf: string | null;
  /** Human-readable, source-backed justification. */
  note: string;
}

export interface RequiredDependency {
  /** Stable key, shared with the context entry that delivers it: `term:<normalized>` or `section:<normalized>`. */
  key: string;
  kind: RequiredDependencyKind;
  /** Display identity of the target (the exact defined term, or the section reference as cited). */
  target: string;
  /** Every spelling the owned material cited it under (a plural cited against a singular definition, etc.). */
  citedAs: string[];
  documentId: string;
  sourceNodeId: string | null;
  /** The planner unit that OWNS this dependency's text, when the plan has one - so a required entry still carries cross-shard ownership provenance. */
  sourceUnitKey: string | null;
  absCharStart: number | null;
  absCharEnd: number | null;
  /** The complete dependency text, before any bounding. */
  fullText: string;
  fullTextChars: number;
  fullTextHash: string;
  evidence: RequiredDependencyEvidence[];
  /** Inventory item ids (and/or unit keys) whose semantics need it. */
  requiredBy: string[];
  /** 1 for a dependency evidenced directly by owned source or an owned item's edge; >1 through definition closure. */
  closureDepth: number;
  /** For a closure entry: the key it was reached through. */
  viaKey: string | null;
  disposition: RequiredDependencyDisposition;
  dispositionReason: string;
  /** For a term: how the cited spelling was qualified (§8). Absent for sections and parent context. */
  resolution?: TermResolution;
  /** For an AMBIGUOUS section: every substantive candidate, with provenance, so review can pick without the planner guessing. */
  candidates?: { nodeId: string; charStart: number; charEnd: number }[];
  /** Chars this dependency actually occupies in the shard's initial context. Set by the planner at admission; absent until then. */
  deliveredChars?: number;
}

export interface RequiredDependencyBudget {
  /** A required dependency at or under this size is delivered in FULL. Above it, a disclosed head excerpt is delivered. */
  maxRequiredEntryChars: number;
  /** Hard ceiling on how much of a shard's read-only context the required tier may consume. */
  maxRequiredContextChars: number;
  /** How far a definition->definition chain is followed. Only entries delivered in full are expanded. */
  maxClosureDepth: number;
  /** Defined terms shorter than this are ignored as occurrence evidence (initialisms/noise). */
  minTermChars: number;
  /**
   * Closure is expanded ONLY through a COMPOSITIONAL definition: one whose operative body is essentially a list of
   * other defined terms joined by connectives, so it carries no independent content and is meaningless without them.
   * This is the share of the body's non-whitespace characters covered by boundary-disciplined occurrences of other
   * defined terms. A substantive definition that merely mentions other terms is NOT expanded - that bounds the closure.
   */
  compositionalCoverageThreshold: number;
  /** Characters of preceding text inspected for a limit-bearing construction when deciding whether to expand to a term. */
  limitLookbehindChars: number;
}

export const DEFAULT_REQUIRED_DEPENDENCY_BUDGET: RequiredDependencyBudget = {
  maxRequiredEntryChars: 4000,
  maxRequiredContextChars: 10000,
  maxClosureDepth: 3,
  minTermChars: 4,
  compositionalCoverageThreshold: 0.5,
  limitLookbehindChars: 90,
};

// ---------------------------------------------------------------------------
// Occurrence detection - boundary-disciplined, longest-match, source-backed aliases only
// ---------------------------------------------------------------------------

/**
 * Whitespace-insensitive containment. A defined term's indexed spelling carries the source's own line breaks, so raw
 * substring matching silently misses exactly the dependencies that sit across a line wrap.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

const isWordChar = (ch: string | undefined) => ch !== undefined && /[A-Za-z0-9]/.test(ch);

/**
 * The deterministic grammatical-number spellings of a term: the same suffix rules the structural index's own
 * findDefinedTermVariant applies (ies<->y, -es, -s), applied to the last word only and never to a stem the rules do
 * not cover. These are SPELLINGS to look for, not meanings: a spelling only counts when the index defines the base
 * term, so no alias is ever admitted that the document itself does not back.
 */
export function grammaticalNumberSpellings(term: string): string[] {
  const t = collapseWhitespace(term).trim();
  const out = new Set<string>();
  if (/ies$/.test(t)) out.add(t.replace(/ies$/, "y"));
  if (!/(?:ss|us|is)$/.test(t)) {
    if (/es$/.test(t)) out.add(t.replace(/es$/, ""));
    if (/s$/.test(t)) out.add(t.replace(/s$/, ""));
  }
  if (/y$/.test(t) && !/[aeiou]y$/.test(t)) out.add(t.replace(/y$/, "ies"));
  if (!/s$/.test(t)) { out.add(`${t}s`); if (/(?:s|x|z|ch|sh)$/.test(t)) out.add(`${t}es`); }
  out.delete(t);
  return [...out].filter((s) => s.length >= 2);
}

/** Start offsets (in the whitespace-collapsed text) of every word-boundary occurrence of `term` or one of its grammatical-number spellings. Case-sensitive: capitalised use is the signal of defined-term use. */
export function findTermOccurrences(collapsedText: string, term: string, includeNumberVariants = true): { index: number; length: number; spelling: string }[] {
  const spellings = [collapseWhitespace(term).trim(), ...(includeNumberVariants ? grammaticalNumberSpellings(term) : [])].filter((s) => s.length > 0);
  const hits: { index: number; length: number; spelling: string }[] = [];
  for (const s of spellings) {
    let i = 0;
    while ((i = collapsedText.indexOf(s, i)) >= 0) {
      if (!isWordChar(collapsedText[i - 1]) && !isWordChar(collapsedText[i + s.length])) hits.push({ index: i, length: s.length, spelling: s });
      i += s.length;
    }
  }
  // longest-match discipline within the same start position: a longer spelling wins and the shorter is dropped
  hits.sort((a, b) => a.index - b.index || b.length - a.length);
  return hits.filter((h, i) => i === 0 || hits[i - 1]!.index !== h.index);
}

/** True when `term` (or a grammatical-number spelling of it) occurs in `text` at a word boundary. */
export function termOccursIn(text: string, term: string): boolean {
  return findTermOccurrences(collapseWhitespace(text), term).length > 0;
}

/**
 * Every defined term of `documentId` that occurs in `text` at a word boundary, longest spelling first so a longer term
 * wins over its own prefix ("Consolidated Net Income" before "Net Income" - both may occur, but a hit never comes from
 * INSIDE another defined term's occurrence). A term never matches inside an unrelated longer word.
 */
export function definedTermsOccurringIn(text: string, index: StructuralIndex, documentId: string, minTermChars = DEFAULT_REQUIRED_DEPENDENCY_BUDGET.minTermChars): DetectedDefinition[] {
  const haystack = collapseWhitespace(text);
  const out = new Map<string, DetectedDefinition>();
  const defs = index.allDefinitions().filter((d) => d.documentId === documentId && typeof d.exactTerm === "string" && collapseWhitespace(d.exactTerm).trim().length >= minTermChars);
  // spans already claimed by a longer term, so a shorter term cannot be credited with an occurrence inside them
  const claimed: { start: number; end: number }[] = [];
  const inside = (i: number, len: number) => claimed.some((c) => i >= c.start && i + len <= c.end);
  for (const d of [...defs].sort((a, b) => collapseWhitespace(b.exactTerm).length - collapseWhitespace(a.exactTerm).length || a.normalizedTerm.localeCompare(b.normalizedTerm))) {
    if (out.has(d.normalizedTerm)) continue;
    const free = findTermOccurrences(haystack, d.exactTerm).filter((h) => !inside(h.index, h.length));
    if (free.length === 0) continue;
    out.set(d.normalizedTerm, d);
    for (const h of free) claimed.push({ start: h.index, end: h.index + h.length });
  }
  return [...out.values()];
}

/** Section references written in the owned source itself (e.g. "Section 4.03(a)", "§ 11.07(b)(2)"), normalized and de-duplicated. */
export function sectionReferencesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of collapseWhitespace(text).matchAll(/(?:§+\s*|\bSections?\s+)(\d+(?:\.\d+)+(?:\s*\([^()\s]{1,8}\))*)/gi)) {
    const ref = m[1]!.replace(/\s+/g, "");
    if (ref) out.add(ref);
  }
  return [...out];
}

/**
 * The OPERATIVE BODY of a definition: everything after its definitional verb. A definition's declaration is not part
 * of what it says, and its length is a function of how long the drafter made the defined term's own name, so body
 * metrics are measured after the verb. A body with no recognisable verb is used whole.
 */
export function definitionBody(text: string): string {
  const t = collapseWhitespace(text);
  const m = /\b(?:means|shall\s+mean|shall\s+have\s+the\s+meaning|has\s+the\s+meaning|refers?\s+to)\b/i.exec(t);
  return m ? t.slice(m.index + m[0].length) : t;
}

/**
 * Share of a definition body's non-whitespace characters covered by boundary-disciplined occurrences of OTHER defined
 * terms. High for an aggregating definition that is nothing but a sum of other defined amounts; low for a substantive
 * one. Overlapping occurrences are counted once (longest wins), so no synonym or nesting inflation.
 */
export function compositionalCoverage(body: string, index: StructuralIndex, documentId: string, selfNormalizedTerm: string, minTermChars = DEFAULT_REQUIRED_DEPENDENCY_BUDGET.minTermChars): number {
  const text = definitionBody(body);
  const dense = text.replace(/\s/g, "").length;
  if (dense === 0) return 0;
  const spans: { start: number; end: number }[] = [];
  for (const d of definedTermsOccurringIn(text, index, documentId, minTermChars)) {
    if (d.normalizedTerm === selfNormalizedTerm) continue;
    for (const h of findTermOccurrences(text, d.exactTerm)) if (!spans.some((s) => h.index < s.end && h.index + h.length > s.start)) spans.push({ start: h.index, end: h.index + h.length });
  }
  const covered = spans.reduce((a, s) => a + text.slice(s.start, s.end).replace(/\s/g, "").length, 0);
  return Math.min(1, covered / dense);
}

/**
 * Standard drafting constructions that make the FOLLOWING defined term the operative limit, scope or measure of the
 * clause it sits in. Generic legal-English drafting, not tied to any covenant, section or instrument.
 */
const LIMIT_BEARING = /\b(?:not\s+to\s+exceed|does\s+not\s+exceed|shall\s+not\s+exceed|may\s+not\s+exceed|in\s+excess\s+of|up\s+to|greater\s+of|lesser\s+of|less\s+than|no\s+more\s+than|limited\s+to|within\s+the|subject\s+to\s+the|equal\s+to|incurred\s+within|capped\s+at|maximum\s+of)\b/i;
/**
 * Arithmetic combinators: the defined term that follows one is an OPERAND of the amount being defined, so the amount
 * cannot be understood without it, whatever share of the body's characters the operands make up. Generic drafting
 * ("the sum of A, B and C", "(a) A; plus (b) B; minus (c) C").
 */
const ARITHMETIC_COMBINATOR = /\b(?:plus|minus|less|sum\s+of|product\s+of|multiplied\s+by|divided\s+by|aggregate\s+of|difference\s+between|net\s+of|reduced\s+by|increased\s+by|greater\s+of|greatest\s+of|lesser\s+of|least\s+of)\b/i;
/** The separators that continue an operand list once a combinator has opened one: ", the B", "; and the C", "or the D". */
const LIST_CONTINUATION = /(?:,|;|\band\b|\bor\b|\bplus\b|\bminus\b|\bless\b)\s*(?:\([a-z0-9]{1,4}\)\s*)?(?:the|any|all|such|each)?\s*$/i;
/** An enumerated item that is NOTHING BUT a defined term: "(a) the Term;" - the term is a component of the enumeration. */
const bareEnumeratedItem = (term: string) => new RegExp(`\\([a-z0-9]{1,4}\\)\\s+(?:the\\s+|any\\s+|all\\s+)?${escapeRe(collapseWhitespace(term).trim())}\\s*(?:[;,.]|$|\\s+(?:plus|minus|less|and|or)\\b)`);

/**
 * True when `term` occurs (at a word boundary) in `body` in a position that makes it an operative limit, measure or
 * arithmetic operand of the clause: immediately after a limit-bearing or arithmetic construction; as a continuation of
 * an operand list that an arithmetic combinator opened earlier in the same sentence; or as the whole of an enumerated
 * item. Whether the surrounding body is "list-like" plays no part - this is about the term's own position.
 */
export function occursInLimitBearingPosition(body: string, term: string, lookbehind = DEFAULT_REQUIRED_DEPENDENCY_BUDGET.limitLookbehindChars): boolean {
  const text = collapseWhitespace(body);
  if (bareEnumeratedItem(term).test(text)) return true;
  return findTermOccurrences(text, term).some((h) => {
    const behind = text.slice(Math.max(0, h.index - lookbehind), h.index);
    if (LIMIT_BEARING.test(behind) || ARITHMETIC_COMBINATOR.test(behind)) return true;
    // operand-list continuation: a combinator opened a list earlier in this sentence and the term follows a separator
    const sentenceStart = Math.max(0, text.lastIndexOf(". ", h.index), text.lastIndexOf("; provided", h.index));
    const sentence = text.slice(sentenceStart, h.index);
    return ARITHMETIC_COMBINATOR.test(sentence) && LIST_CONTINUATION.test(sentence.slice(-24));
  });
}

const normTerm = (t: string) => collapseWhitespace(t).toLowerCase().trim();
const normSection = (r: string) => r.replace(/^\s*(?:§+|Sections?|Secs?\.?)\s*/i, "").replace(/\s+/g, "").toLowerCase();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------------------
// Declarations the structural detector's grammar does not see - found in the source text itself
// ---------------------------------------------------------------------------

const Q = `[“”"]`;
/** The tail that turns a quoted term into a DECLARATION: a definitional verb, possibly after further quoted co-declared terms or a bounded qualifier, or an enumerated body that opens with "(a)". */
const DECLARATION_TAIL = new RegExp(
  `^\\s*(?:` +
    `(?:,?\\s*(?:and\\s+|or\\s+)?${Q}\\s*[^“”"]{1,80}?\\s*,?\\s*${Q})*\\s*(?:means|mean|shall\\s+mean|shall\\s+have\\s+the\\s+meanings?|has\\s+the\\s+meaning|have\\s+the\\s+meanings?)\\b` +
    `|(?:of|by|with\\s+respect\\s+to|in\\s+respect\\s+of|for|as\\s+to)\\b[^.;]{0,80}?\\b(?:means|shall\\s+mean)\\b` +
    `|\\(a\\)\\s` +
  `)`,
);
const NEXT_DECLARATION = new RegExp(`${Q}\\s*[A-Z][^“”"]{1,80}?\\s*,?\\s*${Q}\\s*(?:means|mean|shall|has|have|\\(a\\)\\s)`, "g");

export interface SourceDeclaration { absCharStart: number; absCharEnd: number; text: string }

/**
 * Finds a DECLARATION of `term` in raw document text: the term quoted, followed by a definitional tail. This is the
 * fallback for declaration grammars the structural detector does not model (a qualifier between the term and its
 * verb, several terms declared together, an enumerated body with no verb). The extent runs from the opening quote to
 * the next declaration or paragraph end, bounded. Purely textual and source-backed; no dictionary.
 */
export function findSourceDeclaration(documentText: string, term: string, nextIndexedDeclarationAfter?: (pos: number) => number | undefined, maxChars = 6000): SourceDeclaration | null {
  const t = collapseWhitespace(term).trim();
  if (!t) return null;
  const open = new RegExp(`${Q}\\s*${escapeRe(t)}\\s*,?\\s*${Q}`, "g");
  let m: RegExpExecArray | null;
  while ((m = open.exec(documentText))) {
    const after = documentText.slice(m.index + m[0].length, m.index + m[0].length + 400);
    const tail = DECLARATION_TAIL.exec(after);
    if (!tail) continue;
    const bodyStart = m.index + m[0].length + tail[0].length;
    // The extent runs to the NEXT declaration - the next textual declaration or the next index-detected one, whichever
    // comes first - exactly as the structural index bounds its own definitions. A line wrap inside a body is not an end.
    NEXT_DECLARATION.lastIndex = bodyStart + 1;
    const next = NEXT_DECLARATION.exec(documentText);
    const indexed = nextIndexedDeclarationAfter?.(bodyStart);
    const end = Math.min(next ? next.index : Infinity, indexed ?? Infinity, m.index + maxChars, documentText.length);
    return { absCharStart: m.index, absCharEnd: end, text: documentText.slice(m.index, end).trimEnd() };
  }
  return null;
}

/** True when `term` is DECLARED (quoted, then a definitional tail) inside `text` - used for inline parenthetical declarations in owned source such as `(collectively, “term”)`. */
export function hasQuotedDeclaration(text: string, term: string): boolean {
  const t = collapseWhitespace(term).trim();
  return t.length > 0 && new RegExp(`${Q}\\s*${escapeRe(t)}\\s*,?\\s*${Q}`).test(text);
}

/** `<term> (as defined in <the X>)` written in the source: the agreement the source itself says defines the term. */
export function externalDefinitionPointer(documentText: string, term: string): { agreement: string; absCharStart: number; excerpt: string } | null {
  const t = collapseWhitespace(term).trim();
  if (!t) return null;
  const re = new RegExp(`\\b${escapeRe(t)}\\b\\s*\\(as\\s+defined\\s+in\\s+(?:the\\s+)?([^)]{3,80})\\)`, "g");
  const m = re.exec(documentText);
  if (!m) return null;
  return { agreement: collapseWhitespace(m[1]!).trim(), absCharStart: m.index, excerpt: collapseWhitespace(documentText.slice(Math.max(0, m.index - 60), m.index + m[0].length + 20)) };
}

/** A definition whose own text declares `term` as a correlative/corresponding form of the defined term - the source's own inflection alias. */
export function findCorrelativeDeclaration(index: StructuralIndex, documentId: string, term: string): DetectedDefinition | undefined {
  const t = normTerm(term);
  if (t.length < 4) return undefined;
  const stem = t.slice(0, 4);
  const re = new RegExp(`${Q}\\s*${escapeRe(collapseWhitespace(term).trim())}\\s*${Q}[^.]{0,160}?\\b(?:correlative|corresponding)\\s+meanings?`, "i");
  for (const d of index.allDefinitions()) {
    if (d.documentId !== documentId) continue;
    if (!(d.normalizedTerm.startsWith(stem) || t.startsWith(d.normalizedTerm.slice(0, 4)))) continue;
    const full = index.getDefinitionFullText(d.exactTerm, documentId) ?? "";
    if (re.test(full)) return d;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Pass-A edge qualification (§8) - AI says "referenced term"; the source and the index decide what it is
// ---------------------------------------------------------------------------

export interface QualifyCitedTermInput {
  index: StructuralIndex;
  documentId: string;
  cited: string;
  /** Whitespace-collapsed owned source of the shard (for inline declarations). */
  ownedText: string;
  /** The document's raw text; looked up from the index when omitted. */
  documentText?: string;
  packageDocumentIds?: string[];
  packageDocumentLabels?: string[];
}

export interface QualifiedTerm {
  def: DetectedDefinition | undefined;
  resolution: TermResolution;
  declaration?: SourceDeclaration;
  external?: { agreement: string; excerpt: string; proven: boolean };
}

/**
 * Deterministic qualification of one cited term, in a fixed order: detected definition; grammatical-number variant of
 * one; a correlative form the source itself declares; an inline declaration in the shard's own source; a declaration
 * present in the document text under a grammar the detector does not model; an external definition the source itself
 * points at (proven against package identity); an ordinary lower-case word; a term absent from the source; else an
 * unknown capitalised term. Only the first five may seed the required closure.
 */
export function qualifyCitedTerm(input: QualifyCitedTermInput): QualifiedTerm {
  const { index, documentId, cited } = input;
  const documentText = input.documentText ?? index.getDocumentText(documentId) ?? "";
  const packageIds = new Set(input.packageDocumentIds ?? [documentId]);
  const packageLabels = new Set((input.packageDocumentLabels ?? []).map(normTerm));
  const direct = index.getDefinition(cited, documentId);
  if (direct) return { def: direct, resolution: { method: "DEFINED_TERM", aliasOf: null, note: `"${cited}" is a detected definition of ${documentId}` } };
  const variant = findDefinedTermVariant(index, cited, documentId);
  if (variant) return { def: variant, resolution: { method: "GRAMMATICAL_NUMBER_VARIANT", aliasOf: variant.exactTerm, note: `"${cited}" is the grammatical-number variant of the detected definition "${variant.exactTerm}"; the defined spelling's own text is delivered and the cited spelling disclosed` } };
  const correlative = findCorrelativeDeclaration(index, documentId, cited);
  if (correlative) return { def: correlative, resolution: { method: "SOURCE_DECLARED_CORRELATIVE", aliasOf: correlative.exactTerm, note: `the definition of "${correlative.exactTerm}" itself declares "${cited}" as a correlative/corresponding form; that definition's text is delivered` } };
  if (hasQuotedDeclaration(input.ownedText, cited)) return { def: undefined, resolution: { method: "INLINE_DECLARATION_IN_OWNED_SOURCE", aliasOf: null, note: `"${cited}" is declared inline (quoted) within this shard's own owned source - it is primary material, not context` } };
  const sortedStarts = index.allDefinitions().filter((d) => d.documentId === documentId).map((d) => d.charStart).sort((a, b) => a - b);
  const nextIndexed = (pos: number) => sortedStarts.find((c) => c > pos);
  const declaration = findSourceDeclaration(documentText, cited, nextIndexed);
  if (declaration) return { def: undefined, declaration, resolution: { method: "DECLARATION_FOUND_IN_SOURCE_TEXT", aliasOf: null, note: `a declaration of "${cited}" exists in the document text (chars ${declaration.absCharStart}-${declaration.absCharEnd}) under a grammar the structural detector does not model; delivered from the source text itself` } };
  const pointer = externalDefinitionPointer(documentText, cited);
  if (pointer) {
    const labelledInPackage = packageLabels.has(normTerm(pointer.agreement));
    const proven = !labelledInPackage && packageIds.size === 1;
    return { def: undefined, external: { agreement: pointer.agreement, excerpt: pointer.excerpt, proven }, resolution: { method: proven ? "EXTERNAL_BY_SOURCE_DECLARATION" : labelledInPackage ? "UNKNOWN_CAPITALISED_TERM" : "AMBIGUOUS", aliasOf: null, note: `the source itself writes "${cited} (as defined in ${pointer.agreement})"; ${proven ? `the package contains one document and "${pointer.agreement}" is not it - externality proven from package identity` : labelledInPackage ? `"${pointer.agreement}" is a package document, so the definition is internal but lives in another document - not resolved here` : `the package contains ${packageIds.size} documents and no label matches - externality cannot be proven`}` } };
  }
  const firstLetter = /[A-Za-z]/.exec(cited)?.[0] ?? "";
  if (firstLetter && firstLetter === firstLetter.toLowerCase()) return { def: undefined, resolution: { method: "ORDINARY_LEGAL_WORD", aliasOf: null, note: `"${cited}" is a lower-case word with no declaration anywhere in ${documentId} - ordinary legal English, not a defined-term dependency` } };
  if (!termOccursIn(documentText, cited)) return { def: undefined, resolution: { method: "TERM_ABSENT_FROM_SOURCE", aliasOf: null, note: `"${cited}" does not occur in ${documentId} at all - the referenced-term edge does not correspond to source text` } };
  return { def: undefined, resolution: { method: "UNKNOWN_CAPITALISED_TERM", aliasOf: null, note: `"${cited}" is used as a capitalised term in ${documentId} but no declaration of it can be resolved - required, internal, unresolved` } };
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export interface DeriveRequiredDependenciesInput {
  shardUnits: SemanticSourceUnit[];
  /** Region-relative text of the units this shard owns, concatenated in source order. */
  ownedText: string;
  ownedItemIds: string[];
  inventory: FrozenSemanticInventory;
  index: StructuralIndex | null;
  documentId: string;
  sourceContext: SourceContextResult;
  itemOwnerUnit: Map<string, string>;
  ownedUnitKeys: Set<string>;
  /** Every unit in the plan (not just this shard's), so a delivered dependency can name the unit - and therefore the shard - that owns it. */
  allUnits?: SemanticSourceUnit[];
  budget?: RequiredDependencyBudget;
  /** Document ids the package actually contains. Externality is proven against this set, never inferred from a name. */
  packageDocumentIds?: string[];
  /** Human labels of the package's documents (e.g. an agreement's own defined name for itself), when known, so a source pointer "(as defined in the X)" can be matched to a package document. */
  packageDocumentLabels?: string[];
}

/**
 * The deterministic REQUIRED set for one shard, transitively closed and bounded. Pure: no model call, no I/O.
 * NON_REQUIRED_EDGE entries are returned too (for audit) but never seed closure and are never counted as required.
 */
export function deriveRequiredDependencies(input: DeriveRequiredDependenciesInput): RequiredDependency[] {
  const budget = input.budget ?? DEFAULT_REQUIRED_DEPENDENCY_BUDGET;
  const { index, documentId, ownedText } = input;
  const out = new Map<string, RequiredDependency>();
  if (!index) return [];
  const documentText = index.getDocumentText(documentId) ?? "";
  const collapsedOwned = collapseWhitespace(ownedText);

  const byId = new Map(input.inventory.items.map((i) => [i.inventoryItemId, i]));
  const ownedItems = input.ownedItemIds.map((id) => byId.get(id)).filter((x): x is SemanticInventoryItem => !!x);
  const ownedTermKeys = new Set(input.shardUnits.map((u) => u.normalizedTermName).filter((x): x is string => !!x));
  const ownedSectionKeys = new Set(input.shardUnits.map((u) => (u.sectionRef ? normSection(u.sectionRef) : null)).filter((x): x is string => !!x));
  const ownedNodeIds = new Set(input.shardUnits.map((u) => u.sourceNodeId).filter((x): x is string => !!x));
  const fullTextOf = (exactTerm: string) => index.getDefinitionFullText(exactTerm, documentId) ?? "";
  const allUnits = input.allUnits ?? input.shardUnits;
  const unitByTerm = new Map(allUnits.filter((u) => u.normalizedTermName).map((u) => [u.normalizedTermName!, u.unitKey]));
  const unitBySection = new Map(allUnits.filter((u) => u.sectionRef).map((u) => [normSection(u.sectionRef!), u.unitKey]));
  const unitByNode = new Map(allUnits.filter((u) => u.sourceNodeId).map((u) => [u.sourceNodeId!, u.unitKey]));
  const packageIds = new Set(input.packageDocumentIds ?? [documentId]);
  const packageLabels = new Set((input.packageDocumentLabels ?? []).map(normTerm));

  type Seed = Omit<RequiredDependency, "disposition" | "dispositionReason" | "fullTextChars" | "fullTextHash" | "sourceUnitKey" | "citedAs"> & { sourceUnitKey?: string | null; citedAs?: string[]; disposition?: RequiredDependencyDisposition; dispositionReason?: string };
  const record = (d: Seed): RequiredDependency => {
    const existing = out.get(d.key);
    if (existing) {
      for (const e of d.evidence) if (!existing.evidence.includes(e)) existing.evidence.push(e);
      for (const r of d.requiredBy) if (!existing.requiredBy.includes(r)) existing.requiredBy.push(r);
      for (const c of d.citedAs ?? []) if (!existing.citedAs.includes(c)) existing.citedAs.push(c);
      existing.closureDepth = Math.min(existing.closureDepth, d.closureDepth);
      return existing;
    }
    const chars = d.fullText.length;
    const provisional: RequiredDependencyDisposition = chars <= budget.maxRequiredEntryChars ? "DELIVERED_FULL" : "DELIVERED_BOUNDED_EXCERPT";
    const entry: RequiredDependency = {
      ...d,
      citedAs: d.citedAs ?? [d.target],
      sourceUnitKey: d.sourceUnitKey ?? (d.key.startsWith("term:") ? unitByTerm.get(d.key.slice(5)) ?? null : d.key.startsWith("section:") ? unitBySection.get(d.key.slice(8)) ?? null : null) ?? (d.sourceNodeId ? unitByNode.get(d.sourceNodeId) ?? null : null),
      fullTextChars: chars, fullTextHash: computeSourceContentHash(d.fullText),
      disposition: d.disposition ?? (chars === 0 ? "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED" : provisional),
      dispositionReason: d.dispositionReason ?? (chars === 0 ? "no resolvable text" : provisional === "DELIVERED_FULL" ? `resolvable in full (${chars} chars <= required-entry bound ${budget.maxRequiredEntryChars})` : `${chars} chars exceeds the required-entry bound ${budget.maxRequiredEntryChars}: a provenance-carrying head excerpt is delivered and its partiality disclosed; its own closure is not expanded`),
    };
    out.set(d.key, entry);
    return entry;
  };

  const addSection = (ref: string, requiredBy: string[], evidence: RequiredDependencyEvidence, depth: number, viaKey: string | null) => {
    const key = normSection(ref);
    if (!key || ownedSectionKeys.has(key)) return;
    const existing = out.get(`section:${key}`);
    if (existing) { record({ ...existing, evidence: [evidence], requiredBy, closureDepth: depth, viaKey: existing.viaKey }); return; }
    const region = input.sourceContext.regions.find((r) => r.kind !== "OPERATIVE" && r.sectionRef && normSection(r.sectionRef) === key);
    if (region) { record({ key: `section:${key}`, kind: "REQUIRED_REFERENCED_SECTION", target: ref, documentId: region.documentId, sourceNodeId: region.sourceNodeId ?? null, absCharStart: region.charStart, absCharEnd: region.charEnd, fullText: region.text, evidence: [evidence], requiredBy, closureDepth: depth, viaKey }); return; }
    const referrerNodeId = input.shardUnits.find((u) => u.sourceNodeId)?.sourceNodeId ?? null;
    const r = resolveReferenceTarget(index, documentId, key, { fromNodeId: referrerNodeId });
    if (r.node) {
      if (ownedNodeIds.has(r.node.nodeId)) return;
      const text = index.getNodeText(r.node.nodeId, "DESCENDANTS");
      record({ key: `section:${key}`, kind: "REQUIRED_REFERENCED_SECTION", target: ref, documentId, sourceNodeId: r.node.nodeId, absCharStart: r.node.charStart, absCharEnd: r.node.charStart + text.length, fullText: text, evidence: [evidence], requiredBy, closureDepth: depth, viaKey });
      return;
    }
    if (r.status === "AMBIGUOUS") {
      const candidates = r.candidateNodeIds.map((id) => index.getNodeById(id)).filter((n): n is NonNullable<typeof n> => !!n).map((n) => ({ nodeId: n.nodeId, charStart: n.charStart, charEnd: n.charEnd }));
      record({ key: `section:${key}`, kind: "REQUIRED_REFERENCED_SECTION", target: ref, documentId, sourceNodeId: null, absCharStart: null, absCharEnd: null, fullText: "", evidence: [evidence], requiredBy, closureDepth: depth, viaKey, candidates, disposition: "AMBIGUOUS_REQUIRED_DEPENDENCY", dispositionReason: `section ${ref} matches ${candidates.length} substantive physical locations - candidates preserved with provenance, none guessed (${r.note})` });
      return;
    }
    record({ key: `section:${key}`, kind: "REQUIRED_REFERENCED_SECTION", target: ref, documentId, sourceNodeId: null, absCharStart: null, absCharEnd: null, fullText: "", evidence: [evidence], requiredBy, closureDepth: depth, viaKey, disposition: "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", dispositionReason: `section ${ref} has no structural occurrence in ${documentId} - required, internal, unresolved` });
  };

  const qualifyTerm = (cited: string) => qualifyCitedTerm({ index, documentId, cited, ownedText: collapsedOwned, documentText, packageDocumentIds: [...packageIds], packageDocumentLabels: [...packageLabels] });

  const addTerm = (cited: string, requiredBy: string[], evidence: RequiredDependencyEvidence, depth: number, viaKey: string | null, known?: DetectedDefinition) => {
    const q = known ? { def: known, resolution: { method: "DEFINED_TERM" as const, aliasOf: null, note: `"${known.exactTerm}" is a detected definition of ${documentId}` } } : qualifyTerm(cited);
    const def = q.def;
    if (def) {
      if (ownedTermKeys.has(def.normalizedTerm)) return;
      const text = fullTextOf(def.exactTerm);
      const entry = record({ key: `term:${def.normalizedTerm}`, kind: "REQUIRED_DEFINITION", target: def.exactTerm, citedAs: [cited], documentId, sourceNodeId: def.sourceNodeId ?? null, absCharStart: def.charStart, absCharEnd: def.charStart + text.length, fullText: text, evidence: [evidence], requiredBy, closureDepth: depth, viaKey, resolution: q.resolution });
      if (!entry.resolution) entry.resolution = q.resolution;
      // A FORWARDING declaration carries no body: its target is required by the same items, one bounded hop.
      if (def.forwardingTarget?.kind === "SECTION") addSection(def.forwardingTarget.ref, requiredBy, "FORWARDING_DEFINITION_TARGET", depth + 1, entry.key);
      else if (def.forwardingTarget?.kind === "DEFINITION") addTerm(def.forwardingTarget.ref, requiredBy, "FORWARDING_DEFINITION_TARGET", depth + 1, entry.key, index.getDefinition(def.forwardingTarget.ref, documentId));
      return;
    }
    const key = `term:${normTerm(cited)}`;
    if (ownedTermKeys.has(normTerm(cited))) return;
    const base = { key, kind: "REQUIRED_DEFINITION" as const, target: cited, citedAs: [cited], documentId, sourceNodeId: null, evidence: [evidence], requiredBy, closureDepth: depth, viaKey, resolution: q.resolution };
    switch (q.resolution.method) {
      case "INLINE_DECLARATION_IN_OWNED_SOURCE":
        record({ ...base, absCharStart: null, absCharEnd: null, fullText: "", disposition: "OWNED_PRIMARY_SOURCE", dispositionReason: q.resolution.note });
        return;
      case "DECLARATION_FOUND_IN_SOURCE_TEXT": {
        const decl = q.declaration!;
        record({ ...base, absCharStart: decl.absCharStart, absCharEnd: decl.absCharEnd, fullText: decl.text });
        return;
      }
      case "EXTERNAL_BY_SOURCE_DECLARATION":
        record({ ...base, absCharStart: null, absCharEnd: null, fullText: "", disposition: "EXTERNAL_REQUIRED_DEPENDENCY", dispositionReason: `${q.resolution.note}; represented explicitly as an external limitation and never fabricated (source: "${q.external!.excerpt}")` });
        return;
      case "ORDINARY_LEGAL_WORD":
      case "TERM_ABSENT_FROM_SOURCE":
        record({ ...base, absCharStart: null, absCharEnd: null, fullText: "", disposition: "NON_REQUIRED_EDGE", dispositionReason: `Pass-A referenced-term edge excluded from the required closure: ${q.resolution.note}` });
        return;
      case "AMBIGUOUS":
        record({ ...base, absCharStart: null, absCharEnd: null, fullText: "", disposition: "AMBIGUOUS_REQUIRED_DEPENDENCY", dispositionReason: q.resolution.note });
        return;
      default:
        record({ ...base, absCharStart: null, absCharEnd: null, fullText: "", disposition: "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", dispositionReason: q.resolution.note });
    }
  };

  // (1) defined terms occurring at word boundaries in this shard's own owned source
  for (const def of definedTermsOccurringIn(ownedText, index, documentId, budget.minTermChars)) addTerm(def.exactTerm, input.ownedUnitKeys.size ? [...input.ownedUnitKeys] : input.ownedItemIds, "DEFINED_TERM_OCCURRENCE_IN_OWNED_SOURCE", 1, null, def);
  // (2) section references written in the owned source
  for (const ref of sectionReferencesIn(ownedText)) addSection(ref, [...input.ownedUnitKeys], "STRUCTURAL_CROSS_REFERENCE_IN_OWNED_SOURCE", 1, null);
  // (3) the inventory's own edges for the owned items - AI evidence, qualified before it may seed anything
  for (const it of ownedItems) {
    for (const t of it.referencedTerms ?? []) addTerm(t, [it.inventoryItemId], "INVENTORY_REFERENCED_TERM_EDGE", 1, null);
    for (const s of it.referencedSections ?? []) addSection(s, [it.inventoryItemId], "INVENTORY_REFERENCED_SECTION_EDGE", 1, null);
    if (it.parentItemId) {
      const ownerUnit = input.itemOwnerUnit.get(it.parentItemId);
      const parent = byId.get(it.parentItemId);
      if (parent && ownerUnit && !input.ownedUnitKeys.has(ownerUnit)) {
        const text = `[${parent.semanticRole}/${parent.materiality}] ${parent.proposition} (${parent.sourceSpan.sourceCitation}: "${parent.sourceSpan.excerpt}")`;
        record({ key: `parent-item:${it.parentItemId}`, kind: "REQUIRED_PARENT_CONTEXT", target: it.parentItemId, documentId: parent.sourceSpan.documentId, sourceNodeId: parent.sourceSpan.sourceNodeId ?? null, sourceUnitKey: ownerUnit, absCharStart: null, absCharEnd: null, fullText: text, evidence: ["INVENTORY_PARENT_EDGE"], requiredBy: [it.inventoryItemId], closureDepth: 1, viaKey: null });
      }
    }
  }
  // (4) bounded transitive closure: only through dependencies resolvable IN FULL, so the set cannot explode
  for (let depth = 2; depth <= budget.maxClosureDepth; depth++) {
    // Expand ONLY through a dependency resolvable in full, and only along an edge that is itself required:
    //  - the parent is COMPOSITIONAL (it is nothing but a sum of other defined terms, so it is meaningless alone), or
    //  - the child occurs in the parent in a LIMIT-BEARING position (it IS the parent's operative ceiling/measure).
    // A substantive definition that merely mentions other terms is never expanded - that is what bounds the closure.
    const frontier = [...out.values()].filter((d) => d.closureDepth === depth - 1 && d.kind === "REQUIRED_DEFINITION" && d.disposition === "DELIVERED_FULL" && d.fullText.length > 0);
    for (const parent of frontier) {
      // An explicit section pointer written INSIDE a required definition is itself required: the definition cannot be
      // applied without the provision it points at. One hop, bounded like any other section entry, never expanded further.
      for (const ref of sectionReferencesIn(parent.fullText)) addSection(ref, parent.requiredBy, "CROSS_REFERENCE_IN_REQUIRED_DEFINITION", depth, parent.key);
      const parentIsCompositional = compositionalCoverage(parent.fullText, index, documentId, normTerm(parent.target), budget.minTermChars) >= budget.compositionalCoverageThreshold;
      for (const def of definedTermsOccurringIn(parent.fullText, index, documentId, budget.minTermChars)) {
        if (def.normalizedTerm === normTerm(parent.target)) continue;
        if (out.has(`term:${def.normalizedTerm}`)) continue;
        if (!parentIsCompositional && !occursInLimitBearingPosition(parent.fullText, def.exactTerm, budget.limitLookbehindChars)) continue;
        addTerm(def.exactTerm, parent.requiredBy, "TRANSITIVE_DEFINITION_CLOSURE", depth, parent.key, def);
      }
    }
  }
  return [...out.values()].sort((a, b) => a.closureDepth - b.closureDepth || b.requiredBy.length - a.requiredBy.length || a.key.localeCompare(b.key));
}

// ---------------------------------------------------------------------------
// Certificate (§11) - honest about what is delivered, what is limited, and what failed
// ---------------------------------------------------------------------------

export type ShardDependencyCertificateStatus =
  /** Every required dependency is delivered (in full, as a disclosed excerpt, or owned). */
  | "CERTIFIED_CONTEXT_COMPLETE"
  /** Executable, with one or more required dependencies the source itself places outside the package. */
  | "CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION"
  /** Executable, with one or more required INTERNAL dependencies unresolved or ambiguous - a stated limitation, never delivery. */
  | "CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION"
  /** A required, deliverable dependency was not delivered. Not executable. */
  | "PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE";

export interface ShardDependencyCertificate {
  modelVersion: string;
  shardId: string;
  /** Required dependencies (NON_REQUIRED_EDGE exclusions are NOT counted here). */
  requiredDependenciesTotal: number;
  deliveredFull: number;
  deliveredBoundedExcerpt: number;
  ownedPrimarySource: number;
  external: number;
  internalUnresolved: number;
  ambiguous: number;
  /** Pass-A edges deterministic qualification excluded from the closure. Audit information only. */
  nonRequiredEdgesExcluded: number;
  /** Required and deliverable but NOT delivered - the planning failure count. Must be 0 for any certified status. */
  deliverableNotDelivered: number;
  requiredDependencyChars: number;
  optionalContextChars: number;
  /** How the required tier was sized for this shard (§10): its capacity ceiling, the per-entry allowance water-filling settled on, and whether any reduction was needed at all. */
  requiredTierAllocation: { ceilingChars: number; perEntryAllowanceChars: number; waterFilled: boolean };
  /** The explicit limitations a LIMITED certificate carries, by name. */
  limitations: { key: string; disposition: RequiredDependencyDisposition; reason: string; requiredBy: number }[];
  /** The planning failures, by name. Must be empty for any certified status. */
  undelivered: { key: string; disposition: RequiredDependencyDisposition; reason: string; requiredBy: number }[];
  certificateStatus: ShardDependencyCertificateStatus;
  /** True for every status except PLANNING_FAILED. A LIMITED shard may execute; its limitation travels with it. */
  executable: boolean;
  contextComplete: boolean;
}

/** DELIVERED means the text is in the shard's initial package (in full or as a disclosed bounded excerpt) or the shard owns it. A limitation, an exclusion and a planning failure are never delivery. */
export function isDelivered(d: RequiredDependency): boolean {
  return d.disposition === "DELIVERED_FULL" || d.disposition === "DELIVERED_BOUNDED_EXCERPT" || d.disposition === "OWNED_PRIMARY_SOURCE";
}

export function isLimitation(d: RequiredDependency): boolean {
  return d.disposition === "EXTERNAL_REQUIRED_DEPENDENCY" || d.disposition === "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED" || d.disposition === "AMBIGUOUS_REQUIRED_DEPENDENCY";
}

/** Dispositions that need no context entry: the shard owns the text, or there is no text to deliver (the limitation is disclosed on the shard instead). */
export const NEEDS_NO_REQUIRED_ENTRY = new Set<RequiredDependencyDisposition>(["OWNED_PRIMARY_SOURCE", "EXTERNAL_REQUIRED_DEPENDENCY", "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED", "AMBIGUOUS_REQUIRED_DEPENDENCY", "NON_REQUIRED_EDGE", "DELIVERABLE_NOT_DELIVERED"]);

export function buildShardDependencyCertificate(shardId: string, all: RequiredDependency[], deliveredKeys: Set<string>, optionalContextChars: number, requiredDependencyChars: number, requiredTierAllocation: { ceilingChars: number; perEntryAllowanceChars: number; waterFilled: boolean }): ShardDependencyCertificate {
  const required = all.filter((d) => d.disposition !== "NON_REQUIRED_EDGE");
  const count = (p: (d: RequiredDependency) => boolean) => required.filter(p).length;
  const row = (d: RequiredDependency) => ({ key: d.key, disposition: d.disposition, reason: d.dispositionReason, requiredBy: d.requiredBy.length });
  // A dependency the planner should have carried but did not is a planning failure whatever its provisional disposition says.
  const undelivered = required.filter((d) => d.disposition === "DELIVERABLE_NOT_DELIVERED" || ((d.disposition === "DELIVERED_FULL" || d.disposition === "DELIVERED_BOUNDED_EXCERPT") && !deliveredKeys.has(d.key))).map(row);
  const limitations = required.filter(isLimitation).map(row);
  const internal = count((d) => d.disposition === "INTERNAL_REQUIRED_DEPENDENCY_UNRESOLVED");
  const ambiguous = count((d) => d.disposition === "AMBIGUOUS_REQUIRED_DEPENDENCY");
  const external = count((d) => d.disposition === "EXTERNAL_REQUIRED_DEPENDENCY");
  const certificateStatus: ShardDependencyCertificateStatus =
    undelivered.length > 0 ? "PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE"
    : internal + ambiguous > 0 ? "CERTIFIED_WITH_EXPLICIT_INTERNAL_LIMITATION"
    : external > 0 ? "CERTIFIED_WITH_EXPLICIT_EXTERNAL_LIMITATION"
    : "CERTIFIED_CONTEXT_COMPLETE";
  return {
    modelVersion: REQUIRED_DEPENDENCY_MODEL_VERSION,
    shardId,
    requiredDependenciesTotal: required.length,
    deliveredFull: count((d) => d.disposition === "DELIVERED_FULL" && deliveredKeys.has(d.key)),
    deliveredBoundedExcerpt: count((d) => d.disposition === "DELIVERED_BOUNDED_EXCERPT" && deliveredKeys.has(d.key)),
    ownedPrimarySource: count((d) => d.disposition === "OWNED_PRIMARY_SOURCE"),
    external, internalUnresolved: internal, ambiguous,
    nonRequiredEdgesExcluded: all.length - required.length,
    deliverableNotDelivered: undelivered.length,
    requiredDependencyChars,
    optionalContextChars,
    requiredTierAllocation,
    limitations,
    undelivered,
    certificateStatus,
    executable: certificateStatus !== "PLANNING_FAILED_REQUIRED_CONTEXT_UNDELIVERABLE",
    contextComplete: certificateStatus === "CERTIFIED_CONTEXT_COMPLETE",
  };
}
