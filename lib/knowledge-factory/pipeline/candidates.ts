/**
 * Deterministic covenant-family candidate discovery (no LLM).
 */

import { createHash } from "node:crypto";
import { classifyFamiliesFromText, isAdministrativeProvision, stripCatchAllFallback } from "../taxonomy/families";
import { scoreDiscoveryPotential } from "../rank/discovery-score";
import { detectPatternsInText } from "../patterns/library";
import type { CovenantCandidateRecord, KnowledgeTaxonomyFamily, StructuralNodeRecord } from "../types";

/** A dotted-leader page-number line, e.g. "Section 6.01 Limitation on Indebtedness .... 45". */
const TOC_LEADER_LINE = /^\s*(?:Section|§)\s*[\dA-Za-z.()-]+\s+.+\.{3,}\s*\d+\s*$/m;
/** A bare TOC entry: "6.05 Limitation on Liens 58" or "VII. Limitation on Indebtedness 35" — ref + title + page number, no "Section", no dotted leader. */
const TOC_BARE_ENTRY =
  /^\s*(?:\d+(?:\.\d+)+(?:\([a-z0-9]+\))?|M{0,4}(?:C[MD]|D?C{0,3})(?:X[CL]|L?X{0,3})(?:I[XV]|V?I{0,3})\.?)\s+[A-Za-z].*\S\s+(?:\d+|[ivxlcdm]{2,})\s*$/;
/**
 * Rule 163: Section-prefixed bare TOC entry — "Section 6.01. Limitation
 * on Indebtedness 109". EDGAR HTML puts the ref, title, and page
 * number on separate lines, so the line-based patterns above never see
 * this shape; it is matched against whitespace-collapsed span text.
 * Rule 172: the trailing page token may be a lowercase roman numeral
 * (front matter) — "Section 7.01. Events of Default 119 iii" — or a
 * bare roman page ("Section 6.01. Indebtedness iii"). Lowercase-only
 * and 2+ chars so "Part II" / "Civil" can never match.
 */
const TOC_SECTION_ENTRY = /^\s*(?:Section|§)\s*[\dA-Za-z.()-]+\s+[A-Za-z].*\S\s+(?:\d+|[ivxlcdm]{2,})\s*$/;
/**
 * Rule 163: article-level bare TOC entry — "ARTICLE IV Conditions
 * Precedent 45". Same multi-line EDGAR shape as TOC_SECTION_ENTRY,
 * one level up; body article headings carry no trailing page number.
 */
const TOC_ARTICLE_ENTRY = /^\s*ARTICLE\s+[IVXLC]+\s+[A-Za-z].*\S\s+(?:\d+|[ivxlcdm]{2,})\s*$/i;
/**
 * Rule 163: one entry inside a TOC list — "5.1. Corporate Existence
 * and Standing 48". Titles stop at a period or semicolon so the
 * pattern cannot span body sentences; cross-reference pairs like
 * "Sections 5.6 and 5.18" may fake one entry, never three.
 */
const TOC_LIST_ENTRY =
  /(?:(?:Section|§|ARTICLE)\s+)?(?:\d+(?:\.\d+)*\.?|[IVXLC]+\.?)\s+[A-Za-z][^.;]{1,80}?\s+(?:\d+|[ivxlcdm]{2,})(?=\s|$)/gi;
const OPERATIVE_VERB = /\b(?:shall|will|must|may)\b/i;

/**
 * Rule 164: covenant-relevance gate for UNKNOWN-family candidates.
 * Headings use plural forms, so every keyword matches its plural;
 * "Subsidiary" needs the y/ies alternation ("Subsidiaries" is not
 * "Subsidiary" + "s"). "Guarantor" is included alongside
 * "Guarantee" — guaranty articles are covenant-relevant.
 * Rule 173: facility/capacity terms are operative financial content
 * too. An amendment that restates the "Revolver Commitment"
 * definition, resets "Availability" tests, or fixes a "Swingline
 * Sublimit" at $42.5M carries the numbers capacity is computed
 * from — dropping it because no covenant keyword appears leaves
 * the whole amendment invisible (the real Calumet amendment
 * surfaced exactly one item, by luck of a "Guarantor" mention).
 * "Borrowing Base" is a capacity input by definition. These terms
 * admit the item as an informational summary item; they do not
 * mint grants (grant-types.ts still requires permission evidence).
 * Rule 175: operative amendment phrasing — "hereby amended" /
 * "amended and restated" — admits the amendment that actually
 * changes terms (the real Expand amendment's §2.1 + §2(a) extend
 * the Maturity Date to 2031; both were invisible). Bare
 * "Amendment" is deliberately NOT a keyword: a base agreement's
 * "Amendments; Waivers" section ("may not be amended except by
 * ...") is procedural, not operative, and stays out.
 */
