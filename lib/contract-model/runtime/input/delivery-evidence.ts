/**
 * Cross-layer delivery evidence — keeps certificate delivery dates distinguishable
 * from reporting-period as-of, evaluation/transaction dates, and approval timestamps.
 *
 * Soft gates:
 * - never invent delivery from period-end asOf
 * - never treat missing delivery as RESOLVED via silent substitution
 * - persist delivery on attributable approval when known
 */
import type { FinancialSnapshot } from "./types";
import type { DeliveryRecord } from "./selector/types";

const DELIVERED_AT_TOKEN = "deliveredAt=";

/** ISO date YYYY-MM-DD. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDeliveryDate(value: string, field: string): string {
  const date = value.trim().slice(0, 10);
  if (!ISO_DATE.test(date)) {
    throw new Error(`${field} must be an ISO date (YYYY-MM-DD); got ${JSON.stringify(value)}`);
  }
  return date;
}

/** Encode certificate delivery date into the attributable approvalRef string. */
export function encodeDeliveredAtInApprovalRef(
  approvalRef: string,
  deliveredAsOfDate: string | null | undefined,
): string {
  const base = approvalRef.trim();
  if (!deliveredAsOfDate) return base;
  const date = assertIsoDeliveryDate(deliveredAsOfDate, "deliveredAsOfDate");
  if (base.includes(`${DELIVERED_AT_TOKEN}`)) {
    return base.replace(new RegExp(`${DELIVERED_AT_TOKEN}\\d{4}-\\d{2}-\\d{2}`), `${DELIVERED_AT_TOKEN}${date}`);
  }
  return `${base}|${DELIVERED_AT_TOKEN}${date}`;
}

/**
 * Extract persisted delivery date from approvalRef.
 * Returns null when absent — callers must not invent from asOf.
 */
export function extractDeliveredAtFromApprovalRef(
  approvalRef: string | null | undefined,
): string | null {
  if (!approvalRef) return null;
  const match = approvalRef.match(new RegExp(`${DELIVERED_AT_TOKEN}(\\d{4}-\\d{2}-\\d{2})`));
  return match?.[1] ?? null;
}

export type DeliveryReconstructionMode =
  /**
   * Prefer explicit deliveredAt marker; if absent, use reviewedAt date only
   * (approval-time delivery attribution). Never fall back to period-end asOf.
   */
  | "ALLOW_REVIEWED_AT_FALLBACK"
  /** Only emit a DeliveryRecord when deliveredAt was persisted on approval. */
  | "REQUIRE_PERSISTED_DELIVERY";

/**
 * Build DeliveryRecords from APPROVED snapshots without conflating temporal axes.
 *
 * - asOfIsoDate = snapshot.asOf (reporting period end)
 * - deliveredAtIsoDate = persisted delivery (or reviewedAt under ALLOW_REVIEWED_AT_FALLBACK)
 * - SUPERSEDED / DRAFT / REVIEW_REQUIRED snapshots never contribute current delivery evidence
 */
export function deliveriesFromApprovedSnapshots(
  companyId: string,
  snapshots: readonly FinancialSnapshot[],
  mode: DeliveryReconstructionMode = "ALLOW_REVIEWED_AT_FALLBACK",
): DeliveryRecord[] {
  const out: DeliveryRecord[] = [];
  for (const s of snapshots) {
    if (s.companyId !== companyId) continue;
    if (s.status !== "APPROVED") continue;
    if (!s.reportingPeriod || !s.asOf) continue;

    const persisted = extractDeliveredAtFromApprovalRef(s.review.approvalRef);
    let deliveredAtIsoDate: string | null = persisted;
    if (!deliveredAtIsoDate && mode === "ALLOW_REVIEWED_AT_FALLBACK" && s.review.reviewedAt) {
      deliveredAtIsoDate = s.review.reviewedAt.slice(0, 10);
    }
    if (!deliveredAtIsoDate) continue;

    out.push({
      companyId,
      kind: "COMPLIANCE_CERTIFICATE",
      reportingPeriodKey: s.reportingPeriod,
      asOfIsoDate: s.asOf,
      deliveredAtIsoDate,
      documentId: s.provenance.source ?? s.snapshotId,
      sourceVersionHash: s.provenance.sourceVersion ?? undefined,
    });
  }
  return out;
}

/**
 * Distinguish temporal axes for audit / customer surfaces.
 * Never collapses delivery, period-end, approval, and evaluation into one date.
 */
export function temporalAxesFromSnapshot(
  snapshot: FinancialSnapshot,
  evaluationDate?: string | null,
): {
  reportingPeriodKey: string | null;
  periodEndAsOf: string | null;
  certificateDeliveryDate: string | null;
  approvalReviewedAt: string | null;
  evaluationDate: string | null;
  axesDistinct: boolean;
} {
  const certificateDeliveryDate = extractDeliveredAtFromApprovalRef(snapshot.review.approvalRef);
  const approvalReviewedAt = snapshot.review.reviewedAt?.slice(0, 10) ?? null;
  const periodEndAsOf = snapshot.asOf;
  const dates = [periodEndAsOf, certificateDeliveryDate, approvalReviewedAt, evaluationDate ?? null].filter(
    (d): d is string => Boolean(d),
  );
  return {
    reportingPeriodKey: snapshot.reportingPeriod,
    periodEndAsOf,
    certificateDeliveryDate,
    approvalReviewedAt,
    evaluationDate: evaluationDate ?? null,
    axesDistinct: new Set(dates).size === dates.length || dates.length <= 1,
  };
}
