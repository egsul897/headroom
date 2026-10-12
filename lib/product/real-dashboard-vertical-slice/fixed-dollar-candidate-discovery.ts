/**
 * Package-agnostic fixed-dollar candidate discovery from authentic operative text.
 *
 * Uses deterministic extraction NUMERICAL_THRESHOLD facts + local windowing to
 * propose OperativeClauseCandidate rows. Compilation/fidelity remain in
 * compileVerifiedFixedDollarBridge / compileOperativeCovenantPackage —
 * discovery NEVER establishes verified legal capacity by itself.
 *
 * No companyId switches. Cap-role classification and fidelity gates still refuse
 * grandfather dollars, multi-amount windows, and ratio language.
 */

import { extractDeterministicCovenantFacts } from "@/lib/contract-model/compiler/deterministic-extraction/extract";
import type { OperativeClauseCandidate } from "./verified-executable-compile-core";

export type DiscoveredFixedDollarCandidate = OperativeClauseCandidate & {
  discoveryMethod: "DETERMINISTIC_THRESHOLD_WINDOW";
  thresholdRaw: string;
  startOffset: number;
  endOffset: number;
  /** True when the window contains multiple distinct dollar figures. */
  multiAmountWindow: boolean;
  /** Cap-role heuristic only — not a permission verdict. */
  capRoleSignal: "NOT_TO_EXCEED_CAP" | "AGGREGATE_AMOUNT_OF" | "AMBIGUOUS";
};

const NOT_TO_EXCEED_RE =
  /\b(?:not\s+to\s+exceed|shall\s+not\s+exceed|does\s+not\s+exceed)\b/i;
const AGGREGATE_AMOUNT_OF_RE =
  /\bin\s+an?\s+aggregate\s+(?:principal\s+)?amount(?:\s+outstanding)?\s+of\b/i;
const DOLLAR_CAP_CONTEXT_RE =
  /\b(?:not\s+to\s+exceed|shall\s+not\s+exceed|does\s+not\s+exceed|in\s+an?\s+aggregate\s+(?:principal\s+)?amount(?:\s+outstanding)?\s+(?:not\s+to\s+exceed|of)|aggregate\s+outstanding\s+amount[^.$]{0,80}not\s+exceed)\b/i;

const SECTION_HINT_RE = /\b(?:SECTION|Section|§)\s*(\d+(?:\.\d+)*)(?:\s*\(([a-z0-9]+)\))?/i;
const CLAUSE_LETTER_RE = /\(([a-z0-9]+)\)\s*(?:Indebtedness|Liens?|Debt|the\s+aggregate)/i;
const DOLLAR_FIGURE_RE = /\$\s*[\d,]+(?:\.\d+)?/g;

function windowAround(text: string, index: number, radius = 220): { start: number; end: number; excerpt: string } {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return { start, end, excerpt: text.slice(start, end).replace(/\s+/g, " ").trim() };
}

function classifyCapRole(excerpt: string): DiscoveredFixedDollarCandidate["capRoleSignal"] {
  if (NOT_TO_EXCEED_RE.test(excerpt)) return "NOT_TO_EXCEED_CAP";
  if (AGGREGATE_AMOUNT_OF_RE.test(excerpt)) return "AGGREGATE_AMOUNT_OF";
  return "AMBIGUOUS";
}

function dollarNearNotToExceed(excerpt: string, thresholdRaw: string): boolean {
  const dollarIdx = excerpt.search(/\$\s*[\d,]+/);
  if (dollarIdx < 0) return false;
  // Require the not-to-exceed / shall-not-exceed cue within a tight window of the dollar.
  const local = excerpt.slice(Math.max(0, dollarIdx - 60), Math.min(excerpt.length, dollarIdx + thresholdRaw.length + 40));
  return /\b(?:not\s+to\s+exceed|shall\s+not\s+exceed|does\s+not\s+exceed)\b/i.test(local);
}

function looksLikeFixedDollarCapWindow(excerpt: string, thresholdRaw: string): boolean {
  if (!/\$/.test(thresholdRaw) && !/million|billion/i.test(thresholdRaw)) return false;
  if (!DOLLAR_CAP_CONTEXT_RE.test(excerpt)) return false;
  // Ratios / leverage alone are not fixed-dollar caps.
  if (/\bto\s+1(?:\.0+)?\b/.test(thresholdRaw)) return false;
  // Reject EBITDA / fee addback "aggregate amount permitted to be added" false positives.
  if (/\baggregate\s+amount\s+permitted\s+to\s+be\b/i.test(excerpt)) return false;
  if (/\badd(?:ed|back)\b/i.test(excerpt) && !/\bIndebtedness\b|\bDebt\b|\bLiens?\b/i.test(excerpt)) {
    return false;
  }
  return true;
}

