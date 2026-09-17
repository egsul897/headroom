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
  /** @deprecated legacy label-shaped key, kept for backward-compatible display/logging only. Use `sourceNodeId` for identity. */
  sourceNodeKey: string | null;
  /** Phase 3F.1.2 - the enclosing node's real physical occurrence identity (findEnclosingNode is position-based, so this was always the correct physical node; only its downstream lookup via the label-keyed nodeKey was unsafe before 3F.1.2). */
  sourceNodeId: string | null;
  charStart: number;
  charEnd: number;
  /** A bounded excerpt starting at the definition declaration - never the full (potentially page-spanning) defined text, matching CandidateDefinedTerm's own "excerpt, not full dump" convention. */
  definitionExcerpt: string;
  /**
   * PHASE 3 / 6.01 remediation (planner-omitted-definition root cause): which drafting grammar produced this declaration.
   * "FORWARDING" = the declaration itself carries no definition body but points elsewhere ("has the meaning assigned
   * to such term in Section 6.08(a)(3)" / "shall have the meaning set forth in the definition of "X"") - a real,
   * general credit-agreement convention (the Chewy instrument alone carries ~90 of them). Optional so every
   * pre-existing constructor of this shape stays valid; absent means "not classified" (legacy), never FORWARDING.
   */
  declarationKind?: DefinitionDeclarationKind;
  /** Only for FORWARDING declarations: where the meaning actually lives. Consumers follow it ONE bounded hop with provenance; never guessed. */
  forwardingTarget?: DefinitionForwardingTarget | null;
  /**
   * True when the declaration sits INSIDE another sentence ("... determined on the Measurement Basis, and "Measurement
   * Basis" has the meaning assigned to such term in Section 6.02") rather than opening its own entry (preceded by a
   * paragraph break or sentence-terminating punctuation). A nested declaration is indexed for lookup but never cuts
   * the enclosing definition's own span or becomes its own planner unit (F-7B.2 anchors it to the enclosing unit).
   */
  nested?: boolean;
}

/** A declaration opens its own entry when nothing but whitespace, a paragraph break or sentence-terminating punctuation (optionally with closing quotes/brackets) precedes it. */
export function isNestedDeclaration(text: string, charStart: number): boolean {
  let i = charStart - 1;
  while (i >= 0 && (text[i] === " " || text[i] === "\t")) i--;
  if (i < 0) return false;
  if (text[i] === "\n" || text[i] === "\r") return false;
  while (i >= 0 && /["”'’)\]]/.test(text[i]!)) i--;
  if (i < 0) return false;
  return !/[.;:]/.test(text[i]!);
}

export type DefinitionDeclarationKind = "MEANS" | "QUOTED_COLON" | "UNQUOTED_COLON" | "FORWARDING";

export interface DefinitionForwardingTarget {
  kind: "SECTION" | "DEFINITION" | "PREAMBLE";
  /** SECTION: the bare legal ref ("6.08(a)(3)"); DEFINITION: the exact target term; PREAMBLE: "preamble" / "recitals". */
  ref: string;
}

/** The three real quote encodings this module generalizes across. Exported (F-7B.2) so the definition-source-anchor
 * attribution helper reuses this exact alternation instead of restating a second quote grammar. Value unchanged. */
export const DEFINITION_TERM_QUOTE = String.raw`(?:&#14[7-8];|&#822[01];|&ldquo;|&rdquo;|["“”])`;
const QUOTE = DEFINITION_TERM_QUOTE;
/**
 * PHASE 3 / 6.01 remediation: "has the meaning" added alongside "shall have the meaning". Both are FORWARDING
 * declarations when followed by a real target ("... assigned to such term in Section 2.22(a)", "... set forth in the
 * definition of "Cure Amount"", "... in the preamble hereto"); the pre-fix grammar accepted only the "shall have"
 * spelling, so every "has the meaning" term was invisible to the index, the planner and getDefinition (the paid 6.01
 * shard 1 MISSING_CONTEXT trigger: "Available Amount" has the meaning assigned to such term in Section 6.08(a)(3)).
 */
const DEFINITION_DECLARATION = new RegExp(`${QUOTE}\\s*([^"“”&]{1,100}?)\\s*${QUOTE}\\s*(?:means|shall mean|shall have the meaning|has the meaning)`, "gi");
/** Where a "has/shall have the meaning ..." declaration forwards to. Bounded to the declaration's own sentence. */
const FORWARDING_VERB = /(?:shall have the meaning|has the meaning)\s*$/i;
const FORWARDING_SECTION = /^[^.;]{0,80}?\b(?:in|under|by|of)\s+(?:Sections?|§)\s*([0-9]+(?:\.[0-9]+)*(?:\([0-9A-Za-z]+\))*)/i;
const FORWARDING_DEFINITION = new RegExp(`^[^.;]{0,80}?\\bin\\s+the\\s+definition\\s+of\\s+${QUOTE}\\s*([^"“”&]{1,100}?)\\s*${QUOTE}`, "i");
const FORWARDING_PREAMBLE = /^[^.;]{0,80}?\bin\s+the\s+(preamble|recitals)\b/i;

/** Classifies a "has/shall have the meaning ..." declaration's forwarding target from the text that follows it; null when it carries its own body ("has the meaning set forth below"). */
export function parseForwardingTarget(declarationText: string, following: string): DefinitionForwardingTarget | null {
  if (!FORWARDING_VERB.test(declarationText)) return null;
  const tail = following.slice(0, 160);
  const sec = FORWARDING_SECTION.exec(tail);
  if (sec) return { kind: "SECTION", ref: sec[1]! };
  const def = FORWARDING_DEFINITION.exec(tail);
  if (def) return { kind: "DEFINITION", ref: def[1]!.trim() };
  const pre = FORWARDING_PREAMBLE.exec(tail);
  if (pre) return { kind: "PREAMBLE", ref: pre[1]!.toLowerCase() };
  return null;
}

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
  const meansSet = new Set(meansMatches);
  const quotedColonSet = new Set(quotedColonMatches);
  for (const m of merged) {
    const exactTerm = (m[1] ?? "").trim();
    if (exactTerm.length === 0) continue;
    const charStart = m.index;
    const charEnd = m.index + m[0].length;
    const enclosing = findEnclosingNode(charStart, sorted);
    const forwardingTarget = meansSet.has(m) ? parseForwardingTarget(m[0]!, text.slice(charEnd, charEnd + 160)) : null;
    const declarationKind: DefinitionDeclarationKind = forwardingTarget ? "FORWARDING" : meansSet.has(m) ? "MEANS" : quotedColonSet.has(m) ? "QUOTED_COLON" : "UNQUOTED_COLON";
    results.push({
      documentId,
      exactTerm,
      normalizedTerm: exactTerm.toLowerCase().replace(/\s+/g, " "),
      sourceNodeKey: enclosing?.nodeKey ?? null,
      sourceNodeId: enclosing?.nodeId ?? null,
      charStart,
      charEnd,
      definitionExcerpt: text.slice(charStart, Math.min(text.length, charStart + EXCERPT_LENGTH)),
      declarationKind,
      forwardingTarget,
      nested: isNestedDeclaration(text, charStart),
    });
  }
  return results.sort((a, b) => a.charStart - b.charStart);
}
