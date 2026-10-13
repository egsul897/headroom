/**
 * Shared APPROVED NS-4 financial input binder for product surfaces.
 *
 * One cutoff-bound APPROVED ContractInputSnapshot identity feeds:
 *   - Dashboard IR leverage (via loadNs4DashboardFinancialState)
 *   - Verified capacity / transaction simulation (via attemptCertifiedTransaction)
 *   - Legacy 8-field capacity projection (via loadVerifiedFinancialCapacityInput)
 *   - Authentic provision gross evaluation
 *
 * Not a separate calculation engine. Never invents missing money facts.
 * Never upgrades TEST_ATTRIBUTED_APPROVAL / fixture authority to production.
 */

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  loadApprovedSnapshotsFromPrisma,
  loadCutoffEligibleSnapshotsFromPrisma,
  type FinancialSnapshot,
  type NamedContractualSelector,
} from "@/lib/contract-model/north-star-bridge";
import {
  classifyApprovedSnapshotAuthority,
  loadVerifiedFinancialCapacityInput,
  type FinancialInputAuthorityLabel,
  type VerifiedFinancialCapacityInput,
} from "@/lib/financial-certificate-engine";
import { computeNs4ContractualNetLeverage, type Ns4LeverageIrTrace } from "@/lib/dashboard/ns4-leverage-ir";
import { loadTransactionWorkflowReadiness } from "./transaction-readiness";

/** Default selector shared by Dashboard / capacity / simulation after NS-4 vertical slice. */
export const NS4_PRODUCT_CUTOFF_SELECTOR: NamedContractualSelector =
  "MOST_RECENTLY_DELIVERED_COMPLIANCE_CERTIFICATE";

export type ApprovedFinancialInputBundleStatus =
  | "NEEDS_INPUT"
  | "APPROVED_INVENTORY"
  | "APPROVED_BOUND";

export interface ApprovedFinancialInputBundle {
  companyId: string;
  status: ApprovedFinancialInputBundleStatus;
  evaluationDate: string | null;
  selector: NamedContractualSelector;
  cutoff: {
    state: string;
    reportingPeriodKey: string | null;
    asOf: string | null;
    approvedSnapshotId: string | null;
  };
  boundSnapshotId: string | null;
  /**
   * Cutoff-bound NS-4 FinancialSnapshot identity shared with Dashboard / Position /
   * Simulate and package-wide financial-metric-resolver provenance binding.
   * Null when not APPROVED_BOUND. Never invents facts.
   */
  boundSnapshot: FinancialSnapshot | null;
  /** Content fingerprint — changes when bound APPROVED facts/version change. */
  financialInputFingerprint: string | null;
  authority: FinancialInputAuthorityLabel;
  factKeys: string[];
  leverageIr: Ns4LeverageIrTrace;
  /** 8-field capacity projection when mappable; null with missingInputs otherwise. */
  verifiedCapacity: VerifiedFinancialCapacityInput | null;
  missingInputs: string[];
  evidence: string[];
  /** Surfaces that may reuse this binder without re-deriving facts. */
  reusableFor: readonly [
    "dashboard_leverage",
    "debt_capacity",
    "liens_capacity",
    "investments_capacity",
    "restricted_payments_capacity",
    "transaction_simulation",
  ];
}

function serializeFactValue(value: FinancialSnapshot["inputs"][number]["value"]): string {
  switch (value.type) {
    case "MONEY":
      return `MONEY:${value.amount.num}/${value.amount.den}:${value.currency}`;
    case "NUMBER":
      return `NUMBER:${value.value.num}/${value.value.den}`;
    case "RATIO":
      return `RATIO:${value.value.num}/${value.value.den}`;
    case "PERCENT":
      return `PERCENT:${value.fraction.num}/${value.fraction.den}`;
    case "BOOLEAN":
      return `BOOLEAN:${value.value}`;
    case "DATE":
      return `DATE:${value.isoDate}`;
    default:
      return value.type;
  }
}

