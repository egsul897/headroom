/**
 * P0 adversarial: certificate approval must never substitute for delivery evidence.
 * Legacy approval-as-delivery lives only as a test-local helper — not a production switch.
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
  persistedDeliveryDateFromSnapshot,
  resolveAuthoritativeCutoff,
  resolveContractualSelector,
  temporalAxesFromSnapshot,
} from "@/lib/contract-model/north-star-bridge";
import { CONMED_FORM_INSPIRED_CERT } from "@/lib/contract-model/runtime/input/store/certificate/fixtures";
import type { FinancialSnapshot, DeliveryRecord } from "@/lib/contract-model/north-star-bridge";

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

/**
 * Test-local legacy (FORBIDDEN in production): invents delivery from reviewedAt.
 * Kept only so adversarial tests can prove the production API refuses this.
 */
function legacyDeliveriesUsingReviewedAtFallback(
  companyId: string,
  snapshots: readonly FinancialSnapshot[],
): DeliveryRecord[] {
  const out: DeliveryRecord[] = [];
  for (const s of snapshots) {
    if (s.companyId !== companyId) continue;
    if (s.status !== "APPROVED") continue;
    if (!s.reportingPeriod || !s.asOf) continue;
    const persisted = persistedDeliveryDateFromSnapshot(s);
    const deliveredAtIsoDate = persisted ?? s.review.reviewedAt?.slice(0, 10) ?? null;
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
    expect(persistedDeliveryDateFromSnapshot(snap)).toBeNull();
    expect(authoritativeDeliveriesFromSnapshots(CO, [snap])).toEqual([]);
    expect(deliveriesFromApprovedSnapshots(CO, [snap])).toEqual([]);

    // Legacy test-local helper WOULD invent delivery — production must not match it.
    const legacy = legacyDeliveriesUsingReviewedAtFallback(CO, [snap]);
    expect(legacy).toHaveLength(1);
    expect(legacy[0]!.deliveredAtIsoDate).toBe("2026-07-20");

    const cutoff = resolveAuthoritativeCutoff({
      companyId: CO,
      evaluationDate: "2026-08-01",
      approved: [snap],
    });
    expect(cutoff.state).toBe("NEEDS_INPUT");
    expect(cutoff.snapshotId).toBeNull();
  });

  it("production API has no ALLOW_REVIEWED_AT_FALLBACK switch", () => {
    const src = readFileSync(
      path.join(process.cwd(), "lib/contract-model/runtime/input/delivery-evidence.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/ALLOW_REVIEWED_AT_FALLBACK/);
    expect(src).not.toMatch(/DeliveryReconstructionMode/);
    const bridge = readFileSync(
      path.join(process.cwd(), "lib/contract-model/north-star-bridge.ts"),
      "utf8",
    );
    expect(bridge).not.toMatch(/DeliveryReconstructionMode/);
    expect(bridge).not.toMatch(/ALLOW_REVIEWED_AT_FALLBACK/);
  });

  it("approve without deliveredAsOfDate does not invent delivery from reviewedAt", () => {
    // Fixture CONMED includes propose-time deliveredAtIsoDate (#334). Use a cert without it.
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const certNoDelivery = {
      ...CONMED_FORM_INSPIRED_CERT,
      snapshotId: "snap-approval-only-no-delivery",
      deliveredAtIsoDate: undefined,
    };
    proposeFromCertificate(store, certNoDelivery, ledger);
    const draft = store.getSnapshot(certNoDelivery.snapshotId)!;
    expect(draft.provenance.deliveredAtIsoDate).toBeUndefined();

    const approved = approveCertificateProposal(store, {
      snapshotId: certNoDelivery.snapshotId,
      reviewedBy: "counsel",
      reviewedAt: "2026-07-20T18:00:00Z",
      approvalRef: "apr-approval-only",
      // intentionally omit deliveredAsOfDate
      proposerKind: "human",
    });
    expect(approved.ok).toBe(true);
    const snap = store.getSnapshot(certNoDelivery.snapshotId)!;
    expect(snap.status).toBe("APPROVED");
    expect(snap.review.reviewedAt?.slice(0, 10)).toBe("2026-07-20");
    expect(extractDeliveredAtFromApprovalRef(snap.review.approvalRef)).toBeNull();
    expect(snap.provenance.deliveredAtIsoDate).toBeUndefined();
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
    expect(snap.provenance.deliveredAtIsoDate).toBe("2026-07-10");

    const deliveries = authoritativeDeliveriesFromSnapshots(CO, [snap]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      companyId: CO,
      reportingPeriodKey: "FY2026-Q2",
      asOfIsoDate: "2026-06-30",
      deliveredAtIsoDate: "2026-07-10",
      documentId: snap.provenance.source,
      sourceVersionHash: snap.provenance.sourceVersion ?? undefined,
      snapshotId: snap.snapshotId,
    });

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

  it("DRAFT cannot establish delivery; SUPERSEDED without delivery cannot either", () => {
    const draft = approvedSnap({
      snapshotId: "snap-draft",
      status: "DRAFT",
      review: {
        reviewedBy: null,
        reviewedAt: null,
        approvalRef: encodeDeliveredAtInApprovalRef("apr-draft", "2026-07-10"),
      },
    });
    const supersededNoDelivery = approvedSnap({
      snapshotId: "snap-superseded-bare",
      status: "SUPERSEDED",
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-07-15T00:00:00Z",
        approvalRef: "apr-old-no-delivery",
      },
    });
    expect(authoritativeDeliveriesFromSnapshots(CO, [draft, supersededNoDelivery])).toEqual([]);
  });

  it("SUPERSEDED with persisted delivery remains historically attributable", () => {
    const supersededDelivered = approvedSnap({
      snapshotId: "snap-superseded-delivered",
      status: "SUPERSEDED",
      provenance: {
        source: "doc-old",
        sourceVersion: "sha256:old",
        deliveredAtIsoDate: "2026-07-10",
      },
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-07-15T00:00:00Z",
        approvalRef: encodeDeliveredAtInApprovalRef("apr-old", "2026-07-10"),
      },
    });
    const deliveries = authoritativeDeliveriesFromSnapshots(CO, [supersededDelivered]);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.snapshotId).toBe("snap-superseded-delivered");
    expect(deliveries[0]!.deliveredAtIsoDate).toBe("2026-07-10");
  });

  it("later approval without delivery cannot displace the last actually delivered certificate", () => {
    const deliveredQ2 = approvedSnap({
      snapshotId: "snap-q2-delivered",
      reportingPeriod: "FY2026-Q2",
      asOf: "2026-06-30",
      provenance: {
        source: "doc-q2",
        sourceVersion: "sha256:q2",
        deliveredAtIsoDate: "2026-07-10",
      },
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

  it("APPROVED + asOf without deliveredAt must not establish delivery", () => {
    const snap = approvedSnap({
      snapshotId: "snap-asof-only",
      asOf: "2026-06-30",
      reportingPeriod: "FY2026-Q2",
      review: {
        reviewedBy: null,
        reviewedAt: null,
        approvalRef: "apr-no-review-no-delivery",
      },
    });
    expect(snap.asOf).toBe("2026-06-30");
    expect(persistedDeliveryDateFromSnapshot(snap)).toBeNull();
    expect(authoritativeDeliveriesFromSnapshots(CO, [snap])).toEqual([]);

    // Forbidden #344-style reconstruction: reviewedAt ?? asOf
    const inventedFromAsOf = (snap.review.reviewedAt ?? snap.asOf)?.slice(0, 10) ?? null;
    expect(inventedFromAsOf).toBe("2026-06-30");

    const cutoff = resolveAuthoritativeCutoff({
      companyId: CO,
      evaluationDate: "2026-08-01",
      approved: [snap],
    });
    expect(cutoff.state).toBe("NEEDS_INPUT");
    expect(cutoff.snapshotId).toBeNull();
  });

  it("wrong-company delivery evidence never binds another company's cutoff", () => {
    const otherCo = "other-company-id";
    const foreignDelivered = approvedSnap({
      snapshotId: "snap-foreign-delivered",
      companyId: otherCo,
      provenance: {
        source: "doc-foreign",
        sourceVersion: "sha256:foreign",
        deliveredAtIsoDate: "2026-07-10",
      },
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-07-20T18:00:00Z",
        approvalRef: encodeDeliveredAtInApprovalRef("apr-foreign", "2026-07-10"),
      },
    });
    const localApprovedNoDelivery = approvedSnap({
      snapshotId: "snap-local-no-delivery",
      companyId: CO,
      review: {
        reviewedBy: "counsel",
        reviewedAt: "2026-07-20T18:00:00Z",
        approvalRef: "apr-local",
      },
    });

    // Foreign company's persisted delivery must not appear in local company's pool.
    expect(authoritativeDeliveriesFromSnapshots(CO, [foreignDelivered, localApprovedNoDelivery])).toEqual(
      [],
    );
    expect(authoritativeDeliveriesFromSnapshots(otherCo, [foreignDelivered])).toHaveLength(1);

    const cutoff = resolveAuthoritativeCutoff({
      companyId: CO,
      evaluationDate: "2026-08-01",
      approved: [foreignDelivered, localApprovedNoDelivery],
    });
    expect(cutoff.state).toBe("NEEDS_INPUT");
    expect(cutoff.snapshotId).toBeNull();
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
    // Must not import competing product-local deliveries helper.
    expect(readinessSrc).not.toMatch(/certificate-deliveries/);
    expect(certifiedSrc).not.toMatch(/certificate-deliveries/);
    // Block #344 anti-patterns: inventing delivery from reviewedAt / asOf.
    expect(readinessSrc).not.toMatch(/reviewedAt\.slice\(0,\s*10\)/);
    expect(certifiedSrc).not.toMatch(/reviewedAt\s*\?\?\s*s\.asOf/);
    expect(certifiedSrc).not.toMatch(/reviewedAt\s*\?\?\s*.*asOf/);
    expect(readinessSrc).not.toMatch(/deliveriesFromSnapshots/);
    expect(certifiedSrc).not.toMatch(/deliveriesFromSnapshots/);
  });
});
