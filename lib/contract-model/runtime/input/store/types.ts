/**
 * NS-4 slice 1 — store-facing types for the append-only approved financial snapshot store.
 *
 * Consumes frozen Phase 4B `FinancialSnapshot` identity. Does not change 4B resolver semantics.
 * APPROVED is reachable only via an attributable approval transition; raw append accepts
 * DRAFT | REVIEW_REQUIRED only.
 */
import type { FinancialSnapshot, SnapshotStatus } from "../types";
import type { SnapshotIssue, SnapshotIssueCode } from "../snapshot";

/** Statuses accepted on a raw append (proposal). */
export const APPENDABLE_STATUSES: readonly SnapshotStatus[] = ["DRAFT", "REVIEW_REQUIRED"];

/** Statuses that refuse raw append. */
export const APPEND_REFUSED_STATUSES: readonly SnapshotStatus[] = ["APPROVED", "SUPERSEDED"];

export type StoreEventType = "SNAPSHOT_APPENDED" | "SNAPSHOT_APPROVED" | "SNAPSHOT_SUPERSEDED";

export interface SnapshotAppendedEvent {
  type: "SNAPSHOT_APPENDED";
  eventId: string;
  at: string;
  snapshot: FinancialSnapshot;
}

export interface SnapshotApprovedEvent {
  type: "SNAPSHOT_APPROVED";
  eventId: string;
  at: string;
  snapshotId: string;
  companyId: string;
  reviewedBy: string;
  reviewedAt: string;
  approvalRef: string;
}

export interface SnapshotSupersededEvent {
  type: "SNAPSHOT_SUPERSEDED";
  eventId: string;
  at: string;
  snapshotId: string;
  companyId: string;
  supersededBy: string;
}

export type StoreEvent = SnapshotAppendedEvent | SnapshotApprovedEvent | SnapshotSupersededEvent;

/**
 * Store-local issue codes in addition to the nine Phase 4B unsafe-graph codes.
 * All nine graph codes are write-blocking here (stricter than 4B resolve, which marks some non-fatal).
 */
export type StoreWriteIssueCode =
  | SnapshotIssueCode
  | "APPEND_STATUS_NOT_ALLOWED"
  | "SNAPSHOT_NOT_FOUND"
  | "SNAPSHOT_NOT_APPROVABLE"
  | "APPROVAL_FIELDS_REQUIRED"
  | "COMPANY_MISMATCH_ON_SUPERSESSION";

export interface StoreWriteIssue {
  code: StoreWriteIssueCode;
  message: string;
  snapshotIds: string[];
}

export interface AppendSnapshotRequest {
  /** Full 4B snapshot payload. status must be DRAFT | REVIEW_REQUIRED. */
  snapshot: FinancialSnapshot;
}

export interface ApprovalTransition {
  snapshotId: string;
  reviewedBy: string;
  reviewedAt: string;
  approvalRef: string;
}

export type WriteOk = {
  ok: true;
  /** Current materialization of the written / approved snapshot. */
  snapshot: FinancialSnapshot;
  /** Events appended by this write (including auto-supersession). */
  events: StoreEvent[];
};

export type WriteRejected = {
  ok: false;
  issues: StoreWriteIssue[];
};

export type WriteResult = WriteOk | WriteRejected;

export function graphIssuesToStoreIssues(issues: readonly SnapshotIssue[]): StoreWriteIssue[] {
  return issues.map((i) => ({ code: i.code, message: i.message, snapshotIds: [...i.snapshotIds] }));
}
