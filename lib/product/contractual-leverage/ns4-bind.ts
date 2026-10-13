/**
 * Bind contractual EBITDA / leverage component dependencies to APPROVED NS-4
 * snapshot facts using company, instrument, period, as-of, source, and approval
 * identities. Missing / unsupported / not-approved outcomes are preserved.
 * Never synthesizes components or promotes modeled / DRAFT evidence to APPROVED.
 */

import {
  buildFinancialInformationRequest,
  toApproximateNumber,
  type FinancialInformationRequest,
  type FinancialSnapshot,
  type FulfillmentState,
  type Rational,
} from "@/lib/contract-model/contractual-metric-execution";
import type { IRExpression } from "@/lib/contract-model/ir/types";
import { withExpressionId } from "@/lib/contract-model/ir/identity";
import type {
  EbitdaComponentInputs,
  LeverageFinancialInputs,
  ResolvedInputLine,
} from "./types";

export type AmountUnit = "USD" | "USD_MILLIONS";

export interface Ns4BindIdentity {
  companyId: string;
  instrumentKey: string;
  periodKey?: string | null;
  asOfIsoDate?: string | null;
  /** When set, only this APPROVED snapshotId may supply facts. */
  snapshotId?: string | null;
}

export interface BoundMetricFact {
  key: string;
  valueMillions: number | null;
  fulfillmentState: FulfillmentState;
  snapshotId: string | null;
  snapshotVersion: string | null;
  approvalRef: string | null;
  reviewedBy: string | null;
  source: string | null;
  sourceVersion: string | null;
  asOf: string | null;
  period: string | null;
  usableForExecution: boolean;
  requestText: string | null;
}

export interface Ns4MetricBindResult {
  status: "BOUND" | "INCOMPLETE" | "REFUSED";
  companyId: string;
  instrumentKey: string;
  facts: BoundMetricFact[];
  components: EbitdaComponentInputs;
  financials: LeverageFinancialInputs;
  missingKeys: string[];
  informationRequest: FinancialInformationRequest;
  contributingSnapshotIds: string[];
}

function metricRef(key: string, companyId: string, instrumentKey: string): IRExpression {
  return withExpressionId({
    kind: "METRIC_REFERENCE",
    type: "MONEY",
    metricName: key,
    companyId,
    instrumentKey,
    resolvedDefinitionId: null,
  });
}

/** SUM of metric refs so the manifest enumerates every required component key. */
export function buildMetricDependencyExpression(
  keys: readonly string[],
  companyId: string,
  instrumentKey: string,
): IRExpression {
  if (keys.length === 0) {
    return withExpressionId({ kind: "MONEY", type: "MONEY", amount: 0, currency: "USD" });
  }
  if (keys.length === 1) return metricRef(keys[0]!, companyId, instrumentKey);
  return withExpressionId({
    kind: "SUM",
    type: "MONEY",
    operands: keys.map((k) => metricRef(k, companyId, instrumentKey)),
  });
}

function isRational(v: unknown): v is Rational {
  return !!v && typeof v === "object" && typeof (v as Rational).num === "bigint" && typeof (v as Rational).den === "bigint";
}

function millionsFromRuntimeMoney(amount: unknown, unit: AmountUnit): number | null {
  if (!isRational(amount)) return null;
  const approx = toApproximateNumber(amount);
  if (!Number.isFinite(approx)) return null;
  return unit === "USD" ? approx / 1_000_000 : approx;
}

function filterSnapshots(
  snapshots: readonly FinancialSnapshot[],
  identity: Ns4BindIdentity,
): FinancialSnapshot[] {
  return snapshots.filter((s) => {
    if (s.companyId !== identity.companyId) return false;
    if (s.status !== "APPROVED") return false;
    if (identity.snapshotId && s.snapshotId !== identity.snapshotId) return false;
    return true;
  });
}

/**
 * Resolve required metric keys against APPROVED snapshots only.
 * Does not invent values. DRAFT / REVIEW_REQUIRED / SUPERSEDED never contribute.
 */
