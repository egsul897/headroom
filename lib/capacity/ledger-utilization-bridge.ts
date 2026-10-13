/**
 * Bridge historical utilization events ↔ Phase-4C LedgerUsageRecord.
 *
 * Preserves transaction identity and chronology. Never invents zero usage
 * from a missing ledger. Reclassifications and repayments keep explicit
 * supersession / reverse semantics.
 *
 * Types come from verified-execution — never import contract-model/runtime.
 */

import type { LedgerUsageRecord } from "@/lib/contract-model/verified-execution";
import type {
  HistoricalUtilizationEvent,
  UtilizationReconstructionResult,
} from "./utilization-evidence-reconstruction";
import type { UtilizationEvidenceRecord } from "./utilization-types";

export interface LedgerBridgeContext {
  companyId: string;
  instrumentKey: string;
  capacityRuleId: string;
}

type CapacityPath = LedgerUsageRecord["capacityPath"];
type UsageStatus = LedgerUsageRecord["status"];

function pathFor(event: HistoricalUtilizationEvent): CapacityPath {
  if (event.sharedCapacityId) {
    return { kind: "SHARED_CAPACITY", sharedCapacityId: event.sharedCapacityId };
  }
  if (event.applicableProvisionId) {
    return { kind: "RULE", ruleId: event.applicableProvisionId };
  }
  return {
    kind: "UNRESOLVED",
    candidateRuleIds: [],
    reason: "historical event lacks provision and shared-capacity attribution",
  };
}

function statusFor(event: HistoricalUtilizationEvent): UsageStatus {
  if (event.supersession === "SUPERSEDED_BY_SUCCESSOR") return "SUPERSEDED";
  if (event.kind === "REPAYMENT" && event.amount < 0) return "REVERSED";
  // Reclassification source half is reversed relative to the original path.
  if (event.supersession === "RECLASSIFIED_AWAY") return "REVERSED";
  return "RECORDED";
}

/**
 * Project reconstruction / events into Phase-4C ledger rows.
 * Repayments that restore capacity are modeled as REVERSED (or negative
 * reclassification halves), never as silent absence.
 */
export function historicalEventsToLedgerUsage(
  events: readonly HistoricalUtilizationEvent[],
  ctx: LedgerBridgeContext,
): LedgerUsageRecord[] {
  const successorByPrior = new Map<string, string>();
  for (const e of events) {
    if (e.supersedesEventId && e.supersession === "SUPERSEDES_PRIOR") {
      successorByPrior.set(e.supersedesEventId, e.eventId);
    }
  }

  return events.map((event) => {
    const amountAbs = Math.abs(event.amount);
    // Phase-4C forbids bare negative rows except conserved reclassification halves.
    // Repayments / restorations → REVERSED status on the repaid identity when
    // supersedesEventId points at the original issuance; otherwise record as
    // REVERSED self-row with zero-effect amount 0 is refused — use REVERSED on prior.
    let amount = amountAbs;
    let status = statusFor(event);
    if (event.kind === "REPAYMENT") {
      status = "REVERSED";
      // If repayment names a prior issuance, mark that prior superseded/reversed
      // via supersededByUsageId on the prior row (handled below for the prior).
      // The repayment row itself is REVERSED with the repaid amount for audit.
    }
    if (event.supersession === "RECLASSIFIED_AWAY") {
      // Negative source half of a conserved pair — Phase-4C recognizes this.
      amount = -amountAbs;
      status = "RECORDED";
    }
    if (event.supersession === "RECLASSIFIED_INTO") {
      amount = amountAbs;
      status = "RECORDED";
    }

    const supersededBy =
      successorByPrior.get(event.eventId) ??
      (event.supersession === "SUPERSEDED_BY_SUCCESSOR" ? event.supersedesEventId ?? null : null);

    return {
      usageId: event.eventId,
      companyId: ctx.companyId,
      instrumentKey: ctx.instrumentKey,
      effectiveAsOf: event.effectiveDate.slice(0, 10),
      amount: { amount: String(amount), currency: event.currency },
      capacityPath: pathFor(event),
      transactionRef: event.eventId,
      status: supersededBy && status !== "REVERSED" ? "SUPERSEDED" : status,
      supersededByUsageId: supersededBy,
      provenance: {
        source: event.sourceLabel,
        sourceVersion: null,
        approvalRef: event.approvalState === "APPROVED" ? `approval:${event.eventId}` : null,
        approvalState: event.approvalState,
      },
    };
  });
}

/** Project utilization evidence records into ledger rows for a single rule path. */
export function utilizationRecordsToLedgerUsage(
  records: readonly UtilizationEvidenceRecord[],
  ctx: LedgerBridgeContext,
): LedgerUsageRecord[] {
  return records.map((r) => {
    const path: CapacityPath = r.sharedCapacityId
      ? { kind: "SHARED_CAPACITY", sharedCapacityId: r.sharedCapacityId }
      : r.capacityRuleId
        ? { kind: "RULE", ruleId: r.capacityRuleId }
        : {
            kind: "UNRESOLVED",
            candidateRuleIds: [],
            reason: "utilization evidence lacks rule and shared-capacity attribution",
          };
    const status: UsageStatus =
      r.status === "SUPERSEDED"
        ? "SUPERSEDED"
        : r.status === "REVERSED"
          ? "REVERSED"
          : "RECORDED";
    return {
      usageId: r.usageId,
      companyId: ctx.companyId,
      instrumentKey: ctx.instrumentKey,
      effectiveAsOf: r.effectiveAsOf.slice(0, 10),
      amount: { amount: String(Math.abs(r.amount)), currency: r.currency },
      capacityPath: path,
      transactionRef: r.usageId,
      status,
      supersededByUsageId: null,
      provenance: {
        source: r.sourceLabel,
        sourceVersion: null,
        approvalRef: r.approvalState === "APPROVED" ? `approval:${r.usageId}` : null,
        approvalState: r.approvalState,
      },
    };
  });
}

export function reconstructionToLedgerUsage(
  reconstruction: UtilizationReconstructionResult,
  instrumentKey: string,
): LedgerUsageRecord[] {
  return historicalEventsToLedgerUsage(reconstruction.evidenceObserved, {
    companyId: reconstruction.companyId,
    instrumentKey,
    capacityRuleId: reconstruction.capacityRuleId,
  });
}
