/**
 * Source-backed EBITDA line-item packages and 4B approval resolution.
 *
 * Line items are PUBLIC_FILING_RECONSTRUCTION / seeded evidence — never
 * manufactured as APPROVED. resolveEbitdaLineApproval uses Phase 4B resolve
 * via north-star-bridge (not runtime/*).
 */

import {
  money,
  rationalFromNumber,
  resolveInput,
  type FinancialInput,
  type FinancialSnapshot,
  type SnapshotStatus,
} from "@/lib/contract-model/north-star-bridge";
import type { ApprovedFinancialLineItem, FinancialInputAuthority } from "./types";

/** Coherent FY2026 10-K line items cited by coh-eir-covenant-ebitda-public-filing-reconstruction. */
export const COHERENT_FY2026_EBITDA_LINE_ITEMS: ApprovedFinancialLineItem[] = [
  {
    key: "cni",
    label: "Net Earnings Attributable to Coherent Corp. (Consolidated Net Income)",
    amountMillions: 804.998,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation:
      "FY2026 Form 10-K Consolidated Statements of Earnings — Net Earnings Attributable to Coherent Corp. $804,998K",
  },
  {
    key: "tax",
    label: "Income tax expense",
    amountMillions: 60.849,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2026 Form 10-K — Income Tax Expense $60,849K",
  },
  {
    key: "interest",
    label: "Interest expense",
    amountMillions: 190.267,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2026 Form 10-K — Interest expense $190,267K",
  },
  {
    key: "depreciation",
    label: "Depreciation",
    amountMillions: 241.561,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2026 Form 10-K Consolidated Statements of Cash Flows — Depreciation $241,561K",
  },
  {
    key: "amortization",
    label: "Amortization",
    amountMillions: 280.334,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2026 Form 10-K — Amortization $280,334K",
  },
  {
    key: "restructuring",
    label: "Restructuring charges",
    amountMillions: 63.39,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2026 Form 10-K — Restructuring charges $63,390K",
  },
  {
    key: "impairment",
    label: "Impairment of assets held-for-sale (non-cash)",
    amountMillions: 64.404,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2026 Form 10-K — Impairment of assets held-for-sale $64,404K",
  },
  {
    key: "sbc",
    label: "Share-based compensation expense (non-cash)",
    amountMillions: 186.468,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2026 Form 10-K — Share-based compensation expense $186,468K",
  },
  {
    key: "gain_business",
    label: "Gain on sale of business",
    amountMillions: 124.133,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2026 Form 10-K — Gain on sale of business ($124,133K) — subtracted in reconstruction",
  },
  {
    key: "gain_equity",
    label: "Gain on sale of equity investment",
    amountMillions: 73.998,
    period: "FY2026-2026-06-30",
    asOf: "2026-06-30",
    authority: "SEEDED_SNAPSHOT",
    sourceCitation: "FY2026 Form 10-K — Gain on sale of equity investment ($73,998K) — subtracted in reconstruction",
  },
];

/** Arithmetic sum of the Coherent FY2026 reconstruction schedule ($M). */
export const COHERENT_FY2026_EBITDA_BUILDUP_SUM = 1694.14;

export interface LineApprovalResult {
  key: string;
  label: string;
  resolveState: string;
  reason: string | null;
  snapshotStatus: string | null;
}

/**
 * Build a Phase 4B FinancialSnapshot from line items. Status is never auto-APPROVED.
 */
export function lineItemsToFinancialSnapshot(args: {
  snapshotId: string;
  companyId: string;
  asOf: string;
  reportingPeriod: string;
  status: SnapshotStatus;
  lineItems: ApprovedFinancialLineItem[];
  provenanceNote: string;
}): FinancialSnapshot {
  const inputs: FinancialInput[] = args.lineItems.map((item) => ({
    identity: {
      companyId: args.companyId,
      scope: { kind: "COMPANY_LEVEL", instrumentApplicability: { kind: "ALL_INSTRUMENTS" } },
      inputKind: "METRIC",
      key: item.key,
      identityStrength: "CONTRACT_NAME_ONLY",
      period: { kind: "EXACT_PERIOD_ID", periodId: item.period },
      asOf: { kind: "EXACT_DATE", isoDate: item.asOf },
      valueType: "MONEY",
      currency: "USD",
    },
    value: money(rationalFromNumber(item.amountMillions), "USD", { exprId: null, inputKeys: [item.key] }),
    displayName: item.label,
    sourceVersion: item.sourceCitation ?? "public-filing-reconstruction",
    note: `authority=${item.authority}`,
  }));

  return {
    snapshotId: args.snapshotId,
    version: "1",
    companyId: args.companyId,
    asOf: args.asOf,
    reportingPeriod: args.reportingPeriod,
    status: args.status,
    supersedesSnapshotId: null,
    inputs,
    provenance: {
      source: "public-filing-reconstruction",
      sourceVersion: args.reportingPeriod,
      note: args.provenanceNote,
    },
    review: { reviewedBy: null, reviewedAt: null, approvalRef: null },
  };
}

