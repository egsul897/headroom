/**
 * Source-backed EBITDA line-item packages and 4B approval resolution.
 *
 * Line items are PUBLIC_FILING_RECONSTRUCTION / seeded evidence — never
 * manufactured as APPROVED. resolveEbitdaLineApproval uses Phase 4B resolve.ts
 * so approval status is exact, not implied by presence.
 */

import { resolveInput } from "@/lib/contract-model/runtime/input/resolve";
import { money } from "@/lib/contract-model/runtime/values";
import { rationalFromNumber } from "@/lib/contract-model/runtime/decimal";
import type { FinancialInput, FinancialSnapshot } from "@/lib/contract-model/runtime/input/types";
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
 * Build a Phase 4B FinancialSnapshot from line items. Status is never auto-APPROVED —
 * callers pass the honest status (typically DRAFT / REVIEW_REQUIRED for reconstructions).
 */
export function lineItemsToFinancialSnapshot(args: {
  snapshotId: string;
  companyId: string;
  asOf: string;
  reportingPeriod: string;
  status: FinancialSnapshot["status"];
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
 * Resolve each EBITDA line under an APPROVED-only policy. Surfaces NOT_APPROVED
 * when evidence exists only as DRAFT/REVIEW_REQUIRED reconstruction.
 */
export function resolveEbitdaLineApproval(args: {
  companyId: string;
  instrumentKey: string;
  lineItems: ApprovedFinancialLineItem[];
  snapshotStatus: FinancialSnapshot["status"];
}): { approvals: LineApprovalResult[]; anyApproved: boolean; authority: FinancialInputAuthority } {
  const period = args.lineItems[0]?.period ?? "unknown";
  const asOf = args.lineItems[0]?.asOf ?? "1970-01-01";
  const snapshot = lineItemsToFinancialSnapshot({
    snapshotId: `${args.companyId}-ebitda-lines-${period}`,
    companyId: args.companyId,
    asOf,
    reportingPeriod: period,
    status: args.snapshotStatus,
    lineItems: args.lineItems,
    provenanceNote: "EBITDA line-item evidence package for approval resolution",
  });

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
      snapshots: [snapshot],
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
      snapshotStatus: args.snapshotStatus,
    };
  });

  const anyApproved = approvals.every((a) => a.resolveState === "RESOLVED");
  return {
    approvals,
    anyApproved,
    authority: anyApproved ? "APPROVED_PERIOD_MATCHED" : "SEEDED_SNAPSHOT",
  };
}
