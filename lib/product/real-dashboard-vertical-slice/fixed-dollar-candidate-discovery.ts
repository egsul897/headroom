/**
 * Package-agnostic fixed-dollar candidate discovery from authentic operative text.
 *
 * Uses deterministic extraction NUMERICAL_THRESHOLD facts + local windowing to
 * propose OperativeClauseCandidate rows. Compilation/fidelity remain in
 * compileVerifiedFixedDollarBridge — discovery never invents capacity.
 *
 * No companyId switches. Package-specific extractors may still supply candidates;
 * this module is the preferred autonomous discovery path for fixed-dollar caps.
 */

import { extractDeterministicCovenantFacts } from "@/lib/contract-model/compiler/deterministic-extraction/extract";
import type { OperativeClauseCandidate } from "./verified-executable-compile-core";

export type DiscoveredFixedDollarCandidate = OperativeClauseCandidate & {
  discoveryMethod: "DETERMINISTIC_THRESHOLD_WINDOW";
  thresholdRaw: string;
  startOffset: number;
};

const DOLLAR_CAP_CONTEXT_RE =
  /\b(?:not\s+to\s+exceed|shall\s+not\s+exceed|in\s+an?\s+aggregate\s+(?:principal\s+)?amount(?:\s+outstanding)?\s+(?:not\s+to\s+exceed|of)|aggregate\s+outstanding\s+amount[^.$]{0,80}not\s+exceed)\b/i;

const SECTION_HINT_RE = /\b(?:SECTION|Section|§)\s*(\d+(?:\.\d+)*(?:\([a-z0-9]+\))*)/i;

function windowAround(text: string, index: number, radius = 220): { start: number; excerpt: string } {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return { start, excerpt: text.slice(start, end).replace(/\s+/g, " ").trim() };
}

function looksLikeFixedDollarCapWindow(excerpt: string, thresholdRaw: string): boolean {
  if (!/\$/.test(thresholdRaw) && !/million|billion/i.test(thresholdRaw)) return false;
  if (!DOLLAR_CAP_CONTEXT_RE.test(excerpt)) return false;
  // Ratios / leverage alone are not fixed-dollar caps.
  if (/\bto\s+1(?:\.0+)?\b/.test(thresholdRaw)) return false;
  return true;
}

/**
 * Discover fixed-dollar operative clause candidates from a single document text.
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
    const { start, excerpt } = windowAround(input.text, idx);
    if (!looksLikeFixedDollarCapWindow(excerpt, raw)) continue;

    const dedupe = `${input.documentId}|${raw}|${start}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);

    const sectionMatch = SECTION_HINT_RE.exec(input.text.slice(Math.max(0, start - 80), start + excerpt.length));
    const sectionRef = sectionMatch?.[1] ?? "FULL_DOCUMENT";
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
