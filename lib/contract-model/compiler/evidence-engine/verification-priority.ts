/**
 * Verification spend follows legal risk. A sample diagnostic is not
 * exhaustive certification.
 */
export const VERIFICATION_PRIORITY = [
  "FALSE_PERMISSION",
  "MISSING_MATERIAL_RESTRICTION",
  "WRONG_OPERATIVE_SOURCE",
  "INCORRECT_AMENDMENT_PRECEDENCE",
  "UNSUPPORTED_UNLIMITED_CAPACITY",
  "HIGH_IMPACT_CROSS_DOCUMENT",
] as const;

export type VerificationRisk = (typeof VERIFICATION_PRIORITY)[number];

export interface VerificationCandidate {
  id: string;
  risks: readonly VerificationRisk[];
}

export type VerificationMode = "SAMPLE_DIAGNOSTIC" | "EXHAUSTIVE_CERTIFICATION";

export interface VerificationPlan {
  mode: VerificationMode;
  orderedIds: string[];
  /** Sample mode never certifies, including when every selected candidate is clean. */
  advancesCertification: false;
  exhaustive: boolean;
}

export function rankVerificationCandidates(candidates: readonly VerificationCandidate[]): VerificationCandidate[] {
  const rank = new Map(VERIFICATION_PRIORITY.map((risk, index) => [risk, index]));
  return [...candidates].sort((left, right) => {
    const leftRank = Math.min(...left.risks.map((risk) => rank.get(risk) ?? VERIFICATION_PRIORITY.length));
    const rightRank = Math.min(...right.risks.map((risk) => rank.get(risk) ?? VERIFICATION_PRIORITY.length));
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
}

export function planVerification(candidates: readonly VerificationCandidate[], mode: VerificationMode, sampleLimit: number | null): VerificationPlan {
  const ranked = rankVerificationCandidates(candidates);
  if (mode === "EXHAUSTIVE_CERTIFICATION") {
    return { mode, orderedIds: ranked.map((candidate) => candidate.id), advancesCertification: false, exhaustive: true };
  }
  const limit = sampleLimit ?? 0;
  return { mode, orderedIds: ranked.slice(0, limit).map((candidate) => candidate.id), advancesCertification: false, exhaustive: false };
}
