/**
 * ERP evidence for the EBITDA box: admission (USD, scale 1, whole dollars, posted periods, filing sign, own company),
 * exact window sums, reconciliation against filings (1000x unit errors caught), LTM suggestions, and the CFO
 * BASE_METRIC confirm that resolves NEEDS_BASE. Every ERP figure here is a TEST FIXTURE; production has no ERP source
 * until ERP-1 registers one.
 */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { admitErpFact, admitErpFacts, erpEvidenceSource, NO_ERP_EVIDENCE, registerErpEvidenceSource, type ErpEvidenceFact } from "@/lib/covenant-learning-factory/erp/contract";
import { reconcileErpWithFilings, sumOverWindow } from "@/lib/covenant-learning-factory/erp/reconcile";
import { erpEvidenceForBox, ltmWindow } from "@/lib/covenant-learning-factory/erp/suggest";
import { computeEbitdaBox, confirmEbitdaItem, MAX_CONFIRMED_USD, refreshBoxCommitted, type BoxArgs } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import { companyErpFacts } from "@/lib/covenant-learning-factory/pipeline/ebitda-box-server";
import type { FinancialValue, IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";
import { M, args, fakeStore, fin } from "./ebitda-box-fixture";

const C = "c1";
const scope = { companyId: C, documentId: "d1" };
const fact = (p: Partial<ErpEvidenceFact>): ErpEvidenceFact => ({
  source: "ERP", provider: "NETSUITE", connectionId: "conn1", companyId: C, externalId: "account:4000:USD:2025-07", metric: "revenue",
  basis: "POSTED_PERIOD", periodStart: "2025-07-01", periodEnd: "2025-07-31", amount: "1000000", currency: "USD", scale: 1, signConvention: "FILING", ...p,
});
const MONTHS = ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
/** 12 monthly facts for `metric` (one account), each `each` dollars. */
const monthly = (metric: ErpEvidenceFact["metric"], each: number, account = "4000", extra: Partial<ErpEvidenceFact> = {}) =>
  MONTHS.map((ym) => fact({ metric, externalId: `account:${account}:USD:${ym}`, periodStart: `${ym}-01`, periodEnd: lastDay(ym), amount: String(each), ...extra }));
const flow = (metric: FinancialValue["metric"], value: number, start = "2025-07-01", end = "2026-06-30"): FinancialValue =>
  ({ metric, concept: "test", periodType: "TTM", periodStart: start, periodEnd: end, value: String(value), unit: "USD", accession: "0000-test", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const withFin = (patch: Partial<IssuerFinancials>): IssuerFinancials => ({ ...fin, ...patch });

describe("admission is fail-closed (never coerced, rounded or rescaled)", () => {
  const code = (p: Partial<ErpEvidenceFact>) => { const r = admitErpFact(fact(p), C); return r.ok ? "OK" : r.rejected.code; };
  it("accepts a whole-USD posted-period fact in filing sign, and builds the erp: reference", () => {
    const r = admitErpFact(fact({}), C);
    expect(r.ok && r.fact.value).toBe(1_000_000n);
    expect(r.ok && r.fact.ref).toBe("erp:NETSUITE:conn1:account:4000:USD:2025-07@2025-07-31");
    expect(code({ amount: "1000000.00" })).toBe("OK");
    expect(code({ amount: "-250" })).toBe("OK");
  });
  it("refuses non-USD, scale != 1, cents, and non-plain decimals", () => {
    expect(code({ currency: "EUR" })).toBe("NON_USD");
    expect(code({ scale: 1000 })).toBe("SCALE");
    expect(code({ amount: "1000000.01" })).toBe("FRACTIONAL");
    for (const a of ["0x1A", "1e3", "1,234", " 12", "", "Infinity"]) expect(code({ amount: a })).toBe("NOT_DECIMAL");
  });
  it("refuses another company's fact, unmapped accounts, cumulative balances, GL signs and impossible dates", () => {
    expect(code({ companyId: "other" })).toBe("COMPANY_MISMATCH");
    expect(code({ metric: null })).toBe("UNMAPPED");
    expect(code({ basis: "CUMULATIVE_UNSCOPED" })).toBe("NOT_PERIOD_BOUNDED");
    expect(code({ signConvention: "DEBIT_CREDIT" })).toBe("SIGN_CONVENTION");
    expect(code({ periodEnd: "2026-02-30" })).toBe("BAD_PERIOD");
    expect(code({ periodStart: "07/01/2025" })).toBe("BAD_PERIOD");
    expect(code({ periodStart: "2025-08-01", periodEnd: "2025-07-31" })).toBe("BAD_PERIOD");
    expect(code({ connectionId: "evil host/x" })).toBe("BAD_PROVENANCE");
  });
  it("dedupes an exact re-delivery; the same record with two amounts is a conflict and is dropped", () => {
    expect(admitErpFacts([fact({}), fact({})], C).admitted).toHaveLength(1);
    const r = admitErpFacts([fact({}), fact({ amount: "2" })], C);
    expect(r.admitted).toHaveLength(0);
    expect(r.rejected[0]?.code).toBe("CONFLICTING_DUPLICATE");
  });
});

describe("exact window sums", () => {
  const adm = (fs: ErpEvidenceFact[]) => admitErpFacts(fs, C).admitted;
  it("sums accounts per period and tiles the window", () => {
    const s = sumOverWindow(adm([...monthly("revenue", 20 * M), ...monthly("revenue", 5 * M, "4100")]), "revenue", "2025-07-01", "2026-06-30");
    expect(s.ok && s.value).toBe(BigInt(300 * M));
    expect(s.ok && s.refs).toHaveLength(24);
  });
  it("a missing month is a gap, never interpolated", () => {
    const s = sumOverWindow(adm(monthly("revenue", 20 * M).filter((f) => !f.periodStart.startsWith("2026-02"))), "revenue", "2025-07-01", "2026-06-30");
    expect(s).toMatchObject({ ok: false, code: "DO_NOT_TILE" });
    expect(!s.ok && s.reason).toMatch(/2026-02-01/);
  });
  it("monthly and quarterly buckets must agree; otherwise AMBIGUOUS", () => {
    const q = (amount: string) => fact({ externalId: "q3", periodStart: "2025-07-01", periodEnd: "2025-09-30", amount });
    expect(sumOverWindow(adm([...monthly("revenue", 20 * M), q(String(60 * M))]), "revenue", "2025-07-01", "2026-06-30")).toMatchObject({ ok: true, value: BigInt(240 * M) });
    expect(sumOverWindow(adm([...monthly("revenue", 20 * M), q(String(61 * M))]), "revenue", "2025-07-01", "2026-06-30")).toMatchObject({ ok: false, code: "AMBIGUOUS_OVERLAP" });
  });
  it("pathological overlaps answer AMBIGUOUS within a bounded search", () => {
    const days: ErpEvidenceFact[] = [];
    for (let d = 1; d <= 28; d++) for (const len of [0, 1]) if (d + len <= 31) days.push(fact({ externalId: `d${d}-${len}`, periodStart: `2025-07-${String(d).padStart(2, "0")}`, periodEnd: `2025-07-${String(d + len).padStart(2, "0")}`, amount: String(d) }));
    expect(sumOverWindow(adm(days), "revenue", "2025-07-01", "2025-07-31")).toMatchObject({ ok: false });
  });
  it("never adds two connections together", () => {
    const s = sumOverWindow(adm([...monthly("revenue", 20 * M), ...monthly("revenue", 20 * M, "4000", { connectionId: "conn2" })]), "revenue", "2025-07-01", "2026-06-30");
    expect(s).toMatchObject({ ok: false, code: "MULTIPLE_CONNECTIONS" });
  });
});

describe("reconciliation against filings", () => {
  const rec = (erp: number, filed: number, metric: FinancialValue["metric"] = "netIncome") =>
    reconcileErpWithFilings(admitErpFacts(monthly(metric as ErpEvidenceFact["metric"], erp / 12), C).admitted, [withFin({ values: [...fin.values, flow(metric, filed)] })])[0]!;
  it("within tolerance → RECONCILED", () => expect(rec(120 * M, 120 * M + 12_000)).toMatchObject({ status: "RECONCILED", code: "WITHIN_TOLERANCE" }));
  it("thousands read as dollars (1000x) → UNRECONCILED with the scale code, both directions", () => {
    expect(rec(120_000 * M, 120 * M)).toMatchObject({ status: "UNRECONCILED", code: "SCALE_ERP_1000X" });
    expect(rec(120_000, 120 * M)).toMatchObject({ status: "UNRECONCILED", code: "SCALE_ERP_DIV_1000" });
    expect(rec(120 * M, 120_000 * M)).toMatchObject({ status: "UNRECONCILED", code: "SCALE_ERP_DIV_1000" });
  });
  it("sign flip and plain variance are named", () => {
    expect(rec(-120 * M, 120 * M)).toMatchObject({ status: "UNRECONCILED", code: "SIGN_FLIP" });
    expect(rec(132 * M, 120 * M)).toMatchObject({ status: "UNRECONCILED", code: "VARIANCE", deltaBps: "1000" });
  });
  it("a fractional ERP amount is refused, so the period is NOT_COMPARABLE rather than rounded", () => {
    expect(rec(130 * M, 120 * M)).toMatchObject({ status: "NOT_COMPARABLE", code: "NO_ERP_FACTS" });
  });
  it("no ERP coverage → NOT_COMPARABLE (not a pass)", () => {
    const r = reconcileErpWithFilings([], [withFin({ values: [...fin.values, flow("netIncome", 1)] })]);
    expect(r[0]).toMatchObject({ status: "NOT_COMPARABLE", code: "NO_ERP_FACTS" });
  });
});

describe("LTM suggestions", () => {
  it("LTM window ends on the period end", () => {
    expect(ltmWindow("2026-06-30")).toEqual({ start: "2025-07-01", end: "2026-06-30" });
    expect(ltmWindow("2028-02-29")).toEqual({ start: "2027-03-01", end: "2028-02-29" });
  });
  const ev = (facts: ErpEvidenceFact[], f: IssuerFinancials = fin, baseNeedsEvidence = true) => erpEvidenceForBox({ companyId: C, facts, financials: f, periodEnd: "2026-06-30", baseNeedsEvidence });
  // A reconciled anchor: filed TTM net income −$12M matched by ERP net income −$1M/month.
  const anchored = withFin({ values: [...fin.values, flow("netIncome", -12 * M)] });
  it("suggests revenue only when the filings lack it; components are evidence-only", () => {
    const e = ev([...monthly("revenue", 25 * M), ...monthly("netIncome", -1 * M)], anchored);
    const rev = e.suggestions.find((s) => s.metric === "revenue")!;
    expect(rev).toMatchObject({ status: "SUGGESTED", value: String(300 * M), confirmable: true, inputKey: "METRIC:REVENUE" });
    expect(rev.sourceRef).toMatch(/^erp:NETSUITE:conn1:ltm\.revenue\.[0-9a-f]{16}@2026-06-30$/);
    expect(e.suggestions.find((s) => s.metric === "netIncome")).toMatchObject({ status: "SUGGESTED", confirmable: false, inputKey: null });
    expect(e.suggestions.find((s) => s.metric === "interestExpense")).toMatchObject({ status: "NEEDS_INPUT", value: null });
    expect(ev(monthly("revenue", 25 * M), withFin({ values: [...fin.values, flow("revenue", 300 * M)] })).suggestions.some((s) => s.metric === "revenue")).toBe(false);
  });
  it("(1) revenue is not confirmable without a RECONCILED filed flow overlapping the window", () => {
    const e = ev([...monthly("revenue", 25 * M), ...monthly("netIncome", -1 * M)]); // no filed flow at all
    expect(e.suggestions.find((s) => s.metric === "revenue")).toMatchObject({ status: "NEEDS_INPUT", value: null, confirmable: false });
    expect(e.suggestions.find((s) => s.metric === "revenue")?.reason).toMatch(/strongly enough to anchor/);
    const notOverlapping = withFin({ values: [...fin.values, flow("netIncome", -1 * M, "2024-07-01", "2024-07-31")] });
    const e2 = ev([...monthly("revenue", 25 * M), fact({ metric: "netIncome", externalId: "ni-2024-07", periodStart: "2024-07-01", periodEnd: "2024-07-31", amount: String(-1 * M) })], notOverlapping);
    expect(e2.reconciliation[0]?.status).toBe("RECONCILED");
    expect(e2.suggestions.find((s) => s.metric === "revenue")?.status).toBe("NEEDS_INPUT");
  });
  describe("(1b) the anchor must be strong: each weak-anchor attack leaves revenue NEEDS_INPUT", () => {
    const REV = () => monthly("revenue", 25 * M);
    const revOf = (facts: ErpEvidenceFact[], f: IssuerFinancials) => { const e = ev(facts, f); return { e, r: e.suggestions.find((x) => x.metric === "revenue")! }; };
    it("a $500 taxes flow reconciled only on the $1k absolute tolerance", () => {
      const { e, r } = revOf([...REV(), ...monthly("incomeTaxes", 100, "7000")], withFin({ values: [...fin.values, flow("incomeTaxes", 500)] }));
      expect(e.reconciliation.find((x) => x.metric === "incomeTaxes")?.status).toBe("RECONCILED"); // 1,200 vs 500: inside $1k
      expect(r).toMatchObject({ status: "NEEDS_INPUT", value: null });
    });
    it("a 0-vs-0 flow", () => {
      const { e, r } = revOf([...REV(), ...monthly("operatingIncome", 0, "8000")], withFin({ values: [...fin.values, flow("operatingIncome", 0)] }));
      expect(e.reconciliation.find((x) => x.metric === "operatingIncome")?.status).toBe("RECONCILED");
      expect(r.status).toBe("NEEDS_INPUT");
    });
    it("a quarter overlapping the window by one day; coverage must be >= 75% of LTM days", () => {
      const q = fact({ metric: "netIncome", externalId: "ni-q", periodStart: "2025-04-02", periodEnd: "2025-07-01", amount: String(-3 * M) });
      const { e, r } = revOf([...REV(), q], withFin({ values: [...fin.values, flow("netIncome", -3 * M, "2025-04-02", "2025-07-01")] }));
      expect(e.reconciliation[0]?.status).toBe("RECONCILED");
      expect(r.status).toBe("NEEDS_INPUT");
      const span = (start: string) => {
        const months = MONTHS.filter((ym) => `${ym}-01` >= start);
        const facts = months.map((ym) => fact({ metric: "netIncome", externalId: `ni:${ym}`, periodStart: `${ym}-01`, periodEnd: lastDay(ym), amount: String(-1 * M) }));
        return revOf([...REV(), ...facts], withFin({ values: [...fin.values, flow("netIncome", -months.length * M, start, "2026-06-30")] })).r.status;
      };
      expect(span("2025-10-01")).toBe("NEEDS_INPUT"); // 273 of 365 days = 74.8%
      expect(span("2025-09-01")).toBe("SUGGESTED"); // 303 of 365 days = 83%
    });
    it("an anchor from a different ERP connection", () => {
      const { e, r } = revOf([...REV(), ...monthly("netIncome", -1 * M, "9000", { connectionId: "conn2" })], anchored);
      expect(e.reconciliation.find((x) => x.metric === "netIncome")).toMatchObject({ status: "RECONCILED", erp: { connectionId: "conn2" } });
      expect(r.status).toBe("NEEDS_INPUT");
      expect(revOf([...REV(), ...monthly("netIncome", -1 * M, "9000")], anchored).r.status).toBe("SUGGESTED");
    });
  });
  it("(6) ERP LTM revenue <= 0 → NEEDS_INPUT, never a suggestion", () => {
    for (const amt of [0, -25 * M]) {
      const r = ev([...monthly("revenue", amt), ...monthly("netIncome", -1 * M)], anchored).suggestions.find((s) => s.metric === "revenue");
      expect(r).toMatchObject({ status: "NEEDS_INPUT", value: null, confirmable: false });
      expect(r?.reason).toMatch(/non-positive/);
    }
  });
  it("(1) ratio check: a reconciled filed flow above 10x the ERP revenue (12-month scaled) → NEEDS_INPUT", () => {
    // revenue accounts read at 1/1000 (thousands as dollars) while net income reconciles: $300k revenue vs $12M NI.
    const e = ev([...monthly("revenue", 25_000), ...monthly("netIncome", -1 * M)], anchored);
    expect(e.reconciliation.find((r) => r.metric === "netIncome")?.status).toBe("RECONCILED");
    expect(e.suggestions.find((s) => s.metric === "revenue")).toMatchObject({ status: "NEEDS_INPUT", value: null });
    expect(e.suggestions.find((s) => s.metric === "revenue")?.reason).toMatch(/ratio check failed/);
    expect(ev([...monthly("revenue", 25 * M), ...monthly("netIncome", -1 * M)], anchored).suggestions.find((s) => s.metric === "revenue")?.status).toBe("SUGGESTED");
  });
  it("an UNRECONCILED overlapping period blocks every suggestion", () => {
    const e = ev([...monthly("revenue", 25 * M), ...monthly("netIncome", -1000 * M)], withFin({ values: [...fin.values, flow("netIncome", -12 * M)] }));
    expect(e.unreconciledPeriods).toBe(1);
    expect(e.suggestions.find((s) => s.metric === "revenue")).toMatchObject({ status: "BLOCKED_UNRECONCILED", value: null });
  });
  it("production default has no ERP source: no facts, no evidence", async () => {
    expect(erpEvidenceSource()).toBe(NO_ERP_EVIDENCE);
    expect(await companyErpFacts(C)).toBeNull();
  });
});

describe("EBITDA box integration", () => {
  afterEach(() => registerErpEvidenceSource(null));
  // No positive base and no filed revenue: an uncapped add-back confirm is NEEDS_BASE (ebitda-review-35c7).
  const noBaseFin = withFin({ values: [...fin.values.map((v) => (v.concept === "NetIncomeLoss" ? { ...v, value: String(-10 * M) } : v)), flow("netIncome", -12 * M)] });
  /** ERP revenue $25M/month plus the net income that reconciles with the filed −$12M anchor. */
  const ERP = () => [...monthly("revenue", 25 * M), ...monthly("netIncome", -1 * M)];
  const erp = (facts: ErpEvidenceFact[]) => ({ companyId: C, facts });
  const a = (facts: ErpEvidenceFact[] | null, f: IssuerFinancials = noBaseFin): BoxArgs => ({ ...args, financials: f, erp: facts ? erp(facts) : null });
  const keyOf = (label: string) => computeEbitdaBox(a(null)).items.find((i) => i.label === label)!.inputKey;
  const revSuggestion = (x: BoxArgs) => computeEbitdaBox(x).erpEvidence!.suggestions.find((s) => s.metric === "revenue")!;

  it("no ERP facts → box payload has no erpEvidence field (unchanged)", () => {
    expect("erpEvidence" in computeEbitdaBox(args)).toBe(false);
    expect("erpEvidence" in computeEbitdaBox(a([]))).toBe(false);
  });
  it("ERP evidence never changes the totals", () => {
    const plain = computeEbitdaBox(a(null)), withErp = computeEbitdaBox(a(ERP()));
    expect(withErp.erpEvidence?.status).toBe("READY");
    expect({ ...withErp, erpEvidence: undefined }).toEqual({ ...plain, erpEvidence: undefined });
  });
  it("NEEDS_BASE → CFO confirms ERP LTM revenue (exact ref + value) → the add-back is bounded by 50% of it", async () => {
    const x = a(ERP());
    const db = fakeStore();
    expect(await confirmEbitdaItem(db, scope, x, { inputKey: keyOf("(f)"), value: String(2 * M), source: "x", confirmedBy: "cfo" })).toMatchObject({ ok: false, code: "NEEDS_BASE" });
    const s = revSuggestion(x);
    const before = computeEbitdaBox(x).totalEbitda;
    const r = await confirmEbitdaItem(db, scope, x, { inputKey: "metric:revenue", kind: "BASE_METRIC", value: s.value!, source: s.sourceRef!, confirmedBy: "cfo" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.box.totalEbitda).toBe(before);
    expect(db.rows.at(-1)).toMatchObject({ inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: String(300 * M), confirmedBy: "cfo" });
    expect(await confirmEbitdaItem(db, scope, x, { inputKey: keyOf("(f)"), value: String(150 * M + 1), source: "x", confirmedBy: "cfo" })).toMatchObject({ ok: false, code: "OUT_OF_RANGE" });
    expect((await confirmEbitdaItem(db, scope, x, { inputKey: keyOf("(f)"), value: String(2 * M), source: "x", confirmedBy: "cfo" })).ok).toBe(true);
  });
  it("an erp: source must quote the current suggestion exactly", async () => {
    const x = a(ERP()), s = revSuggestion(x), db = fakeStore();
    expect(await confirmEbitdaItem(db, scope, x, { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: String(300 * M + 1), source: s.sourceRef!, confirmedBy: "cfo" })).toMatchObject({ ok: false, code: "ERP_EVIDENCE_MISMATCH" });
    expect(await confirmEbitdaItem(db, scope, x, { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: s.value!, source: "erp:NETSUITE:conn1:made-up@2026-06-30", confirmedBy: "cfo" })).toMatchObject({ ok: false, code: "ERP_EVIDENCE_MISMATCH" });
    expect(db.rows).toHaveLength(0);
  });
  it("(2) another document's figure must agree with the ERP figure to within 2% (was 10x)", async () => {
    const x = a(ERP()); // ERP LTM revenue $300M
    const c = (v: number) => confirmEbitdaItem(fakeStore(), scope, x, { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: String(v), source: "FY audited statements", confirmedBy: "cfo" });
    for (const v of [294 * M, 306 * M, 300 * M]) expect((await c(v)).ok).toBe(true);
    for (const v of [294 * M - 1, 306 * M + 1, 290 * M, 31 * M, 2999 * M]) expect(await c(v)).toMatchObject({ ok: false, status: 422, code: "OUT_OF_RANGE" });
  });
  it("(3) BASE_METRIC above MAX_CONFIRMED_USD is a 422 OUT_OF_RANGE before any write, for any source", async () => {
    const db = fakeStore();
    const big = (MAX_CONFIRMED_USD + 1n).toString();
    for (const source of ["FY audited statements", "erp:NETSUITE:conn-1:x@2026-06-30"]) {
      expect(await confirmEbitdaItem(db, scope, a(ERP()), { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: big, source, confirmedBy: "cfo" })).toMatchObject({ ok: false, status: 422, code: "OUT_OF_RANGE" });
    }
    expect(await confirmEbitdaItem(db, scope, a(ERP()), { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: "9".repeat(40), source: "doc", confirmedBy: "cfo" })).toMatchObject({ ok: false, status: 422, code: "OUT_OF_RANGE" });
    expect(db.rows).toHaveLength(0);
  });
  it("(4) args.erp.companyId must equal scope.companyId: confirm is a 422 with no write; refresh records FAILED, no evidence saved", async () => {
    const db = fakeStore();
    const leaked: BoxArgs = { ...a(ERP()), erp: { companyId: "other-co", facts: ERP() } };
    for (const kind of ["BASE_METRIC", "AMOUNT"] as const) {
      expect(await confirmEbitdaItem(db, scope, leaked, { inputKey: kind === "BASE_METRIC" ? "METRIC:REVENUE" : keyOf("(f)"), kind, value: String(300 * M), source: "doc", confirmedBy: "cfo" })).toMatchObject({ ok: false, status: 422, code: "ERP_SCOPE_MISMATCH" });
    }
    expect(db.rows).toHaveLength(0);
    const r = await refreshBoxCommitted(db, scope, async () => leaked);
    expect(r?.box.status).toBe("FAILED");
    expect(r?.box.erpEvidence).toBeUndefined();
    expect(db.boxes.every((b) => !(b.payload as { erpEvidence?: unknown }).erpEvidence)).toBe(true);
    expect((await refreshBoxCommitted(db, scope, async () => a(ERP())))?.box.erpEvidence?.status).toBe("READY");
  });
  it("(5) companyErpFacts: non-array → null; hung source → null after the timeout; logs carry no raw error text", async () => {
    const logged: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...x: unknown[]) => { logged.push(x); });
    try {
      for (const bad of [{ facts: [] }, "x", null, 42]) {
        registerErpEvidenceSource({ listPeriodFacts: async () => bad as never });
        expect(await companyErpFacts(C)).toBeNull();
      }
      registerErpEvidenceSource({ listPeriodFacts: () => new Promise(() => {}) });
      const t0 = Date.now();
      expect(await companyErpFacts(C, { timeoutMs: 20 })).toBeNull();
      expect(Date.now() - t0).toBeLessThan(2_000);
      registerErpEvidenceSource({ listPeriodFacts: async () => { throw new Error("https://acct-123.suitetalk.api.netsuite.com token=SECRET"); } });
      expect(await companyErpFacts(C)).toBeNull();
      registerErpEvidenceSource({ listPeriodFacts: () => { throw new Error("sync SECRET"); } });
      expect(await companyErpFacts(C)).toBeNull();
      const text = JSON.stringify(logged);
      expect(text).not.toMatch(/SECRET|netsuite\.com|acct-123/);
      expect(text).toMatch(/invalid_shape/); expect(text).toMatch(/timeout/); expect(text).toMatch(/"reason":"error"/);
    } finally { spy.mockRestore(); }
  });
  it("(7) erpEvidence carries fetchedAt: stamped by companyErpFacts, passed through the box, junk → null", async () => {
    registerErpEvidenceSource({ listPeriodFacts: async () => ERP() });
    const before = Date.now();
    const loaded = (await companyErpFacts(C))!;
    expect(Date.parse(loaded.fetchedAt!)).toBeGreaterThanOrEqual(before - 1);
    const box = computeEbitdaBox({ ...a(null), erp: loaded });
    expect(box.erpEvidence?.fetchedAt).toBe(loaded.fetchedAt);
    expect(computeEbitdaBox({ ...a(null), erp: { companyId: C, facts: ERP(), fetchedAt: "2026-10-17T09:00:00Z" } }).erpEvidence?.fetchedAt).toBe("2026-10-17T09:00:00.000Z");
    for (const junk of [undefined, null, "yesterday", "2026-13-45T00:00:00Z"]) expect(computeEbitdaBox({ ...a(null), erp: { companyId: C, facts: ERP(), fetchedAt: junk as never } }).erpEvidence?.fetchedAt).toBeNull();
    expect(erpEvidenceForBox({ companyId: C, facts: ERP(), financials: noBaseFin, periodEnd: null, baseNeedsEvidence: false, fetchedAt: "2026-10-17T09:00:00.000Z" })).toMatchObject({ status: "NO_PERIOD", fetchedAt: "2026-10-17T09:00:00.000Z" });
  });
  it.each([[1n, "SUGGESTED"], [10n, "NEEDS_INPUT"], [100n, "NEEDS_INPUT"], [1000n, "NEEDS_INPUT"]] as const)("(1b) end to end: ERP revenue at %sx with NI reconciled → %s; a $100B add-back is always refused", async (mult, want) => {
    const db = fakeStore();
    const x = a([...monthly("revenue", Number(25n * BigInt(M) * mult)), ...monthly("netIncome", -1 * M)]);
    const sug = revSuggestion(x);
    expect(sug.status).toBe(want);
    expect(computeEbitdaBox(x).erpEvidence?.reconciliation.find((r) => r.metric === "netIncome")?.status).toBe("RECONCILED");
    const inflated = (300n * BigInt(M) * mult).toString();
    const ref = sug.sourceRef ?? `erp:NETSUITE:conn1:ltm.revenue.forged@2026-06-30`;
    const confirm = await confirmEbitdaItem(db, scope, x, { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: sug.value ?? inflated, source: ref, confirmedBy: "cfo" });
    if (want === "SUGGESTED") expect(confirm.ok).toBe(true);
    else expect(confirm).toMatchObject({ ok: false, status: 422, code: "NEEDS_ERP_EVIDENCE" });
    const addBack = await confirmEbitdaItem(db, scope, x, { inputKey: keyOf("(f)"), value: String(100_000 * M), source: "x", confirmedBy: "cfo" });
    expect(addBack).toMatchObject({ ok: false, status: 422 });
    expect(["OUT_OF_RANGE", "NEEDS_BASE"]).toContain((addBack as { code?: string }).code);
    expect(db.rows.filter((r) => r.kind === "AMOUNT")).toHaveLength(0);
  });
  it("(minor) fetchedAt: impossible calendar dates and malformed instants are rejected (null), not normalized", () => {
    const at = (f: unknown) => computeEbitdaBox({ ...a(null), erp: { companyId: C, facts: ERP(), fetchedAt: f as never } }).erpEvidence?.fetchedAt;
    for (const bad of ["2026-02-30T00:00:00Z", "2026-02-29T12:00:00Z", "2026-04-31T00:00:00Z", "2026-10-17T24:00:00Z", "2026-10-17T10:60:00Z", "2026-10-17T10:00:00", "2026-10-17", "2026-10-17T10:00:00Zjunk"]) expect(at(bad)).toBeNull();
    expect(at("2028-02-29T12:00:00Z")).toBe("2028-02-29T12:00:00.000Z");
    expect(at("2026-10-17T12:00:00+02:00")).toBe("2026-10-17T10:00:00.000Z");
  });
  it("(minor) the timeout aborts the ERP call through the AbortSignal", async () => {
    let seen: AbortSignal | undefined;
    registerErpEvidenceSource({ listPeriodFacts: (_id, opts) => new Promise((_, reject) => { seen = opts?.signal; opts?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); }) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await companyErpFacts(C, { timeoutMs: 20 })).toBeNull();
      expect(seen?.aborted).toBe(true);
    } finally { spy.mockRestore(); }
    registerErpEvidenceSource({ listPeriodFacts: async (_id, opts) => { seen = opts?.signal; return ERP(); } });
    expect((await companyErpFacts(C))?.facts).toHaveLength(24);
    expect(seen?.aborted).toBe(false);
  });
  it("(minor) BASE_METRIC values with whitespace are refused (400), nothing written", async () => {
    const db = fakeStore();
    for (const v of [" 300000000", "300000000 ", " 5 ", "300000000\n", "300 000 000"]) {
      expect(await confirmEbitdaItem(db, scope, a(ERP()), { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: v, source: "doc", confirmedBy: "cfo" })).toMatchObject({ ok: false, status: 400 });
    }
    expect(db.rows).toHaveLength(0);
  });
  it("(optional) plausibleMax uses min(confirmed revenue, current ERP suggestion)", async () => {
    const db = fakeStore();
    // A document figure 2% above ERP is accepted ($306M); the add-back bound is then 50% of the ERP $300M, not $306M.
    expect((await confirmEbitdaItem(db, scope, a(ERP()), { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: String(306 * M), source: "FY audited statements", confirmedBy: "cfo" })).ok).toBe(true);
    expect(await confirmEbitdaItem(db, scope, a(ERP()), { inputKey: keyOf("(f)"), value: String(150 * M + 1), source: "x", confirmedBy: "cfo" })).toMatchObject({ ok: false, code: "OUT_OF_RANGE" });
    expect((await confirmEbitdaItem(db, scope, a(ERP()), { inputKey: keyOf("(f)"), value: String(150 * M), source: "x", confirmedBy: "cfo" })).ok).toBe(true);
  });
  it("(6) a BASE_METRIC revenue of 0 is NEEDS_INPUT (422) and writes nothing", async () => {
    const db = fakeStore();
    expect(await confirmEbitdaItem(db, scope, a(ERP()), { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: "0", source: "doc", confirmedBy: "cfo" })).toMatchObject({ ok: false, status: 422, code: "NEEDS_INPUT" });
    expect(db.rows).toHaveLength(0);
  });
  it("refused: filings already report revenue; no ERP; unreconciled ERP; non-revenue metric; nothing persisted", async () => {
    const db = fakeStore();
    const c = (x: BoxArgs, inputKey = "METRIC:REVENUE") => confirmEbitdaItem(db, scope, x, { inputKey, kind: "BASE_METRIC", value: String(300 * M), source: "doc", confirmedBy: "cfo" });
    expect(await c(a(ERP(), withFin({ values: [...noBaseFin.values, flow("revenue", 300 * M)] })))).toMatchObject({ ok: false, code: "FILING_PRESENT" });
    expect(await c(a(null))).toMatchObject({ ok: false, code: "NEEDS_ERP_EVIDENCE" });
    expect(await c(a([...monthly("revenue", 25 * M), ...monthly("netIncome", -1_000 * M)]))).toMatchObject({ ok: false, code: "NEEDS_ERP_EVIDENCE" });
    expect(await c(a(ERP()), "METRIC:NETINCOME")).toMatchObject({ ok: false, status: 400 });
    expect(db.rows).toHaveLength(0);
  });
  it("a registered source feeds the server's args; another company's facts are refused at admission", async () => {
    registerErpEvidenceSource({ listPeriodFacts: async (id) => monthly("revenue", 25 * M, "4000", { companyId: id === C ? C : "leak" }) });
    expect((await companyErpFacts(C))?.facts).toHaveLength(12);
    const e = erpEvidenceForBox({ companyId: C, facts: monthly("revenue", 25 * M, "4000", { companyId: "other" }), financials: fin, periodEnd: "2026-06-30", baseNeedsEvidence: false });
    expect(e.rejectedCount).toBe(12);
    registerErpEvidenceSource({ listPeriodFacts: async () => { throw new Error("NetSuite 503"); } });
    expect(await companyErpFacts(C)).toBeNull(); // ERP outage → no evidence, box still computed from filings
    expect(e.suggestions.find((s) => s.metric === "revenue")?.status).toBe("NEEDS_INPUT");
  });
});

describe("migration 20261017090000 (kind check widened with no window lacking a kind check)", () => {
  const dir = "prisma/migrations/20261017090000_customer_ebitda_base_metric";
  const sqlOf = (f: string) => readFileSync(`${dir}/${f}`, "utf8").split("\n").filter((l) => !/^\s*--/.test(l)).join("\n").trim();
  it("up: exactly one statement, an ALTER TABLE whose subcommands drop and re-add the kind check", () => {
    const sql = sqlOf("migration.sql");
    const statements = sql.split(";").map((x) => x.trim()).filter(Boolean);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^ALTER TABLE "customer_ebitda_confirmations"\s+DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_kind_check",\s+ADD CONSTRAINT "customer_ebitda_confirmations_kind_check" CHECK \("kind" IN \('AMOUNT', 'LENDER_APPROVAL', 'BASE_METRIC'\)\) NOT VALID$/);
  });
  it("down: one DO block that locks, refuses if BASE_METRIC rows exist, then swaps in a single ALTER", () => {
    const sql = sqlOf("down.sql");
    expect(sql.startsWith("DO $$") && sql.endsWith("END $$;")).toBe(true);
    const body = sql.slice(5, -7);
    expect(body.indexOf("LOCK TABLE")).toBeLessThan(body.indexOf("RAISE EXCEPTION"));
    expect(body).toMatch(/ALTER TABLE "customer_ebitda_confirmations"\s+DROP CONSTRAINT IF EXISTS "customer_ebitda_confirmations_kind_check",\s+ADD CONSTRAINT "customer_ebitda_confirmations_kind_check" CHECK \("kind" IN \('AMOUNT', 'LENDER_APPROVAL'\)\) NOT VALID;/);
    expect(body.match(/ALTER TABLE/g)).toHaveLength(1);
  });
});
