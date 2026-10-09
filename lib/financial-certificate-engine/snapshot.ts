/**
 * Produce DRAFT / REVIEW_REQUIRED financial snapshots through existing NS-4
 * interfaces. Never marks APPROVED from extraction alone.
 */

import { createHash } from "crypto";
import {
  LedgerProposalRecorder,
  PrismaApprovedSnapshotStore,
  proposeFromCertificateAsync,
  approveCertificateProposalAsync,
  type CertificateFactProposal,
  type SyntheticCertificate,
} from "@/lib/contract-model/north-star-bridge";
import type { DocumentExtraction, EngineRunResult, ReconciliationReport } from "./types";

function moneyAmountFromMillions(millions: number): string {
  return String(Math.round(millions * 1_000_000));
}

function factFromMetric(
  companyId: string,
  metric: DocumentExtraction["metrics"][number],
  periodKey: string,
): CertificateFactProposal | null {
  const key =
    metric.contractualName ??
    (metric.family === "GAAP_EBITDA"
      ? "GAAP EBITDA"
      : metric.family === "LEVERAGE_RATIO"
        ? "Total Net Leverage Ratio"
        : metric.family === "INTEREST_COVERAGE"
          ? "Interest Coverage Ratio"
          : metric.family === "TOTAL_ASSETS"
            ? "Total Assets"
            : metric.family === "FIRST_LIEN_DEBT"
              ? "First Lien Debt"
              : metric.family === "FIXED_CHARGES"
                ? "Consolidated Fixed Charges"
                : null);
  if (!key) return null;

  const period = { kind: "VERBATIM_CONTRACT_PERIOD_KEY" as const, key: periodKey };
  const asOf = { kind: "EXACT_DATE" as const, isoDate: metric.asOfDate };
  const scope = { kind: "COMPANY_LEVEL" as const, instrumentApplicability: { kind: "ALL_INSTRUMENTS" as const } };
  const locator = {
    section: metric.source.section ?? undefined,
    table: metric.source.table ?? undefined,
    row: metric.source.row ?? undefined,
    note: `line=${metric.source.lineIndex ?? "?"}; ${metric.source.excerpt.slice(0, 120)}`,
  };

  if (metric.canonicalUnit === "RATIO") {
    return {
      companyId,
      scope,
      inputKind: "METRIC",
      key,
      identityStrength: "CONTRACT_NAME_ONLY",
      period,
      asOf,
      valueType: "RATIO",
      currency: null,
      value: { type: "RATIO", value: String(metric.canonicalValue) },
      locator,
      displayName: key,
      note: metric.isContractual ? "contractual" : "reported/gaap",
    };
  }

  if (metric.canonicalUnit === "PERCENT") {
    return {
      companyId,
      scope,
      inputKind: "METRIC",
      key,
      identityStrength: "CONTRACT_NAME_ONLY",
      period,
      asOf,
      valueType: "PERCENT",
      currency: null,
      value: { type: "PERCENT", fraction: String(metric.canonicalValue / 100) },
      locator,
      displayName: key,
    };
  }

  return {
    companyId,
    scope,
    inputKind: "METRIC",
    key,
    identityStrength: metric.isContractual ? "CONTRACT_NAME_ONLY" : "STABLE_KEY",
    period,
    asOf,
    valueType: "MONEY",
    currency: "USD",
    value: { type: "MONEY", amount: moneyAmountFromMillions(metric.canonicalValue), currency: "USD" },
    locator,
    displayName: key,
    note: metric.isContractual ? "contractual" : "reported/gaap — not capacity substitute",
  };
}

