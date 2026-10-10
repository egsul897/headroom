/**
 * Approval-to-execution bridge (Agent 2 P0).
 *
 * Lifecycle:
 *   extract → reconcile → propose ContractInputSnapshot (DRAFT|REVIEW_REQUIRED)
 *   → attributable approve → APPROVED snapshot → verified capacity input
 *   → transaction simulation inputs
 *
 * DRAFT / REVIEW_REQUIRED snapshots are never treated as authoritative.
 * Reuses existing NS-4 Prisma store — no competing financial truth store.
 */

import { prisma } from "@/lib/prisma";
import {
  loadApprovedSnapshotsFromPrisma,
  snapshotInputResolver,
  type SyntheticCertificate,
} from "@/lib/contract-model/north-star-bridge";
import type { FinancialSnapshotInput } from "@/lib/covenant-engine";

/** NS-4 APPROVED snapshot shape via the product bridge — never import raw runtime paths. */
type FinancialSnapshot = Awaited<ReturnType<typeof loadApprovedSnapshotsFromPrisma>>[number];
import {
  approveNs4SnapshotAttributable,
  buildCertificateProposalFromEngine,
  proposeNs4SnapshotFromEngine,
  type ProposeNs4Result,
} from "./snapshot";
import {
  buildFinancialStateFromEngineRun,
  projectEngineRunToCapacitySnapshotStrict,
  positionLeverageInputsFromEngine,
  type CapacityProjection,
} from "./capacity-bridge";
import { runFinancialCertificateEngine, type RunFinancialCertificateEngineParams } from "./pipeline";
import type { EngineRunResult, ReconciliationReport } from "./types";
import type { FinancialState } from "@/lib/financial-core/types";

export type SnapshotAuthorityStatus = "DRAFT" | "REVIEW_REQUIRED" | "APPROVED" | "SUPERSEDED" | "ABSENT";

export class NonAuthoritativeSnapshotError extends Error {
  readonly code = "NON_AUTHORITATIVE_SNAPSHOT";
  constructor(
    readonly status: SnapshotAuthorityStatus,
    message?: string,
  ) {
    super(
      message ??
        `Snapshot status ${status} is not authoritative. Only APPROVED snapshots may drive verified capacity or sequential simulation.`,
    );
  }
}

/** Refuse DRAFT / REVIEW_REQUIRED / SUPERSEDED / ABSENT as capacity truth. */
export function assertSnapshotAuthoritative(status: string | null | undefined): asserts status is "APPROVED" {
  if (status !== "APPROVED") {
    throw new NonAuthoritativeSnapshotError((status as SnapshotAuthorityStatus) || "ABSENT");
  }
}

export function isAuthoritativeSnapshotStatus(status: string | null | undefined): status is "APPROVED" {
  return status === "APPROVED";
}

export interface ApprovalBridgeProposeResult {
  run: EngineRunResult;
  proposal: SyntheticCertificate | null;
  propose: ProposeNs4Result;
  /** Always false — extraction/propose never grants authority. */
  authoritative: false;
}

/** Steps 1–3: extract, reconcile, propose DRAFT/REVIEW_REQUIRED only. */
export async function proposeFinancialSnapshotLifecycle(
  params: RunFinancialCertificateEngineParams,
): Promise<ApprovalBridgeProposeResult> {
  const run = runFinancialCertificateEngine(params);
  const proposal = buildCertificateProposalFromEngine({ companyId: params.companyId, run });
  const propose = await proposeNs4SnapshotFromEngine({ companyId: params.companyId, run });
  return { run, proposal, propose, authoritative: false };
}

export interface ApprovalBridgeApproveResult {
  approve: ProposeNs4Result;
  snapshotId: string;
  authoritative: boolean;
  reconciliation: ReconciliationReport;
}

/**
 * Step 4–5: attributable approve only. Requires reviewedBy.
 * Does not approve when reconciliation is BLOCKED.
 */
export async function approveProposedFinancialSnapshot(params: {
  companyId: string;
  snapshotId: string;
  reviewedBy: string;
  approvalRef: string;
  reconciliation: ReconciliationReport;
}): Promise<ApprovalBridgeApproveResult> {
  const approve = await approveNs4SnapshotAttributable(params);
  return {
    approve,
    snapshotId: params.snapshotId,
    authoritative: approve.ok === true && approve.status === "APPROVED",
    reconciliation: params.reconciliation,
  };
}

export interface VerifiedFinancialCapacityInput {
  companyId: string;
  snapshotId: string;
  status: "APPROVED";
  asOfDate: string | null;
  reportingPeriod: string | null;
  approvalRef: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** Capacity-engine 8-field projection when mappable; else null with missingInputs. */
  capacitySnapshot: FinancialSnapshotInput | null;
  missingInputs: string[];
  assumptions: string[];
  factKeys: string[];
  /** 4B snapshot for verified-execution / Agent 4 sequential overlays. */
  ns4Snapshot: FinancialSnapshot;
}

