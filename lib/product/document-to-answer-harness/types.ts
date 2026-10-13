/**
 * Document-to-answer acceptance harness types (Workstream C).
 *
 * Non-authoritative by default: never elevates PRODUCTION_AUTHORITY.
 * Preserves upstream uncertainty and refusal semantics through every stage.
 */

export type HarnessMode = "NON_AUTHORITATIVE" | "PRODUCTION_AUTHORITY";

export type HarnessStageId =
  | "source_documents"
  | "compilation"
  | "operative_authority"
  | "financial_state"
  | "capacity_simulation"
  | "output";

export type StageDisposition =
  | "PASS"
  | "REFUSE"
  | "UNSUPPORTED"
  | "AMBIGUOUS"
  | "NEEDS_INPUT"
  | "SKIPPED";

export interface HarnessStageResult {
  stage: HarnessStageId;
  disposition: StageDisposition;
  detail: string;
  /** Uncertainty / refusal codes preserved from upstream. */
  uncertaintyCodes: string[];
  citations: string[];
  /** Numeric claims emitted at this stage (null when refused). */
  numericClaims: Array<{
    label: string;
    amountUsd: number | null;
    claimKind: "GROSS_CONTRACTUAL" | "MODELED_HYPOTHETICAL" | "VERIFIED_REMAINING" | "AVAILABLE" | "NONE";
    authoritative: boolean;
  }>;
}

export interface DocumentToAnswerQuestion {
  questionId: string;
  /** Natural-language or structured transaction question. */
  prompt: string;
  companyId: string;
  packageKey: string;
  instrumentKey?: string;
  asOfDate: string;
  /** Contemplated transaction amount when relevant. */
  contemplatedAmountUsd?: number | null;
  documents: Array<{
    documentId: string;
    text: string;
    label?: string;
  }>;
  /** Optional approved snapshot facts — missing → NEEDS_INPUT, never invented. */
  approvedFinancialFacts?: ReadonlyArray<{
    key: string;
    amountUsd: number;
    asOfDate: string;
    approvalStatus: "APPROVED" | "DRAFT" | "REVIEW_REQUIRED";
  }>;
  /** Optional ledger usage — missing → cannot compute remaining. */
  ledgerUsageUsd?: number | null;
}

export interface DocumentToAnswerTrace {
  version: string;
  mode: HarnessMode;
  questionId: string;
  startingSha: string | null;
  stages: HarnessStageResult[];
  /** Final answer — never authoritative in NON_AUTHORITATIVE mode. */
  answer: {
    disposition: StageDisposition;
    summary: string;
    availableCapacityUsd: null;
    grossContractualUsd: number | null;
    modeledHypotheticalUsd: number | null;
    authoritative: false | true;
    blockers: string[];
    provenance: string[];
  };
  integrity: {
    uncertaintyPreserved: boolean;
    refusedAuthoritativeWhenBlocked: boolean;
    productionAuthorityPublished: boolean;
  };
}
