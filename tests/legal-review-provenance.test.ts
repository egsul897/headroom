/**
 * Legal-review provenance and the VERIFIED status model.
 *
 * History: this status was originally FOUNDER_AND_PEER_REVIEWED (2026-08-25
 * Coherent closeout), requiring both the founder and a second attorney. A
 * later, narrower task (docs/founder-legal-review-2026-08-25.md) recorded a
 * single-reviewer founder confirmation without promoting to that status
 * (the two-reviewer bar wasn't met) and reverted 2 rows whose original
 * promotion premise had been disproved by the golden-harness fix.
 *
 * FINAL POLICY (docs/legal-review-status-model.md, "Final legal review
 * status instruction", 2026-08-25): the founder — Headroom's own controlling
 * legal-review authority — superseded the two-reviewer requirement outright.
 * For Headroom's internal product/development purposes, a conclusion the
 * founder has personally reviewed and approved is VERIFIED, the complete
 * legal-review state, with no additional peer/second-attorney/outside-
 * counsel/independent-counsel requirement. The enum value itself was RENAMED
 * FOUNDER_AND_PEER_REVIEWED -> VERIFIED (Prisma migration
 * 20260825145840_rename_founder_and_peer_reviewed_to_verified — an enum
 * rename, not a data migration: zero rows touched by hand, zero data loss),
 * and all 48 current golden_tests rows (30 Coherent + 18 Matthews) were then
 * promoted to VERIFIED (scripts/finalize-founder-sole-review-verified-2026-08-25.ts).
 *
 * Covers (per that instruction's own §10 test list):
 *   A. founder legal review can produce VERIFIED.
 *   B. VERIFIED does not require a second reviewer.
 *   C. all 48 current golden rows are VERIFIED.
 *   D. VERIFIED is orthogonal to engineering PASS/FAIL.
 *   E. VERIFIED is orthogonal to financial-data provenance.
 *   F. a verified legal rule may still expose a known configuration/engine
 *      discrepancy.
 *   G. historical LegalReviewRecords remain intact (nothing deleted across
 *      any of the three review-policy tasks).
 *   H. no code path gates Phase 10 on second-lawyer/outside-counsel review.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "../lib/prisma";
import { hasCompletedQualifiedLegalReview } from "../lib/legal-review";
import { pathStatus } from "../lib/solver/status";
import type { RequirementResult } from "../lib/solver/types";

const COMPANY_ID = "coherent";

describe("hasCompletedQualifiedLegalReview (A/B/H)", () => {
  it("VERIFIED (the founder's own review, single-reviewer) satisfies the gate on its own", () => {
    expect(hasCompletedQualifiedLegalReview("VERIFIED")).toBe(true);
  });
  it("UNVERIFIED does not satisfy the gate", () => {
    expect(hasCompletedQualifiedLegalReview("UNVERIFIED")).toBe(false);
  });
  it("DISPUTED does not satisfy the gate", () => {
    expect(hasCompletedQualifiedLegalReview("DISPUTED")).toBe(false);
  });
});

describe("Solver PathStatus is structurally independent of legal-review provenance (D/F)", () => {
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

describe("All 48 current golden rows are VERIFIED (C)", () => {
  it("30 Coherent + 18 Matthews rows are all VERIFIED; zero UNVERIFIED/DISPUTED remain", async () => {
    const rows = await prisma.goldenTest.findMany({ where: { companyId: { in: ["coherent", "matthews"] } }, select: { companyId: true, status: true } });
    expect(rows.length).toBe(48);
    expect(rows.filter((r) => r.companyId === "coherent").length).toBe(30);
    expect(rows.filter((r) => r.companyId === "matthews").length).toBe(18);
    const byStatus = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});
    expect(byStatus["VERIFIED"]).toBe(48);
    expect(byStatus["UNVERIFIED"] ?? 0).toBe(0);
    expect(byStatus["DISPUTED"] ?? 0).toBe(0);
  });

  it("every golden_tests row has a matching VERIFIED LegalReviewRecord recording the founder as sole reviewer, with no fabricated name", async () => {
    const rows = await prisma.goldenTest.findMany({ where: { companyId: { in: ["coherent", "matthews"] } }, select: { id: true, companyId: true } });
    for (const g of rows) {
      const record = await prisma.legalReviewRecord.findUnique({ where: { id: `lrr-policy-verified-2026-08-25-${g.id}` } });
      expect(record, `No lrr-policy-verified-2026-08-25 record for golden_tests row ${g.id}`).toBeTruthy();
      expect(record!.reviewStatus).toBe("VERIFIED");
      expect(record!.reviewerName, `${g.id}'s review record should not have a fabricated reviewerName`).toBeNull();
      expect(record!.reviewerRole).toBe("Founder / Legal Reviewer");
      expect(record!.reviewDate).toEqual(new Date("2026-08-25"));
    }
  });
});

describe("VERIFIED does not force a stale engineering answer (D/F)", () => {
  const affected = ["cmt7vicwr002pj1d33vvdfvav", "cmt7vicwj002dj1d3bv3zwd1w", "cmt7vicwk002fj1d3nnpsqqdp"];

  it("Q22 and rows 16/17 are VERIFIED even though their engineering discrepancy (the ca_incremental_ratio_based_unsecured_or_junior eligibility gap) is unresolved - legal review and engineering correctness are separate dimensions", async () => {
    for (const id of affected) {
      const row = await prisma.goldenTest.findUnique({ where: { id } });
      expect(row, `golden_tests row ${id} not found`).toBeTruthy();
      expect(row!.status, `${id} should be VERIFIED despite the open engineering discrepancy`).toBe("VERIFIED");
      // expectedAnswer/bindingProvision are NEITHER "corrected" to the new
      // solver-native figure NOR silently changed for any other reason -
      // legal VERIFIED status does not force or bless any particular number.
      expect(row!.reviewerNotes, `${id} should document that VERIFIED does not resolve the engineering discrepancy`).toMatch(/does NOT resolve/);
    }
  });

  it("the golden harness still FAILs these 3 rows on engineering grounds - VERIFIED legal status does not suppress or weaken the regression check", async () => {
    // Structural assertion, not a re-run of the harness itself (that's
    // scripts/golden-test.ts, exercised separately in CI/manual runs): the
    // stored expectedAnswer for Q22 (3541) and the stored bindingProvision
    // for all 3 (mila_secured) are unchanged from before this task, which is
    // exactly what keeps the harness's existing FAIL/discrepancy
    // classification (EXPECTED_ANSWER_STALE / stale-citation) accurate.
    const q22 = await prisma.goldenTest.findUnique({ where: { id: "cmt7vicwr002pj1d33vvdfvav" } });
    expect(Number(q22!.expectedAnswer)).toBe(3541);
    expect(q22!.bindingProvision).toBe("mila_secured");
  });
});

describe("Historical LegalReviewRecord chronology remains fully intact (G)", () => {
  it("the original 2026-08-25 closeout records (4 conclusions + 1 RAC cross-ref + 8 golden-test promotions) still exist, untouched", async () => {
    const refs = [
      "coherent-indenture-permitted-liens-clause-6-24-25-stacking-nonnetting",
      "coherent-adjusted-consolidated-ebitda-addback-cap-absence",
      "coherent-indenture-contribution-indebtedness-availability",
      "coherent-collateral-suspension-period-current-state-as-of-2026-08-25",
    ];
    for (const ref of refs) {
      const record = await prisma.legalReviewRecord.findFirst({ where: { companyId: COMPANY_ID, reviewedArtifactType: "LEGAL_CONCLUSION", reviewedArtifactRef: ref } });
      expect(record, `Missing historical LegalReviewRecord for conclusion ${ref}`).toBeTruthy();
      // Historical record's own reviewStatus column reads VERIFIED now too -
      // that specific field was renamed in place by the enum-value rename
      // migration (not a data migration; the row was never individually
      // touched), so this is the same historical row, not a rewritten one.
      expect(record!.reviewStatus).toBe("VERIFIED");
    }

    const originalGoldenPromotion = await prisma.legalReviewRecord.findUnique({ where: { id: "coh-lrr-golden-cmt7vicw6001rj1d3qr02g8l6" } });
    expect(originalGoldenPromotion, "original 2026-08-25 closeout golden-test promotion record must be preserved").toBeTruthy();
  });

  it("the reverted-row supersession records from docs/founder-legal-review-2026-08-25.md are preserved (nothing deleted when the status model was simplified again)", async () => {
    for (const id of ["cmt7vicwj002dj1d3bv3zwd1w", "cmt7vicwk002fj1d3nnpsqqdp"]) {
      const original = await prisma.legalReviewRecord.findUnique({ where: { id: `coh-lrr-golden-${id}` } });
      expect(original, `original closeout record for ${id} must remain preserved`).toBeTruthy();
      const supersede = await prisma.legalReviewRecord.findUnique({ where: { id: `lrr-supersede-2026-08-25-${id}` } });
      expect(supersede, `2026-08-25 revert-supersession record for ${id} must remain preserved`).toBeTruthy();
      const founderSolo = await prisma.legalReviewRecord.findUnique({ where: { id: `lrr-founder-solo-2026-08-25-${id}` } });
      expect(founderSolo, `founder-solo record for ${id} must remain preserved`).toBeTruthy();
    }
  });

  it("total legal_review_records count only grows across the three review-policy tasks - nothing was ever deleted", async () => {
    const total = await prisma.legalReviewRecord.count({ where: { companyId: { in: ["coherent", "matthews"] } } });
    // 13 (2026-08-25 closeout) + 50 (founder-solo task: 48 + 2 supersession) + 48 (this task) = 111.
    expect(total).toBe(111);
  });
});

describe("Legal review does not satisfy financial-data certification (E)", () => {
  it("no ExternalInputRecord of kind CERTIFIED_EXTERNAL_INPUT exists for Coherent - Covenant EBITDA certification remains open despite completed (VERIFIED) legal review", async () => {
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

describe("Non-mutation: solver-native configuration and golden-test substance unchanged", () => {
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

  it("frozen expected answers on VERIFIED golden_tests rows are unchanged (spot check)", async () => {
    const ssnlThreshold = await prisma.goldenTest.findFirst({
      where: { companyId: COMPANY_ID, question: { contains: "SSNL threshold applicable to secured incurrence" } },
    });
    expect(ssnlThreshold).toBeTruthy();
    expect(Number(ssnlThreshold!.expectedAnswer)).toBeCloseTo(0.622941, 6);
    expect(ssnlThreshold!.bindingProvision).toBe("mila_secured");
    expect(ssnlThreshold!.status).toBe("VERIFIED");

    const q100msecured = await prisma.goldenTest.findFirst({
      where: { companyId: COMPANY_ID, question: "Is $100M of new secured debt permitted? Under which test?" },
    });
    expect(q100msecured).toBeTruthy();
    expect(Number(q100msecured!.expectedAnswer)).toBe(1);
    expect(q100msecured!.status).toBe("VERIFIED");
  });

  it("Q1 (max secured cross-doc) is VERIFIED but its expected answer is unchanged - still the pre-correction legacy figure, not silently updated by the status-policy change", async () => {
    const q1 = await prisma.goldenTest.findFirst({
      where: { companyId: COMPANY_ID, question: "What is the maximum additional secured debt Coherent could incur today?" },
    });
    expect(q1).toBeTruthy();
    expect(q1!.status).toBe("VERIFIED");
    expect(Number(q1!.expectedAnswer)).toBe(4041);
  });
});
