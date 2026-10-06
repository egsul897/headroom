/**
 * NS-4 slice 2 — approveCertificateProposal wraps sealed approveSnapshot with clear provenance.
 *
 * Extractor / PUBLIC_FILING_RECONSTRUCTION proposals stay DRAFT | REVIEW_REQUIRED until this
 * attributable transition runs. There is no auto-approve path.
 */
import { InMemoryApprovedSnapshotStore } from "../memory-store";
import type { WriteResult } from "../types";
import type { ApproveCertificateProposalRequest, CertificateProposerKind } from "./types";

/**
 * Attributable approval for a certificate-sourced proposal.
 * Requires the same fields as approveSnapshot; optional certificate provenance is
 * encoded into approvalRef when not already present in the caller's ref.
 */
export function approveCertificateProposal(
  store: InMemoryApprovedSnapshotStore,
  request: ApproveCertificateProposalRequest,
): WriteResult {
  const {
    snapshotId,
    reviewedBy,
    reviewedAt,
    approvalRef,
    sourceDocumentId,
    sourceVersionHash,
    proposerKind,
  } = request;

  // Provenance-enriched approvalRef for auditability (still attributable via approveSnapshot).
  const enrichedRef = enrichApprovalRef(approvalRef, {
    sourceDocumentId,
    sourceVersionHash,
    proposerKind,
  });

  return store.approveSnapshot({
    snapshotId,
    reviewedBy,
    reviewedAt,
    approvalRef: enrichedRef,
  });
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
