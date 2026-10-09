/**
 * NS-6 — contractual selector → snapshot identity resolution (types).
 *
 * Maps IR period/as-of selectors + evaluation date + explicit evidence
 * (fiscal calendar, delivery records) to exact 4B PeriodSelector / AsOfSelector.
 * Never "latest quarter"; never invents undelivered periods; never carry-forward.
 */
import type { AsOfSelector, PeriodSelector } from "../types";

/** Named selector kinds the resolution layer understands (explicit registry, not NLP). */
export type NamedContractualSelector =
  | "MOST_RECENTLY_ENDED_FISCAL_QUARTER"
  | "MOST_RECENTLY_ENDED_FISCAL_YEAR"
  | "FOUR_CONSECUTIVE_FISCAL_QUARTERS_MOST_RECENTLY_ENDED"
  | "MOST_RECENTLY_DELIVERED_FINANCIAL_STATEMENTS"
  | "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE"
  | "DATE_OF_TRANSACTION"
  | "EXACT_MEASUREMENT_DATE";

export type DeliveryKind = "FINANCIAL_STATEMENTS" | "COMPLIANCE_CERTIFICATE";

/** Company fiscal year-end; quarter boundaries are derived deterministically. */
export interface FiscalCalendar {
  companyId: string;
  /** Month of fiscal year end (1–12). Calendar year = 12. */
  fiscalYearEndMonth: number;
  /** Day of fiscal year end within that month (1–31); clamped to month length. */
  fiscalYearEndDay: number;
}

/**
 * Evidence that statements/certificates for a reporting period were delivered.
 * Without this, "most recently delivered" cannot resolve; undelivered periods
 * are never substituted.
 */
export interface DeliveryRecord {
  companyId: string;
  kind: DeliveryKind;
  /** Stable period key used on APPROVED snapshots (e.g. FY2026-Q2). */
  reportingPeriodKey: string;
  /** Period-end as-of (ISO date). */
  asOfIsoDate: string;
  /** When the package was delivered (ISO date). */
  deliveredAtIsoDate: string;
  documentId: string;
  sourceVersionHash?: string;
}

export interface SelectorResolutionPolicy {
  /**
   * When resolving "most recently ended …", require a matching delivery record
   * on or before the evaluation date. Default true — undelivered periods refuse.
   */
  requireDeliveryEvidence: boolean;
  /** Competing equal-rank deliveries → AMBIGUOUS (never silent pick). */
  onCompetingDeliveries: "AMBIGUOUS";
}

export const DEFAULT_SELECTOR_RESOLUTION_POLICY: SelectorResolutionPolicy = {
  requireDeliveryEvidence: true,
  onCompetingDeliveries: "AMBIGUOUS",
};

/** Input: contractual wording or named kind + evaluation context + evidence. */
export interface ResolveSelectorRequest {
  companyId: string;
  /** ISO evaluation / transaction date. */
  evaluationDate: string;
  /**
   * Either a named kind, or verbatim contract text that must match the registry
   * (unknown text → NEEDS_INPUT, never guessed).
   */
  selector: NamedContractualSelector | { verbatim: string };
  /** Required for fiscal-period selectors. */
  fiscalCalendar?: FiscalCalendar | null;
  /** Delivery evidence pool (filtered to company). */
  deliveries?: readonly DeliveryRecord[];
  /** Explicit ISO measurement date when selector is EXACT_MEASUREMENT_DATE. */
  measurementDate?: string | null;
  policy?: SelectorResolutionPolicy;
}

export type SelectorResolutionState = "RESOLVED" | "AMBIGUOUS" | "NEEDS_INPUT";

export interface SelectorResolutionEvidence {
  fiscalCalendarUsed: boolean;
  deliveryDocumentIds: string[];
  method: string;
  note?: string;
}

export type SelectorResolutionResult =
  | {
      state: "RESOLVED";
      period: PeriodSelector;
      asOf: AsOfSelector;
      reportingPeriodKey: string | null;
      evidence: SelectorResolutionEvidence;
    }
  | {
      state: "AMBIGUOUS";
      reason: string;
      candidates: Array<{ reportingPeriodKey: string; asOfIsoDate: string; documentId: string }>;
      evidence: SelectorResolutionEvidence;
    }
  | {
      state: "NEEDS_INPUT";
      reason: string;
      missing: string[];
      evidence: SelectorResolutionEvidence;
    };