export function buildCertificateProposalFromEngine(params: {
  companyId: string;
  run: EngineRunResult;
  proposalStatus?: "DRAFT" | "REVIEW_REQUIRED";
}): SyntheticCertificate | null {
  const { companyId, run } = params;
  const source = run.certificate ?? run.statement;
  if (!source || !run.reconciliation.asOfDate) return null;

  const asOfIso = run.reconciliation.asOfDate;
  const periodKey = run.reconciliation.reportingPeriod ?? `asOf=${asOfIso}`;
  const status =
    params.proposalStatus ??
    (run.reconciliation.disposition === "APPROVED_ELIGIBLE" ? "DRAFT" : "REVIEW_REQUIRED");

  const metrics = [
    ...(run.certificate?.metrics ?? []),
    // Include GAAP from statement so the snapshot preserves both identities.
    ...(run.statement?.metrics.filter((m) => m.family === "GAAP_EBITDA") ?? []),
  ];

  const facts = metrics
    .map((m) => factFromMetric(companyId, m, periodKey))
    .filter((f): f is CertificateFactProposal => f !== null);

  if (facts.length === 0) return null;

  const versionHash = createHash("sha256")
    .update(facts.map((f) => `${f.key}=${JSON.stringify(f.value)}`).sort().join("|"))
    .digest("hex");
  const snapshotId = `fce:${companyId}:${asOfIso}:${versionHash.slice(0, 12)}`;
  const documentId = source.identity.documentId;

  return {
    documentId,
    versionHash: source.identity.versionHash ?? `sha256:${versionHash}`,
    companyId,
    reportingPeriod: periodKey,
    asOf: asOfIso,
    layoutId: "financial-certificate-engine",
    proposer: {
      kind: "extractor",
      id: "financial-certificate-engine",
      note: "Deterministic extraction — not approved",
    },
    proposalStatus: status,
    snapshotId,
    version: "1",
    supersedesSnapshotId: null,
    note: `FCE disposition=${run.reconciliation.disposition}; ${run.reconciliation.dispositionReason}`,
    facts,
    basketUsageLines: [],
  };
}

export interface ProposeNs4Result {
  ok: boolean;
  snapshotId?: string;
  status?: string;
  reason?: string;
}

/** Append DRAFT / REVIEW_REQUIRED only. Never APPROVED. */
export async function proposeNs4SnapshotFromEngine(params: {
  companyId: string;
  run: EngineRunResult;
}): Promise<ProposeNs4Result> {
  const cert = buildCertificateProposalFromEngine(params);
  if (!cert) return { ok: false, reason: "No metrics available to propose." };
  if (cert.proposalStatus === "APPROVED") {
    return { ok: false, reason: "Refusing to propose APPROVED from extraction." };
  }

  const { prisma } = await import("@/lib/prisma");
  const store = await PrismaApprovedSnapshotStore.open(prisma, params.companyId);
  const recorder = new LedgerProposalRecorder();
  const result = await proposeFromCertificateAsync(store, cert, recorder);
  if (!result.ok) {
    return {
      ok: false,
      reason: result.issues.map((i) => i.message).join("; ") || "NS-4 propose failed",
    };
  }
  return { ok: true, snapshotId: cert.snapshotId, status: cert.proposalStatus };
}

/**
 * Attributable approval only — requires reviewedBy. Extraction eligibility
 * alone is insufficient (caller must still supply a human reviewer id).
 */
export async function approveNs4SnapshotAttributable(params: {
  companyId: string;
  snapshotId: string;
  reviewedBy: string;
  approvalRef: string;
  reconciliation: ReconciliationReport;
}): Promise<ProposeNs4Result> {
  const reviewedBy = params.reviewedBy.trim();
  if (!reviewedBy) {
    return { ok: false, reason: "Attributable reviewedBy is required; extraction is not approval." };
  }
  if (params.reconciliation.disposition === "BLOCKED") {
    return { ok: false, reason: "Reconciliation disposition is BLOCKED; cannot approve." };
  }

  const { prisma } = await import("@/lib/prisma");
  const store = await PrismaApprovedSnapshotStore.open(prisma, params.companyId);
  const result = await approveCertificateProposalAsync(store, {
    snapshotId: params.snapshotId,
    reviewedBy,
    reviewedAt: new Date().toISOString(),
    approvalRef: params.approvalRef,
    proposerKind: "extractor",
  });
  if (!result.ok) {
    return {
      ok: false,
      reason: result.issues.map((i) => i.message).join("; ") || "NS-4 approve failed",
    };
  }
  return { ok: true, snapshotId: params.snapshotId, status: "APPROVED" };
}
