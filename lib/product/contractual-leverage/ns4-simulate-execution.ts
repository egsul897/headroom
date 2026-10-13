/**
 * Connect APPROVED NS-4 financial identity through leverage computation into
 * actual verified Simulate execution (attemptVerifiedSimulate).
 *
 * A generated Simulate href is navigation only — this module records the
 * certified simulate attempt as proof of transaction-path execution under
 * REQUIRE gates. Gross ratio room remains distinct from verified remaining.
 */

import type { FinancialSnapshot } from "@/lib/contract-model/contractual-metric-execution";
import {
  attemptVerifiedSimulate,
  type VerifiedSimulateResult,
  type UnifiedTxnKind,
} from "@/lib/product/unified-position/certified-simulate-bridge";
import { buildSimulateHandoffHref } from "@/lib/product/unified-position/simulate-handoff";
import {
  runCanonicalContractualFinancialPath,
  snapshotInvalidatesPriorResults,
  type CanonicalFinancialPathResult,
} from "./canonical-integration";
import type { LeverageCalculationRequest } from "./types";
import type { Ns4BindIdentity } from "./ns4-bind";

export interface FinancialIdentityBoundSimulate {
  financialPath: CanonicalFinancialPathResult;
  /** Navigation only — not proof of execution. */
  simulateHref: string | null;
  /**
   * Actual verified Simulate attempt under REQUIRE / NS-4 / cutoff gates.
   * Null when leverage path did not compute or simulate was not requested.
   */
  verifiedSimulate: VerifiedSimulateResult | null;
  /** Snapshot identity shared across Dashboard leverage, Position readiness, Simulate. */
  boundIdentity: {
    companyId: string;
    instrumentKey: string;
    snapshotIds: string[];
    asOf: string | null;
    approvalRefs: string[];
  };
  /** Explicit product honesty. */
  grossVersusVerified: {
    debtHeadroomIsVerifiedCapacity: false;
    simulateHrefIsNotExecutionProof: true;
    note: string;
  };
}

export interface PriorSimulateArtifact {
  contributingSnapshotIds: string[];
  /** Opaque handle / path id / result digest from a prior verified simulate. */
  simulateArtifactId: string;
  evaluationDate: string;
  executable: boolean;
}

export interface SupersessionInvalidationResult {
  leverageInvalidated: boolean;
  simulateInvalidated: boolean;
  supersededIds: string[];
  /** Prior simulate artifacts that must not be reused after supersession. */
  invalidatedSimulateArtifactIds: string[];
  recomputed: FinancialIdentityBoundSimulate | null;
}

/**
 * Bind APPROVED components → contractual leverage → verified Simulate attempt
 * under the same company / as-of / snapshot identity.
 */
export async function executeCanonicalPathWithVerifiedSimulate(args: {
  request: LeverageCalculationRequest;
  snapshots: readonly FinancialSnapshot[];
  identity: Ns4BindIdentity;
  amountUnit?: "USD" | "USD_MILLIONS";
  debtCashKeys?: { totalDebt?: string; securedDebt?: string; cash?: string };
  simulate: {
    kind: UnifiedTxnKind;
    amountMillions: number;
    secured?: boolean | null;
    pathId?: string | null;
    /** When false, skip verified simulate and only compute leverage + href. */
    runVerifiedSimulate?: boolean;
  };
}): Promise<FinancialIdentityBoundSimulate> {
  const financialPath = runCanonicalContractualFinancialPath({
    request: args.request,
    snapshots: args.snapshots,
    identity: args.identity,
    amountUnit: args.amountUnit,
    debtCashKeys: args.debtCashKeys,
    simulateDraft: {
      action: args.simulate.kind === "RESTRICTED_PAYMENT" ? "rp" : "debt",
      amountMillions: args.simulate.amountMillions,
      secured: args.simulate.secured ?? undefined,
    },
  });

  const asOf =
    financialPath.financialIdentity.asOf ??
    args.identity.asOfIsoDate ??
    args.snapshots.find((s) => s.snapshotId === args.identity.snapshotId)?.asOf ??
    args.snapshots.find((s) => s.status === "APPROVED" && s.asOf)?.asOf ??
    null;

  const simulateHref =
    financialPath.leverage.status === "COMPUTED"
      ? buildSimulateHandoffHref(args.identity.companyId, {
          action: args.simulate.kind === "RESTRICTED_PAYMENT" ? "rp" : "debt",
          amountMillions: args.simulate.amountMillions,
          secured: args.simulate.secured,
          evaluationDate: asOf,
          source: "ask",
        })
      : null;

  let verifiedSimulate: VerifiedSimulateResult | null = null;
  if (
    args.simulate.runVerifiedSimulate !== false &&
    financialPath.leverage.status === "COMPUTED" &&
    asOf
  ) {
    verifiedSimulate = await attemptVerifiedSimulate({
      companyId: args.identity.companyId,
      evaluationDate: asOf,
      amountMillions: args.simulate.amountMillions,
      kind: args.simulate.kind,
      secured: args.simulate.secured,
      pathId: args.simulate.pathId,
      instrumentKey: args.identity.instrumentKey,
    });
  }

  const boundIdentity = {
    ...financialPath.financialIdentity,
    asOf,
  };

  return {
    financialPath,
    simulateHref,
    verifiedSimulate,
    boundIdentity,
    grossVersusVerified: {
      debtHeadroomIsVerifiedCapacity: false,
      simulateHrefIsNotExecutionProof: true,
      note:
        "Mathematical ratio room is never verified remaining capacity. Simulate href is navigation; verifiedSimulate is the REQUIRE-gated execution attempt.",
    },
  };
}

/**
 * When APPROVED snapshots supersede prior contributors, invalidate both leverage
 * and prior verified-simulate artifacts; optionally recompute on the new tip.
 */
export async function invalidateAndRecomputeAfterSupersession(args: {
  prior: PriorSimulateArtifact;
  snapshots: readonly FinancialSnapshot[];
  recompute?: Parameters<typeof executeCanonicalPathWithVerifiedSimulate>[0] | null;
}): Promise<SupersessionInvalidationResult> {
  const inv = snapshotInvalidatesPriorResults({
    priorContributingSnapshotIds: args.prior.contributingSnapshotIds,
    snapshots: args.snapshots,
  });
  const simulateInvalidated = inv.invalidated;
  const recomputed = args.recompute
    ? await executeCanonicalPathWithVerifiedSimulate(args.recompute)
    : null;
  return {
    leverageInvalidated: inv.invalidated,
    simulateInvalidated,
    supersededIds: inv.supersededIds,
    invalidatedSimulateArtifactIds: simulateInvalidated ? [args.prior.simulateArtifactId] : [],
    recomputed,
  };
}
