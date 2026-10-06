/**
 * NS-4 slice 2 — proposeFromCertificate: synthetic cert → DRAFT/REVIEW_REQUIRED via sealed appendSnapshot.
 *
 * Soft gates:
 * - MONEY without currency refused at proposal time (before store write)
 * - Basket-usage lines → LedgerProposalRecorder only (never snapshot inputs)
 * - No fill from another period / carried-forward (only facts present on the cert are mapped)
 * - APPROVED never reached here — stays DRAFT | REVIEW_REQUIRED until approveCertificateProposal
 */
import type { FinancialSnapshot } from "../../types";
import { InMemoryApprovedSnapshotStore } from "../memory-store";
import { APPENDABLE_STATUSES } from "../types";
import type { LedgerProposalRecorder } from "./ledger-proposals";
import { certificateIdentityKey, factToFinancialInput } from "./map-fact";
import type {
  CertificateProposalIssue,
  ProposeFromCertificateResult,
  SyntheticCertificate,
} from "./types";

function validateCertificate(cert: SyntheticCertificate): CertificateProposalIssue[] {
  const issues: CertificateProposalIssue[] = [];

  if (!(APPENDABLE_STATUSES as readonly string[]).includes(cert.proposalStatus)) {
    issues.push({
      code: "INVALID_PROPOSAL_STATUS",
      message: `proposeFromCertificate accepts only DRAFT | REVIEW_REQUIRED; got ${cert.proposalStatus}. APPROVED requires approveCertificateProposal`,
      refs: [cert.snapshotId],
    });
  }

  const seen = new Set<string>();
  for (const fact of cert.facts) {
    // Refuse LEDGER_USAGE disguised as a snapshot fact — basket lines have their own channel.
    if (fact.inputKind === "LEDGER_USAGE") {
      issues.push({
        code: "BASKET_LINE_MUST_NOT_BE_SNAPSHOT_FACT",
        message: `fact "${fact.key}" has inputKind LEDGER_USAGE; basket-usage must use basketUsageLines → LedgerProposalRecorder, never snapshot inputs`,
        refs: [fact.key],
      });
    }

    if (fact.valueType === "MONEY" && !fact.currency) {
      issues.push({
        code: "MONEY_WITHOUT_CURRENCY",
        message: `fact "${fact.key}" is MONEY without currency; currency is part of 4B identity and must be present at proposal time`,
        refs: [fact.key],
      });
    }

    if (fact.value.type === "MONEY" && !fact.value.currency) {
      issues.push({
        code: "MONEY_WITHOUT_CURRENCY",
        message: `fact "${fact.key}" MONEY value payload lacks currency`,
        refs: [fact.key],
      });
    }

    if (fact.valueType !== fact.value.type) {
      issues.push({
        code: "VALUE_TYPE_MISMATCH",
        message: `fact "${fact.key}" valueType ${fact.valueType} does not match value.type ${fact.value.type}`,
        refs: [fact.key],
      });
    }

    // MONEY identity currency must agree with value currency when both present.
    if (fact.valueType === "MONEY" && fact.currency && fact.value.type === "MONEY" && fact.currency !== fact.value.currency) {
      issues.push({
        code: "VALUE_TYPE_MISMATCH",
        message: `fact "${fact.key}" identity currency ${fact.currency} != value currency ${fact.value.currency}`,
        refs: [fact.key],
      });
    }

    const idKey = certificateIdentityKey(fact);
    if (seen.has(idKey)) {
      issues.push({
        code: "DUPLICATE_IDENTITY_IN_CERTIFICATE",
        message: `certificate carries duplicate identity for "${fact.key}" (same company/scope/kind/key/period/asOf/valueType/currency)`,
        refs: [fact.key],
      });
    }
    seen.add(idKey);
  }

  return issues;
}

/**
 * Map certificate facts → 4B FinancialInputs 1:1 and append as DRAFT | REVIEW_REQUIRED.
 * Basket-usage lines are recorded on the ledger recorder only — never into snapshot.inputs.
 *
 * Intentionally does **not** look up prior periods or other certificates: a missing fact
 * stays missing (no carried-forward fill).
 */
export function proposeFromCertificate(
  store: InMemoryApprovedSnapshotStore,
  cert: SyntheticCertificate,
  ledgerRecorder: LedgerProposalRecorder,
): ProposeFromCertificateResult {
  const localIssues = validateCertificate(cert);
  if (localIssues.length > 0) return { ok: false, issues: localIssues };

  const sourceVersion = `${cert.documentId}@${cert.versionHash}`;
  // Only facts on *this* certificate — no cross-period fill.
  const inputs = cert.facts.map((f) => factToFinancialInput(f, sourceVersion));

  const snapshot: FinancialSnapshot = {
    snapshotId: cert.snapshotId,
    version: cert.version,
    companyId: cert.companyId,
    asOf: cert.asOf,
    reportingPeriod: cert.reportingPeriod,
    status: cert.proposalStatus,
    supersedesSnapshotId: cert.supersedesSnapshotId ?? null,
    inputs,
    provenance: {
      source: `certificate:${cert.layoutId}`,
      sourceVersion,
      note: [
        `proposer=${cert.proposer.kind}:${cert.proposer.id}`,
        cert.note,
        cert.proposer.note,
      ]
        .filter(Boolean)
        .join("; "),
    },
    review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
  };

  const write = store.appendSnapshot({ snapshot });
  if (!write.ok) {
    return {
      ok: false,
      issues: [
        {
          code: "STORE_WRITE_REJECTED",
          message: `appendSnapshot refused certificate proposal ${cert.snapshotId}`,
          refs: [cert.snapshotId],
          storeIssues: write.issues,
        },
      ],
    };
  }

  // Record basket-usage as ledger PROPOSALS only — never snapshot facts, never applied.
  const ledgerProposals = cert.basketUsageLines.map((line) =>
    ledgerRecorder.record({
      sourceDocumentId: cert.documentId,
      sourceVersionHash: cert.versionHash,
      companyId: cert.companyId,
      line,
      proposer: cert.proposer,
    }),
  );

  return { ok: true, write, ledgerProposals };
}
