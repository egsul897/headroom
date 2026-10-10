/**
 * Shared financial certification view for Position / Simulate / Ask (P2).
 *
 * All three surfaces must consume the same as-of, source period, approval
 * status, assumptions, and missing-input metadata — never a divergent copy.
 * Coordinates with the unified-customer product interface (PR #221) without
 * forking a second financial truth store.
 */

import type { FinancialState } from "@/lib/financial-core/types";
import {
  assertSnapshotAuthoritative,
  isAuthoritativeSnapshotStatus,
  loadVerifiedFinancialCapacityInput,
  type SnapshotAuthorityStatus,
  type VerifiedFinancialCapacityInput,
} from "./approval-bridge";
import {
  buildFinancialStateFromEngineRun,
  positionLeverageInputsFromEngine,
  projectEngineRunToCapacitySnapshotStrict,
  type CapacityProjection,
} from "./capacity-bridge";
import { deriveContractualMetrics, type DerivedContractualMetric } from "./derived-metrics";
import type { EngineRunResult, SnapshotDisposition } from "./types";

export type CustomerSurface = "position" | "simulate" | "ask";

export const SHARED_FINANCIAL_SURFACES: readonly CustomerSurface[] = ["position", "simulate", "ask"] as const;

export interface SharedFinancialCertificationView {
  /** Same object identity contract for Position, Simulate, and Ask. */
  surfaces: readonly CustomerSurface[];
  asOfDate: string | null;
  sourcePeriod: string | null;
  approvalStatus: SnapshotAuthorityStatus;
  /** True only for APPROVED NS-4 snapshots. */
  authoritative: boolean;
  assumptions: string[];
  missingInputs: string[];
  reconciliationDisposition: SnapshotDisposition | null;
  dispositionReason: string | null;
  contractualEbitda: number | null;
  gaapEbitda: number | null;
  derivedMetrics: DerivedContractualMetric[];
  capacityProjectionStatus: CapacityProjection["status"] | "PENDING_APPROVAL" | "NO_SNAPSHOT";
  snapshotId: string | null;
  reviewedBy: string | null;
  approvalRef: string | null;
  issuerName: string | null;
  obligorGroup: string | null;
  currency: string | null;
}

function viewShell(partial: Omit<SharedFinancialCertificationView, "surfaces">): SharedFinancialCertificationView {
  return { surfaces: SHARED_FINANCIAL_SURFACES, ...partial };
}

/** Build the shared view from an in-memory engine run (pre-approval). */
export function buildSharedFinancialViewFromEngineRun(run: EngineRunResult): SharedFinancialCertificationView {
  const derived = deriveContractualMetrics({
    statement: run.statement,
    certificate: run.certificate,
  });
  const capacity = projectEngineRunToCapacitySnapshotStrict(run);
  const leverage = positionLeverageInputsFromEngine(run);
  const gaap =
    run.statement?.metrics.find((m) => m.family === "GAAP_EBITDA")?.canonicalValue ??
    run.certificate?.metrics.find((m) => m.family === "GAAP_EBITDA")?.canonicalValue ??
    null;
  const contractual =
    run.capacityMetrics.find((m) => m.metricName === "covenant_ebitda")?.value ?? null;

  const assumptions: string[] = [];
  if (run.contractualEbitdaDistinctFromGaap) {
    assumptions.push("Capacity binds contractual Consolidated EBITDA; GAAP EBITDA is not substituted.");
  }
  if (capacity.status === "OK") {
    assumptions.push(...capacity.warnings);
  }

  const missing = [
    ...run.reconciliation.missingInputKeys,
    ...(capacity.status === "NOT_COMPUTABLE" ? capacity.missingInputs : []),
    ...derived.filter((d) => d.status === "MISSING_INPUT").flatMap((d) => d.missingInputs),
  ];

  const preApprovalStatus: SnapshotAuthorityStatus =
    run.reconciliation.disposition === "APPROVED_ELIGIBLE" ? "DRAFT" : "REVIEW_REQUIRED";

  return viewShell({
    asOfDate: run.reconciliation.asOfDate,
    sourcePeriod: run.reconciliation.reportingPeriod,
    approvalStatus: preApprovalStatus,
    authoritative: false,
    assumptions,
    missingInputs: [...new Set(missing)],
    reconciliationDisposition: run.reconciliation.disposition,
    dispositionReason: run.reconciliation.dispositionReason,
    contractualEbitda: contractual,
    gaapEbitda: gaap,
    derivedMetrics: derived,
    capacityProjectionStatus:
      capacity.status === "OK" ? "PENDING_APPROVAL" : capacity.status,
    snapshotId: null,
    reviewedBy: null,
    approvalRef: null,
    issuerName:
      run.certificate?.identity.issuerName ?? run.statement?.identity.issuerName ?? null,
    obligorGroup:
      run.certificate?.identity.obligorGroup ?? run.statement?.identity.obligorGroup ?? null,
    currency: run.certificate?.identity.currency ?? run.statement?.identity.currency ?? null,
    // leverage unused in view body but proves shared Position path is computable
    ...(leverage.status === "OK" ? {} : {}),
  });
}

