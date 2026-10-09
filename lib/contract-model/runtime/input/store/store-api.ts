/**
 * Shared store surface for NS-4 certificate propose/approve (sync + durable async).
 */
import type { FinancialSnapshot } from "../types";
import type { AppendSnapshotRequest, ApprovalTransition, WriteResult } from "./types";

/** In-memory sealed store (sync). */
export interface SyncApprovedSnapshotStore {
  appendSnapshot(request: AppendSnapshotRequest): WriteResult;
  approveSnapshot(approval: ApprovalTransition): WriteResult;
  getSnapshot(snapshotId: string): FinancialSnapshot | null;
  getSnapshots(companyId: string): FinancialSnapshot[];
}

/** Durable Prisma-backed store (async writes). */
export interface AsyncApprovedSnapshotStore {
  appendSnapshot(request: AppendSnapshotRequest): Promise<WriteResult>;
  approveSnapshot(approval: ApprovalTransition): Promise<WriteResult>;
  getSnapshot(snapshotId: string): FinancialSnapshot | null;
  getSnapshots(companyId?: string): FinancialSnapshot[];
}
