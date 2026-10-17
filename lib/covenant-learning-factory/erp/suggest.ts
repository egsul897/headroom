/**
 * ERP evidence for the dashboard EBITDA box: last-twelve-months (LTM) figures the CFO can confirm, the per-period
 * reconciliation against filings, and the facts that were refused.
 *
 * Evidence only. Nothing here changes a box total: a suggestion becomes a figure only when the CFO confirms it through
 * the existing confirm flow (kind BASE_METRIC; see ebitda-box.ts), which re-derives the suggestion server-side and
 * requires the exact source reference and value. Only revenue is confirmable today, and only when the filings carry no
 * revenue for the box period (filings are never overridden; where both exist they are reconciled instead). Revenue is
 * the figure the NEEDS_BASE plausibility bound needs. The base-EBITDA components (net income, interest, taxes, D&A) are
 * shown as evidence for the CFO; the base itself still comes from the agreement's own definition over filed figures.
 */
import { createHash } from "node:crypto";
import type { IssuerFinancials } from "../xbrl/companyfacts";
import { admitErpFacts, epochDay, isoOfDay, type AdmittedErpFact, type ErpEvidenceFact, type ErpEvidenceMetric, type RejectedErpFact } from "./contract";
import { overlaps, reconcileErpWithFilings, sumOverWindow, type ReconcileOptions, type ReconciliationEntry } from "./reconcile";

/** Metrics the CFO can confirm from ERP evidence (each must be absent from the filings for the period). */
export const CONFIRMABLE_ERP_METRICS = ["revenue"] as const;
export const BASE_COMPONENT_METRICS = ["netIncome", "interestExpense", "incomeTaxes", "depreciationAmortization"] as const;

/** inputKey of a base-metric confirmation, e.g. METRIC:REVENUE. */
export const metricInputKey = (m: ErpEvidenceMetric) => `METRIC:${m.toUpperCase()}`;
export function metricOfInputKey(k: string): ErpEvidenceMetric | null {
  const m = /^METRIC:([A-Z]+)$/.exec(k.replace(/\s+/g, "").toUpperCase());
  return (CONFIRMABLE_ERP_METRICS as readonly string[]).find((x) => x.toUpperCase() === m?.[1]) as ErpEvidenceMetric | undefined ?? null;
}

export interface ErpSuggestion {
  metric: ErpEvidenceMetric;
  /** METRIC:<METRIC> for confirmable suggestions; null for evidence-only ones. */
  inputKey: string | null;
  periodStart: string;
  periodEnd: string;
  status: "SUGGESTED" | "NEEDS_INPUT" | "BLOCKED_UNRECONCILED";
  /** Whole USD; null unless SUGGESTED. */
  value: string | null;
  /** erp:<PROVIDER>:<connectionId>:ltm.<metric>.<digest>@<periodEnd> — the source the confirm must quote. */
  sourceRef: string | null;
  /** Every ERP record the figure sums (erp:<PROVIDER>:<connectionId>:<externalId>@<periodEnd>). */
  refs: string[];
  /** RECONCILED when at least one filed flow overlapping the window reconciled with this ERP; NOT_COMPARED otherwise.
   *  A confirmable suggestion is SUGGESTED only when RECONCILED (and the ratio check passes). */
  reconciliation: "RECONCILED" | "NOT_COMPARED";
  confirmable: boolean;
  reason: string;
}

export interface ErpEvidence {
  status: "READY" | "NO_PERIOD";
  /** End of the LTM window (the box's filing period end). */
  asOf: string | null;
  suggestions: ErpSuggestion[];
  reconciliation: ReconciliationEntry[];
  unreconciledPeriods: number;
  rejected: RejectedErpFact[];
  rejectedCount: number;
  note: string;
}