const COVENANT_HEADING_KEYWORDS =
  /\b(?:Indebtedness|Lien|Restricted|Investment|Disposition|Affiliate|Covenant|Default|Guarantee|Guarantor|Prepayment|Incremental|Available Amount|Sale|Fundamental|Commitment|Availability|Sublimit|Borrowing Base)s?\b|\bSubsidiar(?:y|ies)\b|\b(?:hereby amended|amended and restated)\b/i;

/**
 * True when a node's span is table-of-contents material, not operative
 * covenant text: the span is (or sits inside) the TOC, or the span itself
 * is a TOC entry line (heading + dotted leader + page number, or bare
 * ref + title + page number) with no operative sentence. Body sections
 * carry operative verbs; TOC lines never do. Body headings never end in
 * a bare page number, and TOC lines never end in a period.
 */
function isTableOfContentsSpan(
  node: StructuralNodeRecord,
  spanText: string,
  fullText: string,
): boolean {
  if (/table of contents/i.test(node.heading)) return true;
  const own = fullText.slice(node.charStart, node.charEnd);
  if (TOC_LEADER_LINE.test(own)) return true;
  if (isBareTocLine(own)) return true;
  if (TOC_LEADER_LINE.test(spanText) && !OPERATIVE_VERB.test(spanText)) return true;
  if (!OPERATIVE_VERB.test(spanText)) {
    for (const line of spanText.split("\n")) {
      if (isBareTocLine(line)) return true;
    }
  }
  // Rule 163: EDGAR HTML splits one TOC entry across lines — ref,
  // title, and page number on separate lines ("Section 6.01.\n
  // Indebtedness\n109") — so no single line matches the patterns
  // above and the TOC node survives as a duplicate of the body
  // section (same sectionRef, different excerpt, so dedup keeps
  // both). Collapse the span and test the entry shape. The length
  // cap + verb guard keep body sections out: operative spans are
  // long and verb-bearing; only a short, verb-less "ref + title +
  // page number" span is a TOC entry.
  const collapsedSpan = spanText.replace(/\s+/g, " ").trim();
  if (
    collapsedSpan.length > 0 &&
    collapsedSpan.length <= 300 &&
    !OPERATIVE_VERB.test(collapsedSpan) &&
    (TOC_SECTION_ENTRY.test(collapsedSpan) ||
      TOC_ARTICLE_ENTRY.test(collapsedSpan) ||
      TOC_BARE_ENTRY.test(collapsedSpan))
  ) {
    return true;
  }
  // Rule 163 (TOC lists): an article-level TOC block enumerates
  // many "ref + title + page" entries in one span (e.g. "Article V
  // ... 48 5.1. Corporate Existence ... 48 5.2. ... 49"), so the
  // single-entry shape above misses it. Count entries instead: a
  // span with three or more list entries and no operative verb is
  // a TOC block, not operative text. Body excerpts are excluded by
  // the verb guard and by the entry shape (titles stop at sentence
  // periods, so cross-reference pairs cannot fake three entries).
  if (!OPERATIVE_VERB.test(spanText)) {
    const entries = collapsedSpan.match(TOC_LIST_ENTRY);
    if (entries && entries.length >= 3) return true;
  }
  return false;
}

function isBareTocLine(line: string): boolean {
  const trimmed = line.trimEnd();
  if (trimmed.endsWith(".")) return false;
  if (OPERATIVE_VERB.test(line)) return false;
  return TOC_BARE_ENTRY.test(line);
}

/** Real section refs start with a digit; "AMBIGUOUS" must never dedup-collapse. */
function dedupKeyFor(sectionRef: string): string | null {
  const norm = sectionRef.trim();
  if (!/^\d/.test(norm) || norm.toUpperCase() === "AMBIGUOUS") return null;
  return norm;
}

