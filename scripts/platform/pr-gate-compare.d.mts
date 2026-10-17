export type PrGateCause =
  | "needs_db_or_env"
  | "stale_prisma_client"
  | "snapshot_drift"
  | "timeout"
  | "assertion_regression"
  | "unspecified";

export interface PrGateRow {
  file: string;
  fullName: string;
  cause: PrGateCause;
  detail: string;
}

export interface PrGateComparison {
  preExisting: PrGateRow[];
  regressions: PrGateRow[];
  fixed: PrGateRow[];
  suppressed: PrGateRow[];
  fail: boolean;
}

export function classifyFailure(message: string): PrGateCause;
export function compareRuns(baseReport: unknown, headReport: unknown): PrGateComparison;
export function toRepoRelative(filePath: string): string;
export function renderReport(result: PrGateComparison, labels?: { base?: string; head?: string }): string;
