/**
 * Authoritative product-facing capacity view over North-Star stores.
 *
 * Never computes certified remaining capacity from legacy FinancialState /
 * FinancialSnapshot. Without a VerifiedExecutionPackage, returns REVIEW_REQUIRED
 * / UNSUPPORTED with truthful blockers — legacy figures stay explicitly labeled.
 */
import { prisma } from "@/lib/prisma";
import {
  loadApprovedSnapshotsFromPrisma,
  loadLedgerUsagesFromPrisma,
  snapshotInputResolver,
  type NamedContractualSelector,
} from "@/lib/contract-model/north-star-bridge";
import type { VerifiedExecutionPackage } from "@/lib/contract-model/verified-execution";
import { attemptCertifiedTransaction } from "./certified-transaction";
import { loadTransactionWorkflowReadiness } from "./transaction-readiness";
import { loadCapacityReadiness, type CapacityAuthority } from "@/lib/product/customer-intelligence/capacity-readiness";

export type AuthoritativeCapacityStatus =
  | "CERTIFIED_EXECUTED"
  | "REVIEW_REQUIRED"
  | "UNSUPPORTED"
  | "NEEDS_INPUT";

export interface AuthoritativeCapacityResult {
  companyId: string;
  evaluationDate: string | null;
  status: AuthoritativeCapacityStatus;
  /** Never "CERTIFIED" unless verified-execution EXECUTED. */
  authority: CapacityAuthority | "CERTIFIED_4A_4D";
  cutoff: {
    state: string;
    reportingPeriodKey: string | null;
    asOf: string | null;
    approvedSnapshotId: string | null;
  };
  approvedSnapshotCount: number;
  activeLedgerUsageCount: number;
  ledgerUsages: Array<{
    usageId: string;
    ruleId: string | null;
    amount: string;
    currency: string;
    effectiveAsOf: string;
    status: string;
    approvalRef: string | null;
  }>;
  /** Fact keys from the cutoff-bound APPROVED snapshot (evidence, not capacity). */
  snapshotFactKeys: string[];
  certified: {
    packagePresent: boolean;
    capacityOutcome: string | null;
    blockers: string[];
    authorityNote: string;
  };
  legacy: {
    capacityAuthority: CapacityAuthority;
    canEvaluateExecutableCapacity: boolean;
    note: string;
  };
  missingInputs: string[];
  evidence: string[];
}

/**
 * Single product entry for capacity surfaces that must distinguish
 * CERTIFIED vs LEGACY vs missing inputs.
 */
export async function loadAuthoritativeCapacity(args: {
  companyId: string;
  evaluationDate?: string;
  selector?: NamedContractualSelector;
  verifiedPackage?: VerifiedExecutionPackage | null;
}): Promise<AuthoritativeCapacityResult> {
  const companyId = args.companyId;
  const [readiness, legacy, approved, ledger] = await Promise.all([
    loadTransactionWorkflowReadiness(companyId, {
      evaluationDate: args.evaluationDate,
      selector: args.selector ?? "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    }),
    loadCapacityReadiness(companyId),
    loadApprovedSnapshotsFromPrisma(prisma, companyId),
    loadLedgerUsagesFromPrisma(prisma, companyId),
  ]);

  const active = ledger.filter((u) => u.status !== "SUPERSEDED");
  const boundId = readiness.cutoff?.snapshotId ?? null;
  const bound = boundId ? approved.find((s) => s.snapshotId === boundId) : null;

  const certified = await attemptCertifiedTransaction({
    companyId,
    evaluationDate: args.evaluationDate,
    selector: args.selector ?? "MOST_RECENTLY_ENDED_FISCAL_QUARTER",
    verifiedPackage: args.verifiedPackage ?? null,
  });

  const missingInputs: string[] = [];
  if (!args.evaluationDate) missingInputs.push("evaluationDate");
  if (approved.length === 0) missingInputs.push("APPROVED_NorthStar_snapshot");
  if (readiness.cutoff?.state !== "RESOLVED") missingInputs.push("contractual_cutoff");
  if (!args.verifiedPackage) missingInputs.push("VerifiedExecutionPackage");

  let status: AuthoritativeCapacityStatus = "NEEDS_INPUT";
  let authority: AuthoritativeCapacityResult["authority"] = legacy.capacityAuthority;
  if (certified.capacity?.outcome === "EXECUTED") {
    status = "CERTIFIED_EXECUTED";
    authority = "CERTIFIED_4A_4D";
  } else if (missingInputs.length > 0) {
    status = "NEEDS_INPUT";
    authority = "NOT_CERTIFIED_4E";
  } else if (certified.blockers.includes("VERIFIED_CAPACITY_REFUSED")) {
    status = "REVIEW_REQUIRED";
    authority = "NOT_CERTIFIED_4E";
  } else {
    status = "UNSUPPORTED";
    authority = "NOT_CERTIFIED_4E";
  }

  // Prove 4B resolver binds without inventing capacity numbers when package absent.
  const evidence: string[] = [];
  if (bound) {
    const resolver = snapshotInputResolver({
      snapshots: [bound],
      companyId,
      instrumentKey: null,
    });
    evidence.push(
      `Cutoff-bound snapshot ${bound.snapshotId} (${bound.reportingPeriod ?? "no-period"} asOf ${bound.asOf ?? "—"}) loaded for 4B resolver (${bound.inputs.length} facts).`,
    );
    void resolver;
  }
  if (active.length) {
    evidence.push(
      `${active.length} active attributed 4C ledger usage(s) — known attributed usage only; remaining requires certified rule evaluation AND a validated UtilizationCompletenessCertificate (approved records alone do not prove completeness).`,
    );
  } else {
    evidence.push(
      "No active attributed ledger usages — empty ledger is UNKNOWN utilization, not verified zero, without a validated VERIFIED_EMPTY completeness certificate.",
    );
  }

  return {
    companyId,
    evaluationDate: args.evaluationDate ?? null,
    status,
    authority,
    cutoff: {
      state: readiness.cutoff?.state ?? "NEEDS_INPUT",
      reportingPeriodKey: readiness.cutoff?.reportingPeriodKey ?? null,
      asOf: readiness.cutoff?.asOf ?? null,
      approvedSnapshotId: boundId,
    },
    approvedSnapshotCount: approved.length,
    activeLedgerUsageCount: active.length,
    ledgerUsages: active.map((u) => ({
      usageId: u.usageId,
      ruleId: u.capacityPath.kind === "RULE" ? u.capacityPath.ruleId : null,
      amount: u.amount.amount,
      currency: u.amount.currency,
      effectiveAsOf: u.effectiveAsOf,
      status: u.status,
      approvalRef: u.provenance.approvalRef,
    })),
    snapshotFactKeys: bound?.inputs.map((i) => i.identity.key) ?? [],
    certified: {
      packagePresent: certified.verifiedPackagePresent,
      capacityOutcome: certified.capacity?.outcome ?? null,
      blockers: certified.blockers,
      authorityNote: certified.authorityNote,
    },
    legacy: {
      capacityAuthority: legacy.capacityAuthority,
      canEvaluateExecutableCapacity: legacy.canEvaluateExecutableCapacity,
      note: "LEGACY_ENGINE / NOT_CERTIFIED_4E figures must not be presented as certified Phase 4A–4E capacity.",
    },
    missingInputs,
    evidence,
  };
}
