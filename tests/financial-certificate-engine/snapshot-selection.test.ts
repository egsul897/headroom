/**
 * FCE snapshot selection — refuse latest-as-of / order picks without NS-6 bind.
 */
import { describe, expect, it } from "vitest";
import { selectAuthoritativeSnapshotForCapacity } from "@/lib/financial-certificate-engine/snapshot-selection";
import {
  InMemoryApprovedSnapshotStore,
  LedgerProposalRecorder,
  approveCertificateProposal,
  proposeFromCertificate,
  encodeDeliveredAtInApprovalRef,
} from "@/lib/contract-model/north-star-bridge";
import { CONMED_FORM_INSPIRED_CERT } from "@/lib/contract-model/runtime/input/store/certificate/fixtures";
import type { FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";

function cloneAsApproved(over: Partial<FinancialSnapshot> & Pick<FinancialSnapshot, "snapshotId">): FinancialSnapshot {
  return {
    snapshotId: over.snapshotId,
    version: over.version ?? "v1",
    companyId: over.companyId ?? CONMED_FORM_INSPIRED_CERT.companyId,
    asOf: over.asOf ?? "2026-06-30",
    reportingPeriod: over.reportingPeriod ?? "FY2026-Q2",
    status: "APPROVED",
    supersedesSnapshotId: over.supersedesSnapshotId ?? null,
    inputs: over.inputs ?? [],
    provenance: over.provenance ?? { source: "test", sourceVersion: null },
    review: over.review ?? {
      reviewedBy: "r",
      reviewedAt: "2026-07-20T00:00:00Z",
      approvalRef: encodeDeliveredAtInApprovalRef("apr-test", "2026-07-10"),
    },
  };
}

describe("selectAuthoritativeSnapshotForCapacity", () => {
  it("requires snapshotId or evaluationDate when multiple APPROVED exist — never latest-as-of", () => {
    const approved = [
      cloneAsApproved({
        snapshotId: "snap-q1",
        reportingPeriod: "FY2026-Q1",
        asOf: "2026-03-31",
        review: {
          reviewedBy: "r",
          reviewedAt: "2026-04-20T00:00:00Z",
          approvalRef: encodeDeliveredAtInApprovalRef("apr-q1", "2026-04-15"),
        },
      }),
      cloneAsApproved({
        snapshotId: "snap-q2",
        reportingPeriod: "FY2026-Q2",
        asOf: "2026-06-30",
        review: {
          reviewedBy: "r",
          reviewedAt: "2026-07-20T00:00:00Z",
          approvalRef: encodeDeliveredAtInApprovalRef("apr-q2", "2026-07-10"),
        },
      }),
    ];
    const picked = selectAuthoritativeSnapshotForCapacity({
      companyId: CONMED_FORM_INSPIRED_CERT.companyId,
      approved,
    });
    expect(picked.status).toBe("NEEDS_INPUT");
    if (picked.status !== "NEEDS_INPUT") return;
    expect(picked.missingInputs).toEqual(expect.arrayContaining(["snapshotId", "evaluationDate"]));
  });

  it("binds via NS-6 + persisted delivery — not max asOf alone", () => {
    const companyId = CONMED_FORM_INSPIRED_CERT.companyId;
    const approved = [
      cloneAsApproved({
        snapshotId: "snap-q1",
        companyId,
        reportingPeriod: "FY2026-Q1",
        asOf: "2026-03-31",
        review: {
          reviewedBy: "r",
          reviewedAt: "2026-04-20T00:00:00Z",
          approvalRef: encodeDeliveredAtInApprovalRef("apr-q1", "2026-04-15"),
        },
      }),
      cloneAsApproved({
        snapshotId: "snap-q2",
        companyId,
        reportingPeriod: "FY2026-Q2",
        asOf: "2026-06-30",
        review: {
          reviewedBy: "r",
          reviewedAt: "2026-07-20T00:00:00Z",
          approvalRef: encodeDeliveredAtInApprovalRef("apr-q2", "2026-07-10"),
        },
      }),
    ];
    const bound = selectAuthoritativeSnapshotForCapacity({
      companyId,
      approved,
      evaluationDate: "2026-08-01",
    });
    expect(bound).toEqual({ status: "OK", snapshotId: "snap-q2" });
  });

  it("refuses undelivered later period even when a newer asOf APPROVED exists without delivery", () => {
    const companyId = CONMED_FORM_INSPIRED_CERT.companyId;
    const approved = [
      cloneAsApproved({
        snapshotId: "snap-q2-delivered",
        companyId,
        reportingPeriod: "FY2026-Q2",
        asOf: "2026-06-30",
        review: {
          reviewedBy: "r",
          reviewedAt: "2026-07-20T00:00:00Z",
          approvalRef: encodeDeliveredAtInApprovalRef("apr-q2", "2026-07-10"),
        },
      }),
      // Later period APPROVED but no deliveredAt marker — must not be selected by asOf recency.
      cloneAsApproved({
        snapshotId: "snap-q3-no-delivery",
        companyId,
        reportingPeriod: "FY2026-Q3",
        asOf: "2026-09-30",
        review: {
          reviewedBy: "r",
          reviewedAt: "2026-10-05T00:00:00Z",
          approvalRef: "apr-q3-plain",
        },
      }),
    ];
    const atQ3 = selectAuthoritativeSnapshotForCapacity({
      companyId,
      approved,
      evaluationDate: "2026-10-15",
    });
    // Q3 ended but undelivered → NEEDS_INPUT (not silent pick of Q3 or Q2 via latest-as-of).
    expect(atQ3.status).toBe("NEEDS_INPUT");
  });

  it("honors explicit snapshotId even among many APPROVED", () => {
    const companyId = CONMED_FORM_INSPIRED_CERT.companyId;
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    proposeFromCertificate(store, CONMED_FORM_INSPIRED_CERT, ledger);
    approveCertificateProposal(store, {
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "r",
      reviewedAt: "2026-07-20T00:00:00Z",
      approvalRef: "apr-explicit",
      deliveredAsOfDate: "2026-07-10",
      proposerKind: "human",
    });
    const approved = store.getSnapshots(companyId);
    const picked = selectAuthoritativeSnapshotForCapacity({
      companyId,
      approved,
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
    });
    expect(picked).toEqual({
      status: "OK",
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
    });
  });
});
