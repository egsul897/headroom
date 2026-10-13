/**
 * Cross-layer delivery evidence — keeps certificate delivery dates distinguishable
 * from reporting-period as-of, evaluation/transaction dates, and approval timestamps.
 *
 * Soft gates (P0):
 * - never invent delivery from period-end asOf
 * - never invent delivery from approval / reviewedAt
 * - APPROVED + reviewedAt without persisted deliveredAt does not establish delivery
 * - SUPERSEDED / DRAFT / REVIEW_REQUIRED never establish current delivery
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
 * Returns null when absent — callers must not invent from asOf or reviewedAt.
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
   * @deprecated Forbidden on authoritative product paths.
   * Kept only so adversarial tests can prove approval-as-delivery is refused by REQUIRE mode.
   */
  | "ALLOW_REVIEWED_AT_FALLBACK"
  /** Only emit a DeliveryRecord when deliveredAt was persisted on approval. Safe default. */
  | "REQUIRE_PERSISTED_DELIVERY";

/**
 * Build DeliveryRecords from APPROVED snapshots without conflating temporal axes.
 *
 * Default mode is REQUIRE_PERSISTED_DELIVERY (P0 safe default).
 * - asOfIsoDate = snapshot.asOf (reporting period end) — never used as delivery
 * - deliveredAtIsoDate = persisted delivery marker only (unless deprecated fallback mode)
 * - SUPERSEDED / DRAFT / REVIEW_REQUIRED snapshots never contribute current delivery evidence
 */
export function deliveriesFromApprovedSnapshots(
  companyId: string,
  snapshots: readonly FinancialSnapshot[],
  mode: DeliveryReconstructionMode = "REQUIRE_PERSISTED_DELIVERY",
): DeliveryRecord[] {
  const out: DeliveryRecord[] = [];
  for (const s of snapshots) {
    if (s.companyId !== companyId) continue;
    if (s.status !== "APPROVED") continue;
    if (!s.reportingPeriod || !s.asOf) continue;

    const persisted = extractDeliveredAtFromApprovalRef(s.review.approvalRef);
    let deliveredAtIsoDate: string | null = persisted;
    // Deprecated path — must not be used by authoritative readiness / certified / FCE selection.
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
 * Authoritative product helper — always REQUIRE_PERSISTED_DELIVERY.
 * Use from transaction-readiness, certified-transaction, Dashboard/Position/Ask cutoff paths.
 */
export function authoritativeDeliveriesFromSnapshots(
  companyId: string,
  snapshots: readonly FinancialSnapshot[],
): DeliveryRecord[] {
  return deliveriesFromApprovedSnapshots(companyId, snapshots, "REQUIRE_PERSISTED_DELIVERY");
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
