/**
 * Adversarial tests for Precedent Comparison Intelligence (Phase 2).
 */
import { describe, expect, it } from "vitest";
import {
  applyClaimReviews,
  compareProvisions,
  createPrecedentComparisonApi,
  EpistemicBoundaryError,
  getDefaultCorpus,
  makeClaim,
  evidenceFromExcerpts,
  PrecedentCorpus,
  sha256Hex,
} from "../../lib/precedent-comparison";
import type { PrecedentProvision } from "../../lib/precedent-comparison";

function sourceOnly(
  overrides: Partial<PrecedentProvision> & Pick<PrecedentProvision, "provisionId" | "sourceText" | "covenantFamily">,
): PrecedentProvision {
  const sourceText = overrides.sourceText;
  return {
    sourceVersionHash: sha256Hex(sourceText),
    locator: {
      packageId: "synthetic",
      documentId: "synthetic-doc",
      sourcePath: "tests/synthetic",
      sourceSectionRef: "9.9",
      charStart: 0,
      charEnd: sourceText.length,
    },
    documentRole: "ORIGINAL",
    agreementType: "CREDIT_AGREEMENT",
    issuerId: "synthetic",
    amendsProvisionId: null,
    tags: [],
    reviewStatus: "SOURCE_ONLY",
    reviewedBy: null,
    reviewNote: null,
    financialDefinitionTerms: [],
    evalIsolation: "NONE",
    ...overrides,
    sourceText,
  };
}

describe("Precedent Comparison — adversarial epistemic boundaries (Phase 2)", () => {
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
    expect(record.claims.some((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE")).toBe(true);
    expect(record.standingRollupNote).toMatch(/does not imply that every claim/i);
    expect(record.maxStandingAmongClaims).toBe(record.maxStanding);
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
      expect(h.claimReviewId).toBeNull();
    }
  });

  it("refuses REVIEWER_VERIFIED without claim-level review even if provision is APPROVED_PRECEDENT", () => {
    const left = sourceOnly({
      provisionId: "rev-left",
      covenantFamily: "INVESTMENTS",
      sourceText: "No Investments except the greater of $75,000,000 and 3.5% of Consolidated Total Assets, provided that no Default exists.",
      reviewStatus: "APPROVED_PRECEDENT",
      reviewedBy: "reviewer@example.com",
      reviewNote: "Provision approved — must NOT auto-elevate claims.",
    });
    const right = sourceOnly({
      provisionId: "rev-right",
      covenantFamily: "INVESTMENTS",
      sourceText: "No Investments except $50,000,000 in the aggregate.",
    });
    const record = compareProvisions(left, right);
    expect(record.claims.some((c) => c.standing === "REVIEWER_VERIFIED_CONCLUSION")).toBe(false);
  });

  it("elevates only the specific claim when ClaimReviewRecord matches source versions", () => {
    const left = sourceOnly({
      provisionId: "crev-left",
      covenantFamily: "ASSET_SALES",
      sourceText: "Dispose of Property; provided that consideration is at least 75% cash; provided further that pro forma compliance is demonstrated.",
    });
    const right = sourceOnly({
      provisionId: "crev-right",
      covenantFamily: "ASSET_SALES",
      sourceText: "Dispose of Property for fair market value.",
    });
    const base = compareProvisions(left, right);
    const target = base.claims.find((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE" && (c.dimension === "PROVISOS" || c.dimension === "CONDITIONS"));
    expect(target).toBeTruthy();
    const reviewed = compareProvisions(left, right, {
      claimReviews: [
        {
          claimReviewId: "crev-1",
          claimId: target!.claimId,
          comparisonId: base.comparisonId,
          leftProvisionId: left.provisionId,
          rightProvisionId: right.provisionId,
          leftSourceVersionHash: left.sourceVersionHash,
          rightSourceVersionHash: right.sourceVersionHash,
          reviewedBy: "adjudicator@example.com",
          reviewedAt: "2026-10-08T00:00:00.000Z",
          disposition: "AFFIRM",
          note: "Material proviso difference verified against source.",
          affirmedStanding: "REVIEWER_VERIFIED_CONCLUSION",
        },
      ],
    });
    const elevated = reviewed.claims.find((c) => c.claimId === target!.claimId);
    expect(elevated?.standing).toBe("REVIEWER_VERIFIED_CONCLUSION");
    expect(elevated?.claimReviewId).toBe("crev-1");
    // Other claims must not silently inherit the max standing
    const others = reviewed.claims.filter((c) => c.claimId !== target!.claimId);
    expect(others.some((c) => c.standing !== "REVIEWER_VERIFIED_CONCLUSION")).toBe(true);
    expect(reviewed.maxStandingAmongClaims).toBe("REVIEWER_VERIFIED_CONCLUSION");
  });

  it("rejects claim review when sourceVersionHash drifts", () => {
    const left = sourceOnly({ provisionId: "hash-l", covenantFamily: "LIENS", sourceText: "No Liens except Permitted Liens provided that no Default exists." });
    const right = sourceOnly({ provisionId: "hash-r", covenantFamily: "LIENS", sourceText: "No Liens except Permitted Liens." });
    const base = compareProvisions(left, right);
    const claim = base.claims.find((c) => c.standing === "SOURCE_SUPPORTED_LEGAL_DIFFERENCE")!;
    expect(() =>
      applyClaimReviews(
        base.claims,
        [
          {
            claimReviewId: "bad",
            claimId: claim.claimId,
            comparisonId: base.comparisonId,
            leftProvisionId: left.provisionId,
            rightProvisionId: right.provisionId,
            leftSourceVersionHash: "0".repeat(64),
            rightSourceVersionHash: right.sourceVersionHash,
            reviewedBy: "x",
            reviewedAt: "2026-10-08T00:00:00.000Z",
            disposition: "AFFIRM",
            note: "stale",
            affirmedStanding: "REVIEWER_VERIFIED_CONCLUSION",
          },
        ],
        left.provisionId,
        right.provisionId,
        left.sourceVersionHash,
        right.sourceVersionHash,
        base.comparisonId,
      ),
    ).toThrow(EpistemicBoundaryError);
  });

  it("refuses SOURCE_SUPPORTED claim without source excerpts", () => {
    expect(() =>
      makeClaim({
        standing: "SOURCE_SUPPORTED_LEGAL_DIFFERENCE",
        dimension: "STRUCTURE",
        summary: "missing evidence",
        evidence: evidenceFromExcerpts([], "justification only"),
      }),
    ).toThrow(EpistemicBoundaryError);
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

  it("default public corpus provisions are SOURCE_ONLY with sourceVersionHash", () => {
    const corpus = getDefaultCorpus();
    expect(corpus.size()).toBeGreaterThan(400);
    for (const p of corpus.list().slice(0, 50)) {
      expect(p.reviewStatus).toBe("SOURCE_ONLY");
      expect(p.sourceVersionHash).toHaveLength(64);
      expect(p.issuerId.length).toBeGreaterThan(0);
    }
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
    expect(hits.every((h) => h.standing !== ("REVIEWER_VERIFIED_CONCLUSION" as string))).toBe(true);
  });

  it("patterns never claim market prevalence", () => {
    const api = createPrecedentComparisonApi(getDefaultCorpus());
    const patterns = api.patterns("INDEBTEDNESS");
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns.every((p) => p.marketPrevalence === "NOT_ESTIMATED")).toBe(true);
    expect(patterns.every((p) => p.sampleSize > 0)).toBe(true);
  });
});
