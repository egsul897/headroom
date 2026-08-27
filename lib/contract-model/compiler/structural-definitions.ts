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

const EXCERPT_LENGTH = 200;

/**
 * Scans one document's text for defined-term declarations and attributes
 * each to its enclosing structural node. `nodes` must be this document's
 * own structural nodes only.
 */
export function detectStructuralDefinitions(documentId: string, text: string, nodes: StructuralNode[]): DetectedDefinition[] {
  const sorted = [...nodes].sort((a, b) => a.charStart - b.charStart);
  const results: DetectedDefinition[] = [];
  const re = new RegExp(DEFINITION_DECLARATION.source, DEFINITION_DECLARATION.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
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
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return results.sort((a, b) => a.charStart - b.charStart);
}
