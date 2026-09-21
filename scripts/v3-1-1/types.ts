/**
 * Shapes for the V3.1.1 corrected benchmark corpus.
 *
 * Everything here is benchmark data and benchmark tooling. Nothing in the Phase-3
 * extraction / compiler / analyzer pipeline imports it.
 */

export type BenchmarkIntegrityStatus =
  | "VERIFIED"
  | "CORRECTED_FROM_PRIMARY_SOURCE"
  | "EVIDENCE_REPAIRED"
  | "IMPRECISE_NONMATERIAL"
  | "SOURCE_UNRESOLVED";

export type PropositionStatus = "SOURCE_CONFIRMED" | "SOURCE_PARTIALLY_CONFIRMED" | "SOURCE_CONTRADICTED";

export interface AtomicProposition {
  id: string;
  /** The proposition, stated as the source states it. Never a placeholder such as "remaining components". */
  proposition: string;
  status: PropositionStatus;
  /** Verbatim primary-source text supporting the proposition. */
  sourceQuotation: string;
  /**
   * MATERIAL_INDEPENDENT when losing this proposition would change whether a transaction
   * is permitted, or how much capacity exists. QUALIFIER when it is a measurement,
   * delivery or transitional convention attached to a proposition already listed.
   */
  independence: "MATERIAL_INDEPENDENT" | "QUALIFIER";
}

export interface ExcerptRepair {
  caseId: string;
  /** What the frozen V3.1 packet carried. */
  originalExcerpt: string;
  originalExcerptOffset: number;
  originalExcerptLandedIn: string;
  /** How the operative text is found, deterministically. */
  locator: { kind: "section" | "definition"; key: string };
  /** Regex source matched INSIDE the operative span to anchor the repaired excerpt. */
  anchor: string;
  maxChars: number;
  claimStillCorrect: boolean;
  claimDefectFound: string | null;
  note: string;
}

export interface CorrectedCase {
  caseId: string;
  groundTruthUnitId: string;
  documentId: string;
  claimSectionRef: string;
  materiality: string;
  benchmarkIntegrityStatus: BenchmarkIntegrityStatus;
  correctedGroundTruthClaim: string;
  primarySourcePath: string;
  primarySourceLocation: string;
  propositions: AtomicProposition[];
  correctionProvenance: {
    changedFromV31: boolean;
    changeKind: "CLAIM_CORRECTION" | "EVIDENCE_REPAIR" | "SOURCE_RESOLUTION" | "NONE";
    originatingAudit: string;
    foundBy: "PRIOR_INTEGRITY_AUDIT" | "THIS_MISSION";
    supersededClaimText: string | null;
    defectType: string | null;
    scoringImpact: string | null;
  };
}
