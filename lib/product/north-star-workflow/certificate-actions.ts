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
  type BasketUsageScheduleLine,
} from "@/lib/contract-model/north-star-bridge";

/** In-process cache of basket lines proposed with a snapshot (lost on process restart; re-seed covers). */
const pendingBasketBySnapshot = new Map<string, BasketUsageScheduleLine[]>();

function asOfIsoFromLine(line: BasketUsageScheduleLine): string {
  if (line.asOf.kind === "EXACT_DATE") return line.asOf.isoDate;
  return new Date().toISOString().slice(0, 10);
}

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
  // Hold basket lines until attributable approval — never auto-apply into 4C capacity truth.
  pendingBasketBySnapshot.set(snapshotId, cert.basketUsageLines.map((l) => structuredClone(l)));
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

  // Promote certificate basket schedule lines into attributed 4C RECORDED usages (same approval).
  const basketLines =
    pendingBasketBySnapshot.get(args.snapshotId) ??
    // Fallback for synthetic CONMED-form seed after process restart.
    (snap.provenance.source?.includes("conmed-form")
      ? CONMED_FORM_INSPIRED_CERT.basketUsageLines.map((l) => ({
          ...l,
          // Keep fixture instrument keys; company already bound via snapshot.
        }))
      : []);
  const promoteIssues: string[] = [];
  if (basketLines.length > 0) {
    const promoted = await promoteBasketLinesToContractLedger({
      companyId: args.companyId,
      snapshotId: args.snapshotId,
      approvalRef: args.approvalRef,
      lines: basketLines,
    });
    if (!promoted.ok) promoteIssues.push(...(promoted.issues ?? []));
    else pendingBasketBySnapshot.delete(args.snapshotId);
  }

  return {
    ok: true,
    snapshotId: args.snapshotId,
    status: "APPROVED",
    approvalRef: args.approvalRef,
    issues: promoteIssues.length ? promoteIssues : undefined,
  };
}

/**
 * Map certificate basket-usage schedule lines → attributed Phase 4C ledger usages.
 * Requires explicit approvalRef — never silent apply from extractor proposals alone.
 */
export async function promoteBasketLinesToContractLedger(args: {
  companyId: string;
  snapshotId: string;
  approvalRef: string;
  lines: BasketUsageScheduleLine[];
}): Promise<{ ok: boolean; appended: number; issues?: string[] }> {
  const store = await PrismaContractLedgerStore.open(prisma, args.companyId);
  const issues: string[] = [];
  let appended = 0;
  for (let i = 0; i < args.lines.length; i++) {
    const line = args.lines[i]!;
    const usageId = `cert-basket-${args.snapshotId}-${i}-${line.basketKey}`.replace(/\s+/g, "_").slice(0, 180);
    const existing = store.getUsage(usageId);
    if (existing && existing.status !== "SUPERSEDED") {
      appended += 1;
      continue;
    }
    const status = line.direction === "REPAYMENT" ? "REVERSED" : "RECORDED";
    const result = await store.appendUsage({
      usage: {
        usageId,
        companyId: args.companyId,
        instrumentKey: line.instrumentKey ?? "company",
        effectiveAsOf: asOfIsoFromLine(line),
        amount: { amount: line.amount, currency: line.currency },
        capacityPath: { kind: "RULE", ruleId: line.basketKey },
        transactionRef: `certificate:${args.snapshotId}:${line.basketKey}`,
        status,
        supersededByUsageId: null,
        provenance: {
          source: `certificate-basket:${args.snapshotId}`,
          sourceVersion: line.locator.section ?? null,
          approvalRef: args.approvalRef,
          approvalState: "APPROVED",
        },
      },
    });
    if (!result.ok) {
      issues.push(...result.issues.map((x) => x.message));
    } else {
      appended += 1;
    }
  }
  return { ok: issues.length === 0, appended, issues: issues.length ? issues : undefined };
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
