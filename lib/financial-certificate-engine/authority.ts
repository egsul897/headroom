/**
 * Financial-input authority classification.
 *
 * An approval status string in a test fixture must never be read as a real
 * reviewer approval. Test email identities and caller-supplied reviewer labels
 * cannot confer production approval — only trusted production context + a
 * minted trusted production approval channel token can.
 */

import {
  isMintedTrustedProductionApprovalChannel,
  mintTrustedProductionApprovalChannel,
  type TrustedProductionApprovalChannelToken,
} from "./trusted-provenance";

export type { TrustedProductionApprovalChannelToken };
export { mintTrustedProductionApprovalChannel, isMintedTrustedProductionApprovalChannel };

export type FinancialInputAuthorityKind =
  | "AUTHENTIC_SOURCE_DERIVED"
  | "SEED_ALIGNED_MODELED"
  | "SYNTHETIC_CALCULATION_TEST"
  | "TEST_ATTRIBUTED_APPROVAL"
  | "REAL_REVIEWER_APPROVED"
  | "UNAPPROVED_EXTRACTION";

export interface FinancialInputAuthorityLabel {
  kind: FinancialInputAuthorityKind;
  disclosure: string;
  realReviewerApproval: boolean;
  authenticOrSeedAligned: boolean;
}

const DISCLOSURES: Record<FinancialInputAuthorityKind, string> = {
  AUTHENTIC_SOURCE_DERIVED:
    "Figures derived from authentic public-filing provenance (EDGAR / indenture-defined build-up). Not a capacity approval.",
  SEED_ALIGNED_MODELED:
    "Seed-aligned modeled reconstruction (prisma seed / evaluation company). Not a real reviewer approval.",
  SYNTHETIC_CALCULATION_TEST:
    "SYNTHETIC_CALCULATION_TEST — invented numbers for unit arithmetic only.",
  TEST_ATTRIBUTED_APPROVAL:
    "NS-4 status APPROVED was granted by a test-attributed reviewedBy / non-production channel. Does not imply a human production reviewer.",
  REAL_REVIEWER_APPROVED:
    "Attributable production NS-4 approval via trusted production approval channel.",
  UNAPPROVED_EXTRACTION:
    "Extracted / proposed only (DRAFT or REVIEW_REQUIRED). Not authoritative for capacity.",
};

/** Identities that can never confer production approval — even if productionContext is asserted. */
export function isTestOrNonProductionReviewerIdentity(reviewedBy: string, approvalRef: string): boolean {
  const reviewer = reviewedBy.trim();
  const ref = approvalRef.trim();
  return (
    /^(fce-|bridge-|test-|synth-|ci-|demo-|gate-)/i.test(reviewer) ||
    /@(example\.com|test\.local|localhost|invalid)$/i.test(reviewer) ||
    /^(fce-|bridge-|test-|synth-|ci-|demo-|gate-)/i.test(ref) ||
    /reviewer$/i.test(reviewer) // generic fixture reviewer labels
  );
}

export function labelAuthority(kind: FinancialInputAuthorityKind): FinancialInputAuthorityLabel {
  return {
    kind,
    disclosure: DISCLOSURES[kind],
    realReviewerApproval: kind === "REAL_REVIEWER_APPROVED",
    authenticOrSeedAligned:
      kind === "AUTHENTIC_SOURCE_DERIVED" || kind === "SEED_ALIGNED_MODELED",
  };
}

export const FIXTURE_AUTHORITY = {
  matthews_q1_fy2025: labelAuthority("AUTHENTIC_SOURCE_DERIVED"),
  coherent_fy2026: labelAuthority("SEED_ALIGNED_MODELED"),
  coherent_q1_fy2027: labelAuthority("SEED_ALIGNED_MODELED"),
  synthetic_calc_q2: labelAuthority("SYNTHETIC_CALCULATION_TEST"),
} as const;

/**
 * Classify an NS-4 APPROVED row.
 *
 * REAL_REVIEWER_APPROVED requires ALL of:
 *   - non-empty reviewedBy + approvalRef
 *   - not a test/non-production identity
 *   - productionContext === true
 *   - minted trustedProductionApprovalChannel token (not a bare boolean)
 *
 * Bare `trustedProductionApprovalChannel: true` from user JSON never passes.
 */
export function classifyApprovedSnapshotAuthority(args: {
  reviewedBy: string | null | undefined;
  approvalRef: string | null | undefined;
  productionContext?: boolean;
  /**
   * Must be a token from `mintTrustedProductionApprovalChannel`.
   * Bare booleans (including `true` from request JSON) are rejected.
   */
  trustedProductionApprovalChannel?: TrustedProductionApprovalChannelToken | boolean | unknown;
}): FinancialInputAuthorityLabel {
  const reviewer = (args.reviewedBy ?? "").trim();
  const ref = (args.approvalRef ?? "").trim();
  if (!reviewer || !ref) {
    return labelAuthority("UNAPPROVED_EXTRACTION");
  }
  if (isTestOrNonProductionReviewerIdentity(reviewer, ref)) {
    return labelAuthority("TEST_ATTRIBUTED_APPROVAL");
  }
  if (
    args.productionContext !== true ||
    !isMintedTrustedProductionApprovalChannel(args.trustedProductionApprovalChannel)
  ) {
    return labelAuthority("TEST_ATTRIBUTED_APPROVAL");
  }
  return labelAuthority("REAL_REVIEWER_APPROVED");
}