/**
 * Load only APPROVED NS-4 snapshots as verified capacity inputs.
 * DRAFT / REVIEW_REQUIRED rows in the same company are ignored (never authoritative).
 */
export async function loadVerifiedFinancialCapacityInput(
  companyId: string,
  opts?: { snapshotId?: string; evaluationDate?: string },
): Promise<
  | { status: "OK"; input: VerifiedFinancialCapacityInput }
  | { status: "NO_APPROVED_SNAPSHOT"; missingInputs: string[] }
  | { status: "NOT_AUTHORITATIVE"; snapshotId: string; currentStatus: string; missingInputs: string[] }
> {
  if (opts?.snapshotId) {
    const row = await prisma.contractInputSnapshot.findFirst({
      where: { companyId, snapshotId: opts.snapshotId },
      select: {
        snapshotId: true,
        status: true,
        asOf: true,
        reportingPeriod: true,
        approvalRef: true,
        reviewedBy: true,
        reviewedAt: true,
      },
    });
    if (!row) {
      return { status: "NO_APPROVED_SNAPSHOT", missingInputs: ["APPROVED_NorthStar_snapshot"] };
    }
    if (row.status !== "APPROVED") {
      return {
        status: "NOT_AUTHORITATIVE",
        snapshotId: row.snapshotId,
        currentStatus: row.status,
        missingInputs: ["APPROVED_status_required"],
      };
    }
  }

  const approved = await loadApprovedSnapshotsFromPrisma(prisma, companyId);
  if (approved.length === 0) {
    return { status: "NO_APPROVED_SNAPSHOT", missingInputs: ["APPROVED_NorthStar_snapshot"] };
  }

  let snap = approved[0]!;
  if (opts?.snapshotId) {
    const found = approved.find((s) => s.snapshotId === opts.snapshotId);
    if (!found) {
      return { status: "NO_APPROVED_SNAPSHOT", missingInputs: ["APPROVED_NorthStar_snapshot"] };
    }
    snap = found;
  } else if (opts?.evaluationDate) {
    const onOrBefore = approved
      .filter((s) => s.asOf && s.asOf <= opts.evaluationDate!)
      .sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""));
    if (onOrBefore[0]) snap = onOrBefore[0];
  }

  assertSnapshotAuthoritative(snap.status);

  const factKeys = snap.inputs.map((i) => i.identity.key);
  const { capacitySnapshot, missingInputs, assumptions } = mapNs4FactsToCapacitySnapshot(snap);

  return {
    status: "OK",
    input: {
      companyId,
      snapshotId: snap.snapshotId,
      status: "APPROVED",
      asOfDate: snap.asOf,
      reportingPeriod: snap.reportingPeriod,
      approvalRef: snap.review.approvalRef,
      reviewedBy: snap.review.reviewedBy,
      reviewedAt: snap.review.reviewedAt,
      capacitySnapshot,
      missingInputs,
      assumptions,
      factKeys,
      ns4Snapshot: snap,
    },
  };
}

function moneyMillionsFromInput(snap: FinancialSnapshot, keyMatch: RegExp): number | undefined {
  for (const inp of snap.inputs) {
    if (!keyMatch.test(inp.identity.key) && !keyMatch.test(inp.displayName ?? "")) continue;
    if (inp.value.type !== "MONEY") continue;
    const dollars = Number(inp.value.amount.num) / Number(inp.value.amount.den);
    if (!Number.isFinite(dollars)) continue;
    return dollars / 1_000_000;
  }
  return undefined;
}

function percentFromInput(snap: FinancialSnapshot, keyMatch: RegExp): number | undefined {
  for (const inp of snap.inputs) {
    if (!keyMatch.test(inp.identity.key)) continue;
    if (inp.value.type === "PERCENT") {
      const frac = Number(inp.value.fraction.num) / Number(inp.value.fraction.den);
      if (!Number.isFinite(frac)) continue;
      return frac * 100;
    }
  }
  return undefined;
}

