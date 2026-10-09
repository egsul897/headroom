/**
 * Product attempt to run a contemplated transaction through Phase 4A–4D under
 * verified-execution REQUIRE + NS-4/NS-6/4C inputs.
 *
 * Fail-closed when no VerifiedExecutionPackage, cutoff unresolved, or snapshot missing.
 * Does not invent accounting treatment. Does not claim LEGACY multipath is certified 4E.
 */
import { prisma } from "@/lib/prisma";
import {
  loadApprovedSnapshotsFromPrisma,
  loadLedgerUsagesFromPrisma,
  snapshotInputResolver,
  resolveContractualSelector,
  selectSnapshotForResolvedSelector,
  type NamedContractualSelector,
  type FiscalCalendar,
  type DeliveryRecord,
} from "@/lib/contract-model/north-star-bridge";
import {
  evaluateVerifiedCapacity,
  simulateVerifiedTransaction,
  type VerifiedExecutionPackage,
  type VerifiedCapacityResult,
  type VerifiedTransactionResult,
  type HypotheticalTransaction,
  type SelectedPath,
} from "@/lib/contract-model/verified-execution";

export type CertifiedTransactionBlocker =
  | "MISSING_EVALUATION_DATE"
  | "CUTOFF_UNRESOLVED"
  | "NO_APPROVED_SNAPSHOT"
  | "NO_VERIFIED_EXECUTION_PACKAGE"
  | "VERIFIED_CAPACITY_REFUSED"
  | "SIMULATION_REFUSED";

export interface CertifiedTransactionAttempt {
  companyId: string;
  evaluationDate: string | null;
  cutoffState: string;
  reportingPeriodKey: string | null;
  approvedSnapshotId: string | null;
  ledgerUsageCount: number;
  /** Present only when a VerifiedExecutionPackage was supplied by the caller. */
  verifiedPackagePresent: boolean;
  capacity: VerifiedCapacityResult | null;
  simulation: VerifiedTransactionResult | null;
  blockers: CertifiedTransactionBlocker[];
  authorityNote: string;
}

function deliveriesFromSnapshots(
  companyId: string,
  approved: Awaited<ReturnType<typeof loadApprovedSnapshotsFromPrisma>>,
): DeliveryRecord[] {
  return approved.flatMap((s) => {
    if (!s.reportingPeriod || !s.asOf) return [];
    const deliveredAtIsoDate = (s.review.reviewedAt ?? s.asOf).slice(0, 10);
    return [
      {
        companyId,
        kind: "COMPLIANCE_CERTIFICATE" as const,
        reportingPeriodKey: s.reportingPeriod,
        asOfIsoDate: s.asOf,
        deliveredAtIsoDate,
        documentId: s.provenance.source ?? s.snapshotId,
        sourceVersionHash: s.provenance.sourceVersion ?? undefined,
      },
    ];
  });
}

/**
 * Attempt certified capacity (and optional path simulation) for a workspace.
 * Caller must supply a VerifiedExecutionPackage — product never fabricates one.
 */
