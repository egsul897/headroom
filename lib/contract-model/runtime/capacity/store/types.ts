/**
 * NS / roadmap step 8 — append-only persisted 4C ledger write surface.
 * Distinct from legacy LedgerEntry. Never deletes; corrections supersede.
 */
import type { CapacityPathRef, LedgerUsageRecord, UsageStatus } from "../types";

export type LedgerStoreEventType = "USAGE_APPENDED" | "USAGE_SUPERSEDED";

export interface UsageAppendedEvent {
  type: "USAGE_APPENDED";
  eventId: string;
  at: string;
  usage: LedgerUsageRecord;
}

export interface UsageSupersededEvent {
  type: "USAGE_SUPERSEDED";
  eventId: string;
  at: string;
  companyId: string;
  /** Predecessor usage id that becomes SUPERSEDED. */
  usageId: string;
  /** Successor usage id that names the predecessor via supersededByUsageId on the predecessor. */
  successorUsageId: string;
}

export type LedgerStoreEvent = UsageAppendedEvent | UsageSupersededEvent;

export type LedgerWriteIssueCode =
  | "DUPLICATE_USAGE_ID"
  | "SELF_SUPERSESSION"
  | "SUPERSEDES_UNKNOWN_USAGE"
  | "USAGE_WITHOUT_CURRENCY"
  | "USAGE_AMOUNT_NOT_REPRESENTABLE"
  | "COMPANY_MISMATCH"
  | "MISSING_ATTRIBUTION"
  | "INVALID_STATUS_ON_APPEND";

export interface LedgerWriteIssue {
  code: LedgerWriteIssueCode;
  message: string;
  usageIds: string[];
}

export type LedgerWriteResult =
  | { ok: true; usage: LedgerUsageRecord; events: LedgerStoreEvent[] }
  | { ok: false; issues: LedgerWriteIssue[] };

export interface AppendUsageRequest {
  usage: LedgerUsageRecord;
}

export interface SupersedeUsageRequest {
  /** Existing usage to mark SUPERSEDED. */
  predecessorUsageId: string;
  /** Full successor record (must set supersededByUsageId null; status RECORDED). */
  successor: LedgerUsageRecord;
  /** Attribution required for audit. */
  supersessionRef: string;
  supersededAt: string;
  supersededBy: string;
}