function mapNs4FactsToCapacitySnapshot(snap: FinancialSnapshot): {
  capacitySnapshot: FinancialSnapshotInput | null;
  missingInputs: string[];
  assumptions: string[];
} {
  const missing: string[] = [];
  const assumptions: string[] = [];

  const ebitda = moneyMillionsFromInput(snap, /consolidated\s+ebitda|covenant\s+ebitda/i);
  const cash = moneyMillionsFromInput(snap, /unrestricted\s+cash|^cash$/i);
  const totalDebt = moneyMillionsFromInput(snap, /total(?:\s+net)?\s+debt|total\s+indebtedness/i);
  const securedDebt = moneyMillionsFromInput(snap, /secured\s+debt/i);
  const interestExpense = moneyMillionsFromInput(snap, /interest\s+expense/i);
  const cumulativeNetIncome = moneyMillionsFromInput(snap, /cumulative\s+net\s+income|consolidated\s+net\s+income/i);
  const equityProceeds = moneyMillionsFromInput(snap, /equity\s+proceeds/i);
  const rate = percentFromInput(snap, /assumed\s+new\s+debt\s+rate/i);

  // Never use GAAP EBITDA as capacity ebitda.
  if (ebitda === undefined) missing.push("covenant_ebitda");
  if (cash === undefined) missing.push("cash");
  if (totalDebt === undefined) missing.push("total_debt");
  if (securedDebt === undefined) missing.push("secured_debt");
  if (interestExpense === undefined) missing.push("interest_expense");
  if (cumulativeNetIncome === undefined) missing.push("cumulative_net_income");
  if (equityProceeds === undefined) missing.push("equity_proceeds");
  if (rate === undefined) missing.push("assumed_new_debt_rate_pct");

  if (missing.length > 0) {
    return { capacitySnapshot: null, missingInputs: missing, assumptions };
  }

  assumptions.push("Capacity ebitda bound to contractual Consolidated EBITDA from APPROVED NS-4 snapshot.");
  return {
    capacitySnapshot: {
      ebitda: ebitda!,
      cash: cash!,
      interestExpense: interestExpense!,
      cumulativeNetIncome: cumulativeNetIncome!,
      equityProceedsSinceIssue: equityProceeds!,
      assumedNewDebtRatePct: rate!,
      totalDebt: totalDebt!,
      securedDebt: securedDebt!,
    },
    missingInputs: [],
    assumptions,
  };
}

/**
 * Resolve 4B inputs from an APPROVED snapshot only (fail-closed otherwise).
 * Used by verified capacity / transaction simulation paths.
 */
export async function resolveApprovedSnapshotInputs(companyId: string, snapshotId: string) {
  const loaded = await loadVerifiedFinancialCapacityInput(companyId, { snapshotId });
  if (loaded.status !== "OK") {
    return { ok: false as const, reason: loaded.status, missingInputs: loaded.missingInputs };
  }
  const resolver = snapshotInputResolver({
    snapshots: [loaded.input.ns4Snapshot],
    companyId: loaded.input.companyId,
  });
  return { ok: true as const, resolver, input: loaded.input };
}

/** End-to-end: propose → attributable approve → verified capacity projection (from engine run). */
export async function runApprovalToCapacityBridge(params: {
  engineParams: RunFinancialCertificateEngineParams;
  reviewedBy: string;
  approvalRef: string;
}): Promise<{
  run: EngineRunResult;
  propose: ProposeNs4Result;
  approve: ProposeNs4Result | null;
  verified: Awaited<ReturnType<typeof loadVerifiedFinancialCapacityInput>> | null;
  capacityFromEngine: CapacityProjection;
  financialState: { status: "OK"; state: FinancialState } | { status: "NOT_COMPUTABLE"; reason: string };
  leverage: ReturnType<typeof positionLeverageInputsFromEngine>;
  /** True only after attributable APPROVED load succeeds. */
  authoritative: boolean;
}> {
  const proposed = await proposeFinancialSnapshotLifecycle(params.engineParams);
  const capacityFromEngine = projectEngineRunToCapacitySnapshotStrict(proposed.run);
  const financialState = buildFinancialStateFromEngineRun(proposed.run, {
    stateId: `fce-bridge-${params.engineParams.companyId}`,
    companyId: params.engineParams.companyId,
  });
  const leverage = positionLeverageInputsFromEngine(proposed.run);

  if (!proposed.propose.ok || !proposed.propose.snapshotId) {
    return {
      run: proposed.run,
      propose: proposed.propose,
      approve: null,
      verified: null,
      capacityFromEngine,
      financialState,
      leverage,
      authoritative: false,
    };
  }

  const approveResult = await approveProposedFinancialSnapshot({
    companyId: params.engineParams.companyId,
    snapshotId: proposed.propose.snapshotId,
    reviewedBy: params.reviewedBy,
    approvalRef: params.approvalRef,
    reconciliation: proposed.run.reconciliation,
  });

  const verified = approveResult.authoritative
    ? await loadVerifiedFinancialCapacityInput(params.engineParams.companyId, {
        snapshotId: proposed.propose.snapshotId,
      })
    : null;

  return {
    run: proposed.run,
    propose: proposed.propose,
    approve: approveResult.approve,
    verified,
    capacityFromEngine,
    financialState,
    leverage,
    authoritative: verified?.status === "OK",
  };
}
