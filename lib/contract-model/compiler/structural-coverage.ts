/**
 * Phase 2F.1 §6/§7 - structural source-coverage accounting and a
 * truthful, document-level structural health state. Answers the
 * question this task exists to make Headroom able to answer: "how much
 * of this document did the structural parser actually represent?"
 *
 * Deterministic, zero LLM calls, and deliberately generalized (task §7's
 * own "do not use hardcoded document-length thresholds alone" - health
 * is decided from several RELATIVE signals together, never one absolute
 * character-count cutoff by itself).
 *
 * Phase 3F.1.4 (Workstream A - Source Accounting & Coverage Integrity)
 * remediation of finding DISC-01/P0-3 (docs/foundation-assurance/
 * 05-discovery-package-context-findings.json): the pre-remediation
 * version of this module defined a top-level node's own "coverage span"
 * as [node.charStart, nextTopLevelNode.charStart ?? textLength) - it
 * NEVER consulted the node's own real charEnd. Any caller that hands
 * this function a StructuralNode[] whose charEnd values are not already
 * perfectly consistent with "the next node's charStart" (a hand-built
 * fixture, a persisted-and-reloaded row, a future parser change, a
 * partial/filtered node list) got a silently, falsely "100% covered"
 * verdict for real, unrepresented text - both for a gap in the MIDDLE of
 * a document and for a gap AFTER the last recognized node (only a
 * LEADING gap, before the first node, was ever actually detectable by
 * that construction). This version instead bounds every top-level node's
 * own claimed span by its REAL charStart/charEnd, so the accounting is
 * correct on its own terms regardless of what invariants its producer
 * happens to maintain elsewhere - the whole point of an INDEPENDENT
 * coverage accounting is that it never assumes what it could instead
 * verify.
 *
 * This module also now detects (task's own Part 2 Q1/Q3 "newAssumptions"
 * findings, docs/foundation-assurance/06-structural-consumer-assurance.json)
 * a SECOND, structurally distinct failure shape that pure span/charEnd
 * accounting can never see: a node's own claimed span containing real
 * evidence it should not (a heading-shaped fragment that never got its
 * own node, a stray run of clause-marker punctuation with no
 * corresponding CLAUSE/SUBSECTION children, or an own-text length wildly
 * out of line with sibling nodes of the same type) - see
 * `computeBoundaryAnomalies` below.
 */
import type { StructuralNode } from "./types";

/** Substantive-text normalization policy (task §6): a character counts toward "substantive" text if it is not whitespace. This is deliberately the simplest defensible, fully reproducible definition - it means a large run of blank lines or page-break padding between real sections is never counted as a coverage gap, while any real prose, heading, or figure always is. */
export function countSubstantiveChars(text: string): number {
  let n = 0;
  for (const ch of text) if (!/\s/.test(ch)) n++;
  return n;
}

export type UncoveredSpanGapKind = "LEADING" | "INTERIOR" | "TRAILING" | "WHOLE_DOCUMENT";

export interface UncoveredSpan {
  charStart: number;
  charEnd: number;
  substantiveChars: number;
  excerpt: string;
  /**
   * Phase 3F.1.4 - which boundary produced this region: LEADING (before the
   * first top-level node's real start), INTERIOR (between one top-level
   * node's real charEnd and the NEXT top-level node's real charStart -
   * the exact shape P0-3 could never see), TRAILING (after the LAST
   * top-level node's real charEnd - also previously invisible), or
   * WHOLE_DOCUMENT (zero top-level nodes recognized anywhere).
   */
  gapKind: UncoveredSpanGapKind;
}

/**
 * Phase 3F.1.4 - a WARNING/SIGNIFICANT-severity signal about a node's own
 * claimed span, independent of whether any text is "uncovered" in the
 * gap-accounting sense above. Never gates a whole document to
 * FAILED/INSUFFICIENT by itself (task's own "long sections are sometimes
 * legitimate" instruction) - see classifyHealth for how SIGNIFICANT
 * anomalies factor into the overall health verdict (never above PARTIAL),
 * and coverage-audit/pipeline.ts for how SIGNIFICANT anomalies are ALSO
 * routed to the independent raw-source-fallback scanner (never merely
 * recorded and ignored).
 */
