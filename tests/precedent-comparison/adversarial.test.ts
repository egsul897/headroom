/**
 * Adversarial tests for Precedent Comparison Intelligence.
 *
 * Focus: epistemic boundary — similar drafting ≠ identical legal effect;
 * model/heuristic summaries never become reviewed precedent; standing never
 * silently upgrades; corpus cannot invent APPROVED_PRECEDENT without reviewer.
 */
import { describe, expect, it } from "vitest";
import {
  compareProvisions,
  createPrecedentComparisonApi,
  getDefaultCorpus,
  PrecedentCorpus,
  profileProvision,
} from "../../lib/precedent-comparison";
import type { PrecedentProvision } from "../../lib/precedent-comparison";

function sourceOnly(overrides: Partial<PrecedentProvision> & Pick<PrecedentProvision, "provisionId" | "sourceText" | "covenantFamily">): PrecedentProvision {
  return {
    locator: {
      packageId: "synthetic",
      documentId: "synthetic-doc",
      sourcePath: "tests/synthetic",
      sourceSectionRef: "9.9",
      charStart: 0,
      charEnd: overrides.sourceText.length,
    },
    documentRole: "ORIGINAL",
    amendsProvisionId: null,
    tags: [],
    reviewStatus: "SOURCE_ONLY",
    reviewedBy: null,
    reviewNote: null,
    ...overrides,
  };
}

