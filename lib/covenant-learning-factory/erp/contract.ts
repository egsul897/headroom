/**
 * ERP evidence contract for the EBITDA box (product side of the ERP link).
 *
 * The box never reads a provider payload. It reads ErpEvidenceFact: one figure for one Headroom metric over one posted
 * period, produced by ERP-1's canonical mapping from the ERP-3 adapter's normalized facts (PR #406,
 * lib/connectors/erp/types.ts ErpFinancialFact: provenance + amount + currency + period). This file only declares the
 * shape the box consumes plus the seam ERP-1 implements (ErpEvidenceSource); it imports nothing from #406 so it compiles
 * before ERP-1/2 land. Until a source is registered, production has NO ERP facts (NO_ERP_EVIDENCE) — nothing is ever
 * synthesized here.
 *
 * Admission is fail-closed: a fact is usable only if it is provably USD, whole-dollar at scale 1, period-bounded
 * (posted activity between two ISO dates), in the filing sign convention, mapped to a metric, and owned by the company
 * being computed. Anything else is reported (rejected with a code), never coerced, rounded or rescaled.
 */
import type { HeadroomInput } from "../xbrl/companyfacts";

/** Flow metrics an ERP period fact may carry (the income-statement inputs the box and its plausibility bounds use). */
export const ERP_FLOW_METRICS = ["revenue", "netIncome", "interestExpense", "incomeTaxes", "depreciationAmortization", "operatingIncome"] as const satisfies readonly HeadroomInput[];
export type ErpEvidenceMetric = (typeof ERP_FLOW_METRICS)[number];

export interface ErpEvidenceFact {
  source: "ERP";
  /** Provider kind as named by the adapter registry, e.g. "NETSUITE". */
  provider: string;
  /** Headroom connection id (CompanySourceConnection). */
  connectionId: string;
  /** Company the connection belongs to, resolved server-side from the connection row (never from a request). */
  companyId: string;
  /** Provider-stable id of the underlying aggregate (e.g. account:<id>:<ccy>:<period>). */
  externalId: string;
  /** ERP-1's mapping of the account(s) to a Headroom metric; null = not mapped (never guessed here). */
  metric: ErpEvidenceMetric | null;
  /** POSTED_PERIOD: posting transactions only, bounded by periodStart..periodEnd. Anything else is not a period figure. */
  basis: "POSTED_PERIOD" | "CUMULATIVE_UNSCOPED";
  /** Inclusive ISO dates (YYYY-MM-DD). */
  periodStart: string;
  periodEnd: string;
  /** Exact decimal string as delivered (no thousands separators, no exponent, no hex). */
  amount: string;
  /** ISO 4217. */
  currency: string;
  /** Multiplier the amount is stated in: 1 = whole currency units. Anything but 1 is refused (never rescaled). */
  scale: number;
  /** FILING: revenue and expenses positive, income signed as in a 10-K/10-Q. Debit/credit-signed GL amounts are refused. */
  signConvention: "FILING" | "DEBIT_CREDIT";
}

/** The seam ERP-1 implements: period facts for one company (already tenant-scoped by the caller's server context). */
export interface ErpEvidenceSource {
  listPeriodFacts(companyId: string): Promise<readonly ErpEvidenceFact[]>;
}

/** Production default until ERP-1 registers a source: no facts, so the box carries no ERP evidence at all. */
export const NO_ERP_EVIDENCE: ErpEvidenceSource = { listPeriodFacts: async () => [] };

let registered: ErpEvidenceSource = NO_ERP_EVIDENCE;
/** ERP-1 registers its source at the composition root; tests may register a fixture source. */
export function registerErpEvidenceSource(s: ErpEvidenceSource | null): void { registered = s ?? NO_ERP_EVIDENCE; }
export function erpEvidenceSource(): ErpEvidenceSource { return registered; }

export type ErpRejectCode =
  | "COMPANY_MISMATCH" | "NOT_ERP" | "BAD_PROVENANCE" | "UNMAPPED" | "NOT_PERIOD_BOUNDED" | "BAD_PERIOD"
  | "NON_USD" | "SCALE" | "NOT_DECIMAL" | "FRACTIONAL" | "SIGN_CONVENTION" | "CONFLICTING_DUPLICATE";

export interface AdmittedErpFact {
  fact: ErpEvidenceFact;
  metric: ErpEvidenceMetric;
  /** Whole USD. */
  value: bigint;
  /** erp:<PROVIDER>:<connectionId>:<externalId>@<periodEnd> */
  ref: string;
}

