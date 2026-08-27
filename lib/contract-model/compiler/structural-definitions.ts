/**
 * Phase 2A - deterministic defined-term index (task §7). Distinct from
 * stage-definitions.ts's real LLM stage (which does semantic dependency
 * resolution across terms - explicitly Phase 2C's job, not this one): this
 * module only recognizes the mechanical drafting pattern "QUOTE Term QUOTE
 * means/shall mean ..." and records where it physically occurs, with zero
 * paid calls and zero interpretation of what the definition MEANS.
 *
 * Generalized across three real quote encodings actually observed in this
 * repository's own fixtures - literal curly quotes (LSB's own definitions
 * file uses "“"/"”" directly), the HTML numeric-entity encoding
 * FWRG's own source file uses (&#147;/&#148;), and plain straight quotes
 * (for synthetic/adversarial test text) - plus tolerance for a line break
 * between the closing quote and "means" (also observed verbatim in LSB's
 * own fixture: a term closing quote, then a bare newline, then "means").
 */
import { findEnclosingNode } from "./structural-references";
import type { StructuralNode } from "./types";

export interface DetectedDefinition {
  documentId: string;
  /** Exact term text as it appears between the quotes, untrimmed of internal formatting beyond outer whitespace. */
  exactTerm: string;
  /** Lowercased, whitespace-collapsed - the same normalization persistDefinedTerms already uses for termName, so both paths converge on one identity. */
  normalizedTerm: string;
  sourceNodeKey: string | null;
  charStart: number;
  charEnd: number;
  /** A bounded excerpt starting at the definition declaration - never the full (potentially page-spanning) defined text, matching CandidateDefinedTerm's own "excerpt, not full dump" convention. */
  definitionExcerpt: string;
}

const QUOTE = String.raw`(?:&#14[7-8];|&#822[01];|&ldquo;|&rdquo;|["“”])`;
const DEFINITION_DECLARATION = new RegExp(`${QUOTE}\\s*([^"“”&]{1,100}?)\\s*${QUOTE}\\s*(?:means|shall mean|shall have the meaning)`, "gi");

/**
 * Phase 2F.1 §4 (DEFINITION_GRAMMAR) - real, confirmed finding: CONMED's
 * own two real documents (Eighth A&R Credit Agreement, Amended and
 * Restated Guarantee and Collateral Agreement) define nearly every term
 * with a bare-colon convention - `" Term ": definition text` - never
 * "means"/"shall mean" (353 real colon-style declarations measured
 * against only 6 real "means"-style ones in the Credit Agreement's own
 * Article I). QUOTED_COLON_DEFINITION reuses the exact same QUOTE
 * alternation (so it inherits the same three real quote encodings this
 * module already generalizes across) but requires only a colon after the
 * closing quote - the quote marks themselves are the precision anchor,
 * since a deliberately quoted phrase followed immediately by a colon is
 * a genuine, narrow drafting convention (a citation or heading is never
 * both quoted AND colon-terminated in real legal drafting - confirmed by
 * checking this pattern does not fire anywhere in the real FWRG/LSB
 * fixtures, which use "means"-style exclusively).
 */
const QUOTED_COLON_DEFINITION = new RegExp(`${QUOTE}\\s*([^"“”&]{1,100}?)\\s*${QUOTE}\\s*:`, "g");