export async function attemptCertifiedTransaction(args: {
  companyId: string;
  evaluationDate?: string;
  selector?: NamedContractualSelector;
  fiscalCalendar?: FiscalCalendar;
  verifiedPackage?: VerifiedExecutionPackage | null;
  transaction?: HypotheticalTransaction;
  selectedPath?: SelectedPath;
}): Promise<CertifiedTransactionAttempt> {
  const companyId = args.companyId;
  const blockers: CertifiedTransactionBlocker[] = [];
  const [approvedAll, ledger] = await Promise.all([
    loadApprovedSnapshotsFromPrisma(prisma, companyId),
    loadLedgerUsagesFromPrisma(prisma, companyId),
  ]);
  const activeLedger = ledger.filter((u) => u.status !== "SUPERSEDED");

  if (!args.evaluationDate) {
    blockers.push("MISSING_EVALUATION_DATE");
    return {
      companyId,
      evaluationDate: null,
      cutoffState: "NEEDS_INPUT",
      reportingPeriodKey: null,
      approvedSnapshotId: null,
      ledgerUsageCount: activeLedger.length,
      verifiedPackagePresent: Boolean(args.verifiedPackage),
      capacity: null,
      simulation: null,
      blockers,
      authorityNote:
        "CERTIFIED path blocked: evaluation date required — Headroom does not assume today or latest quarter.",
    };
  }

  if (approvedAll.length === 0) {
    blockers.push("NO_APPROVED_SNAPSHOT");
  }

  const fiscalCalendar = args.fiscalCalendar ?? {
    companyId,
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
  };
  const resolved = resolveContractualSelector({
    companyId,
    evaluationDate: args.evaluationDate,
    selector: args.selector ?? "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    fiscalCalendar,
    deliveries: deliveriesFromSnapshots(companyId, approvedAll),
  });

  let cutoffState = resolved.state;
  let reportingPeriodKey: string | null =
    resolved.state === "RESOLVED" ? resolved.reportingPeriodKey : null;
  let approvedSnapshotId: string | null = null;

  if (resolved.state === "RESOLVED") {
    const bound = selectSnapshotForResolvedSelector(resolved, approvedAll, companyId);
    cutoffState = bound.state;
    if (bound.state === "RESOLVED") {
      approvedSnapshotId = bound.snapshotId;
    } else {
      blockers.push("CUTOFF_UNRESOLVED");
    }
  } else {
    blockers.push("CUTOFF_UNRESOLVED");
  }

  const pkg = args.verifiedPackage ?? null;
  if (!pkg) {
    blockers.push("NO_VERIFIED_EXECUTION_PACKAGE");
  }

  if (blockers.length > 0 || !pkg || !approvedSnapshotId) {
    return {
      companyId,
      evaluationDate: args.evaluationDate,
      cutoffState,
      reportingPeriodKey,
      approvedSnapshotId,
      ledgerUsageCount: activeLedger.length,
      verifiedPackagePresent: Boolean(pkg),
      capacity: null,
      simulation: null,
      blockers,
      authorityNote:
        "CERTIFIED Phase 4A–4D path not executable. Numerical capacity remains withheld. LEGACY_ENGINE_MULTIPATH / NOT_CERTIFIED_4E must not be presented as certified.",
    };
  }

  const boundSnap = approvedAll.find((s) => s.snapshotId === approvedSnapshotId);
  const snapshots = boundSnap ? [boundSnap] : [];
  const inputs = snapshotInputResolver({
    snapshots,
    definitions: pkg.definitions,
    rules: pkg.rules,
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
  });

  const capacity = evaluateVerifiedCapacity({
    package: pkg,
    inputs,
    ledger: activeLedger,
    asOf: args.evaluationDate,
  });

  if (capacity.outcome !== "EXECUTED") {
    blockers.push("VERIFIED_CAPACITY_REFUSED");
  }

  let simulation: VerifiedTransactionResult | null = null;
  if (capacity.outcome === "EXECUTED" && args.transaction && args.selectedPath) {
    simulation = simulateVerifiedTransaction({
      package: pkg,
      inputs,
      ledger: activeLedger,
      asOf: args.evaluationDate,
      transaction: args.transaction,
      selectedPath: args.selectedPath,
    });
    if (simulation.outcome !== "EXECUTED") blockers.push("SIMULATION_REFUSED");
  }

  return {
    companyId,
    evaluationDate: args.evaluationDate,
    cutoffState,
    reportingPeriodKey,
    approvedSnapshotId,
    ledgerUsageCount: activeLedger.length,
    verifiedPackagePresent: true,
    capacity,
    simulation,
    blockers,
    authorityNote: capacity.outcome === "EXECUTED"
      ? "CERTIFIED capacity evaluated under verified-execution REQUIRE over cutoff-bound APPROVED snapshot + attributed ledger."
      : "CERTIFIED capacity refused under verified-execution REQUIRE — see blockers; do not fall back to invented numbers.",
  };
}
