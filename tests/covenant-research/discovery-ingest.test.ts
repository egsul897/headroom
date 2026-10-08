/**
 * Discovery ingest — expand research corpus from already-acquired package
 * discovery runs without EDGAR or paid model calls.
 */
import { describe, expect, it } from "vitest";
import {
  ingestDefaultDiscoveryPackages,
  loadResearchCorpusFromFile,
  retrieveResearch,
} from "../../lib/covenant-research";

describe("covenant research — discovery ingest batch", () => {
  it("ingests FWRG + LSB discovery candidates with exact source citations", () => {
    const ingested = ingestDefaultDiscoveryPackages();
    expect(ingested.length).toBeGreaterThan(200);
    expect(ingested.every((e) => e.sourceExcerpt.trim().length > 20)).toBe(true);
    expect(ingested.every((e) => e.verificationStatus === "UNVERIFIED")).toBe(true);
    expect(ingested.some((e) => e.issuer.ticker === "FWRG")).toBe(true);
    expect(ingested.some((e) => e.issuer.ticker === "LXU")).toBe(true);
    expect(ingested.every((e) => e.filing.url?.includes("sec.gov"))).toBe(true);
    expect(ingested.every((e) => e.identityKey && e.sourceSpan?.excerptHash)).toBe(true);
  });

  it("merged corpus still answers curated high-precision queries", () => {
    const curated = loadResearchCorpusFromFile();
    const merged = [...curated, ...ingestDefaultDiscoveryPackages()];
    const response = retrieveResearch("Find leverage covenants with springing tests", {
      corpus: merged,
      limit: 5,
    });
    expect(response.hits.some((h) => h.entry.entryId === "lsb-6.15-springing-fccr")).toBe(true);
  });
});
