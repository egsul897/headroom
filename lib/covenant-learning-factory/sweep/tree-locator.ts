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
import { covenantChecklist, isProhibitive } from "../../contract-model/section-tree/semantics";
import { isObligorProhibitionLead } from "../../contract-model/section-tree/family-classifier";

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

function sectionAt(ix: Indexed, needle: string): string | null {
  const k = key(needle).slice(0, 60);
  if (k.length < 24) return null;
  const at = ix.norm.indexOf(k);
  if (at < 0) return null;
  // ambiguous location (same text in two places) → fail closed
  if (ix.norm.indexOf(k, at + 1) >= 0) return AMBIGUOUS;
  const start = ix.map[at]!;
  const end = ix.map[Math.min(ix.map.length - 1, at + k.length - 1)]! + 1;
  const node = deepestContaining(ix.tree, start, end);
  return sectionOf(ix.tree, node)?.sectionNumber ?? null;
}

export interface TreeLocator {
  candidateSection(c: PrecedentCandidate): string | null;
  citationSection(citation: string): string | null;
  /** true/false when the tree + family classifier can tell whether a located section is a covenant section; null when unknown. */
  isCovenantSection?(section: string | null): boolean | null;
}

export function buildTreeLocator(args: { documentText: string | null; candidates: PrecedentCandidate[] }): TreeLocator {
  const doc = args.documentText?.trim() ?? "";
  if (doc.length >= 80) {
    let ix: Indexed | null = null;
    let covenantSecs: Set<string> | null = null;
    try {
      const t = parseDocumentTree(doc);
      ix = index(t, t.text);
      const byPath = new Map(t.nodes.map((n) => [n.path, n.sectionNumber]));
      covenantSecs = new Set();
      for (const item of covenantChecklist(t, t.text)) for (const p of item.sectionPaths) {
        const n = byPath.get(p) ?? null;
        if (n) covenantSecs.add(n);
      }
      // Fail closed: a heading the family classifier misses is still a covenant section when its
      // operative lead-in, its own title or its article title says so. Events of Default and affirmative
      // covenants stay in scope.
      for (const n of t.nodes) {
        if (n.kind !== "SECTION" || !n.sectionNumber) continue;
        if (covenantSecs.has(n.sectionNumber)) continue;
        if (sectionLooksCovenant(t, t.text, n)) covenantSecs.add(n.sectionNumber);
      }
    } catch {
      ix = null;
      covenantSecs = null;
    }
    return {
      candidateSection: (c) => (ix && c.excerpt ? sectionAt(ix, c.excerpt) : null),
      citationSection: (cite) => (ix ? sectionAt(ix, cite) : null),
      // Unknown (no tree, unlocated, ambiguous) → null: callers must keep counting (fail closed).
      isCovenantSection: (sec) => (!covenantSecs || !sec || sec === AMBIGUOUS ? null : covenantSecs.has(sec)),
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

const COVENANT_TITLE = /covenant|events? of default|\bdefaults?\b|negative pledge|limitation|restrict|nonrecourse|non-recourse|burdensome/i;
const OBLIGATION_LEAD = /\b(?:shall|will|may)\s+not\b|\bshall\s+(?:cause|maintain|deliver|furnish|keep|comply|preserve|pay)\b|\bevents? of default\b|\bif any of the following\b|\bno recourse\b/i;

/** "No Loan Party nor any Subsidiary shall …", "No Borrower and no Subsidiary will …" (not "No Loan Party is …", a representation). */
const NO_PARTY_SHALL = /^\s*(?:\([a-z0-9]+\)\s*)?no\s+[^.;]{1,140}?\b(?:shall|will)\b/i;

/** Covenant evidence beyond the family classifier: lead-in obligation/prohibition, or a covenant/default title on the section or an ancestor. */
export function sectionLooksCovenant(tree: SectionTree, text: string, n: SectionTree["nodes"][number]): boolean {
  const lead = text.slice(n.headingEnd, Math.min(n.end, n.headingEnd + 700));
  if (isObligorProhibitionLead(lead) || isProhibitive(lead) || OBLIGATION_LEAD.test(lead) || NO_PARTY_SHALL.test(lead)) return true;
  for (let a: typeof n | undefined = n; a; a = a.parentId ? tree.byId.get(a.parentId) : undefined) {
    if (a.title && COVENANT_TITLE.test(a.title)) return true;
  }
  return false;
}
