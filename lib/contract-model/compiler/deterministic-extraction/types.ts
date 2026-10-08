/**
 * Deterministic covenant facts vs semantic hypotheses.
 *
 * Facts come only from structural/index/discovery signals and regex/span
 * evidence. Hypotheses are explicitly labelled and NEVER imply permission
 * or operative authority.
 */
export const DETERMINISTIC_EXTRACTION_VERSION = "deterministic-covenant-extraction.v2";

export type FactKind =
  | "COVENANT_FAMILY_SIGNAL"
  | "DEFINITION"
  | "CROSS_REFERENCE"
  | "EXCEPTION_MARKER"
  | "PROVISO_MARKER"
  | "NUMERICAL_THRESHOLD"
  | "FINANCIAL_RATIO"
  | "AMENDMENT_RELATIONSHIP"
  | "ENTITY_SCOPE_SIGNAL"
  | "SHARED_CAPACITY_SIGNAL";

export type HypothesisKind =
  | "PERMISSION_GUESS"
  | "PROHIBITION_GUESS"
  | "BASKET_TYPE_GUESS"
  | "CAPACITY_FORMULA_GUESS"
  | "OPERATIVE_AUTHORITY_GUESS"
  | "AMENDMENT_AUTHORITY_GUESS";

export interface SourceSpan {
  documentId: string | null;
  startOffset: number | null;
  endOffset: number | null;
  citation: string | null;
  excerpt: string;
}

export interface DeterministicFact {
  factId: string;
  kind: FactKind;
  /** Structured payload; never a permission verdict. */
  value: Record<string, unknown>;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  source: SourceSpan;
  /** Explicit: a threshold fact does not authorize a transaction. */
  doesNotImplyPermission: true;
  /** Explicit: structural recognition does not establish operative authority. */
  doesNotImplyOperativeAuthority: true;
}

export interface SemanticHypothesis {
  hypothesisId: string;
  kind: HypothesisKind;
  claim: string;
  status: "UNRESOLVED";
  requiresVerification: true;
  relatedFactIds: string[];
  source: SourceSpan | null;
}

export interface DeterministicExtractionResult {
  version: typeof DETERMINISTIC_EXTRACTION_VERSION;
  documentId: string | null;
  candidateRef: string | null;
  facts: DeterministicFact[];
  hypotheses: SemanticHypothesis[];
  inventory: {
    covenantFamilySignals: string[];
    definitions: string[];
    crossReferences: string[];
    exceptions: string[];
    provisos: string[];
    numericalThresholds: string[];
    financialRatios: string[];
    entityScopeSignals: string[];
    sharedCapacitySignals: string[];
  };
}
