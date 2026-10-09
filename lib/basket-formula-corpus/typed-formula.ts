/**
 * Typed formula IR for research corpus use.
 * Not wired into the production capacity engine.
 * Components must cite source evidence; otherwise status is UNSUPPORTED / REVIEW_REQUIRED.
 */

export type TypedFormulaStatus = "REPRESENTED" | "UNSUPPORTED" | "REVIEW_REQUIRED";

export type TypedNodeKind =
  | "FIXED_DOLLAR"
  | "PERCENT_OF_METRIC"
  | "GREATER_OF"
  | "LESSER_OF"
  | "SUM"
  | "DIFFERENCE"
  | "RATIO_GATE"
  | "BUILDER"
  | "CUMULATIVE_CREDIT"
  | "EQUITY_CONTRIBUTION"
  | "REPLENISHMENT"
  | "ANTI_DOUBLE_COUNTING"
  | "SHARED_CAPACITY"
  | "RECLASSIFICATION"
  | "REFERENCE"
  | "UNSUPPORTED";

export interface SourceCitation {
  span: string;
  documentPath: string;
  note?: string;
}

export interface TypedFormulaNode {
  kind: TypedNodeKind;
  citation: SourceCitation;
  /** ISO-ish currency code when source states one; null if silent. */
  currency: string | null;
  unit: "USD" | "PERCENT" | "RATIO" | "COUNT" | "UNKNOWN" | null;
  measurementDate: string | null;
  children?: TypedFormulaNode[];
  /** Leaf literals when source-stated. */
  literal?: {
    amount?: string;
    percentage?: string;
    metric?: string;
    ratioOp?: "<=" | ">=" | "<" | ">" | "=";
    ratioThreshold?: string;
    termRef?: string;
  };
  assumptionsRequired?: string[];
}

export interface TypedFormulaRepresentation {
  candidateId: string;
  status: TypedFormulaStatus;
  root: TypedFormulaNode | null;
  reasons: string[];
  /** Dependencies that must resolve before executability. */
  unresolvedDependencies: string[];
  executable: false; // research corpus never marks executable without resolved deps + reviewer verification
}

export function unsupportedFormula(candidateId: string, reasons: string[], deps: string[] = []): TypedFormulaRepresentation {
  return {
    candidateId,
    status: "UNSUPPORTED",
    root: null,
    reasons,
    unresolvedDependencies: deps,
    executable: false,
  };
}

export function reviewRequiredFormula(candidateId: string, reasons: string[], deps: string[] = []): TypedFormulaRepresentation {
  return {
    candidateId,
    status: "REVIEW_REQUIRED",
    root: null,
    reasons,
    unresolvedDependencies: deps,
    executable: false,
  };
}
