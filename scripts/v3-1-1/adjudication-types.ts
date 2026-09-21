/** Shapes for the §8 source-grounded deterministic adjudication. */

export type AffectedBucket =
  | "PRIOR_ADJUDICATION_STILL_VALID"
  | "READJUDICATION_REQUIRED_BENCHMARK_CHANGE"
  | "READJUDICATION_REQUIRED_EVIDENCE_REPAIR"
  | "READJUDICATION_REQUIRED_SOURCE_RESOLUTION"
  | "READJUDICATION_REQUIRED_RUBRIC_DEPENDENCY";

export type Credit = "CREDIT" | "NO_CREDIT" | "ABSTAIN";
export type Completeness = "FULL" | "PARTIAL" | "NONE";
export type CompositeSurfacing =
  | "FULLY_SURFACED"
  | "PARTIALLY_SURFACED"
  | "NOT_SPECIFICALLY_SURFACED"
  | "NOT_APPLICABLE"
  | "RUBRIC_AMBIGUOUS"
  | "ABSTAIN";

export interface AdjudicatedProposition {
  id: string;
  /** Stated as the source states it. Placeholders are rejected by the validation tests. */
  proposition: string;
  sourceQuotation: string;
  independence: "MATERIAL_INDEPENDENT" | "QUALIFIER";
  /** Exact candidateId of the SUBSTANTIVE_REPRESENTATION that captures it, or null. */
  representedBy: string | null;
  /** Exact candidateIds of the claim-specific flags that surface it. Empty when none does. */
  surfacedBy: string[];
}

export interface Adjudication {
  caseId: string;
  bucket: AffectedBucket;
  /** Non-null only where §3 or §4 changed the claim text. */
  correctedGroundTruthClaim: string | null;
  propositions: AdjudicatedProposition[];
  /** §8 step 4: every candidate this adjudication relied on, by exact id. */
  candidatesCited: string[];
  credit: Credit;
  completeness: Completeness;
  compositeSurfacing: CompositeSurfacing;
  dangerousSilentOmission: boolean;
  priorConsensus: { credit: Credit; surfacingBinary: string; completeness: Completeness };
  reasoning: string;
}

/** §8 step 9 + V3.1 binaryCompatibilityMapping. */
export function toBinarySurfacing(state: CompositeSurfacing): string {
  switch (state) {
    case "FULLY_SURFACED":
      return "SPECIFICALLY_SURFACED";
    case "NOT_APPLICABLE":
      return "NOT_APPLICABLE";
    case "PARTIALLY_SURFACED":
    case "NOT_SPECIFICALLY_SURFACED":
      return "NOT_SPECIFICALLY_SURFACED";
    default:
      return state;
  }
}