export interface BoundaryAnomalyFinding {
  code: "EMBEDDED_HEADING_LIKE_FRAGMENT" | "SIGNAL_DENSITY_SHIFT" | "OWN_TEXT_LENGTH_OUTLIER";
  /** SIGNIFICANT = real, actionable evidence a node's own boundary is probably wrong (routed to raw-source-fallback, contributes to health downgrade). WARNING = worth surfacing, never actionable/gating on its own (task's explicit instruction for the own-text-length-outlier heuristic; extended here to a low-confidence density/fragment match too). */
  severity: "SIGNIFICANT" | "WARNING";
  documentId: string;
  nodeId: string;
  nodeType: StructuralNode["nodeType"];
  message: string;
  /** The specific region within the node's own claimed text that triggered this finding - never the node's whole subtree span, which would grossly over-scan if routed to a raw-text scanner. */
  span: { charStart: number; charEnd: number; substantiveChars: number; excerpt: string };
}

export type StructuralHealthState = "STRUCTURE_HEALTHY" | "STRUCTURE_PARTIAL" | "STRUCTURE_INSUFFICIENT" | "STRUCTURE_FAILED";

export interface StructuralCoverageResult {
  documentId: string;
  totalChars: number;
  totalSubstantiveChars: number;
  coveredSubstantiveChars: number;
  uncoveredSubstantiveChars: number;
  /** 0-100, rounded to 2 decimals. 0 when totalSubstantiveChars is 0 (an empty document is never reported as 100% covered by vacuous truth). */
  coveragePercent: number;
  /** Only uncovered spans whose own substantive-char count clears MIN_SIGNIFICANT_UNCOVERED_CHARS - task §6's "do not simply count whitespace... as coverage gaps," extended to also exclude trivially small non-whitespace gaps (a single stray character between two nodes is not a "significant uncovered span"). */
  significantUncoveredSpans: UncoveredSpan[];
  /** Phase 3F.1.4 - see BoundaryAnomalyFinding. Never empty-by-construction the way a "healthy" document's significantUncoveredSpans legitimately is; a genuinely clean document should also produce zero of these. */
  boundaryAnomalies: BoundaryAnomalyFinding[];
  topLevelNodeCount: number;
  totalNodeCount: number;
  health: StructuralHealthState;
  healthReasons: string[];
}

const MIN_SIGNIFICANT_UNCOVERED_CHARS = 40;

/**
 * Phase 3F.1.4 fix (was `computeTopLevelSpans`): a top-level (ARTICLE or
 * SECTION) node's own coverage span is now its REAL, own [charStart,
 * charEnd) - charEnd already carries the node's full owned span (own text
 * plus every nested descendant, per types.ts's own StructuralNode.charEnd
 * doc-comment), so this is the true "subtree span," never re-derived from
 * a neighboring node's position. Clamped defensively to
 * [0,textLength] and to charEnd>=charStart so a corrupted/hand-built node
 * can never produce a negative-length span or reach past the document's
 * own text.
 */
function computeTopLevelSubtreeSpans(nodes: StructuralNode[], textLength: number): Array<{ start: number; end: number }> {
  const topLevel = nodes.filter((n) => n.nodeType === "ARTICLE" || n.nodeType === "SECTION").sort((a, b) => a.charStart - b.charStart);
  return topLevel.map((n) => {
    const start = Math.max(0, Math.min(n.charStart, textLength));
    const end = Math.max(start, Math.min(n.charEnd, textLength));
    return { start, end };
  });
}

