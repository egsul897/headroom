/**
 * Canonical body-anchor selection for duplicate sectionRef occurrences.
 *
 * Authentic EDGAR packages routinely emit the same legal reference twice:
 * once as a table-of-contents / page-furniture stub and once as the
 * operative provision body. Phase 2A's StructuralIndex correctly preserves
 * both (AMBIGUOUS via resolveUniqueNodeByRef) and never silently picks.
 *
 * This module is the generalized disambiguator for callers that need the
 * operative body: it ranks occurrences using source structure, location,
 * hierarchy, and document evidence — never issuer-specific selectors,
 * never first-match emission order. Every rejected candidate is retained
 * as ambiguity evidence.
 */
import type { StructuralIndex } from "../structural-index";
import type { StructuralNode } from "../types";

const TOC_LEADER_RE = /\.{3,}\s*\d+\s*$/;
const PAGE_FURNITURE_RE = /^\s*(?:page\s+\d+(?:\s+of\s+\d+)?|\d+\s+of\s+\d+|[-–—]\s*\d+\s*[-–—])\s*$/im;
const COVENANT_BODY_SIGNAL =
  /\b(?:shall\s+not|will\s+not|may\s+not|agrees?\s+not\s+to|permits?\s+to\s+exist|incur|create|assume|suffer\s+to\s+exist|provided\s+that|notwithstanding|in\s+the\s+aggregate|Permitted\s+\w+|Consolidated\s+\w+)\b/i;
const DOLLAR_OR_PCT = /(?:\$\s*[\d,]+|\b\d+(?:\.\d+)?\s*%|\bpercent\b)/i;
const DEFINITIONS_HEADING = /\bDefined\s+Terms\b|\bCertain\s+Definitions\b|\bDefinitions\b/i;

export type BodyAnchorConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type BodyAnchorClassification = "OPERATIVE_BODY" | "TOC_OR_FURNITURE" | "AMBIGUOUS_DUPLICATE" | "UNIQUE" | "NOT_FOUND";

export interface BodyAnchorCandidateEvidence {
  nodeId: string;
  sectionRef: string;
  charStart: number;
  charEnd: number;
  ownTextLength: number;
  descendantsTextLength: number;
  gapToNextSection: number;
  classification: BodyAnchorClassification;
  score: number;
  signals: string[];
}

export interface CanonicalBodyAnchorResolution {
  status: "UNIQUE" | "SELECTED_BODY" | "AMBIGUOUS" | "NOT_FOUND";
  selected: StructuralNode | null;
  confidence: BodyAnchorConfidence;
  reason: string;
  candidates: BodyAnchorCandidateEvidence[];
  /** True when more than one physical occurrence shared the legal reference. */
  hadDuplicates: boolean;
  /** True when a TOC/furniture stub was distinguished from a longer body. */
  tocCollisionResolved: boolean;
}

function normalizeRef(ref: string): string {
  return ref.replace(/\s+/g, "").replace(/^§/, "").replace(/^Sections?/i, "");
}

function gapToNextSection(index: StructuralIndex, node: StructuralNode): number {
  const sections = index
    .allNodes()
    .filter((n) => n.documentId === node.documentId && n.nodeType === "SECTION" && n.charStart > node.charStart)
    .sort((a, b) => a.charStart - b.charStart);
  const next = sections[0];
  return (next?.charStart ?? node.charEnd) - node.charStart;
}