/** Inclusive LTM window ending on `endIso` (e.g. 2026-06-30 → 2025-07-01..2026-06-30). */
export function ltmWindow(endIso: string): { start: string; end: string } | null {
  const e = epochDay(endIso);
  if (e == null) return null;
  const [y, m, d] = endIso.split("-").map(Number) as [number, number, number];
  let prior = epochDay(`${y - 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  if (prior == null) prior = epochDay(`${y - 1}-02-28`)!; // 29 Feb anchor
  return { start: isoOfDay(prior + 1), end: endIso };
}

/** A reconciled filed flow (scaled to 12 months) larger than this multiple of the ERP revenue fails the ratio check. */
export const REVENUE_RATIO_LIMIT = 10n;
const abs = (x: bigint) => (x < 0n ? -x : x);

const digest = (parts: string[]) => createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);

export interface ErpEvidenceInput {
  companyId: string;
  facts: readonly ErpEvidenceFact[];
  financials: IssuerFinancials | null | undefined;
  priorFinancials?: IssuerFinancials | null;
  /** The box's period end (the filing anchor). */
  periodEnd: string | null;
  /** Whether the box's base EBITDA is missing or not positive (then the base components are shown as evidence). */
  baseNeedsEvidence: boolean;
  options?: ReconcileOptions;
}

const filedHas = (fin: IssuerFinancials | null | undefined, metric: ErpEvidenceMetric) => !!fin?.values.some((v) => v.metric === metric && /^-?\d+$/.test(v.value));

/** One LTM suggestion for `metric`, given admitted facts and the reconciliation. Pure and deterministic. */
export function suggestLtm(admitted: readonly AdmittedErpFact[], reconciliation: readonly ReconciliationEntry[], metric: ErpEvidenceMetric, periodEnd: string, confirmable: boolean): ErpSuggestion {
  const w = ltmWindow(periodEnd);
  const base = { metric, inputKey: confirmable ? metricInputKey(metric) : null, periodStart: w?.start ?? periodEnd, periodEnd, confirmable };
  const none = (status: ErpSuggestion["status"], reason: string): ErpSuggestion => ({ ...base, status, value: null, sourceRef: null, refs: [], reconciliation: "NOT_COMPARED", confirmable: false, reason });
  if (!w) return none("NEEDS_INPUT", `period end ${periodEnd} is not an ISO date`);
  const bad = reconciliation.filter((r) => r.status === "UNRECONCILED" && overlaps(r.periodStart, r.periodEnd, w.start, w.end));
  if (bad.length) return none("BLOCKED_UNRECONCILED", `ERP figures for this window do not reconcile with the filings: ${bad.map((b) => `${b.metric} ${b.periodStart}..${b.periodEnd} ${b.code}`).join("; ")}`);
  const s = sumOverWindow(admitted, metric, w.start, w.end);
  if (!s.ok) return none("NEEDS_INPUT", s.reason);
  const anchors = reconciliation.filter((r) => r.status === "RECONCILED" && overlaps(r.periodStart, r.periodEnd, w.start, w.end));
  if (confirmable) {
    // A confirmable figure needs a reconciled anchor: at least one filed flow overlapping the window that the same ERP
    // ledger matched. Without one, nothing ties this ERP's units, scope or sign to the filer's.
    if (!anchors.length) return none("NEEDS_INPUT", `no filed figure overlapping ${w.start}..${w.end} reconciles with this ERP; an ERP ${metric} is confirmable only against a reconciled filing anchor`);
    // Ratio sanity: no reconciled filed flow, scaled to the LTM length, may exceed RATIO_LIMIT x the ERP revenue (a
    // units slip on the revenue accounts alone would otherwise pass, since the anchor reconciled on other accounts).
    const ltmDays = BigInt(epochDay(w.end)! - epochDay(w.start)! + 1);
    for (const r of anchors) {
      const days = BigInt(epochDay(r.periodEnd)! - epochDay(r.periodStart)! + 1);
      const scaled = (abs(BigInt(r.filing.value)) * ltmDays) / days;
      if (s.value > 0n && scaled > s.value * REVENUE_RATIO_LIMIT) return none("NEEDS_INPUT", `ratio check failed: filed ${r.metric} ${r.periodStart}..${r.periodEnd} (${scaled} over 12 months) exceeds ${REVENUE_RATIO_LIMIT}x the ERP LTM ${metric} (${s.value})`);
    }
  }
  const rec = anchors.length > 0;
  const value = s.value.toString();
  return {
    ...base, status: "SUGGESTED", value,
    sourceRef: `erp:${s.provider}:${s.connectionId}:ltm.${metric}.${digest([metric, w.start, w.end, value, ...s.refs])}@${w.end}`,
    refs: s.refs, reconciliation: rec ? "RECONCILED" : "NOT_COMPARED",
    reason: confirmable ? "LTM sum of posted ERP periods; counts only after the CFO confirms it" : "LTM sum of posted ERP periods; evidence only (the base comes from the agreement's own definition)",
  };
}

/** Build the box's ERP evidence. With no facts there is nothing to say: callers omit the field. */
export function erpEvidenceForBox(input: ErpEvidenceInput): ErpEvidence {
  const { admitted, rejected } = admitErpFacts(input.facts, input.companyId);
  const reconciliation = reconcileErpWithFilings(admitted, [input.financials, input.priorFinancials], input.options);
  const unreconciledPeriods = reconciliation.filter((r) => r.status === "UNRECONCILED").length;
  const common = { reconciliation, unreconciledPeriods, rejected: rejected.slice(0, 50), rejectedCount: rejected.length };
  if (!input.periodEnd || epochDay(input.periodEnd) == null) {
    return { status: "NO_PERIOD", asOf: null, suggestions: [], ...common, note: "no filing period to anchor an LTM window; ERP figures are shown only as reconciliation" };
  }
  const suggestions: ErpSuggestion[] = [];
  for (const m of CONFIRMABLE_ERP_METRICS) if (!filedHas(input.financials, m)) suggestions.push(suggestLtm(admitted, reconciliation, m, input.periodEnd, true));
  if (input.baseNeedsEvidence) for (const m of BASE_COMPONENT_METRICS) suggestions.push(suggestLtm(admitted, reconciliation, m, input.periodEnd, false));
  return {
    status: "READY", asOf: input.periodEnd, suggestions, ...common,
    note: unreconciledPeriods ? `${unreconciledPeriods} filed period(s) do not reconcile with the ERP; overlapping ERP suggestions are blocked` : "ERP figures are evidence; nothing counts until the CFO confirms it",
  };
}