describe("Precedent Comparison — adversarial epistemic boundaries", () => {
  it("refuses to treat near-identical drafting as identical legal effect", () => {
    const a = sourceOnly({
      provisionId: "syn-a",
      covenantFamily: "INDEBTEDNESS",
      sourceText:
        "The Borrower shall not create, incur, assume or suffer to exist any Indebtedness, except Indebtedness under this Agreement; provided that no Default shall have occurred.",
    });
    const b = sourceOnly({
      provisionId: "syn-b",
      covenantFamily: "INDEBTEDNESS",
      sourceText:
        "The Borrower shall not create, incur, assume or suffer to exist any Indebtedness, except Indebtedness under this Agreement; provided that no Event of Default shall have occurred and be continuing.",
    });
    const record = compareProvisions(a, b);
    expect(record.textual.identical).toBe(false);
    expect(record.claims.some((c) => c.standing === "TEXTUAL_SIMILARITY")).toBe(true);
    // Must surface a source-supported difference (proviso / condition language)
    expect(record.claims.some((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE")).toBe(true);
    expect(record.disclaimer).toMatch(/does not establish identical legal effect/i);
    // No claim may assert identical legal effect
    expect(record.claims.every((c) => !/identical legal effect/i.test(c.summary) || /not/i.test(c.summary))).toBe(true);
  });

  it("never labels a SEMANTIC_HYPOTHESIS as reviewed precedent", () => {
    const a = sourceOnly({
      provisionId: "syn-hyp-a",
      covenantFamily: "RESTRICTED_PAYMENTS",
      sourceText: "The Borrower shall not make any Restricted Payment except as permitted by Section 7.6(e) so long as the leverage ratio does not exceed 3.50 to 1.00.",
    });
    const b = sourceOnly({
      provisionId: "syn-hyp-b",
      covenantFamily: "RESTRICTED_PAYMENTS",
      sourceText: "Holdings shall not declare or pay any Restricted Payment except pursuant to Section 6.04 while the Total Net Leverage Ratio is less than or equal to 3.50 to 1.00.",
    });
    const record = compareProvisions(a, b);
    const hypotheses = record.claims.filter((c) => c.standing === "SEMANTIC_HYPOTHESIS");
    expect(hypotheses.length).toBeGreaterThan(0);
    for (const h of hypotheses) {
      expect(h.summary).toMatch(/not reviewed precedent|unverified semantic hypothesis/i);
      expect(h.summary).not.toMatch(/is reviewed precedent/i);
    }
    expect(record.maxStanding).not.toBe("REVIEWER_VERIFIED_CONCLUSION");
  });

  it("refuses APPROVED_PRECEDENT corpus entries without reviewedBy", () => {
    const corpus = new PrecedentCorpus();
    expect(() =>
      corpus.add(
        sourceOnly({
          provisionId: "bad-approved",
          covenantFamily: "LIENS",
          sourceText: "No Liens except Permitted Liens.",
          reviewStatus: "APPROVED_PRECEDENT",
          reviewedBy: null,
        }),
      ),
    ).toThrow(/APPROVED_PRECEDENT requires reviewedBy/);
  });

  it("emits REVIEWER_VERIFIED_CONCLUSION only when an attributable approval exists", () => {
    const left = sourceOnly({
      provisionId: "rev-left",
      covenantFamily: "INVESTMENTS",
      sourceText: "No Investments except the greater of $75,000,000 and 3.5% of Consolidated Total Assets, provided that no Default exists.",
      reviewStatus: "APPROVED_PRECEDENT",
      reviewedBy: "reviewer@example.com",
      reviewNote: "Confirmed greater-of basket with no-default gate.",
    });
    const right = sourceOnly({
      provisionId: "rev-right",
      covenantFamily: "INVESTMENTS",
      sourceText: "No Investments except $50,000,000 in the aggregate.",
    });
    const withReview = compareProvisions(left, right);
    expect(withReview.claims.some((c) => c.standing === "REVIEWER_VERIFIED_CONCLUSION")).toBe(true);
    expect(withReview.maxStanding).toBe("REVIEWER_VERIFIED_CONCLUSION");

    const noReview = compareProvisions(
      { ...left, reviewStatus: "SOURCE_ONLY", reviewedBy: null, reviewNote: null },
      right,
    );
    expect(noReview.claims.some((c) => c.standing === "REVIEWER_VERIFIED_CONCLUSION")).toBe(false);
  });

  it("detects additional conditions present in one precedent but absent in another", () => {
    const withProviso = sourceOnly({
      provisionId: "cond-a",
      covenantFamily: "ASSET_SALES",
      sourceText:
        "Dispose of any Property except in an Asset Sale for fair market value; provided that the consideration is at least 75% cash; provided further that pro forma compliance with the financial covenants is demonstrated.",
    });
    const bare = sourceOnly({
      provisionId: "cond-b",
      covenantFamily: "ASSET_SALES",
      sourceText: "Dispose of any Property except in an Asset Sale for fair market value.",
    });
    const record = compareProvisions(withProviso, bare);
    const conditionClaims = record.claims.filter(
      (c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" && (c.dimension === "PROVISOS" || c.dimension === "CONDITIONS"),
    );
    expect(conditionClaims.length).toBeGreaterThan(0);
    expect(conditionClaims.some((c) => c.sourceEvidence.some((e) => /provided/i.test(e.excerpt)))).toBe(true);
  });

  it("distinguishes borrower / guarantor / restricted-subsidiary / non-guarantor scope markers", () => {
    const broad = sourceOnly({
      provisionId: "scope-a",
      covenantFamily: "INDEBTEDNESS",
      sourceText:
        "The Borrower shall not, nor shall it permit any of its Restricted Subsidiaries to, incur Indebtedness; Indebtedness of any Restricted Subsidiary that is not a Loan Party must be unsecured.",
    });
    const narrow = sourceOnly({
      provisionId: "scope-b",
      covenantFamily: "INDEBTEDNESS",
      sourceText: "The Parent Borrower shall not incur Indebtedness except as set forth below.",
    });
    const record = compareProvisions(broad, narrow);
    expect(record.claims.some((c) => c.dimension === "SCOPE" && c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE")).toBe(true);
    const broadProfile = profileProvision(broad);
    expect(broadProfile.features).toEqual(expect.arrayContaining(["BORROWER_SCOPE", "RESTRICTED_SUBSIDIARY_SCOPE", "NON_GUARANTOR_SCOPE"]));
  });

  it("does not upgrade structural similarity of shared-capacity language to reviewer-verified conclusions", () => {
    const a = sourceOnly({
      provisionId: "cap-a",
      covenantFamily: "INDEBTEDNESS",
      sourceText: "Indebtedness in an aggregate principal amount not to exceed amounts incurred in reliance on this clause together with amounts under clause (b); the Borrower may reclassify such Indebtedness.",
    });
    const b = sourceOnly({
      provisionId: "cap-b",
      covenantFamily: "INDEBTEDNESS",
      sourceText: "Indebtedness shared with clause (c); the Borrower may divide and classify such Indebtedness among baskets.",
    });
    const record = compareProvisions(a, b);
    expect(record.structuralOverlap).toEqual(expect.arrayContaining(["SHARED_CAPACITY", "RECLASSIFICATION_RIGHT"]));
    expect(record.claims.some((c) => c.dimension === "SHARED_CAPACITY")).toBe(true);
    expect(record.claims.some((c) => c.dimension === "RECLASSIFICATION")).toBe(true);
    expect(record.maxStanding).not.toBe("REVIEWER_VERIFIED_CONCLUSION");
  });

  it("counterexamples never treat the proposed interpretation as reviewed authority", () => {
    const api = createPrecedentComparisonApi(getDefaultCorpus());
    const hits = api.counterexamples({
      covenantFamily: "INDEBTEDNESS",
      claimedAbsentFeatures: ["EXCEPT_AS_PERMITTED"],
      proposedInterpretation: "All indebtedness covenants are absolute prohibitions with no exceptions.",
      limit: 5,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.standing !== "REVIEWER_VERIFIED_CONCLUSION" as string)).toBe(true);
    expect(hits.every((h) => h.features.features.includes("EXCEPT_AS_PERMITTED"))).toBe(true);
  });

  it("default public corpus provisions are SOURCE_ONLY — never silently reviewed", () => {
    const corpus = getDefaultCorpus();
    expect(corpus.size()).toBeGreaterThan(10);
    for (const p of corpus.list()) {
      expect(p.reviewStatus).toBe("SOURCE_ONLY");
      expect(p.reviewedBy).toBeNull();
      expect(p.sourceText.length).toBeGreaterThan(40);
      expect(p.locator.sourcePath.length).toBeGreaterThan(0);
    }
  });

  it("materially different proviso still produces SOURCE_SUPPORTED difference even when families and many features match", () => {
    const base =
      "The Borrower and each Guarantor shall not make Investments except Investments in Wholly-Owned Subsidiaries in the ordinary course of business";
    const a = sourceOnly({
      provisionId: "prov-a",
      covenantFamily: "INVESTMENTS",
      sourceText: `${base}; provided that the aggregate amount shall not exceed $5,000,000.`,
    });
    const b = sourceOnly({
      provisionId: "prov-b",
      covenantFamily: "INVESTMENTS",
      sourceText: `${base}; provided that Consolidated EBITDA for the most recent period exceeds $100,000,000 and no Default exists.`,
    });
    const record = compareProvisions(a, b);
    expect(record.claims.some((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE")).toBe(true);
    expect(record.textual.tokenJaccard).toBeGreaterThan(0.4);
  });
});
