/**
 * ERP vs filing reconciliation, per period and metric, and the exact period sum both it and the LTM suggestions use.
 *
 * Sum over a window: only admitted facts (see contract.ts) fully inside the window count; facts for the same metric and
 * the same period are summed (several accounts map to one metric); the period buckets must tile the window exactly
 * (contiguous, no gaps). Monthly and quarterly buckets may both be present: every tiling is tried and they must agree,
 * otherwise the window is AMBIGUOUS. Facts from more than one connection are never added together (two ERPs may mirror
 * the same entity). Nothing is interpolated, annualized or pro-rated.
 *
 * Reconciliation compares that sum with each filed flow figure (10-K/10-Q, from XBRL) for the same metric and period.
 * Out of tolerance → UNRECONCILED, and when the gap is a clean 1,000× / 1,000,000× (thousands or millions read as
 * dollars, either side) or a sign flip, the code says so. An UNRECONCILED period blocks every ERP suggestion whose window
 * overlaps it (a scale error is systemic, not per metric).
 */
import type { FinancialValue, IssuerFinancials } from "../xbrl/companyfacts";
import { ERP_FLOW_METRICS, epochDay, isoOfDay, type AdmittedErpFact, type ErpEvidenceMetric } from "./contract";

export type WindowSum =
  | { ok: true; value: bigint; refs: string[]; provider: string; connectionId: string }
  | { ok: false; code: "NO_ERP_FACTS" | "MULTIPLE_CONNECTIONS" | "DO_NOT_TILE" | "AMBIGUOUS_OVERLAP"; reason: string };

const MAX_TILINGS = 256;

/** Exact sum of `metric` over [startIso, endIso] (inclusive) from admitted facts, or why it cannot be formed. */
export function sumOverWindow(facts: readonly AdmittedErpFact[], metric: ErpEvidenceMetric, startIso: string, endIso: string): WindowSum {
  const start = epochDay(startIso), end = epochDay(endIso);
  if (start == null || end == null || start > end) return { ok: false, code: "DO_NOT_TILE", reason: `window ${startIso}..${endIso} is not a valid date range` };
  const inside = facts.filter((f) => f.metric === metric && epochDay(f.fact.periodStart)! >= start && epochDay(f.fact.periodEnd)! <= end);
  if (!inside.length) return { ok: false, code: "NO_ERP_FACTS", reason: `no ERP ${metric} facts inside ${startIso}..${endIso}` };
  const conns = new Set(inside.map((f) => `${f.fact.provider}:${f.fact.connectionId}`));
  if (conns.size > 1) return { ok: false, code: "MULTIPLE_CONNECTIONS", reason: `ERP ${metric} facts come from ${conns.size} connections; they are never added together` };
  const buckets = new Map<string, { s: number; e: number; sum: bigint; refs: string[] }>();
  for (const f of inside) {
    const s = epochDay(f.fact.periodStart)!, e = epochDay(f.fact.periodEnd)!;
    const b = buckets.get(`${s}|${e}`) ?? { s, e, sum: 0n, refs: [] };
    b.sum += f.value; b.refs.push(f.ref);
    buckets.set(`${s}|${e}`, b);
  }
  const byStart = new Map<number, Array<{ s: number; e: number; sum: bigint; refs: string[] }>>();
  for (const b of buckets.values()) byStart.set(b.s, [...(byStart.get(b.s) ?? []), b]);
  const tilings: Array<{ sum: bigint; refs: string[] }> = [];
  let truncated = false;
  const walk = (at: number, sum: bigint, refs: string[]) => {
    if (tilings.length >= MAX_TILINGS) { truncated = true; return; }
    if (at === end + 1) { tilings.push({ sum, refs }); return; }
    for (const b of (byStart.get(at) ?? []).sort((x, y) => y.e - x.e)) walk(b.e + 1, sum + b.sum, [...refs, ...b.refs]);
  };
  walk(start, 0n, []);
  if (!tilings.length) {
    const covered = new Set<number>();
    for (const b of buckets.values()) for (let d = b.s; d <= b.e; d++) covered.add(d);
    let gap = start; while (gap <= end && covered.has(gap)) gap++;
    return { ok: false, code: "DO_NOT_TILE", reason: `ERP ${metric} periods do not cover ${startIso}..${endIso} contiguously${gap <= end ? ` (first uncovered day ${isoOfDay(gap)})` : ""}` };
  }
  const sums = new Set(tilings.map((t) => t.sum.toString()));
  if (sums.size > 1 || truncated) return { ok: false, code: "AMBIGUOUS_OVERLAP", reason: `overlapping ERP ${metric} periods give different totals for ${startIso}..${endIso}` };
  return { ok: true, value: tilings[0]!.sum, refs: [...new Set(tilings[0]!.refs)].sort(), provider: inside[0]!.fact.provider, connectionId: inside[0]!.fact.connectionId };
}

