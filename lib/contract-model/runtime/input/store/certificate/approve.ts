/**
 * NS-4 slice 2 — approveCertificateProposal wraps sealed approveSnapshot with clear provenance.
 *
 * Extractor / PUBLIC_FILING_RECONSTRUCTION proposals stay DRAFT | REVIEW_REQUIRED until this
 * attributable transition runs. There is no auto-approve path.
 */
import { encodeDeliveredAtInApprovalRef } from "../../delivery-evidence";
import type { AsyncApprovedSnapshotStore, SyncApprovedSnapshotStore } from "../store-api";
import type { WriteResult } from "../types";
import type { ApproveCertificateProposalRequest, CertificateProposerKind } from "./types";

function approvalArgs(request: ApproveCertificateProposalRequest) {
  const {
    snapshotId,
    reviewedBy,
    reviewedAt,
    approvalRef,
    deliveredAsOfDate,
    omitDeliveryEvidence,
    sourceDocumentId,
    sourceVersionHash,
    proposerKind,
  } = request;

  // Provenance-enriched approvalRef for auditability (still attributable via approveSnapshot).
  // Persist certificate delivery only when known — never invent from period-end asOf.
  // omitDeliveryEvidence: extractor/FCE path when lender delivery date is unknown.
  // Otherwise: explicit deliveredAsOfDate, or approval-date attribution for workspace approve.
  const deliveryToPersist = omitDeliveryEvidence
    ? null
    : (deliveredAsOfDate ?? reviewedAt.slice(0, 10));
  const withDelivery = deliveryToPersist
    ? encodeDeliveredAtInApprovalRef(approvalRef, deliveryToPersist)
    : approvalRef.trim();
  const enrichedRef = enrichApprovalRef(withDelivery, {
    sourceDocumentId,
    sourceVersionHash,
    proposerKind,
  });

  return {
    snapshotId,
    reviewedBy,
    reviewedAt,
    approvalRef: enrichedRef,
  };
}

/**
 * Attributable approval for a certificate-sourced proposal.
 * Requires the same fields as approveSnapshot; optional certificate provenance is
 * encoded into approvalRef when not already present in the caller's ref.
 */
export function approveCertificateProposal(
  store: SyncApprovedSnapshotStore,
  request: ApproveCertificateProposalRequest,
): WriteResult {
  return store.approveSnapshot(approvalArgs(request));
}

/** Durable-store variant — awaits Prisma flush. */
export async function approveCertificateProposalAsync(
  store: AsyncApprovedSnapshotStore,
  request: ApproveCertificateProposalRequest,
): Promise<WriteResult> {
  return store.approveSnapshot(approvalArgs(request));
}

function enrichApprovalRef(
  approvalRef: string,
  ctx: {
    sourceDocumentId?: string;
    sourceVersionHash?: string;
    proposerKind?: CertificateProposerKind;
  },
): string {
  const parts: string[] = [approvalRef.trim()];
  if (ctx.sourceDocumentId) parts.push(`doc=${ctx.sourceDocumentId}`);
  if (ctx.sourceVersionHash) parts.push(`ver=${ctx.sourceVersionHash}`);
  if (ctx.proposerKind) parts.push(`proposer=${ctx.proposerKind}`);
  // Keep a single string; approveSnapshot requires non-empty approvalRef.
  return parts.join("|");
}