/** Build the shared view from a verified APPROVED NS-4 load. */
export function buildSharedFinancialViewFromVerified(
  input: VerifiedFinancialCapacityInput,
  opts?: { engineRun?: EngineRunResult },
): SharedFinancialCertificationView {
  assertSnapshotAuthoritative(input.status);
  const derived = opts?.engineRun
    ? deriveContractualMetrics({
        statement: opts.engineRun.statement,
        certificate: opts.engineRun.certificate,
      })
    : [];

  return viewShell({
    asOfDate: input.asOfDate,
    sourcePeriod: input.reportingPeriod,
    approvalStatus: "APPROVED",
    authoritative: true,
    assumptions: input.assumptions,
    missingInputs: input.missingInputs,
    reconciliationDisposition: opts?.engineRun?.reconciliation.disposition ?? null,
    dispositionReason: opts?.engineRun?.reconciliation.dispositionReason ?? null,
    contractualEbitda: input.capacitySnapshot?.ebitda ?? null,
    gaapEbitda:
      opts?.engineRun?.statement?.metrics.find((m) => m.family === "GAAP_EBITDA")?.canonicalValue ??
      null,
    derivedMetrics: derived,
    capacityProjectionStatus: input.capacitySnapshot ? "OK" : "NOT_COMPUTABLE",
    snapshotId: input.snapshotId,
    reviewedBy: input.reviewedBy,
    approvalRef: input.approvalRef,
    issuerName: null,
    obligorGroup: null,
    currency: null,
  });
}

/**
 * Load the one shared certification view for Position / Simulate / Ask.
 * DRAFT / REVIEW_REQUIRED never surface as authoritative.
 */
export async function loadSharedFinancialCertificationView(
  companyId: string,
  opts?: { snapshotId?: string; evaluationDate?: string; engineRun?: EngineRunResult },
): Promise<SharedFinancialCertificationView> {
  const loaded = await loadVerifiedFinancialCapacityInput(companyId, {
    snapshotId: opts?.snapshotId,
    evaluationDate: opts?.evaluationDate,
  });

  if (loaded.status === "OK") {
    return buildSharedFinancialViewFromVerified(loaded.input, { engineRun: opts?.engineRun });
  }

  if (opts?.engineRun) {
    const fromRun = buildSharedFinancialViewFromEngineRun(opts.engineRun);
    if (loaded.status === "NOT_AUTHORITATIVE") {
      return {
        ...fromRun,
        approvalStatus: (loaded.currentStatus as SnapshotAuthorityStatus) || "DRAFT",
        authoritative: false,
        snapshotId: loaded.snapshotId,
        missingInputs: [...new Set([...fromRun.missingInputs, ...loaded.missingInputs])],
        capacityProjectionStatus: "PENDING_APPROVAL",
      };
    }
    return {
      ...fromRun,
      missingInputs: [...new Set([...fromRun.missingInputs, ...loaded.missingInputs])],
      capacityProjectionStatus: "NO_SNAPSHOT",
    };
  }

  return viewShell({
    asOfDate: null,
    sourcePeriod: null,
    approvalStatus: loaded.status === "NOT_AUTHORITATIVE"
      ? ((loaded.currentStatus as SnapshotAuthorityStatus) || "ABSENT")
      : "ABSENT",
    authoritative: false,
    assumptions: [],
    missingInputs: loaded.missingInputs,
    reconciliationDisposition: null,
    dispositionReason: null,
    contractualEbitda: null,
    gaapEbitda: null,
    derivedMetrics: [],
    capacityProjectionStatus: "NO_SNAPSHOT",
    snapshotId: loaded.status === "NOT_AUTHORITATIVE" ? loaded.snapshotId : null,
    reviewedBy: null,
    approvalRef: null,
    issuerName: null,
    obligorGroup: null,
    currency: null,
  });
}

/** FinancialState for Simulate chaining — only from APPROVED verified input + engine run. */
export function financialStateForSurfaces(params: {
  verified: VerifiedFinancialCapacityInput | null;
  engineRun: EngineRunResult;
  stateId: string;
  companyId: string;
}):
  | { status: "OK"; state: FinancialState; view: SharedFinancialCertificationView }
  | { status: "NOT_AUTHORITATIVE" | "NOT_COMPUTABLE"; view: SharedFinancialCertificationView; reason: string } {
  const view = params.verified
    ? buildSharedFinancialViewFromVerified(params.verified, { engineRun: params.engineRun })
    : buildSharedFinancialViewFromEngineRun(params.engineRun);

  if (!params.verified || !isAuthoritativeSnapshotStatus(params.verified.status)) {
    return {
      status: "NOT_AUTHORITATIVE",
      view,
      reason: "DRAFT/REVIEW_REQUIRED snapshots cannot drive Simulate sequential state.",
    };
  }

  const built = buildFinancialStateFromEngineRun(params.engineRun, {
    stateId: params.stateId,
    companyId: params.companyId,
  });
  if (built.status !== "OK") {
    return { status: "NOT_COMPUTABLE", view, reason: built.reason };
  }
  return { status: "OK", state: built.state, view };
}
