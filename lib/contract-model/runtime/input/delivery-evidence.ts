/**
 * Cross-layer delivery evidence — keeps certificate delivery dates distinguishable
 * from reporting-period as-of, evaluation/transaction dates, and approval timestamps.
 *
 * Soft gates (P0 / final delivery gate):
 * - never invent delivery from period-end asOf
 * - never invent delivery from approval / reviewedAt
 * - APPROVED + reviewedAt without persisted deliveredAt does not establish delivery
 * - DRAFT / REVIEW_REQUIRED never establish delivery
 * - Persisted channels only: provenance.deliveredAtIsoDate (first-class) or
 *   deliveredAt= marker encoded in approvalRef at attributable approval
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

/**
 * Persisted delivery date only — never asOf, never reviewedAt.
 * Prefers first-class provenance.deliveredAtIsoDate (#334 stronger channel);
 * falls back to approvalRef deliveredAt= marker written at attributable approval (#332).
 */
export function persistedDeliveryDateFromSnapshot(snapshot: FinancialSnapshot): string | null {
  const fromProvenance = snapshot.provenance.deliveredAtIsoDate?.trim().slice(0, 10);
  if (fromProvenance && ISO_DATE.test(fromProvenance)) return fromProvenance;
  return extractDeliveredAtFromApprovalRef(snapshot.review.approvalRef);
}

/**
 * Build DeliveryRecords from APPROVED (and historically SUPERSEDED) snapshots
 * that carry persisted delivery evidence.
 *
 * - asOfIsoDate = snapshot.asOf (reporting period end) — never used as delivery
 * - deliveredAtIsoDate = persisted channel only
 * - DRAFT / REVIEW_REQUIRED never contribute
 * - SUPERSEDED rows with persisted delivery remain eligible for historical cutoff binding
 */
export function deliveriesFromApprovedSnapshots(
  companyId: string,
  snapshots: readonly FinancialSnapshot[],
): DeliveryRecord[] {
  const out: DeliveryRecord[] = [];
  for (const s of snapshots) {
    if (s.companyId !== companyId) continue;
    if (s.status !== "APPROVED" && s.status !== "SUPERSEDED") continue;
    if (!s.reportingPeriod || !s.asOf) continue;

    const deliveredAtIsoDate = persistedDeliveryDateFromSnapshot(s);
    if (!deliveredAtIsoDate) continue;

    out.push({
      companyId,
      kind: "COMPLIANCE_CERTIFICATE",
      reportingPeriodKey: s.reportingPeriod,
      asOfIsoDate: s.asOf,
      deliveredAtIsoDate,
      documentId: s.provenance.source ?? s.snapshotId,
      sourceVersionHash: s.provenance.sourceVersion ?? undefined,
      snapshotId: s.snapshotId,
    });
  }
  return out;
}

/**
 * Authoritative product helper — persisted-delivery-only selection.
 * Use from transaction-readiness, certified-transaction, Dashboard/Position/Ask cutoff paths.
 */
export function authoritativeDeliveriesFromSnapshots(
  companyId: string,
  snapshots: readonly FinancialSnapshot[],
): DeliveryRecord[] {
  return deliveriesFromApprovedSnapshots(companyId, snapshots);
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
  const certificateDeliveryDate = persistedDeliveryDateFromSnapshot(snapshot);
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
