/**
 * Reviewer scale-error matrix (#415): true revenue $300M, the ERP revenue accounts inflated by 2x..50x while the other
 * flows reconcile. Whatever the profile, a CFO-confirmed ERP revenue must never authorize an add-back above the TRUE
 * revenue-derived bound (50% x $300M = $150M): each case is refused, or bounded at or below $150M.
 * Uses only the public box API so it runs unchanged against older tips. Every figure is a TEST FIXTURE.
 */
import { describe, expect, it } from "vitest";
import type { ErpEvidenceFact } from "@/lib/covenant-learning-factory/erp/contract";
import { computeEbitdaBox, confirmEbitdaItem, type BoxArgs } from "@/lib/covenant-learning-factory/pipeline/ebitda-box";
import type { FinancialValue, IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";
import { M, args, fakeStore, fin } from "./ebitda-box-fixture";

const C = "c1";
const scope = { companyId: C, documentId: "d1" };
const MONTHS = ["2025-07", "2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
const lastDay = (ym: string) => { const [y, m] = ym.split("-").map(Number) as [number, number]; return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const monthly = (metric: ErpEvidenceFact["metric"], annual: bigint, account: string): ErpEvidenceFact[] =>
  MONTHS.map((ym) => ({ source: "ERP", provider: "NETSUITE", connectionId: "conn1", companyId: C, externalId: `account:${account}:USD:${ym}`, metric, basis: "POSTED_PERIOD", periodStart: `${ym}-01`, periodEnd: lastDay(ym), amount: (annual / 12n).toString(), currency: "USD", scale: 1, signConvention: "FILING" }) as ErpEvidenceFact);
const flow = (metric: FinancialValue["metric"], value: bigint): FinancialValue =>
  ({ metric, concept: "test", periodType: "TTM", periodStart: "2025-07-01", periodEnd: "2026-06-30", value: value.toString(), unit: "USD", accession: "0000-test", form: "10-Q", filed: "2026-08-01", derivation: "test" });
// No positive base EBITDA and no filed revenue: without ERP an uncapped add-back is NEEDS_BASE.
const noBase = fin.values.map((v) => (v.concept === "NetIncomeLoss" ? { ...v, value: String(-10 * M) } : v));

const TRUE_REVENUE = 300n * 1_000_000n;
const TRUE_BOUND = TRUE_REVENUE / 2n; // 50% of true revenue
const pct = (p: number) => (TRUE_REVENUE * BigInt(Math.round(p * 100))) / 10_000n;
const PROFILES: Array<[string, Array<[FinancialValue["metric"] & ErpEvidenceFact["metric"], bigint]>]> = [
  ["D&A 3%", [["depreciationAmortization", pct(3)]]],
  ["NI 5%", [["netIncome", pct(5)]]],
  ["OI 12% + D&A 3%", [["operatingIncome", pct(12)], ["depreciationAmortization", pct(3)]]],
  ["OI 20% + D&A 3%", [["operatingIncome", pct(20)], ["depreciationAmortization", pct(3)]]],
  ["OI 60% + D&A 3%", [["operatingIncome", pct(60)], ["depreciationAmortization", pct(3)]]],
  ["OI 75% + D&A 3%", [["operatingIncome", pct(75)], ["depreciationAmortization", pct(3)]]],
  ["OI 90% + D&A 3%", [["operatingIncome", pct(90)], ["depreciationAmortization", pct(3)]]],
];
const ERRORS = [1n, 2n, 5n, 10n, 20n, 50n];

describe("scale-error matrix: a confirmed ERP revenue never authorizes more than the true revenue-derived bound", () => {
  for (const [name, flows] of PROFILES) for (const err of ERRORS) {
    it(`${name}, ERP revenue ${err}x`, async () => {
      const financials: IssuerFinancials = { ...fin, values: [...noBase, ...flows.map(([m, v]) => flow(m, v))] };
      const facts = [...monthly("revenue", TRUE_REVENUE * err, "4000"), ...flows.flatMap(([m, v], i) => monthly(m, v, String(5000 + i)))];
      const x: BoxArgs = { ...args, financials, erp: { companyId: C, facts } };
      const db = fakeStore();
      const box = computeEbitdaBox(x);
      const key = box.items.find((i) => i.label === "(f)")!.inputKey;
      for (const f of flows) expect(box.erpEvidence?.reconciliation.find((r) => r.metric === f[0])?.status).toBe("RECONCILED");
      const sug = box.erpEvidence?.suggestions.find((s) => s.metric === "revenue");
      if (sug?.status === "SUGGESTED") {
        expect((await confirmEbitdaItem(db, scope, x, { inputKey: "METRIC:REVENUE", kind: "BASE_METRIC", value: sug.value!, source: sug.sourceRef!, confirmedBy: "cfo" })).ok).toBe(true);
      }
      for (const v of [TRUE_BOUND + 1n, 1_500n * 1_000_000n, 100_000n * 1_000_000n]) {
        const r = await confirmEbitdaItem(db, scope, x, { inputKey: key, value: v.toString(), source: "x", confirmedBy: "cfo" });
        expect(r.ok, `add-back ${v} accepted (${name}, ${err}x)`).toBe(false);
      }
      expect(db.rows.filter((r) => r.kind === "AMOUNT")).toHaveLength(0);
    });
  }
});
