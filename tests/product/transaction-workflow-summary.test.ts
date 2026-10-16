/**
 * Rule 77 — never fall back to an arbitrary approved snapshot as
 * the transaction's bound snapshot.
 *
 * answerAsk built transactionWorkflow.approvedSnapshotId as
 * `cutoff.snapshotId ?? approvedSnapshotIds[0]`. When the cutoff
 * bound to nothing (unresolved), the fallback picked the FIRST
 * approved snapshot and labeled it the transaction's approved
 * snapshot, inventing a binding the cutoff never made. And when
 * the cutoff bound to a SUPERSEDED snapshot, it mislabeled that
 * approved too. approvedSnapshotId is now the cutoff-bound
 * snapshot ONLY when actually APPROVED.
 */
import { describe, expect, it } from "vitest";
import { buildTransactionWorkflowSummary } from "../../lib/ask/transaction-workflow-summary";
import type { TransactionWorkflowReadiness } from "../../lib/product/north-star-workflow/transaction-readiness";

function readiness(overrides: Partial<TransactionWorkflowReadiness> = {}): TransactionWorkflowReadiness {
  return {
    companyId: "co-1",
    steps: {
      documentsUploaded: "READY",
      counselExecutableRules: "LEGACY_ONLY",
      approvedFinancialSnapshot: "READY",
      historicalLedger: "READY",
      cutoffResolvable: "READY",
    },
    legacyCapacity: {} as TransactionWorkflowReadiness["legacyCapacity"],
    northStar: {
      approvedSnapshotCount: 1,
      approvedSnapshotIds: ["snap-approved"],
      contractLedgerUsageCount: 0,
      activeLedgerUsageCount: 0,
    },
    cutoff: {
      state: "RESOLVED",
      reportingPeriodKey: "2026Q2",
      asOf: "2026-06-30",
      snapshotId: "snap-approved",
    },
    blockers: [],
    nextActions: [],
    canRunTransactionWorkflow: true,
    authorityNote: "note",
    ...overrides,
  };
}

describe("buildTransactionWorkflowSummary", () => {
  it("binds the approved cutoff snapshot when the cutoff resolved to it", () => {
    const summary = buildTransactionWorkflowSummary(readiness());
    expect(summary.approvedSnapshotId).toBe("snap-approved");
    expect(summary.cutoffSnapshotId).toBe("snap-approved");
    expect(summary.cutoffSnapshotStatus).toBe("APPROVED");
  });

  it("does NOT fall back to the first approved snapshot when the cutoff bound to nothing", () => {
    const summary = buildTransactionWorkflowSummary(
      readiness({ cutoff: { state: "NEEDS_INPUT", reason: "evaluationDate required", missing: ["evaluationDate"] } }),
    );
    expect(summary.approvedSnapshotId).toBeNull();
    expect(summary.cutoffSnapshotId).toBeNull();
    expect(summary.cutoffSnapshotStatus).toBeNull();
  });

  it("does NOT label a SUPERSEDED cutoff-bound snapshot as approved", () => {
    const summary = buildTransactionWorkflowSummary(
      readiness({
        cutoff: {
          state: "RESOLVED",
          reportingPeriodKey: "2026Q2",
          asOf: "2026-06-30",
          snapshotId: "snap-superseded",
        },
      }),
    );
    expect(summary.approvedSnapshotId).toBeNull();
    expect(summary.cutoffSnapshotId).toBe("snap-superseded");
    expect(summary.cutoffSnapshotStatus).toBe("SUPERSEDED");
  });
});
