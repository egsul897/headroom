/** SEC XBRL inputs: exact TTM, definition-gated binding, EBITDA never defaulted, grower computes from total assets. */
import { describe, expect, it } from "vitest";
import { extractFinancials, ttmAt, type CompanyFacts, type XbrlFact } from "@/lib/covenant-learning-factory/xbrl/companyfacts";
import { decide } from "@/lib/covenant-learning-factory/xbrl/bind";
import { runAgreementPipeline } from "@/lib/covenant-learning-factory/pipeline/agreement-pipeline";

const f = (start: string | undefined, end: string, val: number, form = "10-Q", accn = "A"): XbrlFact => ({ start, end, val, accn, form, filed: end });
const cf = (facts: Record<string, XbrlFact[]>): CompanyFacts => ({ cik: 1, entityName: "Test Co", facts: { "us-gaap": Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, { units: { USD: v } }])) } });

const flows = (ni: [number, number, number]) => [f("2025-01-01", "2025-12-31", ni[0], "10-K", "K"), f("2026-01-01", "2026-06-30", ni[1], "10-Q", "Q"), f("2025-01-01", "2025-06-30", ni[2], "10-Q", "PQ")];
const FACTS = cf({
  NetIncomeLoss: flows([100, 60, 40]), InterestExpense: flows([10, 6, 5]), IncomeTaxExpenseBenefit: flows([30, 20, 10]), DepreciationAndAmortization: flows([50, 30, 25]),
  Assets: [f(undefined, "2026-06-30", 2_000_000_000), f(undefined, "2025-12-31", 1_900_000_000, "10-K")],
  LongTermDebtNoncurrent: [f(undefined, "2026-06-30", 500)], LongTermDebtCurrent: [f(undefined, "2026-06-30", 25)],
});

describe("XBRL extraction", () => {
  it("TTM = FY + YTD − prior YTD, exact", () => {
    expect(ttmAt(FACTS.facts["us-gaap"]!.NetIncomeLoss!.units.USD!, "2026-06-30")!.value).toBe(120n);
  });
  it("reported EBITDA base, latest instants, debt = noncurrent + current", () => {
    const fin = extractFinancials(FACTS, "0000000001");
    const v = (m: string) => fin.values.find((x) => x.metric === m)?.value;
    expect(v("reportedEbitdaBase")).toBe(String(120 + 11 + 40 + 55));
    expect(v("totalAssets")).toBe("2000000000");
    expect(v("totalDebt")).toBe("525");
  });
  it("no prior-year YTD → no TTM (never approximated)", () => {
    expect(ttmAt([f("2025-01-01", "2025-12-31", 1, "10-K"), f("2026-01-01", "2026-06-30", 1)], "2026-06-30")).toBeNull();
  });
});

describe("definition-gated binding", () => {
  const fin = extractFinancials(FACTS, "0000000001");
  it("EBITDA with add-backs stays NEEDS_INPUT", () => {
    const text = `"Consolidated EBITDA" means Consolidated Net Income plus interest expense, taxes, depreciation and amortization, plus non-cash charges and restructuring costs. "Lien" means any lien.`;
    const d = decide("Consolidated EBITDA", text, fin);
    expect(d.status).toBe("NEEDS_INPUT");
    expect(d.reason).toMatch(/non-cash/);
  });
  it("undefined EBITDA stays NEEDS_INPUT", () => expect(decide("Consolidated EBITDA", "no definitions", fin).status).toBe("NEEDS_INPUT"));
  it("plain total assets definition binds; tangible / pro forma do not", () => {
    expect(decide("Consolidated Total Assets", `"Consolidated Total Assets" means the total assets of the Borrower and its Subsidiaries on a consolidated balance sheet. "X" means y.`, fin).status).toBe("BOUND");
    expect(decide("Consolidated Total Assets", `"Consolidated Total Assets" means total assets determined on a pro forma basis. "X" means y.`, fin).status).toBe("NEEDS_INPUT");
    expect(decide("Consolidated Net Tangible Assets", "", fin).status).toBe("NEEDS_INPUT");
  });
  it("HTML-entity quoted definitions are found; an undefined capitalized term stays NEEDS_INPUT", () => {
    expect(decide("Consolidated Total Assets", `&#147;Consolidated Total Assets&#148; means the total assets of the Company and its Subsidiaries. &ldquo; Lien &rdquo; means any lien.`, fin).status).toBe("BOUND");
    expect(decide("Consolidated Total Assets", "15% of Consolidated Total Assets", fin).status).toBe("NEEDS_INPUT");
    expect(decide("total assets", "15% of total assets", fin).status).toBe("BOUND");
  });
});

describe("pipeline wiring", () => {
  const doc = `CREDIT AGREEMENT

ARTICLE I
DEFINITIONS

Section 1.01 Defined Terms. "Consolidated Total Assets" means the total assets of the Borrower and its Subsidiaries as shown on the most recent consolidated balance sheet. "Lien" means any lien.

ARTICLE VI
NEGATIVE COVENANTS

Section 6.01 Indebtedness. The Borrower will not, and will not permit any Subsidiary to, incur any Indebtedness, except:

(a) Indebtedness under this Agreement;

(b) other Indebtedness in an aggregate principal amount not to exceed the greater of $50,000,000 and 5.0% of Consolidated Total Assets.

Section 6.02 Liens. The Borrower will not create any Lien except Liens securing obligations not exceeding $10,000,000.

ARTICLE VII
EVENTS OF DEFAULT

Section 7.01 Events of Default. If the Borrower shall fail to pay any principal when due.
`;
  it("greater-of total-assets grower: NEEDS_INPUT without filings, COMPUTED from XBRL with them", () => {
    const without = runAgreementPipeline({ sourceId: "t", text: doc });
    const g0 = without.computedBaskets.find((b) => b.category === "GROWER_GREATER_OF");
    expect(g0?.capStatus).toBe("NEEDS_INPUT");
    const withFin = runAgreementPipeline({ sourceId: "t", text: doc, financials: extractFinancials(FACTS, "0000000001") });
    const g1 = withFin.computedBaskets.find((b) => b.category === "GROWER_GREATER_OF");
    expect(g1?.capStatus).toBe("COMPUTED");
    expect(Number(g1?.capCanonical)).toBe(100_000_000); // max($50M, 5% × $2.0B)
    expect(withFin.xbrl?.decisions.find((d) => d.metricName === "Consolidated Total Assets")?.status).toBe("BOUND");
  });
});
