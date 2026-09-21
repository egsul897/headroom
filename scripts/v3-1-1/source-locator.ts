/**
 * Deterministic primary-source locator for the V3.1.1 corrected benchmark corpus.
 *
 * This module exists to make one distinction mechanical:
 *
 *   the FIRST textual occurrence of "Section X"  !=  the OPERATIVE Section X text
 *
 * The V3.1 benchmark's evidence layer was built by taking the first string match of a
 * section number, which lands on a table-of-contents entry, a cross-reference inside a
 * definition, or an exhibit form. This locator instead finds the span that actually
 * enacts the provision, and exposes the span so a repaired excerpt can be proven to
 * come from inside it.
 *
 * It is benchmark tooling. It is not part of the Phase-3 extraction/compiler/analyzer
 * pipeline and nothing in production imports it.
 */

export interface SourceSpan {
  /** inclusive character offset of the first character of the span */
  start: number;
  /** exclusive character offset one past the last character of the span */
  end: number;
  /** the matched heading or defined-term lead-in, verbatim */
  heading: string;
  /** every candidate the locator considered, in document order */
  candidates: SpanCandidate[];
}

export interface SpanCandidate {
  start: number;
  /** distance to the next heading of the same class */
  extent: number;
  /** why this candidate was or was not chosen */
  disposition: "OPERATIVE" | "TABLE_OF_CONTENTS_OR_STUB";
}

/**
 * A section heading in these agreements is `SECTION <number>. <Title>` in caps.
 * A cross-reference is `Section <number>` in title case. Matching the heading form
 * alone already removes most cross-references; the extent test below removes the
 * table of contents, whose entries are a title and a page number.
 */
const HEADING_SOURCE = String.raw`SECTION\s+(\d+\.\d+)\s*\.`;

/** A table-of-contents entry is a heading, a short title and a page number. */
const MIN_OPERATIVE_EXTENT = 400;

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Locate the operative text of a numbered section.
 *
 * The span runs from the section's own heading to the next section heading (or to the
 * next Article heading, or to the end of the document). A candidate whose extent is
 * shorter than MIN_OPERATIVE_EXTENT is a table-of-contents line, not a provision.
 */
export function locateOperativeSection(text: string, sectionNumber: string): SourceSpan | null {
  const allHeadings = [...text.matchAll(new RegExp(HEADING_SOURCE, "g"))];
  const wanted = new RegExp(String.raw`^SECTION\s+${escapeForRegExp(sectionNumber)}\s*\.`);

  const candidates: SpanCandidate[] = [];
  let chosen: { start: number; end: number; heading: string } | null = null;

  for (let i = 0; i < allHeadings.length; i++) {
    const match = allHeadings[i];
    if (match === undefined || match.index === undefined) continue;
    if (!wanted.test(match[0])) continue;
    const start = match.index;
    const next = allHeadings[i + 1];
    const end = next?.index ?? text.length;
    const extent = end - start;
    const operative = extent >= MIN_OPERATIVE_EXTENT;
    candidates.push({ start, extent, disposition: operative ? "OPERATIVE" : "TABLE_OF_CONTENTS_OR_STUB" });
    if (operative && chosen === null) {
      chosen = { start, end, heading: text.slice(start, Math.min(end, start + 120)).split("\n")[0] ?? "" };
    }
  }

  if (!chosen) return null;
  return { ...chosen, candidates };
}

/**
 * Locate a defined term in Article I.
 *
 * The extracted text renders a definition as `“ Term ” means ...` (the spacing inside
 * the curly quotes varies, and a line break can fall between the term and `means`).
 * A bare mention of the term elsewhere — including `has the meaning assigned to such
 * term in the definition of “Term”` — does not match, because it is not followed by
 * `means`.
 */
export function locateDefinition(text: string, term: string): SourceSpan | null {
  const spaced = term.split(/\s+/).map(escapeForRegExp).join(String.raw`\s+`);
  const re = new RegExp(String.raw`“\s*${spaced}\s*”\s*means`, "g");
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) return null;

  // The next definition begins at the next `“ ... ”` lead-in that is itself followed by
  // `means` or `has the meaning`, so a quoted term used inside this definition's body
  // does not terminate it.
  const boundary = /“\s*[^“”]{1,80}\s*”\s*(means|has\s+the\s+meaning)/g;

  const candidates: SpanCandidate[] = [];
  let chosen: { start: number; end: number; heading: string } | null = null;

  for (const match of matches) {
    if (match.index === undefined) continue;
    const start = match.index;
    boundary.lastIndex = start + match[0].length;
    const next = boundary.exec(text);
    const end = next?.index ?? text.length;
    candidates.push({ start, extent: end - start, disposition: "OPERATIVE" });
    if (chosen === null) chosen = { start, end, heading: match[0] };
  }

  if (!chosen) return null;
  return { ...chosen, candidates };
}

/** Where a recorded excerpt actually sits in the source, if it sits there at all. */
export interface ExcerptPlacement {
  found: boolean;
  offset: number;
  insideOperativeSpan: boolean;
}

export function placeExcerpt(text: string, excerpt: string, span: SourceSpan | null): ExcerptPlacement {
  if (!excerpt) return { found: false, offset: -1, insideOperativeSpan: false };
  const offset = text.indexOf(excerpt);
  if (offset < 0) return { found: false, offset: -1, insideOperativeSpan: false };
  const inside = span !== null && offset >= span.start && offset < span.end;
  return { found: true, offset, insideOperativeSpan: inside };
}
