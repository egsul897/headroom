/**
 * Product attempt to run a contemplated transaction through Phase 4A–4D under
 * verified-execution REQUIRE + NS-4/NS-6/4C inputs.
 *
 * Fail-closed when no VerifiedExecutionPackage, cutoff unresolved, or snapshot missing.
 * Does not invent accounting treatment. Does not claim LEGACY multipath is certified 4E.
 */
import { prisma } from "@/lib/prisma";
import {
  loadCutoffEligibleSnapshotsFromPrisma,
  loadLedgerUsagesFromPrisma,
  snapshotInputResolver,
  resolveContractualSelector,
  type NamedContractualSelector,
  type FiscalCalendar,
} from "@/lib/contract-model/north-star-bridge";
import { NS4_PRODUCT_CUTOFF_SELECTOR } from "./approved-financial-inputs";
import {
  bindSnapshotForDeliveredCutoff,
  deliveriesFromApprovedSnapshots,
} from "./certificate-deliveries";
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
  /**
   * Utilization completeness for remaining publication.
   * Default UNKNOWN (PAI-04). Pass VERIFIED_EMPTY only with an attested empty ledger.
   */
  utilizationCompleteness?: "UNKNOWN" | "VERIFIED_EMPTY";
}): Promise<CertifiedTransactionAttempt> {
  const companyId = args.companyId;
  const blockers: CertifiedTransactionBlocker[] = [];
  const [cutoffEligible, ledger] = await Promise.all([
    loadCutoffEligibleSnapshotsFromPrisma(prisma, companyId),
    loadLedgerUsagesFromPrisma(prisma, companyId),
  ]);
  const activeLedger = ledger.filter((u) => u.status !== "SUPERSEDED");
  const approvedAll = cutoffEligible.filter((s) => s.status === "APPROVED");

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

  if (approvedAll.length === 0 && cutoffEligible.length === 0) {
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
    // Align with Dashboard NS-4 band — delivered certificate, not calendar FY label alone.
    selector: args.selector ?? NS4_PRODUCT_CUTOFF_SELECTOR,
    fiscalCalendar,
    deliveries: deliveriesFromApprovedSnapshots(companyId, cutoffEligible),
  });

  let cutoffState = resolved.state;
  let reportingPeriodKey: string | null =
    resolved.state === "RESOLVED" ? resolved.reportingPeriodKey : null;
  let approvedSnapshotId: string | null = null;

  if (resolved.state === "RESOLVED") {
    const bound = bindSnapshotForDeliveredCutoff({
      companyId,
      evaluationDate: args.evaluationDate,
      resolved,
      snapshots: cutoffEligible,
    });
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

  const boundSnap = cutoffEligible.find((s) => s.snapshotId === approvedSnapshotId);
  // Cutoff already selected the reporting period. Neutralize period identity for
  // METRIC_REFERENCE resolution so certificate facts (VERBATIM period keys) bind
  // — same pattern as Dashboard IR leverage. Neon rows are not mutated.
  const snapshots = boundSnap
    ? [
        {
          ...boundSnap,
          inputs: boundSnap.inputs.map((inp) => ({
            ...inp,
            identity: { ...inp.identity, period: { kind: "NOT_PERIOD_SPECIFIC" as const } },
          })),
        },
      ]
    : [];
  const inputs = snapshotInputResolver({
    snapshots,
    definitions: pkg.definitions,
    rules: pkg.rules,
    companyId: pkg.companyId,
    instrumentKey: pkg.instrumentKey,
  });

  // Metric as-of must match the bound snapshot's measurement date (not the
  // transaction evaluation date). Cutoff already chose which delivery applies.
  const metricAsOf = boundSnap?.asOf ?? args.evaluationDate;

  const capacity = evaluateVerifiedCapacity({
    package: pkg,
    inputs,
    ledger: activeLedger,
    asOf: metricAsOf,
    utilizationCompleteness: args.utilizationCompleteness,
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
      asOf: metricAsOf,
      transaction: args.transaction,
      selectedPath: args.selectedPath,
      utilizationCompleteness: args.utilizationCompleteness,
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
