/**
 * Near-duplicate detection via hashes and carefully validated text similarity.
 * Does NOT merge legally distinct versions/instruments solely because text is similar.
 */

import { createHash } from "node:crypto";
import type { KnowledgeSourceRecord } from "../types";

export type DuplicateKind =
  | "EXACT_BYTES"
  | "EXACT_NORMALIZED_TEXT"
  | "FORMATTING_ONLY"
  | "NEAR_IDENTICAL_SECTION"
  | "BOILERPLATE_DEFINITION"
  | "REPEATED_AMENDMENT_SHAPE"
  | "RESTATEMENT_OF";

export interface DuplicateObservation {
  kind: DuplicateKind;
  leftSourceId: string;
  rightSourceId: string;
  score: number;
  note: string;
  /** Never true for automated near-dup — merging requires review. */
  mergeAllowed: false;
}

export function findExactByteDuplicates(sources: KnowledgeSourceRecord[]): DuplicateObservation[] {
  const byHash = new Map<string, KnowledgeSourceRecord[]>();
  for (const s of sources) {
    const list = byHash.get(s.originalBytesHash) ?? [];
    list.push(s);
    byHash.set(s.originalBytesHash, list);
  }
  const out: DuplicateObservation[] = [];
  for (const [, group] of byHash) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        out.push({
          kind: "EXACT_BYTES",
          leftSourceId: group[i]!.sourceId,
          rightSourceId: group[j]!.sourceId,
          score: 1,
          note: "Identical original bytes. May be identical text filed by different entities — do not merge instruments automatically.",
          mergeAllowed: false,
        });
      }
    }
  }
  return out;
}

export function findExactNormalizedDuplicates(sources: KnowledgeSourceRecord[]): DuplicateObservation[] {
  const byHash = new Map<string, KnowledgeSourceRecord[]>();
  for (const s of sources) {
    if (!s.normalizedTextHash) continue;
    const list = byHash.get(s.normalizedTextHash) ?? [];
    list.push(s);
    byHash.set(s.normalizedTextHash, list);
  }
  const out: DuplicateObservation[] = [];
  for (const [, group] of byHash) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const left = group[i]!;
        const right = group[j]!;
        const formattingOnly = left.originalBytesHash !== right.originalBytesHash;
        out.push({
          kind: formattingOnly ? "FORMATTING_ONLY" : "EXACT_NORMALIZED_TEXT",
          leftSourceId: left.sourceId,
          rightSourceId: right.sourceId,
          score: 1,
          note: formattingOnly
            ? "Normalized text identical with different byte hashes — likely formatting-only change. Still preserve both versions."
            : "Normalized text identical. Preserve both source identities.",
          mergeAllowed: false,
        });
      }
    }
  }
  return out;
}

/** Jaccard similarity over shingles; high threshold only. */
export function nearDuplicateScore(a: string, b: string, shingleSize = 12): number {
  const A = shingles(a, shingleSize);
  const B = shingles(b, shingleSize);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function observeNearIdenticalSections(
  leftSourceId: string,
  leftText: string,
  rightSourceId: string,
  rightText: string,
  threshold = 0.92,
): DuplicateObservation | null {
  const score = nearDuplicateScore(leftText.slice(0, 20_000), rightText.slice(0, 20_000));
  if (score < threshold) return null;
  return {
    kind: "NEAR_IDENTICAL_SECTION",
    leftSourceId,
    rightSourceId,
    score,
    note: "High textual similarity — useful for precedent retrieval, not legal equivalence.",
    mergeAllowed: false,
  };
}

export function boilerplateDefinitionKey(term: string, definitionText: string): string {
  const norm = definitionText.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
  return createHash("sha256").update(`${term.toLowerCase()}|${norm}`).digest("hex");
}

function shingles(text: string, n: number): Set<string> {
  const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
  const out = new Set<string>();
  if (norm.length < n) return out;
  for (let i = 0; i <= norm.length - n; i += Math.max(1, Math.floor(n / 3))) {
    out.add(norm.slice(i, i + n));
  }
  return out;
}
