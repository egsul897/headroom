/**
 * Shared NS-4 APPROVED financial identity for Dashboard / Position / Simulate.
 *
 * Thin projection over loadApprovedFinancialInputBundle — the canonical binder
 * from #334 (persisted-delivery cutoff, fingerprint, IR leverage). Never upgrades
 * verified remaining / AVAILABLE.
 */

import {
  loadApprovedFinancialInputBundle,
  type ApprovedFinancialInputBundle,
} from "@/lib/product/north-star-workflow/approved-financial-inputs";
import type { AuthoritativeCapacityResult } from "@/lib/product/north-star-workflow/authoritative-capacity";

export interface SharedNs4FinancialIdentity {
  companyId: string;
  evaluationDate: string | null;
  bundle: ApprovedFinancialInputBundle;
  boundSnapshotId: string | null;
  financialInputFingerprint: string | null;
  reportingPeriod: string | null;
  asOf: string | null;
  approvedSnapshotCount: number;
  cutoffState: string;
  /** True when binder bound id matches authoritative capacity cutoff snapshot. */
  identityConsistentWithAuthoritative: boolean | null;
  missingInputs: string[];
  evidenceLines: string[];
}

export function sharedIdentityFromApprovedBundle(
  bundle: ApprovedFinancialInputBundle,
  authoritative?: AuthoritativeCapacityResult | null,
  approvedSnapshotCount?: number,
): SharedNs4FinancialIdentity {
  const boundSnapshotId = bundle.boundSnapshotId ?? authoritative?.cutoff.approvedSnapshotId ?? null;
  const authBound = authoritative?.cutoff.approvedSnapshotId ?? null;
  const identityConsistentWithAuthoritative =
    authoritative == null
      ? null
      : boundSnapshotId != null && authBound != null
        ? boundSnapshotId === authBound
        : boundSnapshotId == null && authBound == null;

  const evidenceLines: string[] = [
    `NS-4 binder status: ${bundle.status} (${bundle.authority.kind})`,
    `Selector: ${bundle.selector}`,
    `Cutoff: ${bundle.cutoff.state}${
      bundle.cutoff.reportingPeriodKey ? ` · ${bundle.cutoff.reportingPeriodKey}` : ""
    }${boundSnapshotId ? ` · snapshot ${boundSnapshotId}` : ""}`,
  ];
  if (bundle.financialInputFingerprint) {
    evidenceLines.push(`Fingerprint: ${bundle.financialInputFingerprint.slice(0, 16)}…`);
  }
  if (bundle.leverageIr.computedRatio) {
    evidenceLines.push(`IR TNL: ${bundle.leverageIr.computedRatio} (${bundle.leverageIr.status})`);
  }
  for (const e of bundle.evidence.slice(0, 6)) evidenceLines.push(e);
  for (const m of bundle.missingInputs) evidenceLines.push(`missing: ${m}`);

  return {
    companyId: bundle.companyId,
    evaluationDate: bundle.evaluationDate,
    bundle,
    boundSnapshotId,
    financialInputFingerprint: bundle.financialInputFingerprint,
    reportingPeriod: bundle.cutoff.reportingPeriodKey,
    asOf: bundle.cutoff.asOf,
    approvedSnapshotCount:
      approvedSnapshotCount ??
      authoritative?.approvedSnapshotCount ??
      (bundle.status === "NEEDS_INPUT" ? 0 : 1),
    cutoffState: bundle.cutoff.state,
    identityConsistentWithAuthoritative,
    missingInputs: [...bundle.missingInputs],
    evidenceLines,
  };
}

/** Load shared NS-4 identity via the canonical APPROVED financial binder. */
export async function loadSharedNs4FinancialIdentity(args: {
  companyId: string;
  evaluationDate?: string;
  authoritative?: AuthoritativeCapacityResult | null;
}): Promise<SharedNs4FinancialIdentity> {
  const bundle = await loadApprovedFinancialInputBundle({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
  });
  return sharedIdentityFromApprovedBundle(
    bundle,
    args.authoritative,
    args.authoritative?.approvedSnapshotCount,
  );
}
