/**
 * Section/heading-aware chunking (docs/document-onboarding-pipeline-foundation.md).
 *
 * A pragmatic regex/heuristic segmenter, deliberately NOT a general-purpose
 * NLP layout parser and NOT a vector-embeddings/retrieval-index pipeline
 * (task: "not infrastructure for its own sake") - credit agreements and
 * indentures have fairly predictable structural markers (Article/Section
 * numbering, ALL-CAPS headings), and that is all this file leans on.
 *
 * Pure function over a ParsedDocument (lib/extraction/parse.ts) - no Prisma
 * dependency. Callers (lib/extraction/run-stage.ts, a future upload route)
 * persist the returned rows as DocumentChunk records themselves.
 */

import type { ParsedDocument } from "./parse";

export interface ChunkResult {
  chunkIndex: number;
  page: number | null;
  articleRef: string | null;
  sectionRef: string | null;
  heading: string | null;
  text: string;
  charStart: number;
  charEnd: number;
}

/** Keeps individual chunks small enough to be a reasonable LLM-prompt unit while still holding a whole section in the common case. */
const MAX_CHUNK_CHARS = 6000;
/** Generous overlap when a single section has to be sub-split, so a cross-reference near a sub-split boundary stays interpretable from either side. */
const OVERLAP_CHARS = 500;

const ARTICLE_RE = /^\s*ARTICLE\s+([IVXLCDM]+|\d+)\.?\s*(.*)$/i;
const SECTION_RE = /^\s*SECTION\s+(\d+(?:\.\d+)*[A-Za-z]?)\.?\s*(.*)$/i;
/** A standalone ALL-CAPS line (e.g. "DEFINITIONS", "REPRESENTATIONS AND WARRANTIES") - the common heading style when a document doesn't use explicit Article/Section prefixes for a given boundary. */
const ALL_CAPS_HEADING_RE = /^[A-Z][A-Z0-9 ,.;:'&()/-]{2,79}$/;

interface Boundary {
  charOffset: number;
  articleRef: string | null;
  sectionRef: string | null;
  heading: string | null;
}

/** Finds every heading-like line and the article/section/heading state that begins at it. State carries forward (an Article match persists as articleRef until the next Article match; a Section/ALL-CAPS match sets sectionRef/heading until the next such match). */
function findBoundaries(fullText: string): Boundary[] {
  const boundaries: Boundary[] = [];
  let currentArticle: string | null = null;
  let currentSection: string | null = null;
  let currentHeading: string | null = null;

  let offset = 0;
  const lines = fullText.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    const articleMatch = ARTICLE_RE.exec(trimmed);
    const sectionMatch = !articleMatch ? SECTION_RE.exec(trimmed) : null;
    const allCapsMatch = !articleMatch && !sectionMatch && ALL_CAPS_HEADING_RE.test(trimmed) ? trimmed : null;

    if (articleMatch) {
      currentArticle = `Article ${articleMatch[1]}`;
      // A new Article resets section state - real section numbering starts
      // over per Article, so carrying the prior Article's sectionRef forward
      // would misattribute the intervening (pre-first-Section) text.
      currentSection = null;
      currentHeading = articleMatch[2]?.trim() || null;
      boundaries.push({ charOffset: offset, articleRef: currentArticle, sectionRef: currentSection, heading: currentHeading });
    } else if (sectionMatch) {
      currentSection = sectionMatch[1] ?? null;
      currentHeading = sectionMatch[2]?.trim() || null;
      boundaries.push({ charOffset: offset, articleRef: currentArticle, sectionRef: currentSection, heading: currentHeading });
    } else if (allCapsMatch) {
      currentHeading = allCapsMatch;
      boundaries.push({ charOffset: offset, articleRef: currentArticle, sectionRef: currentSection, heading: currentHeading });
    }

    offset += line.length + 1; // +1 for the newline split() consumed
  }

  return boundaries;
}

/** Sub-splits one oversized [start, end) run into overlapping windows, inheriting the same articleRef/sectionRef/heading. */
function splitOversized(text: string, start: number, meta: Pick<Boundary, "articleRef" | "sectionRef" | "heading">): Array<Omit<ChunkResult, "chunkIndex" | "page">> {
  if (text.length <= MAX_CHUNK_CHARS) {
    return [{ ...meta, text, charStart: start, charEnd: start + text.length }];
  }
  const parts: Array<Omit<ChunkResult, "chunkIndex" | "page">> = [];
  let pos = 0;
  while (pos < text.length) {
    const end = Math.min(pos + MAX_CHUNK_CHARS, text.length);
    parts.push({ ...meta, text: text.slice(pos, end), charStart: start + pos, charEnd: start + end });
    if (end >= text.length) break;
    pos = end - OVERLAP_CHARS;
  }
  return parts;
}

function pageForOffset(offset: number, pageRanges: Array<{ page: number; start: number; end: number }>): number | null {
  for (const range of pageRanges) {
    if (offset >= range.start && offset < range.end) return range.page;
  }
  return pageRanges.length > 0 ? (pageRanges[pageRanges.length - 1]?.page ?? null) : null;
}

export function chunkDocument(parsed: ParsedDocument): ChunkResult[] {
  const fullText = parsed.fullText;

  // Page boundaries, in the same joinPages("\n\n") coordinate space parse.ts used.
  const pageRanges: Array<{ page: number; start: number; end: number }> = [];
  let cursor = 0;
  for (const p of parsed.pages) {
    const start = cursor;
    const end = start + p.text.length;
    pageRanges.push({ page: p.pageNumber, start, end });
    cursor = end + 2; // "\n\n" joiner
  }

  const boundaries = findBoundaries(fullText);

  const segments: Array<{ start: number; end: number; articleRef: string | null; sectionRef: string | null; heading: string | null }> = [];
  if (boundaries.length === 0) {
    segments.push({ start: 0, end: fullText.length, articleRef: null, sectionRef: null, heading: null });
  } else {
    // Anything before the first boundary is un-headed preamble (recitals,
    // table of contents, etc.) - still kept as its own segment rather than
    // dropped.
    if (boundaries[0]!.charOffset > 0) {
      segments.push({ start: 0, end: boundaries[0]!.charOffset, articleRef: null, sectionRef: null, heading: null });
    }
    for (let i = 0; i < boundaries.length; i++) {
      const b = boundaries[i]!;
      const end = i + 1 < boundaries.length ? boundaries[i + 1]!.charOffset : fullText.length;
      segments.push({ start: b.charOffset, end, articleRef: b.articleRef, sectionRef: b.sectionRef, heading: b.heading });
    }
  }

  const rawChunks: Array<Omit<ChunkResult, "chunkIndex" | "page">> = [];
  for (const seg of segments) {
    const text = fullText.slice(seg.start, seg.end).trim();
    if (text.length === 0) continue;
    // Re-derive charStart against the trimmed text's actual position within the segment.
    const leadingWhitespace = fullText.slice(seg.start, seg.end).indexOf(text);
    const trimmedStart = seg.start + Math.max(leadingWhitespace, 0);
    rawChunks.push(...splitOversized(text, trimmedStart, { articleRef: seg.articleRef, sectionRef: seg.sectionRef, heading: seg.heading }));
  }

  return rawChunks.map((c, index) => ({
    ...c,
    chunkIndex: index,
    page: pageForOffset(c.charStart, pageRanges),
  }));
}