function classifyOccurrence(index: StructuralIndex, node: StructuralNode): { classification: BodyAnchorClassification; score: number; signals: string[] } {
  const own = index.getNodeText(node.nodeId, "OWN");
  const descendants = index.getNodeText(node.nodeId, "DESCENDANTS");
  const ownLen = own.trim().length;
  const descLen = descendants.trim().length;
  const gap = gapToNextSection(index, node);
  const signals: string[] = [];
  let score = 0;

  const tocLike =
    TOC_LEADER_RE.test(own.trim()) ||
    PAGE_FURNITURE_RE.test(own.trim()) ||
    (ownLen > 0 && ownLen < 120 && descLen < 200 && !COVENANT_BODY_SIGNAL.test(descendants) && !DOLLAR_OR_PCT.test(descendants));

  if (tocLike) {
    signals.push("TOC_OR_PAGE_FURNITURE");
    score -= 100;
  }
  if (descLen >= 400) {
    signals.push("LONG_DESCENDANTS_SPAN");
    score += Math.min(40, Math.floor(descLen / 250));
  }
  if (gap >= 800) {
    signals.push("LARGE_GAP_TO_NEXT_SECTION");
    score += Math.min(30, Math.floor(gap / 1000));
  }
  if (COVENANT_BODY_SIGNAL.test(descendants)) {
    signals.push("COVENANT_OPERATIVE_LANGUAGE");
    score += 25;
  }
  if (DOLLAR_OR_PCT.test(descendants)) {
    signals.push("ECONOMIC_FIGURE");
    score += 15;
  }
  if (DEFINITIONS_HEADING.test(own) || DEFINITIONS_HEADING.test(descendants.slice(0, 200))) {
    signals.push("DEFINITIONS_SECTION_HEADING");
    score += 10;
  }
  // Prefer later document position when scores tie — TOC stubs precede body in EDGAR HTML.
  score += Math.min(5, Math.floor(node.charStart / 200_000));

  const classification: BodyAnchorClassification = tocLike ? "TOC_OR_FURNITURE" : descLen >= 200 || score >= 20 ? "OPERATIVE_BODY" : "AMBIGUOUS_DUPLICATE";
  return { classification, score, signals };
}

/**
 * Rank every physical SECTION (or matching nodeType) occurrence of a legal
 * reference and select the operative body when TOC/furniture can be
 * distinguished. Preserves all candidates as evidence — never first-match.
 */
export function resolveCanonicalBodyAnchor(
  index: StructuralIndex,
  documentId: string,
  sectionRef: string,
  options?: { preferNodeIds?: ReadonlySet<string> },
): CanonicalBodyAnchorResolution {
  const normalized = normalizeRef(sectionRef);
  const matches = index
    .findNodesByRef(documentId, sectionRef)
    .filter((n) => n.nodeType === "SECTION" || normalizeRef(n.sectionRef) === normalized);

  if (matches.length === 0) {
    return {
      status: "NOT_FOUND",
      selected: null,
      confidence: "NONE",
      reason: `No structural node matches legal reference "${sectionRef}" in ${documentId}.`,
      candidates: [],
      hadDuplicates: false,
      tocCollisionResolved: false,
    };
  }

  const candidates: BodyAnchorCandidateEvidence[] = matches.map((node) => {
    const own = index.getNodeText(node.nodeId, "OWN");
    const descendants = index.getNodeText(node.nodeId, "DESCENDANTS");
    const ranked = classifyOccurrence(index, node);
    let score = ranked.score;
    if (options?.preferNodeIds?.has(node.nodeId)) {
      score += 50;
      ranked.signals.push("PREFERRED_OCCURRENCE");
    }
    return {
      nodeId: node.nodeId,
      sectionRef: node.sectionRef,
      charStart: node.charStart,
      charEnd: node.charEnd,
      ownTextLength: own.trim().length,
      descendantsTextLength: descendants.trim().length,
      gapToNextSection: gapToNextSection(index, node),
      classification: ranked.classification,
      score,
      signals: ranked.signals,
    };
  });

  candidates.sort((a, b) => b.score - a.score || b.descendantsTextLength - a.descendantsTextLength || b.charStart - a.charStart);

  if (matches.length === 1) {
    const only = matches[0]!;
    return {
      status: "UNIQUE",
      selected: only,
      confidence: "HIGH",
      reason: `Unique physical occurrence of "${sectionRef}".`,
      candidates: candidates.map((c) => ({ ...c, classification: "UNIQUE" })),
      hadDuplicates: false,
      tocCollisionResolved: false,
    };
  }

  const best = candidates[0]!;
  const second = candidates[1]!;
  const bestNode = matches.find((m) => m.nodeId === best.nodeId) ?? null;
  const tocPresent = candidates.some((c) => c.classification === "TOC_OR_FURNITURE");
  const bodyPresent = candidates.some((c) => c.classification === "OPERATIVE_BODY");
  const clearSeparation = best.score >= second.score + 15 || (tocPresent && bodyPresent && best.classification === "OPERATIVE_BODY");

  if (clearSeparation && bestNode && best.classification !== "TOC_OR_FURNITURE") {
    return {
      status: "SELECTED_BODY",
      selected: bestNode,
      confidence: tocPresent && bodyPresent ? "HIGH" : best.score >= second.score + 25 ? "HIGH" : "MEDIUM",
      reason: `Selected operative body occurrence of "${sectionRef}" (node ${best.nodeId}) over ${matches.length - 1} duplicate(s) using structure/length/covenant signals; TOC/furniture candidates preserved as evidence.`,
      candidates,
      hadDuplicates: true,
      tocCollisionResolved: tocPresent && bodyPresent,
    };
  }

  return {
    status: "AMBIGUOUS",
    selected: null,
    confidence: "NONE",
    reason: `${matches.length} physical occurrences of "${sectionRef}" could not be distinguished into TOC stub vs operative body with sufficient confidence.`,
    candidates,
    hadDuplicates: true,
    tocCollisionResolved: false,
  };
}

