import { describe, expect, it } from "vitest";
import { analyzeProvision } from "../../lib/product/covenant-intelligence/analyze-provision";
import type { CovenantCandidateRecord } from "../../lib/knowledge-factory/types";

function run(excerpt: string, heading = "Indebtedness", family = "INDEBTEDNESS") {
  const candidate: CovenantCandidateRecord = {
    candidateId: "c1",
    sourceId: "fixture:baskets",
    nodeId: "n1",
    families: [family as never],
    signals: [],
    excerpt,
    representationLevel: "DISCOVERED_CANDIDATE",
    discoveryScore: 10,
  };
  return analyzeProvision({
    sourceId: "fixture:baskets",
    documentTitle: "Test",
    candidate,
    definitions: [
      {
        term: "LTM EBITDA",
        sourceId: "fixture:baskets",
        charStart: 0,
        charEnd: 40,
        excerpt: "“LTM EBITDA” means Consolidated EBITDA for the last twelve months.",
      },
      {
        term: "Available Amount",
        sourceId: "fixture:baskets",
        charStart: 0,
        charEnd: 40,
        excerpt: "“Available Amount” means the builder basket capacity.",
      },
    ],
    structuralNodes: [
      {
        nodeId: "n1",
        sourceId: "fixture:baskets",
        nodeType: "SECTION",
        sectionRef: "7.01",
        heading,
        charStart: 0,
        charEnd: 200,
        ambiguous: false,
      },
    ],
  });
}

