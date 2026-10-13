/**
 * P0 adversarial: certificate approval must never substitute for delivery evidence.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  InMemoryApprovedSnapshotStore,
  LedgerProposalRecorder,
  approveCertificateProposal,
  proposeFromCertificate,
  authoritativeDeliveriesFromSnapshots,
  deliveriesFromApprovedSnapshots,
  encodeDeliveredAtInApprovalRef,
  extractDeliveredAtFromApprovalRef,
  resolveAuthoritativeCutoff,
  resolveContractualSelector,
  temporalAxesFromSnapshot,
} from "@/lib/contract-model/north-star-bridge";
import { CONMED_FORM_INSPIRED_CERT } from "@/lib/contract-model/runtime/input/store/certificate/fixtures";
import type { FinancialSnapshot } from "@/lib/contract-model/north-star-bridge";

const CO = CONMED_FORM_INSPIRED_CERT.companyId;

function approvedSnap(over: Partial<FinancialSnapshot> & Pick<FinancialSnapshot, "snapshotId">): FinancialSnapshot {
  return {
    snapshotId: over.snapshotId,
    version: over.version ?? "v1",
    companyId: over.companyId ?? CO,
    asOf: over.asOf ?? "2026-06-30",
    reportingPeriod: over.reportingPeriod ?? "FY2026-Q2",
    status: over.status ?? "APPROVED",
    supersedesSnapshotId: over.supersedesSnapshotId ?? null,
    inputs: over.inputs ?? [],
    provenance: over.provenance ?? {
      source: `doc-${over.snapshotId}`,
      sourceVersion: "sha256:v1",
    },
    review: over.review ?? {
      reviewedBy: "counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: "apr-plain",
    },
  };
}

describe("P0 delivery authority adversarial", () => {
  it("APPROVED + reviewedAt + no deliveredAt must not establish delivery", () => {
    const snap = approvedSnap({
      snapshotId: "snap-approved-no-delivery",
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-07-20T18:00:00Z",
        approvalRef: "apr-no-delivery-marker",
      },
    });
    expect(extractDeliveredAtFromApprovalRef(snap.review.approvalRef)).toBeNull();
    expect(authoritativeDeliveriesFromSnapshots(CO, [snap])).toEqual([]);
    // Default mode is REQUIRE_PERSISTED_DELIVERY
    expect(deliveriesFromApprovedSnapshots(CO, [snap])).toEqual([]);

    const cutoff = resolveAuthoritativeCutoff({
      companyId: CO,
      evaluationDate: "2026-08-01",
      approved: [snap],
    });
    expect(cutoff.state).toBe("NEEDS_INPUT");
    expect(cutoff.snapshotId).toBeNull();
  });

  it("approve without deliveredAsOfDate does not persist delivery (approval ≠ delivery)", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    proposeFromCertificate(store, CONMED_FORM_INSPIRED_CERT, ledger);
    const approved = approveCertificateProposal(store, {
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: "apr-approval-only",
      // intentionally omit deliveredAsOfDate
      proposerKind: "human",
    });
    expect(approved.ok).toBe(true);
    const snap = store.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    expect(snap.status).toBe("APPROVED");
    expect(snap.review.reviewedAt?.slice(0, 10)).toBe("2026-07-20");
    expect(extractDeliveredAtFromApprovalRef(snap.review.approvalRef)).toBeNull();
    expect(authoritativeDeliveriesFromSnapshots(CO, [snap])).toEqual([]);

    const cutoff = resolveAuthoritativeCutoff({
      companyId: CO,
      evaluationDate: "2026-08-01",
      approved: [snap],
    });
    expect(cutoff.state).toBe("NEEDS_INPUT");
  });

  it("APPROVED + valid persisted deliveredAt may qualify", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    proposeFromCertificate(store, CONMED_FORM_INSPIRED_CERT, ledger);
    const approved = approveCertificateProposal(store, {
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: "apr-with-delivery",
      deliveredAsOfDate: "2026-07-10",
      sourceDocumentId: CONMED_FORM_INSPIRED_CERT.documentId,
      sourceVersionHash: CONMED_FORM_INSPIRED_CERT.versionHash,
      proposerKind: "human",
    });
    expect(approved.ok).toBe(true);
    const snap = store.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    expect(extractDeliveredAtFromApprovalRef(snap.review.approvalRef)).toBe("2026-07-10");

    const deliveries = authoritativeDeliveriesFromSnapshots(CO, [snap]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      companyId: CO,
      reportingPeriodKey: "FY2026-Q2",
      asOfIsoDate: "2026-06-30",
      deliveredAtIsoDate: "2026-07-10",
      // Provenance is attributable to the certificate document / source version on the snapshot.
      documentId: snap.provenance.source,
      sourceVersionHash: snap.provenance.sourceVersion ?? undefined,
    });
    expect(deliveries[0]!.documentId).toBeTruthy();
    expect(deliveries[0]!.sourceVersionHash).toBeTruthy();

    const axes = temporalAxesFromSnapshot(snap, "2026-08-01");
    expect(axes.periodEndAsOf).toBe("2026-06-30");
    expect(axes.certificateDeliveryDate).toBe("2026-07-10");
    expect(axes.approvalReviewedAt).toBe("2026-07-20");
    expect(axes.evaluationDate).toBe("2026-08-01");
    expect(axes.axesDistinct).toBe(true);

    const cutoff = resolveAuthoritativeCutoff({
      companyId: CO,
      evaluationDate: "2026-08-01",
      approved: [snap],
    });
    expect(cutoff.state).toBe("RESOLVED");
    expect(cutoff.snapshotId).toBe(CONMED_FORM_INSPIRED_CERT.snapshotId);
    expect(cutoff.reportingPeriodKey).toBe("FY2026-Q2");
  });

  it("SUPERSEDED or DRAFT snapshots cannot establish current delivery", () => {
    const draft = approvedSnap({
      snapshotId: "snap-draft",
      status: "DRAFT",
      review: {
        reviewedBy: null,
        reviewedAt: null,
        approvalRef: encodeDeliveredAtInApprovalRef("apr-draft", "2026-07-10"),
      },
    });
    const superseded = approvedSnap({
      snapshotId: "snap-superseded",
      status: "SUPERSEDED",
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-07-15T00:00:00Z",
        approvalRef: encodeDeliveredAtInApprovalRef("apr-old", "2026-07-10"),
      },
    });
    expect(authoritativeDeliveriesFromSnapshots(CO, [draft, superseded])).toEqual([]);
  });

  it("later approval without delivery cannot displace the last actually delivered certificate", () => {
    const deliveredQ2 = approvedSnap({
      snapshotId: "snap-q2-delivered",
      reportingPeriod: "FY2026-Q2",
      asOf: "2026-06-30",
      provenance: { source: "doc-q2", sourceVersion: "sha256:q2" },
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-07-20T18:00:00Z",
        approvalRef: encodeDeliveredAtInApprovalRef("apr-q2", "2026-07-10"),
      },
    });
    // Later APPROVED for Q3 — approval present, delivery absent.
    const approvedQ3NoDelivery = approvedSnap({
      snapshotId: "snap-q3-approved-only",
      reportingPeriod: "FY2026-Q3",
      asOf: "2026-09-30",
      provenance: { source: "doc-q3", sourceVersion: "sha256:q3" },
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-10-05T18:00:00Z",
        approvalRef: "apr-q3-approval-only",
      },
    });

    const deliveries = authoritativeDeliveriesFromSnapshots(CO, [
      deliveredQ2,
      approvedQ3NoDelivery,
    ]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.reportingPeriodKey).toBe("FY2026-Q2");

    // Most recently *delivered* still resolves to Q2 — later approval without delivery ignored.
    const mostDelivered = resolveContractualSelector({
      companyId: CO,
      evaluationDate: "2026-10-15",
      selector: "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
      deliveries,
    });
    expect(mostDelivered.state).toBe("RESOLVED");
    if (mostDelivered.state !== "RESOLVED") return;
    expect(mostDelivered.reportingPeriodKey).toBe("FY2026-Q2");

    // Fiscal Q3 ended but undelivered → NEEDS_INPUT (not silent pick of Q3 via approval).
    const fiscalQ3 = resolveAuthoritativeCutoff({
      companyId: CO,
      evaluationDate: "2026-10-15",
      approved: [deliveredQ2, approvedQ3NoDelivery],
    });
    expect(fiscalQ3.state).toBe("NEEDS_INPUT");
  });

  it("transaction-readiness and certified-transaction entrypoints use resolveAuthoritativeCutoff", () => {
    const readinessSrc = readFileSync(
      path.join(process.cwd(), "lib/product/north-star-workflow/transaction-readiness.ts"),
      "utf8",
    );
    const certifiedSrc = readFileSync(
      path.join(process.cwd(), "lib/product/north-star-workflow/certified-transaction.ts"),
      "utf8",
    );
    expect(readinessSrc).toMatch(/resolveAuthoritativeCutoff/);
    expect(certifiedSrc).toMatch(/resolveAuthoritativeCutoff/);
    expect(readinessSrc).not.toMatch(/ALLOW_REVIEWED_AT_FALLBACK/);
    expect(certifiedSrc).not.toMatch(/ALLOW_REVIEWED_AT_FALLBACK/);
  });

  it("entrypoint fail-closed: resolveAuthoritativeCutoff NEEDS_INPUT when delivery missing", () => {
    // Mirrors transaction-readiness + certified-transaction cutoff construction.
    const approvedOnly = approvedSnap({
      snapshotId: "snap-entry-no-delivery",
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-07-20T18:00:00Z",
        approvalRef: "apr-entry",
      },
    });
    const cutoff = resolveAuthoritativeCutoff({
      companyId: CO,
      evaluationDate: "2026-08-01",
      approved: [approvedOnly],
    });
    expect(cutoff.state).toBe("NEEDS_INPUT");
    expect(cutoff.snapshotId).toBeNull();
    // Certified path maps this to CUTOFF_UNRESOLVED blocker.
    expect(["NEEDS_INPUT", "AMBIGUOUS"]).toContain(cutoff.state);
  });
});
