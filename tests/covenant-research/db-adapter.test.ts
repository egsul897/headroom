/**
 * Database adapter — exercise SemanticTruthRecord projection without
 * claiming production DB integration when DATABASE_URL is unavailable.
 */
import { describe, expect, it } from "vitest";
import {
  researchEntryFromSemanticTruth,
  tryLoadResearchCorpusFromDb,
} from "../../lib/covenant-research";

describe("covenant research — db adapter", () => {
  it("projects a fixture SemanticTruth-shaped row into a research entry", () => {
    const entry = researchEntryFromSemanticTruth({
      id: "truth-1",
      companyId: "co-1",
      companyName: "Fixture Co",
      ticker: "FIX",
      cik: "0000000001",
      instrumentKey: "fix-facility",
      kind: "RULE",
      covenantFamily: "INDEBTEDNESS",
      ruleType: "QUANTITATIVE_PERMISSION",
      action: "INCUR_DEBT",
      sourceExcerpt: "other Indebtedness not exceeding $10,000,000.",
      sourceCitation: "§6.01(q)",
      sourceSectionRef: "6.01(q)",
      verificationStatus: "COMPILED",
      trustStatus: "COMPILED",
      filingUrl: "https://www.sec.gov/Archives/edgar/data/1/000/",
      accession: "0000000000-00-000000",
      filedOn: "2024-01-01",
      documentName: "EX-10.1",
      conditions: [{ type: "NO_DEFAULT", description: "no Default" }],
      definedTerms: [{ termName: "Indebtedness", excerpt: null }],
    });

    expect(entry.entryId).toBe("db:truth-1");
    expect(entry.sourceExcerpt).toContain("$10,000,000");
    expect(entry.verificationStatus).toBe("COMPILED");
    expect(entry.filing.url).toContain("sec.gov");
    expect(entry.relatedConditions[0]?.type).toBe("NO_DEFAULT");
  });

  it("tryLoadResearchCorpusFromDb returns [] when DATABASE_URL is unavailable (no false production claim)", async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const rows = await tryLoadResearchCorpusFromDb();
      expect(Array.isArray(rows)).toBe(true);
      // Without a live DB this environment must not pretend production rows exist.
      expect(rows.length).toBe(0);
    } finally {
      if (prev != null) process.env.DATABASE_URL = prev;
    }
  });
});