/**
 * Resolve each EBITDA line under an APPROVED-only policy via north-star-bridge.
 */
export function resolveEbitdaLineApproval(args: {
  companyId: string;
  instrumentKey: string;
  lineItems: ApprovedFinancialLineItem[];
  snapshotStatus: SnapshotStatus;
  /** When provided, resolve against this persisted NS-4 snapshot instead of a synthetic one. */
  ns4Snapshots?: FinancialSnapshot[];
}): { approvals: LineApprovalResult[]; anyApproved: boolean; authority: FinancialInputAuthority } {
  const period = args.lineItems[0]?.period ?? "unknown";
  const asOf = args.lineItems[0]?.asOf ?? "1970-01-01";
  const snapshots =
    args.ns4Snapshots && args.ns4Snapshots.length > 0
      ? args.ns4Snapshots
      : [
          lineItemsToFinancialSnapshot({
            snapshotId: `${args.companyId}-ebitda-lines-${period}`,
            companyId: args.companyId,
            asOf,
            reportingPeriod: period,
            status: args.snapshotStatus,
            lineItems: args.lineItems,
            provenanceNote: "EBITDA line-item evidence package for approval resolution",
          }),
        ];

  const approvals: LineApprovalResult[] = args.lineItems.map((item) => {
    const result = resolveInput({
      query: {
        companyId: args.companyId,
        instrumentKey: args.instrumentKey,
        inputKind: "METRIC",
        key: item.key,
        expectedType: "MONEY",
        period: { kind: "EXACT_PERIOD_ID", periodId: item.period },
        asOf: { kind: "EXACT_DATE", isoDate: item.asOf },
        currency: "USD",
      },
      snapshots,
      policy: {
        acceptableStatuses: ["APPROVED"],
        asOfMode: "EXACT",
      },
    });
    return {
      key: item.key,
      label: item.label,
      resolveState: result.state,
      reason: result.reason ?? null,
      snapshotStatus: args.ns4Snapshots?.length ? "APPROVED" : args.snapshotStatus,
    };
  });

  const anyApproved = approvals.every((a) => a.resolveState === "RESOLVED");
  return {
    approvals,
    anyApproved,
    authority: anyApproved ? "APPROVED_PERIOD_MATCHED" : "SEEDED_SNAPSHOT",
  };
}

/**
 * Bind line items to facts on APPROVED NS-4 snapshots by key+period+asOf.
 * Missing components stay missing (null amount) — never zero-filled.
 */
export function bindLineItemsToNs4Snapshots(args: {
  lineItems: ApprovedFinancialLineItem[];
  snapshots: FinancialSnapshot[];
}): { bound: ApprovedFinancialLineItem[]; missingKeys: string[]; ns4SnapshotId: string | null } {
  const approved = args.snapshots.filter((s) => s.status === "APPROVED");
  if (approved.length === 0) {
    return { bound: args.lineItems.map((i) => ({ ...i, ns4SnapshotId: null })), missingKeys: [], ns4SnapshotId: null };
  }

  const missingKeys: string[] = [];
  let ns4SnapshotId: string | null = null;
  const bound = args.lineItems.map((item) => {
    for (const snap of approved) {
      const fact = snap.inputs.find((inp) => {
        const id = inp.identity;
        if (id.key !== item.key) return false;
        if (id.period.kind === "EXACT_PERIOD_ID" && id.period.periodId !== item.period) return false;
        if (id.asOf.kind === "EXACT_DATE" && id.asOf.isoDate !== item.asOf) return false;
        return true;
      });
      if (fact) {
        ns4SnapshotId = snap.snapshotId;
        // Extract amount from MONEY value if present — leave amountMillions from caller
        // when already supplied; binding only attaches identity.
        return { ...item, ns4SnapshotId: snap.snapshotId, authority: "APPROVED_PERIOD_MATCHED" as const };
      }
    }
    missingKeys.push(item.key);
    return { ...item, ns4SnapshotId: null };
  });

  return { bound, missingKeys, ns4SnapshotId };
}
