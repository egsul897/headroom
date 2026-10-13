/**
 * Dashboard North-Star financial band — reads APPROVED NS-4 snapshots from Neon.
 *
 * Fail-closed: never invents EBITDA/debt/cash; never picks "latest quarter"
 * without an explicit evaluation date + resolved contractual cutoff.
 * Legacy engine figures on the Dashboard remain separately labeled.
 *
 * IMPLEMENTED ≠ CERTIFIED. APPROVED snapshot ≠ certified capacity.
 */

import { prisma } from "@/lib/prisma";
import {
  loadApprovedSnapshotsFromPrisma,
  toCanonicalString,
  type FinancialSnapshot,
  type NamedContractualSelector,
  type RuntimeValue,
} from "@/lib/contract-model/north-star-bridge";
import { loadTransactionWorkflowReadiness } from "@/lib/product/north-star-workflow/transaction-readiness";
import {
  computeNs4ContractualNetLeverage,
  type Ns4LeverageIrTrace,
} from "@/lib/dashboard/ns4-leverage-ir";

export type Ns4DashboardFinancialStatus =
  | "NEEDS_INPUT"
  | "APPROVED_INVENTORY"
  | "APPROVED_BOUND";

export interface Ns4DashboardFact {
  key: string;
  displayName: string | null;
  valueType: string;
  /** Exact canonical decimal/fraction string — display only, not for arithmetic. */
  displayValue: string;
  currency: string | null;
}

export interface Ns4DashboardFinancialState {
  companyId: string;
  status: Ns4DashboardFinancialStatus;
  /** NS-4 APPROVED store only — never "CERTIFIED" capacity authority. */
  authority: "NS4_APPROVED" | "NONE";
  approvedSnapshotCount: number;
  evaluationDate: string | null;
  cutoff: {
    state: string;
    reportingPeriodKey: string | null;
    asOf: string | null;
    approvedSnapshotId: string | null;
  };
  boundSnapshot: {
    snapshotId: string;
    reportingPeriod: string | null;
    asOf: string | null;
    approvalRef: string | null;
    reviewedBy: string | null;
    factCount: number;
    facts: Ns4DashboardFact[];
  } | null;
  inventory: Array<{
    snapshotId: string;
    reportingPeriod: string | null;
    asOf: string | null;
    factCount: number;
  }>;
  missingInputs: string[];
  evidence: string[];
  legacyNote: string;
  /**
   * Phase 4A IR-computed Total Net Leverage from bound MONEY facts.
   * Absent computation when not APPROVED_BOUND / missing components.
   */
  leverageIr: Ns4LeverageIrTrace;
}

function formatRuntimeValue(value: RuntimeValue): string {
  switch (value.type) {
    case "MONEY":
      return toCanonicalString(value.amount);
    case "NUMBER":
      return toCanonicalString(value.value);
    case "RATIO":
      return toCanonicalString(value.value);
    case "PERCENT":
      return toCanonicalString(value.fraction);
    case "BOOLEAN":
      return value.value ? "true" : "false";
    case "DATE":
      return value.isoDate;
    case "ENTITY_SET":
      return `include:${value.include.join(",")}|exclude:${value.exclude.join(",")}`;
    case "CAPACITY":
      if (value.capacity.kind === "AMOUNT") {
        return `${toCanonicalString(value.capacity.amount)} ${value.capacity.currency}`;
      }
      if (value.capacity.kind === "UNLIMITED") return "UNLIMITED";
      return "GATE_NOT_SATISFIED";
    default: {
      const _exhaustive: never = value;
      return _exhaustive;
    }
  }
}

function factsFromSnapshot(snap: FinancialSnapshot): Ns4DashboardFact[] {
  return snap.inputs.map((inp) => ({
    key: inp.identity.key,
    displayName: inp.displayName ?? null,
    valueType: inp.identity.valueType,
    displayValue: formatRuntimeValue(inp.value),
    currency: inp.identity.currency,
  }));
}

function inventoryFrom(approved: FinancialSnapshot[]) {
  return approved.map((s) => ({
    snapshotId: s.snapshotId,
    reportingPeriod: s.reportingPeriod,
    asOf: s.asOf,
    factCount: s.inputs.length,
  }));
}

/**
 * Load Dashboard NS-4 financial evidence from Neon.
 * Consults APPROVED ContractInputSnapshot rows before any product surface
 * presents North-Star financial truth.
 */
