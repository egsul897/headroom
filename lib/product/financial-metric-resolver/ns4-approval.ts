/**
 * Validate persisted NS-4 APPROVED snapshots for canonical financial authority.
 *
 * APPROVED_SNAPSHOT is granted only when a FinancialSnapshot passes structural
 * validation (status, reviewer, approvalRef, company/instrument scope, period, as-of).
 * Caller string overrides cannot promote provisional/synthetic packages.
 */

import type { FinancialSnapshot, InputScope } from "@/lib/contract-model/north-star-bridge";
import { classifyApprovedSnapshotAuthority } from "@/lib/financial-certificate-engine/authority";
import type { RegisteredFinancialPackage } from "./registry";
import type { FinancialEvidenceAuthority } from "./types";

export type Ns4ApprovalValidation =
  | {
      ok: true;
      evidenceAuthority: "APPROVED_SNAPSHOT";
      snapshotId: string;
      reviewedBy: string;
      approvalRef: string;
      authorityDisclosure: string;
      realReviewerApproval: boolean;
    }
  | {
      ok: false;
      reasons: string[];
    };

function instrumentInScope(scope: InputScope, instrumentKey: string): boolean {
  if (scope.kind === "INSTRUMENT_LEVEL") {
    return scope.instrumentKey === instrumentKey;
  }
  if (scope.instrumentApplicability.kind === "ALL_INSTRUMENTS") return true;
  return scope.instrumentApplicability.instrumentKeys.includes(instrumentKey);
}

function snapshotCoversInstrument(snap: FinancialSnapshot, instrumentKey: string): boolean {
  if (snap.inputs.length === 0) {
    // Empty fact set cannot prove instrument scope — refuse.
    return false;
  }
  return snap.inputs.every((inp) => instrumentInScope(inp.identity.scope, instrumentKey));
}

/**
 * Validate that `snap` is a persisted NS-4 APPROVED snapshot applicable to `pkg`.
 * Does not invent approval. Does not accept status strings alone.
 */
export function validateApprovedNs4SnapshotForPackage(
  snap: FinancialSnapshot,
  pkg: RegisteredFinancialPackage,
  opts?: { productionContext?: boolean },
): Ns4ApprovalValidation {
  const reasons: string[] = [];

  if (snap.status !== "APPROVED") {
    reasons.push(`snapshot status is ${snap.status}, not APPROVED`);
  }
  if (!snap.snapshotId?.trim()) {
    reasons.push("snapshot identity (snapshotId) missing");
  }
  if (snap.companyId !== pkg.companyId) {
    reasons.push(
      `company scope mismatch: snapshot companyId=${snap.companyId} vs package companyId=${pkg.companyId}`,
    );
  }
  if (snap.asOf !== pkg.asOf) {
    reasons.push(`as-of mismatch: snapshot asOf=${snap.asOf} vs package asOf=${pkg.asOf}`);
  }
  if (snap.reportingPeriod !== pkg.measurementPeriod) {
    reasons.push(
      `measurement period mismatch: snapshot reportingPeriod=${snap.reportingPeriod} vs package measurementPeriod=${pkg.measurementPeriod}`,
    );
  }
  if (!snapshotCoversInstrument(snap, pkg.instrumentKey)) {
    reasons.push(
      `instrument scope mismatch: snapshot inputs do not cover instrumentKey=${pkg.instrumentKey}`,
    );
  }

  const reviewedBy = snap.review?.reviewedBy?.trim() ?? "";
  const approvalRef = snap.review?.approvalRef?.trim() ?? "";
  if (!reviewedBy) reasons.push("reviewer authority missing (review.reviewedBy)");
  if (!approvalRef) reasons.push("approval reference missing (review.approvalRef)");
  if (!snap.review?.reviewedAt?.trim()) {
    reasons.push("review.reviewedAt missing");
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const label = classifyApprovedSnapshotAuthority({
    reviewedBy,
    approvalRef,
    productionContext: opts?.productionContext === true,
  });

  return {
    ok: true,
    evidenceAuthority: "APPROVED_SNAPSHOT",
    snapshotId: snap.snapshotId,
    reviewedBy,
    approvalRef,
    authorityDisclosure: label.disclosure,
    realReviewerApproval: label.realReviewerApproval,
  };
}

/**
 * Derive bundle evidence authority from package baseline + optional validated NS-4 snapshot.
 * Registry packages never supply APPROVED_SNAPSHOT by themselves.
 */
export function deriveEvidenceAuthority(args: {
  pkg: RegisteredFinancialPackage;
  approvedNs4Snapshot?: FinancialSnapshot | null;
  productionContext?: boolean;
}): {
  evidenceAuthority: FinancialEvidenceAuthority;
  validation: Ns4ApprovalValidation | null;
  notes: string[];
} {
  const baseline = args.pkg.evidenceAuthority;
  // Registry must never claim APPROVED without NS-4 — treat as provisional if misconfigured.
  const safeBaseline: FinancialEvidenceAuthority =
    baseline === "APPROVED_SNAPSHOT" ? "PROVISIONAL_RECONSTRUCTION" : baseline;

  if (!args.approvedNs4Snapshot) {
    return {
      evidenceAuthority: safeBaseline,
      validation: null,
      notes:
        safeBaseline !== baseline
          ? ["Registry APPROVED_SNAPSHOT ignored — APPROVED requires validated NS-4 snapshot evidence"]
          : [],
    };
  }

  const validation = validateApprovedNs4SnapshotForPackage(args.approvedNs4Snapshot, args.pkg, {
    productionContext: args.productionContext,
  });

  if (!validation.ok) {
    return {
      evidenceAuthority: safeBaseline,
      validation,
      notes: [
        "NS-4 snapshot provided but failed validation — retaining package evidence authority",
        ...validation.reasons.map((r) => `NS-4 validation: ${r}`),
      ],
    };
  }

  return {
    evidenceAuthority: "APPROVED_SNAPSHOT",
    validation,
    notes: [
      `NS-4 APPROVED snapshot ${validation.snapshotId} validated for package ${args.pkg.packageKey}`,
      validation.authorityDisclosure,
      validation.realReviewerApproval
        ? "Reviewer authority classified as REAL_REVIEWER_APPROVED"
        : "Reviewer authority classified as TEST_ATTRIBUTED_APPROVAL (not production human reviewer)",
    ],
  };
}
