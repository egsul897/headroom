/**
 * Product-facing North Star transaction readiness.
 *
 * Surfaces which of the three truths are present for a company workspace:
 * 1) executable rulebook (counsel Permissions — still LEGACY until certified IR wired)
 * 2) APPROVED Phase 4B snapshots (NS-4 store)
 * 3) attributed contract ledger usage (4C store)
 * plus contractual cutoff resolution evidence.
 *
 * Never invents capacity; never claims LEGACY figures are certified 4E.
 */
import { prisma } from "@/lib/prisma";
import {
  loadApprovedSnapshotsFromPrisma,
  loadCutoffEligibleSnapshotsFromPrisma,
  loadLedgerUsagesFromPrisma,
  resolveAuthoritativeCutoff,
  type DeliveryRecord,
  type FiscalCalendar,
  type NamedContractualSelector,
} from "@/lib/contract-model/north-star-bridge";
import { loadCapacityReadiness, type CapacityReadiness } from "@/lib/product/customer-intelligence/capacity-readiness";
import { labelCutoffSnapshot } from "./cutoff-snapshot-label";

export type WorkflowStepStatus = "READY" | "MISSING" | "PARTIAL" | "LEGACY_ONLY";

export interface TransactionWorkflowReadiness {
  companyId: string;
  steps: {
    documentsUploaded: WorkflowStepStatus;
    counselExecutableRules: WorkflowStepStatus;
    approvedFinancialSnapshot: WorkflowStepStatus;
    historicalLedger: WorkflowStepStatus;
    cutoffResolvable: WorkflowStepStatus;
  };
  legacyCapacity: CapacityReadiness;
  northStar: {
    approvedSnapshotCount: number;
    approvedSnapshotIds: string[];
    contractLedgerUsageCount: number;
    activeLedgerUsageCount: number;
  };
  cutoff?: {
    state: string;
    reportingPeriodKey?: string | null;
    asOf?: string | null;
    snapshotId?: string | null;
    reason?: string;
    missing?: string[];
  };
  blockers: string[];
  nextActions: Array<{ label: string; href: string }>;
  /** True when Ask can enumerate legacy multipath AND has an APPROVED cutoff-bound snapshot. */
  canRunTransactionWorkflow: boolean;
  authorityNote: string;
}

