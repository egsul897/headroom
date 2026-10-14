/**
 * Locates precedent candidates and computed basket citations in a section tree so the
 * self-check can compare WHERE two texts sit (tree section), not whether a fragment of
 * one appears somewhere in the other.
 *
 * Real document text → one tree over the document.
 * Composite text (no document bytes; package text = joined candidate excerpts) → one tree
 * per excerpt block, so structure never bleeds across unrelated excerpts.
 * A text that cannot be located, or sits outside any SECTION, yields null (fail closed).
 */
import { deepestContaining, parseDocumentTree, parseSectionTree, sectionOf, type SectionTree } from "../../contract-model/section-tree/parse";
import type { PrecedentCandidate } from "./self-check";

interface Indexed {
  tree: SectionTree;
  norm: string;
  map: number[];
}

function index(tree: SectionTree, text: string): Indexed {
  let norm = "";
  const map: number[] = [];
  let ws = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (/\s/.test(ch)) {
      if (!ws && norm.length) {
        norm += " ";
        map.push(i);
      }
      ws = true;
    } else {
      norm += ch.toLowerCase();
      map.push(i);
      ws = false;
    }
  }
  return { tree, norm, map };
}

/** Located in more than one place (e.g. a duplicated clause): NOT the same as "not found". */
export const AMBIGUOUS = "?AMBIGUOUS";

const key = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function inToc(ix: Indexed, at: number): boolean {
  const pos = ix.map[at] ?? -1;
  return ix.tree.furniture.some((f) => f.kind === "TOC" && pos >= f.start && pos < f.end);
}

/** Occurrences of k in the document body (table-of-contents copies are not locations). */
function bodyHits(ix: Indexed, k: string, limit = 3): number[] {
  const hits: number[] = [];
  for (let at = ix.norm.indexOf(k); at >= 0 && hits.length < limit; at = ix.norm.indexOf(k, at + 1)) if (!inToc(ix, at)) hits.push(at);
  return hits;
}

function sectionAt(ix: Indexed, needle: string): string | null {
  const full = key(needle);
  let k = full.slice(0, 60);
  if (k.length < 24) return null;
  let hits = bodyHits(ix, k);
  // Same 60-char prefix in two places (a heading repeated, a shared lead-in): the longer text may still be unique.
  if (hits.length > 1 && full.length > 60) {
    k = full.slice(0, 240);
    const longer = bodyHits(ix, k);
    if (longer.length >= 1) hits = longer;
  }
  if (hits.length === 0) return null;
  // ambiguous location (same text in two body places) → fail closed
  if (hits.length > 1) return AMBIGUOUS;
  const at = hits[0]!;
  const start = ix.map[at]!;
  const end = ix.map[Math.min(ix.map.length - 1, at + k.length - 1)]! + 1;
  const node = deepestContaining(ix.tree, start, end);
  return sectionOf(ix.tree, node)?.sectionNumber ?? null;
}

export interface TreeLocator {
  candidateSection(c: PrecedentCandidate): string | null;
  citationSection(citation: string): string | null;
}

export function buildTreeLocator(args: { documentText: string | null; candidates: PrecedentCandidate[] }): TreeLocator {
  const doc = args.documentText?.trim() ?? "";
  if (doc.length >= 80) {
    let ix: Indexed | null = null;
    try {
      const t = parseDocumentTree(doc);
      ix = index(t, t.text);
    } catch {
      ix = null;
    }
    return {
      candidateSection: (c) => (ix && c.excerpt ? sectionAt(ix, c.excerpt) : null),
      citationSection: (cite) => (ix ? sectionAt(ix, cite) : null),
    };
  }
  const blocks: Indexed[] = [];
  const byCand = new Map<string, Indexed>();
  for (const c of args.candidates) {
    const e = c.excerpt?.trim();
    if (!e || e.length < 24) continue;
    try {
      const ix = index(parseSectionTree(e), e);
      blocks.push(ix);
      byCand.set(c.candidateId, ix);
    } catch {
      /* fail closed for this block */
    }
  }
  return {
    candidateSection: (c) => {
      const ix = byCand.get(c.candidateId);
      return ix && c.excerpt ? sectionAt(ix, c.excerpt) : null;
    },
    citationSection: (cite) => {
      const k = key(cite).slice(0, 60);
      if (k.length < 24) return null;
      const hits = blocks.filter((b) => b.norm.includes(k));
      const secs = new Set(hits.map((b) => sectionAt(b, cite)));
      // Same citation located under different sections in different blocks → ambiguous → null.
      if (secs.size === 0) return null;
      return secs.size === 1 ? [...secs][0]! : AMBIGUOUS;
    },
  };
}
