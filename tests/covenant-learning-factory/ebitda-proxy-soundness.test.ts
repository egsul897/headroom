/**
 * F1/F2 soundness pins for the ERP EBITDA proxy (lib/covenant-learning-factory/erp/suggest.ts) and the box bound
 * that consumes it (pipeline/ebitda-box.ts plausibleMax). Both defects were FALSE-CONFIDENT — they certified
 * figures the filings do not support:
 *  F1: the proxy was filed OI + D&A, claimed bounded by revenue. Operating gains / equity-method income are
 *      non-revenue credits INSIDE operating income, so OI + D&A can exceed revenue. The proxy now subtracts the
 *      tagged credits the filings carry, and refuses (MISSING → NEEDS_INPUT) when the adjusted proxy still
 *      exceeds a filed revenue for the same period (an untagged credit: the decomposition is missing).
 *  F2: filed anchors were scaled UP to the LTM length (a 303-day figure became ~1.2x itself), inflating the
 *      proxy and the ratio checks with magnitudes that appear nowhere in the filings. Anchors now count at
 *      their filed-period magnitude (scaled down only), and the LTM-shaped proxy requires annual anchors.
 * Every figure here is a synthetic test fixture.
 */
import { describe, expect, it } from "vitest";
import type { ErpEvidenceFact } from "@/lib/covenant-learning-factory/erp/contract";
import { erpEvidenceForBox } from "@/lib/covenant-learning-factory/erp/suggest";
import { computeEbitdaBox, confirmEbitdaItem, type BoxArgs } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
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
const monthly = (metric: ErpEvidenceFact["metric"], each: number, account = "4000", months: string[] = MONTHS) =>
  months.map((ym) => fact({ metric, externalId: `account:${account}:USD:${ym}`, periodStart: `${ym}-01`, periodEnd: lastDay(ym), amount: String(each) }));