/** True when a SECTION node's own span looks like a packed definitions article (many defined-term declarations). */
export function isDefinitionsSectionNode(index: StructuralIndex, nodeId: string): boolean {
  const node = index.getNodeById(nodeId);
  if (!node || node.nodeType !== "SECTION") return false;
  const own = index.getNodeText(nodeId, "OWN");
  if (DEFINITIONS_HEADING.test(own)) return true;
  const defs = index
    .allDefinitions()
    .filter((d) => d.documentId === node.documentId && d.charStart >= node.charStart && d.charStart < node.charEnd && !d.nested);
  const descLen = index.getNodeText(nodeId, "DESCENDANTS").length;
  return defs.length >= 8 && descLen >= 20_000;
}

/**
 * Extract defined-term focus hints from a discovery candidate without any
 * issuer-specific vocabulary. Accepts evidenceSignals of the form
 * `DEFINED_TERM:<Exact Term>`, quoted terms in description/citation, and
 * "Definition of X" phrasing.
 */
export function extractDefinedTermHints(input: {
  evidenceSignals?: readonly string[];
  description?: string;
  sourceCitation?: string;
  normalizedSourceRef?: string;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const term = raw.trim().replace(/^["“]|["”]$/g, "");
    if (term.length < 2 || term.length > 120) return;
    const key = term.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(term);
  };
  for (const signal of input.evidenceSignals ?? []) {
    const m = /^DEFINED_TERM:\s*(.+)$/i.exec(signal.trim());
    if (m) push(m[1]!);
  }
  const blob = `${input.description ?? ""}\n${input.sourceCitation ?? ""}`;
  for (const m of blob.matchAll(/Definition of\s+["“]?([^"”\n,]{2,80})["”]?/gi)) push(m[1]!);
  for (const m of blob.matchAll(/["“]([^"”]{2,80})["”]\s*(?:means|shall\s+mean)/gi)) push(m[1]!);
  return out;
}

/**
 * When the candidate is anchored on a definitions dump, return the bounded
 * definition-unit text for the first resolvable hint. Never invents a term.
 */
export function narrowDefinitionsSectionOperativeText(
  index: StructuralIndex,
  documentId: string,
  nodeId: string,
  termHints: readonly string[],
): { term: string; text: string } | null {
  if (termHints.length === 0) return null;
  if (!isDefinitionsSectionNode(index, nodeId)) return null;
  for (const hint of termHints) {
    const full = index.getDefinitionFullText(hint, documentId);
    if (full && full.trim().length > 0) return { term: hint, text: full };
    // Case-insensitive scan of declared terms for a near-exact label match.
    const declared = index.allDefinitions().find((d) => d.documentId === documentId && d.normalizedTerm === hint.toLowerCase());
    if (declared) {
      const text = index.getDefinitionFullText(declared.exactTerm, documentId);
      if (text && text.trim().length > 0) return { term: declared.exactTerm, text };
    }
  }
  return null;
}
