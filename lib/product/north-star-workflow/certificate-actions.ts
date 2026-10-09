/**
 * Customer workflow: propose synthetic/structured certificate → attributable APPROVED snapshot
 * and optional contract-ledger usage from basket schedule lines.
 */
import { prisma } from "@/lib/prisma";
import {
  PrismaApprovedSnapshotStore,
  LedgerProposalRecorder,
  proposeFromCertificateAsync,
  approveCertificateProposalAsync,
  PrismaContractLedgerStore,
  CONMED_FORM_INSPIRED_CERT,
  type SyntheticCertificate,
} from "@/lib/contract-model/north-star-bridge";

export interface SeedCertificateResult {
  ok: boolean;
  companyId: string;
  snapshotId: string;
  status: string;
  ledgerProposalCount: number;
  issues?: string[];
  label: string;
}

/** Seed a clearly-labeled synthetic certificate proposal for a workspace (DRAFT). */
export async function proposeSyntheticCertificateForCompany(
  companyId: string,
  opts?: { snapshotId?: string; reportingPeriod?: string; asOf?: string },
): Promise<SeedCertificateResult> {
  const snapshotId = opts?.snapshotId ?? `snap-${companyId}-synth-cert`;
  const cert: SyntheticCertificate = {
    ...CONMED_FORM_INSPIRED_CERT,
    companyId,
    snapshotId,
    reportingPeriod: opts?.reportingPeriod ?? CONMED_FORM_INSPIRED_CERT.reportingPeriod,
    asOf: opts?.asOf ?? CONMED_FORM_INSPIRED_CERT.asOf,
    documentId: `synth-cert-${companyId}`,
    versionHash: `sha256:synth-${companyId}-v1`,
    note: "SYNTHETIC engineering fixture — not an authentic customer certificate",
    facts: CONMED_FORM_INSPIRED_CERT.facts.map((f) => ({ ...f, companyId })),
  };

  const store = await PrismaApprovedSnapshotStore.open(prisma, companyId);
  const existing = store.getSnapshot(snapshotId);
  if (existing) {
    return {
      ok: true,
      companyId,
      snapshotId,
      status: existing.status,
      ledgerProposalCount: 0,
      label: "SYNTHETIC — already present",
    };
  }

  const ledger = new LedgerProposalRecorder();
  const proposed = await proposeFromCertificateAsync(store, cert, ledger);
  if (!proposed.ok) {
    return {
      ok: false,
      companyId,
      snapshotId,
      status: "REJECTED",
      ledgerProposalCount: 0,
      issues: proposed.issues.map((i) => i.message),
      label: "SYNTHETIC — proposal refused",
    };
  }
  return {
    ok: true,
    companyId,
    snapshotId,
    status: cert.proposalStatus,
    ledgerProposalCount: ledger.count(),
    label: "SYNTHETIC — DRAFT proposal (not approved)",
  };
}

export interface ApproveCertificateResult {
  ok: boolean;
  snapshotId: string;
  status: string;
  approvalRef?: string;
  issues?: string[];
}

/** Attributable approval — never auto-approve extractors. */
export async function approveWorkspaceCertificate(args: {
  companyId: string;
  snapshotId: string;
  reviewedBy: string;
  approvalRef: string;
  /** ISO timestamp of attributable approval; defaults to now. */
  reviewedAt?: string;
  /**
   * When the certificate was delivered (ISO date). Used as cutoff delivery evidence.
   * Defaults to reviewedAt date — do not invent an earlier delivery.
   */
  deliveredAsOfDate?: string;
  sourceDocumentId?: string;
  sourceVersionHash?: string;
}): Promise<ApproveCertificateResult> {
  const store = await PrismaApprovedSnapshotStore.open(prisma, args.companyId);
  const snap = store.getSnapshot(args.snapshotId);
  if (!snap) {
    return { ok: false, snapshotId: args.snapshotId, status: "MISSING", issues: ["snapshot not found"] };
  }
  if (snap.status === "APPROVED") {
    return { ok: true, snapshotId: args.snapshotId, status: "APPROVED", approvalRef: snap.review.approvalRef ?? undefined };
  }
  const reviewedAt = args.reviewedAt ?? new Date().toISOString();
  const result = await approveCertificateProposalAsync(store, {
    snapshotId: args.snapshotId,
    reviewedBy: args.reviewedBy,
    reviewedAt,
    approvalRef: args.approvalRef,
    sourceDocumentId: args.sourceDocumentId,
    sourceVersionHash: args.sourceVersionHash,
    proposerKind: "human",
  });
  if (!result.ok) {
    return {
      ok: false,
      snapshotId: args.snapshotId,
      status: snap.status,
      issues: result.issues.map((i) => i.message),
    };
  }
  return {
    ok: true,
    snapshotId: args.snapshotId,
    status: "APPROVED",
    approvalRef: args.approvalRef,
  };
}

/** Record one attributed contract-ledger usage (4C) for historical basket capacity. */
export async function appendContractLedgerUsage(args: {
  companyId: string;
  usageId: string;
  instrumentKey: string;
  effectiveAsOf: string;
  amount: string;
  currency: string;
  ruleId: string;
  transactionRef: string;
  approvalRef: string;
}): Promise<{ ok: boolean; issues?: string[] }> {
  const store = await PrismaContractLedgerStore.open(prisma, args.companyId);
  const result = await store.appendUsage({
    usage: {
      usageId: args.usageId,
      companyId: args.companyId,
      instrumentKey: args.instrumentKey,
      effectiveAsOf: args.effectiveAsOf,
      amount: { amount: args.amount, currency: args.currency },
      capacityPath: { kind: "RULE", ruleId: args.ruleId },
      transactionRef: args.transactionRef,
      status: "RECORDED",
      supersededByUsageId: null,
      provenance: {
        source: "customer-certificate-or-manual",
        sourceVersion: null,
        approvalRef: args.approvalRef,
        approvalState: "APPROVED",
      },
    },
  });
  if (!result.ok) return { ok: false, issues: result.issues.map((i) => i.message) };
  return { ok: true };
}
