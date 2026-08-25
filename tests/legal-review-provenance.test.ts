/**
 * Coherent legal-model finalization / phase closeout — proves the
 * FOUNDER_AND_PEER_REVIEWED review-status model (task §S).
 *
 * Covers, in order: (1) FOUNDER_AND_PEER_REVIEWED persists correctly: (2)
 * reviewer metadata persists correctly (and is honestly null, not
 * fabricated): (3) UNVERIFIED remains distinct: (4) FOUNDER_AND_PEER_REVIEWED
 * satisfies the generalized "completed qualified legal review" gate, and
 * DISPUTED/UNVERIFIED do not: (5) a missing/unsupported substantive rule can
 * still return REVIEW_REQUIRED despite legal review existing elsewhere -
 * i.e. legal-review provenance and solver PathStatus are structurally
 * unconnected: (6)/(7) legal review does not satisfy CERTIFIED_EXTERNAL_INPUT
 * and Covenant EBITDA certification remains open: plus frozen-expected-answer
 * and unchanged-solver-configuration spot checks.
 *
 * 2026-08-25 UPDATE (docs/founder-legal-review-2026-08-25.md): the founder's
 * single-reviewer confirmation of all 48 golden_tests rows (both companies)
 * reverted 2 of the original 8 promoted Coherent rows ("SSNL test first
 * become the binding constraint" spot checks at $2,000M/$4,041M) from
 * FOUNDER_AND_PEER_REVIEWED back to UNVERIFIED — their original promotion
 * premise ("matches exactly between legacy and solver-native") was disproved
 * by the golden-harness solver-native-grading fix, and investigating the
 * proposed correction surfaced a further, unresolved Permission-eligibility
 * gap (see that doc §3). 6 of the original 8 remain validly promoted. The
 * same task added 48 new, single-reviewer (founder-solo) LegalReviewRecord
 * rows — unlike the original 2026-08-25 closeout records, these DO carry a
 * real (non-fabricated) reviewerRole/reviewDate, because that metadata was
 * actually supplied this time; reviewerName remains null throughout (no name
 * was ever supplied, by either task).
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { hasCompletedQualifiedLegalReview } from "../lib/legal-review";
import { pathStatus } from "../lib/solver/status";
import type { RequirementResult } from "../lib/solver/types";

const COMPANY_ID = "coherent";

describe("hasCompletedQualifiedLegalReview (task §S.4)", () => {
  it("FOUNDER_AND_PEER_REVIEWED satisfies the gate", () => {
    expect(hasCompletedQualifiedLegalReview("FOUNDER_AND_PEER_REVIEWED")).toBe(true);
  });
  it("UNVERIFIED does not satisfy the gate (task §S.3 - UNVERIFIED remains distinct)", () => {
    expect(hasCompletedQualifiedLegalReview("UNVERIFIED")).toBe(false);
  });
  it("DISPUTED does not satisfy the gate", () => {
    expect(hasCompletedQualifiedLegalReview("DISPUTED")).toBe(false);
  });
});

describe("Solver PathStatus is structurally independent of legal-review provenance (task §S.5)", () => {
  it("an unresolved, non-assumption requirement still returns REVIEW_REQUIRED, regardless of legal-review status elsewhere - there is no wiring from GoldenTest.status/LegalReviewRecord into pathStatus at all", () => {
    const results: RequirementResult[] = [
      { requirement: "some-unsupported-primitive", status: "UNKNOWN", class: "ENGINE_CAPABILITY", reasonCategory: "NOT_MODELED" } as unknown as RequirementResult,
    ];
    expect(pathStatus(results)).toBe("REVIEW_REQUIRED");
  });

  it("a missing transaction assumption still returns ASSUMPTION_REQUIRED, not somehow satisfied by legal review", () => {
    const results: RequirementResult[] = [{ requirement: "rate", status: "UNKNOWN", class: "TRANSACTION_ASSUMPTION" } as unknown as RequirementResult];
    expect(pathStatus(results)).toBe("ASSUMPTION_REQUIRED");
  });
});

describe("Coherent legal-review provenance (live DB) (task §S.1/§S.2)", () => {
  it("exactly 6 of 30 golden_tests rows carry FOUNDER_AND_PEER_REVIEWED (2026-08-25: 2 of the original 8 reverted); the rest remain UNVERIFIED", async () => {
    const rows = await prisma.goldenTest.findMany({ where: { companyId: COMPANY_ID }, select: { status: true } });
    expect(rows.length).toBe(30);
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    expect(byStatus["FOUNDER_AND_PEER_REVIEWED"]).toBe(6);
    expect(byStatus["UNVERIFIED"]).toBe(24);
    expect(byStatus["DISPUTED"] ?? 0).toBe(0);
  });

  it("every FOUNDER_AND_PEER_REVIEWED golden_tests row has a matching LegalReviewRecord with reviewStatus FOUNDER_AND_PEER_REVIEWED", async () => {
    const promoted = await prisma.goldenTest.findMany({ where: { companyId: COMPANY_ID, status: "FOUNDER_AND_PEER_REVIEWED" }, select: { id: true } });
    expect(promoted.length).toBe(6);
    for (const g of promoted) {
      const record = await prisma.legalReviewRecord.findFirst({
        where: { companyId: COMPANY_ID, reviewedArtifactType: "GOLDEN_TEST", reviewedArtifactRef: g.id, reviewStatus: "FOUNDER_AND_PEER_REVIEWED" },
      });
      expect(record, `No FOUNDER_AND_PEER_REVIEWED LegalReviewRecord for promoted golden_tests row ${g.id}`).toBeTruthy();
    }
  });

  it("the 2 reverted rows (2026-08-25) keep their original closeout LegalReviewRecord untouched, plus a new superseding record explaining the revert - never silently overwritten", async () => {
    const revertedIds = ["cmt7vicwj002dj1d3bv3zwd1w", "cmt7vicwk002fj1d3nnpsqqdp"];
    for (const id of revertedIds) {
      const row = await prisma.goldenTest.findUnique({ where: { id } });
      expect(row, `golden_tests row ${id} not found`).toBeTruthy();
      expect(row!.status).toBe("UNVERIFIED");

      const original = await prisma.legalReviewRecord.findUnique({ where: { id: `coh-lrr-golden-${id}` } });
      expect(original, `original 2026-08-25 closeout record for ${id} must be preserved, not deleted`).toBeTruthy();
      expect(original!.reviewStatus).toBe("FOUNDER_AND_PEER_REVIEWED"); // historical record, left exactly as it was

      const superseding = await prisma.legalReviewRecord.findUnique({ where: { id: `lrr-supersede-2026-08-25-${id}` } });
      expect(superseding, `superseding record for ${id} must exist`).toBeTruthy();
      expect(superseding!.notes).toMatch(/SUPERSEDES/);
    }
  });

  it("reviewer name is never fabricated on any record; reviewerRole/reviewDate are honestly null on the 2026-08-25 closeout records (never supplied) and honestly populated on the 2026-08-25 founder-solo records (actually supplied that pass)", async () => {
    const records = await prisma.legalReviewRecord.findMany({ where: { companyId: COMPANY_ID } });
    expect(records.length).toBeGreaterThan(0);
    for (const r of records) {
      expect(r.reviewerName, `${r.id} should not have a fabricated reviewerName`).toBeNull();
      if (r.id.startsWith("lrr-founder-solo-2026-08-25-") || r.id.startsWith("lrr-supersede-2026-08-25-")) {
        // Metadata actually supplied by the founder's 2026-08-25 instruction -
        // recording it is not fabrication, and leaving it null here would be
        // dishonest in the other direction.
        expect(r.reviewerRole, `${r.id} should record the real founder-solo review role`).toMatch(/^Founder \(Headroom\) - single reviewer/);
        expect(r.reviewDate, `${r.id} should record the real 2026-08-25 review date`).toEqual(new Date("2026-08-25"));
        expect(r.reviewStatus, `${r.id} must not claim the two-reviewer status from a single-reviewer confirmation`).toBe("UNVERIFIED");
      } else {
        expect(r.reviewerRole, `${r.id} should not have a fabricated reviewerRole`).toBeNull();
        expect(r.reviewDate, `${r.id} should not have a fabricated reviewDate`).toBeNull();
        expect(r.notes, `${r.id} should document that reviewer identity/date is not yet supplied`).toMatch(/were NOT supplied/);
      }
    }
  });

  it("the four load-bearing legal conclusions (task §E) are each recorded as FOUNDER_AND_PEER_REVIEWED", async () => {
    const refs = [
      "coherent-indenture-permitted-liens-clause-6-24-25-stacking-nonnetting",
      "coherent-adjusted-consolidated-ebitda-addback-cap-absence",
      "coherent-indenture-contribution-indebtedness-availability",
      "coherent-collateral-suspension-period-current-state-as-of-2026-08-25",
    ];
    for (const ref of refs) {
      const record = await prisma.legalReviewRecord.findFirst({ where: { companyId: COMPANY_ID, reviewedArtifactType: "LEGAL_CONCLUSION", reviewedArtifactRef: ref } });
      expect(record, `Missing LegalReviewRecord for conclusion ${ref}`).toBeTruthy();
      expect(record!.reviewStatus).toBe("FOUNDER_AND_PEER_REVIEWED");
    }
  });
});

describe("Legal review does not satisfy financial-data certification (task §S.6/§S.7)", () => {
  it("no ExternalInputRecord of kind CERTIFIED_EXTERNAL_INPUT exists for Coherent - Covenant EBITDA certification remains open despite completed legal review", async () => {
    const certified = await prisma.externalInputRecord.findMany({ where: { companyId: COMPANY_ID, kind: "CERTIFIED_EXTERNAL_INPUT" } });
    expect(certified, "A CERTIFIED_EXTERNAL_INPUT row exists for Coherent - if this is EBITDA, docs/coherent-legal-model-baseline-v1.md §6 needs updating; legal review alone must never create this row.").toEqual([]);
  });

  it("FinancialSnapshot has no provenance/certification field EBITDA could be marked certified through", async () => {
    const snapshot = await prisma.financialSnapshot.findFirst({ where: { companyId: COMPANY_ID }, orderBy: { asOfDate: "desc" } });
    expect(snapshot).toBeTruthy();
    // Structural check: FinancialSnapshot has no certification/provenance
    // column at all (confirmed by schema inspection) - this is not something
    // a legal-review record could accidentally satisfy even if it tried.
    expect(Object.keys(snapshot as object)).not.toContain("certificationStatus");
    expect(Object.keys(snapshot as object)).not.toContain("provenance");
  });
});

describe("Non-mutation: solver-native configuration and golden-test substance unchanged (task §S.9/§S.10)", () => {
  it("Permission/PermissionRelationship/SharedCapacityConstraint/SolverCoverageDeclaration counts match the Phase 8 population exactly", async () => {
    const [permCount, relCount, sccCount, declCount] = await Promise.all([
      prisma.permission.count({ where: { companyId: COMPANY_ID } }),
      prisma.permissionRelationship.count({ where: { companyId: COMPANY_ID } }),
      prisma.sharedCapacityConstraint.count({ where: { companyId: COMPANY_ID } }),
      prisma.solverCoverageDeclaration.count({ where: { companyId: COMPANY_ID } }),
    ]);
    expect(permCount).toBe(22);
    expect(relCount).toBe(19);
    expect(sccCount).toBe(2);
    expect(declCount).toBe(6);
  });

  it("frozen expected answers on promoted golden_tests rows are unchanged (spot check)", async () => {
    const ssnlThreshold = await prisma.goldenTest.findFirst({
      where: { companyId: COMPANY_ID, question: { contains: "SSNL threshold applicable to secured incurrence" } },
    });
    expect(ssnlThreshold).toBeTruthy();
    expect(Number(ssnlThreshold!.expectedAnswer)).toBeCloseTo(0.622941, 6);
    expect(ssnlThreshold!.bindingProvision).toBe("mila_secured");
    expect(ssnlThreshold!.status).toBe("FOUNDER_AND_PEER_REVIEWED");

    const q100msecured = await prisma.goldenTest.findFirst({
      where: { companyId: COMPANY_ID, question: "Is $100M of new secured debt permitted? Under which test?" },
    });
    expect(q100msecured).toBeTruthy();
    expect(Number(q100msecured!.expectedAnswer)).toBe(1);
    expect(q100msecured!.status).toBe("FOUNDER_AND_PEER_REVIEWED");
  });

  it("a non-promoted, capacity-ceiling golden row (Q1, max secured cross-doc) stays UNVERIFIED - its expected answer reflects the pre-correction legacy formula, not the reviewed non-netting conclusion", async () => {
    const q1 = await prisma.goldenTest.findFirst({
      where: { companyId: COMPANY_ID, question: "What is the maximum additional secured debt Coherent could incur today?" },
    });
    expect(q1).toBeTruthy();
    expect(q1!.status).toBe("UNVERIFIED");
    expect(Number(q1!.expectedAnswer)).toBe(4041);
  });
});
