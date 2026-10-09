import { describe, expect, it } from "vitest";
import {
  auditElevatedStandingEmissions,
  createPrecedentComparisonApi,
  getDefaultCorpus,
  makeClaim,
  evidenceFromExcerpts,
  EpistemicBoundaryError,
} from "../../lib/precedent-comparison";

describe("Epistemic emission audit", () => {
  it("finds no claim-emission violations outside makeClaim / claim-bound reviews", () => {
    const audit = auditElevatedStandingEmissions(process.cwd());
    expect(audit.claimEmissionViolations, audit.summary).toEqual([]);
    expect(audit.sites.length).toBeGreaterThan(5);
  });

  it("retrieval standingCeiling never implies REVIEWER_VERIFIED_CONCLUSION", () => {
    const api = createPrecedentComparisonApi(getDefaultCorpus());
    const hits = api.retrieve({ covenantFamily: "INDEBTEDNESS", limit: 20 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.standingCeiling !== "REVIEWER_VERIFIED_CONCLUSION")).toBe(true);
    expect(hits.every((h) => h.provenanceStatus === "SOURCE_ONLY")).toBe(true);
    expect(hits.every((h) => h.standingCeiling === "SEMANTIC_HYPOTHESIS")).toBe(true);
  });

  it("SOURCE_SUPPORTED_LEGAL_DIFFERENCE requires source excerpts", () => {
    expect(() =>
      makeClaim({
        standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        dimension: "STRUCTURE",
        summary: "unsupported elevation",
        evidence: { justification: "because", sourceExcerpts: [], structuralKeys: [] },
      }),
    ).toThrow(EpistemicBoundaryError);
  });

  it("SEMANTIC_HYPOTHESIS still requires justification evidence", () => {
    const claim = makeClaim({
      standing: "SEMANTIC_HYPOTHESIS",
      dimension: "STRUCTURE",
      summary: "possible shared basket — not reviewed precedent",
      evidence: evidenceFromExcerpts([], "hypothesis only"),
    });
    expect(claim.standing).toBe("SEMANTIC_HYPOTHESIS");
    expect(claim.claimReviewId).toBeNull();
  });
});
