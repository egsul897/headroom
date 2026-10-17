/**
 * ERP evidence for the EBITDA box: admission (USD, scale 1, whole dollars, posted periods, filing sign, own company),
 * exact window sums, reconciliation against filings (1000x unit errors caught), LTM suggestions, and the CFO
 * BASE_METRIC confirm that resolves NEEDS_BASE. Every ERP figure here is a TEST FIXTURE; production has no ERP source
 * until ERP-1 registers one.
 */
import { afterEach, describe, expect, it } from "vitest";
import { admitErpFact, admitErpFacts, erpEvidenceSource, NO_ERP_EVIDENCE, registerErpEvidenceSource, type ErpEvidenceFact } from "@/lib/covenant-learning-factory/erp/contract";
import { reconcileErpWithFilings, sumOverWindow } from "@/lib/covenant-learning-factory/erp/reconcile";
import { erpEvidenceForBox, ltmWindow } from "@/lib/covenant-learning-factory/erp/suggest";
import { computeEbitdaBox, confirmEbitdaItem, type BoxArgs } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
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
    expect(e.suggestions.find((s) => s.metric === "revenue")?.reason).toMatch(/reconciled filing anchor/);
    const notOverlapping = withFin({ values: [...fin.values, flow("netIncome", -1 * M, "2024-07-01", "2024-07-31")] });
    const e2 = ev([...monthly("revenue", 25 * M), fact({ metric: "netIncome", externalId: "ni-2024-07", periodStart: "2024-07-01", periodEnd: "2024-07-31", amount: String(-1 * M) })], notOverlapping);
    expect(e2.reconciliation[0]?.status).toBe("RECONCILED");
    expect(e2.suggestions.find((s) => s.metric === "revenue")?.status).toBe("NEEDS_INPUT");
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
  it("another document's figure must be within 10x of the ERP figure", async () => {
    const x = a(ERP());
    expect((await confirmEbitdaItem(fakeStore(), scope, x, { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: String(290 * M), source: "FY audited statements", confirmedBy: "cfo" })).ok).toBe(true);
    expect(await confirmEbitdaItem(fakeStore(), scope, x, { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: String(3001 * M), source: "FY audited statements", confirmedBy: "cfo" })).toMatchObject({ ok: false, code: "OUT_OF_RANGE" });
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