export type ReconcileCode = "WITHIN_TOLERANCE" | "VARIANCE" | "SCALE_ERP_1000X" | "SCALE_ERP_1000000X" | "SCALE_ERP_DIV_1000" | "SCALE_ERP_DIV_1000000" | "SIGN_FLIP" | WindowSumFail;
type WindowSumFail = Extract<WindowSum, { ok: false }>["code"];

export interface ReconciliationEntry {
  metric: ErpEvidenceMetric;
  periodStart: string;
  periodEnd: string;
  status: "RECONCILED" | "UNRECONCILED" | "NOT_COMPARABLE";
  code: ReconcileCode;
  filing: { value: string; concept: string; form: string; accession: string };
  erp: { value: string | null; refs: string[] };
  /** (ERP − filing) / |filing| in basis points, truncated; null when not comparable or the filing figure is 0. */
  deltaBps: string | null;
  note: string;
}

export interface ReconcileOptions {
  /** Relative tolerance in basis points (default 50 = 0.5%). */
  toleranceBps?: bigint;
  /** Absolute tolerance in USD for rounding in filings reported in thousands (default 1,000). */
  toleranceUsd?: bigint;
}

const abs = (x: bigint) => (x < 0n ? -x : x);
/** |a − b| within tolBps of |b|. */
const near = (a: bigint, b: bigint, tolBps: bigint) => abs(a - b) * 10_000n <= tolBps * abs(b);

/** Filed flow figures with a bounded period (the only ones a period sum can be compared to). */
function filedFlows(fins: ReadonlyArray<IssuerFinancials | null | undefined>): FinancialValue[] {
  const seen = new Set<string>();
  const out: FinancialValue[] = [];
  for (const fin of fins) for (const v of fin?.values ?? []) {
    if (!(ERP_FLOW_METRICS as readonly string[]).includes(v.metric) || !v.periodStart || !/^-?\d+$/.test(v.value)) continue;
    if (epochDay(v.periodStart) == null || epochDay(v.periodEnd) == null) continue;
    const k = `${v.metric}|${v.periodStart}|${v.periodEnd}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(v);
  }
  return out;
}

export function reconcileErpWithFilings(facts: readonly AdmittedErpFact[], fins: ReadonlyArray<IssuerFinancials | null | undefined>, opts: ReconcileOptions = {}): ReconciliationEntry[] {
  const tolBps = opts.toleranceBps ?? 50n, tolUsd = opts.toleranceUsd ?? 1_000n;
  return filedFlows(fins).map((v): ReconciliationEntry => {
    const metric = v.metric as ErpEvidenceMetric;
    const filing = BigInt(v.value);
    const base = { metric, periodStart: v.periodStart!, periodEnd: v.periodEnd, filing: { value: v.value, concept: v.concept, form: v.form, accession: v.accession } };
    const s = sumOverWindow(facts, metric, v.periodStart!, v.periodEnd);
    if (!s.ok) return { ...base, status: "NOT_COMPARABLE", code: s.code, erp: { value: null, refs: [] }, deltaBps: null, note: s.reason };
    const erp = s.value;
    const deltaBps = filing !== 0n ? (((erp - filing) * 10_000n) / abs(filing)).toString() : null;
    const out = (status: ReconciliationEntry["status"], code: ReconcileCode, note: string): ReconciliationEntry => ({ ...base, status, code, erp: { value: erp.toString(), refs: s.refs }, deltaBps, note });
    if (abs(erp - filing) <= tolUsd || near(erp, filing, tolBps)) return out("RECONCILED", "WITHIN_TOLERANCE", `ERP ${metric} matches the ${v.form} figure within tolerance`);
    if (abs(filing) >= 1_000n && abs(erp) >= 1_000n) {
      for (const [k, hi, lo] of [[1_000n, "SCALE_ERP_1000X", "SCALE_ERP_DIV_1000"], [1_000_000n, "SCALE_ERP_1000000X", "SCALE_ERP_DIV_1000000"]] as const) {
        if (near(erp, filing * k, tolBps)) return out("UNRECONCILED", hi, `ERP ${metric} is ${k}× the ${v.form} figure: a units error (thousands/millions read as dollars) on one side`);
        if (near(erp * k, filing, tolBps)) return out("UNRECONCILED", lo, `ERP ${metric} is 1/${k} of the ${v.form} figure: a units error (dollars read as thousands/millions) on one side`);
      }
      if (near(-erp, filing, tolBps)) return out("UNRECONCILED", "SIGN_FLIP", `ERP ${metric} has the opposite sign of the ${v.form} figure`);
    }
    return out("UNRECONCILED", "VARIANCE", `ERP ${metric} differs from the ${v.form} figure by ${deltaBps ?? "n/a"} bps (tolerance ${tolBps} bps)`);
  });
}

/** True when [aStart, aEnd] and [bStart, bEnd] share at least one day. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return epochDay(aStart)! <= epochDay(bEnd)! && epochDay(bStart)! <= epochDay(aEnd)!;
}
