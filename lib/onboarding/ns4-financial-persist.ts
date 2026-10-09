/**
 * Persist human-approved FINANCIAL_FACT promotions through the North Star
 * NS-4 approved-snapshot store (propose DRAFT → attributable approve).
 *
 * Reuses proposeFromCertificateAsync / approveCertificateProposalAsync.
 * Never auto-approves without reviewedBy from the candidate review event.
 * Legacy FinancialSnapshot/FinancialState dual-write remains; this is the
 * authoritative NS path the dashboard readiness layer can count.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  LedgerProposalRecorder,
  PrismaApprovedSnapshotStore,
  approveCertificateProposalAsync,
  proposeFromCertificateAsync,
  type CertificateFactProposal,
  type SyntheticCertificate,
} from "@/lib/contract-model/runtime/input/store";

/** Map connector metricName → NS-4 certificate fact key (4B identity). */
export const NS4_FACT_KEY_BY_METRIC: Record<string, string> = {
  covenant_ebitda: "Consolidated EBITDA",
  total_debt: "Consolidated Total Debt",
  secured_debt: "Secured Debt",
  cash: "Unrestricted Cash",
  interest_expense: "Interest Expense",
  cumulative_net_income: "Cumulative Net Income",
  equity_proceeds: "Equity Proceeds",
  assumed_new_debt_rate_pct: "Assumed New Debt Rate",
};

export interface Ns4FactInput {
  metricName: string;
  /** Canonical value (USD_MILLIONS for dollar metrics, PERCENT for rates). */
  value: number;
  asOfDate: Date;
  candidateId: string;
  sourceDocumentId: string | null;
  reviewedBy: string | null;
}

export interface Ns4PersistResult {
  ok: boolean;
  snapshotId?: string;
  reason?: string;
}

function periodKey(asOf: Date): string {
  return `asOf=${asOf.toISOString().slice(0, 10)}`;
}

function moneyAmountFromMillions(millions: number): string {
  // NS-4 MONEY amounts are USD dollars as decimal strings (see certificate fixtures).
  return String(Math.round(millions * 1_000_000));
}

function buildFact(companyId: string, input: Ns4FactInput): CertificateFactProposal | null {
  const key = NS4_FACT_KEY_BY_METRIC[input.metricName];
  if (!key) return null;
  const asOfIso = input.asOfDate.toISOString().slice(0, 10);
  const period = { kind: "VERBATIM_CONTRACT_PERIOD_KEY" as const, key: periodKey(input.asOfDate) };
  const asOf = { kind: "EXACT_DATE" as const, isoDate: asOfIso };
  const scope = { kind: "COMPANY_LEVEL" as const, instrumentApplicability: { kind: "ALL_INSTRUMENTS" as const } };

  if (input.metricName === "assumed_new_debt_rate_pct") {
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
      value: { type: "PERCENT", fraction: String(input.value / 100) },
      locator: { note: `candidate=${input.candidateId}` },
      displayName: key,
    };
  }

  return {
    companyId,
    scope,
    inputKind: "METRIC",
    key,
    identityStrength: "CONTRACT_NAME_ONLY",
    period,
    asOf,
    valueType: "MONEY",
    currency: "USD",
    value: { type: "MONEY", amount: moneyAmountFromMillions(input.value), currency: "USD" },
    locator: { note: `candidate=${input.candidateId}` },
    displayName: key,
  };
}

/**
 * After legacy FINANCIAL_FACT promotion succeeds, append + approve one NS-4
 * snapshot for the as-of cohort. Failures are returned, never thrown into
 * inventing a certified status.
 */
export async function persistPromotedFinancialFactsToNs4(
  companyId: string,
  facts: Ns4FactInput[],
): Promise<Ns4PersistResult> {
  if (facts.length === 0) return { ok: false, reason: "No facts to persist." };

  const asOfDate = facts[0]!.asOfDate;
  const asOfIso = asOfDate.toISOString().slice(0, 10);
  const mapped = facts.map((f) => buildFact(companyId, f)).filter((f): f is CertificateFactProposal => f !== null);
  if (mapped.length === 0) return { ok: false, reason: "No recognized metricNames for NS-4 mapping." };

  const reviewedBy = facts.map((f) => f.reviewedBy?.trim()).find((v) => v && v.length > 0);
  if (!reviewedBy) {
    return { ok: false, reason: "NS-4 approve requires attributable reviewedBy from the candidate review event." };
  }

  const sourceDocumentId = facts.map((f) => f.sourceDocumentId).find((id) => id) ?? `financial-facts:${companyId}`;
  const versionHash = createHash("sha256")
    .update(mapped.map((f) => `${f.key}=${JSON.stringify(f.value)}`).sort().join("|"))
    .digest("hex");
  const snapshotId = `ns4:${companyId}:${asOfIso}:${versionHash.slice(0, 12)}`;

  const existing = await prisma.contractInputSnapshot.findFirst({
    where: { companyId, snapshotId },
    select: { id: true, status: true },
  });
  if (existing?.status === "APPROVED") {
    return { ok: true, snapshotId, reason: "Already APPROVED in NS-4 store." };
  }

  const cert: SyntheticCertificate = {
    documentId: sourceDocumentId,
    versionHash: `sha256:${versionHash}`,
    companyId,
    reportingPeriod: periodKey(asOfDate),
    asOf: asOfIso,
    layoutId: "customer-setup-financial-facts",
    proposer: { kind: "human", id: reviewedBy, note: "approved FINANCIAL_FACT candidates" },
    proposalStatus: "DRAFT",
    snapshotId,
    version: "1",
    supersedesSnapshotId: null,
    note: `Promoted from FINANCIAL_FACT candidates: ${facts.map((f) => f.candidateId).join(", ")}`,
    facts: mapped,
    basketUsageLines: [],
  };

  try {
    const store = await PrismaApprovedSnapshotStore.open(prisma, companyId);
    const ledger = new LedgerProposalRecorder();
    const proposed = await proposeFromCertificateAsync(store, cert, ledger);
    if (!proposed.ok) {
      return {
        ok: false,
        reason: proposed.issues.map((i) => i.message).join("; ") || "proposeFromCertificate refused",
      };
    }

    const approved = await approveCertificateProposalAsync(store, {
      snapshotId,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
      approvalRef: `fin-fact-promote:${facts.map((f) => f.candidateId).sort().join(",")}`,
      sourceDocumentId,
      sourceVersionHash: cert.versionHash,
      proposerKind: "human",
    });
    if (!approved.ok) {
      return {
        ok: false,
        reason: approved.issues.map((i) => i.message).join("; ") || "approveCertificateProposal refused",
      };
    }
    return { ok: true, snapshotId };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
