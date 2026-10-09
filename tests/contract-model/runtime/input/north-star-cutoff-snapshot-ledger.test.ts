/**
 * Synthetic North-Star integration (engineering fixture — NOT authentic customer certificate):
 * contractual cutoff → APPROVED snapshot identity → ledger usage → 4B resolve.
 * Labels synthetic data clearly; does not claim real-company product success.
 */
import { describe, expect, it } from "vitest";
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
import { resolveInput } from "@/lib/contract-model/runtime/input/resolve";
import { InMemoryContractLedgerStore, buildLedgerIndex } from "@/lib/contract-model/runtime/capacity";
import { toCanonicalString } from "@/lib/contract-model/runtime/decimal";

describe("North Star synthetic: cutoff + approved snapshot + ledger", () => {
  it("resolves FY2026-Q2 cutoff, binds APPROVED snapshot, records attributed basket usage", () => {
    const companyId = CONMED_FORM_INSPIRED_CERT.companyId;
    const snapStore = new InMemoryApprovedSnapshotStore();
    const ledgerProposals = new LedgerProposalRecorder();
    const proposed = proposeFromCertificate(snapStore, CONMED_FORM_INSPIRED_CERT, ledgerProposals);
    expect(proposed.ok).toBe(true);

    const approved = approveCertificateProposal(snapStore, {
      snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId,
      reviewedBy: "synth-reviewer",
      reviewedAt: "2026-07-20T12:00:00Z",
      approvalRef: "apr-synth-ns-e2e-1",
      sourceDocumentId: CONMED_FORM_INSPIRED_CERT.documentId,
      sourceVersionHash: CONMED_FORM_INSPIRED_CERT.versionHash,
      proposerKind: "human",
    });
    expect(approved.ok).toBe(true);

    const cutoff = resolveContractualSelector({
      companyId,
      evaluationDate: "2026-08-01",
      selector: "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
      fiscalCalendar: { companyId, fiscalYearEndMonth: 12, fiscalYearEndDay: 31 },
      deliveries: [{
        companyId,
        kind: "COMPLIANCE_CERTIFICATE",
        reportingPeriodKey: "FY2026-Q2",
        asOfIsoDate: "2026-06-30",
        deliveredAtIsoDate: "2026-07-20",
        documentId: CONMED_FORM_INSPIRED_CERT.documentId,
      }],
    });
    expect(cutoff.state).toBe("RESOLVED");
    if (cutoff.state !== "RESOLVED") return;
    expect(cutoff.reportingPeriodKey).toBe("FY2026-Q2");

    const bound = selectSnapshotForResolvedSelector(
      cutoff,
      snapStore.getSnapshots(companyId),
      companyId,
    );
    expect(bound).toEqual({ state: "RESOLVED", snapshotId: CONMED_FORM_INSPIRED_CERT.snapshotId });

    const snap = snapStore.getSnapshot(CONMED_FORM_INSPIRED_CERT.snapshotId)!;
    const resolved = resolveInput({
      query: {
        companyId,
        instrumentKey: "synthetic-term-loan-a",
        inputKind: "METRIC",
        key: "Consolidated EBITDA",
        period: cutoff.period,
        asOf: cutoff.asOf,
        expectedType: "MONEY",
        currency: "USD",
      },
      snapshots: [snap],
    });
    expect(resolved.state).toBe("RESOLVED");
    if (resolved.input?.value.type === "MONEY") {
      expect(toCanonicalString(resolved.input.value.amount)).toBe("125000000");
    }

    // Certificate basket lines were ledger PROPOSALS only — promote one attributed usage into 4C store.
    expect(ledgerProposals.count()).toBe(1);
    const contractLedger = new InMemoryContractLedgerStore();
    const basketLine = ledgerProposals.list()[0]!;
    const usageWrite = contractLedger.appendUsage({
      usage: {
        usageId: `usage-${basketLine.proposalId}`,
        companyId,
        instrumentKey: "synthetic-term-loan-a",
        effectiveAsOf: "2026-05-01",
        amount: { amount: basketLine.line.amount, currency: basketLine.line.currency },
        capacityPath: { kind: "RULE", ruleId: "rule-general-investments-basket" },
        transactionRef: basketLine.proposalId,
        status: "RECORDED",
        supersededByUsageId: null,
        provenance: {
          source: `certificate-schedule:${CONMED_FORM_INSPIRED_CERT.documentId}`,
          sourceVersion: CONMED_FORM_INSPIRED_CERT.versionHash,
          approvalRef: "apr-synth-ns-e2e-1",
          approvalState: "APPROVED",
        },
      },
    });
    expect(usageWrite.ok).toBe(true);
    const idx = buildLedgerIndex(contractLedger.getUsages(companyId));
    expect(idx.issues.some((i) => i.code === "ALLOCATION_INFORMATION_MISSING")).toBe(false);
    expect(contractLedger.getActiveUsages(companyId)).toHaveLength(1);
  });
});
