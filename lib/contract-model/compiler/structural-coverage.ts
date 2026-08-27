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
 */
import type { StructuralNode } from "./types";

/** Substantive-text normalization policy (task §6): a character counts toward "substantive" text if it is not whitespace. This is deliberately the simplest defensible, fully reproducible definition - it means a large run of blank lines or page-break padding between real sections is never counted as a coverage gap, while any real prose, heading, or figure always is. */
export function countSubstantiveChars(text: string): number {
  let n = 0;
  for (const ch of text) if (!/\s/.test(ch)) n++;
  return n;
}

export interface UncoveredSpan {
  charStart: number;
  charEnd: number;
  substantiveChars: number;
  excerpt: string;
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
  topLevelNodeCount: number;
  totalNodeCount: number;
  health: StructuralHealthState;
  healthReasons: string[];
}

const MIN_SIGNIFICANT_UNCOVERED_CHARS = 40;

/** The exact same "next node of equal-or-shallower rank closes the span" rule stage-structure.ts already uses for owned-text spans, applied here only to ARTICLE/SECTION (top-level) nodes - the union of their spans is what "structurally represented" means for coverage purposes, since every SUBSECTION/CLAUSE/SUBCLAUSE is by construction a subset of its enclosing SECTION's own span. */
function computeTopLevelSpans(nodes: StructuralNode[], textLength: number): Array<{ start: number; end: number }> {
  const topLevel = nodes.filter((n) => n.nodeType === "ARTICLE" || n.nodeType === "SECTION").sort((a, b) => a.charStart - b.charStart);
  return topLevel.map((n, i) => ({ start: n.charStart, end: topLevel[i + 1]?.charStart ?? textLength }));
}

export function computeStructuralCoverage(documentId: string, text: string, nodes: StructuralNode[]): StructuralCoverageResult {
  const totalChars = text.length;
  const totalSubstantiveChars = countSubstantiveChars(text);
  const spans = computeTopLevelSpans(nodes, totalChars);

  // Uncovered regions = everything NOT inside a top-level span - by construction this can only be (a) a leading preamble before the first top-level node, and (b) the whole document when there are zero top-level nodes at all (the pre-fix CONMED Documents C/D case).
  const uncoveredRegions: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) uncoveredRegions.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < totalChars) uncoveredRegions.push({ start: cursor, end: totalChars });

  const significantUncoveredSpans: UncoveredSpan[] = [];
  let uncoveredSubstantiveChars = 0;
  for (const r of uncoveredRegions) {
    const regionText = text.slice(r.start, r.end);
    const substantiveChars = countSubstantiveChars(regionText);
    uncoveredSubstantiveChars += substantiveChars;
    if (substantiveChars >= MIN_SIGNIFICANT_UNCOVERED_CHARS) {
      significantUncoveredSpans.push({ charStart: r.start, charEnd: r.end, substantiveChars, excerpt: regionText.trim().slice(0, 300) });
    }
  }

  const coveredSubstantiveChars = totalSubstantiveChars - uncoveredSubstantiveChars;
  const coveragePercent = totalSubstantiveChars === 0 ? 0 : Number(((coveredSubstantiveChars / totalSubstantiveChars) * 100).toFixed(2));
  const topLevelNodeCount = spans.length;

  const { health, healthReasons } = classifyHealth({ coveragePercent, topLevelNodeCount, totalSubstantiveChars, significantUncoveredSpanCount: significantUncoveredSpans.length });

  return {
    documentId,
    totalChars,
    totalSubstantiveChars,
    coveredSubstantiveChars,
    uncoveredSubstantiveChars,
    coveragePercent,
    significantUncoveredSpans,
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
 */
function classifyHealth(input: { coveragePercent: number; topLevelNodeCount: number; totalSubstantiveChars: number; significantUncoveredSpanCount: number }): { health: StructuralHealthState; healthReasons: string[] } {
  const { coveragePercent, topLevelNodeCount, totalSubstantiveChars, significantUncoveredSpanCount } = input;
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

  if (impliesUnrecognizedSubdivision) {
    reasons.push(`${topLevelNodeCount} top-level node(s) for ${totalSubstantiveChars} substantive characters (${Math.round(nodeDensity)} chars/node) is implausibly coarse for real drafted contract text at this volume - real sub-sections were very likely not separated.`);
  }
  if (lowCoverage) {
    reasons.push(`Structural coverage is only ${coveragePercent}% of substantive text.`);
  }
  if (manySignificantGaps) {
    reasons.push(`${significantUncoveredSpanCount} significant uncovered text spans (>=${MIN_SIGNIFICANT_UNCOVERED_CHARS} substantive chars each) were found outside any recognized node.`);
  }

  if (impliesUnrecognizedSubdivision && lowCoverage) {
    return { health: "STRUCTURE_INSUFFICIENT", healthReasons: reasons };
  }
  if (impliesUnrecognizedSubdivision || lowCoverage || manySignificantGaps) {
    return { health: "STRUCTURE_PARTIAL", healthReasons: reasons };
  }
  reasons.push(`${topLevelNodeCount} top-level node(s), ${coveragePercent}% substantive coverage, ${significantUncoveredSpanCount} significant uncovered span(s) - within normal range for real drafted contract text.`);
  return { health: "STRUCTURE_HEALTHY", healthReasons: reasons };
}
