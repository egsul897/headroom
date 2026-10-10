/**
 * Product bridge: AttemptCertifiedTransaction → optional 4D simulate.
 * Never fabricates VEP. Never bypasses NS-4 / cutoff / 4C / REQUIRE gates.
 */

import { attemptCertifiedTransaction, type CertifiedTransactionAttempt } from "@/lib/product/north-star-workflow/certified-transaction";
import { enumerateCertifiedPaths } from "@/lib/product/north-star-workflow/verified-path-enumeration";
import type { VerifiedExecutionPackage } from "@/lib/contract-model/verified-execution";
import type { HypotheticalTransaction, SelectedPath } from "@/lib/contract-model/verified-execution";

export type UnifiedTxnKind =
  | "SECURED_DEBT"
  | "UNSECURED_DEBT"
  | "RESTRICTED_PAYMENT"
  | "INVESTMENT"
  | "ACQUISITION"
  | "UNKNOWN";

export interface VerifiedSimulateRequest {
  companyId: string;
  evaluationDate: string;
  amountMillions: number;
  kind: UnifiedTxnKind;
  secured?: boolean | null;
  /** Caller-supplied only — product never invents. */
  verifiedPackage?: VerifiedExecutionPackage | null;
  /** When set, prefer this enumerated pathId; else first SUPPORTABLE path if exactly one. */
  pathId?: string | null;
  instrumentKey?: string | null;
  /** Optional attributed usage for RESTORE_CAPACITY (debt repayment). */
  restoreUsageId?: string | null;
}

export interface VerifiedSimulateResult {
  certified: CertifiedTransactionAttempt;
  pathEnumeration: ReturnType<typeof enumerateCertifiedPaths>;
  selectedPathId: string | null;
  selectedPath: SelectedPath | null;
  transaction: HypotheticalTransaction | null;
  /** Executable verified outcomes vs correct refusals */
  executable: boolean;
  refusalSummary: string[];
}

function moneyAmountStringFromMillions(millions: number): string {
  // Phase 4A MONEY amounts are USD dollars as decimal strings.
  return String(Math.round(millions * 1_000_000));
}

function moneyCapNode(ruleId: string): string {
  return `capacity:rule:${ruleId}`;
}

/**
 * Build CONSUME_CAPACITY hypothetical for a single selected rule path.
 * Debt repayment uses RESTORE_CAPACITY only when an attributed usageId is supplied.
 */
export function buildConsumeTransaction(args: {
  companyId: string;
  instrumentKey: string;
  evaluationDate: string;
  amountMillions: number;
  ruleId: string;
  label: string;
  /** When set, emit RESTORE_CAPACITY (debt repayment) instead of CONSUME. */
  restoreUsageId?: string | null;
}): { transaction: HypotheticalTransaction; selectedPath: SelectedPath } {
  const nodeId = moneyCapNode(args.ruleId);
  const amount = moneyAmountStringFromMillions(args.amountMillions);
  const effects = args.restoreUsageId
    ? [
        {
          effectId: "e-restore-1",
          kind: "RESTORE_CAPACITY" as const,
          usageId: args.restoreUsageId,
          reason: "Debt repayment / capacity restore (caller-supplied usage)",
        },
      ]
    : [
        {
          effectId: "e-consume-1",
          kind: "CONSUME_CAPACITY" as const,
          capacityNodeId: nodeId,
          amount: { type: "MONEY" as const, amount, currency: "USD" },
        },
      ];
  const transaction: HypotheticalTransaction = {
    transactionId: `ask-sim-${args.companyId}-${args.evaluationDate}-${args.ruleId}`.slice(0, 120),
    companyId: args.companyId,
    instrumentKey: args.instrumentKey,
    effectiveAsOf: args.evaluationDate,
    category: null,
    label: args.label,
    intendedAmount: { type: "MONEY", amount, currency: "USD" },
    effects,
    provenance: {
      source: "unified-position certified-simulate-bridge",
      sourceVersion: "1",
      approvalRef: null,
    },
  };
  const selectedPath: SelectedPath = {
    capacityNodeIds: [nodeId],
    ruleIds: [args.ruleId],
    sharedCapacityIds: [],
    reclassificationElectionIds: [],
  };
  return { transaction, selectedPath };
}

