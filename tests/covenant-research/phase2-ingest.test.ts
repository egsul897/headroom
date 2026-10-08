/**
 * Phase 2 — multi-package ingest, dedupe, status preservation, KF blockers.
 */
import { describe, expect, it } from "vitest";
import {
  buildPhase2ResearchCorpus,
  probeKnowledgeFactoryIntegrations,
  retrieveResearch,
} from "../../lib/covenant-research";

describe("covenant research phase2 — corpus integration", () => {
  const report = buildPhase2ResearchCorpus();

  it("indexes existing discovery/compiled records (not new SEC acquisitions)", () => {
    expect(report.newlyIndexedFromExistingData).toBeGreaterThan(500);
    expect(report.discoveryRawCount).toBeGreaterThan(400);
    expect(report.compiledRawCount).toBeGreaterThan(20);
    expect(report.afterDedupe).toBeGreaterThan(report.curatedCount);
    expect(report.distinctDocuments).toBeGreaterThan(5);
    expect(report.distinctIssuers).toBeGreaterThanOrEqual(6);
  });

  it("removes duplicates by identity key and reports the count", () => {
    expect(report.duplicatesRemoved).toBeGreaterThanOrEqual(0);
    expect(report.beforeDedupe).toBe(report.afterDedupe + report.duplicatesRemoved);
    const keys = new Set(report.entries.map((e) => e.identityKey));
    expect(keys.size).toBe(report.entries.length);
  });

  it("preserves FIXTURE / UNVERIFIED / HYPOTHESIS / COMPILED distinctly and never invents VERIFIED", () => {
    const dist = report.verificationStatusDistribution;
    expect(dist.FIXTURE ?? 0).toBeGreaterThan(0);
    expect(dist.UNVERIFIED ?? 0).toBeGreaterThan(0);
    // Compiled path may emit HYPOTHESIS and/or COMPILED depending on unit status.
    expect((dist.HYPOTHESIS ?? 0) + (dist.COMPILED ?? 0)).toBeGreaterThan(0);
    expect(dist.VERIFIED ?? 0).toBe(0);
  });

  it("reuses canonical source identities (SEC URL/accession) on real-issuer rows", () => {
    const withFiling = report.entries.filter(
      (e) => e.issuer.cik && e.filing.url && e.filing.url.includes("sec.gov"),
    );
    expect(withFiling.length).toBeGreaterThan(100);
  });

  it("knowledge-factory surfaces are probed without inventing exports", () => {
    const statuses = probeKnowledgeFactoryIntegrations();
    expect(statuses.length).toBe(7);
    expect(statuses.every((s) => s.blocker || s.status === "AVAILABLE")).toBe(true);
    expect(statuses.some((s) => s.surface === "BASKET_FORMULA_LIBRARY" && s.status === "UNAVAILABLE")).toBe(
      true,
    );
  });

  it("phase2 corpus still answers curated high-precision queries", () => {
    const response = retrieveResearch("Find leverage covenants with springing tests", {
      corpus: report.entries,
      limit: 5,
    });
    expect(response.hits.some((h) => h.entry.entryId === "lsb-6.15-springing-fccr")).toBe(true);
  });
});