/**
 * Phase 3F.1.4 - walks the REAL top-level subtree spans (sorted, already
 * clamped) and reports every region of the document's own text that no
 * span reaches. Three genuinely distinct shapes now come out of the SAME
 * uniform pass (previously only LEADING was reachable at all):
 *  - LEADING: before the very first top-level span (i===0's own gap).
 *  - INTERIOR: between one span's real end and the NEXT span's real
 *    start (P0-3's exact missing shape - a real ARTICLE/SECTION's worth
 *    of content with zero owning node).
 *  - TRAILING: after the LAST span's real end (P0-3's other missing
 *    shape - a document whose recognized structure stops partway
 *    through the real text).
 *  - WHOLE_DOCUMENT: zero top-level spans at all (unchanged from before -
 *    the pre-existing "zero nodes" case, e.g. CONMED Documents C/D
 *    pre-fix, kept working exactly as it always did).
 * `cursor = Math.max(cursor, s.end)` (rather than `cursor = s.end`)
 * defensively absorbs an overlapping pair of top-level spans (a distinct
 * anomaly in its own right - see structural-index.ts's new
 * SIBLING_SPAN_OVERLAP health check for detecting THAT condition) without
 * ever double-counting or reporting a negative-length gap here.
 */
function computeUncoveredRegions(spans: Array<{ start: number; end: number }>, totalChars: number): Array<{ start: number; end: number; gapKind: UncoveredSpanGapKind }> {
  if (spans.length === 0) {
    return totalChars > 0 ? [{ start: 0, end: totalChars, gapKind: "WHOLE_DOCUMENT" }] : [];
  }
  const regions: Array<{ start: number; end: number; gapKind: UncoveredSpanGapKind }> = [];
  let cursor = 0;
  for (let i = 0; i < spans.length; i++) {
    const s = spans[i]!;
    if (s.start > cursor) regions.push({ start: cursor, end: s.start, gapKind: i === 0 ? "LEADING" : "INTERIOR" });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < totalChars) regions.push({ start: cursor, end: totalChars, gapKind: "TRAILING" });
  return regions;
}

/** A node's own claimed text ends where its first REAL child begins (occurrence-safe: only nodes that actually declare this node as parentNodeId can truncate its own text), or at its own charEnd when it has no children at all - the same "OWN" text-mode semantics structural-index.ts's own getNodeText already exposes, recomputed locally here (deliberately NOT importing structural-index.ts - this module must stay able to reason about ANY StructuralNode[] handed to it directly, including a hand-built/synthetic array with no index built over it at all, exactly as tests/foundation-audit/discovery-fail-closed.test.ts's own tests D/D2/D3 already rely on). */
function computeOwnTextEnds(nodes: StructuralNode[]): Map<string, number> {
  const minChildStartByParentId = new Map<string, number>();
  for (const n of nodes) {
    if (!n.parentNodeId) continue;
    const current = minChildStartByParentId.get(n.parentNodeId);
    if (current === undefined || n.charStart < current) minChildStartByParentId.set(n.parentNodeId, n.charStart);
  }
  const ownEndByNodeId = new Map<string, number>();
  for (const n of nodes) {
    const childStart = minChildStartByParentId.get(n.nodeId);
    ownEndByNodeId.set(n.nodeId, childStart !== undefined ? childStart : n.charEnd);
  }
  return ownEndByNodeId;
}