function fingerprintSnapshot(snap: FinancialSnapshot): string {
  const payload = {
    snapshotId: snap.snapshotId,
    version: snap.version,
    status: snap.status,
    asOf: snap.asOf,
    reportingPeriod: snap.reportingPeriod,
    approvalRef: snap.review.approvalRef,
    reviewedBy: snap.review.reviewedBy,
    facts: snap.inputs
      .map((i) => ({
        key: i.identity.key,
        type: i.identity.valueType,
        value: serializeFactValue(i.value),
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Load the single product-facing APPROVED financial input bundle for a company.
 * Fail-closed when evaluation date or delivery evidence is missing.
 */
export async function loadApprovedFinancialInputBundle(args: {
  companyId: string;
  evaluationDate?: string;
  selector?: NamedContractualSelector;
}): Promise<ApprovedFinancialInputBundle> {
  const companyId = args.companyId;
  const selector = args.selector ?? NS4_PRODUCT_CUTOFF_SELECTOR;
  const reusableFor = [
    "dashboard_leverage",
    "debt_capacity",
    "liens_capacity",
    "investments_capacity",
    "restricted_payments_capacity",
    "transaction_simulation",
  ] as const;

  const [approved, cutoffEligible, readiness] = await Promise.all([
    loadApprovedSnapshotsFromPrisma(prisma, companyId),
    loadCutoffEligibleSnapshotsFromPrisma(prisma, companyId),
    loadTransactionWorkflowReadiness(companyId, {
      evaluationDate: args.evaluationDate,
      selector,
    }),
  ]);

  const missingInputs: string[] = [];
  if (!args.evaluationDate) missingInputs.push("evaluationDate");
  if (approved.length === 0) missingInputs.push("APPROVED_NorthStar_snapshot");
  if (args.evaluationDate && readiness.cutoff?.state !== "RESOLVED") {
    missingInputs.push("contractual_cutoff");
  }

  const cutoff = {
    state: readiness.cutoff?.state ?? "NEEDS_INPUT",
    reportingPeriodKey: readiness.cutoff?.reportingPeriodKey ?? null,
    asOf: readiness.cutoff?.asOf ?? null,
    approvedSnapshotId: readiness.cutoff?.snapshotId ?? null,
  };

  const emptyAuthority = classifyApprovedSnapshotAuthority({
    reviewedBy: null,
    approvalRef: null,
  });

  if (approved.length === 0) {
    return {
      companyId,
      status: "NEEDS_INPUT",
      evaluationDate: args.evaluationDate ?? null,
      selector,
      cutoff,
      boundSnapshotId: null,
      boundSnapshot: null,
      financialInputFingerprint: null,
      authority: emptyAuthority,
      factKeys: [],
      leverageIr: computeNs4ContractualNetLeverage({ companyId, boundSnapshot: null }),
      verifiedCapacity: null,
      missingInputs,
      evidence: [
        "No APPROVED NS-4 snapshot — capacity and simulation cannot bind financial inputs.",
      ],
      reusableFor,
    };
  }

  const boundId = readiness.cutoff?.state === "RESOLVED" ? readiness.cutoff.snapshotId ?? null : null;
  // Historical eval may bind a SUPERSEDED predecessor that was eligible at evaluationDate.
  const bound = boundId
    ? cutoffEligible.find((s) => s.snapshotId === boundId) ??
      approved.find((s) => s.snapshotId === boundId) ??
      null
    : null;

  if (!bound) {
    return {
      companyId,
      status: "APPROVED_INVENTORY",
      evaluationDate: args.evaluationDate ?? null,
      selector,
      cutoff,
      boundSnapshotId: null,
      boundSnapshot: null,
      financialInputFingerprint: null,
      authority: emptyAuthority,
      factKeys: [],
      leverageIr: computeNs4ContractualNetLeverage({ companyId, boundSnapshot: null }),
      verifiedCapacity: null,
      missingInputs,
      evidence: [
        `${approved.length} APPROVED snapshot(s) present but none cutoff-bound — supply evaluationDate + delivery evidence. No silent latest-quarter.`,
      ],
      reusableFor,
    };
  }

  const authority = classifyApprovedSnapshotAuthority({
    reviewedBy: bound.review.reviewedBy,
    approvalRef: bound.review.approvalRef,
  });
  const fp = fingerprintSnapshot(bound);
  const leverageIr = computeNs4ContractualNetLeverage({ companyId, boundSnapshot: bound });
  const verified = await loadVerifiedFinancialCapacityInput(companyId, {
    snapshotId: bound.snapshotId,
  });
  const verifiedCapacity = verified.status === "OK" ? verified.input : null;
  const mergedMissing = [
    ...missingInputs.filter((m) => m !== "APPROVED_NorthStar_snapshot" && m !== "contractual_cutoff"),
    ...leverageIr.missingInputs,
    ...(verified.status === "OK" ? verified.input.missingInputs : verified.missingInputs),
  ];

  return {
    companyId,
    status: "APPROVED_BOUND",
    evaluationDate: args.evaluationDate ?? null,
    selector,
    cutoff,
    boundSnapshotId: bound.snapshotId,
    boundSnapshot: bound,
    financialInputFingerprint: fp,
    authority,
    factKeys: bound.inputs.map((i) => i.identity.key),
    leverageIr,
    verifiedCapacity,
    missingInputs: [...new Set(mergedMissing)],
    evidence: [
      `Bound APPROVED snapshot ${bound.snapshotId} fingerprint=${fp.slice(0, 16)}…`,
      `Authority: ${authority.kind} — ${authority.disclosure}`,
      ...leverageIr.evidence.slice(0, 4),
      "Reusable across debt/liens/investments/RP capacity and transaction simulation via the same bound snapshot identity — not Dashboard-only.",
      "Package-wide financial-metric-resolver must bind published values to this same boundSnapshot for APPROVED_SNAPSHOT provenance.",
    ],
    reusableFor,
  };
}
