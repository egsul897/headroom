/** Standalone Headroom flywheel — no external bot/box in the loop. */

export const FLYWHEEL_LOCK_NAME = "headroom-flywheel" as const;
export const AUTHORITY_STATUS = "COMPUTED_NOT_CERTIFIED" as const;

export type FlywheelSlice =
  | "EDGAR_EXPAND"
  | "PRECEDENT_IMPORT"
  | "SWEEP_SOURCES"
  | "SWEEP_PROPOSALS"
  | "STATUS_ONLY";

export type FlywheelRunStatus =
  | "RUNNING"
  | "OK"
  | "FAILED"
  | "SKIPPED_LOCKED"
  | "SKIPPED_CONFIG";

export interface FlywheelSliceResult {
  runId: string;
  slice: FlywheelSlice;
  status: FlywheelRunStatus;
  epoch?: number;
  sourcesProcessed?: number;
  candidatesEvaluated?: number;
  proposalsAccepted?: number;
  proposalsRejected?: number;
  errorRateByClass?: Record<string, number>;
  detail?: Record<string, unknown>;
  errorMessage?: string;
  startedAt: string;
  finishedAt: string;
}

export interface FlywheelStatus {
  authorityStatus: typeof AUTHORITY_STATUS;
  paidInferenceUsed: false; // flywheel never uses paid models
  lock: {
    held: boolean;
    holderId: string | null;
    expiresAt: string | null;
  };
  latestRun: {
    runId: string;
    slice: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    epoch: number | null;
    sourcesProcessed: number;
    candidatesEvaluated: number;
    proposalsAccepted: number;
    proposalsRejected: number;
    errorRateByClass: Record<string, number> | null;
    errorMessage: string | null;
  } | null;
  ruleset: {
    version: number | null;
    acceptedCount: number;
    updatedAt: string | null;
  };
  checkpoint: {
    epoch: number | null;
    phase: string | null;
    sourcesComplete: boolean | null;
    candidateIndex: number | null;
    afterSourceId: string | null;
  };
  counts: {
    knowledgeSources: number;
    learningProposals: number;
    openAlerts: number;
  };
  recentAlerts: Array<{
    alertId: string;
    severity: string;
    kind: string;
    message: string;
    runId: string | null;
    createdAt: string;
  }>;
  scheduleHint: {
    vercelCron: string;
    githubActions: string;
  };
}
