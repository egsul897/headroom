import { describe, expect, it } from "vitest";
import { decide } from "@/lib/covenant-learning-factory/xbrl/bind";
import type { IssuerFinancials } from "@/lib/covenant-learning-factory/xbrl/companyfacts";

const fv = (metric: string, value: string, concept: string) => ({ metric, concept, periodType: "INSTANT", periodStart: null, periodEnd: "2026-06-30", value, unit: "USD", accession: "a", form: "10-Q", filed: "2026-08-01", derivation: concept }) as never;
const fin: IssuerFinancials = { cik: "0000000001", entityName: "X", values: [fv("totalAssets", "10000", "Assets"), fv("goodwill", "1500", "Goodwill"), fv("intangiblesExGoodwill", "500", "IntangibleAssetsNetExcludingGoodwill")], missing: [], anchor: "2026-06-30" } as never;

describe("exact asset metrics from XBRL", () => {
  it("consolidated total assets on the latest balance sheet, with a pro forma proviso for transactions: exact", () => {
    const t = `"Consolidated Total Assets" means, as of any date of determination, the total assets of the Company and its Subsidiaries on a consolidated basis in accordance with GAAP, as shown on the most recent balance sheet of the Company (provided that, in the case of any determination relating to any incurrence of Debt, may be calculated on a pro forma basis). "Default" means x.`;
    expect(decide("Consolidated Total Assets", t, fin)).toMatchObject({ status: "BOUND", input: { value: "10000" } });
    expect(decide("the Issuer’s Consolidated Total Assets", t.replace("Consolidated Total Assets\" means", "the Issuer’s Consolidated Total Assets\" means"), fin).family).toBe("ASSETS");
  });
  it("total tangible assets = assets − goodwill − intangibles when the definition says so", () => {
    const t = `"Total Tangible Assets" means the total assets of the Parent and its Subsidiaries on a consolidated basis, less goodwill and intangible assets, as shown on the most recent balance sheet of the Parent. "Default" means x.`;
    expect(decide("Total Tangible Assets", t, fin)).toMatchObject({ status: "BOUND", input: { value: "8000" } });
  });
  it("restricted-group scope, internal statements or other deductions stay unresolved", () => {
    const r = `"Total Assets" means the total consolidated assets of the Issuer and its Restricted Subsidiaries, as shown on the most recent balance sheet of the Issuer. "D" means x.`;
    expect(decide("Total Assets", r, fin).status).toBe("NEEDS_INPUT");
    const i = `"Total Assets" means the total assets of the Company and its Subsidiaries, as set forth on the Company's most recently available internal consolidated balance sheet. "D" means x.`;
    expect(decide("Total Assets", i, fin).status).toBe("NEEDS_INPUT");
    const o = `"Total Tangible Assets" means total assets of the Company less goodwill, intangible assets and deferred financing costs. "D" means x.`;
    expect(decide("Total Tangible Assets", o, fin).status).toBe("NEEDS_INPUT");
  });
});
