/**
 * Fail-closed selection of an APPROVED NS-4 snapshot for FCE capacity inputs.
 *
 * Soft gates:
 * - never pick by array order / snapshotId sort alone
 * - never pick by latest asOf (LATEST_ON_OR_BEFORE) without NS-6 bind
 * - require explicit snapshotId OR a uniquely RESOLVED contractual cutoff bind
 */
import {
  deliveriesFromApprovedSnapshots,
  resolveContractualSelector,
  selectSnapshotForResolvedSelector,
  type FinancialSnapshot,
  type NamedContractualSelector,
} from "@/lib/contract-model/north-star-bridge";

export type SnapshotSelectionResult =
  | { status: "OK"; snapshotId: string }
  | { status: "NEEDS_INPUT"; missingInputs: string[]; reason: string }
  | { status: "AMBIGUOUS"; snapshotIds: string[]; reason: string }
  | { status: "NO_APPROVED_SNAPSHOT"; missingInputs: string[] };

/**
 * Choose which APPROVED snapshot may drive verified FCE capacity.
 * Callers that already know the identity pass `snapshotId`.
 */
export function selectAuthoritativeSnapshotForCapacity(args: {
  companyId: string;
  approved: readonly FinancialSnapshot[];
  snapshotId?: string;
  evaluationDate?: string;
  selector?: NamedContractualSelector;
}): SnapshotSelectionResult {
  const approved = args.approved.filter(
    (s) => s.companyId === args.companyId && s.status === "APPROVED",
  );
  if (approved.length === 0) {
    return { status: "NO_APPROVED_SNAPSHOT", missingInputs: ["APPROVED_NorthStar_snapshot"] };
  }

  if (args.snapshotId) {
    const found = approved.find((s) => s.snapshotId === args.snapshotId);
    if (!found) {
      return { status: "NO_APPROVED_SNAPSHOT", missingInputs: ["APPROVED_NorthStar_snapshot"] };
    }
    return { status: "OK", snapshotId: found.snapshotId };
  }

  if (!args.evaluationDate) {
    if (approved.length === 1) {
      // Single APPROVED row — identity is unambiguous without inventing a period.
      return { status: "OK", snapshotId: approved[0]!.snapshotId };
    }
    return {
      status: "NEEDS_INPUT",
      missingInputs: ["snapshotId", "evaluationDate"],
      reason:
        "Multiple APPROVED NS-4 snapshots exist; refusing latest-as-of / snapshotId-order pick. Pass snapshotId or evaluationDate for NS-6 bind.",
    };
  }

  const deliveries = deliveriesFromApprovedSnapshots(
    args.companyId,
    approved,
    "REQUIRE_PERSISTED_DELIVERY",
  );
  const resolved = resolveContractualSelector({
    companyId: args.companyId,
    evaluationDate: args.evaluationDate,
    selector: args.selector ?? "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    fiscalCalendar: {
      companyId: args.companyId,
      fiscalYearEndMonth: 12,
      fiscalYearEndDay: 31,
    },
    deliveries,
  });
  if (resolved.state !== "RESOLVED") {
    return {
      status: "NEEDS_INPUT",
      missingInputs:
        resolved.state === "NEEDS_INPUT" ? resolved.missing : ["contractual_cutoff"],
      reason:
        resolved.state === "AMBIGUOUS"
          ? resolved.reason
          : resolved.reason ?? "Contractual cutoff unresolved — refusing latest-as-of substitution",
    };
  }

  const bound = selectSnapshotForResolvedSelector(resolved, approved, args.companyId);
  if (bound.state === "RESOLVED") {
    return { status: "OK", snapshotId: bound.snapshotId };
  }
  if (bound.state === "AMBIGUOUS") {
    return {
      status: "AMBIGUOUS",
      snapshotIds: bound.snapshotIds,
      reason: bound.reason,
    };
  }
  return {
    status: "NEEDS_INPUT",
    missingInputs: bound.missing,
    reason: bound.reason,
  };
}