export function bindApprovedMetrics(args: {
  keys: readonly string[];
  snapshots: readonly FinancialSnapshot[];
  identity: Ns4BindIdentity;
  /** How MONEY amounts are stored on the snapshot. Default USD (full dollars). */
  amountUnit?: AmountUnit;
  leverageKeyMap?: {
    ebitda?: string;
    totalDebt?: string;
    securedDebt?: string;
    cash?: string;
  };
}): Ns4MetricBindResult {
  const unit = args.amountUnit ?? "USD";
  const approved = filterSnapshots(args.snapshots, args.identity);
  const expression = buildMetricDependencyExpression(
    args.keys,
    args.identity.companyId,
    args.identity.instrumentKey,
  );
  // Do not inject evaluation as-of into metric identity unless facts are also
  // EXACT_DATE-bound. Passing asOf here would AS_OF_MISMATCH NOT_AS_OF_SPECIFIC facts.
  const info = buildFinancialInformationRequest({
    expression,
    snapshots: approved,
    companyId: args.identity.companyId,
    instrumentKey: args.identity.instrumentKey,
    asOf: null,
  });

  const facts: BoundMetricFact[] = [];
  const components: EbitdaComponentInputs = {};
  const missingKeys: string[] = [];
  const contributing = new Set<string>();

  for (const key of args.keys) {
    const item = info.items.find((i) => i.dependency.key === key);
    if (!item) {
      missingKeys.push(key);
      facts.push({
        key,
        valueMillions: null,
        fulfillmentState: "MISSING",
        snapshotId: null,
        snapshotVersion: null,
        approvalRef: null,
        reviewedBy: null,
        source: null,
        sourceVersion: null,
        asOf: null,
        period: null,
        usableForExecution: false,
        requestText: `Metric "${key}" absent from dependency join.`,
      });
      continue;
    }

    const millions =
      item.fulfillmentState === "APPROVED_VERIFIED" && item.resolution?.input?.value.type === "MONEY"
        ? millionsFromRuntimeMoney(item.resolution.input.value.amount, unit)
        : null;

    if (item.fulfillmentState !== "APPROVED_VERIFIED" || millions == null) {
      missingKeys.push(key);
    } else {
      components[key] = millions;
      const snapId = item.resolution?.provenance?.snapshotId ?? null;
      if (snapId) contributing.add(snapId);
    }

    const prov = item.resolution?.provenance ?? null;
    facts.push({
      key,
      valueMillions: millions,
      fulfillmentState: item.fulfillmentState,
      snapshotId: prov?.snapshotId ?? null,
      snapshotVersion: prov?.snapshotVersion ?? null,
      approvalRef: prov?.approvalRef ?? null,
      reviewedBy: prov?.reviewedBy ?? null,
      source: prov?.source ?? null,
      sourceVersion: prov?.sourceVersion ?? null,
      asOf:
        prov?.identity.asOf.kind === "EXACT_DATE"
          ? prov.identity.asOf.isoDate
          : args.identity.asOfIsoDate ?? null,
      period:
        prov?.identity.period.kind === "VERBATIM_CONTRACT_PERIOD_KEY"
          ? prov.identity.period.key
          : args.identity.periodKey ?? null,
      usableForExecution: item.usableForExecution,
      requestText: item.requestText,
    });
  }

  const map = args.leverageKeyMap ?? {};
  const pick = (role: keyof typeof map): number | null => {
    const k = map[role];
    if (!k) return null;
    const f = facts.find((x) => x.key === k);
    return f?.fulfillmentState === "APPROVED_VERIFIED" ? f.valueMillions : null;
  };

  const financials: LeverageFinancialInputs = {
    ebitda: pick("ebitda"),
    totalDebt: pick("totalDebt"),
    securedDebt: pick("securedDebt"),
    cash: pick("cash"),
  };

  const status =
    missingKeys.length === 0 && info.executable
      ? "BOUND"
      : info.summary.UNSUPPORTED > 0 || info.summary.AMBIGUOUS > 0
        ? "REFUSED"
        : "INCOMPLETE";

  return {
    status,
    companyId: args.identity.companyId,
    instrumentKey: args.identity.instrumentKey,
    facts,
    components,
    financials,
    missingKeys,
    informationRequest: info,
    contributingSnapshotIds: [...contributing],
  };
}

export function boundFactsToInputLines(facts: BoundMetricFact[]): ResolvedInputLine[] {
  return facts.map((f) => ({
    key: f.key,
    label: f.key,
    valueMillions: f.valueMillions,
    required: true,
    status: f.fulfillmentState === "APPROVED_VERIFIED" ? "RESOLVED" : "MISSING",
    fulfillmentState: f.fulfillmentState,
  }));
}