export async function loadNs4DashboardFinancialState(args: {
  companyId: string;
  evaluationDate?: string;
  selector?: NamedContractualSelector;
}): Promise<Ns4DashboardFinancialState> {
  const companyId = args.companyId;
  // Prefer delivered-certificate cutoff: issuer fiscal labels (e.g. Matthews FY2025-Q1
  // ending 2024-12-31) often disagree with a calendar MOST_RECENTLY_ENDED_FISCAL_QUARTER
  // period key. Delivery evidence is built from APPROVED snapshot rows.
  const [approved, readiness] = await Promise.all([
    loadApprovedSnapshotsFromPrisma(prisma, companyId),
    loadTransactionWorkflowReadiness(companyId, {
      evaluationDate: args.evaluationDate,
      selector: args.selector ?? "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE",
    }),
  ]);

  const missingInputs: string[] = [];
  if (approved.length === 0) missingInputs.push("APPROVED_NorthStar_snapshot");
  if (!args.evaluationDate) missingInputs.push("evaluationDate");
  if (args.evaluationDate && readiness.cutoff?.state !== "RESOLVED") {
    missingInputs.push("contractual_cutoff");
  }

  const legacyNote =
    "LEGACY_ENGINE covenant/financial figures elsewhere on this Dashboard are not NS-4 APPROVED certificate facts and are not certified Phase 4A–4E capacity.";

  const cutoff = {
    state: readiness.cutoff?.state ?? "NEEDS_INPUT",
    reportingPeriodKey: readiness.cutoff?.reportingPeriodKey ?? null,
    asOf: readiness.cutoff?.asOf ?? null,
    approvedSnapshotId: readiness.cutoff?.snapshotId ?? null,
  };

  const inventory = inventoryFrom(approved);
  const evidence: string[] = [];

  if (approved.length === 0) {
    evidence.push(
      "No APPROVED NS-4 ContractInputSnapshot rows in Neon for this company — Dashboard cannot present North-Star financial facts.",
    );
    return {
      companyId,
      status: "NEEDS_INPUT",
      authority: "NONE",
      approvedSnapshotCount: 0,
      evaluationDate: args.evaluationDate ?? null,
      cutoff,
      boundSnapshot: null,
      inventory: [],
      missingInputs,
      evidence,
      legacyNote,
      leverageIr: computeNs4ContractualNetLeverage({ companyId, boundSnapshot: null }),
    };
  }

  evidence.push(
    `${approved.length} APPROVED NS-4 snapshot(s) loaded from Neon ContractInputSnapshot (tenant-scoped).`,
  );

  const boundId = readiness.cutoff?.state === "RESOLVED" ? readiness.cutoff.snapshotId ?? null : null;
  const bound = boundId ? approved.find((s) => s.snapshotId === boundId) : null;

  if (bound) {
    const facts = factsFromSnapshot(bound);
    const leverageIr = computeNs4ContractualNetLeverage({ companyId, boundSnapshot: bound });
    evidence.push(
      `Cutoff-bound snapshot ${bound.snapshotId} (${bound.reportingPeriod ?? "no-period"} asOf ${bound.asOf ?? "—"}) with ${facts.length} fact(s).`,
    );
    evidence.push(...leverageIr.evidence);
    const mergedMissing = [
      ...missingInputs.filter((m) => m !== "APPROVED_NorthStar_snapshot" && m !== "contractual_cutoff"),
      ...leverageIr.missingInputs,
    ];
    return {
      companyId,
      status: "APPROVED_BOUND",
      authority: "NS4_APPROVED",
      approvedSnapshotCount: approved.length,
      evaluationDate: args.evaluationDate ?? null,
      cutoff,
      boundSnapshot: {
        snapshotId: bound.snapshotId,
        reportingPeriod: bound.reportingPeriod,
        asOf: bound.asOf,
        approvalRef: bound.review.approvalRef,
        reviewedBy: bound.review.reviewedBy,
        factCount: facts.length,
        facts,
      },
      inventory,
      missingInputs: [...new Set(mergedMissing)],
      evidence,
      legacyNote,
      leverageIr,
    };
  }

  evidence.push(
    "APPROVED snapshots are present but no cutoff-bound snapshot is selected — supply an evaluation date (and delivery/fiscal evidence) before treating any period as current. No silent LATEST_QUARTER.",
  );

  return {
    companyId,
    status: "APPROVED_INVENTORY",
    authority: "NS4_APPROVED",
    approvedSnapshotCount: approved.length,
    evaluationDate: args.evaluationDate ?? null,
    cutoff,
    boundSnapshot: null,
    inventory,
    missingInputs,
    evidence,
    legacyNote,
    leverageIr: computeNs4ContractualNetLeverage({ companyId, boundSnapshot: null }),
  };
}
