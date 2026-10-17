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
   *  Only qualifying anchors count (same connection, >= 75% coverage, material, within bps). A confirmable suggestion is
   *  SUGGESTED only when RECONCILED and the two-sided ratio check passes. */
  reconciliation: "RECONCILED" | "NOT_COMPARED";
  confirmable: boolean;
  reason: string;
}

export interface ErpEvidence {
  status: "READY" | "NO_PERIOD";
  /** End of the LTM window (the box's filing period end). */
  asOf: string | null;
  /** When these ERP facts were read from the connector (ISO 8601, UTC); null when the caller did not say. Shown so the
   *  CFO can see how fresh the evidence is before confirming; a stale read is re-fetched on the next refresh. */
  fetchedAt: string | null;
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
/**
 * Upper bound: ERP LTM revenue may be at most this multiple of the largest anchor magnitude (12-month scaled). Why 100:
 * the anchors are net income, operating income, interest, income taxes and D&A. For a leveraged borrower (the only kind
 * Headroom serves), the largest of these is at least about 1% of revenue: D&A alone usually runs 2-6%, and interest on
 * funded debt rarely falls below 1%. So 100x leaves real thin-margin borrowers headroom and refuses every 1,000x units
 * error. It also refuses 100x and 10x revenue inflation whenever the largest anchor is above 1% (resp. 10%) of true
 * revenue. When a real borrower trips it, the result is NEEDS_INPUT (fail-closed): the CFO enters revenue from a document.
 */
export const REVENUE_UPPER_RATIO_LIMIT = 100n;
/** An anchor must overlap at least this share of the LTM window's days. */
export const ANCHOR_MIN_COVERAGE_PCT = 75;
/** An anchor's filed figure must be at least this large (|USD|): zero and token flows (a $500 tax line) never anchor. */
export const ANCHOR_MIN_USD = 1_000_000n;
/** An anchor must reconcile within this relative tolerance of its own magnitude (the $1k absolute allowance alone is not enough). */
export const ANCHOR_TOLERANCE_BPS = 50n;

/**
 * Reconciled filed flows that may anchor a confirmable ERP figure from connection `s`: same provider and connection;
 * non-zero and material (|filing| >= ANCHOR_MIN_USD); ERP within ANCHOR_TOLERANCE_BPS of |filing| (not only the absolute
 * allowance); and covering at least ANCHOR_MIN_COVERAGE_PCT of the window's days. Each comes back with its magnitude
 * scaled to the LTM length.
 */
function qualifyingAnchors(reconciliation: readonly ReconciliationEntry[], s: { provider: string; connectionId: string }, w: { start: string; end: string }, ltmDays: number): Array<{ entry: ReconciliationEntry; scaled: bigint }> {
  const ws = epochDay(w.start)!, we = epochDay(w.end)!;
  const out: Array<{ entry: ReconciliationEntry; scaled: bigint }> = [];
  for (const r of reconciliation) {
    if (r.status !== "RECONCILED" || r.erp.value == null) continue;
    if (r.erp.provider !== s.provider || r.erp.connectionId !== s.connectionId) continue;
    const filing = BigInt(r.filing.value), erp = BigInt(r.erp.value);
    if (abs(filing) < ANCHOR_MIN_USD) continue;
    if (abs(erp - filing) * 10_000n > ANCHOR_TOLERANCE_BPS * abs(filing)) continue;
    const rs = epochDay(r.periodStart)!, re = epochDay(r.periodEnd)!;
    const overlap = Math.min(re, we) - Math.max(rs, ws) + 1;
    if (overlap * 100 < ltmDays * ANCHOR_MIN_COVERAGE_PCT) continue;
    out.push({ entry: r, scaled: (abs(filing) * BigInt(ltmDays)) / BigInt(re - rs + 1) });
  }
  return out;
}
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
  /** When the facts were read from the connector (ISO 8601). Anything that is not a valid timestamp becomes null. */
  fetchedAt?: string | null;
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
  if (confirmable && s.value <= 0n) return none("NEEDS_INPUT", `ERP LTM ${metric} is ${s.value}; a non-positive ${metric} is not a confirmable base (and cannot bound add-backs)`);
  const ltmDays = epochDay(w.end)! - epochDay(w.start)! + 1;
  const anchors = qualifyingAnchors(reconciliation, s, w, ltmDays);
  if (confirmable) {
    // A confirmable figure needs a strong anchor (see qualifyingAnchors). Without one, nothing ties this ERP's units,
    // scope or sign to the filer's.
    if (!anchors.length) return none("NEEDS_INPUT", `no filed flow reconciles with this ERP connection strongly enough to anchor ${metric} for ${w.start}..${w.end} (needs: same connection, >= ${ANCHOR_MIN_COVERAGE_PCT}% of the window, |figure| >= ${ANCHOR_MIN_USD} USD, within ${ANCHOR_TOLERANCE_BPS} bps)`);
    // Two-sided ratio check against the anchors, each scaled to the LTM length. A units slip confined to the revenue
    // accounts passes reconciliation on the other accounts; it shows up as an implausible revenue-to-flow ratio.
    let largest = 0n;
    for (const a of anchors) {
      if (a.scaled > s.value * REVENUE_RATIO_LIMIT) return none("NEEDS_INPUT", `ratio check failed: filed ${a.entry.metric} ${a.entry.periodStart}..${a.entry.periodEnd} (${a.scaled} over 12 months) exceeds ${REVENUE_RATIO_LIMIT}x the ERP LTM ${metric} (${s.value})`);
      if (a.scaled > largest) largest = a.scaled;
    }
    if (s.value > largest * REVENUE_UPPER_RATIO_LIMIT) return none("NEEDS_INPUT", `ratio check failed: ERP LTM ${metric} (${s.value}) exceeds ${REVENUE_UPPER_RATIO_LIMIT}x the largest reconciled filed flow (${largest} over 12 months); a units or scope error on the ${metric} accounts is likely`);
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
  const fetchedAt = typeof input.fetchedAt === "string" && /^\d{4}-\d{2}-\d{2}T/.test(input.fetchedAt) && Number.isFinite(Date.parse(input.fetchedAt)) ? new Date(Date.parse(input.fetchedAt)).toISOString() : null;
  const common = { fetchedAt, reconciliation, unreconciledPeriods, rejected: rejected.slice(0, 50), rejectedCount: rejected.length };
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