/**
 * Phase 3F.1.4 - a deliberately PERMISSIVE, read-only mirror of
 * stage-structure.ts's own SECTION_PATTERNS[0]/ARTICLE_PATTERNS[0] heading
 * shape (Section|SECTION|§ or ARTICLE, a number, a short capitalized
 * title) - NOT imported (stage-structure.ts is out of this workstream's
 * assigned-file scope, and this module must stay independently able to
 * evaluate ANY node array, never assuming its own producer's exact regex
 * set). Deliberately MORE permissive than the real parser in one specific,
 * documented way: it accepts a COLON as well as a PERIOD terminating the
 * title (`[.:]`) - the real parser's SECTION_PATTERNS requires a period,
 * so a colon-terminated heading is EXACTLY the real, proven defeat
 * mechanism (docs/foundation-assurance/06-structural-consumer-assurance.json
 * Q1: "Section 6.02: Liens .") that lets a genuine sibling heading fail
 * every real pattern and get silently swallowed into the preceding node's
 * own text - the one shape this detector exists to catch that pure
 * charEnd/span accounting structurally cannot see (the swallowed text is
 * not "uncovered," it is wrongly, but completely, "covered"). A
 * false-negative here (a defeat mechanism this permissive regex still
 * doesn't catch) is safe - it simply produces no anomaly finding, same as
 * before this fix. A false-positive only ever produces one additional
 * SIGNIFICANT finding that gets independently re-scanned by the raw-source
 * fallback scanner (never an autonomous structural change) - bounded,
 * self-correcting risk, not a silent wrong answer.
 *
 * The colon is accepted in BOTH of the two places a real drafting defeat
 * has actually been proven to appear: immediately after the section
 * number (`[.:]?\s+` - the exact Q1 fixture, "Section 6.02: Liens .") and
 * terminating the title (`\s*[.:]`, e.g. "Section 6.02 Liens:"). The
 * `[A-Z]` requirement on the title's first character is kept from the real
 * parser's own design unchanged - it is what correctly keeps an ordinary
 * in-text citation with lowercase sentence continuation ("...permitted
 * under Section 6.06, and...") from ever matching.
 */