/** Compact product-facing summary for Simulate / Ask UI. */
export function summarizeVerifiedSimulate(result: VerifiedSimulateResult): {
  executable: boolean;
  blockers: string[];
  authorityNote: string;
  selectedPathId: string | null;
  capacityOutcome: string | null;
  simulationOutcome: string | null;
  pathCandidateCount: number;
} {
  return {
    executable: result.executable,
    blockers: result.refusalSummary,
    authorityNote: result.certified.authorityNote,
    selectedPathId: result.selectedPathId,
    capacityOutcome: result.certified.capacity?.outcome ?? null,
    simulationOutcome: result.certified.simulation?.outcome ?? null,
    pathCandidateCount: result.pathEnumeration.paths.filter(
      (p) => p.status === "CANDIDATE" && p.permission.hasCapacityExpression,
    ).length,
  };
}

/**
 * Attempt verified capacity (+ optional 4D simulate when a single supportable path exists).
 * Without VEP: returns precise blockers; never upgrades LEGACY to CERTIFIED.
 */
export async function attemptVerifiedSimulate(args: VerifiedSimulateRequest): Promise<VerifiedSimulateResult> {
  const pathEnumeration = enumerateCertifiedPaths({
    verifiedPackage: args.verifiedPackage ?? null,
    transactionKind: args.kind,
    secured: args.secured,
  });

  // Neutral enumeration: CANDIDATE + capacity expression = eligible for explicit selection.
  // Never auto-pick when multiple candidates or when status is UNSUPPORTED / incomplete.
  const candidates = pathEnumeration.paths.filter(
    (p) => p.status === "CANDIDATE" && p.permission.hasCapacityExpression,
  );
  const chosen =
    (args.pathId ? candidates.find((p) => p.pathId === args.pathId) : null) ??
    (candidates.length === 1 ? candidates[0]! : null);

  let transaction: HypotheticalTransaction | null = null;
  let selectedPath: SelectedPath | null = null;
  let selectedPathId: string | null = null;

  if (args.verifiedPackage && chosen && args.amountMillions >= 0) {
    const instrumentKey =
      args.instrumentKey ??
      args.verifiedPackage.instrumentKey ??
      "unknown-instrument";
    const built = buildConsumeTransaction({
      companyId: args.companyId,
      instrumentKey,
      evaluationDate: args.evaluationDate,
      amountMillions: args.amountMillions,
      ruleId: chosen.ruleId,
      label: `Unified simulate ${args.kind} $${args.amountMillions}M via ${chosen.label}`,
      restoreUsageId: args.restoreUsageId,
    });
    transaction = built.transaction;
    selectedPath = built.selectedPath;
    selectedPathId = chosen.pathId;
  }

  const certified = await attemptCertifiedTransaction({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
    verifiedPackage: args.verifiedPackage ?? null,
    transaction: transaction ?? undefined,
    selectedPath: selectedPath ?? undefined,
  });

  const refusalSummary = [
    ...certified.blockers,
    ...(certified.capacity?.outcome === "REFUSED"
      ? certified.capacity.refusals.map((r) => r.code)
      : []),
    ...(certified.simulation && certified.simulation.outcome === "REFUSED"
      ? ["SIMULATION_REFUSED"]
      : []),
    !args.verifiedPackage ? "NO_VERIFIED_EXECUTION_PACKAGE" : null,
    args.verifiedPackage && !chosen && candidates.length !== 1
      ? `PATH_SELECTION_REQUIRED:${candidates.length}_candidates`
      : null,
  ].filter((x): x is string => Boolean(x));

  const executable =
    certified.blockers.length === 0 &&
    certified.capacity?.outcome === "EXECUTED" &&
    (transaction == null || certified.simulation?.outcome === "EXECUTED");

  return {
    certified,
    pathEnumeration,
    selectedPathId,
    selectedPath,
    transaction,
    executable,
    refusalSummary: [...new Set(refusalSummary)],
  };
}