describe("quantitative basket / relationship mechanics", () => {
  it("captures (i)/(ii) grower baskets with LTM EBITDA", () => {
    const a = run(
      "Indebtedness not exceeding the greater of (i) $51,600,000 and (ii) 15.0% of LTM EBITDA in the aggregate outstanding at the time of incurrence.",
    );
    expect(a.basketsAndThresholds.some((b) => /Greater-of|grower/i.test(b) && /51/.test(b) && /15/.test(b))).toBe(
      true,
    );
    expect(a.basketsAndThresholds.some((b) => /outstanding/i.test(b))).toBe(true);
  });

  it("captures (A)/(B) growers with spelled percent of Consolidated Net Tangible Assets", () => {
    const a = run(
      "Investments not to exceed the greater of (A) $150,000,000 and (B) fifteen percent (15%) of Consolidated Net Tangible Assets at the time outstanding.",
      "Investments",
      "INVESTMENTS",
    );
    expect(a.basketsAndThresholds.some((b) => /Greater-of|grower/i.test(b) && /150/.test(b) && /15/.test(b))).toBe(
      true,
    );
    expect(a.basketsAndThresholds.some((b) => /Consolidated Net Tangible Assets/i.test(b))).toBe(true);
  });

  it("captures $X million grower drafting", () => {
    const a = run(
      "Investments not to exceed the greater of (x) $108.0 million and (y) 15% of Consolidated EBITDA for the most recently ended Test Period.",
      "Investments",
      "INVESTMENTS",
    );
    expect(a.basketsAndThresholds.some((b) => /108/.test(b) && /15/.test(b))).toBe(true);
  });

  it("flags shared capacity / taken-together stacking", () => {
    const a = run(
      "additional Investments having an aggregate fair market value, taken together with all other Investments made pursuant to this clause (21) that are at that time outstanding, not to exceed the greater of (i) $223,600,000 and (ii) 65.0% of LTM EBITDA.",
      "Investments",
      "INVESTMENTS",
    );
    expect(a.basketsAndThresholds.some((b) => /Shared|aggregated capacity/i.test(b))).toBe(true);
    expect(a.dependencies.some((d) => /aggregates with another clause/i.test(d))).toBe(true);
  });

  it("flags Available Amount builder and Not Otherwise Applied", () => {
    const a = run(
      "Restricted Payments funded from the Available Amount that is Not Otherwise Applied; provided that no Default exists.",
      "Restricted Payments",
      "RESTRICTED_PAYMENTS",
    );
    expect(a.basketsAndThresholds.some((b) => /Available Amount|Builder/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /Not Otherwise Applied/i.test(b))).toBe(true);
    expect(a.dependencies.some((d) => /Default/i.test(d))).toBe(true);
  });

  it("captures borrower optional ratio paths", () => {
    const a = run(
      "either, at the Borrower’s option, (i) the Consolidated Total Net Leverage Ratio on a pro forma basis does not exceed 5.85 to 1.00 or (ii) the Consolidated Interest Coverage Ratio is no less than 1.75 to 1.00.",
    );
    expect(a.basketsAndThresholds.some((b) => /Borrower election|optional ratio/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /Ratio threshold/i.test(b))).toBe(true);
  });

  it("extracts Chewy-style Fixed/Ratio/Voluntary incremental paths and reallocations", () => {
    const a = run(
      "Incremental Cap means (a) the Fixed Incremental Amount; plus (b) the Voluntary Prepayment Incremental Amount; plus (c) the Ratio Incremental Amount; plus (d) the Extension Amount. Fixed Incremental Amount includes unused amounts under the General Lien Basket Reallocated Amount minus, without duplication, prior Incremental Facilities. Unless the Initial Borrower elects otherwise, each Incremental Facility shall be deemed incurred first under the Ratio Incremental Amount.",
      "Incremental Facilities",
    );
    expect(a.basketsAndThresholds.some((b) => /Fixed \/ Cash-Capped Incremental/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /Ratio Incremental Amount/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /Voluntary Prepayment/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /multi-component sum/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /default utilization order|election dependency/i.test(b))).toBe(
      true,
    );
    expect(a.basketsAndThresholds.some((b) => /reallocation|reclassification/i.test(b))).toBe(true);
  });

  it("extracts Gibraltar-style Cash-Capped / Ratio-Based / Prepayment-Based incremental paths", () => {
    const a = run(
      "an amount equal to the Cash-Capped Incremental Facility, plus an unlimited amount (the Ratio-Based Incremental Facility) so long as the Maximum Leverage Requirement is satisfied, plus the Prepayment-Based Incremental Facility (such sum, the Incremental Amount). Unless the Borrower elects otherwise, the Borrower shall be deemed to have used amounts under the Ratio-Based Incremental Facility prior to the Prepayment-Based Incremental Facility or the Cash-Capped Incremental Facility. Indebtedness originally designated as incurred under the Cash-Capped Incremental Facility shall automatically cease to be deemed incurred thereunder and shall instead be deemed incurred under the Ratio-Based Incremental Facility when permitted, without duplication of such Indebtedness originally designated under the Cash-Capped Incremental Facility.",
      "Incremental Facilities",
    );
    expect(a.basketsAndThresholds.some((b) => /Fixed \/ Cash-Capped Incremental/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /Ratio Incremental Amount/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /Prepayment-Based|Voluntary Prepayment/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /multi-component sum/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /redesignation into ratio/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /Anti-stacking|without-duplication/i.test(b))).toBe(true);
  });

  it("extracts anti-stacking, divide-and-classify, and NOA deduction paths", () => {
    const a = run(
      "Investments (without duplication for purposes of Section 7.05 of any amounts applied pursuant to clause (y) of Section 7.05(a)) not to exceed the Available Amount that is Not Otherwise Applied. The Borrower may divide, classify and reclassify such transaction as an Investment or Restricted Payment. Not Otherwise Applied means, with reference to the Available Amount, that was not previously applied pursuant to Section 6.01(b)(32), clause (46)(ii) of the definition of Permitted Liens or Section 6.08(a)(3).",
      "Investments",
      "INVESTMENTS",
    );
    expect(a.basketsAndThresholds.some((b) => /Anti-stacking/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /Divide-and-classify|reclassify/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /Not Otherwise Applied/i.test(b))).toBe(true);
    expect(a.basketsAndThresholds.some((b) => /NOA deductions|NOA usage/i.test(b))).toBe(true);
    expect(a.dependencies.some((d) => /Not Otherwise Applied/i.test(d))).toBe(true);
  });
});
