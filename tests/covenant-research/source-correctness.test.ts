/**
 * Source correctness — research hits must return exact corpus excerpts,
 * filing identity, and never invent capacity/legal conclusions.
 */
import { describe, expect, it } from "vitest";
import {
  RESEARCH_DISCLAIMER,
  loadResearchCorpusFromFile,
  retrieveResearch,
} from "../../lib/covenant-research";

const corpus = loadResearchCorpusFromFile();

describe("covenant research — source correctness", () => {
  it("every corpus entry has a non-empty exact sourceExcerpt", () => {
    expect(corpus.length).toBeGreaterThan(8);
    for (const e of corpus) {
      expect(e.sourceExcerpt.trim().length, e.entryId).toBeGreaterThan(20);
      expect(e.sourceCitation.trim().length, e.entryId).toBeGreaterThan(0);
      expect(e.issuer.name.trim().length, e.entryId).toBeGreaterThan(0);
      expect(e.instrument.instrumentKey.trim().length, e.entryId).toBeGreaterThan(0);
      expect(e.covenantFamily, e.entryId).toBeTruthy();
      expect(e.operativeVersion.status, e.entryId).toBeTruthy();
      expect(e.verificationStatus, e.entryId).toBeTruthy();
    }
  });

  it("DSGR $25m general debt hit returns the exact pinned excerpt and filing URL", () => {
    const response = retrieveResearch(
      "Find credit agreements with a $25 million general debt basket",
      { corpus, limit: 5 },
    );
    expect(response.refused).toBe(false);
    expect(response.disclaimer).toBe(RESEARCH_DISCLAIMER);
    const hit = response.hits.find((h) => h.entry.entryId === "dsgr-6.01-q-general-debt-25m");
    expect(hit).toBeTruthy();
    expect(hit!.entry.sourceExcerpt).toBe(
      "(q) other Indebtedness in an aggregate outstanding principal amount not exceeding at any time the greater of $25,000,000 and 25% of Applicable EBITDA.",
    );
    expect(hit!.entry.filing.url).toContain("sec.gov/Archives/edgar");
    expect(hit!.entry.issuer.ticker).toBe("DSGR");
    expect(hit!.entry.covenantFamily).toBe("INDEBTEDNESS");
    expect(hit!.entry.operativeVersion.status).toBe("CURRENT_OPERATIVE");
    expect(hit!.entry.verificationStatus).toBe("FIXTURE");
  });

  it("response never claims approved capacity or legal opinion language", () => {
    const response = retrieveResearch("ratio-based incremental debt", { corpus });
    expect(response.disclaimer).toMatch(/not legal opinions/i);
    expect(response.disclaimer).toMatch(/not approved capacity/i);
    // Hits themselves must not affirm permission/capacity — only retrieve source.
    for (const hit of response.hits) {
      const affirmative = [
        hit.entry.sourceCitation,
        hit.entry.action ?? "",
        ...hit.matchedSignals,
      ]
        .join(" ")
        .toLowerCase();
      expect(affirmative).not.toMatch(/\bis permitted\b|\bapproved capacity\b|\blegal opinion\b/);
    }
  });

  it("hit payload includes definitions, conditions, amendment relationships, verification", () => {
    const response = retrieveResearch("Find amendments reducing restricted-payment capacity", {
      corpus,
      limit: 5,
    });
    const hit = response.hits.find((h) => h.entry.entryId === "fixture-amendment-reduces-rp-capacity");
    expect(hit).toBeTruthy();
    expect(hit!.entry.amendmentRelationships.length).toBeGreaterThan(0);
    expect(hit!.entry.relevantDefinitions.some((d) => d.termName === "Restricted Payment")).toBe(true);
    expect(hit!.entry.verificationStatus).toBe("FIXTURE");
    expect(hit!.entry.operativeVersion.status).toBe("CURRENT_OPERATIVE");
  });

  it("excerpts are byte-stable projections of the corpus (no paraphrase layer)", () => {
    const pinned = corpus.find((e) => e.entryId === "lsb-6.15-springing-fccr")!;
    const response = retrieveResearch("Find leverage covenants with springing tests", { corpus });
    const hit = response.hits.find((h) => h.entry.entryId === pinned.entryId)!;
    expect(hit.entry.sourceExcerpt).toBe(pinned.sourceExcerpt);
  });
});