/** True when two excerpts are the same text (or one contains the other) — a parser re-emit, not a different version. */
function isDuplicateExcerpt(a: string, b: string): boolean {
  const na = a.replace(/\s+/g, " ").trim();
  const nb = b.replace(/\s+/g, " ").trim();
  if (!na || !nb) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * One candidate per section ref — but only for TRUE duplicates. A
 * section legitimately appears twice in a document — once in the
 * table of contents, once in the body — and the structural parser
 * emits a node for each. Without dedup the same section (e.g. §6.01)
 * surfaces twice with different excerpts. Keep the strongest
 * candidate (highest discovery score, then longest excerpt) when the
 * excerpts are the same text (or one contains the other).
 *
 * The same ref can also carry DIFFERENT text in one document — e.g. a
 * single PDF holding both a base agreement and an amendment that
 * restates §6.01 with a new cap. Those are different versions, not
 * duplicates: collapsing them silently dropped one version's baskets.
 * Distinct subsections keep distinct refs ("6.01(1)" vs "6.01(2)")
 * and are untouched.
 */
function dedupBySectionRef(
  candidates: CovenantCandidateRecord[],
  nodesById: Map<string, StructuralNodeRecord>,
): CovenantCandidateRecord[] {
  const keptByKey = new Map<string, CovenantCandidateRecord[]>();
  const out: CovenantCandidateRecord[] = [];
  for (const c of candidates) {
    const ref = c.nodeId ? nodesById.get(c.nodeId)?.sectionRef : undefined;
    const key = ref ? dedupKeyFor(ref) : null;
    if (!key) {
      out.push(c);
      continue;
    }
    const kept = keptByKey.get(key) ?? [];
    const dupIdx = kept.findIndex((k) => isDuplicateExcerpt(k.excerpt, c.excerpt));
    if (dupIdx === -1) {
      kept.push(c);
      keptByKey.set(key, kept);
      out.push(c);
      continue;
    }
    const prev = kept[dupIdx]!;
    const prevScore = prev.discoveryScore;
    const nextScore = c.discoveryScore;
    if (
      nextScore > prevScore ||
      (nextScore === prevScore && c.excerpt.length > prev.excerpt.length)
    ) {
      kept[dupIdx] = c;
      out[out.indexOf(prev)] = c;
    }
  }
  return out;
}
function operativeSpan(
  node: StructuralNodeRecord,
  sectionNodes: StructuralNodeRecord[],
  textLen: number,
): { start: number; end: number } {
  const start = node.charStart;
  const later = sectionNodes
    .filter((n) => n.charStart > node.charStart)
    .sort((a, b) => a.charStart - b.charStart);
  const nextStart = later[0]?.charStart;
  // Stop strictly before the next section heading so bodies do not bleed.
  if (nextStart != null && nextStart > start) {
    return { start, end: Math.min(textLen, nextStart) };
  }
  // Sparse structure: take at least 4k chars of body beyond the heading span,
  // matching the section-span cap in discoverCovenantCandidates.
  return {
    start,
    end: Math.min(textLen, Math.max(node.charEnd, node.charStart + 4000)),
  };
}

/**
 * Rule 174: parent ref of a nested clause — strip the last
 * parenthesized group: "1(c)(a)" -> "1(c)", "1(c)" -> "1",
 * "6.01(e)" -> "6.01". Refs without a paren group ("6.01", "VII")
 * have no parent in this scheme and always get their own chance.
 */
function parentRefOf(sectionRef: string): string | null {
  const m = /\(([^()]*)\)$/.exec(sectionRef.trim());
  if (!m) return null;
  const parent = sectionRef.trim().slice(0, sectionRef.trim().length - m[0].length);
  return parent || null;
}

export function discoverCovenantCandidates(
  sourceId: string,
  text: string,
  nodes: StructuralNodeRecord[],
): CovenantCandidateRecord[] {
  const out: CovenantCandidateRecord[] = [];
  // Include ambiguous section candidates when they carry a usable sectionRef —
  // curated/HTML exhibits often triage headings as ambiguous while still
  // providing source-backed spans suitable for discovery (not verification).
  const sectionNodes = nodes
    .filter(
      (n) =>
        (n.nodeType === "SECTION" || n.nodeType === "ARTICLE" || n.nodeType === "SUBSECTION") &&
        (!n.ambiguous || /^[\dA-Za-z.()-]+$/.test(n.sectionRef)),
    )
    .sort((a, b) => a.charStart - b.charStart);
  // Rule 174: clause fallback (see parentRefOf). A subsection that is
  // only a pointer ("Schedule 1.1A is hereby amended ... as set forth
  // on Annex A") carries no substance itself, but its clause children
  // may ("Availability tests ...", "Swingline Sublimit ... $42.5M").
  // Without the fallback the whole subtree vanishes (the real
  // Calumet amendment lost its availability + sublimit clauses).
  const allSorted = [...nodes].sort((a, b) => a.charStart - b.charStart);
  const coveredRefs = new Set<string>();
  const clauseNodes = nodes
    .filter(
      (n) =>
        (n.nodeType === "CLAUSE" || n.nodeType === "SUBCLAUSE") &&
        (!n.ambiguous || /^[\dA-Za-z.()-]+$/.test(n.sectionRef)),
    )
    .sort((a, b) => a.charStart - b.charStart);
  // Process parents before children (SECTION/ARTICLE/SUBSECTION, then
  // CLAUSE, then SUBCLAUSE) so a covered parent suppresses its clauses
  // and a clause that survives covers its own subclauses.
  const orderedNodes: { node: (typeof nodes)[number]; spanNodes: (typeof nodes)[number][] }[] = [
    ...sectionNodes.map((node) => ({ node, spanNodes: sectionNodes })),
    ...clauseNodes
      .filter((n) => n.nodeType === "CLAUSE")
      .map((node) => ({ node, spanNodes: allSorted })),
    ...clauseNodes
      .filter((n) => n.nodeType === "SUBCLAUSE")
      .map((node) => ({ node, spanNodes: allSorted })),
  ];

  for (const { node, spanNodes } of orderedNodes) {
    // Clause fallback (CLAUSE/SUBCLAUSE nodes only): skip when the
    // parent already produced a candidate — the parent's excerpt
    // covers this content. When the parent produced nothing (pointer
    // subsection), the clause gets its own chance through the same
    // gates below. SECTION/ARTICLE/SUBSECTION nodes are never
    // skipped here: a section and its subsection are distinct
    // content (a §6.01 candidate must not suppress §6.01(e)).
    if (node.nodeType === "CLAUSE" || node.nodeType === "SUBCLAUSE") {
      const parent = parentRefOf(node.sectionRef);
      if (parent && coveredRefs.has(parent)) continue;
    }
    const span = operativeSpan(node, spanNodes, text.length);
    const excerpt = text.slice(span.start, Math.min(span.end, span.start + 4000));
    // TOC entries and administrative provisions are not covenant candidates,
    // even though their headings name covenant families.
    if (isTableOfContentsSpan(node, excerpt, text)) continue;
    if (isAdministrativeProvision(node.heading, excerpt)) continue;
    const families = classifyFamiliesFromText(excerpt, node.heading);
    if (families.length === 1 && families[0] === "UNKNOWN") {
      // Keep UNKNOWN only when heading still looks covenant-relevant.
      // Rule 164: headings use PLURAL forms — "COVENANTS",
      // "Guarantees", "Subsidiaries". A singular-only \b…\b gate
      // dropped the entire Article VI of a real credit agreement
      // (heading "ARTICLE VI COVENANTS", excerpt "…its
      // Subsidiaries…") while the TOC artifact for the same article
      // passed via "Notice of Default" in the TOC listing.
      if (!COVENANT_HEADING_KEYWORDS.test(node.heading + excerpt.slice(0, 400))) {
        continue;
      }
    }
    const rank = scoreDiscoveryPotential(excerpt, node.heading);
    if (rank.score < 2 && families[0] === "UNKNOWN") continue;
    const mergedFamilies = uniqueFamilies([...families, ...rank.families]);
    // Excerpt cap matches the 4000-char section span: basket/cap
    // extraction runs on this excerpt, so a tighter cap silently
    // dropped caps living late in a long section (rule 11). Display
    // excerpts are clipped separately downstream (700 chars).
    out.push({
      candidateId: candidateId(sourceId, node.nodeId),
      sourceId,
      nodeId: node.nodeId,
      families: mergedFamilies,
      signals: [...rank.signals, ...detectPatternsInText(excerpt).map((p) => `pattern:${p}`)],
      excerpt: excerpt.slice(0, 4000),
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: rank.score,
    });
    coveredRefs.add(node.sectionRef);
  }

  // Document-level fallback when structure is sparse but text is rich.
  if (out.length === 0 && text.length > 2000) {
    const rank = scoreDiscoveryPotential(text.slice(0, 100_000));
    if (rank.score >= 6) {
      out.push({
        candidateId: candidateId(sourceId, "document-fallback"),
        sourceId,
        families: rank.families.length ? rank.families : ["UNKNOWN"],
        signals: [...rank.signals, "sparse_structure_document_fallback"],
        excerpt: text.slice(0, 800),
        representationLevel: "DISCOVERED_CANDIDATE",
        discoveryScore: rank.score,
      });
    }
  }

  return dedupBySectionRef(out, new Map(nodes.map((n) => [n.nodeId, n])));
}

function uniqueFamilies(families: KnowledgeTaxonomyFamily[]): KnowledgeTaxonomyFamily[] {
  const seen = new Set<KnowledgeTaxonomyFamily>();
  const out: KnowledgeTaxonomyFamily[] = [];
  for (const f of families) {
    if (seen.has(f)) continue;
    seen.add(f);
    out.push(f);
  }
  // Rule 155: the discovery ranker re-injects GENERAL_CONDITIONS_AND_EXCEPTIONS
  // via generic signals (bare "Section X.Y", "Negative Covenants" heading),
  // so the merged classifier+ranker list gets the same fallback treatment.
  const stripped = stripCatchAllFallback(out);
  return stripped.length ? stripped : ["UNKNOWN"];
}

function candidateId(sourceId: string, nodeId: string): string {
  return createHash("sha256").update(`${sourceId}|${nodeId}`).digest("hex").slice(0, 24);
}