export async function loadTransactionWorkflowReadiness(
  companyId: string,
  opts?: {
    evaluationDate?: string;
    selector?: NamedContractualSelector;
    fiscalCalendar?: FiscalCalendar;
    deliveries?: DeliveryRecord[];
  },
): Promise<TransactionWorkflowReadiness> {
  const legacyCapacity = await loadCapacityReadiness(companyId);
  const [approved, cutoffEligible, ledgerUsages] = await Promise.all([
    loadApprovedSnapshotsFromPrisma(prisma, companyId),
    loadCutoffEligibleSnapshotsFromPrisma(prisma, companyId),
    loadLedgerUsagesFromPrisma(prisma, companyId),
  ]);
  const activeLedger = ledgerUsages.filter((u) => u.status !== "SUPERSEDED");

  const fiscalCalendar = opts?.fiscalCalendar ?? {
    companyId,
    fiscalYearEndMonth: 12,
    fiscalYearEndDay: 31,
  };
  let cutoff: TransactionWorkflowReadiness["cutoff"];
  // Do not default evaluation date to "today" — that reintroduces latest-quarter behavior.
  if (!opts?.evaluationDate) {
    cutoff = {
      state: "NEEDS_INPUT",
      reason: "transaction/evaluation date required before cutoff resolution",
      missing: ["evaluationDate"],
    };
  } else if (opts?.selector || approved.length > 0 || cutoffEligible.length > 0) {
    // P0: persisted-delivery-only — approval never establishes delivery.
    // Cutoff-eligible includes SUPERSEDED for historical delivery binding.
    // Default selector matches NS4_PRODUCT_CUTOFF_SELECTOR (Dashboard/Position/Simulate/certified).
    cutoff = resolveAuthoritativeCutoff({
      companyId,
      evaluationDate: opts.evaluationDate,
      approved: cutoffEligible,
      selector: opts?.selector ?? "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
      fiscalCalendar,
      deliveries: opts?.deliveries,
    });
  }

  const blockers: string[] = [...legacyCapacity.blockers];
  if (approved.length === 0) {
    blockers.push("No APPROVED Phase 4B financial snapshot in the North-Star store — approve a compliance certificate.");
  }
  if (cutoff && cutoff.state !== "RESOLVED") {
    blockers.push(`Contractual cutoff not resolved (${cutoff.state}): ${cutoff.reason ?? "missing evidence"}`);
  }
  // Rule 84: the cutoff may bind a SUPERSEDED snapshot while a
  // DIFFERENT approved snapshot exists. "Has an APPROVED
  // cutoff-bound snapshot" means the BOUND snapshot is APPROVED,
  // not merely that some approved snapshot exists somewhere.
  const cutoffLabel = labelCutoffSnapshot(
    cutoff?.snapshotId ?? null,
    approved.map((s) => s.snapshotId),
  );
  if (cutoff?.state === "RESOLVED" && cutoffLabel.approvedSnapshotId === null) {
    blockers.push(
      `Contractual cutoff bound snapshot ${cutoff.snapshotId ?? "—"} (${cutoffLabel.cutoffSnapshotStatus ?? "UNKNOWN"}), not an APPROVED snapshot — approve a current compliance certificate for this cutoff.`,
    );
  }
  if (activeLedger.length === 0) {
    blockers.push("No attributed contract-ledger usage yet — import certificate basket schedules or enter historical usage (optional for first Ask, required for accurate remaining capacity).");
  }

  const steps: TransactionWorkflowReadiness["steps"] = {
    documentsUploaded: legacyCapacity.analyzedDocumentCount > 0 ? "READY" : "MISSING",
    counselExecutableRules: legacyCapacity.permissionCount > 0 ? "LEGACY_ONLY" : "MISSING",
    approvedFinancialSnapshot: approved.length > 0 ? "READY" : "MISSING",
    historicalLedger: activeLedger.length > 0 ? "READY" : "PARTIAL",
    cutoffResolvable: cutoff?.state === "RESOLVED" ? "READY" : approved.length > 0 ? "PARTIAL" : "MISSING",
  };

  const canRunTransactionWorkflow =
    legacyCapacity.permissionCount > 0 &&
    approved.length > 0 &&
    cutoff?.state === "RESOLVED" &&
    cutoffLabel.approvedSnapshotId !== null;

  const nextActions: TransactionWorkflowReadiness["nextActions"] = [];
  if (steps.documentsUploaded === "MISSING") {
    nextActions.push({ label: "Upload financing package", href: `/${companyId}/onboarding/documents` });
  }
  if (steps.counselExecutableRules === "MISSING") {
    nextActions.push({ label: "Review & accept AI interpretations", href: `/${companyId}/rulebook` });
  }
  if (steps.approvedFinancialSnapshot === "MISSING") {
    nextActions.push({ label: "Approve compliance certificate", href: `/${companyId}/certificates` });
  }
  if (steps.historicalLedger === "PARTIAL") {
    nextActions.push({ label: "Enter historical basket usage", href: `/${companyId}/certificates` });
  }
  nextActions.push({ label: "Ask a transaction question", href: `/${companyId}/ask` });
  nextActions.push({ label: "Review multipath analysis", href: `/${companyId}/intelligence` });

  return {
    companyId,
    steps,
    legacyCapacity,
    northStar: {
      approvedSnapshotCount: approved.length,
      approvedSnapshotIds: approved.map((s) => s.snapshotId),
      contractLedgerUsageCount: ledgerUsages.length,
      activeLedgerUsageCount: activeLedger.length,
    },
    cutoff,
    blockers,
    nextActions,
    canRunTransactionWorkflow,
    authorityNote:
      "Numerical multipath capacity remains LEGACY_ENGINE / NOT_CERTIFIED_4E until counsel Permissions are replaced by certified Phase 3 IR and capacity is evaluated over APPROVED snapshots + contract ledger via Phase 4A–4E. Cutoff and certificate approval use the North-Star stores.",
  };
}
