/**
 * Simulate presentation — selected path, amount/currency, preconditions,
 * capacity consumed, financial changes, post-transaction capacity, missing
 * inputs, unsupported effects, trace/provenance. Never mutates the ledger.
 */

import type { CustomerStatusCode } from "./status-contract";
import { mapSimulateStatusToCustomerStatus, presentCustomerStatus } from "./status-contract";
import type { SeparatedCapacityClaims } from "./capacity-state";
import type { VerifiedSimulateResult } from "@/lib/product/unified-position/certified-simulate-bridge";
import type { TransactionEffectsResult } from "@/lib/product/unified-position/transaction-effects";

export interface SimulateViewModel {
  companyId: string;
  selectedTransactionPath: string | null;
  amountMillions: number | null;
  currency: string;
  preconditions: string[];
  capacityConsumed: string | null;
  financialChanges: string[];
  postTransactionCapacity: SeparatedCapacityClaims | null;
  /** Same capacity state as Position (pre-transaction). */
  preTransactionCapacity: SeparatedCapacityClaims | null;
  missingInputs: string[];
  unsupportedEffects: string[];
  traceAndProvenance: string[];
  postsToLedger: false;
  overallStatus: CustomerStatusCode;
  overallGuidance: string;
  executable: boolean;
}

export function buildSimulateView(args: {
  companyId: string;
  amountMillions?: number | null;
  currency?: string;
  verified?: VerifiedSimulateResult | null;
  effects?: TransactionEffectsResult | null;
  preCapacity: SeparatedCapacityClaims | null;
  postCapacity?: SeparatedCapacityClaims | null;
  readinessBlockers?: string[];
}): SimulateViewModel {
  const verified = args.verified ?? null;
  const effects = args.effects ?? null;

  const preconditions: string[] = [];
  const unsupportedEffects: string[] = [];
  const missingInputs = [...(args.readinessBlockers ?? [])];
  const traceAndProvenance: string[] = [];

  if (verified) {
    preconditions.push(...verified.refusalSummary);
    if (verified.selectedPathId) {
      traceAndProvenance.push(`Selected path: ${verified.selectedPathId}`);
    }
    if (verified.pathAutoSelected) {
      traceAndProvenance.push("Path auto-selected (single eligible candidate).");
    }
    for (const p of verified.pathEnumeration.paths ?? []) {
      traceAndProvenance.push(
        `Candidate ${p.pathId}: status=${p.status} rule=${p.ruleId}${p.note ? ` — ${p.note}` : ""}`,
      );
    }
    for (const reason of verified.pathEnumeration.incompleteReasons ?? []) {
      unsupportedEffects.push(reason);
    }
    if (!verified.executable) {
      unsupportedEffects.push(
        "Verified simulate path not affirmatively executable — result remains HYPOTHETICAL / refused.",
      );
    }
  } else {
    unsupportedEffects.push("No verified execution package supplied — certified simulate unavailable.");
  }

  const financialChanges: string[] = [];
  if (effects) {
    financialChanges.push(
      `Authority: ${effects.authority} — ${effects.authorityNote}`,
      `Pre totalDebt=${effects.pre.totalDebt} → post=${effects.post.totalDebt}`,
      `Pre securedDebt=${effects.pre.securedDebt} → post=${effects.post.securedDebt}`,
      `Pre cash=${effects.pre.cash} → post=${effects.post.cash}`,
    );
    for (const b of effects.basketDeltas.slice(0, 8)) {
      financialChanges.push(
        `${b.code} ${b.basketName}: pre=${b.preCapacity ?? "—"} post=${b.postCapacity ?? "—"}`,
      );
    }
    if (effects.postsToLedger !== false) {
      unsupportedEffects.push("Invariant violation: simulation must not post to ledger.");
    }
  }

  const capacityConsumed =
    args.amountMillions != null && Number.isFinite(args.amountMillions)
      ? `Hypothetical consume ${args.amountMillions} ${args.currency ?? "USD"} millions (not ledger-posted)`
      : null;

  const overallStatus: CustomerStatusCode = verified?.executable
    ? mapSimulateStatusToCustomerStatus("clear")
    : unsupportedEffects.length > 0 || missingInputs.length > 0
      ? "HYPOTHETICAL"
      : "NEEDS_INPUT";

  return {
    companyId: args.companyId,
    selectedTransactionPath: verified?.selectedPathId ?? null,
    amountMillions: args.amountMillions ?? null,
    currency: args.currency ?? "USD",
    preconditions: [...new Set(preconditions)],
    capacityConsumed,
    financialChanges,
    postTransactionCapacity: args.postCapacity ?? null,
    preTransactionCapacity: args.preCapacity,
    missingInputs: [...new Set(missingInputs)],
    unsupportedEffects: [...new Set(unsupportedEffects)],
    traceAndProvenance,
    postsToLedger: false,
    overallStatus,
    overallGuidance:
      presentCustomerStatus(overallStatus).customerGuidance +
      " Simulation never mutates the actual customer ledger.",
    executable: verified?.executable === true,
  };
}