export interface RejectedErpFact { ref: string | null; code: ErpRejectCode; reason: string }

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Strict ISO date → epoch day (UTC), or null when not a real calendar date. */
export function epochDay(s: string): number | null {
  const m = ISO_DATE.exec(s);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = Date.UTC(y, mo - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return t / 86_400_000;
}
export const isoOfDay = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:\-]{0,199}$/;
export const erpRef = (f: Pick<ErpEvidenceFact, "provider" | "connectionId" | "externalId" | "periodEnd">) => `erp:${f.provider}:${f.connectionId}:${f.externalId}@${f.periodEnd}`;

/** Admit one fact for `companyId`, or say exactly why not. Never coerces. */
export function admitErpFact(f: ErpEvidenceFact, companyId: string): { ok: true; fact: AdmittedErpFact } | { ok: false; rejected: RejectedErpFact } {
  const provOk = typeof f?.provider === "string" && /^[A-Z][A-Z0-9_]{1,39}$/.test(f.provider) && typeof f.connectionId === "string" && TOKEN.test(f.connectionId) && typeof f.externalId === "string" && TOKEN.test(f.externalId);
  const ref = provOk && typeof f.periodEnd === "string" ? erpRef(f) : null;
  const no = (code: ErpRejectCode, reason: string) => ({ ok: false as const, rejected: { ref, code, reason } });
  if (!f || f.source !== "ERP") return no("NOT_ERP", "not an ERP fact");
  if (!provOk) return no("BAD_PROVENANCE", "provider / connectionId / externalId missing or malformed");
  if (f.companyId !== companyId) return no("COMPANY_MISMATCH", "fact belongs to a different company");
  if (f.metric == null || !(ERP_FLOW_METRICS as readonly string[]).includes(f.metric)) return no("UNMAPPED", "account not mapped to a Headroom metric");
  if (f.basis !== "POSTED_PERIOD") return no("NOT_PERIOD_BOUNDED", "not posted activity for a bounded period (cumulative or unscoped)");
  const s = epochDay(f.periodStart), e = epochDay(f.periodEnd);
  if (s == null || e == null || s > e) return no("BAD_PERIOD", "periodStart/periodEnd are not ISO dates with start <= end");
  if (f.currency !== "USD") return no("NON_USD", `currency ${JSON.stringify(f.currency)} is not USD (no FX conversion is applied)`);
  if (f.scale !== 1) return no("SCALE", `amount is stated at scale ${JSON.stringify(f.scale)}; only whole units (scale 1) are accepted`);
  if (f.signConvention !== "FILING") return no("SIGN_CONVENTION", "amount is not in the filing sign convention");
  const m = typeof f.amount === "string" ? /^(-?)(\d{1,15})(?:\.(\d{1,6}))?$/.exec(f.amount) : null;
  if (!m) return no("NOT_DECIMAL", "amount is not a plain decimal string");
  if (m[3] && /[1-9]/.test(m[3])) return no("FRACTIONAL", "amount has cents; the box takes whole USD and never rounds");
  const v = BigInt(m[2]!);
  return { ok: true, fact: { fact: f, metric: f.metric, value: m[1] === "-" ? -v : v, ref: ref! } };
}

/** Admit a batch: dedupe exact re-deliveries (same ref and value); a ref delivered with two values is a conflict. */
export function admitErpFacts(facts: readonly ErpEvidenceFact[], companyId: string): { admitted: AdmittedErpFact[]; rejected: RejectedErpFact[] } {
  const byRef = new Map<string, AdmittedErpFact>();
  const conflicted = new Set<string>();
  const rejected: RejectedErpFact[] = [];
  for (const f of facts) {
    const r = admitErpFact(f, companyId);
    if (!r.ok) { rejected.push(r.rejected); continue; }
    const k = `${r.fact.ref}|${r.fact.metric}|${r.fact.fact.periodStart}`;
    const prev = byRef.get(k);
    if (prev && prev.value !== r.fact.value) conflicted.add(k);
    else if (!prev) byRef.set(k, r.fact);
  }
  for (const k of conflicted) {
    const p = byRef.get(k)!;
    byRef.delete(k);
    rejected.push({ ref: p.ref, code: "CONFLICTING_DUPLICATE", reason: "the same ERP record was delivered with two different amounts" });
  }
  return { admitted: [...byRef.values()], rejected };
}
