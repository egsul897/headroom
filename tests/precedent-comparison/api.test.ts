import { describe, expect, it } from "vitest";
import {
  COMPARABLE_COVENANT_FAMILIES,
  COMPARISON_DISCLAIMER,
  createPrecedentComparisonApi,
  getDefaultCorpus,
} from "../../lib/precedent-comparison";

describe("Precedent Comparison API", () => {
  const api = createPrecedentComparisonApi(getDefaultCorpus());

  it("exposes schema version, disclaimer, and required comparable families", () => {
    expect(api.schemaVersion).toBe("precedent-comparison.v1");
    expect(api.disclaimer).toBe(COMPARISON_DISCLAIMER);
    for (const family of [
      "INDEBTEDNESS",
      "LIENS",
      "INVESTMENTS",
      "RESTRICTED_PAYMENTS",
      "ASSET_SALES",
      "AFFILIATE_TRANSACTIONS",
      "MANDATORY_PREPAYMENTS",
      "FINANCIAL_COVENANTS",
      "DEFINITIONS_CALCULATION_RULES",
    ] as const) {
      expect(COMPARABLE_COVENANT_FAMILIES).toContain(family);
      expect(api.corpus.byFamily(family).length).toBeGreaterThan(0);
    }
  });

  it("retrieves comparable provisions by family and drafting features", () => {
    const hits = api.retrieve({
      covenantFamily: "INDEBTEDNESS",
      anyFeatures: ["GREATER_OF_BASKET", "RECLASSIFICATION_RIGHT", "EXCEPT_AS_PERMITTED"],
      limit: 10,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.provision.covenantFamily === "INDEBTEDNESS")).toBe(true);
    expect(hits[0]!.standingCeiling).not.toBe("REVIEWER_VERIFIED_CONCLUSION");
  });

  it("searches examples by free text over source excerpts", () => {
    const hits = api.search({ textContains: "EBITDA", limit: 10 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /EBITDA/i.test(h.provision.sourceText))).toBe(true);
  });

  it("identifies common and uncommon drafting patterns", () => {
    const patterns = api.patterns("INDEBTEDNESS");
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every((p) => p.totalInFamily >= 1)).toBe(true);
    const common = api.commonPatterns("INDEBTEDNESS");
    const uncommon = api.uncommonPatterns("INDEBTEDNESS");
    expect(common.every((p) => p.rarity === "COMMON")).toBe(true);
    expect(uncommon.every((p) => p.rarity !== "COMMON")).toBe(true);
  });

  it("compares debt provisions with exact textual diffs and stratified claims", () => {
    const debt = api.corpus.byFamily("INDEBTEDNESS");
    expect(debt.length).toBeGreaterThanOrEqual(2);
    const record = api.compare(debt[0]!.provisionId, debt[1]!.provisionId);
    expect(record.textual.algorithm).toBe("token-lcs.v1");
    expect(record.textual.hunks.length).toBeGreaterThan(0);
    expect(record.claims.some((c) => c.standing === "TEXTUAL_SIMILARITY")).toBe(true);
    expect(record.disclaimer).toContain("Similar drafting does not establish identical legal effect");
    expect(record.maxStanding).not.toBe("REVIEWER_VERIFIED_CONCLUSION");
  });

  it("compares EBITDA / leverage-ratio definitions", () => {
    const defs = api.corpus.byFamily("DEFINITIONS_CALCULATION_RULES");
    expect(defs.length).toBeGreaterThanOrEqual(2);
    const ebitda = defs.filter((p) => /EBITDA/i.test(p.sourceText));
    expect(ebitda.length).toBeGreaterThanOrEqual(2);
    const record = api.compare(ebitda[0]!.provisionId, ebitda[1]!.provisionId);
    expect(record.claims.some((c) => c.dimension === "DEFINITIONS" || c.dimension === "STRUCTURE")).toBe(true);
    const profiles = [api.profile(ebitda[0]!.provisionId), api.profile(ebitda[1]!.provisionId)];
    expect(profiles.some((p) => p.features.includes("EBITDA_METRIC"))).toBe(true);
  });

  it("surfaces shared-capacity and reclassification rights when drafted", () => {
    const reclassHits = api.retrieve({
      covenantFamily: "INDEBTEDNESS",
      requiredFeatures: ["RECLASSIFICATION_RIGHT"],
      limit: 5,
    });
    expect(reclassHits.length).toBeGreaterThan(0);
    expect(reclassHits[0]!.features.featureEvidence.RECLASSIFICATION_RIGHT).toMatch(/reclassif/i);
  });

  it("builds dependency-aware comparison views", () => {
    const left = api.corpus.byFamily("INDEBTEDNESS")[0]!;
    const right = api.corpus.byFamily("INDEBTEDNESS")[1]!;
    const comparison = api.compare(left.provisionId, right.provisionId);
    const view = api.dependencyView(comparison);
    expect(view.comparisonId).toBe(comparison.comparisonId);
    expect(view.note).toMatch(/not identical legal effect/i);
    expect(Array.isArray(view.leftLinks)).toBe(true);
    expect(Array.isArray(view.rightLinks)).toBe(true);
  });

  it("compares original agreements and amendments", () => {
    const pairs = api.amendmentPairs();
    expect(pairs.length).toBeGreaterThan(0);
    const result = api.compareAmendment(pairs[0]!.amendment.provisionId);
    expect(result.amendment.documentRole).toBe("AMENDMENT");
    expect(result.original.provisionId).toBe(result.amendment.amendsProvisionId);
    expect(result.amendmentClaims.some((c) => c.dimension === "AMENDMENT")).toBe(true);
  });

  it("retrieves counterexamples to proposed interpretations", () => {
    const hits = api.counterexamples({
      covenantFamily: "INDEBTEDNESS",
      claimedNecessaryFeatures: ["RECLASSIFICATION_RIGHT"],
      limit: 10,
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => !h.features.features.includes("RECLASSIFICATION_RIGHT"))).toBe(true);
    expect(hits[0]!.standing).toBe("SOURCE_SUPPORTED_LEGAL_DIFFERENCE");
  });

  it("covers junior-debt-prepayment, affiliate, asset-sale, RP, lien, investment families", () => {
    for (const family of [
      "LIENS",
      "INVESTMENTS",
      "RESTRICTED_PAYMENTS",
      "ASSET_SALES",
      "AFFILIATE_TRANSACTIONS",
      "MANDATORY_PREPAYMENTS",
    ] as const) {
      const hits = api.retrieve({ covenantFamily: family, limit: 3 });
      expect(hits.length, family).toBeGreaterThan(0);
    }
    const junior = api.retrieve({
      covenantFamily: "MANDATORY_PREPAYMENTS",
      anyFeatures: ["JUNIOR_DEBT_PREPAYMENT"],
      limit: 5,
    });
    expect(junior.length).toBeGreaterThan(0);
  });
});
