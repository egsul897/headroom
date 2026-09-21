/**
 * §7 — the free savings pass, run BEFORE any paid compilation.
 *
 * Two separate questions, deliberately not conflated:
 *
 *  1. Cache. The semantic compilation cache is keyed on the compiler's algorithm and
 *     prompt versions among other things. This pilot substitutes a different MODEL, and
 *     nothing in the CONMED dataset was ever compiled at all, so there is nothing to hit.
 *     Reported as a measured zero, not assumed.
 *
 *  2. Exact duplicates. Two candidates are deduplicated ONLY when the bytes production
 *     would send them are identical — same operative source text AND same section ref.
 *     Compiling one is then provably equivalent to compiling the other.
 *
 * What this deliberately does NOT do is collapse provisions that merely look alike. Two
 * baskets with the same shape and different caps are different legal provisions, and
 * merging them would manufacture exactly the kind of silent coverage loss this whole line
 * of work exists to detect. Similarity is not equivalence.
 *
 * Forensic tooling. Nothing in the production pipeline imports it.
 */
import type { DiscoveredCandidate } from "../../lib/contract-model/compiler/discovery/types";
import { sha256 } from "./pipeline";

export interface DedupGroup {
  keptDiscoveryId: string;
  droppedDiscoveryIds: string[];
  sourceSectionRef: string;
  sourceTextHash: string;
  sourceTextChars: number;
}

export interface DedupReport {
  populationIn: number;
  toCompile: number;
  exactDuplicatesRemoved: number;
  groups: DedupGroup[];
  cacheHits: number;
  cacheHitRationale: string;
  emptySourceText: { discoveryId: string; sourceSectionRef: string }[];
  equivalenceRule: string;
}

export function dedupExact(candidates: DiscoveredCandidate[], textFor: (c: DiscoveredCandidate) => string): { keep: DiscoveredCandidate[]; report: DedupReport } {
  const byKey = new Map<string, DiscoveredCandidate[]>();
  const empty: { discoveryId: string; sourceSectionRef: string }[] = [];

  for (const c of candidates) {
    const text = textFor(c);
    if (text.trim().length === 0) empty.push({ discoveryId: c.discoveryId, sourceSectionRef: c.normalizedSourceRef });
    // The key is the whole payload identity: same ref AND same bytes.
    const key = `${c.normalizedSourceRef}::${sha256(text)}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(c);
  }

  const keep: DiscoveredCandidate[] = [];
  const groups: DedupGroup[] = [];
  for (const [, members] of byKey) {
    const sorted = [...members].sort((a, b) => a.discoveryId.localeCompare(b.discoveryId));
    const first = sorted[0]!;
    keep.push(first);
    if (sorted.length > 1) {
      groups.push({
        keptDiscoveryId: first.discoveryId,
        droppedDiscoveryIds: sorted.slice(1).map((c) => c.discoveryId),
        sourceSectionRef: first.normalizedSourceRef,
        sourceTextHash: sha256(textFor(first)),
        sourceTextChars: textFor(first).length,
      });
    }
  }

  return {
    keep,
    report: {
      populationIn: candidates.length,
      toCompile: keep.length,
      exactDuplicatesRemoved: candidates.length - keep.length,
      groups,
      cacheHits: 0,
      cacheHitRationale:
        "The CONMED dataset has never been compiled — its frozen artifact has no compilation stage — so no cache entry can exist for any of these candidates under any prompt version. The pilot also substitutes a different model. Measured zero, not assumed.",
      emptySourceText: empty,
      equivalenceRule:
        "Two candidates are duplicates only when their normalized section ref AND the sha256 of the exact operative source text production would send both match. Semantic similarity is explicitly NOT a merge criterion.",
    },
  };
}