/**
 * Unquoted colon-style definitions (task's own example: `Applicable
 * Rate: ...`, no quote marks at all) - not observed in any real fixture
 * yet, so this pattern is deliberately the most conservative of the
 * three, guarded on every axis the task's own precision tests name:
 * - line-anchored (`^`) - a heading or citation embedded mid-sentence
 *   can never qualify, only a term that opens its own line;
 * - the term itself must be genuine Title Case - each word capitalized,
 *   immediately followed by a lowercase letter (`[A-Z][a-z]`) - this
 *   alone excludes an all-caps recital marker ("WITNESSETH:"), a spaced-
 *   letter recital ("W I T N E S S E T H :"), and an all-caps section
 *   heading ("NEGATIVE COVENANTS:"), none of which have a lowercase
 *   letter anywhere in the run the term-capture would need to match;
 * - capped at 2-6 words / 4-60 chars - long enough for a real multi-word
 *   defined term, short enough to exclude a heading that happens to be
 *   followed by a stray colon further into a longer clause;
 * - the colon must be followed by a real definition-body opening (a
 *   lowercase word, or "means"/"shall"/"any"/"the"/"a"/"an"/"with
 *   respect to") - never by another capitalized word (which reads as
 *   the START of a new heading/list-label line, not this term's own
 *   definition) and never by end-of-line (a bare table/list LABEL like
 *   "Schedule 1 Notice Addresses" never has a trailing colon at all, so
 *   it never reaches this pattern in the first place; a heading that
 *   DOES end in a colon with nothing meaningful after it on the same
 *   line is excluded by this same requirement).
 */
const UNQUOTED_COLON_DEFINITION = /^([A-Z][a-z][A-Za-z'-]*(?:\s+(?:[A-Z][a-z][A-Za-z'-]*|of|the|and|or|to|for|in|on))*)\s*:\s*(?=[a-z]|means\b|shall\b|any\b|the\b|a\b|an\b|with respect\b)/gm;

const EXCERPT_LENGTH = 200;

/**
 * Scans one document's text for defined-term declarations and attributes
 * each to its enclosing structural node. `nodes` must be this document's
 * own structural nodes only.
 */
function scanPattern(pattern: RegExp, text: string, minTermLength: number, maxTermLength: number): RegExpExecArray[] {
  const re = new RegExp(pattern.source, pattern.flags);
  const out: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const term = (m[1] ?? "").trim();
    if (term.length >= minTermLength && term.length <= maxTermLength) out.push(m);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out;
}

/**
 * Defensive dedup for the union of all three definition patterns - by
 * construction the three never truly overlap (means-style requires NO
 * colon between the quotes and "means"; quoted-colon requires a leading
 * quote character unquoted-colon's own line-start anchor excludes; a
 * genuine mixed-convention document simply contributes matches from
 * whichever pattern fits each individual declaration), but this closes
 * any pathological edge case rather than relying on that argument alone.
 * Earliest-starting match at a given position wins.
 */
function dedupeByOverlap(all: RegExpExecArray[]): RegExpExecArray[] {
  const sorted = [...all].sort((a, b) => a.index - b.index);
  const kept: RegExpExecArray[] = [];
  for (const m of sorted) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (kept.some((k) => start < k.index + k[0].length && end > k.index)) continue;
    kept.push(m);
  }
  return kept;
}

/**
 * Scans one document's text for defined-term declarations and attributes
 * each to its enclosing structural node. `nodes` must be this document's
 * own structural nodes only.
 */
export function detectStructuralDefinitions(documentId: string, text: string, nodes: StructuralNode[]): DetectedDefinition[] {
  const sorted = [...nodes].sort((a, b) => a.charStart - b.charStart);

  const meansMatches = scanPattern(DEFINITION_DECLARATION, text, 1, 100);
  const quotedColonMatches = scanPattern(QUOTED_COLON_DEFINITION, text, 1, 100);
  const unquotedColonMatches = scanPattern(UNQUOTED_COLON_DEFINITION, text, 4, 60);
  const merged = dedupeByOverlap([...meansMatches, ...quotedColonMatches, ...unquotedColonMatches]);

  const results: DetectedDefinition[] = [];
  for (const m of merged) {
    const exactTerm = (m[1] ?? "").trim();
    if (exactTerm.length === 0) continue;
    const charStart = m.index;
    const charEnd = m.index + m[0].length;
    const enclosing = findEnclosingNode(charStart, sorted);
    results.push({
      documentId,
      exactTerm,
      normalizedTerm: exactTerm.toLowerCase().replace(/\s+/g, " "),
      sourceNodeKey: enclosing?.nodeKey ?? null,
      charStart,
      charEnd,
      definitionExcerpt: text.slice(charStart, Math.min(text.length, charStart + EXCERPT_LENGTH)),
    });
  }
  return results.sort((a, b) => a.charStart - b.charStart);
}