const flow = (metric: FinancialValue["metric"], value: number, start = "2025-07-01", end = "2026-06-30", concept = "test"): FinancialValue =>
  ({ metric, concept, periodType: "TTM", periodStart: start, periodEnd: end, value: String(value), unit: "USD", accession: "0000-test", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const item = (concept: string, value: number, start = "2025-07-01", end = "2026-06-30"): FinancialValue =>
  ({ metric: "item", concept, periodType: "TTM", periodStart: start, periodEnd: end, value: String(value), unit: "USD", accession: "0000-test", form: "10-Q", filed: "2026-08-01", derivation: "test" });
const withFin = (patch: Partial<IssuerFinancials>): IssuerFinancials => ({ ...fin, ...patch });
const noBaseFin = withFin({ values: [...fin.values.map((v) => (v.concept === "NetIncomeLoss" ? { ...v, value: String(-10 * M) } : v)), flow("netIncome", -12 * M)] });
const ev = (facts: ErpEvidenceFact[], f: IssuerFinancials, prior?: IssuerFinancials) =>
  erpEvidenceForBox({ companyId: C, facts, financials: f, priorFinancials: prior, periodEnd: "2026-06-30", baseNeedsEvidence: true });
/** ERP revenue $300M + reconciling NI, plus ERP OI/D&A at the given monthly amounts. */
const erpWith = (oiEach: number, daEach: number, months: string[] = MONTHS) =>
  [...monthly("revenue", 25 * M), ...monthly("netIncome", -1 * M), ...monthly("operatingIncome", oiEach, "6000", months), ...monthly("depreciationAmortization", daEach, "6100", months)];

describe("F1 — the proxy subtracts tagged non-revenue credits inside operating income", () => {
  it("disposition gains and equity-method income are removed; the filed OI stays as provenance", () => {
    const f = withFin({ values: [...noBaseFin.values, flow("operatingIncome", 192 * M), flow("depreciationAmortization", 12 * M),
      item("GainLossOnDispositionOfAssets", 144 * M), item("IncomeLossFromEquityMethodInvestments", 30 * M)] });
    const p = ev(erpWith(16 * M, 1 * M), f).ebitdaProxy;
    expect(p).toMatchObject({ status: "RECONCILED", value: String(30 * M), operatingIncome: String(192 * M), depreciationAmortization: String(12 * M), creditsSubtracted: String(174 * M) });
  });

  it("alternative tags of the same credit line count once, not twice", () => {
    const f = withFin({ values: [...noBaseFin.values, flow("operatingIncome", 192 * M), flow("depreciationAmortization", 12 * M),
      item("GainLossOnDispositionOfAssets", 144 * M), item("GainLossOnSaleOfPropertyPlantEquipment", 144 * M)] });
    const p = ev(erpWith(16 * M, 1 * M), f).ebitdaProxy;
    expect(p).toMatchObject({ status: "RECONCILED", value: String(60 * M), creditsSubtracted: String(144 * M) });
  });

  it("a tagged LOSS is a charge, not a credit: nothing is subtracted", () => {
    const f = withFin({ values: [...noBaseFin.values, flow("operatingIncome", 60 * M), flow("depreciationAmortization", 9 * M),
      item("GainLossOnDispositionOfAssets", -20 * M)] });
    const p = ev(erpWith(5 * M, 0.75 * M), f).ebitdaProxy;
    expect(p).toMatchObject({ status: "RECONCILED", value: String(69 * M), creditsSubtracted: "0" });
  });

  it("credits tagged for a DIFFERENT period do not touch this period's proxy", () => {
    const f = withFin({ values: [...noBaseFin.values, flow("operatingIncome", 60 * M), flow("depreciationAmortization", 9 * M),
      item("GainLossOnDispositionOfAssets", 50 * M, "2024-07-01", "2025-06-30")] });
    const p = ev(erpWith(5 * M, 0.75 * M), f).ebitdaProxy;
    expect(p).toMatchObject({ status: "RECONCILED", value: String(69 * M), creditsSubtracted: "0" });
  });

  it("box level: an add-back sized against the gain-inflated bound is refused; the sound bound confirms", async () => {
    const f = withFin({ values: [...noBaseFin.values, flow("operatingIncome", 192 * M), flow("depreciationAmortization", 12 * M),
      item("GainLossOnDispositionOfAssets", 144 * M)] });
    const x: BoxArgs = { ...args, financials: f, erp: { companyId: C, facts: erpWith(16 * M, 1 * M) } };
    const db = fakeStore();
    const keyOf = computeEbitdaBox(x).items.find((i) => i.label === "(f)")!.inputKey;
    const s = computeEbitdaBox(x).erpEvidence!.suggestions.find((y) => y.metric === "revenue")!;
    expect((await confirmEbitdaItem(db, scope, x, { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: s.value!, source: s.sourceRef!, confirmedBy: "cfo" })).ok).toBe(true);
    // Sound bound: min(50% x $300M revenue, 50% x $60M adjusted proxy) = $30M. Pre-fix the proxy was $204M and
    // the bound $102M, so the $100M confirm succeeded on a figure the filings do not support.
    expect(await confirmEbitdaItem(db, scope, x, { inputKey: keyOf, value: String(100 * M), source: "x", confirmedBy: "cfo" })).toMatchObject({ ok: false, code: "OUT_OF_RANGE" });
    expect((await confirmEbitdaItem(db, scope, x, { inputKey: keyOf, value: String(30 * M), source: "x", confirmedBy: "cfo" })).ok).toBe(true);
  });

  it("when the adjusted proxy still exceeds a filed revenue for the period, the proxy is MISSING (decomposition missing)", () => {
    const prior = withFin({ values: [flow("revenue", 300 * M), flow("operatingIncome", 312 * M), flow("depreciationAmortization", 9 * M),
      item("GainLossOnDispositionOfAssets", 10 * M)] });
    const p = ev(erpWith(26 * M, 0.75 * M), noBaseFin, prior).ebitdaProxy;
    expect(p.status).toBe("MISSING");
    expect(p.status === "MISSING" && p.reason).toMatch(/NEEDS_INPUT: operating income decomposition/);
  });
});

describe("F2 — filed anchors are never scaled up to the LTM length", () => {
  it("a 303-day OI/D&A anchor cannot form the LTM proxy; the reason names the uncovered span", () => {
    const ten = MONTHS.slice(2); // 2025-09 .. 2026-06 = 303 days
    const f = withFin({ values: [...noBaseFin.values,
      flow("operatingIncome", 50 * M, "2025-09-01", "2026-06-30"), flow("depreciationAmortization", 7.5 * M, "2025-09-01", "2026-06-30")] });
    const p = ev(erpWith(5 * M, 0.75 * M, ten), f).ebitdaProxy;
    expect(p.status).toBe("MISSING");
    expect(p.status === "MISSING" && p.reason).toMatch(/2025-07-01\.\.2025-08-31 uncovered/);
    expect(p.status === "MISSING" && p.reason).toMatch(/NEEDS_INPUT: 12 months of filed operatingIncome/);
  });

  it("a 350-day annual anchor counts at face value, not annualized (350 is the extraction layer's annual floor)", () => {
    const start = "2025-07-16", end = "2026-06-30"; // 350 days
    const spanFacts = (metric: ErpEvidenceFact["metric"], total: number, account: string) => [
      fact({ metric, externalId: `account:${account}:USD:stub`, periodStart: start, periodEnd: "2025-07-31", amount: String(total / 12) }),
      ...MONTHS.slice(1).map((ym) => fact({ metric, externalId: `account:${account}:USD:${ym}`, periodStart: `${ym}-01`, periodEnd: lastDay(ym), amount: String(total / 12) })),
    ];
    const f = withFin({ values: [...noBaseFin.values, flow("operatingIncome", 60 * M, start, end), flow("depreciationAmortization", 9 * M, start, end)] });
    const facts = [...monthly("revenue", 25 * M), ...monthly("netIncome", -1 * M), ...spanFacts("operatingIncome", 60 * M, "6000"), ...spanFacts("depreciationAmortization", 9 * M, "6100")];
    const p = ev(facts, f).ebitdaProxy;
    // Pre-fix the anchors were scaled by 365/350 and the proxy read $71,957,142 — a figure in no filing.
    expect(p).toMatchObject({ status: "RECONCILED", value: String(69 * M), operatingIncome: String(60 * M), depreciationAmortization: String(9 * M) });
  });

  it("the ratio checks use the anchor's filed-period magnitude: an inflated ERP revenue the scaled anchor used to pass is NEEDS_INPUT", () => {
    const ten = MONTHS.slice(2);
    const revFacts = MONTHS.map((ym, i) => fact({ metric: "revenue", externalId: `account:4000:USD:${ym}`, periodStart: `${ym}-01`, periodEnd: lastDay(ym), amount: String(i === 11 ? 9_583_337 : 9_583_333) })); // LTM $115M
    const taxFacts = ten.map((ym) => fact({ metric: "incomeTaxes", externalId: `account:7000:USD:${ym}`, periodStart: `${ym}-01`, periodEnd: lastDay(ym), amount: "100000" })); // $1M over 303 days
    const f = withFin({ values: [...fin.values, flow("incomeTaxes", 1 * M, "2025-09-01", "2026-06-30")] });
    const e = erpEvidenceForBox({ companyId: C, facts: [...revFacts, ...taxFacts], financials: f, periodEnd: "2026-06-30", baseNeedsEvidence: false });
    const s = e.suggestions.find((y) => y.metric === "revenue")!;
    // Pre-fix the $1M anchor scaled to ~$1.205M, so 100x it ($120.5M) covered the $115M revenue: SUGGESTED.
    expect(s.status).toBe("NEEDS_INPUT");
    expect(s.reason).toMatch(/ratio check failed/);
  });

  it("a tripped lower ratio check names the anchor's actual period length as provenance", () => {
    const ten = MONTHS.slice(2);
    const revFacts = MONTHS.map((ym, i) => fact({ metric: "revenue", externalId: `account:4000:USD:${ym}`, periodStart: `${ym}-01`, periodEnd: lastDay(ym), amount: String(i === 11 ? 8_333_337 : 8_333_333) })); // LTM $100M
    const niFacts = ten.map((ym) => fact({ metric: "netIncome", externalId: `account:9000:USD:${ym}`, periodStart: `${ym}-01`, periodEnd: lastDay(ym), amount: String(-120 * M) })); // -$1,200M over 303 days
    const f = withFin({ values: [...fin.values, flow("netIncome", -1200 * M, "2025-09-01", "2026-06-30")] });
    const e = erpEvidenceForBox({ companyId: C, facts: [...revFacts, ...niFacts], financials: f, periodEnd: "2026-06-30", baseNeedsEvidence: false });
    const s = e.suggestions.find((y) => y.metric === "revenue")!;
    expect(s.status).toBe("NEEDS_INPUT");
    expect(s.reason).toMatch(/over its 303-day filed period/);
  });
});

describe("control — a clean full-year filing is unchanged", () => {
  it("proxy and bound are exactly as before when there are no credits and the anchors are annual", () => {
    const f = withFin({ values: [...noBaseFin.values, flow("operatingIncome", 60 * M), flow("depreciationAmortization", 9 * M)] });
    const p = ev(erpWith(5 * M, 0.75 * M), f).ebitdaProxy;
    expect(p).toEqual({ status: "RECONCILED", value: String(69 * M), operatingIncome: String(60 * M), depreciationAmortization: String(9 * M), creditsSubtracted: "0", provider: "NETSUITE", connectionId: "conn1", periods: ["operatingIncome 2025-07-01..2026-06-30", "depreciationAmortization 2025-07-01..2026-06-30"] });
  });
});
