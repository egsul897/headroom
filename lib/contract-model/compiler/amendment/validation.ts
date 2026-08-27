/**
 * Phase 2G §11 - deterministic validation of AI amendment output. No AI
 * proposal becomes authoritative merely because schema validation
 * succeeded (task §10's own explicit warning) - this module re-checks
 * the model's own claims against real, indexed evidence and downgrades
 * or rejects anything unsupported. AI may interpret legal transformation;
 * it may not manufacture source evidence.
 */
import type { AmendmentEffectCandidate } from "./types";

/** Whitespace/case-normalized substring containment check - tolerant of real re-wrapping/quote-style differences between the amendment's own raw text and the model's own verbatim quotation of it, never a fuzzy semantic match. */
function normalizedContains(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(haystack).includes(norm(needle));
}

export interface ValidationInput {
  candidate: AmendmentEffectCandidate;
  /** The exact amendment clause text the model was actually given - the only source `newText` is allowed to come from. */
  amendmentClauseText: string;
}

/**
 * Re-validates one semantically-interpreted candidate. Never upgrades a
 * candidate's status - only downgrades/strips claims that don't survive
 * the check, preserving the original candidate otherwise untouched.
 */
export function validateSemanticAmendmentCandidate(input: ValidationInput): AmendmentEffectCandidate {
  const { candidate, amendmentClauseText } = input;
  if (candidate.resolutionMethod !== "SEMANTIC_INTERPRETATION") return candidate;

  const problems: string[] = [];
  let newText = candidate.newText;

  if (newText && !normalizedContains(amendmentClauseText, newText)) {
    problems.push("the model's proposed replacement/added text does not appear (even after whitespace normalization) anywhere in the amendment clause it was given - rejected as unsupported, not propagated as though real");
    newText = null;
  }

  if (candidate.target.targetSectionRef === null && candidate.target.targetDefinedTermRef === null && candidate.target.targetDocumentId === null) {
    problems.push("no resolvable target (section, definition, or document) was ever established for this effect - a semantic operation classification cannot be authoritative without a real target");
  }

  if (problems.length === 0) return candidate;

  return {
    ...candidate,
    newText,
    status: "REVIEW_REQUIRED",
    unresolvedReason: [candidate.unresolvedReason, ...problems].filter(Boolean).join("; "),
    resolutionMethod: "SEMANTIC_INTERPRETATION_REJECTED",
    confidence: Math.min(candidate.confidence, 0.3),
  };
}

export function validateSemanticAmendmentCandidates(candidates: AmendmentEffectCandidate[], clauseTextByEffectId: Map<string, string>): AmendmentEffectCandidate[] {
  return candidates.map((c) => {
    const clauseText = clauseTextByEffectId.get(c.effectId);
    if (!clauseText) return c;
    return validateSemanticAmendmentCandidate({ candidate: c, amendmentClauseText: clauseText });
  });
}
