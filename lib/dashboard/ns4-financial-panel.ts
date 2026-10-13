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
import {
  loadApprovedFinancialInputBundle,
  NS4_PRODUCT_CUTOFF_SELECTOR,
} from "@/lib/product/north-star-workflow/approved-financial-inputs";
import {
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
  const selector = args.selector ?? NS4_PRODUCT_CUTOFF_SELECTOR;
  // Same APPROVED binder as Position / Simulate — one cutoff-bound snapshot identity.
  const [bundle, approved] = await Promise.all([
    loadApprovedFinancialInputBundle({
      companyId,
      evaluationDate: args.evaluationDate,
      selector,
    }),
    loadApprovedSnapshotsFromPrisma(prisma, companyId),
  ]);

  const legacyNote =
    "LEGACY_ENGINE covenant/financial figures elsewhere on this Dashboard are not NS-4 APPROVED certificate facts and are not certified Phase 4A–4E capacity.";

  const cutoff = {
    state: bundle.cutoff.state,
    reportingPeriodKey: bundle.cutoff.reportingPeriodKey,
    asOf: bundle.cutoff.asOf,
    approvedSnapshotId: bundle.cutoff.approvedSnapshotId,
  };
  const inventory = inventoryFrom(approved);
  const evidence = [
    ...bundle.evidence,
    bundle.boundSnapshotId
      ? `Dashboard reuses shared binder snapshot ${bundle.boundSnapshotId} (fingerprint ${bundle.financialInputFingerprint?.slice(0, 16) ?? "—"}…).`
      : "Dashboard shares the product NS-4 binder; no cutoff-bound snapshot yet.",
  ];

  if (bundle.status === "NEEDS_INPUT") {
    return {
      companyId,
      status: "NEEDS_INPUT",
      authority: "NONE",
      approvedSnapshotCount: approved.length,
      evaluationDate: bundle.evaluationDate,
      cutoff,
      boundSnapshot: null,
      inventory: inventory.length > 0 ? inventory : [],
      missingInputs: bundle.missingInputs,
      evidence,
      legacyNote,
      leverageIr: bundle.leverageIr,
    };
  }

  if (bundle.status === "APPROVED_BOUND" && bundle.boundSnapshotId) {
    const bound = approved.find((s) => s.snapshotId === bundle.boundSnapshotId) ?? null;
    const facts = bound ? factsFromSnapshot(bound) : [];
    return {
      companyId,
      status: "APPROVED_BOUND",
      authority: "NS4_APPROVED",
      approvedSnapshotCount: approved.length,
      evaluationDate: bundle.evaluationDate,
      cutoff,
      boundSnapshot: bound
        ? {
            snapshotId: bound.snapshotId,
            reportingPeriod: bound.reportingPeriod,
            asOf: bound.asOf,
            approvalRef: bound.review.approvalRef,
            reviewedBy: bound.review.reviewedBy,
            factCount: facts.length,
            facts,
          }
        : null,
      inventory,
      missingInputs: bundle.missingInputs,
      evidence,
      legacyNote,
      leverageIr: bundle.leverageIr,
    };
  }

  return {
    companyId,
    status: "APPROVED_INVENTORY",
    authority: "NS4_APPROVED",
    approvedSnapshotCount: approved.length,
    evaluationDate: bundle.evaluationDate,
    cutoff,
    boundSnapshot: null,
    inventory,
    missingInputs: bundle.missingInputs,
    evidence,
    legacyNote,
    leverageIr: bundle.leverageIr,
  };
}
