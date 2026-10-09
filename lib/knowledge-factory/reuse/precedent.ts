/**
 * Semantic reuse distinctions.
 * Prior interpretations may guide analysis but cannot replace verification
 * of a new operative source. Similarity ≠ legal equivalence.
 */

import { nearDuplicateScore } from "../dedupe/near-duplicate";
import type { CovenantCandidateRecord } from "../types";

export type ReuseMode =
  | "RETRIEVAL_OF_PRECEDENT_INTERPRETATIONS"
  | "SUGGESTED_SEMANTIC_HYPOTHESIS"
  | "VALIDATED_STRUCTURAL_EQUIVALENCE"
  | "VERIFIED_RULE_REUSE";

export interface PrecedentMatch {
  queryCandidateId: string;
  precedentCandidateId: string;
  mode: ReuseMode;
  similarity: number;
  note: string;
  replacesVerification: false;
}

export function retrievePrecedentInterpretations(
  query: CovenantCandidateRecord,
  library: CovenantCandidateRecord[],
  opts: { minSimilarity?: number; verifiedIds?: Set<string> } = {},
): PrecedentMatch[] {
  const min = opts.minSimilarity ?? 0.85;
  const verified = opts.verifiedIds ?? new Set<string>();
  const out: PrecedentMatch[] = [];

  for (const prec of library) {
    if (prec.candidateId === query.candidateId) continue;
    const familyOverlap = query.families.some((f) => prec.families.includes(f) && f !== "UNKNOWN");
    if (!familyOverlap) continue;
    const similarity = nearDuplicateScore(query.excerpt, prec.excerpt);
    if (similarity < min) continue;

    let mode: ReuseMode = "RETRIEVAL_OF_PRECEDENT_INTERPRETATIONS";
    if (similarity >= 0.95) mode = "SUGGESTED_SEMANTIC_HYPOTHESIS";
    // VALIDATED_STRUCTURAL_EQUIVALENCE / VERIFIED_RULE_REUSE require explicit verification records — never inferred from similarity alone.
    if (verified.has(prec.candidateId) && similarity >= 0.98) {
      mode = "SUGGESTED_SEMANTIC_HYPOTHESIS";
    }

    out.push({
      queryCandidateId: query.candidateId,
      precedentCandidateId: prec.candidateId,
      mode,
      similarity,
      note: "Precedent may guide analysis; cannot replace verification of the new operative source. Similarity is not legal equivalence.",
      replacesVerification: false,
    });
  }

  return out.sort((a, b) => b.similarity - a.similarity).slice(0, 20);
}
