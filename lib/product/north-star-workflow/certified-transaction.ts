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
  resolveAuthoritativeCutoff,
  type NamedContractualSelector,
  type FiscalCalendar,
} from "@/lib/contract-model/north-star-bridge";
import { NS4_PRODUCT_CUTOFF_SELECTOR } from "./approved-financial-inputs";
import {
  labelCutoffSnapshot,
  type CutoffSnapshotStatus,
} from "./cutoff-snapshot-label";
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
  | "SIMULATION_REFUSED"
  | "VEP_COMPANY_MISMATCH";

export interface CertifiedTransactionAttempt {
  companyId: string;
  evaluationDate: string | null;
  cutoffState: string;
  reportingPeriodKey: string | null;
  /** Cutoff-bound snapshot id, only when actually APPROVED (see rule 81). */
  approvedSnapshotId: string | null;
  /** Raw cutoff-bound snapshot id — APPROVED or SUPERSEDED. */
  cutoffSnapshotId: string | null;
  cutoffSnapshotStatus: CutoffSnapshotStatus;
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
      cutoffSnapshotId: null,
      cutoffSnapshotStatus: null,
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
  // P0: persisted-delivery-only — approval never establishes delivery.
  // Pass cutoff-eligible (APPROVED + SUPERSEDED) so historical deliveries bind.
  const cutoff = resolveAuthoritativeCutoff({
    companyId,
    evaluationDate: args.evaluationDate,
    approved: cutoffEligible,
    // Align with Dashboard NS-4 band — delivered certificate, not calendar FY label alone.
    selector: args.selector ?? NS4_PRODUCT_CUTOFF_SELECTOR,
    fiscalCalendar,
  });

  const cutoffState = cutoff.state;
  const reportingPeriodKey = cutoff.reportingPeriodKey;
  // Rule 81: the cutoff may bind a SUPERSEDED snapshot (eligible
  // pool is APPROVED ∪ SUPERSEDED). approvedSnapshotId must be
  // the bound id ONLY when actually APPROVED; the raw bound id
  // still flows into evaluation, where the resolver's
  // APPROVED-only policy refuses superseded facts (fail closed).
  const cutoffLabel = labelCutoffSnapshot(
    cutoff.snapshotId,
    approvedAll.map((s) => s.snapshotId),
  );
  const approvedSnapshotId = cutoffLabel.approvedSnapshotId;
  const boundSnapshotId = cutoffLabel.cutoffSnapshotId;
  if (cutoff.state !== "RESOLVED" || !boundSnapshotId) {
    blockers.push("CUTOFF_UNRESOLVED");
  }

  const pkg = args.verifiedPackage ?? null;
  if (!pkg) {
    blockers.push("NO_VERIFIED_EXECUTION_PACKAGE");
  }
  // Rule 61: the VEP's rules must belong to the company being
  // evaluated. A mismatched VEP would govern this company's
  // transaction with another company's rulebook while this
  // company's financials/ledger feed the inputs.
  if (pkg && pkg.companyId !== companyId) {
    blockers.push("VEP_COMPANY_MISMATCH");
  }

  if (blockers.length > 0 || !pkg || !boundSnapshotId) {
    return {
      companyId,
      evaluationDate: args.evaluationDate,
      cutoffState,
      reportingPeriodKey,
      approvedSnapshotId,
      cutoffSnapshotId: boundSnapshotId,
      cutoffSnapshotStatus: cutoffLabel.cutoffSnapshotStatus,
      ledgerUsageCount: activeLedger.length,
      verifiedPackagePresent: Boolean(pkg),
      capacity: null,
      simulation: null,
      blockers,
      authorityNote:
        "CERTIFIED Phase 4A–4D path not executable. Numerical capacity remains withheld. LEGACY_ENGINE_MULTIPATH / NOT_CERTIFIED_4E must not be presented as certified.",
    };
  }

  const boundSnap = cutoffEligible.find((s) => s.snapshotId === boundSnapshotId);
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
    cutoffSnapshotId: boundSnapshotId,
    cutoffSnapshotStatus: cutoffLabel.cutoffSnapshotStatus,
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
