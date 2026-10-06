/**
 * NS-4 slice 2 — happy path: synthetic certificate → DRAFT/REVIEW_REQUIRED → APPROVED.
 */
import { describe, expect, it } from "vitest";
import {
  InMemoryApprovedSnapshotStore,
  LedgerProposalRecorder,
  approveCertificateProposal,
  proposeFromCertificate,
} from "@/lib/contract-model/runtime/input/store";
import {
  CHEWY_FORM_INSPIRED_CERT,
  CONMED_FORM_INSPIRED_CERT,
  INVENTED_TABULAR_CERT,
  INVENTED_TABULAR_RESTATEMENT,
} from "@/lib/contract-model/runtime/input/store/certificate/fixtures";
import { toCanonicalString } from "@/lib/contract-model/runtime/decimal";

describe("proposeFromCertificate → approveCertificateProposal (happy path)", () => {
  it("CONMED-form-inspired: human DRAFT → APPROVED; basket lines recorded not applied", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const proposed = proposeFromCertificate(store, CONMED_FORM_INSPIRED_CERT, ledger);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    const snap = store.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    expect(snap.status).toBe("DRAFT");
    expect(snap.review.approvalRef).toBeNull();
    expect(snap.inputs).toHaveLength(3);
    expect(snap.inputs.every((i) => i.identity.inputKind !== "LEDGER_USAGE")).toBe(true);
    // Basket usage is NOT in snapshot inputs.
    expect(snap.inputs.map((i) => i.identity.key)).not.toContain("General Investments Basket");

    expect(ledger.count()).toBe(1);
    expect(ledger.list()[0]!.status).toBe("RECORDED");
    expect(ledger.list()[0]!.line.basketKey).toBe("General Investments Basket");
    expect(() => ledger.apply(ledger.list()[0]!.proposalId)).toThrow(/never applied/i);

    const approved = approveCertificateProposal(store, {
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "alice",
      reviewedAt: "2026-10-06T18:00:00Z",
      approvalRef: "apr-conmed-synth-1",
      sourceDocumentId: CONMED_FORM_INSPIRED_CERT.documentId,
      sourceVersionHash: CONMED_FORM_INSPIRED_CERT.versionHash,
      proposerKind: "human",
    });
    expect(approved.ok).toBe(true);
    const after = store.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    expect(after.status).toBe("APPROVED");
    expect(after.review.reviewedBy).toBe("alice");
    expect(after.review.approvalRef).toContain("apr-conmed-synth-1");
    expect(after.review.approvalRef).toContain(`doc=${CONMED_FORM_INSPIRED_CERT.documentId}`);

    const ebitda = after.inputs.find((i) => i.identity.key === "Consolidated EBITDA")!;
    expect(ebitda.value.type).toBe("MONEY");
    if (ebitda.value.type === "MONEY") {
      expect(toCanonicalString(ebitda.value.amount)).toBe("125000000");
      expect(ebitda.value.currency).toBe("USD");
    }
  });

  it("Chewy-form-inspired: extractor REVIEW_REQUIRED stays until approve; multiple ledger proposals", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    const proposed = proposeFromCertificate(store, CHEWY_FORM_INSPIRED_CERT, ledger);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) return;

    expect(store.getSnapshot(CHEWY_FORM_INSPIRED_CERT.snapshotId)!.status).toBe("REVIEW_REQUIRED");
    expect(ledger.count()).toBe(2);
    expect(proposed.ledgerProposals.every((p) => p.status === "RECORDED")).toBe(true);

    // Still not APPROVED without explicit approve.
    expect(store.getSnapshot(CHEWY_FORM_INSPIRED_CERT.snapshotId)!.status).not.toBe("APPROVED");

    const approved = approveCertificateProposal(store, {
      snapshotId: CHEWY_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "bob",
      reviewedAt: "2026-10-06T19:00:00Z",
      approvalRef: "apr-chewy-synth-1",
      sourceDocumentId: CHEWY_FORM_INSPIRED_CERT.documentId,
      proposerKind: "extractor",
    });
    expect(approved.ok).toBe(true);
    expect(store.getSnapshot(CHEWY_FORM_INSPIRED_CERT.snapshotId)!.status).toBe("APPROVED");
  });

  it("invented-tabular PUBLIC_FILING_RECONSTRUCTION + restatement supersession", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();

    expect(proposeFromCertificate(store, INVENTED_TABULAR_CERT, ledger).ok).toBe(true);
    expect(store.getSnapshot(INVENTED_TABULAR_CERT.snapshotId)!.status).toBe("REVIEW_REQUIRED");

    expect(
      approveCertificateProposal(store, {
        snapshotId: INVENTED_TABULAR_CERT.snapshotId,
        reviewedBy: "carol",
        reviewedAt: "2026-10-06T20:00:00Z",
        approvalRef: "apr-invented-1",
        sourceDocumentId: INVENTED_TABULAR_CERT.documentId,
        sourceVersionHash: INVENTED_TABULAR_CERT.versionHash,
        proposerKind: "PUBLIC_FILING_RECONSTRUCTION",
      }).ok,
    ).toBe(true);

    expect(proposeFromCertificate(store, INVENTED_TABULAR_RESTATEMENT, ledger).ok).toBe(true);
    expect(store.getSnapshot(INVENTED_TABULAR_CERT.snapshotId)!.status).toBe("SUPERSEDED");
    expect(store.getSnapshot(INVENTED_TABULAR_RESTATEMENT.snapshotId)!.status).toBe("DRAFT");

    const restated = store.getSnapshot(INVENTED_TABULAR_RESTATEMENT.snapshotId)!;
    const ebitda = restated.inputs.find((i) => i.identity.key === "Adjusted EBITDA")!;
    expect(ebitda.value.type).toBe("MONEY");
    if (ebitda.value.type === "MONEY") expect(toCanonicalString(ebitda.value.amount)).toBe("65500000");

    // Superseded predecessor remains queryable.
    expect(store.getSnapshot(INVENTED_TABULAR_CERT.snapshotId)).not.toBeNull();
    expect(ledger.count()).toBe(0);
  });

  it("maps certificate facts 1:1 onto FinancialInput identities", () => {
    const store = new InMemoryApprovedSnapshotStore();
    const ledger = new LedgerProposalRecorder();
    expect(proposeFromCertificate(store, CONMED_FORM_INSPIRED_CERT, ledger).ok).toBe(true);
    const snap = store.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    for (let i = 0; i < CONMED_FORM_INSPIRED_CERT.facts.length; i++) {
      const fact = CONMED_FORM_INSPIRED_CERT.facts[i]!;
      const input = snap.inputs[i]!;
      expect(input.identity.companyId).toBe(fact.companyId);
      expect(input.identity.key).toBe(fact.key);
      expect(input.identity.inputKind).toBe(fact.inputKind);
      expect(input.identity.valueType).toBe(fact.valueType);
      expect(input.identity.currency).toBe(fact.currency);
      expect(input.identity.period).toEqual(fact.period);
      expect(input.identity.asOf).toEqual(fact.asOf);
    }
  });
});

describe("LedgerProposalRecorder public surface (append-only)", () => {
  it("exposes record/list/count/apply only — clear/reset/truncate absent on instance and prototype", () => {
    const recorder = new LedgerProposalRecorder();
    const proto = LedgerProposalRecorder.prototype as unknown as Record<string, unknown>;
    const instance = recorder as unknown as Record<string, unknown>;

    expect(typeof recorder.record).toBe("function");
    expect(typeof recorder.list).toBe("function");
    expect(typeof recorder.count).toBe("function");
    expect(typeof recorder.apply).toBe("function");

    for (const name of ["clear", "reset", "truncate", "empty", "wipe"] as const) {
      expect(typeof instance[name]).toBe("undefined");
      expect(typeof proto[name]).toBe("undefined");
      expect(Object.prototype.hasOwnProperty.call(proto, name)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(instance, name)).toBe(false);
    }
  });
});