/**
 * Discover fixed-dollar operative clause candidates from a single document text.
 * Output is a candidate proposal only — not verified capacity.
 */
export function discoverFixedDollarCandidatesFromText(input: {
  documentId: string;
  text: string;
  candidateIdPrefix?: string;
}): DiscoveredFixedDollarCandidate[] {
  const extracted = extractDeterministicCovenantFacts({
    text: input.text,
    documentId: input.documentId,
    candidateRef: "FULL_DOCUMENT",
  });

  const out: DiscoveredFixedDollarCandidate[] = [];
  const seen = new Set<string>();

  for (const fact of extracted.facts) {
    if (fact.kind !== "NUMERICAL_THRESHOLD") continue;
    const raw = String((fact.value as { raw?: string }).raw ?? fact.source.excerpt ?? "");
    const idx = fact.source.startOffset ?? 0;
    const { start, end, excerpt } = windowAround(input.text, idx);
    if (!looksLikeFixedDollarCapWindow(excerpt, raw)) continue;

    const dollars = excerpt.match(DOLLAR_FIGURE_RE) ?? [];
    const multiAmountWindow = dollars.length > 1;
    let capRoleSignal = classifyCapRole(excerpt);

    // Tighten NOT_TO_EXCEED: dollar must sit next to the exceed cue (not elsewhere in the window).
    if (capRoleSignal === "NOT_TO_EXCEED_CAP" && !dollarNearNotToExceed(excerpt, raw)) {
      capRoleSignal = classifyCapRole(excerpt.replace(NOT_TO_EXCEED_RE, " ")) === "AGGREGATE_AMOUNT_OF"
        ? "AGGREGATE_AMOUNT_OF"
        : "AMBIGUOUS";
    }

    // Grandfather / "amount of $X" without not-to-exceed is not a sole-cap candidate.
    // Keep AGGREGATE_AMOUNT_OF for refuse-path demonstration; compile fidelity will refuse.
    if (capRoleSignal === "AMBIGUOUS") continue;

    const dedupe = `${input.documentId}|${raw}|${start}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    // Prefer the nearest preceding SECTION heading (search backward from threshold).
    let sectionRef = "FULL_DOCUMENT";
    {
      const pre = input.text.slice(0, Math.min(input.text.length, idx + 1));
      const matches = [...pre.matchAll(new RegExp(SECTION_HINT_RE.source, "gi"))];
      const nearest = matches.length > 0 ? matches[matches.length - 1]! : null;
      if (nearest && idx - (nearest.index ?? 0) < 2500) {
        const base = nearest[1]!;
        const letter =
          nearest[2] ??
          CLAUSE_LETTER_RE.exec(excerpt)?.[1] ??
          CLAUSE_LETTER_RE.exec(input.text.slice(Math.max(0, idx - 160), idx + 80))?.[1];
        sectionRef = letter ? `${base}(${letter})` : base;
      }
    }
    const prefix = input.candidateIdPrefix ?? input.documentId;

    out.push({
      candidateId: `${prefix}:auto-fd:${out.length}:${raw.replace(/[^0-9A-Za-z]+/g, "").slice(0, 24)}`,
      documentId: input.documentId,
      sourceSectionRef: sectionRef,
      operativeSourceText: excerpt,
      relatedLeafCode: null,
      discoveryMethod: "DETERMINISTIC_THRESHOLD_WINDOW",
      thresholdRaw: raw,
      startOffset: start,
      endOffset: end,
      multiAmountWindow,
      capRoleSignal,
    });
  }

  return out;
}

/**
 * Discover candidates across multiple authentic package documents.
 */
export function discoverFixedDollarCandidatesFromDocuments(
  documents: ReadonlyArray<{ documentId: string; text: string }>,
): DiscoveredFixedDollarCandidate[] {
  return documents.flatMap((d) =>
    discoverFixedDollarCandidatesFromText({
      documentId: d.documentId,
      text: d.text,
    }),
  );
}

/**
 * Prefer sole not-to-exceed caps for VE Position feed proposals.
 * Multi-amount and aggregate-amount-of windows are excluded here — they may
 * still surface via compileOperativeCovenantPackage rejection paths.
 */
export function selectSoleCapDiscoveryCandidates(
  candidates: readonly DiscoveredFixedDollarCandidate[],
): OperativeClauseCandidate[] {
  return candidates
    .filter((c) => c.capRoleSignal === "NOT_TO_EXCEED_CAP" && !c.multiAmountWindow)
    .map(({ discoveryMethod: _d, thresholdRaw: _t, startOffset: _s, endOffset: _e, multiAmountWindow: _m, capRoleSignal: _c, ...rest }) => rest);
}
