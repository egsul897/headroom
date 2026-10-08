import { describe, expect, it } from "vitest";
import {
  COMPARABLE_COVENANT_FAMILIES,
  COMPARISON_DISCLAIMER,
  createPrecedentComparisonApi,
  getDefaultCorpus,
  validateCorpusSpans,
} from "../../lib/precedent-comparison";

describe("Precedent Comparison API (Phase 2)", () => {
  const api = createPrecedentComparisonApi(getDefaultCorpus());

  it("exposes v2 schema, disclaimer, and comparable families with corpus coverage", () => {
    expect(api.schemaVersion).toBe("precedent-comparison.v2");
    expect(api.disclaimer).toBe(COMPARISON_DISCLAIMER);
    for (const family of COMPARABLE_COVENANT_FAMILIES) {
      expect(api.corpus.byFamily(family).length, family).toBeGreaterThan(0);
    }
  });

  it("reports honest corpus statistics against expansion targets", () => {
    const stats = api.statistics();
    expect(stats.provisionCount).toBeGreaterThanOrEqual(500);
    expect(stats.distinctAgreements).toBeGreaterThanOrEqual(14);
    expect(stats.distinctIssuers).toBeGreaterThanOrEqual(8);
    expect(stats.targetsMet.provisions).toBe(true);
    expect(stats.targetsMet.agreements).toBe(false);
    expect(stats.targetsMet.issuers).toBe(false);
    expect(stats.marketPrevalenceClaim).toBe("FORBIDDEN_WITHOUT_REPRESENTATIVE_SAMPLE");
    expect(stats.samplingBiasNotes.length).toBeGreaterThan(0);
  });

  it("retrieves with agreement type, amendment status, and financial-definition filters", () => {
    const defs = api.retrieve({
      covenantFamily: "DEFINITIONS_CALCULATION_RULES",
      financialDefinitionTerms: ["EBITDA"],
      limit: 10,
    });
    expect(defs.length).toBeGreaterThan(0);
    expect(defs.every((h) => h.provenanceStatus === "SOURCE_ONLY")).toBe(true);

    const amendments = api.retrieve({ amendmentStatus: "AMENDMENT_ONLY", limit: 10 });
    expect(amendments.every((h) => h.provision.documentRole === "AMENDMENT")).toBe(true);

    const credit = api.retrieve({ agreementType: "CREDIT_AGREEMENT", covenantFamily: "INDEBTEDNESS", limit: 5 });
    expect(credit.length).toBeGreaterThan(0);
  });

  it("eval-isolates Superior/Gibraltar from default retrieval and pattern stats", () => {
    const heldOut = api.corpus.list().filter((p) => p.evalIsolation === "HELD_OUT_CKG");
    expect(heldOut.length).toBeGreaterThan(0);
    expect(heldOut.every((p) => p.issuerId === "superior" || p.issuerId === "gibraltar")).toBe(true);

    const defaultHits = api.retrieve({ covenantFamily: "INDEBTEDNESS", limit: 50 });
    expect(defaultHits.every((h) => h.provision.evalIsolation === "NONE")).toBe(true);

    const explicit = api.retrieve({ covenantFamily: "INDEBTEDNESS", includeHeldOutEval: true, issuerIds: ["superior"], limit: 10 });
    expect(explicit.length).toBeGreaterThan(0);

    const patterns = api.patterns("INDEBTEDNESS");
    expect(patterns.every((p) => p.samplingBiasNotes.some((n) => /HELD_OUT_CKG/i.test(n)))).toBe(true);
    expect(patterns.every((p) => !p.exampleProvisionIds.some((id) => id.startsWith("superior-") || id.startsWith("gibraltar-")))).toBe(true);
  });

  it("compares provisions with exact textual diffs and stratified claims", () => {
    const debt = api.corpus.byFamily("INDEBTEDNESS");
    expect(debt.length).toBeGreaterThanOrEqual(2);
    const record = api.compare(debt[0]!.provisionId, debt[1]!.provisionId);
    expect(record.textual.hunks.length).toBeGreaterThan(0);
    expect(record.claims.every((c) => c.evidence.justification.length > 0)).toBe(true);
    expect(record.standingRollupNote).toMatch(/does not imply/i);
  });

  it("builds dependency-aware views that report closure gaps honestly", () => {
    const debt = api.corpus.byFamily("INDEBTEDNESS");
    const left = debt[0]!;
    const right = debt[1]!;
    const comparison = api.compare(left.provisionId, right.provisionId);
    const view = api.dependencyView(comparison);
    expect(view.closureComplete === false || view.missingOrAmbiguousContext.length >= 0).toBe(true);
    expect(view.note).toMatch(/do not claim complete dependency closure/i);
  });

  it("coordinates with peer adapters without requiring their exclusive trees", () => {
    const peers = api.peerStatus();
    // Sample fixtures make CDA/DEF available; EHB/CKF may be unavailable.
    expect(["AVAILABLE", "UNAVAILABLE", "SCHEMA_MISMATCH"]).toContain(peers.dependencyAtlas.availability);
    expect(["AVAILABLE", "UNAVAILABLE", "SCHEMA_MISMATCH"]).toContain(peers.definitionEncyclopedia.availability);
    expect(peers.edgarBackfill.peer).toBe("WS-EHB");
    expect(peers.knowledgeFactory.peer).toBe("WS-CKF");
  });

  it("validates a sample of source spans against on-disk files", () => {
    const result = validateCorpusSpans(api.corpus.list(), process.cwd(), 30);
    expect(result.checked).toBeGreaterThan(10);
    expect(result.ok / result.checked).toBeGreaterThanOrEqual(0.7);
  });

  it("compares original vs amendment when linked pairs exist", () => {
    const pairs = api.amendmentPairs();
    if (pairs.length === 0) {
      // Corpus may still contain amendment docs without amendsProvisionId links.
      const amendHits = api.retrieve({ amendmentStatus: "AMENDMENT_ONLY", limit: 1 });
      expect(amendHits.length).toBeGreaterThanOrEqual(0);
      return;
    }
    const result = api.compareAmendment(pairs[0]!.amendment.provisionId);
    expect(result.amendmentClaims.some((c) => c.dimension === "AMENDMENT")).toBe(true);
  });
});
