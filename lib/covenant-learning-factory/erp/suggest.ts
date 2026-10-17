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

/** The EBITDA proxy: filed operating income NET of the tagged non-revenue credits inside it (equity-method income,
 *  disposition gains — see PROXY_CREDIT_FAMILIES) + filed D&A over the LTM window, each reconciled with the revenue's
 *  ERP connection (a strong anchor, see qualifyingAnchors) and each filed over an annual period. `operatingIncome`
 *  is the filed figure as reported; `creditsSubtracted` is what was removed from it to form `value`. The proxy
 *  bounds revenue-derived add-backs in the box; MISSING fails closed. */
export type ErpEbitdaProxy =
  | { status: "RECONCILED"; value: string; operatingIncome: string; depreciationAmortization: string; creditsSubtracted: string; provider: string; connectionId: string; periods: string[] }
  | { status: "MISSING"; reason: string };

export interface ErpEvidence {
  status: "READY" | "NO_PERIOD";
  ebitdaProxy: ErpEbitdaProxy;
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

/** A reconciled filed flow (at its filed-period magnitude, never scaled up) larger than this multiple of the ERP revenue fails the ratio check. */
export const REVENUE_RATIO_LIMIT = 10n;
/**
 * Units backstop: ERP LTM revenue may be at most this multiple of the largest anchor magnitude (filed-period magnitude, never scaled up). This
 * catches a revenue error factor f only when f > 100 x (largest anchor / true revenue). Every 1,000x units error is
 * caught (no anchor exceeds 10x revenue, enforced by the lower check). 10x inflation is caught only when the largest
 * anchor is below 10% of true revenue, which is common for NI or D&A but not for operating income at typical margins.
 * So this check is NOT the add-back plausibility bound. That bound is EBITDA_PROXY_BOUND, applied in the box to every
 * add-back limit derived from an ERP-evidenced revenue. NEEDS_INPUT when it trips (fail-closed).
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
 * allowance); and covering at least ANCHOR_MIN_COVERAGE_PCT of the window's days. Each comes back with `days` (its
 * own filed period length, carried as provenance) and a `scaled` magnitude that is NEVER annualized upward: a flow
 * filed over a shorter period than the window contributes its own magnitude, not a pro-rated LTM estimate — an
 * annualized anchor fed the ratio checks below and the EBITDA proxy with figures that appear nowhere in the
 * filings. A flow filed over a longer period is scaled down to the window length.
 */
function qualifyingAnchors(reconciliation: readonly ReconciliationEntry[], s: { provider: string; connectionId: string }, w: { start: string; end: string }, ltmDays: number): Array<{ entry: ReconciliationEntry; scaled: bigint; days: number }> {
  const ws = epochDay(w.start)!, we = epochDay(w.end)!;
  const out: Array<{ entry: ReconciliationEntry; scaled: bigint; days: number }> = [];
  for (const r of reconciliation) {
    if (r.status !== "RECONCILED" || r.erp.value == null) continue;
    if (r.erp.provider !== s.provider || r.erp.connectionId !== s.connectionId) continue;
    const filing = BigInt(r.filing.value), erp = BigInt(r.erp.value);
    if (abs(filing) < ANCHOR_MIN_USD) continue;
    if (abs(erp - filing) * 10_000n > ANCHOR_TOLERANCE_BPS * abs(filing)) continue;
    const rs = epochDay(r.periodStart)!, re = epochDay(r.periodEnd)!;
    const overlap = Math.min(re, we) - Math.max(rs, ws) + 1;
    if (overlap * 100 < ltmDays * ANCHOR_MIN_COVERAGE_PCT) continue;
    const days = re - rs + 1;
    out.push({ entry: r, scaled: (abs(filing) * BigInt(Math.min(ltmDays, days))) / BigInt(days), days });
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
    // Two-sided ratio check against the anchors, each at its filed-period magnitude (never scaled up; see
    // qualifyingAnchors). A units slip confined to the revenue accounts passes reconciliation on the other
    // accounts; it shows up as an implausible revenue-to-flow ratio.
    let largest = 0n;
    for (const a of anchors) {
      if (a.scaled > s.value * REVENUE_RATIO_LIMIT) return none("NEEDS_INPUT", `ratio check failed: filed ${a.entry.metric} ${a.entry.periodStart}..${a.entry.periodEnd} (${a.scaled} over its ${a.days}-day filed period) exceeds ${REVENUE_RATIO_LIMIT}x the ERP LTM ${metric} (${s.value})`);
      if (a.scaled > largest) largest = a.scaled;
    }
    if (s.value > largest * REVENUE_UPPER_RATIO_LIMIT) return none("NEEDS_INPUT", `ratio check failed: ERP LTM ${metric} (${s.value}) exceeds ${REVENUE_UPPER_RATIO_LIMIT}x the largest reconciled filed flow (${largest} at its filed-period magnitude, never scaled up); a units or scope error on the ${metric} accounts is likely`);
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

const INSTANT = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d{1,3})?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
/** A strict ISO 8601 instant, normalized to UTC; an impossible calendar date (2026-02-30) or anything else → null. */
export function strictInstant(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = INSTANT.exec(v);
  if (!m || epochDay(m[1]!) == null) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** An anchor period at least this long counts as an annual filed figure for the proxy. The floor is the extraction
 *  layer's own (companyfacts `isAnnual` accepts 350–380 days), so 52-week fiscal years qualify. */
export const PROXY_ANCHOR_MIN_DAYS = 350;

/**
 * us-gaap concept families whose positive amounts are non-revenue credits that can sit INSIDE filed operating
 * income: equity-method income and gains on disposition of assets. Within a family the concepts are alternative
 * tags of the same line (the largest counts); across families they are distinct lines (they sum). A negative
 * amount is a loss — a charge that already reduced operating income — never a credit, so it is not subtracted.
 */
export const PROXY_CREDIT_FAMILIES: ReadonlyArray<readonly string[]> = [
  ["IncomeLossFromEquityMethodInvestments", "IncomeLossFromEquityMethodInvestmentsNetOfDividendsOrDistributions"],
  ["GainLossOnDispositionOfAssets", "GainLossOnSaleOfPropertyPlantEquipment", "GainLossOnDispositionOfAssets1"],
];

/** The financials a reconciliation entry's filed figure came from (matched exactly on the filed row), or null. */
function sourceFinancials(fins: ReadonlyArray<IssuerFinancials | null | undefined>, entry: ReconciliationEntry): IssuerFinancials | null {
  for (const f of fins) {
    if (!f) continue;
    if (f.values.some((v) => v.metric === entry.metric && v.periodStart === entry.periodStart && v.periodEnd === entry.periodEnd && v.value === entry.filing.value && v.accession === entry.filing.accession)) return f;
  }
  return null;
}

/** Tagged non-revenue credits inside filed operating income for one exact period, from `fin` (0 when unattributed). */
function taggedCredits(fin: IssuerFinancials | null, periodStart: string, periodEnd: string): bigint {
  if (!fin) return 0n;
  let total = 0n;
  for (const family of PROXY_CREDIT_FAMILIES) {
    let best = 0n;
    for (const v of fin.values) {
      if (v.metric !== "item" || v.periodStart !== periodStart || v.periodEnd !== periodEnd || !family.includes(v.concept) || !/^-?\d+$/.test(v.value)) continue;
      const x = BigInt(v.value);
      if (x > best) best = x;
    }
    total += best;
  }
  return total;
}

/**
 * The EBITDA proxy from the filings: operating income NET of its tagged non-revenue credits, plus D&A — each a
 * strong anchor (same connection as the ERP revenue, >= 75% window coverage, material, within 50 bps) filed over
 * an ANNUAL period. The best-covering anchor per metric is used. MISSING when either metric has no such anchor,
 * when an anchor is not an annual figure (the proxy is an LTM-shaped figure; a shorter filed period is never
 * annualized up to the window), when the adjusted sum is not positive, or when the adjusted proxy still exceeds
 * a filed revenue for the anchor's period (a credit inside operating income that the filings do not tag — the
 * decomposition the bound needs is missing, so the answer is NEEDS_INPUT, not a number).
 */
export function ebitdaProxyFor(admitted: readonly AdmittedErpFact[], reconciliation: readonly ReconciliationEntry[], periodEnd: string, fins: ReadonlyArray<IssuerFinancials | null | undefined> = []): ErpEbitdaProxy {
  const w = ltmWindow(periodEnd);
  if (!w) return { status: "MISSING", reason: `period end ${periodEnd} is not an ISO date` };
  const rev = sumOverWindow(admitted, "revenue", w.start, w.end);
  if (!rev.ok) return { status: "MISSING", reason: `no ERP revenue connection for ${w.start}..${w.end}: ${rev.reason}` };
  const ltmDays = epochDay(w.end)! - epochDay(w.start)! + 1;
  const anchors = qualifyingAnchors(reconciliation, rev, w, ltmDays);
  const pick = (m: ErpEvidenceMetric) => anchors.filter((a) => a.entry.metric === m)
    .sort((a, b) => (epochDay(b.entry.periodEnd)! - epochDay(b.entry.periodStart)!) - (epochDay(a.entry.periodEnd)! - epochDay(a.entry.periodStart)!) || b.entry.periodEnd.localeCompare(a.entry.periodEnd))[0];
  const oi = pick("operatingIncome"), da = pick("depreciationAmortization");
  if (!oi || !da) return { status: "MISSING", reason: `no reconciled filed ${!oi ? "operating income" : "D&A"} from this ERP connection covers the LTM window` };
  for (const a of [oi, da]) {
    if (a.days >= PROXY_ANCHOR_MIN_DAYS) continue;
    const gaps: string[] = [];
    if (a.entry.periodStart > w.start) gaps.push(`${w.start}..${isoOfDay(epochDay(a.entry.periodStart)! - 1)}`);
    if (a.entry.periodEnd < w.end) gaps.push(`${isoOfDay(epochDay(a.entry.periodEnd)! + 1)}..${w.end}`);
    return { status: "MISSING", reason: `filed ${a.entry.metric} is not an annual figure for the LTM window: the best anchor covers ${a.days} of ${ltmDays} days (${a.entry.periodStart}..${a.entry.periodEnd})${gaps.length ? `, leaving ${gaps.join(" and ")} uncovered` : ""}; the EBITDA proxy needs a full 12 months of filed ${a.entry.metric} and is never annualized from a shorter period (NEEDS_INPUT: 12 months of filed ${a.entry.metric})` };
  }
  const signed = (a: { entry: ReconciliationEntry; scaled: bigint }) => (BigInt(a.entry.filing.value) < 0n ? -a.scaled : a.scaled);
  const oiFiled = signed(oi), daFiled = signed(da);
  // Filed operating income can contain non-revenue credits (operating gains, equity-method income): they are not
  // revenue, so OI + D&A is NOT bounded by revenue until they are removed. Subtract the tagged credits the
  // filings carry for the anchor's exact period.
  const oiFin = sourceFinancials(fins, oi.entry);
  const credits = taggedCredits(oiFin, oi.entry.periodStart, oi.entry.periodEnd);
  const v = oiFiled - credits + daFiled;
  if (v <= 0n) return { status: "MISSING", reason: `reconciled filed OI net of tagged non-revenue credits + D&A is ${v}; it cannot bound an add-back` };
  // What cannot be subtracted cannot be bounded: when the same filings carry a revenue for the anchor's period
  // and the adjusted proxy still exceeds it, a credit inside operating income is untagged — the decomposition
  // is missing and no sound proxy exists for this period.
  const filedRevenue = oiFin?.values.find((x) => x.metric === "revenue" && x.periodStart === oi.entry.periodStart && x.periodEnd === oi.entry.periodEnd && /^-?\d+$/.test(x.value));
  if (filedRevenue && v > BigInt(filedRevenue.value)) return { status: "MISSING", reason: `filed operating income + D&A for ${oi.entry.periodStart}..${oi.entry.periodEnd} exceeds the period's filed revenue (${filedRevenue.value}) even after subtracting ${credits} of tagged gains/equity income; a non-revenue credit inside operating income is not tagged in the filings, so the decomposition the proxy bound needs is missing (NEEDS_INPUT: operating income decomposition)` };
  return { status: "RECONCILED", value: v.toString(), operatingIncome: oiFiled.toString(), depreciationAmortization: daFiled.toString(), creditsSubtracted: credits.toString(), provider: rev.provider, connectionId: rev.connectionId, periods: [oi, da].map((a) => `${a.entry.metric} ${a.entry.periodStart}..${a.entry.periodEnd}`) };
}

/** Build the box's ERP evidence. With no facts there is nothing to say: callers omit the field. */
export function erpEvidenceForBox(input: ErpEvidenceInput): ErpEvidence {
  const { admitted, rejected } = admitErpFacts(input.facts, input.companyId);
  const reconciliation = reconcileErpWithFilings(admitted, [input.financials, input.priorFinancials], input.options);
  const unreconciledPeriods = reconciliation.filter((r) => r.status === "UNRECONCILED").length;
  const fetchedAt = strictInstant(input.fetchedAt);
  const common = { fetchedAt, reconciliation, unreconciledPeriods, rejected: rejected.slice(0, 50), rejectedCount: rejected.length };
  if (!input.periodEnd || epochDay(input.periodEnd) == null) {
    return { status: "NO_PERIOD", asOf: null, suggestions: [], ebitdaProxy: { status: "MISSING", reason: "no filing period" }, ...common, note: "no filing period to anchor an LTM window; ERP figures are shown only as reconciliation" };
  }
  const suggestions: ErpSuggestion[] = [];
  for (const m of CONFIRMABLE_ERP_METRICS) if (!filedHas(input.financials, m)) suggestions.push(suggestLtm(admitted, reconciliation, m, input.periodEnd, true));
  if (input.baseNeedsEvidence) for (const m of BASE_COMPONENT_METRICS) suggestions.push(suggestLtm(admitted, reconciliation, m, input.periodEnd, false));
  return {
    status: "READY", asOf: input.periodEnd, suggestions, ebitdaProxy: ebitdaProxyFor(admitted, reconciliation, input.periodEnd, [input.financials, input.priorFinancials]), ...common,
    note: unreconciledPeriods ? `${unreconciledPeriods} filed period(s) do not reconcile with the ERP; overlapping ERP suggestions are blocked` : "ERP figures are evidence; nothing counts until the CFO confirms it",
  };
}
