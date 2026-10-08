/**
 * Search relevance — required natural-language queries retrieve the expected
 * source-backed entries via hybrid lexical/structural scoring.
 */
import { describe, expect, it } from "vitest";
import { loadResearchCorpusFromFile, parseResearchQuery, retrieveResearch } from "../../lib/covenant-research";

const corpus = loadResearchCorpusFromFile();

function topIds(query: string, limit = 5): string[] {
  return retrieveResearch(query, { corpus, limit }).hits.map((h) => h.entry.entryId);
}

describe("covenant research — search relevance", () => {
  it("Find credit agreements with a $25 million general debt basket", () => {
    const ids = topIds("Find credit agreements with a $25 million general debt basket");
    expect(ids[0]).toBe("dsgr-6.01-q-general-debt-25m");
    expect(parseResearchQuery("Find credit agreements with a $25 million general debt basket").intent).toBe(
      "GENERAL_DEBT_BASKET_AMOUNT",
    );
  });

  it("Find EBITDA definitions with uncapped synergy add-backs", () => {
    const response = retrieveResearch("Find EBITDA definitions with uncapped synergy add-backs", {
      corpus,
      limit: 5,
    });
    expect(response.hits[0]?.entry.entryId).toBe("chwy-ebitda-uncapped-synergy-addbacks");
    // Capped synergy (Gibraltar) must rank below uncapped CHWY for this intent.
    const chwy = response.hits.find((h) => h.entry.entryId === "chwy-ebitda-uncapped-synergy-addbacks")!;
    const gib = response.hits.find((h) => h.entry.entryId === "gibraltar-ebitda-capped-synergy");
    if (gib) expect(chwy.score).toBeGreaterThan(gib.score);
  });

  it("Find restricted-payment baskets conditioned on no default", () => {
    const ids = topIds("Find restricted-payment baskets conditioned on no default");
    expect(ids).toEqual(
      expect.arrayContaining(["fwrg-6.04-a-rp-no-default", "conmed-7.6-rp-ratio-no-default"]),
    );
  });

  it("Find investment baskets shared with junior-debt prepayments", () => {
    const ids = topIds("Find investment baskets shared with junior-debt prepayments");
    expect(ids[0]).toBe("fwrg-available-amount-shared-inv-rdp");
  });

  it("Find examples of ratio-based incremental debt", () => {
    const ids = topIds("Find examples of ratio-based incremental debt");
    expect(ids[0]).toBe("fwrg-incremental-ratio-debt");
  });

  it("Find amendments reducing restricted-payment capacity", () => {
    const ids = topIds("Find amendments reducing restricted-payment capacity");
    expect(ids[0]).toBe("fixture-amendment-reduces-rp-capacity");
  });

  it("Find leverage covenants with springing tests", () => {
    const ids = topIds("Find leverage covenants with springing tests");
    expect(ids[0]).toBe("lsb-6.15-springing-fccr");
  });

  it("Find non-guarantor subsidiary debt restrictions", () => {
    const ids = topIds("Find non-guarantor subsidiary debt restrictions");
    expect(ids[0]).toBe("conmed-7.2-j-non-guarantor-debt");
  });

  it("Find unusual reclassification provisions", () => {
    const ids = topIds("Find unusual reclassification provisions");
    expect(ids[0]).toBe("conmed-7.2-reclassification-overlapping");
  });

  it("Find agreements containing overlapping baskets", () => {
    const ids = topIds("Find agreements containing overlapping baskets");
    expect(ids).toEqual(
      expect.arrayContaining([
        "conmed-7.2-reclassification-overlapping",
        "fwrg-available-amount-shared-inv-rdp",
      ]),
    );
  });

  it("supports structured filters across issuers, dates, and agreement types", () => {
    const response = retrieveResearch(
      {
        text: "debt basket",
        issuer: "DSGR",
        agreementType: "CREDIT_AGREEMENT",
        dateFrom: "2024-01-01",
        dateTo: "2024-12-31",
        amountUsd: 25_000_000,
      },
      { corpus, limit: 5 },
    );
    expect(response.hits.length).toBeGreaterThan(0);
    for (const hit of response.hits) {
      expect(hit.entry.issuer.ticker).toBe("DSGR");
      expect(hit.entry.instrument.agreementType).toBe("CREDIT_AGREEMENT");
      expect(hit.entry.filing.filedOn! >= "2024-01-01").toBe(true);
      expect(hit.entry.filing.filedOn! <= "2024-12-31").toBe(true);
    }
  });

  it("operative-only filter excludes superseded RP basket", () => {
    const response = retrieveResearch(
      {
        text: "Restricted Payments basket",
        issuer: "RFIC",
        operativeOnly: true,
      },
      { corpus, limit: 10 },
    );
    expect(response.hits.every((h) => h.entry.operativeVersion.status === "CURRENT_OPERATIVE")).toBe(true);
    expect(response.hits.some((h) => h.entry.entryId === "fixture-rp-basket-pre-amendment")).toBe(false);
  });
});
