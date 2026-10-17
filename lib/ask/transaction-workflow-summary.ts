/**
 * Rule 77 — never fall back to an arbitrary approved snapshot as
 * the transaction's bound snapshot.
 *
 * answerAsk built transactionWorkflow.approvedSnapshotId as
 * `cutoff.snapshotId ?? approvedSnapshotIds[0]`. When the cutoff
 * bound to nothing (unresolved — e.g. no evaluation date), the
 * fallback picked the FIRST approved snapshot and labeled it the
 * transaction's approved snapshot, inventing a binding the cutoff
 * never made. And when the cutoff bound to a SUPERSEDED snapshot
 * (rule 76), the fallback path also mislabeled it approved.
 *
 * approvedSnapshotId is now the cutoff-bound snapshot ONLY when
 * it is actually APPROVED; cutoffSnapshotId/Status carry the
 * honest bound identity.
 *
 * Prisma-free: pure function over the readiness result, so it is
 * unit-testable without a generated Prisma client.
 */
import type { TransactionWorkflowReadiness } from "../product/north-star-workflow/transaction-readiness";
import {
  labelCutoffSnapshot,
  type CutoffSnapshotStatus,
} from "../product/north-star-workflow/cutoff-snapshot-label";

export interface TransactionWorkflowSummary {
  canRun: boolean;
  cutoffState?: string;
  reportingPeriodKey?: string | null;
  approvedSnapshotId?: string | null;
  cutoffSnapshotId?: string | null;
  cutoffSnapshotStatus?: CutoffSnapshotStatus;
  nextActions: Array<{ label: string; href: string }>;
  authorityNote: string;
}

export function buildTransactionWorkflowSummary(
  workflow: TransactionWorkflowReadiness,
): TransactionWorkflowSummary {
  const cutoffLabel = labelCutoffSnapshot(
    workflow.cutoff?.snapshotId ?? null,
    workflow.northStar.approvedSnapshotIds,
  );
  return {
    canRun: workflow.canRunTransactionWorkflow,
    cutoffState: workflow.cutoff?.state,
    reportingPeriodKey: workflow.cutoff?.reportingPeriodKey,
    approvedSnapshotId: cutoffLabel.approvedSnapshotId,
    cutoffSnapshotId: cutoffLabel.cutoffSnapshotId,
    cutoffSnapshotStatus: cutoffLabel.cutoffSnapshotStatus,
    nextActions: workflow.nextActions,
    authorityNote: workflow.authorityNote,
  };
}
