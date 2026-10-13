/**
 * Shared NS-4 APPROVED snapshot identity for Dashboard / Position / Simulate.
 *
 * Presentation only — never upgrades verified remaining / AVAILABLE.
 * Bound snapshot id + cutoff must match across the three surfaces when the
 * same companyId + evaluationDate are used.
 */

import {
  loadNs4DashboardFinancialState,
  type Ns4DashboardFinancialState,
} from "@/lib/dashboard/ns4-financial-panel";
import type { AuthoritativeCapacityResult } from "@/lib/product/north-star-workflow/authoritative-capacity";

export interface SharedNs4FinancialIdentity {
  companyId: string;
  evaluationDate: string | null;
  dashboard: Ns4DashboardFinancialState;
  /** Snapshot id bound by contractual cutoff when resolved; else null. */
  boundSnapshotId: string | null;
  reportingPeriod: string | null;
  asOf: string | null;
  approvedSnapshotCount: number;
  cutoffState: string;
  /** True when Dashboard band and authoritative capacity agree on bound id. */
  identityConsistentWithAuthoritative: boolean | null;
  missingInputs: string[];
  evidenceLines: string[];
}

export function sharedIdentityFromNs4Band(
  dashboard: Ns4DashboardFinancialState,
  authoritative?: AuthoritativeCapacityResult | null,
): SharedNs4FinancialIdentity {
  const boundSnapshotId =
    dashboard.boundSnapshot?.snapshotId ??
    authoritative?.cutoff.approvedSnapshotId ??
    null;
  const authBound = authoritative?.cutoff.approvedSnapshotId ?? null;
  const identityConsistentWithAuthoritative =
    authoritative == null
      ? null
      : boundSnapshotId != null && authBound != null
        ? boundSnapshotId === authBound
        : dashboard.approvedSnapshotCount === authoritative.approvedSnapshotCount;

  const evidenceLines: string[] = [
    `NS-4 band status: ${dashboard.status} (${dashboard.authority})`,
    `APPROVED snapshots: ${dashboard.approvedSnapshotCount}`,
    `Cutoff: ${dashboard.cutoff.state}${
      dashboard.cutoff.reportingPeriodKey ? ` · ${dashboard.cutoff.reportingPeriodKey}` : ""
    }${boundSnapshotId ? ` · snapshot ${boundSnapshotId}` : ""}`,
  ];
  if (dashboard.boundSnapshot) {
    evidenceLines.push(
      `Bound facts: ${dashboard.boundSnapshot.factCount} (asOf ${dashboard.boundSnapshot.asOf ?? "—"})`,
    );
  }
  for (const e of dashboard.evidence.slice(0, 6)) evidenceLines.push(e);
  for (const m of dashboard.missingInputs) evidenceLines.push(`missing: ${m}`);

  return {
    companyId: dashboard.companyId,
    evaluationDate: dashboard.evaluationDate,
    dashboard,
    boundSnapshotId,
    reportingPeriod:
      dashboard.boundSnapshot?.reportingPeriod ?? dashboard.cutoff.reportingPeriodKey,
    asOf: dashboard.boundSnapshot?.asOf ?? dashboard.cutoff.asOf,
    approvedSnapshotCount: dashboard.approvedSnapshotCount,
    cutoffState: dashboard.cutoff.state,
    identityConsistentWithAuthoritative,
    missingInputs: [...dashboard.missingInputs],
    evidenceLines,
  };
}

/** Load Dashboard NS-4 band and project shared identity (optional authoritative cross-check). */
export async function loadSharedNs4FinancialIdentity(args: {
  companyId: string;
  evaluationDate?: string;
  authoritative?: AuthoritativeCapacityResult | null;
}): Promise<SharedNs4FinancialIdentity> {
  const dashboard = await loadNs4DashboardFinancialState({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
  });
  return sharedIdentityFromNs4Band(dashboard, args.authoritative);
}