const EMBEDDED_HEADING_LIKE = /(?:Section|SECTION|§|ARTICLE)\s+([IVXLC]+|\d+(?:\.\d+)?)[.:]?\s+(\[?[A-Z][A-Za-z ,&';[\]-]{1,90}?\]?)\s*[.:]/g;

/** Lettered/roman clause-marker-shaped tokens, e.g. "(a)", "(iv)" - used only as a coarse density signal (SIGNAL_DENSITY_SHIFT below), never to mint a node. */
const CLAUSE_MARKER_LIKE = /\(([a-z]|[ivxlcdm]{1,4})\)/gi;

const CHILD_NODE_TYPES: ReadonlySet<StructuralNode["nodeType"]> = new Set(["SUBSECTION", "CLAUSE", "SUBCLAUSE"]);
/** Node types this module reasons about for boundary-anomaly purposes - ARTICLE/SECTION/SUBSECTION are all types that a real document could legitimately further decompose (into SECTION/SUBSECTION/CLAUSE respectively); CLAUSE/SUBCLAUSE are bottom-of-hierarchy leaves the parser never subdivides further, so checking them would only add noise. */
const DECOMPOSABLE_NODE_TYPES: ReadonlySet<StructuralNode["nodeType"]> = new Set(["ARTICLE", "SECTION", "SUBSECTION"]);

/** Caps how many EMBEDDED_HEADING_LIKE findings a single node's own text can produce - a defensive bound against a pathological document (e.g. a Table of Contents fragment or a citation-heavy recital) producing an unbounded finding list, never a claim that a real document could not legitimately have more than this many genuinely swallowed siblings. */
const MAX_EMBEDDED_HEADING_FINDINGS_PER_NODE = 5;

/**
 * Phase 3F.1.4, task §7 item 2 - boundary anomaly detection, generalized
 * (not merely a special case for the one audit fixture): reasons about
 * every ARTICLE/SECTION/SUBSECTION node's own claimed text (never its
 * full subtree - a child's own anomalies are evaluated separately, at the
 * child) for three independent signals:
 *  1. EMBEDDED_HEADING_LIKE_FRAGMENT - another plausible heading-shaped
 *     match found strictly AFTER this node's own heading position, inside
 *     text this node claims as its OWN (never a descendant's). Real
 *     evidence a sibling was swallowed (Q1/Q2's mechanism) - SIGNIFICANT.
 *  2. SIGNAL_DENSITY_SHIFT - 1+ clause-marker-shaped tokens ("(a)",
 *     "(ii)", ...) inside a node's own text with ZERO real
 *     SUBSECTION/CLAUSE/SUBCLAUSE children at all - real evidence a
 *     lettered/numbered sub-list exists in the drafting but was never
 *     decomposed into its own nodes (Q5's mechanism, generalized beyond
 *     the ARTICLE-direct-clause fixture to any decomposable node type).
 *     2+ DISTINCT markers is SIGNIFICANT (two-or-more distinct lettered/
 *     numbered clause labels appearing together is real evidence of an
 *     actual enumerated list, exactly Q5's own "(a) ... (b) ..." shape);
 *     a single marker is WARNING only (one stray cross-reference like
 *     "clause (a) above" is common, ordinary prose and must not on its
 *     own force a raw re-scan). Known, accepted trade-off: an ordinary
 *     sentence citing two DIFFERENT lettered clauses together ("as
 *     provided in clause (a) and clause (b)") will also cross this bar -
 *     accepted because the cost of a false positive here is only one
 *     bounded, independently-confirming raw-text re-scan of that node's
 *     own region (never a silent wrong answer, never above
 *     STRUCTURE_PARTIAL), not a rejected document.
 *  3. OWN_TEXT_LENGTH_OUTLIER - a node's own substantive text length is
 *     far larger than the median for its own nodeType among real
 *     siblings-of-type in the same document. Always WARNING (task's own
 *     explicit instruction: "long sections are sometimes legitimate" -
 *     this must never fail a document on its own).
 */
function computeBoundaryAnomalies(documentId: string, text: string, nodes: StructuralNode[]): BoundaryAnomalyFinding[] {
  const findings: BoundaryAnomalyFinding[] = [];
  if (nodes.length === 0) return findings;

  const ownTextEndByNodeId = computeOwnTextEnds(nodes);
  const childCountByParentId = new Map<string, number>();
  for (const n of nodes) {
    if (!n.parentNodeId || !CHILD_NODE_TYPES.has(n.nodeType)) continue;
    childCountByParentId.set(n.parentNodeId, (childCountByParentId.get(n.parentNodeId) ?? 0) + 1);
  }

  const ownLengthsByType = new Map<StructuralNode["nodeType"], number[]>();

  for (const node of nodes) {
    if (!DECOMPOSABLE_NODE_TYPES.has(node.nodeType)) continue;
    const ownEnd = ownTextEndByNodeId.get(node.nodeId) ?? node.charEnd;
    const ownStart = node.charStart;
    if (ownEnd <= ownStart) continue;
    const ownText = text.slice(ownStart, ownEnd);
    const ownSubstantiveLength = countSubstantiveChars(ownText);
    const lengths = ownLengthsByType.get(node.nodeType) ?? [];
    lengths.push(ownSubstantiveLength);
    ownLengthsByType.set(node.nodeType, lengths);

    // --- 1. EMBEDDED_HEADING_LIKE_FRAGMENT ---
    const headingRe = new RegExp(EMBEDDED_HEADING_LIKE.source, EMBEDDED_HEADING_LIKE.flags);
    let match: RegExpExecArray | null;
    let embeddedCount = 0;
    while ((match = headingRe.exec(ownText)) !== null) {
      if (match.index === headingRe.lastIndex) headingRe.lastIndex++;
      const absMatchStart = ownStart + match.index;
      // Skip the node's own heading occurrence, which by construction starts exactly at node.charStart.
      if (absMatchStart <= node.charStart) continue;
      const fragmentText = text.slice(absMatchStart, ownEnd);
      const substantiveChars = countSubstantiveChars(fragmentText);
      if (substantiveChars < MIN_SIGNIFICANT_UNCOVERED_CHARS) continue;
      if (embeddedCount >= MAX_EMBEDDED_HEADING_FINDINGS_PER_NODE) break;
      embeddedCount++;
      findings.push({
        code: "EMBEDDED_HEADING_LIKE_FRAGMENT",
        severity: "SIGNIFICANT",
        documentId,
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        message: `${node.nodeType} ${node.sectionRef}'s own claimed text (which no child node bounds) contains a second heading-shaped fragment ("${match[0]!.trim().slice(0, 80)}") starting at char ${absMatchStart} - real evidence a sibling section/article was never recognized as its own node and was silently absorbed into this node's own span instead.`,
        span: { charStart: absMatchStart, charEnd: ownEnd, substantiveChars, excerpt: fragmentText.trim().slice(0, 300) },
      });
    }

    // --- 2. SIGNAL_DENSITY_SHIFT ---
    // A SUBSECTION/CLAUSE node's own text literally BEGINS with its own
    // opening marker ("(a) ...") - excluded here (absMatchStart >
    // node.charStart, same guard as the heading-fragment check above) so a
    // real leaf clause with no further nested children never spuriously
    // flags itself for "containing" its own marker with "zero children."
    const markerRe = new RegExp(CLAUSE_MARKER_LIKE.source, CLAUSE_MARKER_LIKE.flags);
    const markerMatches: string[] = [];
    let markerMatch: RegExpExecArray | null;
    while ((markerMatch = markerRe.exec(ownText)) !== null) {
      if (markerMatch.index === markerRe.lastIndex) markerRe.lastIndex++;
      if (ownStart + markerMatch.index <= node.charStart) continue;
      markerMatches.push(markerMatch[0]);
    }
    const distinctMarkerCount = new Set(markerMatches.map((m) => m.toLowerCase())).size;
    const realChildCount = childCountByParentId.get(node.nodeId) ?? 0;
    if (markerMatches.length >= 1 && realChildCount === 0) {
      const substantiveChars = ownSubstantiveLength;
      findings.push({
        code: "SIGNAL_DENSITY_SHIFT",
        severity: distinctMarkerCount >= 2 ? "SIGNIFICANT" : "WARNING",
        documentId,
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        message: `${node.nodeType} ${node.sectionRef}'s own text contains ${markerMatches.length} lettered/numbered clause-marker-shaped token(s) (${distinctMarkerCount} distinct, e.g. "(a)", "(ii)") but zero real SUBSECTION/CLAUSE/SUBCLAUSE children - a plausible enumerated sub-list that was never structurally decomposed (a malformed-hierarchy shape, e.g. a lettered clause placed directly under an ARTICLE with no intervening SECTION).`,
        span: { charStart: ownStart, charEnd: ownEnd, substantiveChars, excerpt: ownText.trim().slice(0, 300) },
      });
    }
  }

  // --- 3. OWN_TEXT_LENGTH_OUTLIER (needs the full per-type distribution, computed above, before it can compare) ---
  const OUTLIER_MULTIPLIER = 4;
  const OUTLIER_MIN_ABSOLUTE_EXCESS = 2000;
  const MIN_SAMPLE_SIZE = 3;
  const medianByType = new Map<StructuralNode["nodeType"], number>();
  for (const [type, lengths] of ownLengthsByType) {
    if (lengths.length < MIN_SAMPLE_SIZE) continue;
    const sorted = [...lengths].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianByType.set(type, sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!);
  }
  for (const node of nodes) {
    if (!DECOMPOSABLE_NODE_TYPES.has(node.nodeType)) continue;
    const median = medianByType.get(node.nodeType);
    if (median === undefined || median <= 0) continue;
    const ownEnd = ownTextEndByNodeId.get(node.nodeId) ?? node.charEnd;
    const ownStart = node.charStart;
    if (ownEnd <= ownStart) continue;
    const ownSubstantiveLength = countSubstantiveChars(text.slice(ownStart, ownEnd));
    const excess = ownSubstantiveLength - median;
    if (ownSubstantiveLength > median * OUTLIER_MULTIPLIER && excess >= OUTLIER_MIN_ABSOLUTE_EXCESS) {
      findings.push({
        code: "OWN_TEXT_LENGTH_OUTLIER",
        severity: "WARNING",
        documentId,
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        message: `${node.nodeType} ${node.sectionRef}'s own text is ${ownSubstantiveLength} substantive characters - more than ${OUTLIER_MULTIPLIER}x the ${Math.round(median)}-char median for sibling ${node.nodeType} nodes in this document. This alone is not treated as a defect (a long section is sometimes entirely legitimate) but is worth a human's attention.`,
        span: { charStart: ownStart, charEnd: ownEnd, substantiveChars: ownSubstantiveLength, excerpt: text.slice(ownStart, ownEnd).trim().slice(0, 300) },
      });
    }
  }

  return findings;
}

export function computeStructuralCoverage(documentId: string, text: string, nodes: StructuralNode[]): StructuralCoverageResult {
  const totalChars = text.length;
  const totalSubstantiveChars = countSubstantiveChars(text);
  const spans = computeTopLevelSubtreeSpans(nodes, totalChars);
  const uncoveredRegions = computeUncoveredRegions(spans, totalChars);

  const significantUncoveredSpans: UncoveredSpan[] = [];
  let uncoveredSubstantiveChars = 0;
  for (const r of uncoveredRegions) {
    const regionText = text.slice(r.start, r.end);
    const substantiveChars = countSubstantiveChars(regionText);
    uncoveredSubstantiveChars += substantiveChars;
    if (substantiveChars >= MIN_SIGNIFICANT_UNCOVERED_CHARS) {
      significantUncoveredSpans.push({ charStart: r.start, charEnd: r.end, substantiveChars, excerpt: regionText.trim().slice(0, 300), gapKind: r.gapKind });
    }
  }

  const boundaryAnomalies = computeBoundaryAnomalies(documentId, text, nodes);
  const significantBoundaryAnomalyCount = boundaryAnomalies.filter((a) => a.severity === "SIGNIFICANT").length;

  const coveredSubstantiveChars = totalSubstantiveChars - uncoveredSubstantiveChars;
  const coveragePercent = totalSubstantiveChars === 0 ? 0 : Number(((coveredSubstantiveChars / totalSubstantiveChars) * 100).toFixed(2));
  const topLevelNodeCount = spans.length;

  const { health, healthReasons } = classifyHealth({ coveragePercent, topLevelNodeCount, totalSubstantiveChars, significantUncoveredSpanCount: significantUncoveredSpans.length, significantBoundaryAnomalyCount, boundaryAnomalies });

  return {
    documentId,
    totalChars,
    totalSubstantiveChars,
    coveredSubstantiveChars,
    uncoveredSubstantiveChars,
    coveragePercent,
    significantUncoveredSpans,
    boundaryAnomalies,
    topLevelNodeCount,
    totalNodeCount: nodes.length,
    health,
    healthReasons,
  };
}

/**
 * Task §7: "do not use hardcoded document-length thresholds alone... A
 * 3-page amendment may legitimately have only 4 sections. A 150-page
 * agreement with one node is suspicious." Operationalized as several
 * RELATIVE signals combined, never one absolute cutoff deciding health
 * by itself:
 *  - coveragePercent alone never determines FAILED/INSUFFICIENT - a
 *    short, genuinely single-section document can have low absolute
 *    substantive volume and still be completely, correctly represented;
 *  - node density (substantive chars per top-level node) only becomes
 *    suspicious when BOTH the node count is very low (1-2) AND the
 *    absolute substantive volume is large enough that a real drafter
 *    would not plausibly have written it as one undivided section
 *    (empirically, CONMED's own real ~94,000-substantive-char Article
 *    VII collapsing to a single node before this task's own fix is
 *    exactly this shape - 17 real sections' worth of content in 1 node).
 *  - Phase 3F.1.4: a SIGNIFICANT boundary anomaly (a real embedded
 *    heading-shaped fragment, or a real 3+-marker enumerated sub-list
 *    with zero children) is treated the same as a significant uncovered
 *    span for health purposes - it is equally real evidence the
 *    structural parser did not correctly represent this document, even
 *    though (unlike an uncovered span) every character is nominally
 *    "covered" by some node. Never escalates past STRUCTURE_PARTIAL by
 *    itself - it is corroborating evidence for a human/raw-scan to
 *    confirm, not, on its own, proof the whole document's structure
 *    failed.
 */
function classifyHealth(input: { coveragePercent: number; topLevelNodeCount: number; totalSubstantiveChars: number; significantUncoveredSpanCount: number; significantBoundaryAnomalyCount: number; boundaryAnomalies: BoundaryAnomalyFinding[] }): { health: StructuralHealthState; healthReasons: string[] } {
  const { coveragePercent, topLevelNodeCount, totalSubstantiveChars, significantUncoveredSpanCount, significantBoundaryAnomalyCount, boundaryAnomalies } = input;
  const reasons: string[] = [];

  if (topLevelNodeCount === 0) {
    reasons.push(`Zero ARTICLE or SECTION nodes were recognized anywhere in ${totalSubstantiveChars} substantive characters of text - no structural representation exists for this document at all.`);
    return { health: "STRUCTURE_FAILED", healthReasons: reasons };
  }

  const nodeDensity = totalSubstantiveChars / topLevelNodeCount;
  // A document this substantial collapsing to only 1-2 top-level nodes is only unsurprising if each node's own share of the text stays in the range a real, undivided single-topic provision plausibly spans (a few thousand characters); well beyond that, in real fixtures, means real sub-sections were not separated.
  const impliesUnrecognizedSubdivision = topLevelNodeCount <= 2 && nodeDensity > 15000;
  const lowCoverage = coveragePercent < 70;
  const manySignificantGaps = significantUncoveredSpanCount >= 3;
  const hasSignificantBoundaryAnomaly = significantBoundaryAnomalyCount > 0;

  if (impliesUnrecognizedSubdivision) {
    reasons.push(`${topLevelNodeCount} top-level node(s) for ${totalSubstantiveChars} substantive characters (${Math.round(nodeDensity)} chars/node) is implausibly coarse for real drafted contract text at this volume - real sub-sections were very likely not separated.`);
  }
  if (lowCoverage) {
    reasons.push(`Structural coverage is only ${coveragePercent}% of substantive text.`);
  }
  if (manySignificantGaps) {
    reasons.push(`${significantUncoveredSpanCount} significant uncovered text spans (>=${MIN_SIGNIFICANT_UNCOVERED_CHARS} substantive chars each) were found outside any recognized node.`);
  }
  if (hasSignificantBoundaryAnomaly) {
    const codes = [...new Set(boundaryAnomalies.filter((a) => a.severity === "SIGNIFICANT").map((a) => a.code))].join(", ");
    reasons.push(`${significantBoundaryAnomalyCount} significant boundary anomaly finding(s) (${codes}) indicate at least one recognized node's own claimed text probably contains content that should have been its own, separate node.`);
  }

  if (impliesUnrecognizedSubdivision && lowCoverage) {
    return { health: "STRUCTURE_INSUFFICIENT", healthReasons: reasons };
  }
  if (impliesUnrecognizedSubdivision || lowCoverage || manySignificantGaps || hasSignificantBoundaryAnomaly) {
    return { health: "STRUCTURE_PARTIAL", healthReasons: reasons };
  }
  reasons.push(`${topLevelNodeCount} top-level node(s), ${coveragePercent}% substantive coverage, ${significantUncoveredSpanCount} significant uncovered span(s), ${significantBoundaryAnomalyCount} significant boundary anomaly finding(s) - within normal range for real drafted contract text.`);
  return { health: "STRUCTURE_HEALTHY", healthReasons: reasons };
}
