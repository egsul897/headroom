/**
 * Deterministic covenant-family candidate discovery (no LLM).
 */

import { createHash } from "node:crypto";
import { classifyFamiliesFromText, isAdministrativeProvision } from "../taxonomy/families";
import { scoreDiscoveryPotential } from "../rank/discovery-score";
import { detectPatternsInText } from "../patterns/library";
import type { CovenantCandidateRecord, KnowledgeTaxonomyFamily, StructuralNodeRecord } from "../types";

/** A dotted-leader page-number line, e.g. "Section 6.01 Limitation on Indebtedness .... 45". */
const TOC_LEADER_LINE = /^\s*(?:Section|§)\s*[\dA-Za-z.()-]+\s+.+\.{3,}\s*\d+\s*$/m;
/** A bare TOC entry: "6.05 Limitation on Liens 58" or "VII. Limitation on Indebtedness 35" — ref + title + page number, no "Section", no dotted leader. */
const TOC_BARE_ENTRY =
  /^\s*(?:\d+(?:\.\d+)+(?:\([a-z0-9]+\))?|M{0,4}(?:C[MD]|D?C{0,3})(?:X[CL]|L?X{0,3})(?:I[XV]|V?I{0,3})\.?)\s+[A-Za-z].*\S\s+\d+\s*$/;
const OPERATIVE_VERB = /\b(?:shall|will|must|may)\b/i;

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

/**
 * One candidate per section ref. A section legitimately appears twice in a
 * document — once in the table of contents, once in the body — and the
 * structural parser emits a node for each. Without dedup the same section
 * (e.g. §6.01) surfaces twice with different excerpts. Keep the strongest
 * candidate (highest discovery score, then longest excerpt). Distinct
 * subsections keep distinct refs ("6.01(1)" vs "6.01(2)") and are untouched.
 */
function dedupBySectionRef(
  candidates: CovenantCandidateRecord[],
  nodesById: Map<string, StructuralNodeRecord>,
): CovenantCandidateRecord[] {
  const bestByKey = new Map<string, CovenantCandidateRecord>();
  const out: CovenantCandidateRecord[] = [];
  for (const c of candidates) {
    const ref = c.nodeId ? nodesById.get(c.nodeId)?.sectionRef : undefined;
    const key = ref ? dedupKeyFor(ref) : null;
    if (!key) {
      out.push(c);
      continue;
    }
    const prev = bestByKey.get(key);
    if (!prev) {
      bestByKey.set(key, c);
      out.push(c);
      continue;
    }
    const prevScore = prev.discoveryScore;
    const nextScore = c.discoveryScore;
    if (
      nextScore > prevScore ||
      (nextScore === prevScore && c.excerpt.length > prev.excerpt.length)
    ) {
      bestByKey.set(key, c);
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
  // Sparse structure: take at least 2.5k chars of body beyond the heading span.
  return {
    start,
    end: Math.min(textLen, Math.max(node.charEnd, node.charStart + 2500)),
  };
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

  for (const node of sectionNodes) {
    const span = operativeSpan(node, sectionNodes, text.length);
    const excerpt = text.slice(span.start, Math.min(span.end, span.start + 4000));
    // TOC entries and administrative provisions are not covenant candidates,
    // even though their headings name covenant families.
    if (isTableOfContentsSpan(node, excerpt, text)) continue;
    if (isAdministrativeProvision(node.heading, excerpt)) continue;
    const families = classifyFamiliesFromText(excerpt, node.heading);
    if (families.length === 1 && families[0] === "UNKNOWN") {
      // Keep UNKNOWN only when heading still looks covenant-relevant.
      if (!/\b(?:Indebtedness|Lien|Restricted|Investment|Disposition|Affiliate|Covenant|Default|Guarantee|Subsidiary|Prepayment|Incremental|Available Amount|Sale|Fundamental)\b/i.test(node.heading + excerpt.slice(0, 400))) {
        continue;
      }
    }
    const rank = scoreDiscoveryPotential(excerpt, node.heading);
    if (rank.score < 2 && families[0] === "UNKNOWN") continue;
    const mergedFamilies = uniqueFamilies([...families, ...rank.families]);
    out.push({
      candidateId: candidateId(sourceId, node.nodeId),
      sourceId,
      nodeId: node.nodeId,
      families: mergedFamilies,
      signals: [...rank.signals, ...detectPatternsInText(excerpt).map((p) => `pattern:${p}`)],
      excerpt: excerpt.slice(0, 1600),
      representationLevel: "DISCOVERED_CANDIDATE",
      discoveryScore: rank.score,
    });
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
  return out.length ? out : ["UNKNOWN"];
}

function candidateId(sourceId: string, nodeId: string): string {
  return createHash("sha256").update(`${sourceId}|${nodeId}`).digest("hex").slice(0, 24);
}
