/**
 * Delivery-date persistence and temporal-axis separation.
 * Proves deliveredAsOfDate is not discarded and never reconstructed from period-end asOf.
 */
import { describe, expect, it } from "vitest";
import {
  deliveriesFromApprovedSnapshots,
  encodeDeliveredAtInApprovalRef,
  extractDeliveredAtFromApprovalRef,
  persistedDeliveryDateFromSnapshot,
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
    // Materialization promotes approvalRef marker into first-class provenance.
    expect(snap.provenance.deliveredAtIsoDate).toBe("2026-07-10");
    expect(persistedDeliveryDateFromSnapshot(snap)).toBe("2026-07-10");

    const axes = temporalAxesFromSnapshot(snap, "2026-08-01");
    expect(axes.periodEndAsOf).toBe("2026-06-30");
    expect(axes.certificateDeliveryDate).toBe("2026-07-10");
    expect(axes.approvalReviewedAt).toBe("2026-07-20");
    expect(axes.evaluationDate).toBe("2026-08-01");
    expect(axes.axesDistinct).toBe(true);
  });

  it("persisted-delivery-only never invents delivery from asOf or reviewedAt", () => {
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
      review: { reviewedBy: "r", reviewedAt: "2026-07-20T18:00:00Z", approvalRef: "apr-plain" },
    };
    expect(deliveriesFromApprovedSnapshots("co-x", [fake])).toEqual([]);
    expect(persistedDeliveryDateFromSnapshot(fake)).toBeNull();
  });

  it("prefers first-class provenance.deliveredAtIsoDate over approvalRef marker", () => {
    const snap = {
      snapshotId: "snap-prov",
      version: "v1",
      companyId: "co-x",
      asOf: "2026-06-30",
      reportingPeriod: "FY2026-Q2",
      status: "APPROVED" as const,
      supersedesSnapshotId: null,
      inputs: [],
      provenance: {
        source: "doc",
        sourceVersion: "sha256:v1",
        deliveredAtIsoDate: "2026-07-08",
      },
      review: {
        reviewedBy: "r",
        reviewedAt: "2026-07-20T18:00:00Z",
        approvalRef: encodeDeliveredAtInApprovalRef("apr", "2026-07-22"),
      },
    };
    expect(persistedDeliveryDateFromSnapshot(snap)).toBe("2026-07-08");
    const deliveries = deliveriesFromApprovedSnapshots("co-x", [snap]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.deliveredAtIsoDate).toBe("2026-07-08");
    expect(deliveries[0]!.snapshotId).toBe("snap-prov");
  });

  it("SUPERSEDED snapshots with persisted delivery remain historically attributable", () => {
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
        provenance: { ...pred.provenance, deliveredAtIsoDate: undefined },
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
    );
    // Both predecessor (SUPERSEDED) and successor (APPROVED) carry persisted delivery.
    expect(deliveries.map((d) => d.deliveredAtIsoDate).sort()).toEqual(["2026-07-10", "2026-07-22"]);

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
