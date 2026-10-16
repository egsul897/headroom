/**
 * Rule 79 — the shared NS-4 identity must not invent a bound
 * snapshot from a different context.
 *
 * sharedIdentityFromApprovedBundle built boundSnapshotId as
 * `bundle.boundSnapshotId ?? authoritative.cutoff.approvedSnapshotId`.
 * When the bundle did not bind, the fallback pulled the
 * authoritative capacity's snapshot — which may have been
 * computed with a different evaluation date / selector — and
 * labeled it the bundle's bound snapshot. The consistency check
 * then compared authoritative to itself (circular) and reported
 * "consistent" when the bundle contributed nothing.
 *
 * With consistent inputs the fallback never fires (bundle and
 * authoritative resolve the same cutoff), so removing it changes
 * no live behavior — it only removes the cross-context invention.
 * boundSnapshotId is now exactly the bundle's own binding.
 *
 * Prisma-free: pure projection, unit-testable without a
 * generated Prisma client.
 */
import type { ApprovedFinancialInputBundle } from "./north-star-workflow/approved-financial-inputs";
import type { AuthoritativeCapacityResult } from "./north-star-workflow/authoritative-capacity";

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
  // Rule 79: no fallback to authoritative's snapshot. The
  // bundle's binding is its own; when it did not bind, the
  // identity honestly reports null.
  const boundSnapshotId = bundle.boundSnapshotId;
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
