/**
 * Deterministic post-score consolidation and diversity reranking.
 * Targets overlapping extraction windows / duplicate passages without
 * changing verification status or inventing legal truth.
 */

import type { ResearchHit } from "./types";

function normalizeSection(ref: string | null | undefined): string {
  if (!ref) return "";
  return ref.toLowerCase().replace(/[^a-z0-9.]+/g, "").replace(/^section/, "");
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9$\s]+/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** Group key for exact-span / same-section family consolidation. */
export function consolidationKey(hit: ResearchHit): string {
  const e = hit.entry;
  return [
    e.issuer.companyId,
    e.sourceDocumentId ?? e.filing.accession ?? "",
    normalizeSection(e.sourceSectionRef),
    String(e.covenantFamily),
    e.sourceSpan?.excerptHash ?? "",
  ].join("|");
}

/**
 * Collapse near-duplicate hits: same issuer/doc/section/family with high
 * excerpt overlap, keeping the highest-scoring (then richest excerpt).
 */
export function consolidateSourceSpans(hits: readonly ResearchHit[], overlapThreshold = 0.82): ResearchHit[] {
  const sorted = [...hits].sort(
    (a, b) => b.score - a.score || b.entry.sourceExcerpt.length - a.entry.sourceExcerpt.length,
  );
  const kept: ResearchHit[] = [];
  const keptTokens: Array<{ key: string; tokens: Set<string> }> = [];

  for (const hit of sorted) {
    const keyBase = [
      hit.entry.issuer.companyId,
      hit.entry.sourceDocumentId ?? hit.entry.filing.accession ?? "",
      normalizeSection(hit.entry.sourceSectionRef),
      String(hit.entry.covenantFamily),
    ].join("|");
    const tokens = tokenSet(hit.entry.sourceExcerpt);
    let duplicate = false;
    for (const prev of keptTokens) {
      if (prev.key !== keyBase) continue;
      if (jaccard(tokens, prev.tokens) >= overlapThreshold) {
        duplicate = true;
        break;
      }
    }
    // Also collapse identical excerpt hashes regardless of family noise.
    if (!duplicate) {
      const hash = hit.entry.sourceSpan?.excerptHash;
      if (hash && kept.some((k) => k.entry.sourceSpan?.excerptHash === hash && k.entry.issuer.companyId === hit.entry.issuer.companyId)) {
        duplicate = true;
      }
    }
    if (duplicate) continue;
    kept.push(hit);
    keptTokens.push({ key: keyBase, tokens });
  }
  return kept;
}

/**
 * Soft deterministic rerank: prefer stronger structural intent matches,
 * demote unknown/unresolved operative states slightly, and diversify by
 * document+section so discovery near-misses do not fill the entire top-k.
 */
export function rerankHits(hits: readonly ResearchHit[], limit: number): ResearchHit[] {
  const consolidated = consolidateSourceSpans(hits);

  const adjusted = consolidated.map((h) => {
    let adj = h.score;
    // Intent-aligned structural strength.
    if (h.structuralScore >= 4) adj += 0.75;
    else if (h.structuralScore >= 2.5) adj += 0.35;
    // Unknown / unresolved operative versions are weaker evidence for
    // "find operative precedent" style queries — soft demote only.
    const op = h.operativeClassification ?? h.entry.operativeVersion.status;
    if (
      op === "UNKNOWN" ||
      op === "UNKNOWN_EFFECTIVE_DATE" ||
      op === "UNRESOLVED_OPERATIVE_STATE" ||
      op === "MISSING_AMENDMENT_AUTHORITY"
    ) {
      adj -= 0.4;
    }
    // Prefer richer excerpts over TOC stubs / short extraction windows.
    if (h.entry.sourceExcerpt.length < 80) adj -= 0.6;
    else if (h.entry.sourceExcerpt.length > 220) adj += 0.15;
    // Soft prefer curated fixtures when structural signal is present —
    // does NOT change verificationStatus.
    if (h.entry.verificationStatus === "FIXTURE" && h.structuralScore >= 2) adj += 0.5;
    return { hit: h, adj: Number(adj.toFixed(4)) };
  });

  adjusted.sort(
    (a, b) =>
      b.adj - a.adj ||
      b.hit.structuralScore - a.hit.structuralScore ||
      a.hit.entry.entryId.localeCompare(b.hit.entry.entryId),
  );

  // Diversity pass: first fill with unique (doc, section) buckets, then backfill.
  const primary: ResearchHit[] = [];
  const remainder: ResearchHit[] = [];
  const seenBucket = new Set<string>();
  for (const { hit, adj } of adjusted) {
    const bucket = [
      hit.entry.issuer.companyId,
      hit.entry.sourceDocumentId ?? "",
      normalizeSection(hit.entry.sourceSectionRef),
    ].join("|");
    const scored: ResearchHit = { ...hit, score: adj };
    if (!seenBucket.has(bucket)) {
      seenBucket.add(bucket);
      primary.push(scored);
    } else {
      remainder.push(scored);
    }
  }
  return [...primary, ...remainder].slice(0, limit);
}
