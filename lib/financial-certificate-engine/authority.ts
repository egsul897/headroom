/**
 * Financial-input authority classification (integration gate).
 *
 * An approval status string in a test fixture must never be read as a real
 * reviewer approval. Distinguish:
 *   - authentic source-derived figures
 *   - seed-aligned modeled reconstructions
 *   - test-attributed APPROVED snapshots (CI / local only)
 *   - real attributable reviewer APPROVED (production NS-4)
 */

export type FinancialInputAuthorityKind =
  | "AUTHENTIC_SOURCE_DERIVED"
  | "SEED_ALIGNED_MODELED"
  | "SYNTHETIC_CALCULATION_TEST"
  | "TEST_ATTRIBUTED_APPROVAL"
  | "REAL_REVIEWER_APPROVED"
  | "UNAPPROVED_EXTRACTION";

export interface FinancialInputAuthorityLabel {
  kind: FinancialInputAuthorityKind;
  /** Human-readable disclosure — surfaces must show this, not just "APPROVED". */
  disclosure: string;
  /** True only for REAL_REVIEWER_APPROVED. */
  realReviewerApproval: boolean;
  /** True when figures come from authentic public filings / seed-aligned reconstructions. */
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
    "NS-4 status APPROVED was granted by a test-attributed reviewedBy in CI/local only. Does not imply a human production reviewer.",
  REAL_REVIEWER_APPROVED:
    "Attributable production NS-4 approval with real reviewedBy / approvalRef.",
  UNAPPROVED_EXTRACTION:
    "Extracted / proposed only (DRAFT or REVIEW_REQUIRED). Not authoritative for capacity.",
};

export function labelAuthority(kind: FinancialInputAuthorityKind): FinancialInputAuthorityLabel {
  return {
    kind,
    disclosure: DISCLOSURES[kind],
    realReviewerApproval: kind === "REAL_REVIEWER_APPROVED",
    authenticOrSeedAligned:
      kind === "AUTHENTIC_SOURCE_DERIVED" || kind === "SEED_ALIGNED_MODELED",
  };
}

/** Fixture registry — explicit per authentic / seed / synthetic source. */
export const FIXTURE_AUTHORITY = {
  matthews_q1_fy2025: labelAuthority("AUTHENTIC_SOURCE_DERIVED"),
  coherent_fy2026: labelAuthority("SEED_ALIGNED_MODELED"),
  coherent_q1_fy2027: labelAuthority("SEED_ALIGNED_MODELED"),
  synthetic_calc_q2: labelAuthority("SYNTHETIC_CALCULATION_TEST"),
} as const;

/**
 * Classify an NS-4 APPROVED row. Test reviewedBy patterns never upgrade to
 * REAL_REVIEWER_APPROVED.
 */
export function classifyApprovedSnapshotAuthority(args: {
  reviewedBy: string | null | undefined;
  approvalRef: string | null | undefined;
  /** When true, caller asserts production context (never set by FCE tests). */
  productionContext?: boolean;
}): FinancialInputAuthorityLabel {
  const reviewer = (args.reviewedBy ?? "").trim();
  const ref = (args.approvalRef ?? "").trim();
  if (!reviewer || !ref) {
    return labelAuthority("UNAPPROVED_EXTRACTION");
  }
  const testPattern =
    /^(fce-|bridge-|test-|synth-|ci-)/i.test(reviewer) ||
    /@(example\.com|test\.local)$/i.test(reviewer) ||
    /^(fce-|bridge-|test-|synth-|ci-)/i.test(ref);
  if (testPattern || !args.productionContext) {
    return labelAuthority("TEST_ATTRIBUTED_APPROVAL");
  }
  return labelAuthority("REAL_REVIEWER_APPROVED");
}
