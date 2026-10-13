/**
 * Delivery-date persistence and temporal-axis separation.
 * Proves deliveredAsOfDate is not discarded and never reconstructed from period-end asOf.
 */
import { describe, expect, it } from "vitest";
import {
  deliveriesFromApprovedSnapshots,
  encodeDeliveredAtInApprovalRef,
  extractDeliveredAtFromApprovalRef,
  temporalAxesFromSnapshot,
} from "@/lib/contract-model/runtime/input/delivery-evidence";
import {
  InMemoryApprovedSnapshotStore,
  LedgerProposalRecorder,
  approveCertificateProposal,
  proposeFromCertificate,
} from "@/lib/contract-model/runtime/input/store";
import { CONMED_FORM_INSPIRED_CERT } from "@/lib/contract-model/runtime/input/store/certificate/fixtures";
import {
  resolveContractualSelector,
  selectSnapshotForResolvedSelector,
} from "@/lib/contract-model/runtime/input/selector";

describe("delivery evidence persistence", () => {
  it("encodes and extracts deliveredAt without colliding with approvalRef base", () => {
    const ref = encodeDeliveredAtInApprovalRef("apr-1", "2026-07-10");
    expect(extractDeliveredAtFromApprovalRef(ref)).toBe("2026-07-10");
    expect(ref.startsWith("apr-1")).toBe(true);
  });

  it("persists distinct delivery date through approveCertificateProposal", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const proposed = proposeFromCertificate(store, CONMED_FORM_INSPIRED_CERT, ledger);
    expect(proposed.ok).toBe(true);

    const approved = approveCertificateProposal(store, {
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: "apr-delivery-distinct",
      // Delivery before approval; period-end asOf is 2026-06-30 on the fixture.
      deliveredAsOfDate: "2026-07-10",
      sourceDocumentId: CONMED_FORM_INSPIRED_CERT.documentId,
      sourceVersionHash: CONMED_FORM_INSPIRED_CERT.versionHash,
      proposerKind: "human",
    });
    expect(approved.ok).toBe(true);
    const snap = store.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    expect(snap.asOf).toBe("2026-06-30");
    expect(snap.review.reviewedAt?.slice(0, 10)).toBe("2026-07-20");
    expect(extractDeliveredAtFromApprovalRef(snap.review.approvalRef)).toBe("2026-07-10");

    const axes = temporalAxesFromSnapshot(snap, "2026-08-01");
    expect(axes.periodEndAsOf).toBe("2026-06-30");
    expect(axes.certificateDeliveryDate).toBe("2026-07-10");
    expect(axes.approvalReviewedAt).toBe("2026-07-20");
    expect(axes.evaluationDate).toBe("2026-08-01");
    expect(axes.axesDistinct).toBe(true);
  });

  it("never invents delivery from period-end asOf when marker and reviewedAt are absent", () => {
    const fake = {
      snapshotId: "snap-no-delivery",
      version: "v1",
      companyId: "co-x",
      asOf: "2026-06-30",
      reportingPeriod: "FY2026-Q2",
      status: "APPROVED" as const,
      supersedesSnapshotId: null,
      inputs: [],
      provenance: { source: "doc", sourceVersion: null },
      review: { reviewedBy: "r", reviewedAt: null, approvalRef: "apr-plain" },
    };
    const deliveries = deliveriesFromApprovedSnapshots("co-x", [fake], "REQUIRE_PERSISTED_DELIVERY");
    expect(deliveries).toEqual([]);
    const fallback = deliveriesFromApprovedSnapshots("co-x", [fake], "ALLOW_REVIEWED_AT_FALLBACK");
    // reviewedAt null → still no delivery; asOf must not be used.
    expect(fallback).toEqual([]);
  });

  it("SUPERSEDED snapshots do not contribute current delivery evidence", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    proposeFromCertificate(store, CONMED_FORM_INSPIRED_CERT, ledger);
    approveCertificateProposal(store, {
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: "apr-pred",
      deliveredAsOfDate: "2026-07-10",
      proposerKind: "human",
    });

    const successorId = `${CONMED_FORM_INSPIRED_CERT.snapshotId}-restatement`;
    const pred = store.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    store.appendSnapshot({
      snapshot: {
        ...pred,
        snapshotId: successorId,
        status: "DRAFT",
        supersedesSnapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
        review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
        version: "v2-restatement",
      },
    });
    approveCertificateProposal(store, {
      snapshotId: successorId,
      reviewedBy: "counsel",
      reviewedAt: "2026-07-25T18:00:00Z",
      approvalRef: "apr-succ",
      deliveredAsOfDate: "2026-07-22",
      proposerKind: "human",
    });

    expect(store.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)?.status).toBe("SUPERSEDED");
    const deliveries = deliveriesFromApprovedSnapshots(
      CONMED_FORM_INSPIRED_CERT.companyId,
      store.getSnapshots(CONMED_FORM_INSPIRED_CERT.companyId),
      "REQUIRE_PERSISTED_DELIVERY",
    );
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.documentId).toBeTruthy();
    expect(deliveries[0]!.deliveredAtIsoDate).toBe("2026-07-22");

    const cutoff = resolveContractualSelector({
      companyId: CONMED_FORM_INSPIRED_CERT.companyId,
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: {
        companyId: CONMED_FORM_INSPIRED_CERT.companyId,
        fiscalYearEndMonth: 12,
        fiscalYearEndDay: 31,
      },
      deliveries,
    });
    expect(cutoff.state).toBe("RESOLVED");
    if (cutoff.state !== "RESOLVED") return;
    const bound = selectSnapshotForResolvedSelector(
      cutoff,
      store.getSnapshots(CONMED_FORM_INSPIRED_CERT.companyId),
      CONMED_FORM_INSPIRED_CERT.companyId,
    );
    expect(bound).toEqual({ state: "RESOLVED", snapshotId: successorId });
  });
});
